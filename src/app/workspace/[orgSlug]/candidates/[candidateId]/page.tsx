import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookUser, BriefcaseBusiness, CalendarDays, FileText, Globe2, Inbox, Link2, Mail, Pencil, Phone, Plane, ShieldAlert, Sparkles, Stamp, Truck, UserRound } from "lucide-react";
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
import { ExpandableText } from "@/components/shared/expandable-text";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { CandidatePhoto } from "@/features/candidates/components/candidate-photo";
import { Flash } from "@/components/shared/flash";
import { CANDIDATE_STATUS, REFERRAL_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getLocale, getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("detail.metaTitle") };
}

/** Headline number in the stats row above the tabs. */
function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" }) {
  return (
    <div className="min-w-0 rounded-3xl border border-border/60 bg-card p-5">
      <p className={cn("text-xl leading-tight font-semibold tracking-tight text-balance tabular-nums 2xl:text-2xl", tone === "success" && "text-success")}>{value}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{label}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Icon + label + value row, for contact details and mobility facts. */
function InfoRow({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</div>
      </div>
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

/** Quiet empty state inside a tab. */
function Empty({ icon: Icon, children }: { icon: typeof Inbox; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
      <Icon className="size-5 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

const TABS = ["profile", "opportunities", "referrals", "documents", "privacy"] as const;
type Tab = (typeof TABS)[number];

export default async function CandidatePage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/candidates/[candidateId]">) {
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
  const tab: Tab = TABS.find((k) => k === sp.tab) ?? "profile";
  const photoSrc = candidate.photo_path ? `/workspace/${orgSlug}/candidates/${candidateId}/photo?v=${encodeURIComponent(candidate.photo_path.split("/").pop() ?? "")}` : null;
  const bestScore = opportunities.reduce((m, o) => Math.max(m, (o as unknown as OpportunityView).score ?? 0), 0);
  const firstName = candidate.full_name.split(" ")[0] || candidate.full_name;
  const address = [candidate.location_city, candidate.location_region, candidate.postal_code].filter(Boolean).join(", ");
  const relocation = candidate.relocation_scope ?? (candidate.open_to_relocation ? "country" : null);
  const locale = await getLocale();
  const regionNames = (() => {
    try {
      return new Intl.DisplayNames([INTL_LOCALE[locale]], { type: "region" });
    } catch {
      return null;
    }
  })();
  const countryName = (code: string) => regionNames?.of(code) ?? code;
  const list = (items: string[]) => (items.length ? items.map(countryName).join(", ") : null);
  const base = `/workspace/${orgSlug}/candidates/${candidateId}`;
  const segments = TABS.map((k) => ({
    key: k,
    label: t(`detail.tabs.${k}`),
    href: k === "profile" ? base : `${base}?tab=${k}`,
    count: k === "opportunities" ? (matchingOn ? opportunities.length : undefined) : k === "referrals" ? rel.referrals.length : k === "documents" ? rel.documents.length : undefined,
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        leading={
          <Button variant="outline" size="icon" asChild className="rounded-full">
            <Link href={`/workspace/${orgSlug}/candidates`} aria-label={t("detail.back")}>
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
        }
        eyebrow={
          <Link href={`/workspace/${orgSlug}/candidates`} className="hover:text-foreground">
            {t("title")}
          </Link>
        }
        title={t("detail.pageTitle")}
        actions={
          editable ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`${base}/edit`}>
                  <Pencil className="size-4" aria-hidden /> {t("detail.edit")}
                </Link>
              </Button>
              <CandidateStatusMenu orgSlug={orgSlug} candidateId={candidateId} status={candidate.status} />
            </>
          ) : null
        }
      />
      {sp.created ? <Flash message={t("detail.created")} /> : null}
      {sp.updated ? <Flash message={t("detail.updated")} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Profile card: who they are and how to reach them. Stays in view while the tabs scroll. */}
        <Panel className="overflow-hidden p-0 lg:sticky lg:top-28">
          <div className="relative h-24 bg-gradient-to-br from-tile-lilac via-tile-blue to-tile-yellow">
            <div className="absolute top-3 right-3">
              <StatusPill tone={st.tone} label={tg(`labels.candidateStatus.${candidate.status}`)} />
            </div>
          </div>
          <div className="grid gap-6 px-6 pb-6">
            <div className="-mt-14">
              <CandidatePhoto orgSlug={orgSlug} candidateId={candidateId} name={candidate.full_name} src={photoSrc} canWrite={editable} />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-balance">{candidate.full_name}</h2>
              <p className="mt-1 text-[15px] text-muted-foreground">{candidate.headline || t("detail.noHeadline")}</p>
              {seniority ? (
                <span className="mt-3 inline-flex rounded-full bg-tile-lilac px-3 py-1 text-xs font-semibold text-tile-foreground">{seniority}</span>
              ) : null}
            </div>

            <div className="grid gap-3.5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("detail.contactTitle")}</h3>
              <InfoRow icon={Mail} label={t("detail.email")}>
                {candidate.email ? <a href={`mailto:${candidate.email}`} className="hover:underline">{candidate.email}</a> : null}
              </InfoRow>
              <InfoRow icon={Phone} label={t("detail.phone")}>
                {candidate.phone ? <a href={`tel:${candidate.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{candidate.phone}</a> : null}
              </InfoRow>
              <InfoRow icon={Link2} label="LinkedIn">
                {candidate.linkedin_url ? (
                  <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                    {candidate.linkedin_url.replace(/^https:\/\/(www\.)?linkedin\.com/i, "").replace(/\/$/, "") || "LinkedIn"}
                  </a>
                ) : null}
              </InfoRow>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{t("detail.location")}</p>
                <p className="mt-0.5 text-sm font-medium break-words">{address || "—"}</p>
              </div>
              <div className="rounded-2xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{t("detail.country")}</p>
                <p className="mt-0.5 text-sm font-medium">{candidate.location_country ? countryName(candidate.location_country) : "—"}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("detail.skills")}</h3>
                <SkillChips skills={candidate.skills} max={8} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("detail.arrangement")}</h3>
                <SkillChips skills={arrangements} />
              </div>
            </div>

            <p className="flex items-center gap-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
              <BookUser className="size-4" aria-hidden /> {t("detail.ownedBy", { name: candidate.owner?.full_name ?? "—" })}
            </p>
            {candidate.email ? (
              <Button asChild className="w-full">
                <a href={`mailto:${candidate.email}`}>
                  <Mail className="size-4" aria-hidden /> {t("detail.contactName", { name: firstName })}
                </a>
              </Button>
            ) : null}
          </div>
        </Panel>

        <div className="grid min-w-0 content-start gap-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label={t("detail.opportunities")} value={matchingOn ? String(opportunities.length) : "—"} hint={matchingOn && opportunities.length ? t("detail.bestMatch", { score: String(bestScore) }) : undefined} />
            <Stat label={t("detail.referrals")} value={String(rel.referrals.length)} />
            <Stat label={t("detail.salary")} value={salary} />
            <Stat label={t("detail.availableFrom")} value={candidate.available_from ? f.date(candidate.available_from) : "—"} tone={candidate.available_from ? "success" : undefined} />
          </div>

          {/* Only shows while matching is off: the one call to action on the page */}
          <MatchingSetup orgSlug={orgSlug} candidateId={candidateId} firstName={firstName} status={candidate.status} hasPermission={hasProcessing} canWrite={canWrite} />

          <SegmentedNav label={t("detail.tabs.label")} segments={segments} active={tab} />

          {tab === "profile" ? (
            <div className="grid gap-6">
              <Panel className="p-6">
                <SectionTitle>{t("detail.about")}</SectionTitle>
                {candidate.summary ? (
                  <ExpandableText text={candidate.summary} lines={8} moreLabel={t("detail.showMore")} lessLabel={t("detail.showLess")} />
                ) : (
                  <Empty icon={UserRound}>{editable ? t("detail.noSummaryEdit") : t("detail.noSummary")}</Empty>
                )}
              </Panel>

              <Panel className="p-6">
                <SectionTitle>{t("detail.mobilityTitle")}</SectionTitle>
                <div className="grid gap-5 sm:grid-cols-2">
                  <InfoRow icon={Plane} label={t("detail.travel")}>
                    {candidate.travel_availability ? t(`mobility.travel.${candidate.travel_availability as "none" | "occasional" | "frequent"}`) : null}
                  </InfoRow>
                  <InfoRow icon={Truck} label={t("detail.relocation")}>
                    {relocation ? (
                      <>
                        {t(`mobility.relocation.${relocation as "none" | "region" | "country" | "international"}`)}
                        {relocation !== "none" && candidate.relocation_destinations.length ? (
                          <span className="block font-normal text-muted-foreground">{t("detail.destinations", { list: list(candidate.relocation_destinations) ?? "" })}</span>
                        ) : null}
                      </>
                    ) : null}
                  </InfoRow>
                  <InfoRow icon={Stamp} label={t("detail.passport")}>
                    {candidate.has_passport === null ? null : candidate.has_passport ? (
                      <>
                        {t("mobility.passport.yes")}
                        {candidate.passport_countries.length ? <span className="block font-normal text-muted-foreground">{list(candidate.passport_countries)}</span> : null}
                      </>
                    ) : (
                      t("mobility.passport.no")
                    )}
                  </InfoRow>
                  <InfoRow icon={Globe2} label={t("detail.workAuthorization")}>{list(candidate.work_authorization)}</InfoRow>
                </div>
                <p className="mt-5 text-xs text-muted-foreground">{t("detail.mobilityPrivacy")}</p>
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel className="p-6">
                  <SectionTitle>{t("detail.experience")}</SectionTitle>
                  {rel.experiences.length === 0 ? (
                    <Empty icon={BriefcaseBusiness}>{t("detail.noExperience")}</Empty>
                  ) : (
                    <ol className="grid gap-4">
                      {rel.experiences.map((e) => (
                        <li key={e.id} className="flex gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden>
                            <BriefcaseBusiness className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium">{e.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {[e.company, [e.start_date ? f.date(e.start_date) : null, e.end_date ? f.date(e.end_date) : e.start_date ? t("detail.present") : null].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
                <Panel className="p-6">
                  <SectionTitle>{t("detail.languages")}</SectionTitle>
                  <SkillChips skills={candidate.languages} />
                  <dl className="mt-5 grid gap-3 border-t border-border/60 pt-5 text-sm">
                    <Fact label={t("detail.source")}>{[sourceLabel, candidate.source_detail].filter(Boolean).join(" · ")}</Fact>
                    <Fact label={t("detail.createdAt")}>{f.date(candidate.created_at)}</Fact>
                  </dl>
                </Panel>
              </div>
            </div>
          ) : null}
          {tab === "opportunities" ? (
            <Panel>
              <SectionTitle
                action={
                  matchingOn && opportunities.length ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/workspace/${orgSlug}/opportunities?candidate=${candidateId}`}>{t("detail.allOpportunities")}</Link>
                    </Button>
                  ) : null
                }
              >
                {t("detail.opportunities")}
              </SectionTitle>
              {!matchingOn || opportunities.length === 0 ? (
                <Empty icon={Sparkles}>{matchingOn ? t("detail.noOpportunities") : t("detail.matchingOff")}</Empty>
              ) : (
                <div className="-mx-3 grid gap-0.5">
                  {opportunities.map((o) => (
                    <OpportunityCard key={o.match_id} opp={o as unknown as OpportunityView} orgSlug={orgSlug} context="candidate" />
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {tab === "referrals" ? (
            <Panel>
              <SectionTitle>{t("detail.referrals")}</SectionTitle>
              {rel.referrals.length === 0 ? (
                <Empty icon={Inbox}>{t("detail.noReferrals")}</Empty>
              ) : (
                <ul className="-mx-2 grid gap-0.5">
                  {rel.referrals.map((r) => (
                    <li key={r!.id}>
                      <Link href={`/workspace/${orgSlug}/referrals/${r!.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden>
                          <BriefcaseBusiness className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r!.job_title_snapshot}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3" aria-hidden /> {f.relative(r!.updated_at)}
                          </span>
                        </span>
                        <StatusPill tone={REFERRAL_STATUS[r!.status].tone} label={tg(`labels.referralStatus.${r!.status}`)} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === "documents" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel className="p-6">
                <SectionTitle>
                  <span className="inline-flex items-center gap-2"><FileText className="size-4" aria-hidden /> {t("detail.resume")}</span>
                </SectionTitle>
                <DocumentsPanel orgSlug={orgSlug} candidateId={candidateId} documents={rel.documents} canWrite={editable} />
              </Panel>
              <Panel className="p-6">
                <SectionTitle>{t("detail.permission")}</SectionTitle>
                <ConsentPanel orgSlug={orgSlug} candidateId={candidateId} consents={rel.consents} canWrite={editable} />
              </Panel>
            </div>
          ) : null}

          {tab === "privacy" ? (
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <Panel className="p-6">
                <SectionTitle>{t("detail.privacyRecord")}</SectionTitle>
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <Fact label={t("detail.source")}>{[sourceLabel, candidate.source_detail].filter(Boolean).join(" · ")}</Fact>
                  <Fact label={t("detail.basis")}>{tg(`labels.legalBasis.${candidate.legal_basis}`)}</Fact>
                  <Fact label={t("detail.privacyNotice")}>{candidate.privacy_notice_given_at ? f.date(candidate.privacy_notice_given_at) : t("detail.notRecorded")}</Fact>
                  <Fact label={t("detail.lastReviewed")}>{f.date(candidate.last_reviewed_at)}</Fact>
                  <Fact label={t("detail.createdAt")}>{f.date(candidate.created_at)}</Fact>
                  {candidate.processing_purpose ? <Fact label={t("detail.purpose")}>{candidate.processing_purpose}</Fact> : null}
                </dl>
              </Panel>
              {can(ctx, "candidates:anonymize") && candidate.status !== "deleted" ? (
                <Panel className="grid content-start gap-3 border-danger/30 p-6 text-sm">
                  <p className="flex items-center gap-2 text-[15px] font-semibold text-danger">
                    <ShieldAlert className="size-4" aria-hidden /> {t("detail.deleteTitle")}
                  </p>
                  <p className="text-muted-foreground">{t("detail.deleteBody")}</p>
                  <div><AnonymizeButton orgSlug={orgSlug} candidateId={candidateId} /></div>
                </Panel>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
