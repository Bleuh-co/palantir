import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { listServices, getQuickMetrics, PROJECTS, type Env, type ServiceInfo } from "@/lib/gcp";

export const dynamic = "force-dynamic";

/**
 * GET /api/services?env=prod|dev|all
 * Returns all Cloud Run services enriched with quick metrics.
 */
export async function GET(req: NextRequest) {
  // Auth: session OR API key (for Apps Hub proxy)
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const envParam = req.nextUrl.searchParams.get("env") || "all";
  const envs: Env[] =
    envParam === "all" ? ["dev", "prod"] : [envParam as Env];

  try {
    const results: (ServiceInfo & {
      requestsPerMin?: number;
      errorRate?: number;
      latencyP50Ms?: number;
      instanceCount?: number;
      sparkline?: number[];
    })[] = [];

    for (const env of envs) {
      if (!PROJECTS[env]) continue;
      const services = await listServices(env);

      // Fetch quick metrics for all services in parallel (batched)
      const enriched = await Promise.all(
        services.map(async (svc) => {
          try {
            const metrics = await getQuickMetrics(env, svc.name);
            return { ...svc, ...metrics };
          } catch (err: any) {
            // Metrics may fail for new/inactive services — just return base data
            console.warn(`[API /services] Metrics failed for ${env}/${svc.name}:`, err.message);
            return { ...svc, requestsPerMin: 0, errorRate: 0, latencyP50Ms: 0, instanceCount: 0, sparkline: [] };
          }
        })
      );

      results.push(...enriched);
    }

    return NextResponse.json({ services: results, count: results.length });
  } catch (err: any) {
    console.error("[API /services]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
