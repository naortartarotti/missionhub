import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import { listMemberships, requireUser } from "@/server/auth/context";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("onboarding"))("metaTitle") };
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const memberships = await listMemberships();
  if (memberships.length > 0 && sp.new !== "1") redirect(`/w/${memberships[0].slug}/overview`);
  const t = await getT("onboarding");
  return (
    <AuthShell wide footer={t("footer")}>
      <OnboardingForm firstName={user.fullName ? user.fullName.split(" ")[0] : undefined} />
    </AuthShell>
  );
}
