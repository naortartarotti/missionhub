import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, Handshake, ShieldOff } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { getReferralDetail } from "@/features/referrals/queries";
import { ConfirmAgreementButton, GrantDownload, MessageForm, ReportHireDialog, TransitionButtons } from "@/features/referrals/components/referral-actions";
import { DISCLOSURE_FIELDS, type DisclosureKey } from "@/features/referrals/disclosure";
import { isDeclineReason } from "@/features/referrals/review";
import { Panel } from "@/components/shared/card";
import { DirectionBadge } from "@/features/referrals/components/direction-badge";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Flash } from "@/components/shared/flash";
import { Button } from "@/components/ui/button";
import { REFERRAL_STATUS, type ARRANGEMENT, type SENIORITY } from "@/lib/labels";
import { bpsToPercent, minorToMajorString } from "@/lib/money/format";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("referrals"))("detail.title") };
}

const isDisclosureKey = (k: string): k is DisclosureKey => DISCLOSURE_FIELDS.some((f) => f.key === k);

type Snapshot = Partial<{
  full_name: string;
  email: string;
  phone: string;
  headline: string;
  summary: string;
  location: string;
  open_to_relocation: boolean;
  seniority: keyof typeof SENIORITY;
  years_experience: number;
  skills: string[];
  languages: string[];
  work_arrangements: (keyof typeof ARRANGEMENT)[];
  salary_expectation_min: number;
  salary_expectation_max: number;
  salary_currency: string;
  available_from: string;
  experience: { title: string; company: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
}>;

export default async function ReferralPage({ params, searchParams }: PageProps<"/w/[orgSlug]/referrals/[referralId]">) {
  const { orgSlug, referralId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const [t, tg, f] = await Promise.all([getT("referrals"), getGlobalT(), getFormatter()]);
  const d = await getReferralDetail(ctx, referralId);
  if (!d) notFound();
  const { referral: r, side, agreement } = d;
  const snap = (d.profile?.snapshot ?? null) as Snapshot | null;
  const partner = side === "source" ? r.target_org?.name : r.source_org?.name;
  const st = REFERRAL_STATUS[r.status];
  const { data: job } = side === "target" ? await ctx.db.from("jobs").select("expected_fee_minor, fee_currency").eq("id", r.job_id).maybeSingle() : { data: null };

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <DirectionBadge direction={side === "source" ? "outbound" : "inbound"} label={t(side === "source" ? "direction.outbound.badge" : "direction.inbound.badge")} />
            <span>{side === "source" ? t("detail.sentTo", { partner: partner ?? "" }) : t("detail.receivedFrom", { partner: partner ?? "" })} · {f.date(r.submitted_at)}</span>
          </span>
        }
        title={r.candidate_label}
        description={t("detail.forJob", { job: r.job_title_snapshot })}
        actions={<StatusPill tone={st.tone} label={tg(`labels.referralStatus.${r.status}`)} />}
      />
      {sp.submitted ? <Flash message={t("detail.submittedFlash", { partner: partner ?? "" })} /> : null}

      {r.sharing_revoked_at ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("detail.revoked", { date: f.date(r.sharing_revoked_at) })} {side === "target" ? t("detail.revokedTarget") : t("detail.revokedSource")}
        </div>
      ) : null}

      {d.transitions.length || (side === "target" && r.status === "offer") || (side === "source" && agreement?.status === "pending_source") ? (
        <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {side === "target" ? t("detail.guidanceTarget") : t("detail.guidanceSource")}
          </p>
          <div className="flex flex-wrap gap-2">
            {side === "source" && agreement?.status === "pending_source" ? <ConfirmAgreementButton orgSlug={orgSlug} referralId={r.id} /> : null}
            <TransitionButtons orgSlug={orgSlug} referralId={r.id} version={r.version} transitions={d.transitions} side={side} status={r.status} />
            {side === "target" && r.status === "offer" && agreement?.status === "active" ? (
              <ReportHireDialog orgSlug={orgSlug} referralId={r.id} version={r.version} currency={job?.fee_currency ?? ctx.currency} defaultFee={job?.expected_fee_minor ? minorToMajorString(job.expected_fee_minor, job.fee_currency) : ""} />
            ) : null}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          <Panel>
            <SectionTitle
              action={side === "source" && d.candidateId ? <Button variant="ghost" size="sm" asChild><Link href={`/w/${orgSlug}/candidates/${d.candidateId}`}>{t("detail.openCandidate")}</Link></Button> : null}
            >
              {side === "target" ? t("detail.approvedProfile") : t("detail.whatYouShared")}
            </SectionTitle>
            {!snap ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><EyeOff className="size-4" aria-hidden /> {t("detail.notAvailable")}</p>
            ) : (
              <div className="grid gap-4 text-sm">
                <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2">
                  {snap.full_name !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.name")}</dt><dd>{snap.full_name}</dd></> : null}
                  {snap.email !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.email")}</dt><dd>{snap.email ?? "—"}</dd></> : null}
                  {snap.phone !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.phone")}</dt><dd>{snap.phone ?? "—"}</dd></> : null}
                  {snap.headline !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.headline")}</dt><dd>{snap.headline ?? "—"}</dd></> : null}
                  {snap.seniority !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.seniority")}</dt><dd>{snap.seniority ? tg(`labels.seniority.${snap.seniority}`) : "—"}{snap.years_experience != null ? ` · ${t("detail.fields.years", { count: snap.years_experience })}` : ""}</dd></> : null}
                  {snap.skills ? <><dt className="text-muted-foreground">{t("detail.fields.skills")}</dt><dd>{snap.skills.join(", ")}</dd></> : null}
                  {snap.languages ? <><dt className="text-muted-foreground">{t("detail.fields.languages")}</dt><dd>{snap.languages.join(", ") || "—"}</dd></> : null}
                  {snap.work_arrangements ? <><dt className="text-muted-foreground">{t("detail.fields.arrangement")}</dt><dd>{snap.work_arrangements.map((a) => tg(`labels.arrangement.${a}`)).join(", ") || "—"}</dd></> : null}
                  {snap.location !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.location")}</dt><dd>{snap.location ?? "—"}{snap.open_to_relocation ? ` · ${t("detail.fields.openToRelocation")}` : ""}</dd></> : null}
                  {snap.available_from !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.available")}</dt><dd>{snap.available_from ? f.date(snap.available_from) : "—"}</dd></> : null}
                  {snap.salary_currency !== undefined ? <><dt className="text-muted-foreground">{t("detail.fields.salary")}</dt><dd>{f.money(snap.salary_expectation_min, snap.salary_currency ?? "CAD")} – {f.money(snap.salary_expectation_max, snap.salary_currency ?? "CAD")}</dd></> : null}
                </dl>
                {snap.summary ? <p className="whitespace-pre-line text-muted-foreground">{snap.summary}</p> : null}
                {snap.experience?.length ? (
                  <div>
                    <h3 className="mb-2 font-semibold">{t("detail.experience")}</h3>
                    <ul className="grid gap-2">
                      {snap.experience.map((e, i) => <li key={i}><span className="font-medium">{e.title}</span>{e.company ? ` · ${e.company}` : ""} <span className="text-muted-foreground">({f.date(e.start_date)} – {e.end_date ? f.date(e.end_date) : t("detail.present")})</span></li>)}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t("detail.disclosed", {
                    fields: d.profile!.disclosed_fields.map((k) => (isDisclosureKey(k) ? t(`disclosure.${k}`) : k)).join(", "),
                    date: f.date(d.profile!.created_at),
                  })}
                </p>
              </div>
            )}
            {d.grants.length ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">{t("detail.sharedDocuments")}</h3>
                <ul className="grid gap-2">{d.grants.map((g) => <GrantDownload key={g.id} orgSlug={orgSlug} grant={g} />)}</ul>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle>{t("detail.messages")}</SectionTitle>
            {d.messages.length ? (
              <ul className="mb-4 grid gap-3">
                {d.messages.map((m) => {
                  const mine = m.author_side === side;
                  return (
                    <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "ml-auto bg-foreground text-background" : "bg-muted"}`}>
                      <p className={`mb-1 text-xs ${mine ? "opacity-70" : "text-muted-foreground"}`}>{mine ? t("detail.you") : m.author?.full_name || t("detail.partnerRecruiter", { partner: partner ?? "" })} · {f.relative(m.created_at)}</p>
                      <p className="whitespace-pre-line">{m.body}</p>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mb-4 text-sm text-muted-foreground">{t("detail.noMessages")}</p>}
            <MessageForm orgSlug={orgSlug} referralId={r.id} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel>
            <SectionTitle>{t("detail.agreement.title")}</SectionTitle>
            {agreement ? (
              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[[t("detail.agreement.sourcing"), agreement.sourcing_bps], [t("detail.agreement.jobOwner"), agreement.job_owner_bps], [t("detail.agreement.platform"), agreement.platform_bps]].map(([l, v]) => (
                    <div key={l as string} className="rounded-2xl bg-muted px-2 py-3">
                      <p className="text-lg font-semibold tabular-nums">{bpsToPercent(v as number)}</p>
                      <p className="text-xs text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground">{t("detail.agreement.rule", { rule: agreement.rule_name, version: String(agreement.rule_version), terms: agreement.terms_version })}</p>
                <StatusPill tone={agreement.status === "active" ? "success" : "warning"} icon={Handshake} label={agreement.status === "active" ? t("detail.agreement.confirmed") : t("detail.agreement.awaiting")} />
                {d.placement ? <Button variant="outline" asChild><Link href={`/w/${orgSlug}/commissions/${d.placement.id}`}>{t("detail.agreement.openPlacement")}</Link></Button> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.agreement.pending")}</p>
            )}
          </Panel>

          <Panel>
            <SectionTitle>{t("detail.timeline")}</SectionTitle>
            <ol className="relative grid gap-4 border-l border-border pl-5">
              {d.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-foreground ring-4 ring-card" aria-hidden />
                  <p className="text-sm font-medium">{tg(`labels.referralStatus.${e.to_status}`)}</p>
                  <p className="text-xs text-muted-foreground">{e.actor_side === side ? t("detail.you") : partner} · {f.date(e.created_at)}</p>
                  {e.reason ? <p className="mt-1 text-sm text-muted-foreground">{isDeclineReason(e.reason) ? t(`declineReasons.${e.reason}`) : t("detail.reasonQuote", { reason: e.reason })}</p> : null}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">{t("detail.ownership", { date: f.date(r.ownership_protected_until) })}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
