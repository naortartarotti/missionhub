import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Inbox, Mail, Pencil, Phone, Sparkles } from "lucide-react";
import { getRequestContext, can } from "@/server/auth/context";
import { getCandidate, getCandidateRelations } from "@/features/candidates/queries";
import { listOpportunities } from "@/features/matching/queries";
import { AnonymizeButton, CandidateStatusMenu, ConsentPanel, DocumentsPanel, MatchingSetup } from "@/features/candidates/components/candidate-panels";
import { OpportunityCard, type OpportunityView } from "@/features/matching/components/opportunity-card";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { SkillChips } from "@/components/shared/skill-chips";
import { Disclosure } from "@/components/shared/disclosure";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Flash } from "@/components/shared/flash";
import { CANDIDATE_STATUS, REFERRAL_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("detail.metaTitle") };
}

/** Key fact in the hero strip: small label, prominent value. */
function KeyFact({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="min-w-0 px-4 first:pl-0 sm:border-l sm:border-border/60 sm:first:border-l-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate text-base font-semibold tabular-nums", tone === "success" && "text-success")} title={value}>{value}</dd>
    </div>
  );
}

/** Quiet label-over-value cell for secondary records. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children || "—"}</dd>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-medium text-muted-foreground">{children}</h3>;
}

function Count({ n }: { n: number }) {
  return <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-medium text-muted-foreground tabular-nums">{n}</span>;
}

export default async function CandidatePage({ params, searchParams }: PageProps<"/w/[orgSlug]/candidates/[candidateId]">) {
  const { orgSlug, candidateId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const candidate = await getCandidate(ctx, candidateId);
  if (!candidate) notFound();
  const matchingOn = candidate.status === "active_for_matching";
  const [rel, opportunities] = await Promise.all([
    getCandidateRelations(ctx, candidateId),
    matchingOn ? listOpportunities(ctx, { candidateId }) : Promise.resolve([]),
  ]);
  const [t, tg, f] = await Promise.all([getT("candidates"), getGlobalT(), getFormatter()]);
  const canWrite = can(ctx, "candidates:write");
  const editable = canWrite && candidate.status !== "deleted";
  const st = CANDIDATE_STATUS[candidate.status];
  const salaryCurrency = candidate.salary_currency ?? ctx.currency;
  const hasSalary = candidate.salary_expectation_min !== null || candidate.salary_expectation_max !== null;
  const salary = hasSalary
    ? t("detail.salaryRange", {
        min: f.money(candidate.salary_expectation_min, salaryCurrency, { whole: true }),
        max: f.money(candidate.salary_expectation_max, salaryCurrency, { whole: true }),
      })
    : "—";
  const location = [candidate.location_city, candidate.location_region, candidate.location_country].filter(Boolean).join(", ");
  const seniority = [
    candidate.seniority ? tg(`labels.seniority.${candidate.seniority}`) : null,
    candidate.years_experience !== null ? t("detail.years", { count: candidate.years_experience }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const arrangements = [
    ...candidate.work_arrangements.map((a) => tg(`labels.arrangement.${a}`)),
    ...(candidate.open_to_relocation ? [t("detail.openToRelocation")] : []),
  ];
  const knownSources = ["manual", "csv_import", "resume_upload", "referral", "other"] as const;
  const source = knownSources.find((k) => k === candidate.source);
  const sourceLabel = source ? t(`detail.sources.${source}`) : candidate.source.replace("_", " ");
  const hasProcessing = rel.consents.some((c) => c.kind === "processing" && !c.revoked_at);

  return (
    <div className="grid gap-6">
      <PageHeader
        leading={<InitialsAvatar name={candidate.full_name} className="size-12 text-base" />}
        title={candidate.full_name}
        description={[candidate.headline || t("detail.noHeadline"), location].filter(Boolean).join(" · ")}
        actions={
          <>
            <StatusPill tone={st.tone} label={tg(`labels.candidateStatus.${candidate.status}`)} />
            {editable ? (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/w/${orgSlug}/candidates/${candidateId}/edit`}>
                    <Pencil className="size-4" aria-hidden /> {t("detail.edit")}
                  </Link>
                </Button>
                <CandidateStatusMenu orgSlug={orgSlug} candidateId={candidateId} status={candidate.status} />
              </>
            ) : null}
          </>
        }
      />
      {sp.created ? <Flash message={t("detail.created")} /> : null}
      {sp.updated ? <Flash message={t("detail.updated")} /> : null}

      {/* Only shows while matching is off: the one call to action on the page */}
      <MatchingSetup
        orgSlug={orgSlug}
        candidateId={candidateId}
        firstName={candidate.full_name.split(" ")[0] || candidate.full_name}
        status={candidate.status}
        hasPermission={hasProcessing}
        canWrite={canWrite}
      />

      {/* 1 · Who they are */}
      <Panel className="grid gap-6 p-6">
        <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
          <KeyFact label={t("detail.seniority")} value={seniority || "—"} />
          <KeyFact label={t("detail.salary")} value={salary} />
          <KeyFact label={t("detail.availableFrom")} value={candidate.available_from ? f.date(candidate.available_from) : "—"} tone={candidate.available_from ? "success" : undefined} />
          <KeyFact label={t("detail.owner")} value={candidate.owner?.full_name ?? "—"} />
        </dl>
        <div className="grid gap-6 border-t border-border/60 pt-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="grid content-start gap-5">
            <div>
              <Label>{t("detail.skills")}</Label>
              <SkillChips skills={candidate.skills} />
            </div>
            {candidate.summary ? <Disclosure summary={t("form.summary")}>{candidate.summary}</Disclosure> : null}
          </div>
          <div className="grid content-start gap-5">
            <div>
              <Label>{t("detail.languages")}</Label>
              <SkillChips skills={candidate.languages} />
            </div>
            <div>
              <Label>{t("detail.arrangement")}</Label>
              <SkillChips skills={arrangements} />
            </div>
            {candidate.email || candidate.phone ? (
              <div>
                <Label>{t("detail.contact")}</Label>
                <div className="flex flex-wrap gap-2">
                  {candidate.email ? (
                    <Button variant="outline" size="sm" className="max-w-full" asChild>
                      <a href={`mailto:${candidate.email}`}>
                        <Mail className="size-4" aria-hidden /> <span className="truncate">{candidate.email}</span>
                      </a>
                    </Button>
                  ) : null}
                  {candidate.phone ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${candidate.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" aria-hidden /> {candidate.phone}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* 2 · What to do with them */}
        <div className="grid content-start gap-6">
          <Panel>
            <SectionTitle
              action={
                matchingOn ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/w/${orgSlug}/opportunities?candidate=${candidateId}`}>{t("detail.allOpportunities")}</Link>
                  </Button>
                ) : null
              }
            >
              {t("detail.opportunities")}
              {matchingOn ? <Count n={opportunities.length} /> : null}
            </SectionTitle>
            {!matchingOn || opportunities.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                <Sparkles className="size-5 shrink-0" aria-hidden />
                {matchingOn ? t("detail.noOpportunities") : t("detail.matchingOff")}
              </div>
            ) : (
              <div className="-mx-3 grid gap-0.5">
                {opportunities.slice(0, 5).map((o) => (
                  <OpportunityCard key={o.match_id} opp={o as unknown as OpportunityView} orgSlug={orgSlug} context="candidate" />
                ))}
              </div>
            )}
          </Panel>

          <Panel id="referrals" className="scroll-mt-28">
            <SectionTitle>
              {t("detail.referrals")}
              <Count n={rel.referrals.length} />
            </SectionTitle>
            {rel.referrals.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                <Inbox className="size-5 shrink-0" aria-hidden />
                {t("detail.noReferrals")}
              </div>
            ) : (
              <ul className="-mx-2 grid gap-0.5">
                {rel.referrals.map((r) => (
                  <li key={r!.id}>
                    <Link href={`/w/${orgSlug}/referrals/${r!.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r!.job_title_snapshot}</span>
                        <span className="block text-xs text-muted-foreground">{f.relative(r!.updated_at)}</span>
                      </span>
                      <StatusPill tone={REFERRAL_STATUS[r!.status].tone} label={tg(`labels.referralStatus.${r!.status}`)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* 3 · Records: quieter, smaller titles */}
        <aside className="grid content-start gap-4">
          <Panel>
            <h2 className="mb-3 text-[15px] font-semibold">{t("detail.permission")}</h2>
            <ConsentPanel orgSlug={orgSlug} candidateId={candidateId} consents={rel.consents} canWrite={editable} />
          </Panel>
          <Panel>
            <h2 className="mb-3 text-[15px] font-semibold">{t("detail.resume")}</h2>
            <DocumentsPanel orgSlug={orgSlug} candidateId={candidateId} documents={rel.documents} canWrite={editable} />
          </Panel>
          <details className="group rounded-3xl border border-border/60 bg-card p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              {t("detail.privacyRecord")}
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-4 grid gap-4 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label={t("detail.source")}>{[sourceLabel, candidate.source_detail].filter(Boolean).join(" · ")}</Fact>
                <Fact label={t("detail.basis")}>{tg(`labels.legalBasis.${candidate.legal_basis}`)}</Fact>
                <Fact label={t("detail.privacyNotice")}>{candidate.privacy_notice_given_at ? f.date(candidate.privacy_notice_given_at) : t("detail.notRecorded")}</Fact>
                <Fact label={t("detail.lastReviewed")}>{f.date(candidate.last_reviewed_at)}</Fact>
                <Fact label={t("detail.createdAt")}>{f.date(candidate.created_at)}</Fact>
              </dl>
              {candidate.processing_purpose ? <Fact label={t("detail.purpose")}>{candidate.processing_purpose}</Fact> : null}
              {can(ctx, "candidates:anonymize") && candidate.status !== "deleted" ? (
                <div className="grid gap-3 border-t border-border/60 pt-4">
                  <div>
                    <p className="font-medium text-danger">{t("detail.deleteTitle")}</p>
                    <p className="mt-0.5 text-muted-foreground">{t("detail.deleteBody")}</p>
                  </div>
                  <div><AnonymizeButton orgSlug={orgSlug} candidateId={candidateId} /></div>
                </div>
              ) : null}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
