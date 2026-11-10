import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { env } from "@/server/env";
import type { PageKey } from "./components/shared";

/** Title, description, canonical URL and social cards for a public marketing page. */
export async function marketingMetadata(page: "home" | PageKey, path: string): Promise<Metadata> {
  const t = await getT("landing");
  const title = page === "home" ? t("meta.title") : t(`pages.${page}.title`);
  const description = page === "home" ? t("meta.description") : t(`pages.${page}.description`);
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    // Internal pages go through the root "%s · MissionHub" template; the home title already has the brand.
    title: page === "home" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "MissionHub", url: path, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}
