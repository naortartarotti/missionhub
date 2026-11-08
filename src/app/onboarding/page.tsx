import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import { listMemberships, requireUser } from "@/server/auth/context";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await searchParams;
  const memberships = await listMemberships();
  if (memberships.length > 0 && sp.new !== "1") redirect(`/w/${memberships[0].slug}/overview`);
  return (
    <AuthShell wide footer="Joining an existing team? Open the invitation link your admin sent you.">
      <OnboardingForm firstName={user.fullName ? user.fullName.split(" ")[0] : undefined} />
    </AuthShell>
  );
}
