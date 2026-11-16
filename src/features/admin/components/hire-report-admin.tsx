"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { CharCount } from "@/components/shared/char-count";
import { NativeSelect } from "@/components/shared/native-select";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { todayEt } from "@/features/referrals/hire-dates";
import type { AdminAuthorizationChecks } from "../queries";
import { decideAuthorizationCheck, decideHireReport, getAdminHireEvidenceUrl, openAuthorizationCheck, recordFeeNotice, saveHireReportFields } from "../actions";

const BTN = "h-auto min-h-11 w-full whitespace-normal sm:min-h-10 sm:w-auto";
const CONFIRMATIONS = ["not_requested", "requested", "provided", "refused"] as const;
const FINDINGS = ["not_hired", "outside_window", "different_person", "not_this_client"] as const;
const REQUESTERS = ["submitter", "candidate", "hiring_side"] as const;

export type AdminFile = { id?: string; n: number; file_name?: string; size_bytes?: number; uploaded_at: string; sha256: string | null; scan_status?: string };

/** Admin file row: name, size, SHA-256, Download (60-second signed URL, audited by `authorize_hire_evidence`). */
export function AdminHireFiles({ files }: { files: AdminFile[] }) {
  const t = useT("admin");
  const tr = useT("referrals");
  const f = useFormatter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!files.length) return null;
  const download = async (id: string) => {
    setBusy(id);
    const r = await getAdminHireEvidenceUrl(id);
    setBusy(null);
    if (r.ok && r.data) window.location.assign(r.data.url);
    else if (!r.ok) toast.error(r.error);
  };
  return (
    <ul className="grid gap-2">
      {files.map((file) => (
        <li key={file.id ?? file.n} className="grid gap-1 rounded-2xl border border-border/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 font-medium break-words">
              {file.file_name ?? tr("claim.panel.fileN", { n: file.n })}
              {file.size_bytes ? <span className="font-normal text-muted-foreground"> · {f.fileSize(file.size_bytes)}</span> : null}
            </p>
            {file.id ? (
              <Button type="button" variant="outline" size="sm" className="min-h-11 min-w-11" disabled={file.scan_status !== "clean" || busy === file.id} onClick={() => download(file.id!)} aria-label={t("disputes.claim.download", { name: file.file_name ?? "" })}>
                {busy === file.id ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
                {file.scan_status !== "clean" ? <span className="text-xs">{tr("claim.panel.scanning")}</span> : null}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{tr("claim.panel.uploaded", { when: f.etDateTime(file.uploaded_at) })}</p>
          {file.sha256 ? (
            <p className="grid gap-0.5 text-xs">
              <span className="text-muted-foreground">{tr("claim.panel.sha")}</span>
              <span className="font-mono break-all text-foreground">{file.sha256}</span>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** BR-28 admin fields: candidate contacted (0–5), client's written confirmation, internal note. Audited, admin-only. */
export function HireReportFieldsForm({ reportId, hiringOrg, initial }: { reportId: string; hiringOrg: string; initial: { candidate_contacts: number | null; client_confirmation: string | null; note: string | null } }) {
  const t = useT("admin");
  const tc = useT("common");
  const router = useRouter();
  const uid = useId();
  const [contacts, setContacts] = useState(String(initial.candidate_contacts ?? 0));
  const [confirmation, setConfirmation] = useState(initial.client_confirmation ?? "not_requested");
  const [note, setNote] = useState(initial.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(contacts);
  const save = () =>
    start(async () => {
      const r = await saveHireReportFields({ reportId, candidateContacts: Math.max(0, Math.min(5, Number.isFinite(n) ? Math.trunc(n) : 0)), clientConfirmation: confirmation, note });
      if (!r.ok) return setError(r.error);
      setError(null);
      toast.success(t("hireReports.detail.notesSaved"));
      router.refresh();
    });
  return (
    <div className="grid gap-4">
      <FormField id={`${uid}-contacts`} label={t("hireReports.candidateContacted")} hint={n > 1 ? t("hireReports.candidateContactedHint") : undefined}>
        <Input id={`${uid}-contacts`} type="number" inputMode="numeric" min={0} max={5} step={1} value={contacts} onChange={(e) => setContacts(e.target.value)} className="h-11 max-w-32 sm:h-10" aria-describedby={n > 1 ? `${uid}-contacts-hint` : undefined} />
      </FormField>
      <FormField id={`${uid}-confirmation`} label={t("hireReports.clientConfirmation.label")} hint={t("hireReports.clientConfirmationHint", { org: hiringOrg })}>
        <NativeSelect id={`${uid}-confirmation`} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} aria-describedby={`${uid}-confirmation-hint`}>
          {CONFIRMATIONS.map((c) => <option key={c} value={c}>{t(`hireReports.clientConfirmation.${c}`)}</option>)}
        </NativeSelect>
      </FormField>
      <FormField id={`${uid}-note`} label={t("hireReports.detail.note")} error={error ?? undefined}>
        <Textarea id={`${uid}-note`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-note-error` : undefined} />
        <CharCount count={note.length} max={2000} />
      </FormField>
      <div className="flex sm:justify-end">
        <Button type="button" variant="secondary" className={BTN} disabled={pending} onClick={save}>{pending ? tc("actions.saving") : t("hireReports.saveNotes")}</Button>
      </div>
    </div>
  );
}

function ResolutionField({ value, onChange, error, hint }: { value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  const t = useT("admin");
  const uid = useId();
  return (
    <FormField id={`${uid}-res`} label={t("hireReports.resolution")} required hint={hint ?? t("hireReports.resolutionHint")} error={error}>
      <Textarea id={`${uid}-res`} rows={4} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} aria-required aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-res-error` : `${uid}-res-hint`} />
      <CharCount count={value.length} max={2000} />
    </FormField>
  );
}

function DecisionDialog({ trigger, title, description, confirmLabel, destructive, children, onConfirm }: { trigger: ReactNode; title: string; description?: ReactNode; confirmLabel: string; destructive?: boolean; children: ReactNode; onConfirm: () => Promise<boolean> }) {
  const tc = useT("common");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => { e.preventDefault(); bodyRef.current?.querySelector<HTMLElement>("button[role=radio],textarea,input")?.focus(); }}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-8 leading-snug">{title}</DialogTitle>
          {description ? <DialogDescription className="text-pretty">{description}</DialogDescription> : null}
        </DialogHeader>
        <div ref={bodyRef} className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-4">{children}</div>
        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <Button variant="outline" className={BTN} disabled={pending} onClick={() => setOpen(false)}>{tc("actions.cancel")}</Button>
          <Button variant={destructive ? "destructive" : "default"} className={BTN} disabled={pending} onClick={() => start(async () => { if (await onConfirm()) setOpen(false); })}>
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** BR-27 decision (S15): uphold or reject with a written resolution; a finding on reject. No amount anywhere (rule 7.5). */
export function HireReportDecision({ reportId, hiringOrg, upholdCreatesPlacement }: { reportId: string; hiringOrg: string; upholdCreatesPlacement: boolean }) {
  const t = useT("admin");
  const router = useRouter();
  const uid = useId();
  // Design P-11: one resolution per dialog, so text typed for a rejection never pre-fills the uphold (and vice versa).
  const [upholdText, setUpholdText] = useState("");
  const [rejectText, setRejectText] = useState("");
  const [finding, setFinding] = useState("");
  const [errors, setErrors] = useState<{ resolution?: string; finding?: string; server?: string; for?: "upheld" | "rejected" }>({});
  const resErr = (v: string) => (v.trim().length < 20 || v.trim().length > 2000 ? t("validation.resolutionLong") : undefined);

  const decide = async (outcome: "upheld" | "rejected") => {
    const text = outcome === "upheld" ? upholdText : rejectText;
    const e = { for: outcome, resolution: resErr(text), finding: outcome === "rejected" && !finding ? t("hireReports.detail.chooseFinding") : undefined };
    setErrors(e);
    if (e.resolution || e.finding) return false;
    const r = await decideHireReport({ reportId, outcome, resolution: text.trim(), finding: outcome === "rejected" ? finding : undefined });
    if (!r.ok) {
      setErrors({ for: outcome, server: r.error, resolution: r.fieldErrors?.resolution?.[0] });
      return false;
    }
    toast.success(t("hireReports.detail.decided"));
    router.refresh();
    return true;
  };

  const errs = (o: "upheld" | "rejected") => (errors.for === o ? errors : {});
  const server = (o: "upheld" | "rejected") => (errs(o).server ? <p role="alert" className="rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">{errs(o).server}</p> : null);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      {/* Rejecting is a decision, not a destructive action (voice §3.4): default styling. */}
      <DecisionDialog
        trigger={<Button variant="outline" className={BTN}>{t("hireReports.reject")}</Button>}
        title={t("hireReports.rejectTitle")}
        confirmLabel={t("hireReports.reject")}
        onConfirm={() => decide("rejected")}
      >
        {server("rejected")}
        <fieldset className="grid gap-2">
          <legend id={`${uid}-finding`} className="mb-1 text-sm font-medium">{t("hireReports.finding.label")}<span className="text-danger" aria-hidden> *</span></legend>
          <RadioGroup value={finding} onValueChange={setFinding} aria-labelledby={`${uid}-finding`} aria-describedby={`${uid}-finding-hint`} aria-invalid={errs("rejected").finding ? true : undefined} className="gap-2">
            {FINDINGS.map((v) => (
              <Label key={v} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-3 leading-5 font-normal has-[[data-state=checked]]:border-foreground">
                <RadioGroupItem value={v} className="mt-0.5" />
                <span className="text-sm text-pretty">{t(`hireReports.finding.${v}`)}</span>
              </Label>
            ))}
          </RadioGroup>
          {errs("rejected").finding ? <p role="alert" className="text-xs font-medium text-danger">{errs("rejected").finding}</p> : null}
          <p id={`${uid}-finding-hint`} className="text-xs text-pretty text-muted-foreground">{t("hireReports.findingHint")}</p>
        </fieldset>
        <ResolutionField value={rejectText} onChange={setRejectText} error={errs("rejected").resolution} />
      </DecisionDialog>
      <DecisionDialog
        trigger={<Button className={BTN}>{t("hireReports.uphold")}</Button>}
        title={t("hireReports.upholdTitle")}
        description={upholdCreatesPlacement ? t("hireReports.upholdBodyPlacement", { org: hiringOrg }) : t("hireReports.upholdBodyNoSplit")}
        confirmLabel={t("hireReports.uphold")}
        onConfirm={() => decide("upheld")}
      >
        {server("upheld")}
        <ResolutionField value={upholdText} onChange={setUpholdText} error={errs("upheld").resolution} />
      </DecisionDialog>
    </div>
  );
}

/** BR-31 task: record that the rule 6.4 notice was sent (date between establishment and today, optional note). */
export function NoticeSentDialog({ placementId, minDate }: { placementId: string; minDate: string | null }) {
  const t = useT("admin");
  const tr = useT("referrals");
  const router = useRouter();
  const uid = useId();
  const today = todayEt();
  const [sentOn, setSentOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <DecisionDialog
      trigger={<Button variant="outline" size="sm" className={BTN}>{t("hireReports.noticeSent")}</Button>}
      title={t("hireReports.noticeSent")}
      confirmLabel={t("hireReports.noticeSent")}
      onConfirm={async () => {
        if (!sentOn || sentOn > today || (minDate && sentOn < minDate)) {
          setError(tr("hireReport.validation.itemDate"));
          return false;
        }
        const r = await recordFeeNotice({ placementId, sentOn, note: note.trim() || undefined });
        if (!r.ok) {
          setError(r.error);
          return false;
        }
        toast.success(t("hireReports.detail.noticeSaved"));
        router.refresh();
        return true;
      }}
    >
      <FormField id={`${uid}-date`} label={t("hireReports.detail.sentOn")} required error={error}>
        <Input id={`${uid}-date`} type="date" min={minDate ?? undefined} max={today} value={sentOn} onChange={(e) => setSentOn(e.target.value)} className="h-11 max-w-xs sm:h-10" aria-required aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-date-error` : undefined} />
      </FormField>
      <FormField id={`${uid}-note`} label={tr("hire.note")}>
        <Textarea id={`${uid}-note`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <CharCount count={note.length} max={2000} />
      </FormField>
    </DecisionDialog>
  );
}

export type AdminAuthChecks = AdminAuthorizationChecks;

/** S16 AuthCheckAdminPanel (BR-37, §2.13): open a check, read A's evidence, decide valid or invalid (void, never automatic). */
export function AuthCheckAdmin({ referralId, data }: { referralId: string; data: AdminAuthChecks }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const f = useFormatter();
  const open = data.checks.find((c) => c.status === "open") ?? null;
  const decided = data.checks.filter((c) => c.status !== "open");
  return (
    <div className="grid gap-4 text-sm">
      {data.requests.map((q) => (
        <div key={q.id} className="grid gap-2 rounded-2xl bg-muted/50 p-3">
          <p className="font-medium">{tg("referrals.authCheck.requestedLine", { date: f.date(q.requested_at) })}</p>
          <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{q.reason}</blockquote>
          <AdminHireFiles files={q.files} />
        </div>
      ))}
      {open ? (
        <OpenCheck check={open} />
      ) : (
        <>
          {!decided.length ? <p className="text-muted-foreground">{t("authCheck.none")}</p> : null}
          <OpenCheckDialog referralId={referralId} recentChange={!!data.recent_change_note} preselectHiringSide={data.requests.length > 0} />
        </>
      )}
      {decided.map((c) => (
        <div key={c.id} className="grid gap-1 rounded-2xl border border-border/60 p-3">
          <p className="font-medium">{t(`authCheck.status.${c.status}`)} · {f.date(c.decided_at)}</p>
          {c.resolution ? <p className="text-pretty text-muted-foreground">{t("disputes.quote", { text: c.resolution })}</p> : null}
        </div>
      ))}
    </div>
  );
}

function OpenCheckDialog({ referralId, recentChange, preselectHiringSide }: { referralId: string; recentChange: boolean; preselectHiringSide: boolean }) {
  const t = useT("admin");
  const tc = useT("common");
  const router = useRouter();
  const uid = useId();
  const [by, setBy] = useState<string>(preselectHiringSide ? "hiring_side" : "");
  const [evidence, setEvidence] = useState(false);
  const [error, setError] = useState<string | undefined>();
  return (
    <DecisionDialog
      trigger={<Button variant="outline" className={BTN}>{t("authCheck.open")}</Button>}
      title={t("authCheck.open")}
      confirmLabel={t("authCheck.open")}
      onConfirm={async () => {
        if (!by) {
          setError(t("authCheck.chooseRequester"));
          return false;
        }
        const r = await openAuthorizationCheck({ referralId, requestedBy: by, challengerEvidence: evidence });
        if (!r.ok) {
          setError(r.error);
          return false;
        }
        toast.success(t("authCheck.opened"));
        router.refresh();
        return true;
      }}
    >
      <fieldset className="grid gap-2">
        <legend id={`${uid}-by`} className="mb-1 text-sm font-medium">{t("authCheck.requestedBy.label")}<span className="text-danger" aria-hidden> *</span></legend>
        <RadioGroup value={by} onValueChange={setBy} aria-labelledby={`${uid}-by`} aria-invalid={error ? true : undefined} className="gap-2">
          {REQUESTERS.map((v) => (
            <Label key={v} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-3 leading-5 font-normal has-[[data-state=checked]]:border-foreground">
              <RadioGroupItem value={v} className="mt-0.5" />
              <span className="text-sm text-pretty">{t(`authCheck.requestedBy.${v}`)}</span>
            </Label>
          ))}
        </RadioGroup>
        {error ? <p role="alert" className="text-xs font-medium text-danger">{error}</p> : null}
      </fieldset>
      <Label className="flex min-h-11 items-start gap-3 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
        <Checkbox checked={evidence} onCheckedChange={(v) => setEvidence(v === true)} className="mt-0.5" />
        <span className="text-sm text-pretty">{t("authCheck.challengerEvidence")}</span>
      </Label>
      <p className="text-sm">{t("authCheck.recentChange", { value: recentChange ? tc("yes") : tc("no") })}</p>
    </DecisionDialog>
  );
}

function OpenCheck({ check }: { check: AdminAuthChecks["checks"][number] }) {
  const t = useT("admin");
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const [valid, setValid] = useState<"valid" | "invalid">(check.no_evidence_by_deadline ? "invalid" : "valid");
  const [resolution, setResolution] = useState("");
  const [contacted, setContacted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const decide = async (isValid: boolean) => {
    if (resolution.trim().length < 20 || resolution.trim().length > 2000) {
      setError(t("validation.resolutionLong"));
      return false;
    }
    const r = await decideAuthorizationCheck({ checkId: check.id, valid: isValid, resolution: resolution.trim(), candidateContacted: contacted });
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    toast.success(t("authCheck.decided"));
    router.refresh();
    return true;
  };
  const fields = (
    <>
      <ResolutionField value={resolution} onChange={setResolution} error={error} hint="" />
      <Label className="flex min-h-11 items-start gap-3 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
        <Checkbox checked={contacted} onCheckedChange={(v) => setContacted(v === true)} className="mt-0.5" />
        <span className="text-sm text-pretty">{t("authCheck.candidateContacted")}</span>
      </Label>
    </>
  );
  return (
    <div className="grid gap-3 rounded-2xl border border-border/60 p-3">
      <p className="font-medium">{t("authCheck.status.open")} · {t(`authCheck.requestedBy.${check.requested_by_kind as (typeof REQUESTERS)[number]}`)}</p>
      {check.evidence_due_at ? <p>{t("authCheck.evidenceDueAt", { when: f.etDateTime(check.evidence_due_at) })}</p> : null}
      {/* Design B-3 (AA): foreground text on the soft warning pair. */}
      {check.no_evidence_by_deadline ? (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 font-medium text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{t("authCheck.noEvidence")}
        </p>
      ) : null}
      {check.evidence_statement ? <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{check.evidence_statement}</blockquote> : null}
      <AdminHireFiles files={check.files} />
      <RadioGroup value={valid} onValueChange={(v) => setValid(v as "valid" | "invalid")} aria-label={t("authCheck.open")} className="gap-2 sm:grid-cols-2">
        {(["valid", "invalid"] as const).map((v) => (
          <Label key={v} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-3 leading-5 font-normal has-[[data-state=checked]]:border-foreground">
            <RadioGroupItem value={v} className="mt-0.5" id={`${uid}-${v}`} />
            <span className="text-sm">{t(`authCheck.${v}`)}</span>
          </Label>
        ))}
      </RadioGroup>
      <div className="flex sm:justify-end">
        {valid === "valid" ? (
          <DecisionDialog trigger={<Button className={BTN}>{t("authCheck.valid")}</Button>} title={t("authCheck.valid")} confirmLabel={t("authCheck.valid")} onConfirm={() => decide(true)}>
            {fields}
          </DecisionDialog>
        ) : (
          <DecisionDialog trigger={<Button variant="destructive" className={BTN}>{t("authCheck.invalid")}</Button>} title={t("authCheck.invalidTitle")} description={t("authCheck.invalidBody")} confirmLabel={t("authCheck.invalid")} destructive onConfirm={() => decide(false)}>
            {fields}
          </DecisionDialog>
        )}
      </div>
    </div>
  );
}
