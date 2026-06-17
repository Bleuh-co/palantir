import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { listServices, PROJECTS, type Env, type ServiceInfo } from "@/lib/gcp";

export const dynamic = "force-dynamic";

/**
 * GET /api/services?env=prod|dev|all
 * Returns all Cloud Run services with their status.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const envParam = req.nextUrl.searchParams.get("env") || "all";
  const envs: Env[] =
    envParam === "all" ? ["dev", "prod"] : [envParam as Env];

  try {
    const results: ServiceInfo[] = [];
    for (const env of envs) {
      if (!PROJECTS[env]) continue;
      const services = await listServices(env);
      results.push(...services);
    }

    // Sort: unhealthy first, then by name
    results.sort((a, b) => {
      const statusOrder = { unhealthy: 0, unknown: 1, healthy: 2 };
      const diff = statusOrder[a.status] - statusOrder[b.status];
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

    return NextResponse.json({ services: results, count: results.length });
  } catch (err: any) {
    console.error("[API /services]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
