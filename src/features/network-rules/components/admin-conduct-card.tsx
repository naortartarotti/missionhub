import Link from "next/link";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { cn } from "@/lib/utils";
import type { ConductCategory } from "../domain";
import { CONDUCT_STATE_TONE, approxBusinessDaysLeft, conductStateKey } from "../admin-ui";

export { CONDUCT_STATE_TONE, approxBusinessDaysLeft, conductStateKey };

/** One row of admin_list_conduct_cases (backend.md §3.5). */
export type AdminConductListItem = {
  id: string;
  source: "referral" | "job" | "admin";
  state: string;
  status: string;
  category: ConductCategory;
  admin_category: ConductCategory | null;
  possible_94: boolean;
  reported_org: { id: string; name: string };
  reporter_org: { id: string; name: string } | null;
  created_at: string;
  first_response_due_at: string | null;
  first_response_at: string | null;
  next_deadline: string | null;
  open: boolean;
  bad_faith_count: number;
  decision_overdue: boolean;
};

/** Deadline line with the overdue form in text (never colour only, §2.12). */
export async function AdminDeadline({ label, at }: { label: string; at: string }) {
  const [tr, f] = await Promise.all([getT("referrals"), getFormatter()]);
  const left = approxBusinessDaysLeft(at);
  const overdue = left === null;
  return (
    <p className="flex items-start gap-2 text-sm">
      <Clock className={cn("mt-0.5 size-4 shrink-0", overdue ? "text-danger" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 text-pretty">
        <span className="block font-medium">{label}</span>
        {overdue ? (
          <span className="font-medium text-danger">{tr("deadline.closed", { when: f.etDateTime(at) })}</span>
        ) : (
          <>
            <span>{tr("deadline.at", { when: f.etDateTime(at) })}</span> <span className="whitespace-nowrap">· {left === 0 ? tr("deadline.endsToday") : tr("deadline.left", { count: left })}</span>
          </>
        )}
      </span>
    </p>
  );
}

/** S12 conduct card. Admin-only: the "Possible 9.4" badge and the admin category never reach members. */
export async function AdminConductCard({ c }: { c: AdminConductListItem }) {
  const [t, tg, f] = await Promise.all([getT("admin"), getGlobalT(), getFormatter()]);
  const stateKey = conductStateKey(c.state);
  const reporterCat = tg(`labels.conductCategory.${c.category}`);
  return (
    <Panel className="grid h-full gap-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{tg("labels.disputeType.conduct")}</Badge>
            {c.possible_94 ? <Badge variant="destructive">{t("conduct.possible94")}</Badge> : null}
            {c.decision_overdue ? <Badge variant="destructive">{t("conduct.decisionOverdue")}</Badge> : null}
          </div>
          <p className="text-base font-semibold text-pretty">
            {c.reporter_org ? t("conduct.reportedBy", { reported: c.reported_org.name, reporter: c.reporter_org.name }) : t("conduct.openedByMissionHub", { reported: c.reported_org.name })}
          </p>
          <p className="text-muted-foreground">
            {c.admin_category && c.admin_category !== c.category ? t("conduct.categories", { admin: tg(`labels.conductCategory.${c.admin_category}`), reporter: reporterCat }) : reporterCat}
          </p>
          <p className="text-muted-foreground">{t("conduct.filedOn", { when: f.etDateTime(c.created_at) })}</p>
        </div>
        <StatusPill tone={CONDUCT_STATE_TONE[stateKey] ?? "neutral"} label={t(`conduct.state.${stateKey}`)} />
      </div>
      {!c.first_response_at && c.first_response_due_at ? (
        <AdminDeadline label={t("conduct.firstResponseBy")} at={c.first_response_due_at} />
      ) : c.next_deadline ? (
        <AdminDeadline label={t("conduct.stepDeadline")} at={c.next_deadline} />
      ) : null}
      {c.reporter_org && c.bad_faith_count > 0 ? <p className="text-muted-foreground">{t("conduct.badFaith", { org: c.reporter_org.name, count: c.bad_faith_count })}</p> : null}
      <Button asChild variant="outline" size="sm" className="min-h-11 justify-self-start sm:min-h-9">
        <Link href={`/admin/disputes/conduct/${c.id}`}>{t("conduct.open")}</Link>
      </Button>
    </Panel>
  );
}
