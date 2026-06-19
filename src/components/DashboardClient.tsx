"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ServiceCard, type ServiceCardData } from "./ServiceCard";
import { AlertBanner } from "./AlertBanner";
import { SparkLine } from "./SparkLine";
import {
  RefreshCw, Shield, Server, AlertTriangle, CheckCircle, Eye,
  ArrowUpDown, ArrowUp, ArrowDown, Database, DollarSign,
} from "lucide-react";

type EnvFilter = "all" | "dev" | "prod";

type SortField = "requests" | "errors" | "latency" | "instances" | "cpu" | "memory" | "name";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string; icon: string }[] = [
  { value: "requests", label: "Requêtes", icon: "⚡" },
  { value: "errors", label: "Erreurs", icon: "⚠️" },
  { value: "latency", label: "Latence", icon: "⏱️" },
  { value: "instances", label: "Instances", icon: "📦" },
  { value: "cpu", label: "CPU", icon: "🔧" },
  { value: "memory", label: "Mémoire", icon: "💾" },
  { value: "name", label: "Nom", icon: "🏷️" },
];

function parseCpu(cpu: string): number {
  const n = parseFloat(cpu);
  return isNaN(n) ? 0 : n;
}

function parseMemory(mem: string): number {
  const match = mem.match(/([\d.]+)\s*(Gi|Mi|G|M)?/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || "Mi").toLowerCase();
  if (unit.startsWith("g")) return val * 1024;
  return val;
}

function sortServices(services: ServiceCardData[], field: SortField, dir: SortDir): ServiceCardData[] {
  const sorted = [...services].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "requests":
        cmp = (a.requestsPerMin ?? 0) - (b.requestsPerMin ?? 0);
        break;
      case "errors":
        cmp = (a.errorRate ?? 0) - (b.errorRate ?? 0);
        break;
      case "latency":
        cmp = (a.latencyP50Ms ?? 0) - (b.latencyP50Ms ?? 0);
        break;
      case "instances":
        cmp = (a.instanceCount ?? 0) - (b.instanceCount ?? 0);
        break;
      case "cpu":
        cmp = parseCpu(a.cpu) - parseCpu(b.cpu);
        break;
      case "memory":
        cmp = parseMemory(a.memory) - parseMemory(b.memory);
        break;
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
    }
    // Secondary sort: prod > dev
    if (cmp === 0 && a.env !== b.env) return a.env === "prod" ? -1 : 1;
    return cmp;
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}

interface OverviewData {
  dev: { total: number; healthy: number; unhealthy: number; unknown: number };
  prod: { total: number; healthy: number; unhealthy: number; unknown: number };
  alerts: { active: number; critical: number; warning: number };
  updatedAt: string;
}

interface AlertItem {
  id: string;
  service: string;
  env: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  createdAt: string;
}

interface FirestoreEnvData {
  readsLastHour: number;
  writesLastHour: number;
  deletesLastHour: number;
  readsPeak: number;
  sparkline: number[];
}

interface BudgetData {
  cost: number;
  budget: number;
  pct: number;
  currency: string;
  lastNotifiedPct: number;
  updatedAt: string;
}

