import { NextRequest, NextResponse } from "next/server";
import { listServices, getServiceMetrics, PROJECTS, type Env } from "@/lib/gcp";
import { createAlert, cleanupOldAlerts } from "@/lib/alerts";
import { notifyAlertToAdmins } from "@/lib/hub-notify";
import { adminDb } from "@/lib/firebase-admin";
import {
  storeSnapshot,
  getBaseline,
  recomputeBaseline,
  detectAnomalies,
  cleanupOldSnapshots,
  type MetricSnapshot,
} from "@/lib/baseline";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 min max for Cloud Run

// ── CIRCUIT BREAKER ─────────────────────────────────────────────────────
// Hard limits to PREVENT Firestore billing explosions.
// If any of these limits are reached, the CRON aborts immediately.

const MAX_FIRESTORE_OPS_PER_RUN = 500;     // absolute max Firestore reads+writes per CRON cycle
const MAX_SERVICES_PER_RUN = 20;           // only check top N most active services (not all 43!)
const MIN_REQUESTS_TO_MONITOR = 1;         // skip services with 0 requests (idle = no point)

const NOTIF_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours between notifications for same alert

let _firestoreOpsCounter = 0;

function trackOp(count: number = 1): void {
  _firestoreOpsCounter += count;
  if (_firestoreOpsCounter > MAX_FIRESTORE_OPS_PER_RUN) {
    throw new Error(
      `🛑 CIRCUIT BREAKER: ${_firestoreOpsCounter} Firestore ops exceeded limit of ${MAX_FIRESTORE_OPS_PER_RUN}. CRON aborted to protect billing.`
    );
  }
}

/**
 * Check if a notification can be sent (2h cooldown per service+metric).
 * Returns true if we should send, false if still in cooldown.
 */
async function checkNotifCooldown(key: string, now: Date): Promise<boolean> {
  const db = adminDb();
  const ref = db.collection("palantir_notif_cooldown").doc(key);
  const doc = await ref.get();
  trackOp(1);

  if (doc.exists) {
    const lastSent = doc.data()?.lastSentAt;
    if (lastSent) {
      const elapsed = now.getTime() - new Date(lastSent).getTime();
      if (elapsed < NOTIF_COOLDOWN_MS) {
        return false; // still in cooldown
      }
    }
  }

  // Record this notification
  await ref.set({ lastSentAt: now.toISOString() });
  trackOp(1);
  return true;
}

/**
 * POST /api/alerts/check
 *
 * CRON endpoint (every 30 min) — optimized to prevent billing spikes:
 *  1. Fetch Cloud Monitoring metrics (free — GCP API, not Firestore)
 *  2. Only process top N active services (skip idle ones)
 *  3. Circuit breaker: abort if Firestore ops exceed hard limit
 *  4. Store snapshot + check anomalies (tracked Firestore ops)
 *  5. Push notifications: PROD only, critical only, 2h cooldown
 *  6. Firestore usage monitoring (via Cloud Monitoring API — free)
 *  7. Every 6h → recompute baselines (tracked)
 *  8. Once/day → cleanup old data (tracked)
 */
