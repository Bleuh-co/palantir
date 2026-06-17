import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getFirestoreMetrics, getFirestoreQuickMetrics, PROJECTS, type Env } from "@/lib/gcp";

export const dynamic = "force-dynamic";

/**
 * GET /api/firestore?env=prod|dev|all&period=1h|6h|24h|7d&mode=quick|full
 *
 * Returns Firestore usage metrics (reads, writes, deletes) per project.
 */
export async function GET(req: NextRequest) {
  // Auth: session OR API key
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const envParam = req.nextUrl.searchParams.get("env") || "all";
  const period = (req.nextUrl.searchParams.get("period") || "24h") as "1h" | "6h" | "24h" | "7d";
  const mode = req.nextUrl.searchParams.get("mode") || "quick";

  const envs: Env[] = envParam === "all" ? ["dev", "prod"] : [envParam as Env];

  try {
    const results: Record<string, any> = {};

    for (const env of envs) {
      if (!PROJECTS[env]) continue;

      if (mode === "quick") {
        results[env] = await getFirestoreQuickMetrics(env);
      } else {
        results[env] = await getFirestoreMetrics(env, period);
      }
    }

    return NextResponse.json({ firestore: results, envs, mode, period });
  } catch (err: any) {
    console.error("[API /firestore]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
