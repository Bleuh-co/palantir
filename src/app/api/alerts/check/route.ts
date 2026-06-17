import { NextRequest, NextResponse } from "next/server";
import { listServices, getQuickMetrics, PROJECTS, type Env } from "@/lib/gcp";
import { checkService, createAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/**
 * POST /api/alerts/check
 * CRON endpoint — checks all services against thresholds.
 * Auth: X-Palantir-Key header (for Cloud Scheduler) or session.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  // Only API key auth for CRON (no session in scheduler)
  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    // Fallback: check session
    const { getSession } = await import("@/lib/auth-server");
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const startTime = Date.now();
  let totalChecked = 0;
  let totalAlerts = 0;

  try {
    for (const env of ["dev", "prod"] as Env[]) {
      const services = await listServices(env);

      for (const svc of services) {
        try {
          const metrics = await getQuickMetrics(env, svc.name);
          const result = await checkService(svc.name, env, {
            requestCount: metrics.requestsPerMin * 60, // approx hourly
            errorCount: Math.round((metrics.errorRate / 100) * metrics.requestsPerMin * 60),
            latencyP99Ms: metrics.latencyP50Ms * 3, // rough P99 estimate
            instanceCount: metrics.instanceCount,
          });

          for (const alert of result.alerts) {
            await createAlert(alert);
            totalAlerts++;
          }
          totalChecked++;
        } catch (svcErr: any) {
          console.warn(`[CRON] Error checking ${env}/${svc.name}:`, svcErr.message);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[CRON] Check complete: ${totalChecked} services, ${totalAlerts} new alerts, ${duration}ms`
    );

    return NextResponse.json({
      ok: true,
      checked: totalChecked,
      alertsCreated: totalAlerts,
      durationMs: duration,
    });
  } catch (err: any) {
    console.error("[CRON /alerts/check]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
