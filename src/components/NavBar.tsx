"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useGandalf } from "@bleuh-co/gandalf-sdk-next/client";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { LayoutDashboard, Shield } from "lucide-react";

export function NavBar() {
  const { embedded } = useGandalf();
  const { session } = useAuth();
  const pathname = usePathname();
  const t = useT();

  if (!session) return null;

  // Tous les liens de l'app — « masqué ≠ perdu » : la même liste alimente
  // le header plein écran ET la nav d'embed.
  const links: { href: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { href: "/palantir", label: t("nav.dashboard"), icon: <LayoutDashboard size={15} />, show: true },
    { href: "/palantir/alerts", label: t("nav.alerts"), icon: <Shield size={15} />, show: true },
  ];

  const isActive = (href: string) =>
    href === "/palantir"
      ? pathname === "/palantir" || (pathname?.startsWith("/palantir/") && !pathname?.startsWith("/palantir/alerts"))
      : pathname === href || pathname?.startsWith(href + "/");

  if (embedded) {
    // Contrat d'embed, morceau 3 — nav interne d'embed, modèle xero_photo_achat
    // (#gandalf-embed-nav) : barre claire sticky sur fond parchemin, pastilles
    // blanches arrondies, pastille active or. Le hub fournit logo/titre/profil.
    return (
      <nav className="gandalf-embed-nav sticky top-0 z-40 flex flex-wrap items-center gap-1.5 bg-[#F4EFE3] px-4 pb-1 pt-3">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors",
                isActive(l.href)
                  ? "border-[#A8863F] bg-[#A8863F] font-bold text-white"
                  : "border-black/10 bg-white text-black/60 hover:border-[#A8863F]/40 hover:text-[#282828]",
              )}
            >
              {l.icon}
              <span>{l.label}</span>
            </Link>
          ))}
      </nav>
    );
  }

  return (
    <header className="chanv-header">
      <div className="mx-auto flex items-center gap-4 sm:gap-6 flex-nowrap relative" style={{ maxWidth: "1400px" }}>
        <a
          href={process.env.NEXT_PUBLIC_HUB_URL || "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app"}
          className="chanv-logo-wrapper flex items-center"
          title={t("nav.backToHub")}
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
        <div className="hidden sm:block">
          <h1 className="text-xl font-bold m-0 leading-tight">🔮 Palantir</h1>
          <p className="text-[10px] md:text-[11px] uppercase tracking-[3px] opacity-70 mt-1 m-0">
            {t("nav.subtitle")}
          </p>
        </div>

        <nav className="hidden md:flex items-center gap-1 ml-0 md:ml-4">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link key={l.href} href={l.href} className={cn("chanv-nav-link", isActive(l.href) && "active")}>
                {l.icon}
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            ))}
        </nav>

        <div className="flex items-center gap-3 ml-auto">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-white whitespace-nowrap">
              {session.displayName || session.email}
            </div>
            <div className="text-[11px] text-white/60 uppercase tracking-wider whitespace-nowrap">
              {t(`role.${session.role}`)}
            </div>
          </div>
          <Sidebar />
        </div>
      </div>
    </header>
  );
}
