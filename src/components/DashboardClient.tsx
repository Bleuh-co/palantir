"use client";

import { useEffect, useState, useCallback } from "react";
import { ServiceCard, type ServiceCardData } from "./ServiceCard";
import { AlertBanner } from "./AlertBanner";
import {
  RefreshCw, Shield, Server, AlertTriangle, CheckCircle, Eye,
} from "lucide-react";

type EnvFilter = "all" | "dev" | "prod";

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

export function DashboardClient() {
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [services, setServices] = useState<ServiceCardData[]>([]);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, overviewRes, alertRes] = await Promise.all([
        fetch(`/api/services?env=${envFilter}`),
        fetch("/api/overview"),
        fetch("/api/alerts?status=active"),
      ]);

      if (svcRes.ok) {
        const data = await svcRes.json();
        const sorted = (data.services || []).sort((a: ServiceCardData, b: ServiceCardData) => {
          // Highest consumption first
          const aReq = a.requestsPerMin ?? 0;
          const bReq = b.requestsPerMin ?? 0;
          if (bReq !== aReq) return bReq - aReq;
          // If equal, prod > dev
          if (a.env !== b.env) return a.env === "prod" ? -1 : 1;
          return 0;
        });
        setServices(sorted);
      }
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data);
      }
      if (alertRes.ok) {
        const data = await alertRes.json();
        setAlerts(data.alerts || []);
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
    // Auto-refresh every 60s
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
          {overview && overview.alerts.active > 0 && (
            <div className="status-pill status-pill-alert">
              <Shield size={14} />
              <span>{overview.alerts.active} alerte{overview.alerts.active > 1 ? "s" : ""}</span>
            </div>
          )}
          <div className="status-pill status-pill-total">
            <Server size={14} />
            <span>{totalServices} services</span>
          </div>
        </div>

        <div className="status-actions">
          {/* Env toggle */}
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

      {/* Last refresh */}
      {lastRefresh && (
        <p className="last-refresh">
          <Eye size={12} />
          Dernière mise à jour : {lastRefresh.toLocaleTimeString("fr-CA")}
        </p>
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
