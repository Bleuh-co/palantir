"use client";

/**
 * Mini-système i18n trilingue (FR/EN/ES), piloté par le hub Gandalf.
 *
 * - La langue vient de useGandalf().lang (headers au SSR, postMessage en live).
 * - Clés à plat `section.element` ; repli : fr, puis la clé elle-même.
 * - Interpolation optionnelle : t("alerts.ackBy", { by: "x" }).
 *
 * Modèle xero_photo_achat (src/lib/i18n.ts), inspiré de champs-numerique.
 */

import { useCallback } from "react";
import { useGandalf } from "@bleuh-co/gandalf-sdk-next/client";

export type Lang = "fr" | "en" | "es";

/** Locale de formatage (dates, nombres) par langue. */
export const LANG_LOCALES: Record<Lang, string> = {
  fr: "fr-CA",
  en: "en-CA",
  es: "es",
};

export const MESSAGES: Record<Lang, Record<string, string>> = {
  fr: {
    // Navigation
    "nav.dashboard": "Dashboard",
    "nav.alerts": "Alertes",
    "nav.subtitle": "Groupe Chanv",
    "nav.backToHub": "Retour au Hub",
    "nav.menu": "Menu",

    // Rôles
    "role.superadmin": "Super Administrateur",
    "role.admin": "Administrateur",
    "role.membre": "Membre",
    "role.blocked": "Bloqué",

    // Connexion
    "login.domains": "Connexion réservée aux domaines",
    "login.ssoChecking": "Connexion SSO en cours...",
    "login.loading": "Chargement...",
    "login.signIn": "Se connecter avec Google",
    "login.sessionNote": "Une session s'ouvrira pour 5 jours.",

    // Dashboard — barre d'état
    "dash.ok": "OK",
    "dash.errorOne": "erreur",
    "dash.errorMany": "erreurs",
    "dash.alertOne": "alerte",
    "dash.alertMany": "alertes",
    "dash.services": "services",
    "dash.all": "Tout",
    "dash.refresh": "Rafraîchir",
    "dash.sortBy": "Trier par",
    "dash.sortByTitle": "Trier par {label}",
    "dash.lastRefresh": "Dernière mise à jour :",
    "dash.empty": "Aucun service trouvé",

    // Tri
    "sort.requests": "Requêtes",
    "sort.errors": "Erreurs",
    "sort.latency": "Latence",
    "sort.instances": "Instances",
    "sort.cpu": "CPU",
    "sort.memory": "Mémoire",
    "sort.name": "Nom",

    // Infra (budget + firestore)
    "infra.budget": "Budget",
    "infra.updated": "MAJ:",
    "infra.firestore": "Firestore",
    "infra.readsPerHour": "Lectures/h",
    "infra.writesPerHour": "Écritures/h",
    "infra.deletesPerHour": "Suppressions/h",
    "infra.readsPeak": "Pic lectures",

    // Carte service
    "svc.status.healthy": "OK",
    "svc.status.unhealthy": "Erreur",
    "svc.status.unknown": "Inconnu",
    "svc.alerts": "{n} alerte(s)",
    "svc.requestsPerMin": "Requêtes/min",
    "svc.errorRate": "Taux d'erreur",
    "svc.latencyP50": "Latence P50",
    "svc.activeInstances": "Instances actives",
    "svc.max": "max :",

    // Détail service
    "detail.dashboard": "Dashboard",
    "detail.cloudRun": "Cloud Run",
    "detail.cloudRunTitle": "Ouvrir dans Google Cloud Run Console",
    "detail.loading": "Chargement des métriques...",
    "detail.noData": "Aucune donnée disponible",
    "detail.chartEmpty": "Pas de données",
    "detail.requests": "Requêtes",
    "detail.errors5xx": "Erreurs (5xx)",
    "detail.latencyP50": "Latence P50",
    "detail.latencyP99": "Latence P99",
    "detail.instances": "Instances",
    "detail.cpuP99": "CPU (P99)",
    "detail.memoryP99": "Mémoire (P99)",
    "detail.billableTime": "Temps facturable",

    // Alertes
    "alerts.title": "Alertes",
    "alerts.active": "Actives",
    "alerts.acknowledged": "Acquittées",
    "alerts.loading": "Chargement...",
    "alerts.emptyActive": "Aucune alerte active 🎉",
    "alerts.emptyAck": "Aucune alerte acquittée",
    "alerts.ackBy": "Acquitté par {by} — {reason}",
    "alerts.ackButton": "Acquitter",
    "alerts.modalTitle": "Acquitter l'alerte",
    "alerts.reason": "Raison",
    "alerts.reasonPlaceholder": "Comportement attendu, faux positif, etc.",
    "alerts.reasonDefault": "Acquitté",
    "alerts.suppress": "Ne plus alerter pour ce pattern à l'avenir",
    "alerts.cancel": "Annuler",
    "alerts.confirm": "Confirmer",
    "alerts.sev.critical": "Critique",
    "alerts.sev.warning": "Avertissement",
    "alerts.sev.info": "Info",
    "alerts.type.error_rate": "Taux d'erreur",
    "alerts.type.latency_high": "Latence élevée",
    "alerts.type.instance_spike": "Pic d'instances",
    "alerts.type.external": "Externe",
    "alerts.type.budget": "Budget",

    // Bandeau d'alertes
    "banner.critical": "{n} critique(s)",
    "banner.warning": "{n} avertissement(s)",
    "banner.othersOne": "(+1 autre)",
    "banner.othersMany": "(+{n} autres)",
    "banner.seeAlerts": "Voir les alertes →",

    // Graphiques modaux
    "chart.cost": "Coût ($)",
    "chart.reads": "Lectures",
    "chart.writes": "Écritures",
    "chart.deletes": "Suppressions",
    "chart.budgetMax": "Budget max",
    "chart.currentCost": "Coût actuel",
    "chart.usage": "Utilisation",
    "chart.historyInfo": "L'historique se remplit progressivement à chaque notification GCP.",
    "chart.range.24h": "24H",
    "chart.range.7d": "7J",
    "chart.range.30d": "30J",
    "chart.range.90d": "90J",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.alerts": "Alerts",
    "nav.subtitle": "Groupe Chanv",
    "nav.backToHub": "Back to Hub",
    "nav.menu": "Menu",

    "role.superadmin": "Super Administrator",
    "role.admin": "Administrator",
    "role.membre": "Member",
    "role.blocked": "Blocked",

    "login.domains": "Sign-in restricted to domains",
    "login.ssoChecking": "SSO sign-in in progress...",
    "login.loading": "Loading...",
    "login.signIn": "Sign in with Google",
    "login.sessionNote": "A session will stay open for 5 days.",

    "dash.ok": "OK",
    "dash.errorOne": "error",
    "dash.errorMany": "errors",
    "dash.alertOne": "alert",
    "dash.alertMany": "alerts",
    "dash.services": "services",
    "dash.all": "All",
    "dash.refresh": "Refresh",
    "dash.sortBy": "Sort by",
    "dash.sortByTitle": "Sort by {label}",
    "dash.lastRefresh": "Last updated:",
    "dash.empty": "No services found",

    "sort.requests": "Requests",
    "sort.errors": "Errors",
    "sort.latency": "Latency",
    "sort.instances": "Instances",
    "sort.cpu": "CPU",
    "sort.memory": "Memory",
    "sort.name": "Name",

    "infra.budget": "Budget",
    "infra.updated": "Updated:",
    "infra.firestore": "Firestore",
    "infra.readsPerHour": "Reads/h",
    "infra.writesPerHour": "Writes/h",
    "infra.deletesPerHour": "Deletes/h",
    "infra.readsPeak": "Reads peak",

    "svc.status.healthy": "OK",
    "svc.status.unhealthy": "Error",
    "svc.status.unknown": "Unknown",
    "svc.alerts": "{n} alert(s)",
    "svc.requestsPerMin": "Requests/min",
    "svc.errorRate": "Error rate",
    "svc.latencyP50": "P50 latency",
    "svc.activeInstances": "Active instances",
    "svc.max": "max:",

    "detail.dashboard": "Dashboard",
    "detail.cloudRun": "Cloud Run",
    "detail.cloudRunTitle": "Open in Google Cloud Run Console",
    "detail.loading": "Loading metrics...",
    "detail.noData": "No data available",
    "detail.chartEmpty": "No data",
    "detail.requests": "Requests",
    "detail.errors5xx": "Errors (5xx)",
    "detail.latencyP50": "P50 latency",
    "detail.latencyP99": "P99 latency",
    "detail.instances": "Instances",
    "detail.cpuP99": "CPU (P99)",
    "detail.memoryP99": "Memory (P99)",
    "detail.billableTime": "Billable time",

    "alerts.title": "Alerts",
    "alerts.active": "Active",
    "alerts.acknowledged": "Acknowledged",
    "alerts.loading": "Loading...",
    "alerts.emptyActive": "No active alerts 🎉",
    "alerts.emptyAck": "No acknowledged alerts",
    "alerts.ackBy": "Acknowledged by {by} — {reason}",
    "alerts.ackButton": "Acknowledge",
    "alerts.modalTitle": "Acknowledge alert",
    "alerts.reason": "Reason",
    "alerts.reasonPlaceholder": "Expected behavior, false positive, etc.",
    "alerts.reasonDefault": "Acknowledged",
    "alerts.suppress": "Do not alert for this pattern in the future",
    "alerts.cancel": "Cancel",
    "alerts.confirm": "Confirm",
    "alerts.sev.critical": "Critical",
    "alerts.sev.warning": "Warning",
    "alerts.sev.info": "Info",
    "alerts.type.error_rate": "Error rate",
    "alerts.type.latency_high": "High latency",
    "alerts.type.instance_spike": "Instance spike",
    "alerts.type.external": "External",
    "alerts.type.budget": "Budget",

    "banner.critical": "{n} critical",
    "banner.warning": "{n} warning(s)",
    "banner.othersOne": "(+1 more)",
    "banner.othersMany": "(+{n} more)",
    "banner.seeAlerts": "See alerts →",

    "chart.cost": "Cost ($)",
    "chart.reads": "Reads",
    "chart.writes": "Writes",
    "chart.deletes": "Deletes",
    "chart.budgetMax": "Budget cap",
    "chart.currentCost": "Current cost",
    "chart.usage": "Usage",
    "chart.historyInfo": "History fills in progressively with each GCP notification.",
    "chart.range.24h": "24H",
    "chart.range.7d": "7D",
    "chart.range.30d": "30D",
    "chart.range.90d": "90D",
  },
  es: {
    "nav.dashboard": "Panel",
    "nav.alerts": "Alertas",
    "nav.subtitle": "Groupe Chanv",
    "nav.backToHub": "Volver al Hub",
    "nav.menu": "Menú",

    "role.superadmin": "Superadministrador",
    "role.admin": "Administrador",
    "role.membre": "Miembro",
    "role.blocked": "Bloqueado",

    "login.domains": "Acceso reservado a los dominios",
    "login.ssoChecking": "Conexión SSO en curso...",
    "login.loading": "Cargando...",
    "login.signIn": "Iniciar sesión con Google",
    "login.sessionNote": "La sesión permanecerá abierta 5 días.",

    "dash.ok": "OK",
    "dash.errorOne": "error",
    "dash.errorMany": "errores",
    "dash.alertOne": "alerta",
    "dash.alertMany": "alertas",
    "dash.services": "servicios",
    "dash.all": "Todo",
    "dash.refresh": "Actualizar",
    "dash.sortBy": "Ordenar por",
    "dash.sortByTitle": "Ordenar por {label}",
    "dash.lastRefresh": "Última actualización:",
    "dash.empty": "No se encontraron servicios",

    "sort.requests": "Solicitudes",
    "sort.errors": "Errores",
    "sort.latency": "Latencia",
    "sort.instances": "Instancias",
    "sort.cpu": "CPU",
    "sort.memory": "Memoria",
    "sort.name": "Nombre",

    "infra.budget": "Presupuesto",
    "infra.updated": "Actualizado:",
    "infra.firestore": "Firestore",
    "infra.readsPerHour": "Lecturas/h",
    "infra.writesPerHour": "Escrituras/h",
    "infra.deletesPerHour": "Eliminaciones/h",
    "infra.readsPeak": "Pico de lecturas",

    "svc.status.healthy": "OK",
    "svc.status.unhealthy": "Error",
    "svc.status.unknown": "Desconocido",
    "svc.alerts": "{n} alerta(s)",
    "svc.requestsPerMin": "Solicitudes/min",
    "svc.errorRate": "Tasa de errores",
    "svc.latencyP50": "Latencia P50",
    "svc.activeInstances": "Instancias activas",
    "svc.max": "máx:",

    "detail.dashboard": "Panel",
    "detail.cloudRun": "Cloud Run",
    "detail.cloudRunTitle": "Abrir en la consola de Google Cloud Run",
    "detail.loading": "Cargando métricas...",
    "detail.noData": "No hay datos disponibles",
    "detail.chartEmpty": "Sin datos",
    "detail.requests": "Solicitudes",
    "detail.errors5xx": "Errores (5xx)",
    "detail.latencyP50": "Latencia P50",
    "detail.latencyP99": "Latencia P99",
    "detail.instances": "Instancias",
    "detail.cpuP99": "CPU (P99)",
    "detail.memoryP99": "Memoria (P99)",
    "detail.billableTime": "Tiempo facturable",

    "alerts.title": "Alertas",
    "alerts.active": "Activas",
    "alerts.acknowledged": "Confirmadas",
    "alerts.loading": "Cargando...",
    "alerts.emptyActive": "Sin alertas activas 🎉",
    "alerts.emptyAck": "Sin alertas confirmadas",
    "alerts.ackBy": "Confirmada por {by} — {reason}",
    "alerts.ackButton": "Confirmar alerta",
    "alerts.modalTitle": "Confirmar la alerta",
    "alerts.reason": "Motivo",
    "alerts.reasonPlaceholder": "Comportamiento esperado, falso positivo, etc.",
    "alerts.reasonDefault": "Confirmada",
    "alerts.suppress": "No alertar más para este patrón en el futuro",
    "alerts.cancel": "Cancelar",
    "alerts.confirm": "Confirmar",
    "alerts.sev.critical": "Crítica",
    "alerts.sev.warning": "Advertencia",
    "alerts.sev.info": "Info",
    "alerts.type.error_rate": "Tasa de errores",
    "alerts.type.latency_high": "Latencia alta",
    "alerts.type.instance_spike": "Pico de instancias",
    "alerts.type.external": "Externa",
    "alerts.type.budget": "Presupuesto",

    "banner.critical": "{n} crítica(s)",
    "banner.warning": "{n} advertencia(s)",
    "banner.othersOne": "(+1 más)",
    "banner.othersMany": "(+{n} más)",
    "banner.seeAlerts": "Ver las alertas →",

    "chart.cost": "Costo ($)",
    "chart.reads": "Lecturas",
    "chart.writes": "Escrituras",
    "chart.deletes": "Eliminaciones",
    "chart.budgetMax": "Presupuesto máx.",
    "chart.currentCost": "Costo actual",
    "chart.usage": "Uso",
    "chart.historyInfo": "El historial se completa progresivamente con cada notificación de GCP.",
    "chart.range.24h": "24H",
    "chart.range.7d": "7D",
    "chart.range.30d": "30D",
    "chart.range.90d": "90D",
  },
};

type Vars = Record<string, string | number>;

function format(s: string, vars?: Vars): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * Hook client : t(key) → traduction dans la langue live du hub Gandalf.
 * Repli : fr, puis la clé elle-même. Interpolation {var} optionnelle.
 */
export function useT(): (key: string, vars?: Vars) => string {
  const { lang } = useGandalf();
  return useCallback(
    (key: string, vars?: Vars) =>
      format(MESSAGES[lang]?.[key] ?? MESSAGES.fr[key] ?? key, vars),
    [lang],
  );
}

/** Locale de formatage courante (dates, nombres), alignée sur la langue du hub. */
export function useLocale(): string {
  const { lang } = useGandalf();
  return LANG_LOCALES[lang] ?? LANG_LOCALES.fr;
}
