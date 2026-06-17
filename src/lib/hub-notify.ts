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
 * Notify all admins about a new alert.
 * Looks up users with role superadmin or admin in Firestore.
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

  // Get all admin emails from the users collection
  const adminsSnap = await db
    .collection("users")
    .where("role", "in", ["Super Administrateur", "Administrateur"])
    .get();

  if (adminsSnap.empty) {
    console.warn("[Notify] No admins found in users collection");
    return 0;
  }

  const emoji = SEVERITY_EMOJI[alert.severity] || "⚠️";
  const envLabel = alert.env.toUpperCase();
  const title = `${emoji} Palantir — ${alert.service} [${envLabel}]`;
  const body = alert.message;
  const url = `/palantir/${alert.service}?env=${alert.env}`;

  let sent = 0;
  for (const doc of adminsSnap.docs) {
    const email = doc.data().email || doc.id;
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

  console.log(`[Notify] Alert sent to ${sent}/${adminsSnap.size} admins: ${title}`);
  return sent;
}
