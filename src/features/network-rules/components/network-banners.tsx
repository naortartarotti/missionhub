import Link from "next/link";
import { CalendarClock, Info, PauseCircle, ScrollText, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { RequestContext } from "@/server/auth/context";
import { getFormatter, getT } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { selectBanners, type BannerKind } from "../ui-state";

/**
 * S3: the restriction / notice banners at the top of <main>, above the page header. Server-rendered
 * from the request context only (EC-7). Not dismissible (BR-8, BR-38). `role="status"`.
 */
export async function NetworkBanners({ ctx }: { ctx: RequestContext }) {
  const isAdmin = ctx.membershipRole === "org_admin";
  const kinds = selectBanners({ restriction: ctx.restriction, settlementMode: ctx.settlementMode, settlementKind: ctx.settlementKind, rules: ctx.rules, isOrgAdmin: isAdmin });
  if (!kinds.length) return null;
  const [t, f] = await Promise.all([getT("network"), getFormatter()]);
  const base = `/workspace/${ctx.organizationSlug}`;
  const standing = `${base}/settings/standing`;
  const accept = (label?: string) => `${base}/accept-rules${label ? `?v=${encodeURIComponent(label)}` : ""}`;
  const required = ctx.rules.required ?? ctx.rules.current;
  const upcoming = ctx.rules.upcoming;

  const render = (kind: BannerKind): ReactNode => {
    switch (kind) {
      case "settlement_suspended":
      case "settlement_terminated": {
        const terminated = kind === "settlement_terminated";
        return (
          <Banner
            key={kind}
            tone="danger"
            icon={Scale}
            title={terminated ? t("banner.settlement.terminated.title", { date: f.etDate(ctx.terminatedAt) }) : t("banner.settlement.suspended.title")}
            body={terminated ? t("banner.settlement.terminated.body") : t("banner.settlement.suspended.body")}
            actions={isAdmin ? [{ href: standing, label: t("banner.cta.standing") }] : []}
          />
        );
      }
      case "hold":
        return (
          <Banner
            key={kind}
            tone="warning"
            icon={PauseCircle}
            title={t("banner.hold.title")}
            body={t("banner.hold.body")}
            actions={isAdmin ? [{ href: standing, label: t("banner.cta.standing") }] : []}
          />
        );
      case "rules_org":
        return (
          <Banner
            key={kind}
            tone="warning"
            icon={ScrollText}
            title={t("banner.rules.title", { label: required?.label ?? "" })}
            body={
              <>
                {t("banner.rules.body", { org: ctx.organizationName, date: f.etDate(required?.effectiveAt) })}
                {isAdmin ? null : <> {t("banner.rules.askAdmin")}</>}
              </>
            }
            actions={isAdmin ? [{ href: accept(required?.label), label: t("banner.cta.accept") }] : []}
          />
        );
      case "rules_user":
        return (
          <Banner
            key={kind}
            tone="warning"
            icon={ScrollText}
            title={t("banner.user.title", { label: required?.label ?? "" })}
            body={t("banner.user.body", { date: f.etDate(required?.effectiveAt) })}
            actions={[{ href: accept(required?.label), label: t("banner.cta.accept") }]}
          />
        );
      case "notice":
        return (
          <Banner
            key={kind}
            tone="info"
            icon={CalendarClock}
            compactOnMobile
            detailsLabel={t("banner.cta.details")}
            title={t("banner.notice.title", { label: upcoming?.label ?? "", date: f.etDate(upcoming?.effectiveAt) })}
            body={
              <>
                {t("banner.notice.body")}
                {isAdmin && !ctx.rules.orgAcceptedUpcoming?.at ? <> {t("banner.notice.orgPending", { org: ctx.organizationName })}</> : null}
              </>
            }
            actions={[
              { href: accept(upcoming?.label), label: t("banner.cta.accept") },
              { href: `/network-rules?org=${encodeURIComponent(ctx.organizationSlug)}#upcoming`, label: t("banner.cta.changes"), secondary: true },
            ]}
          />
        );
    }
  };

  return <div className="grid gap-2 pt-4">{kinds.map(render)}</div>;
}

const TONES = {
  info: "border-info/30 bg-info-soft",
  warning: "border-warning/30 bg-warning-soft",
  danger: "border-danger/30 bg-danger-soft",
} as const;
const ICON_TONES = { info: "text-info", warning: "text-warning", danger: "text-danger" } as const;

export function Banner({
  tone,
  icon: Icon = Info,
  title,
  body,
  actions,
  compactOnMobile,
  detailsLabel,
}: {
  tone: keyof typeof TONES;
  icon?: typeof Info;
  title: string;
  body: ReactNode;
  actions: { href: string; label: string; secondary?: boolean }[];
  /** B5 under 640px: title + the first action, body behind a Details disclosure (S3 mobile note). */
  compactOnMobile?: boolean;
  detailsLabel?: string;
}) {
  const actionRow = actions.length ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {actions.map((a, i) => (
        <Button key={a.href} asChild size="sm" variant={a.secondary || i > 0 ? "outline" : "default"} className={cn("min-h-11 w-full sm:min-h-9 sm:w-auto", compactOnMobile && i > 0 && "hidden sm:inline-flex")}>
          <Link href={a.href}>{a.label}</Link>
        </Button>
      ))}
    </div>
  ) : null;
  return (
    <div role="status" className={cn("grid gap-3 rounded-2xl border px-4 py-3 text-sm text-foreground lg:flex lg:items-center lg:justify-between", TONES[tone])}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_TONES[tone])} aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-pretty">{title}</p>
          {compactOnMobile ? (
            <>
              <p className="hidden text-pretty text-foreground/80 sm:block">{body}</p>
              <details className="group sm:hidden">
                <summary className="mt-1 inline-flex min-h-11 cursor-pointer items-center font-medium underline underline-offset-4">{detailsLabel}</summary>
                <p className="mt-1 text-pretty text-foreground/80">{body}</p>
              </details>
            </>
          ) : (
            <p className="text-pretty text-foreground/80">{body}</p>
          )}
        </div>
      </div>
      {actionRow}
    </div>
  );
}
