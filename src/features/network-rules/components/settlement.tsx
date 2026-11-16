"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight, ChevronRight, HandCoins, OctagonPause, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { useT } from "@/i18n/client";
import type { SettlementSummary } from "../types";

/**
 * Settlement mode (S22). The workspace layout knows the org's state; the blocked-route page (S22-c)
 * renders from `[orgSlug]/not-found.tsx`, which has no params, so the layout shares what it needs here.
 */
export type SettlementInfo = { orgSlug: string; isOrgAdmin: boolean; counts: SettlementSummary | null };

/** Count load error (S22): the same lines without the number ("0 referrals in progress" → "Referrals in progress"). */
const countless = (s: string) => {
  const rest = s.replace(/^[\d\s.,\u00a0\u202f]+/, "");
  return rest.charAt(0).toLocaleUpperCase() + rest.slice(1);
};

const SettlementContext = createContext<SettlementInfo | null>(null);

export function SettlementProvider({ value, children }: { value: SettlementInfo | null; children: ReactNode }) {
  return <SettlementContext value={value}>{children}</SettlementContext>;
}

export const useSettlement = () => useContext(SettlementContext);

/** "What you can still do": links with counts scoped to in-flight records (S22-b, S22-c). */
export function SettlementCanDo({ orgSlug, isOrgAdmin, counts, headingLevel = "h2" }: SettlementInfo & { headingLevel?: "h2" | "h3" }) {
  const t = useT("network");
  const ts = useT("settings");
  const base = `/workspace/${orgSlug}`;
  const H = headingLevel;
  const line = (n: number | undefined, key: "referrals" | "placements" | "disputes") => (counts ? (n ? t(`settlement.${key}`, { count: n }) : t("settlement.nothingLeft")) : null);
  const items = [
    { href: `${base}/referrals`, icon: ArrowLeftRight, label: line(counts?.referrals_in_progress, "referrals") ?? countless(t("settlement.referrals", { count: 2 })) },
    { href: `${base}/commissions`, icon: HandCoins, label: line(counts?.commissions_open, "placements") ?? countless(t("settlement.placements", { count: 2 })) },
    { href: `${base}/referrals`, icon: Scale, label: line(counts?.disputes_to_answer, "disputes") ?? countless(t("settlement.disputes", { count: 2 })) },
    ...(isOrgAdmin ? [{ href: `${base}/settings/standing`, icon: ShieldCheck, label: ts("nav.standing") }] : []),
  ];
  return (
    <section className="grid gap-3" aria-labelledby="settlement-can-do">
      <H id="settlement-can-do" className="text-base font-semibold">{t("settlement.canDo")}</H>
      {!counts ? <p className="text-sm text-muted-foreground">{t("settlement.loadCountsError")}</p> : null}
      <ul className="grid gap-2">
        {items.map((i, k) => (
          <li key={k}>
            <Link href={i.href} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm font-medium hover:bg-accent">
              <i.icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1 text-pretty">{i.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** S22-c: in place of a page outside the settlement allow-list (BR-34). */
export function SettlementBlockedPage({ info }: { info: SettlementInfo }) {
  const t = useT("network");
  return (
    <div className="mx-auto grid max-w-2xl gap-6 py-10">
      <Panel className="grid gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-muted" aria-hidden>
          <OctagonPause className="size-5 text-muted-foreground" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{t("settlement.blockedTitle")}</h1>
        <p className="text-sm text-muted-foreground text-pretty">{t("settlement.blockedDescription")}</p>
        <Button asChild className="min-h-11 w-full justify-self-start sm:w-auto">
          <Link href={`/workspace/${info.orgSlug}/referrals`}>{t("settlement.goReferrals")}</Link>
        </Button>
      </Panel>
      <SettlementCanDo {...info} />
    </div>
  );
}
