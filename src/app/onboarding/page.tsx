import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { OnboardingForm, type OnboardingRules } from "@/features/organizations/components/onboarding-form";
import { createClient } from "@/server/supabase/server";
import { getRulesVersions } from "@/features/network-rules/queries";
import { buildAcceptanceTexts, defaultLocaleFor } from "@/features/network-rules/page-data";
import { listMemberships, requireUser } from "@/server/auth/context";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("onboarding"))("metaTitle") };
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const memberships = await listMemberships();
  if (memberships.length > 0 && sp.new !== "1") redirect(`/workspace/${memberships[0].slug}/overview`);
  const t = await getT("onboarding");
  // A starting guess for the agency's country from the browser's language ("pt-BR" → BR). Editable.
  const lang = (await headers()).get("accept-language")?.split(",")[0]?.trim() ?? "";
  let country = "";
  try {
    country = (lang && new Intl.Locale(lang).maximize().region) || "";
  } catch {}
  // N10 (BR-5, BR-6): the current Network Rules version for the Rules step. No org yet, so the
  // Québec proxy is the UI locale (Q-D3). None published → the step shows "not available" and blocks.
  const db = await createClient();
  const { current } = await getRulesVersions(db);
  const rules: OnboardingRules = current
    ? {
        version: { id: current.id, label: current.label, effectiveAt: current.effective_at, type: current.type, legalReason: current.legal_reason },
        texts: await buildAcceptanceTexts(db, current.id),
        defaultLocale: await defaultLocaleFor(null),
        historyHref: `/network-rules?from=${encodeURIComponent("/onboarding?new=1")}`,
      }
    : null;
  return (
    <AuthShell wide footer={t("footer")}>
      <OnboardingForm firstName={user.fullName ? user.fullName.split(" ")[0] : undefined} defaultCountry={/^[A-Z]{2}$/.test(country) ? country : ""} rules={rules} />
    </AuthShell>
  );
}
