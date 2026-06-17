import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  createSessionCookie,
  resolveRole,
  sessionCookieOptions,
} from "@/lib/auth-server";
import { isEmailDomainAllowed } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Résout les favoris de l'utilisateur directement depuis Firestore.
 * Même logique que le Hub `/api/sidebar-data` — évite un appel cross-origin
 * qui nécessiterait un token Firebase client (indisponible en SSO).
 */
async function resolveFavorites(email: string) {
  try {
    const db = adminDb();
    const favDoc = await db.collection("users_fav_links").doc(email).get();
    const favs = favDoc.exists ? (favDoc.data()?.favorites || []) : [];
    if (favs.length === 0) return [];

    const resolved = [];
    for (const fav of favs) {
      const col = fav.type === "app" ? "apps" : fav.type === "site" ? "sites" : null;
      if (!col) continue;
      try {
        const doc = await db.collection(col).doc(fav.id).get();
        if (doc.exists) {
          const data = doc.data()!;
          let image = data.image || "";
          if (image && !image.startsWith("http")) {
            image = `${process.env.HUB_URL || "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app"}/${image.replace(/^\//, "")}`;
          }
          resolved.push({
            type: fav.type,
            id: fav.id,
            name: data.name || fav.id,
            icon: data.icon || "🚀",
            image,
            url: data.url || "#",
            sso: fav.type === "app",
          });
        }
      } catch { /* skip unresolvable */ }
    }
    return resolved;
  } catch (e) {
    console.warn("[SSO] favorites fetch failed");
    return [];
  }
}

/**
 * Vérification SSO cross-app — appelé quand l'utilisateur arrive depuis
 * Apps-Hub avec un token #sso= dans le hash.
 */
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") {
    return NextResponse.json({ valid: false, error: "Token manquant" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch (e: any) {
    console.error("[SSO] verifyIdToken failed");
    return NextResponse.json({ valid: false, error: "Token invalide ou expiré" });
  }

  const email = decoded.email;
  if (!isEmailDomainAllowed(email)) {
    return NextResponse.json({ valid: false, error: "Domaine email non autorisé" });
  }

  const role = await resolveRole(email!);
  if (role === "blocked") {
    return NextResponse.json({ valid: false, error: "Accès non autorisé" });
  }

  try {
    const sessionCookie = await createSessionCookie(token);
    const cookieStore = await cookies();
    cookieStore.set({ ...sessionCookieOptions(), value: sessionCookie });
  } catch (e: any) {
    console.error("[SSO] session cookie creation failed");
  }

  const favorites = await resolveFavorites(email!);

  let customToken: string | null = null;
  try {
    customToken = await adminAuth().createCustomToken(decoded.uid, {
      email: email || "",
      role,
    });
  } catch (e: any) {
    console.warn("[SSO] createCustomToken failed");
  }

  return NextResponse.json({
    valid: true,
    email,
    name: decoded.name || "",
    role,
    user: {
      uid: decoded.uid,
      email,
      displayName: (decoded.name as string) || null,
      photoURL: (decoded.picture as string) || null,
      role,
    },
    favorites,
    customToken,
  });
}
