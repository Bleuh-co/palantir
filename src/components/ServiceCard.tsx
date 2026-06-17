"use client";

import Link from "next/link";
import { SparkLine } from "./SparkLine";
import { Activity, AlertTriangle, Clock, Layers, Cpu, HardDrive } from "lucide-react";

export interface ServiceCardData {
  name: string;
  env: "dev" | "prod";
  status: "healthy" | "unhealthy" | "unknown";
  url: string;
  cpu: string;
  memory: string;
  maxScale: number;
  // Quick metrics (optional — loaded async)
  requestsPerMin?: number;
  errorRate?: number;
  latencyP50Ms?: number;
  instanceCount?: number;
  sparkline?: number[];
  alertCount?: number;
}

const STATUS_CONFIG = {
  healthy: { color: "#10b981", bg: "rgba(16,185,129,0.08)", label: "OK", dot: "🟢" },
  unhealthy: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", label: "Erreur", dot: "🔴" },
  unknown: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", label: "Inconnu", dot: "🟡" },
} as const;

export function ServiceCard({ data }: { data: ServiceCardData }) {
  const cfg = STATUS_CONFIG[data.status];
  const displayName = data.name
    .replace(/-dev$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Link
      href={`/palantir/${data.name}?env=${data.env}`}
      className="service-card group"
      style={{ "--status-color": cfg.color, "--status-bg": cfg.bg } as React.CSSProperties}
    >
      {/* Header */}
      <div className="sc-header">
        <div className="sc-status-dot" title={cfg.label} />
        <div className="sc-info">
          <h3 className="sc-name">{displayName}</h3>
          <span className={`sc-env-badge sc-env-${data.env}`}>
            {data.env.toUpperCase()}
          </span>
        </div>
        {data.alertCount && data.alertCount > 0 ? (
          <div className="sc-alert-badge" title={`${data.alertCount} alerte(s)`}>
            <AlertTriangle size={12} />
            {data.alertCount}
          </div>
        ) : null}
      </div>

      {/* Sparkline */}
      <div className="sc-sparkline">
        <SparkLine
          data={data.sparkline || []}
          width={180}
          height={36}
          color={cfg.color}
          strokeWidth={1.5}
        />
      </div>

      {/* Metrics row */}
      <div className="sc-metrics">
        <div className="sc-metric" title="Requêtes/min">
          <Activity size={12} />
          <span>{data.requestsPerMin ?? "—"}</span>
          <small>/min</small>
        </div>
        <div className="sc-metric" title="Taux d'erreur">
          <AlertTriangle size={12} />
          <span
            className={
              (data.errorRate || 0) > 5
                ? "text-red-500"
                : (data.errorRate || 0) > 1
                ? "text-amber-500"
                : ""
            }
          >
            {data.errorRate != null ? `${data.errorRate}%` : "—"}
          </span>
        </div>
        <div className="sc-metric" title="Latence P50">
          <Clock size={12} />
          <span>{data.latencyP50Ms != null ? `${data.latencyP50Ms}ms` : "—"}</span>
        </div>
        <div className="sc-metric" title="Instances">
          <Layers size={12} />
          <span>{data.instanceCount ?? "—"}</span>
        </div>
      </div>

      {/* Resources footer */}
      <div className="sc-footer">
        <span><Cpu size={10} /> {data.cpu}</span>
        <span><HardDrive size={10} /> {data.memory}</span>
        <span>max: {data.maxScale}</span>
      </div>
    </Link>
  );
}
