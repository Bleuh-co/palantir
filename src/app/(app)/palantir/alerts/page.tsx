"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, AlertTriangle, CheckCircle, Shield, Clock, Send,
} from "lucide-react";

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
  critical: { icon: "🔴", label: "Critique", cls: "sev-critical" },
  warning: { icon: "🟡", label: "Avertissement", cls: "sev-warning" },
  info: { icon: "🔵", label: "Info", cls: "sev-info" },
};

const TYPE_LABELS: Record<string, string> = {
  error_rate: "Taux d'erreur",
  latency_high: "Latence élevée",
  instance_spike: "Pic d'instances",
  external: "Externe",
  budget: "Budget",
};

export default function AlertsPage() {
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
          reason: ackReason || "Acquitté",
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
    return new Date(iso).toLocaleString("fr-CA", {
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
            Dashboard
          </Link>
          <span className="detail-sep">/</span>
          <span className="detail-current">Alertes</span>
        </div>

        <div className="alerts-header">
          <h1 className="detail-title">
            <Shield size={24} />
            Alertes
          </h1>
          <div className="env-toggle">
            <button
              className={`env-btn ${tab === "active" ? "env-btn-active" : ""}`}
              onClick={() => setTab("active")}
            >
              Actives
            </button>
            <button
              className={`env-btn ${tab === "acknowledged" ? "env-btn-active" : ""}`}
              onClick={() => setTab("acknowledged")}
            >
              Acquittées
            </button>
          </div>
        </div>

        {loading ? (
          <div className="charts-loading">Chargement...</div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} strokeWidth={1} />
            <p>{tab === "active" ? "Aucune alerte active 🎉" : "Aucune alerte acquittée"}</p>
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
                      {TYPE_LABELS[alert.type] || alert.type}
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
                      Acquitté par {alert.acknowledgedBy} — {alert.acknowledgeReason}
                    </p>
                  )}
                  {alert.status === "active" && (
                    <button
                      className="btn-secondary alert-ack-btn"
                      onClick={() => setAckModal(alert)}
                    >
                      Acquitter
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
              <h2 className="modal-title">Acquitter l&apos;alerte</h2>
              <p className="modal-subtitle">
                {ackModal.service} — {ackModal.message}
              </p>
              <label className="label">Raison</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Comportement attendu, faux positif, etc."
                value={ackReason}
                onChange={(e) => setAckReason(e.target.value)}
              />
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  checked={ackSuppress}
                  onChange={(e) => setAckSuppress(e.target.checked)}
                />
                <span>Ne plus alerter pour ce pattern à l&apos;avenir</span>
              </label>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setAckModal(null)}
                >
                  Annuler
                </button>
                <button
                  className="btn-primary"
                  onClick={handleAcknowledge}
                  disabled={ackLoading}
                >
                  <Send size={14} />
                  {ackLoading ? "..." : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
