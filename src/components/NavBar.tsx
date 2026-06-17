"use client";

import Image from "next/image";
import { useAuth } from "./AuthProvider";
import { Sidebar } from "./Sidebar";
import { ROLE_LABELS } from "@/lib/types";

export function NavBar() {
  const { session } = useAuth();
  if (!session) return null;

  return (
    <header className="chanv-header">
      <div className="mx-auto max-w-5xl flex items-center gap-6 flex-nowrap relative flex-col md:flex-row text-center md:text-left">
        <a
          href={process.env.NEXT_PUBLIC_HUB_URL || "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app/"}
          className="chanv-logo-wrapper flex items-center"
          title="Retour au Hub"
        >
          <Image
            src="/logo-groupe-chanv.svg"
            alt="Chanv"
            width={130}
            height={44}
            priority
            className="h-10 w-auto"
          />
        </a>
        <div>
          <h1 className="text-xl font-bold m-0 leading-tight">🔮 Palantir</h1>
          <p className="text-[10px] md:text-[11px] uppercase tracking-[3px] opacity-70 mt-1 m-0">
            Groupe Chanv
          </p>
        </div>

        <div className="flex items-center gap-3 md:ml-auto absolute top-0 right-0 md:relative md:top-auto md:right-auto">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-white whitespace-nowrap">
              {session.displayName || session.email}
            </div>
            <div className="text-[11px] text-white/60 uppercase tracking-wider whitespace-nowrap">
              {ROLE_LABELS[session.role]}
            </div>
          </div>
          <Sidebar />
        </div>
      </div>
    </header>
  );
}
