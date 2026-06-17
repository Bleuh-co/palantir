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
      <div className="chanv-header-inner">
        <a
          href={process.env.NEXT_PUBLIC_HUB_URL || "https://chanv-apps-hub-fkdfx4bpva-nn.a.run.app/"}
          className="chanv-logo-wrapper"
          title="Retour au Hub"
        >
          <Image
            src="/logo-groupe-chanv.svg"
            alt="Chanv"
            width={130}
            height={44}
            priority
            className="main-logo"
          />
        </a>
        <div className="header-titles">
          <h1>🔮 Palantir</h1>
          <p>Groupe Chanv</p>
        </div>

        <div className="header-user-section">
          <div className="user-details">
            <span className="user-name">{session.displayName || session.email}</span>
            <span className="user-role">{ROLE_LABELS[session.role]}</span>
          </div>
          <Sidebar />
        </div>
      </div>
    </header>
  );
}
