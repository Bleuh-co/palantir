import { NextRequest, NextResponse } from "next/server";
import { listServices, getServiceMetrics, PROJECTS, type Env } from "@/lib/gcp";
import { createAlert, cleanupOldAlerts } from "@/lib/alerts";
import { notifyAlertToAdmins } from "@/lib/hub-notify";
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

/**
 * POST /api/alerts/check
 *
 * CRON endpoint (every 5 min) — for each service:
 *  1. Fetch last-hour metrics from Cloud Monitoring
 *  2. Store a snapshot in Firestore (hourly dedup)
 *  3. Compare against baseline (rolling 7-day mean + stddev)
 *  4. If anomaly (>2σ) → create alert
 *  5. Every 6h → recompute baselines
 *  6. Once/day → cleanup old snapshots (>30d)
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
  let totalChecked = 0;
  let totalAnomalies = 0;
  let totalSnapshots = 0;
  let baselinesUpdated = 0;
  let notificationsSent = 0;

  // Determine if we should recompute baselines (every 6h = minute is 0 and hour % 6 === 0)
  const now = new Date();
  const shouldRecomputeBaselines = now.getUTCMinutes() < 5 && now.getUTCHours() % 6 === 0;
  const shouldCleanup = now.getUTCMinutes() < 5 && now.getUTCHours() === 3; // 3am UTC

  try {
    for (const env of ["dev", "prod"] as Env[]) {
      let services;
      try {
        services = await listServices(env);
      } catch (err: any) {
        console.error(`[CRON] Failed to list ${env} services:`, err.message);
        continue;
      }

      for (const svc of services) {
        try {
          // 1. Fetch 1h of metrics
          const metrics = await getServiceMetrics(env, svc.name, "1h");

          const totalRequests = metrics.requestCount.reduce((s, p) => s + p.value, 0);
          const totalErrors = metrics.errorCount.reduce((s, p) => s + p.value, 0);
          const avgLatencyP50 =
            metrics.latencyP50.length > 0
              ? metrics.latencyP50.reduce((s, p) => s + p.value, 0) / metrics.latencyP50.length
              : 0;
          const avgLatencyP99 =
            metrics.latencyP99.length > 0
              ? metrics.latencyP99.reduce((s, p) => s + p.value, 0) / metrics.latencyP99.length
              : 0;
          const maxInstances =
            metrics.instanceCount.length > 0
              ? Math.max(...metrics.instanceCount.map((p) => p.value))
              : 0;
          const avgCpu =
            metrics.cpuUtilization.length > 0
              ? metrics.cpuUtilization.reduce((s, p) => s + p.value, 0) / metrics.cpuUtilization.length
              : 0;
          const avgMemory =
            metrics.memoryUtilization.length > 0
              ? metrics.memoryUtilization.reduce((s, p) => s + p.value, 0) / metrics.memoryUtilization.length
              : 0;

          // 2. Build snapshot
          const snapshot: MetricSnapshot = {
            service: svc.name,
            env,
            timestamp: new Date(
              Math.floor(now.getTime() / 3600000) * 3600000
            ).toISOString(), // rounded to hour
            requests: totalRequests,
            errors: totalErrors,
            errorRate:
              totalRequests > 0
                ? Math.round((totalErrors / totalRequests) * 10000) / 100
                : 0,
            latencyP50: Math.round(avgLatencyP50),
            latencyP99: Math.round(avgLatencyP99),
            instances: maxInstances,
            cpuUtilization: Math.round(avgCpu * 10000) / 100,  // 0–100%
            memoryUtilization: Math.round(avgMemory * 10000) / 100, // 0–100%
          };

          // 3. Store snapshot
          await storeSnapshot(snapshot);
          totalSnapshots++;

          // 4. Compare against baseline
          const baseline = await getBaseline(svc.name, env);
          if (baseline) {
            const anomalies = detectAnomalies(snapshot, baseline);

            for (const anomaly of anomalies) {
              await createAlert({
                service: svc.name,
                env,
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
              totalAnomalies++;

              // 4b. Push notification to admins for critical anomalies
              // (warning = silent in dashboard only, critical = push)
              if (anomaly.severity === "critical") {
                try {
                  const sent = await notifyAlertToAdmins({
                    service: svc.name,
                    env,
                    severity: anomaly.severity,
                    message:
                      `${anomaly.label}: ${anomaly.currentValue} ` +
                      `(baseline: ${anomaly.baselineMean} ± ${anomaly.baselineStddev}, ` +
                      `${anomaly.deviations}σ au-dessus)`,
                    type: `anomaly_${anomaly.metric}`,
                  });
                  notificationsSent += sent;
                } catch (notifErr: any) {
                  console.warn(`[CRON] Notification failed:`, notifErr.message);
                }
              }
            }
          }

          // 5. Recompute baseline if scheduled
          if (shouldRecomputeBaselines) {
            const updated = await recomputeBaseline(svc.name, env);
            if (updated) baselinesUpdated++;
          }

          totalChecked++;
        } catch (svcErr: any) {
          console.warn(`[CRON] Error checking ${env}/${svc.name}:`, svcErr.message);
        }
      }
    }

    // ── 7. Firestore usage monitoring ──────────────────────────────────
    // Check Firestore reads/writes per project for anomalies
    let firestoreAlerts = 0;
    const FIRESTORE_READ_THRESHOLD = 100_000;   // per hour — 100K reads/h = warning territory
    const FIRESTORE_READ_CRITICAL  = 1_000_000; // 1M reads/h = critical
    const FIRESTORE_WRITE_THRESHOLD = 50_000;
    const FIRESTORE_WRITE_CRITICAL  = 500_000;

    for (const env of ["dev", "prod"] as Env[]) {
      try {
        const { getFirestoreQuickMetrics } = await import("@/lib/gcp");
        const fsMetrics = await getFirestoreQuickMetrics(env);

        // Check reads spike
        if (fsMetrics.readsLastHour > FIRESTORE_READ_THRESHOLD) {
          const severity = fsMetrics.readsLastHour > FIRESTORE_READ_CRITICAL ? "critical" : "warning";
          const formatted = fsMetrics.readsLastHour.toLocaleString("fr-CA");
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

          // Push notification for critical
          if (severity === "critical" && alertId) {
            try {
              const sent = await notifyAlertToAdmins({
                service: `Firestore ${env.toUpperCase()}`,
                env,
                severity,
                message: `🔥 ${formatted} lectures Firestore/heure — possible boucle infinie !`,
                type: "firestore_reads_spike",
              });
              notificationsSent += sent;
            } catch (notifErr: any) {
              console.warn(`[CRON] Firestore notification failed:`, notifErr.message);
            }
          }
        }

        // Check writes spike
        if (fsMetrics.writesLastHour > FIRESTORE_WRITE_THRESHOLD) {
          const severity = fsMetrics.writesLastHour > FIRESTORE_WRITE_CRITICAL ? "critical" : "warning";
          const formatted = fsMetrics.writesLastHour.toLocaleString("fr-CA");
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

          if (severity === "critical" && alertId) {
            try {
              const sent = await notifyAlertToAdmins({
                service: `Firestore ${env.toUpperCase()}`,
                env,
                severity,
                message: `🔥 ${formatted} écritures Firestore/heure — possible boucle infinie !`,
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
          `writes=${fsMetrics.writesLastHour.toLocaleString("fr-CA")}/h, ` +
          `peak_reads=${fsMetrics.readsPeak.toLocaleString("fr-CA")}/h`
        );
      } catch (fsErr: any) {
        console.warn(`[CRON] Firestore metrics failed for ${env}:`, fsErr.message);
      }
    }

    // 6. Cleanup old data (nightly)
    let cleanedSnapshots = 0;
    let cleanedAlerts = 0;
    if (shouldCleanup) {
      cleanedSnapshots = await cleanupOldSnapshots();
      cleanedAlerts = await cleanupOldAlerts();
    }

    const duration = Date.now() - startTime;
    console.log(
      `[CRON] Complete: ${totalChecked} services checked, ` +
        `${totalSnapshots} snapshots stored, ` +
        `${totalAnomalies} anomalies detected, ` +
        `${firestoreAlerts} firestore alerts, ` +
        `${notificationsSent} notifications sent, ` +
        `${baselinesUpdated} baselines updated, ` +
        `${cleanedSnapshots} old snapshots + ${cleanedAlerts} old alerts cleaned, ` +
        `${duration}ms`
    );

    return NextResponse.json({
      ok: true,
      checked: totalChecked,
      snapshots: totalSnapshots,
      anomalies: totalAnomalies,
      firestoreAlerts,
      notificationsSent,
      baselinesUpdated,
      cleanedSnapshots,
      cleanedAlerts,
      durationMs: duration,
    });
  } catch (err: any) {
    console.error("[CRON /alerts/check]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