export function DashboardClient() {
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [rawServices, setRawServices] = useState<ServiceCardData[]>([]);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [firestore, setFirestore] = useState<Record<string, FirestoreEnvData>>({});
  const [budgets, setBudgets] = useState<Record<string, BudgetData>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [sortField, setSortField] = useState<SortField>("requests");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const services = useMemo(
    () => sortServices(rawServices, sortField, sortDir),
    [rawServices, sortField, sortDir]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, overviewRes, alertRes, fsRes, billingRes] = await Promise.all([
        fetch(`/api/services?env=${envFilter}`),
        fetch("/api/overview"),
        fetch("/api/alerts?status=active"),
        fetch(`/api/firestore?env=${envFilter}&mode=quick`),
        fetch("/api/billing/status"),
      ]);

      if (svcRes.ok) {
        const data = await svcRes.json();
        setRawServices(data.services || []);
      }
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data);
      }
      if (alertRes.ok) {
        const data = await alertRes.json();
        setAlerts(data.alerts || []);
      }
      if (fsRes.ok) {
        const data = await fsRes.json();
        setFirestore(data.firestore || {});
      }
      if (billingRes.ok) {
        const data = await billingRes.json();
        setBudgets(data.budgets || {});
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [envFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalHealthy = overview
    ? overview.dev.healthy + overview.prod.healthy
    : 0;
  const totalUnhealthy = overview
    ? overview.dev.unhealthy + overview.prod.unhealthy
    : 0;
  const totalServices = overview
    ? overview.dev.total + overview.prod.total
    : 0;

  return (
    <div className="dashboard">
      {/* Alert Banner */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-pills">
          <div className="status-pill status-pill-ok">
            <CheckCircle size={14} />
            <span>{totalHealthy} OK</span>
          </div>
          {totalUnhealthy > 0 && (
            <div className="status-pill status-pill-error">
              <AlertTriangle size={14} />
              <span>{totalUnhealthy} erreur{totalUnhealthy > 1 ? "s" : ""}</span>
            </div>
          )}
          <a href="/alertes" className={`status-pill ${overview && overview.alerts.active > 0 ? "status-pill-alert" : "status-pill-neutral"}`} style={{ textDecoration: "none" }}>
            <Shield size={14} />
            <span>{overview?.alerts.active || 0} alerte{(overview?.alerts.active || 0) !== 1 ? "s" : ""}</span>
          </a>
          <div className="status-pill status-pill-total">
            <Server size={14} />
            <span>{totalServices} services</span>
          </div>
        </div>

        <div className="status-actions">
          <div className="env-toggle">
            {(["all", "dev", "prod"] as EnvFilter[]).map((env) => (
              <button
                key={env}
                className={`env-btn ${envFilter === env ? "env-btn-active" : ""}`}
                onClick={() => setEnvFilter(env)}
              >
                {env === "all" ? "Tout" : env.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            className="refresh-btn"
            disabled={loading}
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="sort-bar">
        <div className="sort-label">
          <ArrowUpDown size={12} />
          <span>Trier par</span>
        </div>
        <div className="sort-options">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`sort-btn ${sortField === opt.value ? "sort-btn-active" : ""}`}
              onClick={() => toggleSort(opt.value)}
              title={`Trier par ${opt.label}`}
            >
              <span className="sort-btn-icon">{opt.icon}</span>
              <span className="sort-btn-label">{opt.label}</span>
              {sortField === opt.value && (
                sortDir === "desc"
                  ? <ArrowDown size={11} className="sort-dir-icon" />
                  : <ArrowUp size={11} className="sort-dir-icon" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Last refresh */}
      {lastRefresh && (
        <p className="last-refresh">
          <Eye size={12} />
          Dernière mise à jour : {lastRefresh.toLocaleTimeString("fr-CA")}
        </p>
      )}

      {/* Infrastructure Row: Budget + Firestore side by side */}
      {(Object.keys(budgets).length > 0 || Object.keys(firestore).length > 0) && (
        <div className="infra-row">
          {/* Budget */}
          {Object.keys(budgets).length > 0 && (
            <div className="billing-section">
              <h3 className="section-title">
                <DollarSign size={16} />
                Budget
              </h3>
              <div className="billing-cards">
                {Object.entries(budgets).map(([key, b]) => {
                  const barColor = b.pct >= 100 ? "#ef4444" : b.pct >= 80 ? "#f59e0b" : "#10b981";
                  const displayName = key.replace(/^budget-/, "").replace(/-/g, " ");
                  return (
                    <div key={key} className="billing-card">
                      <div className="billing-header">
                        <span className="billing-name">{displayName}</span>
                        <span className="billing-pct" style={{ color: barColor }}>{b.pct}%</span>
                      </div>
                      <div className="billing-bar-track">
                        <div
                          className="billing-bar-fill"
                          style={{ width: `${Math.min(b.pct, 100)}%`, backgroundColor: barColor }}
                        />
                        {b.pct > 100 && (
                          <div
                            className="billing-bar-overflow"
                            style={{ width: `${Math.min(b.pct - 100, 100)}%` }}
                          />
                        )}
                      </div>
                      <div className="billing-details">
                        <span className="billing-cost" style={{ color: barColor }}>
                          ${b.cost.toFixed(2)} {b.currency}
                        </span>
                        <span className="billing-budget">
                          / ${b.budget.toFixed(2)} {b.currency}
                        </span>
                      </div>
                      {b.updatedAt && (
                        <span className="billing-updated">
                          MAJ: {new Date(b.updatedAt).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Firestore */}
          {Object.keys(firestore).length > 0 && (
            <div className="firestore-section">
              <h3 className="section-title">
                <Database size={16} />
                Firestore
              </h3>
              <div className="firestore-cards">
                {Object.entries(firestore).map(([env, data]) => {
                  const readColor = data.readsLastHour > 1_000_000 ? "#ef4444"
                    : data.readsLastHour > 100_000 ? "#f59e0b" : "#10b981";
                  const writeColor = data.writesLastHour > 500_000 ? "#ef4444"
                    : data.writesLastHour > 50_000 ? "#f59e0b" : "#10b981";
                  return (
                    <div key={env} className="firestore-card">
                      <div className="fs-card-header">
                        <span className={`sc-env-badge sc-env-${env}`}>{env.toUpperCase()}</span>
                      </div>
                      <div className="fs-sparkline">
                        <SparkLine
                          data={data.sparkline || []}
                          width={200}
                          height={40}
                          color={readColor}
                          strokeWidth={1.5}
                        />
                      </div>
                      <div className="fs-metrics">
                        <div className="fs-metric">
                          <span className="fs-metric-label">Lectures/h</span>
                          <span className="fs-metric-value" style={{ color: readColor }}>
                            {data.readsLastHour.toLocaleString("fr-CA")}
                          </span>
                        </div>
                        <div className="fs-metric">
                          <span className="fs-metric-label">Écritures/h</span>
                          <span className="fs-metric-value" style={{ color: writeColor }}>
                            {data.writesLastHour.toLocaleString("fr-CA")}
                          </span>
                        </div>
                        <div className="fs-metric">
                          <span className="fs-metric-label">Suppressions/h</span>
                          <span className="fs-metric-value">
                            {data.deletesLastHour.toLocaleString("fr-CA")}
                          </span>
                        </div>
                        <div className="fs-metric">
                          <span className="fs-metric-label">Pic lectures</span>
                          <span className="fs-metric-value" style={{ color: data.readsPeak > 1_000_000 ? "#ef4444" : undefined }}>
                            {data.readsPeak.toLocaleString("fr-CA")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Service Grid */}
      {loading && services.length === 0 ? (
        <div className="loading-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="services-grid">
          {services.map((svc) => (
            <ServiceCard key={`${svc.env}-${svc.name}`} data={svc} />
          ))}
        </div>
      )}

      {!loading && services.length === 0 && (
        <div className="empty-state">
          <Server size={48} strokeWidth={1} />
          <p>Aucun service trouvé</p>
        </div>
      )}
    </div>
  );
}
