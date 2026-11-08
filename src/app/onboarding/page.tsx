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
    <AuthShell
      title={`Welcome${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
      subtitle="Set up your workspace. Candidates and jobs belong to your organization and are never visible to other organizations."
      footer="Joining an existing team? Open the invitation link your admin sent you."
    >
      <OnboardingForm />
    </AuthShell>
  );
}
