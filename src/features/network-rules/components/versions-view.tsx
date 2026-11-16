import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { ExpandableText } from "@/components/shared/expandable-text";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Logo } from "@/components/layout/logo";
import { AccountMenu } from "@/components/layout/account-menu";
import type { SessionUser } from "@/server/auth/context";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { RulesLocale } from "../domain";
import { RULES_LOCALE_KEY, rulesLocaleOrder } from "../locale";
import type { RulesVersionSummary, RulesVersionText } from "../types";
import { RulesText, RulesToc } from "./rules-text";

/** S4 shell: logo, Back, account menu. No workspace sidebar (works during the gate, settlement, no org). */
export async function VersionsShell({ user, backHref, children }: { user: SessionUser; backHref: string; children: ReactNode }) {
  const tg = await getGlobalT();
  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {tg("common.skipToContent")}
      </a>
      <header className="border-b border-border/60 bg-sidebar">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo compact />
            <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
              <Link href={backHref}>
                <ArrowLeft className="size-4" aria-hidden /> {tg("common.actions.back")}
              </Link>
            </Button>
          </div>
          <div className="w-full sm:w-64">
            <AccountMenu user={user} hideProfile />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}

/** Language switch for the versions page: links that set ?lang= (UI locale unchanged). */
export async function RulesLanguageNav({ active, defaultLocale, hrefFor }: { active: RulesLocale; defaultLocale: RulesLocale; hrefFor: (l: RulesLocale) => string }) {
  const t = await getT("network");
  return (
    <div className="grid gap-2">
      <SegmentedNav
        label={t("accept.language")}
        active={active}
        segments={rulesLocaleOrder(defaultLocale).map((l) => ({ key: l, label: t(`accept.languageOption.${RULES_LOCALE_KEY[l]}`), href: hrefFor(l) }))}
      />
    </div>
  );
}

/** One version: label, date, TOC, full text and the SHA-256 fingerprint of the displayed locale. */
export async function VersionText({ version, text, locale, heading, isFuture }: { version: RulesVersionSummary; text: RulesVersionText | null; locale: RulesLocale; heading: string; isFuture: boolean }) {
  const [t, f] = await Promise.all([getT("network"), getFormatter()]);
  return (
    <section aria-labelledby="rules-current" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="rules-current" className="text-lg font-semibold tracking-tight">{heading}</h2>
        <p className="text-sm text-muted-foreground">{isFuture ? t("versions.takesEffect", { date: f.etDate(version.effective_at) }) : t("versions.inEffect", { date: f.etDate(version.effective_at) })}</p>
      </div>
      {text ? (
        <>
          <details className="group rounded-2xl border border-border/60 px-4 py-3 text-sm lg:hidden">
            <summary className="min-h-9 cursor-pointer font-medium">{t("accept.contents")}</summary>
            <div className="mt-2">
              <RulesToc sections={text.sections ?? []} locale={locale} label={t("accept.contents")} />
            </div>
          </details>
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="hidden lg:block">
              <div className="sticky top-6 grid gap-2">
                <p className="text-sm font-semibold">{t("accept.contents")}</p>
                <RulesToc sections={text.sections ?? []} locale={locale} label={t("accept.contents")} />
              </div>
            </div>
            <div className="grid min-w-0 gap-4">
              <Panel className="sm:p-6">
                <RulesText body={text.body} locale={locale} />
              </Panel>
              <details className="group rounded-2xl border border-border/60 px-4 py-3 text-sm">
                <summary className="min-h-9 cursor-pointer font-medium">{t("versions.fingerprint")}</summary>
                <p className="mt-2 text-muted-foreground">{t("versions.fingerprintHint")}</p>
                <p className="mt-2 font-mono text-xs break-all" translate="no">{text.sha256}</p>
              </details>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("accept.noVersion")}</p>
      )}
    </section>
  );
}

export async function UpcomingCard({ version, summary, href }: { version: RulesVersionSummary; summary: string | null; href: string }) {
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  return (
    <Panel id="upcoming" className="grid scroll-mt-6 gap-3 border-info/30 bg-info-soft/40">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("versions.upcoming", { label: version.label })}</h2>
        <Badge variant="outline">{tg(`labels.rulesVersionType.${version.type}`)}</Badge>
      </div>
      <p className="text-sm font-medium">{t("versions.takesEffect", { date: f.etDate(version.effective_at) })}</p>
      {summary ? <p className="text-sm whitespace-pre-line text-pretty">{summary}</p> : null}
      {version.legal_reason ? <p className="text-sm text-pretty">{t("versions.legalReason", { reason: version.legal_reason })}</p> : null}
      <Button asChild variant="outline" className="min-h-11 w-full justify-self-start sm:min-h-9 sm:w-auto">
        <Link href={href}>{t("versions.readFull")}</Link>
      </Button>
    </Panel>
  );
}

export async function HistoryTable({ rows, hrefFor }: { rows: (RulesVersionSummary & { summary: string | null })[]; hrefFor: (label: string) => string }) {
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="rules-history" className="grid gap-3">
      <h2 id="rules-history" className="text-lg font-semibold tracking-tight">{t("versions.history")}</h2>
      {/* Cards at 375px, a table from md up. */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((v) => (
          <li key={v.id}>
            <Panel className="grid gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{v.label}</p>
                <Badge variant="outline">{tg(`labels.rulesVersionType.${v.type}`)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t("versions.inEffect", { date: f.etDate(v.effective_at) })}</p>
              {v.summary ? <ExpandableText text={v.summary} lines={2} moreLabel={tg("referrals.detail.showMore")} lessLabel={tg("referrals.detail.showLess")} /> : null}
              <Link href={hrefFor(v.label)} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t("versions.read", { label: v.label })}</Link>
            </Panel>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Panel className="p-0">
          <Table>
            <TableCaption className="sr-only">{t("versions.historyCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("versions.col.version")}</TableHead>
                <TableHead>{t("versions.col.type")}</TableHead>
                <TableHead>{t("versions.col.effective")}</TableHead>
                <TableHead>{t("versions.col.changes")}</TableHead>
                <TableHead><span className="sr-only">{t("versions.readFull")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.label}</TableCell>
                  <TableCell>{tg(`labels.rulesVersionType.${v.type}`)}</TableCell>
                  <TableCell className="whitespace-nowrap">{f.etDate(v.effective_at)}</TableCell>
                  <TableCell className="max-w-md whitespace-normal">{v.summary ? <ExpandableText text={v.summary} lines={2} moreLabel={tg("referrals.detail.showMore")} lessLabel={tg("referrals.detail.showLess")} /> : "—"}</TableCell>
                  <TableCell>
                    <Link href={hrefFor(v.label)} className="text-sm font-medium underline underline-offset-4">{t("versions.read", { label: v.label })}</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </section>
  );
}

export async function VersionsEmpty() {
  const t = await getT("network");
  return <EmptyState icon={ScrollText} title={t("versions.empty")} description={t("versions.description")} />;
}
