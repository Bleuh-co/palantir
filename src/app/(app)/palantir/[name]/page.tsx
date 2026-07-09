"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Activity, AlertTriangle, Clock, Layers, Cpu, HardDrive,
  RefreshCw, ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useT, useLocale } from "@/lib/i18n";

interface MetricPoint {
  time: string;
  value: number;
}

interface ServiceMetrics {
  requestCount: MetricPoint[];
  errorCount: MetricPoint[];
  latencyP50: MetricPoint[];
  latencyP99: MetricPoint[];
  instanceCount: MetricPoint[];
  cpuUtilization: MetricPoint[];
  memoryUtilization: MetricPoint[];
  billableTime: MetricPoint[];
}

type Period = "1h" | "6h" | "24h" | "7d";

const PERIODS: { value: Period; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7j" },
];

function formatTime(isoStr: string, period: Period, locale: string) {
  const d = new Date(isoStr);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (period === "7d") {
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
  }
  return `${hh}:${mm}`;
}

function MetricChart({
  title,
  data,
  color,
  unit,
  period,
  locale,
  emptyLabel,
}: {
  title: string;
  data: MetricPoint[];
  color: string;
  unit: string;
  period: Period;
  locale: string;
  emptyLabel: string;
}) {
  const chartData = data.map((p) => ({
    time: formatTime(p.time, period, locale),
    value: Math.round(p.value * 100) / 100,
  }));

  return (
    <div className="metric-chart-card">
      <h3 className="metric-chart-title">{title}</h3>
      {chartData.length === 0 ? (
        <div className="metric-chart-empty">{emptyLabel}</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "#282828",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
              formatter={(value: any) => [`${value} ${unit}`, ""]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#grad-${title})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ServiceDetailPage() {
  const t = useT();
  const locale = useLocale();
  const params = useParams();
  const searchParams = useSearchParams();
  const name = params.name as string;
  const env = (searchParams.get("env") || "prod") as "dev" | "prod";
  const [period, setPeriod] = useState<Period>("24h");
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const displayName = name
    .replace(/-dev$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/services/${name}/metrics?env=${env}&period=${period}`
        );
        if (res.ok) {
          const data = await res.json();
          setMetrics(data.metrics);
        }
      } catch (err) {
        console.error("Metrics fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name, env, period]);

  return (
    <>
      <main className="dashboard-main">
        {/* Breadcrumb */}
        <div className="detail-breadcrumb">
          <Link href="/palantir" className="detail-back">
            <ArrowLeft size={16} />
            {t("detail.dashboard")}
          </Link>
          <span className="detail-sep">/</span>
          <span className="detail-current">{displayName}</span>
          <span className={`sc-env-badge sc-env-${env}`}>{env.toUpperCase()}</span>
        </div>

        {/* Header */}
        <div className="detail-header">
          <h1 className="detail-title">{displayName}</h1>
          <div className="detail-actions">
            <a
              href={`https://console.cloud.google.com/run/detail/${env === "prod" ? "northamerica-northeast1" : "northamerica-northeast1"}/${name}/metrics?project=${env === "prod" ? "antigravity-20260107" : "gandalf-dev-497413"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="cloudrun-link"
              title={t("detail.cloudRunTitle")}
            >
              <ExternalLink size={14} />
              {t("detail.cloudRun")}
            </a>
            <div className="period-toggle">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  className={`period-btn ${period === p.value ? "period-btn-active" : ""}`}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPeriod(period)} // force re-fetch
              className="refresh-btn"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Charts Grid */}
        {loading && !metrics ? (
          <div className="charts-loading">{t("detail.loading")}</div>
        ) : metrics ? (
          <div className="charts-grid">
            <MetricChart
              title={t("detail.requests")}
              data={metrics.requestCount}
              color="#DDCBA4"
              unit="req"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.errors5xx")}
              data={metrics.errorCount}
              color="#ef4444"
              unit="err"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.latencyP50")}
              data={metrics.latencyP50}
              color="#3b82f6"
              unit="ms"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.latencyP99")}
              data={metrics.latencyP99}
              color="#8b5cf6"
              unit="ms"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.instances")}
              data={metrics.instanceCount}
              color="#10b981"
              unit=""
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.cpuP99")}
              data={(metrics.cpuUtilization || []).map(p => ({ ...p, value: p.value * 100 }))}
              color="#f59e0b"
              unit="%"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.memoryP99")}
              data={(metrics.memoryUtilization || []).map(p => ({ ...p, value: p.value * 100 }))}
              color="#ec4899"
              unit="%"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
            <MetricChart
              title={t("detail.billableTime")}
              data={metrics.billableTime || []}
              color="#6366f1"
              unit="s"
              period={period}
              locale={locale}
              emptyLabel={t("detail.chartEmpty")}
            />
          </div>
        ) : (
          <div className="charts-loading">{t("detail.noData")}</div>
        )}
      </main>
    </>
  );
}
