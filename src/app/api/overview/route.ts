import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { listServices, type Env } from "@/lib/gcp";
import { getAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/**
 * GET /api/overview
 * Global summary — designed to be reused by Apps Hub widget.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const [devServices, prodServices, activeAlerts] = await Promise.all([
      listServices("dev"),
      listServices("prod"),
      getAlerts("active"),
    ]);

    const count = (services: typeof devServices, status: string) =>
      services.filter((s) => s.status === status).length;

    return NextResponse.json({
      dev: {
        total: devServices.length,
        healthy: count(devServices, "healthy"),
        unhealthy: count(devServices, "unhealthy"),
        unknown: count(devServices, "unknown"),
      },
      prod: {
        total: prodServices.length,
        healthy: count(prodServices, "healthy"),
        unhealthy: count(prodServices, "unhealthy"),
        unknown: count(prodServices, "unknown"),
      },
      alerts: {
        active: activeAlerts.length,
        critical: activeAlerts.filter((a) => a.severity === "critical").length,
        warning: activeAlerts.filter((a) => a.severity === "warning").length,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[API /overview]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
