import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/status
 *
 * Returns the latest budget state (cost vs budget) from Firestore.
 * Data is populated by the billing webhook (/api/billing/webhook).
 * Cost: 1 Firestore read per budget document.
 */
export async function GET(req: NextRequest) {
  // Auth: session OR API key
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  if (!apiKey || !validApiKey || apiKey !== validApiKey) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const snapshot = await adminDb()
      .collection("palantir_budget_state")
      .get();

    const budgets: Record<string, {
      cost: number;
      budget: number;
      pct: number;
      currency: string;
      lastNotifiedPct: number;
      updatedAt: string;
    }> = {};

    snapshot.docs.forEach((doc) => {
      const d = doc.data();
      const cost = d.lastCostAmount || 0;
      const budget = d.budgetAmount || 0;
      const pct = budget > 0 ? Math.round((cost / budget) * 100) : 0;

      budgets[doc.id] = {
        cost,
        budget,
        pct,
        currency: d.currencyCode || "CAD",
        lastNotifiedPct: d.lastNotifiedPct || 0,
        updatedAt: d.updatedAt || "",
      };
    });

    return NextResponse.json({ ok: true, budgets });
  } catch (err: unknown) {
    console.error("[Billing Status] Error:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
