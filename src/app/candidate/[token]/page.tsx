import type { Metadata } from "next";
import { Briefcase, CheckCircle2, Clock, FileText, Laptop, Link2Off, Lock, MapPin, ShieldCheck, TrendingUp, XCircle, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Panel } from "@/components/shared/card";
import { ExpandableText } from "@/components/shared/expandable-text";
import { createClient } from "@/server/supabase/server";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { DISCLOSURE_FIELDS, type DisclosureKey } from "@/features/referrals/disclosure";
import { CandidateResponseForm, type CandidateProfile } from "@/features/referrals/components/candidate-response-form";
import { minorToMajorString } from "@/lib/money/format";

// The token is a credential: keep it out of search engines and out of Referer headers.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("candidate"))("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

type RequestView = {
  state: "pending" | "confirmed" | "declined" | "expired" | "closed";
  expires_at?: string;
  recruiter: { org: string; name: string | null };
  job: {
    title: string;
    org: string;
    client?: string | null;
    location?: string | null;
    work_arrangement?: "remote" | "hybrid" | "onsite";
    contract_type?: "permanent" | "contract" | "temporary" | "contract_to_hire";
    seniority?: "intern" | "junior" | "mid" | "senior" | "lead" | "principal" | "executive" | null;
    description?: string | null;
  };
  fields?: string[];
  documents?: string[];
  note?: string | null;
  candidate?: {
    full_name: string;
    email: string | null;
    phone: string | null;
    headline: string | null;
    summary: string | null;
    location_city: string | null;
    location_region: string | null;
    location_country: string | null;
    open_to_relocation: boolean;
    travel_availability?: string | null;
    relocation_scope?: string | null;
    relocation_destinations?: string[];
    work_authorization?: string[];
    has_passport?: boolean | null;
    work_arrangements: string[];
    skills: string[];
    languages: string[];
    salary_expectation_min: number | null;
    salary_expectation_max: number | null;
    salary_currency: string | null;
    available_from: string | null;
  };
};

const isDisclosureKey = (k: string): k is DisclosureKey => DISCLOSURE_FIELDS.some((f) => f.key === k);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-[720px] gap-6">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </main>
  );
}

