import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { NavBar } from "@/components/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");

  return (
    <>
      <NavBar />
      <div className="chanv-surface">{children}</div>
    </>
  );
}
