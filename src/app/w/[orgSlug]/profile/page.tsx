import { requireUser } from "@/server/auth/context";
import { createClient } from "@/server/supabase/server";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/card";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { PasswordForm } from "@/features/profile/components/password-form";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("profile"))("title") };
}

/** The signed-in person's own profile. It's personal, so it's the same in every workspace. */
export default async function ProfilePage() {
  const [user, t] = await Promise.all([requireUser(), getT("profile")]);
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, email, headline, specialties, regions")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Panel>
        <div className="mb-6 flex items-center gap-4">
          <InitialsAvatar name={profile.full_name || profile.email} className="size-14 text-lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{profile.full_name || profile.email}</p>
            <p className="truncate text-sm text-muted-foreground">{profile.headline || profile.email}</p>
          </div>
        </div>
        <ProfileForm
          profile={{
            fullName: profile.full_name,
            email: profile.email,
            headline: profile.headline ?? "",
            specialties: profile.specialties,
            regions: profile.regions,
          }}
        />
      </Panel>
      <Panel>
        <SectionTitle>{t("password.title")}</SectionTitle>
        <PasswordForm />
      </Panel>
    </div>
  );
}
