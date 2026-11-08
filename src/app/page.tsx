import { redirect } from "next/navigation";
import { getSessionUser, listMemberships } from "@/server/auth/context";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const memberships = await listMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  redirect(`/w/${memberships[0].slug}/overview`);
}
