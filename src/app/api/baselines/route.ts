import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getAllBaselines, getBaseline, getSnapshots } from "@/lib/baseline";

export const dynamic = "force-dynamic";

/**
 * GET /api/baselines
 * Returns all baselines, or a specific one if ?service=xxx&env=yyy.
 * Optional: ?snapshots=true to include last 7 days of snapshots.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  const env = searchParams.get("env") as "dev" | "prod" | null;
  const includeSnapshots = searchParams.get("snapshots") === "true";

  try {
    // Single service baseline
    if (service && env) {
      const baseline = await getBaseline(service, env);
      const result: any = { baseline };

      if (includeSnapshots) {
        result.snapshots = await getSnapshots(service, env, 7);
      }

      return NextResponse.json(result);
    }

    // All baselines
    const baselines = await getAllBaselines();
    return NextResponse.json({ baselines });
  } catch (err: any) {
    console.error("[API /baselines]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
