import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { resolveRoleVerbose } from "@/lib/auth-server";
import { isEmailDomainAllowed } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Endpoint de diagnostic : montre EXACTEMENT comment l'app résout le
 * rôle de l'utilisateur connecté. Utile pour déboguer les soucis de
 * propagation des accès depuis le gestionnaire Gandalf.
 */
export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  let email: string | null = null;
  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    email = decoded.email || null;
  } catch {
    return NextResponse.json({ error: "Session invalide" }, { status: 401 });
  }
  if (!email || !isEmailDomainAllowed(email)) {
    return NextResponse.json({ error: "Domaine non autorisé" }, { status: 403 });
  }

  const resolution = await resolveRoleVerbose(email);
  return NextResponse.json(resolution);
}
