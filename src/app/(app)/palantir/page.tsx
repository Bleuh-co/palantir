import { getSession } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { ROLE_LABELS } from "@/lib/types";

export default async function PalantirPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* En-tête */}
        <section className="section-card">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-4xl">🚀</div>
            <div>
              <h2 className="text-2xl font-bold text-chanv-terre m-0">Palantir</h2>
              <p className="text-sm text-slate-500 mt-1">
                Bienvenue, {session.displayName || session.email}
              </p>
            </div>
            <span className="badge-accent ml-auto">{ROLE_LABELS[session.role]}</span>
          </div>
        </section>

        {/* Contenu principal */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-chanv-terre mb-2">Vue d&apos;ensemble</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Palantir est votre espace de travail centralisé au sein du Groupe Chanv.
              Cette application est prête à accueillir vos fonctionnalités métier.
            </p>
            <div className="mt-4 flex gap-3 flex-wrap">
              <span className="badge-neutral">Groupe Chanv</span>
              <span className="badge-neutral">Sécurisé</span>
              <span className="badge-neutral">PWA</span>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-chanv-terre mb-2">Votre profil</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Nom</dt>
                <dd className="font-medium text-chanv-terre text-right">
                  {session.displayName || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Courriel</dt>
                <dd className="font-medium text-chanv-terre text-right break-all">
                  {session.email}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Rôle</dt>
                <dd className="font-medium text-chanv-terre text-right">
                  {ROLE_LABELS[session.role]}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    </>
  );
}
