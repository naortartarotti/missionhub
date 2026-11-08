import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, Handshake, ShieldOff } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { getReferralDetail } from "@/features/referrals/queries";
import { ConfirmAgreementButton, GrantDownload, MessageForm, ReportHireDialog, TransitionButtons } from "@/features/referrals/components/referral-actions";
import { DISCLOSURE_FIELDS } from "@/features/referrals/disclosure";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Flash } from "@/components/shared/flash";
import { Button } from "@/components/ui/button";
import { ARRANGEMENT, REFERRAL_STATUS, SENIORITY, formatDate, relativeTime } from "@/lib/labels";
import { bpsToPercent, formatMoney, minorToMajorString } from "@/lib/money/format";

export const metadata = { title: "Referral" };

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
  const d = await getReferralDetail(ctx, referralId);
  if (!d) notFound();
  const { referral: r, side, agreement } = d;
  const snap = (d.profile?.snapshot ?? null) as Snapshot | null;
  const partner = side === "source" ? r.target_org?.name : r.source_org?.name;
  const st = REFERRAL_STATUS[r.status];
  const { data: job } = side === "target" ? await ctx.db.from("jobs").select("expected_fee_minor, fee_currency").eq("id", r.job_id).maybeSingle() : { data: null };

  return (
    <div className="grid gap-6">
      {sp.submitted ? <Flash message={`Submitted. ${partner} has been notified and can now see only the fields you approved.`} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{side === "source" ? `Sent to ${partner}` : `Received from ${partner}`} · {formatDate(r.submitted_at)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.candidate_label}</h1>
          <p className="mt-0.5 text-muted-foreground">for {r.job_title_snapshot}</p>
        </div>
        <StatusPill tone={st.tone} label={st.label} />
      </div>

      {r.sharing_revoked_at ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          The candidate's sharing authorization was revoked on {formatDate(r.sharing_revoked_at)}. {side === "target" ? "The shared profile and documents are no longer available to you." : "The partner no longer has access to the snapshot or documents."}
        </div>
      ) : null}

      {d.transitions.length || (side === "target" && r.status === "offer") || (side === "source" && agreement?.status === "pending_source") ? (
        <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {side === "target" ? "Review the approved profile, then decide. Feedback must be job-related and non-discriminatory." : "Keep the partner updated. Withdrawing stops their access to further documents."}
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
              action={side === "source" && d.candidateId ? <Button variant="ghost" size="sm" asChild><Link href={`/w/${orgSlug}/candidates/${d.candidateId}`}>Open candidate record</Link></Button> : null}
            >
              {side === "target" ? "Approved candidate profile" : "What you shared"}
            </SectionTitle>
            {!snap ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><EyeOff className="size-4" aria-hidden /> Not available.</p>
            ) : (
              <div className="grid gap-4 text-sm">
                <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2">
                  {snap.full_name !== undefined ? <><dt className="text-muted-foreground">Name</dt><dd>{snap.full_name}</dd></> : null}
                  {snap.email !== undefined ? <><dt className="text-muted-foreground">Email</dt><dd>{snap.email ?? "—"}</dd></> : null}
                  {snap.phone !== undefined ? <><dt className="text-muted-foreground">Phone</dt><dd>{snap.phone ?? "—"}</dd></> : null}
                  {snap.headline !== undefined ? <><dt className="text-muted-foreground">Headline</dt><dd>{snap.headline ?? "—"}</dd></> : null}
                  {snap.seniority !== undefined ? <><dt className="text-muted-foreground">Seniority</dt><dd>{snap.seniority ? SENIORITY[snap.seniority] : "—"}{snap.years_experience != null ? ` · ${snap.years_experience} yrs` : ""}</dd></> : null}
                  {snap.skills ? <><dt className="text-muted-foreground">Skills</dt><dd>{snap.skills.join(", ")}</dd></> : null}
                  {snap.languages ? <><dt className="text-muted-foreground">Languages</dt><dd>{snap.languages.join(", ") || "—"}</dd></> : null}
                  {snap.work_arrangements ? <><dt className="text-muted-foreground">Arrangement</dt><dd>{snap.work_arrangements.map((a) => ARRANGEMENT[a]).join(", ") || "—"}</dd></> : null}
                  {snap.location !== undefined ? <><dt className="text-muted-foreground">Location</dt><dd>{snap.location ?? "—"}{snap.open_to_relocation ? " · open to relocation" : ""}</dd></> : null}
                  {snap.available_from !== undefined ? <><dt className="text-muted-foreground">Available</dt><dd>{snap.available_from ? formatDate(snap.available_from) : "—"}</dd></> : null}
                  {snap.salary_currency !== undefined ? <><dt className="text-muted-foreground">Salary expectation</dt><dd>{formatMoney(snap.salary_expectation_min, snap.salary_currency ?? "CAD")} – {formatMoney(snap.salary_expectation_max, snap.salary_currency ?? "CAD")}</dd></> : null}
                </dl>
                {snap.summary ? <p className="whitespace-pre-line text-muted-foreground">{snap.summary}</p> : null}
                {snap.experience?.length ? (
                  <div>
                    <h3 className="mb-2 font-semibold">Experience</h3>
                    <ul className="grid gap-2">
                      {snap.experience.map((e, i) => <li key={i}><span className="font-medium">{e.title}</span>{e.company ? ` · ${e.company}` : ""} <span className="text-muted-foreground">({formatDate(e.start_date)} – {e.end_date ? formatDate(e.end_date) : "present"})</span></li>)}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Disclosed fields: {d.profile!.disclosed_fields.map((f) => DISCLOSURE_FIELDS.find((x) => x.key === f)?.label ?? f).join(", ")}. Snapshot taken {formatDate(d.profile!.created_at)}; later edits to the source record are not shared.
                </p>
              </div>
            )}
            {d.grants.length ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Shared documents</h3>
                <ul className="grid gap-2">{d.grants.map((g) => <GrantDownload key={g.id} orgSlug={orgSlug} grant={g} />)}</ul>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle>Messages</SectionTitle>
            {d.messages.length ? (
              <ul className="mb-4 grid gap-3">
                {d.messages.map((m) => {
                  const mine = m.author_side === side;
                  return (
                    <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "ml-auto bg-foreground text-background" : "bg-muted"}`}>
                      <p className={`mb-1 text-xs ${mine ? "opacity-70" : "text-muted-foreground"}`}>{mine ? "You" : m.author?.full_name || `${partner} recruiter`} · {relativeTime(m.created_at)}</p>
                      <p className="whitespace-pre-line">{m.body}</p>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mb-4 text-sm text-muted-foreground">No messages yet.</p>}
            <MessageForm orgSlug={orgSlug} referralId={r.id} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel>
            <SectionTitle>Collaboration agreement</SectionTitle>
            {agreement ? (
              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Sourcing recruiter", agreement.sourcing_bps], ["Job owner", agreement.job_owner_bps], ["Platform", agreement.platform_bps]].map(([l, v]) => (
                    <div key={l as string} className="rounded-2xl bg-muted px-2 py-3">
                      <p className="text-lg font-semibold tabular-nums">{bpsToPercent(v as number)}</p>
                      <p className="text-xs text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground">{agreement.rule_name} v{agreement.rule_version} · terms {agreement.terms_version}</p>
                <StatusPill tone={agreement.status === "active" ? "success" : "warning"} icon={Handshake} label={agreement.status === "active" ? "Confirmed by both parties" : "Awaiting sourcing recruiter"} />
                {d.placement ? <Button variant="outline" asChild><Link href={`/w/${orgSlug}/commissions/${d.placement.id}`}>Open placement & ledger</Link></Button> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Created automatically from the current commission rule when the job owner accepts. The snapshot is frozen after that.</p>
            )}
          </Panel>

          <Panel>
            <SectionTitle>Timeline</SectionTitle>
            <ol className="relative grid gap-4 border-l border-border pl-5">
              {d.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-foreground ring-4 ring-card" aria-hidden />
                  <p className="text-sm font-medium">{REFERRAL_STATUS[e.to_status].label}</p>
                  <p className="text-xs text-muted-foreground">{e.actor_side === side ? "You" : partner} · {formatDate(e.created_at)}</p>
                  {e.reason ? <p className="mt-1 text-sm text-muted-foreground">“{e.reason}”</p> : null}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Ownership protected until {formatDate(r.ownership_protected_until)}.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
