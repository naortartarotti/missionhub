import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { getRequestContext } from "@/server/auth/context";
import { getFormatter, getT } from "@/i18n/server";
import { getIncidentNotice } from "@/features/network-rules/queries";
import { getNoticeI18n } from "@/features/network-rules/page-data";
import { INTL_RULES_LANG } from "@/features/network-rules/locale";

export async function generateMetadata() {
  return { title: (await getT("network"))("incident.title") };
}

/**
 * S25 data incident notice (RD-045): recipient org admins only. The admin's factual text, the
 * referrals concerned (linked when still visible) and the stored guidance line(s) for this org's
 * side(s), sourcing first. Never the sanction, the outcome or the reporter.
 */
export default async function IncidentNoticePage({ params }: PageProps<"/workspace/[orgSlug]/settings/standing/incidents/[noticeId]">) {
  const { orgSlug, noticeId } = await params;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  if (ctx.membershipRole !== "org_admin") notFound();
  const notice = await getIncidentNotice(ctx, noticeId);
  if (!notice) notFound();
  const [t, f] = await Promise.all([getT("network"), getFormatter()]);
  const n = await getNoticeI18n(notice.language);
  const guidance = [...notice.guidance].sort((a, b) => (a.variant === b.variant ? 0 : a.variant === "sourcing" ? -1 : 1));
  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 min-h-11 justify-self-start sm:min-h-9">
        <Link href={`/workspace/${orgSlug}/settings/standing`}>
          <ArrowLeft className="size-4" aria-hidden /> {t("case.back")}
        </Link>
      </Button>
      <Panel className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{t("incident.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("incident.cardSent", { date: f.etDate(notice.sent_at) })}</p>
        </div>
        <article lang={INTL_RULES_LANG[notice.language]} className="grid gap-4">
          <p className="text-[15px] text-pretty">{n.t("incident.intro")}</p>
          <section className="grid gap-1.5">
            <h3 className="text-sm font-semibold">{n.t("incident.referrals")}</h3>
            <ul className="grid gap-1.5 text-sm">
              {notice.referrals.map((r, i) => (
                <li key={r.id ?? i}>
                  {r.id ? (
                    <Link href={`/workspace/${orgSlug}/referrals/${r.id}`} className="font-medium underline underline-offset-4">
                      {[r.candidate_label, r.job_title].filter(Boolean).join(" · ") || r.id}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{n.t("incident.referralUnavailable")}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold">{n.t("incident.what")}</h3>
            <p className="text-sm whitespace-pre-line text-pretty">{notice.information}</p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold">{n.t("incident.when")}</h3>
            <p className="text-sm">{notice.occurred}</p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold">{n.t("incident.toWhom")}</h3>
            <p className="text-sm">{notice.to_whom || n.t("incident.toWhomUnknown")}</p>
          </section>
          {guidance.map((g) => (
            <p key={g.variant} className="flex items-start gap-2 rounded-2xl bg-muted px-3.5 py-3 text-sm text-pretty">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{g.text}</span>
            </p>
          ))}
        </article>
      </Panel>
    </div>
  );
}