export default async function CandidateRequestPage({ params }: PageProps<"/candidate/[token]">) {
  const { token } = await params;
  const [t, tg, f] = await Promise.all([getT("candidate"), getGlobalT(), getFormatter()]);
  const valid = /^[A-Za-z0-9_-]{32,128}$/.test(token);
  const { data } = valid ? await (await createClient()).rpc("get_candidate_request", { p_token: token }) : { data: null };
  const view = data as RequestView | null;

  if (!view || view.state !== "pending" || !view.candidate) {
    const state = view?.state ?? "invalid";
    const icon: Record<string, LucideIcon> = { confirmed: CheckCircle2, declined: XCircle, expired: Clock, closed: Link2Off, invalid: Link2Off, pending: Link2Off };
    const tone = state === "confirmed" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground";
    const Icon = icon[state];
    const vars = { org: view?.recruiter.org ?? "", partner: view?.job.org ?? "", job: view?.job.title ?? "" };
    const key = state === "pending" ? "invalid" : state;
    return (
      <Shell>
        <Panel className="grid justify-items-center gap-3 p-8 text-center sm:p-10">
          <span className={`grid size-14 place-items-center rounded-full ${tone}`} aria-hidden>
            <Icon className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{t(`states.${key}.title`)}</h1>
          <p className="max-w-md text-[15px] text-pretty text-muted-foreground">{t(`states.${key}.body`, vars)}</p>
        </Panel>
      </Shell>
    );
  }

  const { job, candidate: c, recruiter } = view;
  const partner = job.org;
  const fields = (view.fields ?? []).filter(isDisclosureKey);
  const facts: { icon: LucideIcon; label: string }[] = [
    job.location ? { icon: MapPin, label: job.location } : null,
    job.work_arrangement ? { icon: Laptop, label: tg(`labels.arrangement.${job.work_arrangement}`) } : null,
    job.contract_type ? { icon: Briefcase, label: tg(`labels.contract.${job.contract_type}`) } : null,
    job.seniority ? { icon: TrendingUp, label: tg(`labels.seniority.${job.seniority}`) } : null,
  ].filter((x): x is { icon: LucideIcon; label: string } => x !== null);

  const currency = c.salary_currency ?? "";
  const profile: CandidateProfile = {
    fullName: c.full_name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    headline: c.headline ?? "",
    summary: c.summary ?? "",
    locationCity: c.location_city ?? "",
    locationRegion: c.location_region ?? "",
    locationCountry: c.location_country ?? "",
    travelAvailability: c.travel_availability ?? "",
    relocationScope: c.relocation_scope ?? (c.open_to_relocation ? "country" : ""),
    relocationDestinations: c.relocation_destinations ?? [],
    workAuthorization: c.work_authorization ?? [],
    hasPassport: c.has_passport == null ? "" : c.has_passport ? "yes" : "no",
    workArrangements: c.work_arrangements,
    skills: c.skills.join(", "),
    languages: c.languages.join(", "),
    salaryMin: c.salary_expectation_min != null && currency ? minorToMajorString(c.salary_expectation_min, currency).replace(/\.0+$/, "") : "",
    salaryMax: c.salary_expectation_max != null && currency ? minorToMajorString(c.salary_expectation_max, currency).replace(/\.0+$/, "") : "",
    salaryCurrency: currency,
    availableFrom: c.available_from ?? "",
  };

  return (
    <Shell>
      <Panel className="overflow-hidden p-0">
        <div className="h-20 bg-gradient-to-r from-tile-blue via-tile-lilac to-tile-yellow" aria-hidden />
        <div className="grid gap-3 p-6 sm:p-8">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3.5" aria-hidden /> {t("privateBadge")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t("title", { recruiter: recruiter.name || recruiter.org })}</h1>
          <p className="text-[15px] text-pretty text-muted-foreground">{t("intro", { partner })}</p>
          {view.expires_at ? <p className="text-sm text-muted-foreground">{t("expires", { date: f.date(view.expires_at) })}</p> : null}
        </div>
      </Panel>

      <Panel className="grid gap-4 p-6 sm:p-8">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("job.heading")}</p>
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-tile-blue text-tile-foreground" aria-hidden>
            <Briefcase className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-semibold tracking-tight">{job.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.client ?? t("job.confidentialClient")} · {t("job.hiringOrg", { partner })}
            </p>
          </div>
        </div>
        {facts.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {facts.map((x) => (
              <li key={x.label} className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium">
                <x.icon className="size-3.5 text-muted-foreground" aria-hidden /> {x.label}
              </li>
            ))}
          </ul>
        ) : null}
        {job.description ? (
          <div className="border-t border-border/60 pt-4 text-sm leading-relaxed text-muted-foreground">
            <ExpandableText text={job.description} lines={5} moreLabel={tg("referrals.detail.showMore")} lessLabel={tg("referrals.detail.showLess")} />
          </div>
        ) : null}
      </Panel>

      <Panel className="grid gap-4 p-6 sm:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("shared.heading", { partner })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("shared.body")}</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {fields.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm">
              <ShieldCheck className="size-3.5 text-success" aria-hidden /> {tg(`referrals.disclosure.${k}`)}
            </li>
          ))}
        </ul>
        {view.documents?.length ? (
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("shared.documents")}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {view.documents.map((d) => (
                <li key={d} className="flex items-center gap-3 rounded-2xl border border-border/60 p-3 text-sm font-medium">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden /> <span className="truncate">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {view.note ? (
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("shared.note", { org: recruiter.org, partner })}</h3>
            <p className="rounded-2xl bg-muted/50 p-3 text-sm whitespace-pre-line">{view.note}</p>
          </div>
        ) : null}
      </Panel>

      <CandidateResponseForm token={token} profile={profile} org={recruiter.org} partner={partner} job={job.title} />
    </Shell>
  );
}