export async function POST(req: NextRequest) {
  // Auth
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    const { getSession } = await import("@/lib/auth-server");
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const startTime = Date.now();
  _firestoreOpsCounter = 0; // reset circuit breaker counter
  let totalChecked = 0;
  let totalAnomalies = 0;
  let totalSnapshots = 0;
  let baselinesUpdated = 0;
  let notificationsSent = 0;
  let skippedIdle = 0;
  let circuitBroken = false;

  const now = new Date();
  const shouldRecomputeBaselines = now.getUTCMinutes() < 15 && now.getUTCHours() % 6 === 0;
  const shouldCleanup = now.getUTCMinutes() < 15 && now.getUTCHours() === 3; // 3am UTC

  try {
    // ── Phase 1: Collect ALL services + Cloud Monitoring metrics (FREE — no Firestore) ──
    const allServiceMetrics: {
      svc: { name: string; env: Env };
      totalRequests: number;
      totalErrors: number;
      avgLatencyP50: number;
      avgLatencyP99: number;
      maxInstances: number;
      avgCpu: number;
      avgMemory: number;
    }[] = [];

    for (const env of ["dev", "prod"] as Env[]) {
      let services;
      try {
        services = await listServices(env);
      } catch (err: any) {
        console.error(`[CRON] Failed to list ${env} services:`, err.message);
        continue;
      }

      // Fetch metrics in parallel (Cloud Monitoring API = free, not Firestore)
      const results = await Promise.allSettled(
        services.map(async (svc) => {
          const metrics = await getServiceMetrics(env, svc.name, "1h");
          const totalRequests = metrics.requestCount.reduce((s, p) => s + p.value, 0);
          const totalErrors = metrics.errorCount.reduce((s, p) => s + p.value, 0);
          const avgLatencyP50 = metrics.latencyP50.length > 0
            ? metrics.latencyP50.reduce((s, p) => s + p.value, 0) / metrics.latencyP50.length : 0;
          const avgLatencyP99 = metrics.latencyP99.length > 0
            ? metrics.latencyP99.reduce((s, p) => s + p.value, 0) / metrics.latencyP99.length : 0;
          const maxInstances = metrics.instanceCount.length > 0
            ? Math.max(...metrics.instanceCount.map((p) => p.value)) : 0;
          const avgCpu = metrics.cpuUtilization.length > 0
            ? metrics.cpuUtilization.reduce((s, p) => s + p.value, 0) / metrics.cpuUtilization.length : 0;
          const avgMemory = metrics.memoryUtilization.length > 0
            ? metrics.memoryUtilization.reduce((s, p) => s + p.value, 0) / metrics.memoryUtilization.length : 0;

          return { svc: { name: svc.name, env }, totalRequests, totalErrors, avgLatencyP50, avgLatencyP99, maxInstances, avgCpu, avgMemory };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") allServiceMetrics.push(r.value);
      }
    }

    // ── Phase 2: Sort by activity + cap at MAX_SERVICES_PER_RUN ──
    // Only services with actual traffic get Firestore writes
    const activeServices = allServiceMetrics
      .filter((s) => s.totalRequests >= MIN_REQUESTS_TO_MONITOR)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, MAX_SERVICES_PER_RUN);

    skippedIdle = allServiceMetrics.length - activeServices.length;
    console.log(
      `[CRON] ${allServiceMetrics.length} services found, ` +
      `${activeServices.length} active (top ${MAX_SERVICES_PER_RUN}), ` +
      `${skippedIdle} skipped (idle)`
    );

    // ── Phase 3: Firestore operations (TRACKED by circuit breaker) ──
    for (const s of activeServices) {
      try {
        const snapshot: MetricSnapshot = {
          service: s.svc.name,
          env: s.svc.env,
          timestamp: new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString(),
          requests: s.totalRequests,
          errors: s.totalErrors,
          errorRate: s.totalRequests > 0 ? Math.round((s.totalErrors / s.totalRequests) * 10000) / 100 : 0,
          latencyP50: Math.round(s.avgLatencyP50),
          latencyP99: Math.round(s.avgLatencyP99),
          instances: s.maxInstances,
          cpuUtilization: Math.round(s.avgCpu * 10000) / 100,
          memoryUtilization: Math.round(s.avgMemory * 10000) / 100,
        };

        // 1 Firestore write
        await storeSnapshot(snapshot);
        trackOp(1);
        totalSnapshots++;

        // 1 Firestore read
        const baseline = await getBaseline(s.svc.name, s.svc.env);
        trackOp(1);

        if (baseline) {
          const anomalies = detectAnomalies(snapshot, baseline);

          for (const anomaly of anomalies) {
            // createAlert = up to 2 Firestore queries internally
            await createAlert({
              service: s.svc.name,
              env: s.svc.env,
              type: `anomaly_${anomaly.metric}`,
              severity: anomaly.severity,
              status: "active",
              message:
                `${anomaly.label}: ${anomaly.currentValue} ` +
                `(baseline: ${anomaly.baselineMean} ± ${anomaly.baselineStddev}, ` +
                `${anomaly.deviations}σ au-dessus)`,
              value: anomaly.currentValue,
              threshold: anomaly.baselineMean + anomaly.baselineStddev * 2,
              createdAt: now.toISOString(),
            });
            trackOp(3); // isPatternAcked + checkExisting + write
            totalAnomalies++;

            // Push notification rules with 2h cooldown:
            //  - PROD: critical (≥4σ)
            //  - DEV:  only extreme anomalies (≥6σ) — real meltdowns
            const shouldPush =
              (s.svc.env === "prod" && anomaly.severity === "critical") ||
              (s.svc.env === "dev" && anomaly.deviations >= 6);

            if (shouldPush) {
              const cooldownKey = `${s.svc.env}_${s.svc.name}_${anomaly.metric}`;
              const shouldNotify = await checkNotifCooldown(cooldownKey, now);

              if (shouldNotify) {
                try {
                  const sent = await notifyAlertToAdmins({
                    service: s.svc.name,
                    env: s.svc.env,
                    severity: anomaly.severity,
                    message:
                      `${anomaly.label}: ${anomaly.currentValue} ` +
                      `(baseline: ${anomaly.baselineMean} ± ${anomaly.baselineStddev}, ` +
                      `${anomaly.deviations}σ au-dessus)`,
                    type: `anomaly_${anomaly.metric}`,
                  });
                  trackOp(2); // user_app_roles query + apps query
                  notificationsSent += sent;
                } catch (notifErr: any) {
                  console.warn(`[CRON] Notification failed:`, notifErr.message);
                }
              } else {
                console.log(`[CRON] Notification skipped (cooldown): ${cooldownKey}`);
              }
            }
          }
        }

        // Recompute baseline only for active services (expensive: reads 7 days of snapshots)
        if (shouldRecomputeBaselines) {
          trackOp(50); // pre-charge: getSnapshots can read many docs
          const updated = await recomputeBaseline(s.svc.name, s.svc.env);
          if (updated) baselinesUpdated++;
        }

        totalChecked++;
      } catch (svcErr: any) {
        if (svcErr.message.includes("CIRCUIT BREAKER")) {
          circuitBroken = true;
          console.error(`[CRON] ${svcErr.message}`);
          break;
        }
        console.warn(`[CRON] Error checking ${s.svc.env}/${s.svc.name}:`, svcErr.message);
      }
    }

    // ── Phase 4: Firestore usage monitoring (Cloud Monitoring API — FREE) ──
    // This part only uses Cloud Monitoring API, NOT Firestore
    let firestoreAlerts = 0;
    if (!circuitBroken) {
      const FIRESTORE_READ_THRESHOLD = 100_000;
      const FIRESTORE_READ_CRITICAL  = 1_000_000;
      const FIRESTORE_WRITE_THRESHOLD = 50_000;
      const FIRESTORE_WRITE_CRITICAL  = 500_000;

      for (const env of ["dev", "prod"] as Env[]) {
        try {
          const { getFirestoreQuickMetrics } = await import("@/lib/gcp");
          const fsMetrics = await getFirestoreQuickMetrics(env);

          if (fsMetrics.readsLastHour > FIRESTORE_READ_THRESHOLD) {
            const severity = fsMetrics.readsLastHour > FIRESTORE_READ_CRITICAL ? "critical" : "warning";
            const formatted = fsMetrics.readsLastHour.toLocaleString("fr-CA");
            trackOp(3);
            const alertId = await createAlert({
              service: `firestore-${env}`,
              env,
              type: "firestore_reads_spike",
              severity: severity as "critical" | "warning",
              status: "active",
              message: `Firestore ${env.toUpperCase()}: ${formatted} lectures/h (seuil: ${FIRESTORE_READ_THRESHOLD.toLocaleString("fr-CA")})`,
              value: fsMetrics.readsLastHour,
              threshold: FIRESTORE_READ_THRESHOLD,
              createdAt: now.toISOString(),
            });
            if (alertId) firestoreAlerts++;

            // ALWAYS notify for Firestore spikes — even warnings cost real money
            if (alertId) {
              try {
                trackOp(2);
                const emoji = severity === "critical" ? "🔥" : "⚠️";
                const sent = await notifyAlertToAdmins({
                  service: `Firestore ${env.toUpperCase()}`,
                  env,
                  severity,
                  message: `${emoji} ${formatted} lectures Firestore/heure (seuil: ${FIRESTORE_READ_THRESHOLD.toLocaleString("fr-CA")})`,
                  type: "firestore_reads_spike",
                });
                notificationsSent += sent;
              } catch (notifErr: any) {
                console.warn(`[CRON] Firestore notification failed:`, notifErr.message);
              }
            }
          }

          if (fsMetrics.writesLastHour > FIRESTORE_WRITE_THRESHOLD) {
            const severity = fsMetrics.writesLastHour > FIRESTORE_WRITE_CRITICAL ? "critical" : "warning";
            const formatted = fsMetrics.writesLastHour.toLocaleString("fr-CA");
            trackOp(3);
            const alertId = await createAlert({
              service: `firestore-${env}`,
              env,
              type: "firestore_writes_spike",
              severity: severity as "critical" | "warning",
              status: "active",
              message: `Firestore ${env.toUpperCase()}: ${formatted} écritures/h (seuil: ${FIRESTORE_WRITE_THRESHOLD.toLocaleString("fr-CA")})`,
              value: fsMetrics.writesLastHour,
              threshold: FIRESTORE_WRITE_THRESHOLD,
              createdAt: now.toISOString(),
            });
            if (alertId) firestoreAlerts++;

            // ALWAYS notify for Firestore spikes
            if (alertId) {
              try {
                trackOp(2);
                const emoji = severity === "critical" ? "🔥" : "⚠️";
                const sent = await notifyAlertToAdmins({
                  service: `Firestore ${env.toUpperCase()}`,
                  env,
                  severity,
                  message: `${emoji} ${formatted} écritures Firestore/heure (seuil: ${FIRESTORE_WRITE_THRESHOLD.toLocaleString("fr-CA")})`,
                  type: "firestore_writes_spike",
                });
                notificationsSent += sent;
              } catch (notifErr: any) {
                console.warn(`[CRON] Firestore notification failed:`, notifErr.message);
              }
            }
          }

          console.log(
            `[CRON] Firestore ${env}: reads=${fsMetrics.readsLastHour.toLocaleString("fr-CA")}/h, ` +
            `writes=${fsMetrics.writesLastHour.toLocaleString("fr-CA")}/h`
          );
        } catch (fsErr: any) {
          console.warn(`[CRON] Firestore metrics failed for ${env}:`, fsErr.message);
        }
      }
    }

    // ── Phase 5: Cleanup (nightly, tracked) ──
    let cleanedSnapshots = 0;
    let cleanedAlerts = 0;
    if (shouldCleanup && !circuitBroken) {
      trackOp(50); // pre-charge cleanup reads
      cleanedSnapshots = await cleanupOldSnapshots();
      cleanedAlerts = await cleanupOldAlerts();
    }

    const duration = Date.now() - startTime;
    console.log(
      `[CRON] Complete: ${totalChecked}/${activeServices.length} services checked, ` +
        `${skippedIdle} idle skipped, ` +
        `${totalSnapshots} snapshots, ${totalAnomalies} anomalies, ` +
        `${firestoreAlerts} fs-alerts, ${notificationsSent} notifications, ` +
        `${_firestoreOpsCounter}/${MAX_FIRESTORE_OPS_PER_RUN} Firestore ops used, ` +
        `${circuitBroken ? "⚠️ CIRCUIT BROKEN" : "✅ OK"}, ${duration}ms`
    );

    return NextResponse.json({
      ok: true,
      checked: totalChecked,
      skippedIdle,
      snapshots: totalSnapshots,
      anomalies: totalAnomalies,
      firestoreAlerts,
      notificationsSent,
      baselinesUpdated,
      firestoreOps: _firestoreOpsCounter,
      firestoreOpsLimit: MAX_FIRESTORE_OPS_PER_RUN,
      circuitBroken,
      cleanedSnapshots,
      cleanedAlerts,
      durationMs: duration,
    });
  } catch (err: any) {
    if (err.message.includes("CIRCUIT BREAKER")) {
      console.error(`[CRON] ${err.message}`);
      return NextResponse.json({
        ok: false,
        error: err.message,
        firestoreOps: _firestoreOpsCounter,
        checked: totalChecked,
      }, { status: 200 }); // 200 to not retry
    }
    console.error("[CRON /alerts/check]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
