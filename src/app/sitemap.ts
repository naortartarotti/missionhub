import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { PAGES } from "@/features/landing/components/shared";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    ...PAGES.map((p) => ({ url: `${base}${p.href}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
