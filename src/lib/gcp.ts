import "server-only";

/**
 * GCP Client — centralized access to Cloud Run + Cloud Monitoring APIs
 * for both DEV and PROD projects.
 */
import { google } from "googleapis";
import { getServiceAccountForGoogle } from "./firebase-admin";

// ── Project config ──────────────────────────────────────────────────────
export const PROJECTS = {
  dev: {
    id: "gandalf-dev-497413",
    number: "802272023583",
    label: "DEV",
    region: "northamerica-northeast1",
  },
  prod: {
    id: "antigravity-20260107",
    number: "271227085398",
    label: "PROD",
    region: "northamerica-northeast1",
  },
} as const;

export type Env = keyof typeof PROJECTS;

// ── Auth ────────────────────────────────────────────────────────────────
import { GoogleAuth } from "google-auth-library";

let _authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (_authClient) return _authClient;
  const sa = getServiceAccountForGoogle();
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON required for GCP APIs");
  _authClient = new GoogleAuth({
    credentials: sa,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/monitoring.read",
    ],
  });
  return _authClient;
}

// ── Cloud Run ───────────────────────────────────────────────────────────
export interface ServiceInfo {
  name: string;
  env: Env;
  url: string;
  status: "healthy" | "unhealthy" | "unknown";
  latestRevision: string;
  createdAt: string;
  updatedAt: string;
  cpu: string;
  memory: string;
  maxScale: number;
  minScale: number;
}

export async function listServices(env: Env): Promise<ServiceInfo[]> {
  const auth = getAuthClient();
  const run = google.run({ version: "v2", auth: auth as any });
  const project = PROJECTS[env];

  const parent = `projects/${project.id}/locations/${project.region}`;
  const res = await run.projects.locations.services.list({ parent });
  const services: any[] = (res.data as any).services || [];

  return services.map((svc: any) => {
    const template = svc.template;
    const container = template?.containers?.[0];
    const scaling = template?.scaling;
    const conditions: any[] = svc.conditions || [];
    const readyCondition = conditions.find((c: any) => c.type === "Ready");
    const status: ServiceInfo["status"] =
      readyCondition?.state === "CONDITION_SUCCEEDED"
        ? "healthy"
        : readyCondition?.state === "CONDITION_FAILED"
        ? "unhealthy"
        : "unknown";

    return {
      name: svc.name?.split("/").pop() || "",
      env,
      url: svc.uri || "",
      status,
      latestRevision: template?.revision || svc.latestReadyRevision?.split("/").pop() || "",
      createdAt: svc.createTime || "",
      updatedAt: svc.updateTime || "",
      cpu: container?.resources?.limits?.cpu || "1",
      memory: container?.resources?.limits?.memory || "512Mi",
      maxScale: scaling?.maxInstanceCount || 100,
      minScale: scaling?.minInstanceCount || 0,
    };
  });
}

// ── Cloud Monitoring — Time Series ──────────────────────────────────────
export interface MetricPoint {
  time: string; // ISO
  value: number;
}

export interface ServiceMetrics {
  requestCount: MetricPoint[];
  errorCount: MetricPoint[];
  latencyP50: MetricPoint[];
  latencyP99: MetricPoint[];
  instanceCount: MetricPoint[];
  cpuUtilization: MetricPoint[];     // 0–1 (fraction)
  memoryUtilization: MetricPoint[];  // 0–1 (fraction)
  billableTime: MetricPoint[];       // seconds
}

type Period = "1h" | "6h" | "24h" | "7d";

function periodToSeconds(period: Period): number {
  switch (period) {
    case "1h": return 3600;
    case "6h": return 21600;
    case "24h": return 86400;
    case "7d": return 604800;
  }
}

function alignmentPeriod(period: Period): string {
  switch (period) {
    case "1h": return "60s";
    case "6h": return "300s";
    case "24h": return "900s";
    case "7d": return "3600s";
  }
}

