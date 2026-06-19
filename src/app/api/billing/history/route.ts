import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

/**
 * GET /api/billing/history?budget={budgetKey}&range=24h|7d|30d|90d
 *
 * Returns historical budget data points for charting.
 * Cost: 1 Firestore query (limited to 500 docs).
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const budgetKey = req.nextUrl.searchParams.get("budget") || "";
  const range = req.nextUrl.searchParams.get("range") || "7d";
  const rangeMs = RANGE_MS[range] || RANGE_MS["7d"];

  if (!budgetKey) {
    return NextResponse.json({ error: "Missing budget parameter" }, { status: 400 });
  }

  try {
    const since = new Date(Date.now() - rangeMs).toISOString();

    const snapshot = await adminDb()
      .collection("palantir_budget_history")
      .where("budgetKey", "==", budgetKey)
      .where("timestamp", ">=", since)
      .orderBy("timestamp", "asc")
      .limit(500)
      .get();

    const points = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        timestamp: d.timestamp,
        cost: d.cost || 0,
        budget: d.budget || 0,
        pct: d.pct || 0,
        currency: d.currency || "CAD",
      };
    });

    return NextResponse.json({ ok: true, budgetKey, range, points });
  } catch (err: unknown) {
    console.error("[Billing History] Error:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
