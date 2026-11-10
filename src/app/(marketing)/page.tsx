import { redirect } from "next/navigation";
import { getSessionUser, listMemberships } from "@/server/auth/context";
import { HomePage } from "@/features/landing/components/home-page";
import { marketingMetadata } from "@/features/landing/metadata";

export const generateMetadata = () => marketingMetadata("home", "/");

/** Signed-in users go straight to their workspace; everyone else gets the marketing page. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <HomePage />;
  const memberships = await listMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  redirect(`/w/${memberships[0].slug}/overview`);
}
