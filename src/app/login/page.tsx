"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { allowedDomains } from "@/lib/utils";

export default function LoginPage() {
  const { session, signInWithGoogle, loading } = useAuth();
  const router = useRouter();
  const [ssoChecking, setSsoChecking] = useState(false);

  // SSO depuis Apps-Hub via #sso=<token>
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#sso=")) return;

    const ssoToken = hash.substring(5);
    history.replaceState(null, "", window.location.pathname + window.location.search);

    const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app";

    setSsoChecking(true);
    (async () => {
      try {
        const res = await fetch("/api/sso/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: ssoToken }),
        });
        const result = await res.json();
        if (result.valid && result.user) {
          // Hydrate Firebase Auth CLIENT pour les widgets Hub
          if (result.customToken) {
            try {
              const [{ signInWithCustomToken }, { firebaseAuth }] = await Promise.all([
                import("firebase/auth"),
                import("@/lib/firebase-client"),
              ]);
              await signInWithCustomToken(firebaseAuth(), result.customToken);
            } catch (e) {
              console.warn("SSO: Firebase signInWithCustomToken failed");
            }
          }

          // Charger les favoris depuis le Hub
          try {
            const hubRes = await fetch(`${HUB_URL}/api/sidebar-data`, {
              headers: { Authorization: `Bearer ${ssoToken}` },
            });
            if (hubRes.ok) {
              const hubData = await hubRes.json();
              const favs = hubData.favorites || [];
              localStorage.setItem("chanv_sidebar_favorites", JSON.stringify(favs));
            }
          } catch (e) {
            console.warn("SSO: Hub favorites fetch failed, using server fallback");
            if (result.favorites && result.favorites.length > 0) {
              try { localStorage.setItem("chanv_sidebar_favorites", JSON.stringify(result.favorites)); } catch {}
            }
          }
          window.location.href = "/palantir";
          return;
        }
        console.warn("SSO refused");
      } catch (e) {
        console.error("SSO error");
      } finally {
        setSsoChecking(false);
      }
    })();
  }, [router]);

  // Redirection si déjà connecté
  useEffect(() => {
    if (session) {
      router.replace("/palantir");
    }
  }, [session, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-10 animate-[chanvFadeIn_0.5s_ease-out_both]">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="bg-chanv-fibre p-5 rounded-chanv shadow-chanv-soft mb-5">
            <Image src="/favicon.svg" alt="Chanv" width={64} height={64} />
          </div>
          <h1 className="text-2xl font-bold text-chanv-terre">Palantir</h1>
          <p className="text-[11px] uppercase tracking-[3px] text-chanv-terre/60 mt-2">
            Groupe Chanv
          </p>
          <p className="text-sm text-slate-500 mt-5 leading-relaxed">
            Connexion réservée aux domaines&nbsp;
            <span className="font-semibold text-chanv-terre">
              {allowedDomains().join(", ")}
            </span>
          </p>
        </div>
        <button
          onClick={signInWithGoogle}
          disabled={loading || ssoChecking}
          className="btn-primary w-full py-4 text-base"
        >
          {ssoChecking
            ? "Connexion SSO en cours..."
            : loading
            ? "Chargement..."
            : "Se connecter avec Google"}
        </button>
        <p className="text-xs text-slate-400 text-center mt-6 leading-relaxed">
          Une session s&apos;ouvrira pour 5 jours.
        </p>
      </div>
    </main>
  );
}
