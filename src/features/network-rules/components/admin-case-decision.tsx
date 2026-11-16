"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useFormatter, useGlobalT, useLocale, useT } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { decideConductCase, decideSanctionReview, sendIncidentNotice } from "../admin-actions";
import { RULES_LOCALES, reductionOptions, type RulesLocale, type SanctionLevel } from "../domain";
import { TextField, todayEt, useLengthError, type NoticeTemplates } from "./admin-case-shared";

type Outcome = "no_breach" | "insufficient_evidence" | "breach";
/** Sanction choice in the form; after an immediate hold, "lift" = no level and "keep" = network_hold (BR-28). */
type Choice = "none" | "lift" | "keep" | SanctionLevel;
type ContextRow = { kind: "sanction" | "finding"; id: string; case_id: string; level: SanctionLevel | null; at: string; status: string };

const OUTCOME_LABEL = { no_breach: "no_breach", insufficient_evidence: "not_enough", breach: "breach" } as const;
const REPORTER_OUTCOME = { no_breach: "noBreach", insufficient_evidence: "notEnough", breach: "action" } as const;

/**
 * S15 decision form. Locked (hint) until the org responded or the window closed (BR-27). Rules come
 * from the notice only (RD-049). "No sanction" is disabled under the 12-month rule (Q-D5); the DB
 * refuses it too (`no_sanction_not_allowed`).
 */
