import { NextRequest, NextResponse } from "next/server";
import { createAlert } from "@/lib/alerts";
import { notifyAlertToAdmins } from "@/lib/hub-notify";

/**
 * POST /api/billing/webhook
 *
 * Receives Pub/Sub push messages from GCP Budget Alerts.
 * The message payload contains budget notification data:
 * - budgetDisplayName: name of the budget
 * - costAmount: current spend
 * - budgetAmount: budget limit
 * - alertThresholdExceeded: the threshold % that was exceeded (0.5, 0.8, 1.0)
 * - currencyCode: e.g. "CAD"
 *
 * Google Pub/Sub Push wraps the data in:
 * { message: { data: "<base64>", messageId: "...", publishTime: "..." }, subscription: "..." }
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

    console.log(`[Billing Webhook] Budget alert received:`, JSON.stringify(notification));

    const {
      budgetDisplayName,
      costAmount,
      budgetAmount,
      alertThresholdExceeded,
      currencyCode,
    } = notification;

    // Determine severity based on threshold
    const pct = Math.round((alertThresholdExceeded || 0) * 100);
    let severity: "info" | "warning" | "critical" = "info";
    if (pct >= 100) severity = "critical";
    else if (pct >= 80) severity = "warning";

    const message = `Budget "${budgetDisplayName}" a atteint ${pct}% — ${costAmount?.toFixed(2)} ${currencyCode} / ${budgetAmount?.toFixed(2)} ${currencyCode}`;

    // Create an alert in Firestore (reuses the existing alert system)
    const alertId = await createAlert({
      service: `budget-${(budgetDisplayName || "unknown").toLowerCase().replace(/\s+/g, "-")}`,
      env: "prod",
      type: "budget_threshold",
      severity,
      status: "active",
      message,
      value: costAmount || 0,
      threshold: budgetAmount || 0,
      createdAt: new Date().toISOString(),
    });

    // Push notification to Palantir Super Admins
    if (alertId && severity !== "info") {
      await notifyAlertToAdmins({
        service: budgetDisplayName || "Budget GCP",
        env: "prod",
        severity,
        message,
        type: "budget_threshold",
      });
    }

    console.log(`[Billing Webhook] Processed: ${severity} alert for "${budgetDisplayName}" at ${pct}%`);

    // Must return 200 to Pub/Sub to acknowledge the message
    return NextResponse.json({ ok: true, alertId, severity, pct });
  } catch (err: unknown) {
    console.error("[Billing Webhook] Error:", (err as Error).message);
    // Return 200 anyway to avoid Pub/Sub retry storms for malformed messages
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
