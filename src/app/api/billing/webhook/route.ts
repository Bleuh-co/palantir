import { NextRequest, NextResponse } from "next/server";
import { createAlert } from "@/lib/alerts";
import { notifyAlertToAdmins } from "@/lib/hub-notify";
import { getFirestore } from "firebase-admin/firestore";
import { initFirebaseAdmin } from "@/lib/firebase-admin";

/**
 * POST /api/billing/webhook
 *
 * Receives Pub/Sub push messages from GCP Budget Alerts.
 *
 * Smart notification rules:
 * 1. Alert when approaching budget (80%)
 * 2. Alert when exceeding budget (100%)
 * 3. Alert on sudden cost spike (cost jumped significantly since last check)
 * 4. Once exceeded, DON'T repeat until costs go back below budget (new billing cycle)
 */

interface BudgetNotification {
  budgetDisplayName: string;
  costAmount: number;
  budgetAmount: number;
  budgetAmountType: string;
  alertThresholdExceeded: number;
  currencyCode: string;
  costIntervalStart: string;
}

// Thresholds we care about (ascending order)
const THRESHOLDS = [50, 80, 100] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Pub/Sub push format
    const messageData = body?.message?.data;
    if (!messageData) {
      console.warn("[Billing Webhook] No message.data in payload");
      return NextResponse.json({ error: "Missing message.data" }, { status: 400 });
    }

    // Decode base64
    const decoded = Buffer.from(messageData, "base64").toString("utf-8");
    const notification: BudgetNotification = JSON.parse(decoded);

    console.log(`[Billing Webhook] Received:`, JSON.stringify(notification));

    const {
      budgetDisplayName,
      costAmount,
      budgetAmount,
      alertThresholdExceeded,
      currencyCode,
      costIntervalStart,
    } = notification;

    const pct = Math.round((alertThresholdExceeded || 0) * 100);
    const budgetKey = `budget-${(budgetDisplayName || "unknown").toLowerCase().replace(/\s+/g, "-")}`;

    // ── Deduplication: check what we already notified ──
    initFirebaseAdmin();
    const db = getFirestore();
    const stateRef = db.collection("palantir_budget_state").doc(budgetKey);
    const stateDoc = await stateRef.get();
    const state = stateDoc.exists ? stateDoc.data()! : {};

    const lastNotifiedPct = state.lastNotifiedPct || 0;
    const lastCostAmount = state.lastCostAmount || 0;
    const lastIntervalStart = state.costIntervalStart || "";

    // New billing cycle? Reset state
    const isNewCycle = costIntervalStart && costIntervalStart !== lastIntervalStart;
    const effectiveLastPct = isNewCycle ? 0 : lastNotifiedPct;

    // Determine which threshold bracket we're in
    let currentBracket = 0;
    for (const t of THRESHOLDS) {
      if (pct >= t) currentBracket = t;
    }

    // ── Decision: should we notify? ──
    let shouldNotify = false;
    let notifyReason = "";

    // Rule 1 & 2: New threshold crossed (approaching or exceeding budget)
    if (currentBracket > effectiveLastPct) {
      shouldNotify = true;
      if (currentBracket >= 100) {
        notifyReason = "🔴 Budget dépassé";
      } else if (currentBracket >= 80) {
        notifyReason = "🟠 Approche du budget";
      } else {
        notifyReason = "🟡 Attention budget";
      }
    }

    // Rule 3: Sudden cost spike (>20% jump since last check, min $10)
    const costJump = costAmount - lastCostAmount;
    const jumpPct = lastCostAmount > 0 ? (costJump / lastCostAmount) * 100 : 0;
    if (!isNewCycle && costJump > 10 && jumpPct > 20 && !shouldNotify) {
      shouldNotify = true;
      notifyReason = `⚡ Hausse soudaine (+$${costJump.toFixed(2)}, +${jumpPct.toFixed(0)}%)`;
    }

    // Rule 4: Already exceeded → don't repeat
    if (effectiveLastPct >= 100 && currentBracket >= 100 && !isNewCycle && notifyReason !== "⚡") {
      // Only spike detection can break through the "already exceeded" block
      if (!notifyReason.startsWith("⚡")) {
        shouldNotify = false;
        console.log(`[Billing Webhook] Budget "${budgetDisplayName}" still exceeded (${pct}%), skipping duplicate notification`);
      }
    }

    // Determine severity
    let severity: "info" | "warning" | "critical" = "info";
    if (pct >= 100) severity = "critical";
    else if (pct >= 80) severity = "warning";

    const message = `${notifyReason || "Budget"} "${budgetDisplayName}" — ${pct}% (${costAmount?.toFixed(2)} ${currencyCode} / ${budgetAmount?.toFixed(2)} ${currencyCode})`;

    // Always update state (even if we don't notify)
    await stateRef.set({
      lastNotifiedPct: Math.max(currentBracket, effectiveLastPct),
      lastCostAmount: costAmount,
      costIntervalStart: costIntervalStart || lastIntervalStart,
      budgetAmount,
      currencyCode,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Create alert + notify only if needed
    let alertId: string | null = null;
    if (shouldNotify) {
      alertId = await createAlert({
        service: budgetKey,
        env: "prod",
        type: "budget_threshold",
        severity,
        status: "active",
        message,
        value: costAmount || 0,
        threshold: budgetAmount || 0,
        createdAt: new Date().toISOString(),
      });

      if (alertId && severity !== "info") {
        await notifyAlertToAdmins({
          service: budgetDisplayName || "Budget GCP",
          env: "prod",
          severity,
          message,
          type: "budget_threshold",
        });
      }

      console.log(`[Billing Webhook] ✅ Notified: ${severity} — ${notifyReason} for "${budgetDisplayName}" at ${pct}%`);
    } else {
      console.log(`[Billing Webhook] ⏭️ Skipped: "${budgetDisplayName}" at ${pct}% (already notified at ${effectiveLastPct}%)`);
    }

    // Must return 200 to Pub/Sub to acknowledge the message
    return NextResponse.json({ ok: true, alertId, severity, pct, notified: shouldNotify, reason: notifyReason });
  } catch (err: unknown) {
    console.error("[Billing Webhook] Error:", (err as Error).message);
    // Return 200 anyway to avoid Pub/Sub retry storms
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
