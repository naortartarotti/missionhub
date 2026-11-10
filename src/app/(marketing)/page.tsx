import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, listMemberships } from "@/server/auth/context";
import { env } from "@/server/env";
import { LandingPage } from "@/features/landing/components/landing-page";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("landing");
  const title = t("meta.title");
  const description = t("meta.description");
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: "MissionHub", url: "/", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Signed-in users go straight to their workspace; everyone else gets the marketing page. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <LandingPage />;
  const memberships = await listMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  redirect(`/w/${memberships[0].slug}/overview`);
}
