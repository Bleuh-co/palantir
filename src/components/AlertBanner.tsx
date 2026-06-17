"use client";

import { AlertTriangle, CheckCircle, X } from "lucide-react";
import { useState } from "react";

interface AlertItem {
  id: string;
  service: string;
  env: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  createdAt: string;
}

interface AlertBannerProps {
  alerts: AlertItem[];
  onDismiss?: (id: string) => void;
}

export function AlertBanner({ alerts, onDismiss }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const critical = visible.filter((a) => a.severity === "critical");
  const warnings = visible.filter((a) => a.severity === "warning");
  const isCritical = critical.length > 0;

  return (
    <div className={`alert-banner ${isCritical ? "alert-banner-critical" : "alert-banner-warning"}`}>
      <div className="alert-banner-icon">
        {isCritical ? <AlertTriangle size={20} /> : <AlertTriangle size={20} />}
      </div>
      <div className="alert-banner-content">
        <strong>
          {critical.length > 0 && `${critical.length} critique(s)`}
          {critical.length > 0 && warnings.length > 0 && " · "}
          {warnings.length > 0 && `${warnings.length} avertissement(s)`}
        </strong>
        <span className="alert-banner-detail">
          {visible[0].message}
          {visible.length > 1 && ` (+${visible.length - 1} autre${visible.length > 2 ? "s" : ""})`}
        </span>
      </div>
      <a href="/palantir/alerts" className="alert-banner-link">
        Voir les alertes →
      </a>
    </div>
  );
}
