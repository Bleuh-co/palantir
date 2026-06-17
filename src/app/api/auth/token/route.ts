import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

/**
 * GET /api/auth/token
 *
 * Returns a Firebase custom token for the current session user.
 * Used by the GANDALF widget when the Firebase client-side auth
 * state is not persisted (cookie-only session restore).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  try {
    const customToken = await adminAuth().createCustomToken(session.uid);
    return NextResponse.json({ customToken });
  } catch (e: any) {
    console.error("[auth/token] createCustomToken failed");
    return NextResponse.json(
      { error: "Token creation failed" },
      { status: 500 }
    );
  }
}
