"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";

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
  const t = useT();
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
          {critical.length > 0 && t("banner.critical", { n: critical.length })}
          {critical.length > 0 && warnings.length > 0 && " · "}
          {warnings.length > 0 && t("banner.warning", { n: warnings.length })}
        </strong>
        <span className="alert-banner-detail">
          {visible[0].message}
          {visible.length > 1 && ` ${t(visible.length > 2 ? "banner.othersMany" : "banner.othersOne", { n: visible.length - 1 })}`}
        </span>
      </div>
      <a href="/palantir/alerts" className="alert-banner-link">
        {t("banner.seeAlerts")}
      </a>
    </div>
  );
}
