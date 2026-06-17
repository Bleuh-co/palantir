import "server-only";

/**
 * Palantir → Apps Hub Push Notification
 *
 * Sends notifications via the Hub's POST /api/notifications endpoint.
 * Uses the same pattern as GestionnaireCOA, Studio-Chanv, elearning, etc.
 *
 * Auth: X-Notif-Key header with NOTIF_API_KEY secret.
 * The Hub's NotifWatcher polls every 30s for new notifications,
 * enriches with Gemini Flash, and dispatches Web Push to subscribed devices.
 */

const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL ||
  "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app";
const NOTIF_KEY = process.env.NOTIF_API_KEY || "";

interface NotifPayload {
  user_email: string;
  source: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Send a single push notification via Apps Hub.
 * Best-effort: never throws, just logs warnings.
 */
export async function sendHubNotification(payload: NotifPayload): Promise<boolean> {
  if (!NOTIF_KEY) {
    console.warn("[Notify] NOTIF_API_KEY not set — skipping notification");
    return false;
  }

  try {
    const res = await fetch(`${HUB_URL}/api/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notif-key": NOTIF_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[Notify] Hub returned ${res.status}: ${text}`);
      return false;
    }

    return true;
  } catch (e: unknown) {
    console.warn("[Notify] Hub push failed (best-effort):", (e as Error).message);
    return false;
  }
}

// ── Alert-specific notification helpers ─────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  warning: "🟡",
  info: "🔵",
};

/**
 * Notify Palantir Super Administrateurs about a new critical alert.
 * Looks up users via user_app_roles collection (same as auth-server.ts).
 * Also always includes bootstrap admins.
 */
export async function notifyAlertToAdmins(alert: {
  service: string;
  env: string;
  severity: string;
  message: string;
  type: string;
}): Promise<number> {
  const { adminDb } = await import("./firebase-admin");
  const db = adminDb();

  const BOOTSTRAP_ADMINS = ["t.matteucci@chanv.com", "mathieu@lafeuilleverte.ca"];

  // Resolve Palantir app ID (same logic as auth-server.ts)
  let palantirAppId = process.env.PALANTIR_APP_ID || "";
  if (!palantirAppId) {
    try {
      const appsSnap = await db.collection("apps").get();
      const match = appsSnap.docs.find((d: FirebaseFirestore.QueryDocumentSnapshot) => {
        const name = (d.data().name || "").toLowerCase().replace(/\s+/g, "");
        return name.includes("palantir");
      });
      palantirAppId = match?.id || "";
    } catch {
      /* ignore */
    }
  }

  // Collect target emails: start with bootstrap admins
  const targetEmails = new Set<string>(BOOTSTRAP_ADMINS);

  // Query user_app_roles for Super Administrateur on Palantir
  if (palantirAppId) {
    try {
      const rolesSnap = await db
        .collection("user_app_roles")
        .where("appId", "==", palantirAppId)
        .where("role", "==", "Super Administrateur")
        .get();

      for (const doc of rolesSnap.docs) {
        const email = doc.data().email;
        if (email) targetEmails.add(email.toLowerCase());
      }
    } catch (e: unknown) {
      console.warn("[Notify] user_app_roles query failed:", (e as Error).message);
    }
  }

  if (targetEmails.size === 0) {
    console.warn("[Notify] No Palantir Super Admins found");
    return 0;
  }

  const emoji = SEVERITY_EMOJI[alert.severity] || "⚠️";
  const envLabel = alert.env.toUpperCase();
  const title = `${emoji} Palantir — ${alert.service} [${envLabel}]`;
  const body = alert.message;
  const url = `/palantir/${alert.service}?env=${alert.env}`;

  let sent = 0;
  for (const email of targetEmails) {
    const ok = await sendHubNotification({
      user_email: email,
      source: "palantir",
      title,
      body,
      url,
      icon: "🔮",
    });
    if (ok) sent++;
  }

  console.log(`[Notify] Alert sent to ${sent}/${targetEmails.size} Palantir Super Admins: ${title}`);
  return sent;
}
