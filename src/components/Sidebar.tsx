"use client";

import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { ROLE_LABELS } from "@/lib/types";

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app";

/**
 * Sidebar component — delegates to the GANDALF widget (gandalf-widget.js).
 *
 * The widget is loaded via <Script> in layout.tsx and initialized here
 * with user info + app-specific navigation links.
 */
export function Sidebar() {
  const { session, firebaseUser, signOut } = useAuth();

  const isAdmin = session?.role === "admin" || session?.role === "superadmin";

  // Build app-specific links for the widget
  const getLinks = useCallback(() => {
    const links: Array<{ label: string; icon: string; href: string; mobileOnly?: boolean }> = [
      { label: "Palantir", icon: "🚀", href: "/palantir", mobileOnly: true },
    ];
    return links;
  }, [isAdmin]);

  // Initialize GANDALF widget once session is ready
  const initDone = useRef(false);

  useEffect(() => {
    if (!session || initDone.current) return;

    const tryInit = async () => {
      // Poll until the lazyOnload script defines GandalfWidget
      let tries = 0;
      while (!(window as any).GandalfWidget && tries < 60) {
        await new Promise((r) => setTimeout(r, 250));
        tries++;
      }
      const gw = (window as any).GandalfWidget;
      if (!gw) { console.warn("[Sidebar] GandalfWidget never loaded"); return; }

      // Get an ID token — try firebaseUser first, then fallback to server
      let token: string | null = null;
      if (firebaseUser) {
        try { token = await firebaseUser.getIdToken(); } catch {}
      }
      if (!token) {
        try {
          const { signInWithCustomToken } = await import("firebase/auth");
          const { firebaseAuth } = await import("@/lib/firebase-client");
          const res = await fetch("/api/auth/token");
          if (res.ok) {
            const { customToken } = await res.json();
            const cred = await signInWithCustomToken(firebaseAuth(), customToken);
            token = await cred.user.getIdToken();
          }
        } catch (e) { console.warn("[Sidebar] Custom token fallback failed"); }
      }

      gw.init({
        user: {
          name: session.displayName || session.email,
          email: session.email,
          photo: session.photoURL || "",
          role: ROLE_LABELS[session.role] || session.role,
        },
        token,
        lang: localStorage.getItem("gandalf_lang") || "fr",
        logoutFn: () => signOut(),
        avatarSelector: "#avatar-burger-btn",
        appName: "🚀 Palantir",
        links: getLinks(),
        onLangChange: () => {},
      });

      initDone.current = true;
    };

    tryInit();
  }, [session]);

  // Keep token fresh when firebaseUser changes
  useEffect(() => {
    if (!firebaseUser) return;
    const gw = (window as any).GandalfWidget;
    if (!gw) return;
    firebaseUser.getIdToken().then((t: string) => gw.setToken(t)).catch(() => {});
  }, [firebaseUser]);

  if (!session) return null;

  return (
    <button
      id="avatar-burger-btn"
      onClick={() => (window as any).GandalfWidget?.toggle()}
      className="avatar-burger-btn relative"
      title="Menu"
    >
      <div className="avatar-burger-inner">
        {session.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.photoURL}
            alt=""
            className="avatar-burger-photo"
            referrerPolicy="no-referrer"
          />
        )}
        <span className="avatar-burger-icon">
          <span />
          <span />
          <span />
        </span>
      </div>
    </button>
  );
}
