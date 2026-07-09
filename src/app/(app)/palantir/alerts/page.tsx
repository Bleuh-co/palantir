"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, AlertTriangle, CheckCircle, Shield, Clock, Send,
} from "lucide-react";
import { useT, useLocale } from "@/lib/i18n";

interface Alert {
  id: string;
  service: string;
  env: string;
  type: string;
  severity: "critical" | "warning" | "info";
  status: "active" | "acknowledged";
  message: string;
  value: number;
  threshold: number;
  createdAt: string;
  acknowledgedBy?: string;
  acknowledgeReason?: string;
  acknowledgedAt?: string;
}

type Tab = "active" | "acknowledged";

const SEVERITY_CONFIG = {
  critical: { icon: "🔴", labelKey: "alerts.sev.critical", cls: "sev-critical" },
  warning: { icon: "🟡", labelKey: "alerts.sev.warning", cls: "sev-warning" },
  info: { icon: "🔵", labelKey: "alerts.sev.info", cls: "sev-info" },
};

const TYPE_KEYS: Record<string, string> = {
  error_rate: "alerts.type.error_rate",
  latency_high: "alerts.type.latency_high",
  instance_spike: "alerts.type.instance_spike",
  external: "alerts.type.external",
  budget: "alerts.type.budget",
};

export default function AlertsPage() {
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("active");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackModal, setAckModal] = useState<Alert | null>(null);
  const [ackReason, setAckReason] = useState("");
  const [ackSuppress, setAckSuppress] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);

  async function loadAlerts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts?status=${tab}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, [tab]);

  async function handleAcknowledge() {
    if (!ackModal) return;
    setAckLoading(true);
    try {
      const res = await fetch(`/api/alerts/${ackModal.id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: ackReason || t("alerts.reasonDefault"),
          suppressFuture: ackSuppress,
        }),
      });
      if (res.ok) {
        setAckModal(null);
        setAckReason("");
        setAckSuppress(false);
        loadAlerts();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAckLoading(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <>
      <main className="dashboard-main">
        <div className="detail-breadcrumb">
          <Link href="/palantir" className="detail-back">
            <ArrowLeft size={16} />
            {t("detail.dashboard")}
          </Link>
          <span className="detail-sep">/</span>
          <span className="detail-current">{t("alerts.title")}</span>
        </div>

        <div className="alerts-header">
          <h1 className="detail-title">
            <Shield size={24} />
            {t("alerts.title")}
          </h1>
          <div className="env-toggle">
            <button
              className={`env-btn ${tab === "active" ? "env-btn-active" : ""}`}
              onClick={() => setTab("active")}
            >
              {t("alerts.active")}
            </button>
            <button
              className={`env-btn ${tab === "acknowledged" ? "env-btn-active" : ""}`}
              onClick={() => setTab("acknowledged")}
            >
              {t("alerts.acknowledged")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="charts-loading">{t("alerts.loading")}</div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} strokeWidth={1} />
            <p>{tab === "active" ? t("alerts.emptyActive") : t("alerts.emptyAck")}</p>
          </div>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert) => {
              const sev = SEVERITY_CONFIG[alert.severity];
              return (
                <div key={alert.id} className={`alert-item ${sev.cls}`}>
                  <div className="alert-item-header">
                    <span className="alert-sev-icon">{sev.icon}</span>
                    <span className="alert-service-name">
                      {alert.service}
                      <span className={`sc-env-badge sc-env-${alert.env}`}>
                        {alert.env.toUpperCase()}
                      </span>
                    </span>
                    <span className="alert-type-badge">
                      {TYPE_KEYS[alert.type] ? t(TYPE_KEYS[alert.type]) : alert.type}
                    </span>
                    <span className="alert-time">
                      <Clock size={12} />
                      {formatDate(alert.createdAt)}
                    </span>
                  </div>
                  <p className="alert-message">{alert.message}</p>
                  {alert.status === "acknowledged" && (
                    <p className="alert-ack-info">
                      <CheckCircle size={12} />
                      {t("alerts.ackBy", { by: alert.acknowledgedBy || "?", reason: alert.acknowledgeReason || "" })}
                    </p>
                  )}
                  {alert.status === "active" && (
                    <button
                      className="btn-secondary alert-ack-btn"
                      onClick={() => setAckModal(alert)}
                    >
                      {t("alerts.ackButton")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Acknowledge Modal */}
        {ackModal && (
          <div className="modal-overlay" onClick={() => setAckModal(null)}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">{t("alerts.modalTitle")}</h2>
              <p className="modal-subtitle">
                {ackModal.service} — {ackModal.message}
              </p>
              <label className="label">{t("alerts.reason")}</label>
              <textarea
                className="input"
                rows={3}
                placeholder={t("alerts.reasonPlaceholder")}
                value={ackReason}
                onChange={(e) => setAckReason(e.target.value)}
              />
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  checked={ackSuppress}
                  onChange={(e) => setAckSuppress(e.target.checked)}
                />
                <span>{t("alerts.suppress")}</span>
              </label>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setAckModal(null)}
                >
                  {t("alerts.cancel")}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleAcknowledge}
                  disabled={ackLoading}
                >
                  <Send size={14} />
                  {ackLoading ? "..." : t("alerts.confirm")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
