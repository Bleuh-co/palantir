import "server-only";

/**
 * Palantir — Baseline & Anomaly Detection
 *
 * Stores hourly snapshots per service. Computes rolling baselines (7 jours).
 * Détecte les anomalies quand une métrique dépasse baseline + 2σ (sigma).
 *
 * Collections Firestore :
 *   palantir_snapshots   — 1 doc per service per hour (TTL 30 days)
 *   palantir_baselines   — 1 doc per service with rolling stats
 */

import { adminDb } from "./firebase-admin";
import type { Env } from "./gcp";

// ── Types ─────────────────────────────────────────────────────────────

export interface MetricSnapshot {
  service: string;
  env: Env;
  timestamp: string; // ISO — rounded to the hour
  requests: number;
  errors: number;
  errorRate: number; // 0–100
  latencyP50: number;
  latencyP99: number;
  instances: number;
  cpuUtilization: number; // 0–100
  memoryUtilization: number; // 0–100
}

export interface BaselineStats {
  service: string;
  env: Env;
  sampleCount: number;
  updatedAt: string;
  // Per metric: { mean, stddev }
  requests: { mean: number; stddev: number };
  errors: { mean: number; stddev: number };
  errorRate: { mean: number; stddev: number };
  latencyP50: { mean: number; stddev: number };
  latencyP99: { mean: number; stddev: number };
  instances: { mean: number; stddev: number };
}

export interface Anomaly {
  metric: string;
  label: string;
  currentValue: number;
  baselineMean: number;
  baselineStddev: number;
  deviations: number; // how many σ above mean
  severity: "warning" | "critical";
}

// ── Constants ─────────────────────────────────────────────────────────

const COLLECTION_SNAPSHOTS = "palantir_snapshots";
const COLLECTION_BASELINES = "palantir_baselines";
const BASELINE_WINDOW_DAYS = 7;
const MIN_SAMPLES_FOR_BASELINE = 12; // ~12 hours of data minimum
const WARNING_SIGMA = 3; // 3σ = warning
const CRITICAL_SIGMA = 4; // 4σ = critical (push notification threshold)

// ── Snapshot Storage ──────────────────────────────────────────────────

/**
 * Stores a metric snapshot, keyed by service+env+hour to avoid duplicates.
 */
export async function storeSnapshot(snapshot: MetricSnapshot): Promise<void> {
  const db = adminDb();
  const hourKey = snapshot.timestamp.slice(0, 13).replace(/[^0-9]/g, ""); // YYYYMMDDHH
  const docId = `${snapshot.env}_${snapshot.service}_${hourKey}`;

  await db.collection(COLLECTION_SNAPSHOTS).doc(docId).set(snapshot, { merge: true });
}

/**
 * Get snapshots for a service within a time window.
 */
export async function getSnapshots(
  service: string,
  env: Env,
  days: number = 7
): Promise<MetricSnapshot[]> {
  const db = adminDb();
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const snap = await db
    .collection(COLLECTION_SNAPSHOTS)
    .where("service", "==", service)
    .where("env", "==", env)
    .where("timestamp", ">=", since)
    .orderBy("timestamp", "asc")
    .limit(500)
    .get();

  return snap.docs.map((d) => d.data() as MetricSnapshot);
}

/**
 * Clean up old snapshots (> 30 days).
 */
export async function cleanupOldSnapshots(): Promise<number> {
  const db = adminDb();
  const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  const snap = await db
    .collection(COLLECTION_SNAPSHOTS)
    .where("timestamp", "<", cutoff)
    .limit(400) // batch limit to avoid timeout
    .get();

  if (snap.empty) return 0;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  console.log(`[Baseline] Cleaned ${snap.size} old snapshots`);
  return snap.size;
}

// ── Baseline Computation ──────────────────────────────────────────────

function computeStats(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
  };
}

/**
 * Recompute the baseline for a specific service using the last 7 days of snapshots.
 * IMPORTANT: Only uses ACTIVE snapshots (requests > 0) to avoid idle periods
 * (nighttime, weekends) from polluting the baseline with zeros.
 */
