import "server-only";

import { adminDb } from "./firebase-admin";
import type { Env } from "./gcp";

// ── Types ───────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "active" | "acknowledged";

export interface Alert {
  id?: string;
  service: string;
  env: Env;
  type: string; // e.g. "error_rate", "latency_high", "instance_spike"
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  value: number;
  threshold: number;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgeReason?: string;
}

export interface AcknowledgedPattern {
  service: string;
  env: Env;
  type: string;
  threshold: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface AlertThreshold {
  errorRatePercent: number;   // default 5
  latencyP99Ms: number;       // default 5000
  maxInstances: number;       // default 3 (DEV), 10 (PROD)
  minRequestsForAlert: number; // min requests before error rate matters
}

// ── Default Thresholds ──────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: Record<Env, AlertThreshold> = {
  dev: {
    errorRatePercent: 5,
    latencyP99Ms: 5000,
    maxInstances: 3,
    minRequestsForAlert: 10,
  },
  prod: {
    errorRatePercent: 3,
    latencyP99Ms: 5000,
    maxInstances: 10,
    minRequestsForAlert: 50,
  },
};

// ── Thresholds ──────────────────────────────────────────────────────────

export async function getThresholds(
  service: string,
  env: Env
): Promise<AlertThreshold> {
  const db = adminDb();
  const doc = await db.collection("palantir_thresholds").doc(`${env}_${service}`).get();
  if (doc.exists) {
    return { ...DEFAULT_THRESHOLDS[env], ...doc.data() } as AlertThreshold;
  }
  return DEFAULT_THRESHOLDS[env];
}

export async function setThresholds(
  service: string,
  env: Env,
  thresholds: Partial<AlertThreshold>
): Promise<void> {
  const db = adminDb();
  await db
    .collection("palantir_thresholds")
    .doc(`${env}_${service}`)
    .set(thresholds, { merge: true });
}

// ── Alert CRUD ──────────────────────────────────────────────────────────

export async function createAlert(alert: Omit<Alert, "id">): Promise<string> {
  const db = adminDb();

  // Check if this pattern is acknowledged
  const isAcked = await isPatternAcknowledged(alert.service, alert.env, alert.type);
  if (isAcked) {
    console.log(`[Alerts] Skipped (acknowledged): ${alert.service}/${alert.type}`);
    return "";
  }

  // Check if there's already an active alert of this type for this service
  const existing = await db
    .collection("palantir_alerts")
    .where("service", "==", alert.service)
    .where("env", "==", alert.env)
    .where("type", "==", alert.type)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!existing.empty) {
    // Update existing alert value
    const doc = existing.docs[0];
    await doc.ref.update({ value: alert.value, message: alert.message });
    return doc.id;
  }

  const ref = await db.collection("palantir_alerts").add(alert);
  console.log(`[Alerts] Created: ${alert.severity} — ${alert.service}/${alert.type}: ${alert.message}`);
  return ref.id;
}

export async function getAlerts(
  status?: AlertStatus
): Promise<Alert[]> {
  const db = adminDb();
  let query = db.collection("palantir_alerts").orderBy("createdAt", "desc").limit(100);
  if (status) {
    query = db
      .collection("palantir_alerts")
      .where("status", "==", status)
      .orderBy("createdAt", "desc")
      .limit(100);
  }
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Alert));
}

export async function acknowledgeAlert(
  alertId: string,
  by: string,
  reason: string,
  suppressFuture: boolean = false
): Promise<void> {
  const db = adminDb();
  const ref = db.collection("palantir_alerts").doc(alertId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Alert not found");

  const alert = doc.data() as Alert;
  await ref.update({
    status: "acknowledged",
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: by,
    acknowledgeReason: reason,
  });

  if (suppressFuture) {
    await db.collection("palantir_acknowledged").add({
      service: alert.service,
      env: alert.env,
      type: alert.type,
      threshold: alert.threshold,
      reason,
      createdAt: new Date().toISOString(),
      createdBy: by,
    });
    console.log(`[Alerts] Pattern suppressed: ${alert.service}/${alert.type}`);
  }
}

// ── Pattern matching ────────────────────────────────────────────────────

async function isPatternAcknowledged(
  service: string,
  env: Env,
  type: string
): Promise<boolean> {
  const db = adminDb();
  const snap = await db
    .collection("palantir_acknowledged")
    .where("service", "==", service)
    .where("env", "==", env)
    .where("type", "==", type)
    .limit(1)
    .get();
  return !snap.empty;
}

// ── Check metrics against thresholds ────────────────────────────────────

interface CheckResult {
  alerts: Omit<Alert, "id">[];
}

export async function checkService(
  service: string,
  env: Env,
  metrics: {
    requestCount: number;
    errorCount: number;
    latencyP99Ms: number;
    instanceCount: number;
  }
): Promise<CheckResult> {
  const thresholds = await getThresholds(service, env);
  const alerts: Omit<Alert, "id">[] = [];
  const now = new Date().toISOString();

  // Error rate
  if (
    metrics.requestCount >= thresholds.minRequestsForAlert &&
    metrics.requestCount > 0
  ) {
    const errorRate = (metrics.errorCount / metrics.requestCount) * 100;
    if (errorRate > thresholds.errorRatePercent) {
      alerts.push({
        service,
        env,
        type: "error_rate",
        severity: errorRate > 20 ? "critical" : "warning",
        status: "active",
        message: `Taux d'erreur élevé : ${errorRate.toFixed(1)}% (seuil: ${thresholds.errorRatePercent}%)`,
        value: errorRate,
        threshold: thresholds.errorRatePercent,
        createdAt: now,
      });
    }
  }

  // Latency P99
  if (metrics.latencyP99Ms > thresholds.latencyP99Ms) {
    alerts.push({
      service,
      env,
      type: "latency_high",
      severity: metrics.latencyP99Ms > thresholds.latencyP99Ms * 2 ? "critical" : "warning",
      status: "active",
      message: `Latence P99 élevée : ${metrics.latencyP99Ms}ms (seuil: ${thresholds.latencyP99Ms}ms)`,
      value: metrics.latencyP99Ms,
      threshold: thresholds.latencyP99Ms,
      createdAt: now,
    });
  }

  // Instance count spike
  if (metrics.instanceCount > thresholds.maxInstances) {
    alerts.push({
      service,
      env,
      type: "instance_spike",
      severity: metrics.instanceCount > thresholds.maxInstances * 2 ? "critical" : "warning",
      status: "active",
      message: `Pic d'instances : ${metrics.instanceCount} (seuil: ${thresholds.maxInstances})`,
      value: metrics.instanceCount,
      threshold: thresholds.maxInstances,
      createdAt: now,
    });
  }

  return { alerts };
}
