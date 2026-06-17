import { DashboardClient } from "@/components/DashboardClient";

export const metadata = {
  title: "Palantir — Monitoring",
  description: "Surveillance en temps réel de l'écosystème Chanv",
};

export default function PalantirPage() {
  return (
    <main className="dashboard-main">
      <DashboardClient />
    </main>
  );
}
