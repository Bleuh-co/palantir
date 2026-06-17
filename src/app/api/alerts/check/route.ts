import { NextRequest, NextResponse } from "next/server";
import { listServices, getServiceMetrics, PROJECTS, type Env } from "@/lib/gcp";
import { createAlert, cleanupOldAlerts } from "@/lib/alerts";
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
        `${baselinesUpdated} baselines updated, ` +
        `${cleanedSnapshots} old snapshots + ${cleanedAlerts} old alerts cleaned, ` +
        `${duration}ms`
    );

    return NextResponse.json({
      ok: true,
      checked: totalChecked,
      snapshots: totalSnapshots,
      anomalies: totalAnomalies,
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