async function queryTimeSeries(
  projectId: string,
  filter: string,
  period: Period,
  aligner: string = "ALIGN_SUM",
  reducer?: string
): Promise<MetricPoint[]> {
  const auth = getAuthClient();
  const monitoring = google.monitoring({ version: "v3", auth: auth as any });

  const now = new Date();
  const start = new Date(now.getTime() - periodToSeconds(period) * 1000);

  const params: any = {
    name: `projects/${projectId}`,
    filter,
    "interval.startTime": start.toISOString(),
    "interval.endTime": now.toISOString(),
    "aggregation.alignmentPeriod": alignmentPeriod(period),
    "aggregation.perSeriesAligner": aligner,
  };

  if (reducer) {
    params["aggregation.crossSeriesReducer"] = reducer;
  }

  try {
    const res = await monitoring.projects.timeSeries.list(params);
    const series = res.data.timeSeries || [];
    const points: MetricPoint[] = [];

    for (const ts of series) {
      for (const pt of ts.points || []) {
        const time = pt.interval?.endTime || "";
        const value =
          pt.value?.int64Value != null
            ? Number(pt.value.int64Value)
            : pt.value?.doubleValue != null
            ? pt.value.doubleValue
            : 0;
        points.push({ time, value });
      }
    }

    // Sort by time ascending
    points.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return points;
  } catch (err: any) {
    console.error(`[GCP] Metrics query failed: ${err.message}`);
    return [];
  }
}

export async function getServiceMetrics(
  env: Env,
  serviceName: string,
  period: Period = "24h"
): Promise<ServiceMetrics> {
  const projectId = PROJECTS[env].id;
  const baseFilter = `resource.type="cloud_run_revision" resource.labels.service_name="${serviceName}"`;

  const [requestCount, errorCount, latencyP50, latencyP99, instanceCount, cpuUtilization, memoryUtilization, billableTime] =
    await Promise.all([
      // Request count
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/request_count"`,
        period, "ALIGN_SUM", "REDUCE_SUM"
      ),
      // Error count (5xx)
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/request_count" metric.labels.response_code_class="5xx"`,
        period, "ALIGN_SUM", "REDUCE_SUM"
      ),
      // Latency P50
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/request_latencies"`,
        period, "ALIGN_PERCENTILE_50", "REDUCE_MEAN"
      ),
      // Latency P99
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/request_latencies"`,
        period, "ALIGN_PERCENTILE_99", "REDUCE_MEAN"
      ),
      // Instance count
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/container/instance_count"`,
        period, "ALIGN_MAX", "REDUCE_SUM"
      ),
      // CPU utilization (0–1)
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/container/cpu/utilizations"`,
        period, "ALIGN_PERCENTILE_99", "REDUCE_MEAN"
      ),
      // Memory utilization (0–1)
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/container/memory/utilizations"`,
        period, "ALIGN_PERCENTILE_99", "REDUCE_MEAN"
      ),
      // Billable instance time (seconds)
      queryTimeSeries(
        projectId,
        `${baseFilter} metric.type="run.googleapis.com/container/billable_instance_time"`,
        period, "ALIGN_SUM", "REDUCE_SUM"
      ),
    ]);

  return { requestCount, errorCount, latencyP50, latencyP99, instanceCount, cpuUtilization, memoryUtilization, billableTime };
}

// ── Quick summary for overview ──────────────────────────────────────────
export interface ServiceQuickMetrics {
  requestsPerMin: number;
  errorRate: number; // 0–100
  latencyP50Ms: number;
  instanceCount: number;
  sparkline: number[]; // last 24 data points of request count
}

export async function getQuickMetrics(
  env: Env,
  serviceName: string
): Promise<ServiceQuickMetrics> {
  const metrics = await getServiceMetrics(env, serviceName, "1h");

  const totalRequests = metrics.requestCount.reduce((s, p) => s + p.value, 0);
  const totalErrors = metrics.errorCount.reduce((s, p) => s + p.value, 0);
  const avgLatency =
    metrics.latencyP50.length > 0
      ? metrics.latencyP50.reduce((s, p) => s + p.value, 0) / metrics.latencyP50.length
      : 0;
  const maxInstances =
    metrics.instanceCount.length > 0
      ? Math.max(...metrics.instanceCount.map((p) => p.value))
      : 0;

  return {
    requestsPerMin: Math.round(totalRequests / 60),
    errorRate: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 10000) / 100 : 0,
    latencyP50Ms: Math.round(avgLatency),
    instanceCount: maxInstances,
    sparkline: metrics.requestCount.slice(-24).map((p) => p.value),
  };
}