export function DecisionForm({
  caseId,
  orgName,
  notice,
  locked,
  noSanctionAllowed,
  immediateHoldActive,
  hasReporter,
  context,
}: {
  caseId: string;
  orgName: string;
  notice: { id: string; rules: { number: string; title: string }[]; hasOutcomesLine: boolean; responseDueAt: string };
  locked: boolean;
  noSanctionAllowed: boolean;
  immediateHoldActive: boolean;
  hasReporter: boolean;
  context: ContextRow[];
}) {
  const t = useT("admin");
  const tn = useT("network");
  const tg = useGlobalT();
  const f = useFormatter();
  const uid = useId();
  const len = useLengthError();
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [rules, setRules] = useState<string[]>(notice.rules.map((r) => r.number));
  const [finding, setFinding] = useState("");
  const [residual, setResidual] = useState(false);
  const [choice, setChoice] = useState<Choice | "">("");
  const [planned, setPlanned] = useState("");
  const [whyNot, setWhyNot] = useState("");
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  if (locked) {
    return <p className="text-sm text-muted-foreground">{t("conduct.decideLocked", { org: orgName, when: f.etDateTime(notice.responseDueAt) })}</p>;
  }

  const level: SanctionLevel | null = choice === "" || choice === "none" || choice === "lift" ? null : choice === "keep" ? "network_hold" : choice;
  const escalation = choice === "suspension" || choice === "termination";
  const escalationBlocked = immediateHoldActive && !notice.hasOutcomesLine;
  const choices: { value: Choice; label: string; description?: string; disabled?: boolean; hint?: string }[] = immediateHoldActive
    ? [
        { value: "lift", label: t("conduct.decision.afterHold.lift") },
        { value: "keep", label: t("conduct.decision.afterHold.keep"), description: t("conduct.decision.sanctionDescription.network_hold") },
        { value: "warning", label: t("conduct.decision.afterHold.warning"), description: t("conduct.decision.sanctionDescription.warning") },
        { value: "suspension", label: tg("labels.sanctionLevel.suspension"), description: t("conduct.decision.sanctionDescription.suspension"), disabled: escalationBlocked, hint: escalationBlocked ? t("conduct.decision.noStakesLine") : undefined },
        { value: "termination", label: tg("labels.sanctionLevel.termination"), description: t("conduct.decision.sanctionDescription.termination"), disabled: escalationBlocked, hint: escalationBlocked ? t("conduct.decision.noStakesLine") : undefined },
      ]
    : [
        { value: "none", label: tg("labels.sanctionLevel.none"), description: t("conduct.decision.sanctionDescription.none"), disabled: !noSanctionAllowed, hint: noSanctionAllowed ? undefined : t("conduct.decision.noneDisabled", { org: orgName }) },
        ...(["warning", "network_hold", "suspension", "termination"] as const).map((l) => ({ value: l as Choice, label: tg(`labels.sanctionLevel.${l}`), description: t(`conduct.decision.sanctionDescription.${l}`) })),
      ];

  const validate = () => {
    const e: Record<string, string | null> = { outcome: outcome ? null : tg("errors.invalidFields") };
    if (outcome === "breach") {
      e.rules = rules.length ? null : t("conduct.decision.rulesFromNotice");
      e.finding = len(finding, 50, 8000);
      e.choice = choice ? null : tg("errors.invalidFields");
      e.whyNot = escalation ? (whyNot.trim().length < 20 ? t("conduct.errors.reasonRequired") : len(whyNot, 20, 2000)) : null;
    }
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const effect = (() => {
    if (outcome !== "breach") return t("conduct.decision.confirm.noSanction", { org: orgName });
    switch (choice) {
      case "none":
        return t("conduct.decision.confirm.none", { org: orgName });
      case "lift":
        return t("conduct.decision.confirm.holdLift", { org: orgName });
      case "keep":
        return t("conduct.decision.confirm.holdKeep", { org: orgName });
      case "warning":
        return t("conduct.decision.confirm.warning", { org: orgName });
      case "network_hold":
        return t("conduct.decision.confirm.hold", { org: orgName });
      case "suspension":
        return t("conduct.decision.confirm.suspension", { org: orgName });
      case "termination":
        return t("conduct.decision.confirm.termination", { org: orgName });
      default:
        return "";
    }
  })();

  const record = () =>
    start(async () => {
      setAlert(null);
      const r = await decideConductCase({
        caseId,
        noticeId: notice.id,
        outcome,
        finding: outcome === "breach" ? finding : null,
        rulesCited: outcome === "breach" ? rules : [],
        residualTest: outcome === "breach" && residual,
        level: outcome === "breach" ? level : null,
        whyNotHold: escalation ? whyNot : null,
        plannedReviewOn: level === "network_hold" && planned ? planned : null,
      });
      setConfirm(false);
      if (!r.ok) {
        setAlert(
          r.code === "no_sanction_not_allowed"
            ? t("conduct.errors.noSanctionNotAllowed", { org: orgName })
            : r.code === "sanction_notice_required"
              ? t("conduct.decideLocked", { org: orgName, when: f.etDateTime(notice.responseDueAt) })
              : r.code === "sanction_reason_required"
                ? t("conduct.errors.reasonRequired")
                : r.error,
        );
        return;
      }
      toast.success(t("conduct.decision.recorded", { org: orgName }));
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      {alert ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{alert}</span>
        </div>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("conduct.decision.outcome")}</legend>
        <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as Outcome)} className="gap-2" aria-label={t("conduct.decision.outcome")} aria-invalid={errors.outcome ? true : undefined}>
          {(["no_breach", "insufficient_evidence", "breach"] as const).map((o) => (
            <Label key={o} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 px-3 font-normal has-[[data-state=checked]]:border-foreground">
              <RadioGroupItem value={o} /> {tg(`labels.conductOutcome.${OUTCOME_LABEL[o]}`)}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>

      {outcome === "breach" ? (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("conduct.decision.rules")}</legend>
            <p className="text-xs text-muted-foreground">{t("conduct.decision.rulesFromNotice")}</p>
            {notice.rules.map((r) => (
              <Label key={r.number} className="flex min-h-11 items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm font-normal sm:min-h-9">
                <Checkbox checked={rules.includes(r.number)} onCheckedChange={(v) => setRules((rs) => (v === true ? [...rs, r.number] : rs.filter((x) => x !== r.number)))} className="mt-0.5" />
                <span><span className="font-medium">{r.number}</span> {r.title}</span>
              </Label>
            ))}
            {errors.rules ? <p role="alert" className="text-xs font-medium text-danger">{errors.rules}</p> : null}
          </fieldset>
          <TextField label={t("conduct.decision.finding")} hint={t("conduct.decision.findingHint", { org: orgName })} value={finding} onChange={setFinding} max={8000} rows={6} error={errors.finding} required />
          <Label className="flex min-h-11 items-start gap-2.5 font-normal">
            <Checkbox checked={residual} onCheckedChange={(v) => setResidual(v === true)} className="mt-0.5" />
            <span className="grid gap-0.5"><span className="text-sm">{t("conduct.decision.residual")}</span><span className="text-xs text-muted-foreground">{t("conduct.decision.residualHint", { org: orgName })}</span></span>
          </Label>

          <section className="grid gap-2 rounded-2xl bg-muted/50 p-3 text-sm" aria-labelledby={`${uid}-ctx`}>
            <h3 id={`${uid}-ctx`} className="font-medium">{t("conduct.decision.context")}</h3>
            {context.length ? (
              <ul className="grid gap-1">
                {context.map((c) => (
                  <li key={`${c.kind}-${c.id}`}>
                    {f.etDate(c.at)} · {tg(`labels.sanctionLevel.${c.level ?? "none"}`)} · {c.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("conduct.decision.contextEmpty")}</p>
            )}
          </section>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("conduct.decision.sanction")}</legend>
            <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="gap-2" aria-label={t("conduct.decision.sanction")}>
              {choices.map((c) => (
                <Label key={c.value} className={`flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground ${c.disabled ? "opacity-60" : ""}`}>
                  <RadioGroupItem value={c.value} disabled={c.disabled} className="mt-0.5" aria-describedby={c.hint || c.description ? `${uid}-c-${c.value}` : undefined} />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{c.label}</span>
                    {c.description || c.hint ? <span id={`${uid}-c-${c.value}`} className="text-xs text-muted-foreground">{c.hint ?? c.description}</span> : null}
                  </span>
                </Label>
              ))}
            </RadioGroup>
            {errors.choice ? <p role="alert" className="text-xs font-medium text-danger">{errors.choice}</p> : null}
          </fieldset>
          {level === "network_hold" && choice !== "keep" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-planned`} className="text-sm font-medium">{t("conduct.decision.plannedReview")}</Label>
              <Input id={`${uid}-planned`} type="date" min={todayEt()} className="h-11 max-w-xs sm:h-10" value={planned} onChange={(e) => setPlanned(e.target.value)} aria-describedby={`${uid}-planned-hint`} />
              <p id={`${uid}-planned-hint`} className="text-xs text-muted-foreground">{t("conduct.decision.plannedReviewHint")}</p>
            </div>
          ) : null}
          {escalation ? (
            <>
              {immediateHoldActive ? <p className="rounded-2xl bg-warning-soft px-3 py-2 text-sm text-warning">{t("conduct.decision.sameNotice")}</p> : null}
              <TextField label={t("conduct.decision.whyNotHold")} hint={t("conduct.orgWillRead", { org: orgName })} value={whyNot} onChange={setWhyNot} max={2000} error={errors.whyNot} required />
              {choice === "termination" ? <p className="text-sm text-muted-foreground">{t("conduct.decision.terminationNote")}</p> : null}
            </>
          ) : null}
        </>
      ) : null}

      <Button className="min-h-11 justify-self-start sm:min-h-10" disabled={pending} onClick={() => validate() && setConfirm(true)}>
        {t("conduct.decision.record")}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("conduct.decision.confirmTitle")}
        description={
          <span className="grid gap-2">
            <span>{effect}</span>
            {hasReporter && outcome ? <span>{t("conduct.decision.confirmReporter", { outcome: tn(`reports.outcome.${REPORTER_OUTCOME[outcome]}`) })}</span> : null}
          </span>
        }
        confirmLabel={t("conduct.decision.record")}
        destructive={choice === "suspension" || choice === "termination"}
        onConfirm={async () => void record()}
      />
    </div>
  );
}

/** S17 review panel: confirm, reduce (lower levels or lift) or overturn; never increase. Not for the decider or hold applier. */
export function ReviewPanel({
  reviewId,
  orgName,
  level,
  viewerCanReview,
  viewerIsHoldApplier,
  hasEligibleReviewer,
}: {
  reviewId: string;
  orgName: string;
  level: SanctionLevel | null;
  viewerCanReview: boolean;
  viewerIsHoldApplier: boolean;
  hasEligibleReviewer: boolean;
}) {
  const t = useT("admin");
  const tg = useGlobalT();
  const uid = useId();
  const len = useLengthError();
  const router = useRouter();
  const [outcome, setOutcome] = useState<"confirm" | "reduce" | "overturn" | "">("");
  const options = reductionOptions(level);
  const [newLevel, setNewLevel] = useState<string>(options[options.length - 1] ?? "none");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!viewerCanReview) return <p className="text-sm text-muted-foreground">{viewerIsHoldApplier ? t("conduct.review.selfBlockedHold") : t("conduct.review.selfBlocked")}</p>;
  if (!hasEligibleReviewer) return <p className="text-sm text-muted-foreground">{t("conduct.review.needsSecond")}</p>;
  const submit = () => {
    const e = len(reason, 50, 8000);
    setErr(e);
    if (e || !outcome) return;
    start(async () => {
      const r = await decideSanctionReview({ reviewId, outcome, newLevel: outcome === "reduce" ? newLevel : null, reason });
      if (!r.ok) {
        setAlert(r.code === "review_not_allowed" ? (viewerIsHoldApplier ? t("conduct.review.selfBlockedHold") : t("conduct.review.selfBlocked")) : r.code === "review_cannot_increase" ? t("conduct.errors.cannotIncrease") : r.error);
        return;
      }
      toast.success(t("conduct.review.recorded", { org: orgName }));
      router.refresh();
    });
  };
  return (
    <div className="grid gap-4">
      {alert ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{alert}</span>
        </div>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("conduct.review.outcome")}</legend>
        <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)} className="gap-2" aria-label={t("conduct.review.outcome")}>
          <Label className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 px-3 font-normal has-[[data-state=checked]]:border-foreground"><RadioGroupItem value="confirm" /> {t("conduct.review.confirm")}</Label>
          {options.length ? <Label className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 px-3 font-normal has-[[data-state=checked]]:border-foreground"><RadioGroupItem value="reduce" /> {t("conduct.review.reduce")}</Label> : null}
          <Label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground">
            <RadioGroupItem value="overturn" className="mt-0.5" />
            <span className="grid gap-0.5"><span>{t("conduct.review.overturn")}</span><span className="text-xs text-muted-foreground">{t("conduct.review.overturnHint")}</span></span>
          </Label>
        </RadioGroup>
      </fieldset>
      {outcome === "reduce" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-level`} className="text-sm font-medium">{t("conduct.review.newLevel")}</Label>
          <NativeSelect id={`${uid}-level`} value={newLevel} onChange={(e) => setNewLevel(e.target.value)}>
            {options.map((l) => <option key={l} value={l}>{l === "none" ? t("conduct.review.liftOption") : tg(`labels.sanctionLevel.${l}`)}</option>)}
          </NativeSelect>
        </div>
      ) : null}
      <TextField label={t("conduct.review.reason")} hint={t("conduct.orgWillRead", { org: orgName })} value={reason} onChange={setReason} max={8000} rows={5} error={err} required />
      <Button className="min-h-11 justify-self-start sm:min-h-10" disabled={pending || !outcome} onClick={submit}>{pending ? tg("common.actions.working") : t("conduct.review.record")}</Button>
    </div>
  );
}

export type IncidentOption = { referral_id: string; job_title: string; candidate_label: string; status: string; created_at: string; linked: boolean; counterpart_org: { id: string; name: string }; counterpart_side: "source" | "target" };

/** S26 data incident notice (RD-045): facts only, fixed guidance per recipient side, never the sanction. */
export function IncidentDialog({ caseId, options, templates, defaultLanguage }: { caseId: string; options: IncidentOption[]; templates: NoticeTemplates; defaultLanguage: RulesLocale }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const locale = useLocale();
  const uid = useId();
  const len = useLengthError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [referrals, setReferrals] = useState<string[]>(options.filter((o) => o.linked).map((o) => o.referral_id));
  const orgsAll = [...new Map(options.filter((o) => referrals.includes(o.referral_id)).map((o) => [o.counterpart_org.id, o.counterpart_org])).values()];
  const [orgs, setOrgs] = useState<string[] | null>(null);
  const selectedOrgs = orgs ?? orgsAll.map((o) => o.id);
  const [info, setInfo] = useState("");
  const [when, setWhen] = useState("");
  const [toWhom, setToWhom] = useState("");
  const [language, setLanguage] = useState<RulesLocale>(defaultLanguage);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [confirm, setConfirm] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = new Intl.ListFormat(INTL_LOCALE[locale], { type: "conjunction" });
  const chosen = options.filter((o) => referrals.includes(o.referral_id) && selectedOrgs.includes(o.counterpart_org.id));
  const sourcing = [...new Set(chosen.filter((o) => o.counterpart_side === "source").map((o) => o.counterpart_org.name))];
  const hiring = [...new Set(chosen.filter((o) => o.counterpart_side === "target").map((o) => o.counterpart_org.name))];
  const variants = [
    ...(sourcing.length ? [{ key: "sourcing", label: t("conduct.incident.variantSourcing"), orgs: sourcing, text: templates[language].guidance }] : []),
    ...(hiring.length ? [{ key: "hiring", label: t("conduct.incident.variantHiring"), orgs: hiring, text: templates[language].guidanceHiring }] : []),
  ];

  const submit = () => {
    const e = { info: len(info, 20, 2000), when: len(when, 3, 200), toWhom: toWhom.length > 500 ? len(toWhom, 0, 500) : null, orgs: selectedOrgs.length ? null : t("conduct.incident.orgsEmpty") };
    setErrors(e);
    if (Object.values(e).some(Boolean) || !referrals.length) return;
    setConfirm(true);
  };
  const send = () =>
    start(async () => {
      const r = await sendIncidentNotice({ caseId, recipientOrgIds: selectedOrgs, referralIds: referrals, information: info, when, toWhom: toWhom || null, language });
      setConfirm(false);
      if (!r.ok) return setAlert(r.error);
      toast.success(t("conduct.incident.done", { count: selectedOrgs.length }));
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full sm:min-h-10">{t("conduct.incident.action")}</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[100dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-5">
            <DialogTitle>{t("conduct.incident.title")}</DialogTitle>
            <DialogDescription>{t("conduct.incident.intro")}</DialogDescription>
            {alert ? <p role="alert" className="rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">{alert}</p> : null}
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("conduct.incident.referrals")}</legend>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-border/60 p-2">
                {options.map((o) => (
                  <Label key={o.referral_id} className="flex min-h-11 items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm font-normal hover:bg-muted">
                    <Checkbox checked={referrals.includes(o.referral_id)} onCheckedChange={(v) => setReferrals((rs) => (v === true ? [...rs, o.referral_id] : rs.filter((x) => x !== o.referral_id)))} className="mt-0.5" />
                    <span>{o.candidate_label} · {o.job_title} · {o.counterpart_org.name}</span>
                  </Label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("conduct.incident.orgs")}</legend>
              {orgsAll.length === 0 ? <p className="text-sm text-muted-foreground">{t("conduct.incident.orgsEmpty")}</p> : null}
              {orgsAll.map((o) => (
                <Label key={o.id} className="flex min-h-11 items-center gap-2.5 text-sm font-normal">
                  <Checkbox checked={selectedOrgs.includes(o.id)} onCheckedChange={(v) => setOrgs(v === true ? [...selectedOrgs, o.id] : selectedOrgs.filter((x) => x !== o.id))} /> {o.name}
                </Label>
              ))}
              {errors.orgs ? <p role="alert" className="text-xs font-medium text-danger">{errors.orgs}</p> : null}
            </fieldset>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-lang`} className="text-sm font-medium">{t("conduct.notice.language")}</Label>
              <NativeSelect id={`${uid}-lang`} value={language} onChange={(e) => setLanguage(e.target.value as RulesLocale)}>
                {RULES_LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
              </NativeSelect>
            </div>
            <TextField label={t("conduct.incident.what")} value={info} onChange={setInfo} max={2000} error={errors.info} lang={language} required />
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-when`} className="text-sm font-medium">{t("conduct.incident.when")}</Label>
              <Input id={`${uid}-when`} value={when} maxLength={200} lang={language} onChange={(e) => setWhen(e.target.value)} aria-invalid={errors.when ? true : undefined} aria-describedby={errors.when ? `${uid}-when-error` : undefined} />
              {errors.when ? <p id={`${uid}-when-error`} role="alert" className="text-xs font-medium text-danger">{errors.when}</p> : null}
            </div>
            <TextField label={t("conduct.incident.toWhom")} value={toWhom} onChange={setToWhom} max={500} rows={2} error={errors.toWhom} lang={language} />
            {variants.length ? (
              <Tabs defaultValue={variants[0].key} className="gap-3">
                <TabsList>
                  {variants.map((v) => <TabsTrigger key={v.key} value={v.key} className="min-h-11 sm:min-h-8">{v.label}</TabsTrigger>)}
                </TabsList>
                {variants.map((v) => (
                  <TabsContent key={v.key} value={v.key} className="grid gap-2 rounded-2xl bg-muted p-3 text-sm" lang={language}>
                    <p className="text-xs text-muted-foreground">{t("conduct.incident.variantRecipients", { orgs: list.format(v.orgs) })}</p>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="size-3.5" aria-hidden />{t("conduct.incident.guidanceLocked")}</p>
                    <p>{v.text}</p>
                  </TabsContent>
                ))}
              </Tabs>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 px-6 py-4 sm:flex-row-reverse">
          <Button className="min-h-11 sm:min-h-10" disabled={pending || !orgsAll.length} onClick={submit}>{t("conduct.incident.send")}</Button>
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
        </div>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t("conduct.incident.send")} description={t("conduct.incident.confirm", { count: selectedOrgs.length })} confirmLabel={t("conduct.incident.send")} onConfirm={async () => void send()} />
      </DialogContent>
    </Dialog>
  );
}
