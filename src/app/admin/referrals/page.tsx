import Form from "next/form";
import { redirect } from "next/navigation";
import { createClient } from "@/server/supabase/server";
import { getAdminReferralTerms } from "@/features/admin/queries";
import { referralIdFrom } from "@/features/admin/referral-lookup";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("referralTerms.title") };
}

// S10 lookup. Access is gated by the admin layout (404 for non-admins); the RPC re-checks platform admin.
export default async function AdminReferralLookupPage({ searchParams }: PageProps<"/admin/referrals">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 500) : "";
  const t = await getT("admin");
  let missing = false;
  if (q.trim()) {
    const id = referralIdFrom(q);
    const found = id ? await getAdminReferralTerms(await createClient(), id) : null;
    if (found && id) redirect(`/admin/referrals/${id}`);
    missing = true;
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("referralTerms.title")} description={t("referralTerms.description")} />
      <Panel className="p-6">
        <Form action="/admin/referrals" className="grid gap-3 sm:max-w-xl">
          <Label htmlFor="referral-lookup" className="text-sm font-medium">{t("referralTerms.lookupLabel")}</Label>
          <Input
            id="referral-lookup"
            name="q"
            defaultValue={q}
            autoComplete="off"
            aria-invalid={missing ? true : undefined}
            aria-describedby={missing ? "referral-lookup-error" : "referral-lookup-hint"}
          />
          {missing ? (
            <p id="referral-lookup-error" role="alert" className="text-xs font-medium text-danger">{t("referralTerms.notFound")}</p>
          ) : (
            <p id="referral-lookup-hint" className="text-xs text-muted-foreground">{t("referralTerms.lookupHint")}</p>
          )}
          <SubmitButton className="min-h-11 w-full sm:min-h-10 sm:w-auto sm:justify-self-start" pendingLabel={t("referralTerms.finding")}>{t("referralTerms.find")}</SubmitButton>
        </Form>
      </Panel>
    </div>
  );
}
