import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  redirect("/palantir");
}
