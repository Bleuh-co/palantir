"use client";

import { useEffect, useState, useCallback } from "react";
import { X, TrendingUp, Database } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface BudgetPoint {
  timestamp: string;
  cost: number;
  budget: number;
  pct: number;
  currency: string;
}

interface FirestorePoint {
  time: string;
  value: number;
}

interface FirestoreChartData {
  reads: FirestorePoint[];
  writes: FirestorePoint[];
  deletes: FirestorePoint[];
}

type Range = "24h" | "7d" | "30d" | "90d";

interface MetricChartProps {
  type: "budget" | "firestore";
  chartKey: string;
  budgetData?: { cost: number; budget: number; pct: number; currency: string };
  onClose: () => void;
}

// ── SVG Chart Renderer ───────────────────────────────────────────────

function SVGLineChart({
  datasets,
  width = 700,
  height = 300,
  thresholdLine,
  thresholdLabel,
}: {
  datasets: { points: { x: number; y: number }[]; color: string; label: string }[];
  width?: number;
  height?: number;
  thresholdLine?: number;
  thresholdLabel?: string;
}) {
  const padding = { top: 30, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Calculate Y bounds across all datasets
  const allY = datasets.flatMap((d) => d.points.map((p) => p.y));
  if (thresholdLine !== undefined) allY.push(thresholdLine);
  const minY = 0;
  const maxY = Math.max(...allY, 1) * 1.1;

  // Calculate X bounds
  const allX = datasets.flatMap((d) => d.points.map((p) => p.x));
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const rangeX = maxX - minX || 1;

  const scaleX = (x: number) => padding.left + ((x - minX) / rangeX) * chartW;
  const scaleY = (y: number) => padding.top + chartH - ((y - minY) / (maxY - minY)) * chartH;

  // Y axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) / 4) * i);

  // X axis labels (6 ticks)
  const xTicks = Array.from({ length: 6 }, (_, i) => minX + (rangeX / 5) * i);

  // Determine time format based on range
  const totalHours = rangeX / (3600 * 1000);
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    if (totalHours <= 48) {
      return d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
  };

  const formatY = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(v < 10 ? 2 : 0);
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="metric-chart-svg">
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <g key={`y-${i}`}>
          <line
            x1={padding.left} y1={scaleY(v)}
            x2={width - padding.right} y2={scaleY(v)}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
          />
          <text
            x={padding.left - 8} y={scaleY(v) + 4}
            fill="rgba(255,255,255,0.4)" fontSize={11} textAnchor="end"
          >
            {formatY(v)}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {xTicks.map((v, i) => (
        <text
          key={`x-${i}`}
          x={scaleX(v)} y={height - 8}
          fill="rgba(255,255,255,0.4)" fontSize={10} textAnchor="middle"
        >
          {formatTime(v)}
        </text>
      ))}

      {/* Threshold line */}
      {thresholdLine !== undefined && (
        <g>
          <line
            x1={padding.left} y1={scaleY(thresholdLine)}
            x2={width - padding.right} y2={scaleY(thresholdLine)}
            stroke="rgba(239,68,68,0.6)" strokeWidth={1} strokeDasharray="6,4"
          />
          {thresholdLabel && (
            <text
              x={width - padding.right - 4} y={scaleY(thresholdLine) - 6}
              fill="rgba(239,68,68,0.8)" fontSize={10} textAnchor="end"
            >
              {thresholdLabel}
            </text>
          )}
        </g>
      )}

      {/* Data lines */}
      {datasets.map((ds, di) => {
        if (ds.points.length < 2) return null;
        const pathD = ds.points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.x)} ${scaleY(p.y)}`)
          .join(" ");

        // Area fill
        const areaD =
          pathD +
          ` L ${scaleX(ds.points[ds.points.length - 1].x)} ${scaleY(0)}` +
          ` L ${scaleX(ds.points[0].x)} ${scaleY(0)} Z`;

        return (
          <g key={di}>
            <path d={areaD} fill={ds.color} opacity={0.08} />
            <path d={pathD} fill="none" stroke={ds.color} strokeWidth={2} />
            {/* Legend dot */}
            <circle cx={padding.left + 10 + di * 100} cy={12} r={4} fill={ds.color} />
            <text
              x={padding.left + 18 + di * 100} y={16}
              fill="rgba(255,255,255,0.7)" fontSize={11}
            >
              {ds.label}
            </text>
          </g>
        );
      })}

      {/* Empty state */}
      {datasets.every((d) => d.points.length === 0) && (
        <text
          x={width / 2} y={height / 2}
          fill="rgba(255,255,255,0.3)" fontSize={14} textAnchor="middle"
        >
          Aucune donnée pour cette période
        </text>
      )}
    </svg>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function MetricChart({ type, chartKey, budgetData, onClose }: MetricChartProps) {
  const [range, setRange] = useState<Range>("7d");
  const [loading, setLoading] = useState(true);
  const [budgetPoints, setBudgetPoints] = useState<BudgetPoint[]>([]);
  const [firestoreData, setFirestoreData] = useState<FirestoreChartData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (type === "budget") {
        const res = await fetch(`/api/billing/history?budget=${encodeURIComponent(chartKey)}&range=${range}`);
        if (res.ok) {
          const data = await res.json();
          setBudgetPoints(data.points || []);
        }
      } else {
        // Firestore: use Cloud Monitoring API (free)
        const periodMap: Record<Range, string> = {
          "24h": "24h",
          "7d": "7d",
          "30d": "7d", // Cloud Monitoring max is 7d for this granularity
          "90d": "7d",
        };
        const res = await fetch(`/api/firestore?env=${chartKey}&period=${periodMap[range]}&mode=full`);
        if (res.ok) {
          const data = await res.json();
          const fsData = data.firestore?.[chartKey];
          if (fsData) {
            setFirestoreData({
              reads: fsData.reads || [],
              writes: fsData.writes || [],
              deletes: fsData.deletes || [],
            });
          }
        }
      }
    } catch (err) {
      console.error("Chart fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [type, chartKey, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build chart datasets
  const datasets = type === "budget"
    ? [{
        label: "Coût ($)",
        color: "#10b981",
        points: budgetPoints.map((p) => ({
          x: new Date(p.timestamp).getTime(),
          y: p.cost,
        })),
      }]
    : firestoreData
      ? [
          {
            label: "Lectures",
            color: "#3b82f6",
            points: (firestoreData.reads || []).map((p) => ({
              x: new Date(p.time).getTime(),
              y: p.value,
            })),
          },
          {
            label: "Écritures",
            color: "#f59e0b",
            points: (firestoreData.writes || []).map((p) => ({
              x: new Date(p.time).getTime(),
              y: p.value,
            })),
          },
          {
            label: "Suppressions",
            color: "#ef4444",
            points: (firestoreData.deletes || []).map((p) => ({
              x: new Date(p.time).getTime(),
              y: p.value,
            })),
          },
        ]
      : [];

  const displayName = type === "budget"
    ? chartKey.replace(/^budget-/, "").replace(/-/g, " ")
    : `Firestore ${chartKey.toUpperCase()}`;

  const ranges: Range[] = type === "budget"
    ? ["24h", "7d", "30d", "90d"]
    : ["24h", "7d"]; // Firestore limited by Cloud Monitoring API retention

  return (
    <div className="metric-chart-overlay" onClick={onClose}>
      <div className="metric-chart-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="metric-chart-header">
          <div className="metric-chart-title-row">
            {type === "budget" ? <TrendingUp size={18} /> : <Database size={18} />}
            <h3>{displayName}</h3>
          </div>
          <button className="metric-chart-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Summary stats */}
        {type === "budget" && budgetData && (
          <div className="metric-chart-summary">
            <div className="metric-chart-stat">
              <span className="metric-chart-stat-label">Coût actuel</span>
              <span className="metric-chart-stat-value" style={{
                color: budgetData.pct >= 100 ? "#ef4444" : budgetData.pct >= 80 ? "#f59e0b" : "#10b981"
              }}>
                ${budgetData.cost.toFixed(2)} {budgetData.currency}
              </span>
            </div>
            <div className="metric-chart-stat">
              <span className="metric-chart-stat-label">Budget</span>
              <span className="metric-chart-stat-value">
                ${budgetData.budget.toFixed(2)} {budgetData.currency}
              </span>
            </div>
            <div className="metric-chart-stat">
              <span className="metric-chart-stat-label">Utilisation</span>
              <span className="metric-chart-stat-value" style={{
                color: budgetData.pct >= 100 ? "#ef4444" : budgetData.pct >= 80 ? "#f59e0b" : "#10b981"
              }}>
                {budgetData.pct}%
              </span>
            </div>
          </div>
        )}

        {/* Range toggles */}
        <div className="metric-chart-ranges">
          {ranges.map((r) => (
            <button
              key={r}
              className={`metric-chart-range-btn ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r === "24h" ? "24H" : r === "7d" ? "7J" : r === "30d" ? "30J" : "90J"}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="metric-chart-body">
          {loading ? (
            <div className="metric-chart-loading">Chargement...</div>
          ) : (
            <SVGLineChart
              datasets={datasets}
              thresholdLine={type === "budget" && budgetData ? budgetData.budget : undefined}
              thresholdLabel={type === "budget" ? "Budget max" : undefined}
            />
          )}
        </div>

        {/* Info */}
        {type === "budget" && budgetPoints.length === 0 && !loading && (
          <p className="metric-chart-info">
            L&apos;historique se remplit progressivement à chaque notification GCP.
          </p>
        )}
      </div>
    </div>
  );
}
