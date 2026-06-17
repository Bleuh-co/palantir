import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getServiceMetrics, PROJECTS, type Env } from "@/lib/gcp";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/[name]/metrics?env=prod&period=1h|6h|24h|7d
 * Returns time series metrics for a specific service.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { name } = await params;
  const env = (req.nextUrl.searchParams.get("env") || "prod") as Env;
  const period = (req.nextUrl.searchParams.get("period") || "24h") as
    | "1h"
    | "6h"
    | "24h"
    | "7d";

  if (!PROJECTS[env]) {
    return NextResponse.json({ error: "Invalid env" }, { status: 400 });
  }

  try {
    const metrics = await getServiceMetrics(env, name, period);
    return NextResponse.json({ service: name, env, period, metrics });
  } catch (err: any) {
    console.error(`[API /services/${name}/metrics]`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
