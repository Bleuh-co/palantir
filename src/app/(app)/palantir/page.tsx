import { getSession } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { DashboardClient } from "@/components/DashboardClient";

export const metadata = {
  title: "Palantir — Monitoring",
  description: "Surveillance en temps réel de l'écosystème Chanv",
};

export default async function PalantirPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <NavBar />
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div className="dashboard-title-row">
            <div className="dashboard-icon">👁️</div>
            <div>
              <h1 className="dashboard-title">Palantir</h1>
              <p className="dashboard-subtitle">
                Surveillance de l&apos;écosystème Chanv — DEV &amp; PROD
              </p>
            </div>
          </div>
        </div>
        <DashboardClient />
      </main>
    </>
  );
}