export async function recomputeBaseline(
  service: string,
  env: Env
): Promise<BaselineStats | null> {
  const allSnapshots = await getSnapshots(service, env, BASELINE_WINDOW_DAYS);

  // Filter out idle periods — only compute baseline from active usage
  const snapshots = allSnapshots.filter((s) => s.requests > 0);

  if (snapshots.length < MIN_SAMPLES_FOR_BASELINE) {
    console.log(
      `[Baseline] ${env}/${service}: Only ${snapshots.length} active samples out of ${allSnapshots.length} total (need ${MIN_SAMPLES_FOR_BASELINE}). Skipping.`
    );
    return null;
  }

  const baseline: BaselineStats = {
    service,
    env,
    sampleCount: snapshots.length,
    updatedAt: new Date().toISOString(),
    requests: computeStats(snapshots.map((s) => s.requests)),
    errors: computeStats(snapshots.map((s) => s.errors)),
    errorRate: computeStats(snapshots.map((s) => s.errorRate)),
    latencyP50: computeStats(snapshots.map((s) => s.latencyP50)),
    latencyP99: computeStats(snapshots.map((s) => s.latencyP99)),
    instances: computeStats(snapshots.map((s) => s.instances)),
  };

  // Store in Firestore
  const db = adminDb();
  await db
    .collection(COLLECTION_BASELINES)
    .doc(`${env}_${service}`)
    .set(baseline);

  console.log(
    `[Baseline] ${env}/${service}: Updated (${snapshots.length} samples). ` +
      `Req avg=${baseline.requests.mean}±${baseline.requests.stddev}`
  );

  return baseline;
}

/**
 * Get stored baseline for a service.
 */
export async function getBaseline(
  service: string,
  env: Env
): Promise<BaselineStats | null> {
  const db = adminDb();
  const doc = await db.collection(COLLECTION_BASELINES).doc(`${env}_${service}`).get();
  if (!doc.exists) return null;
  return doc.data() as BaselineStats;
}

// ── Anomaly Detection ─────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  requests: "Requêtes/heure",
  errors: "Erreurs/heure",
  errorRate: "Taux d'erreur (%)",
  latencyP50: "Latence P50 (ms)",
  latencyP99: "Latence P99 (ms)",
  instances: "Instances actives",
};

/**
 * Compare current metrics against the baseline (active-hours only).
 * Returns anomalies (values > baseline + Nσ).
 *
 * Handles cold starts: if service was idle (0 requests) and just woke up,
 * latency/error spikes are expected and ignored.
 */
export function detectAnomalies(
  current: MetricSnapshot,
  baseline: BaselineStats
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // If service has very few requests, latency & error metrics are unreliable
  // (cold start penalty, single-request amplification). Skip those.
  const isColdStart = current.requests > 0 && current.requests < 5;

  const metricsToCheck: (keyof Pick<
    BaselineStats,
    "requests" | "errors" | "errorRate" | "latencyP50" | "latencyP99" | "instances"
  >)[] = ["requests", "errors", "errorRate", "latencyP50", "latencyP99", "instances"];

  for (const metric of metricsToCheck) {
    const stats = baseline[metric];
    const value = current[metric] as number;

    // Skip metrics with no variance (always 0)
    if (stats.mean === 0 && stats.stddev === 0) continue;

    // Skip latency/error metrics during cold starts (unreliable)
    if (isColdStart && ["latencyP50", "latencyP99", "errorRate", "errors"].includes(metric)) {
      continue;
    }

    // Calculate how many standard deviations above the mean
    const stddev = Math.max(stats.stddev, stats.mean * 0.1); // floor stddev at 10% of mean
    const deviations = stddev > 0 ? (value - stats.mean) / stddev : 0;

    if (deviations >= WARNING_SIGMA) {
      anomalies.push({
        metric,
        label: METRIC_LABELS[metric] || metric,
        currentValue: Math.round(value * 100) / 100,
        baselineMean: stats.mean,
        baselineStddev: stats.stddev,
        deviations: Math.round(deviations * 10) / 10,
        severity: deviations >= CRITICAL_SIGMA ? "critical" : "warning",
      });
    }
  }

  return anomalies;
}

// ── API Helper: Get baseline overview for all services ────────────────

export async function getAllBaselines(): Promise<BaselineStats[]> {
  const db = adminDb();
  const snap = await db.collection(COLLECTION_BASELINES).get();
  return snap.docs.map((d) => d.data() as BaselineStats);
}
