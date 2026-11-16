"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shared/card";
import { FormField } from "@/components/shared/form-field";
import { CharCount } from "@/components/shared/char-count";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { requestAuthorizationCheck, submitAuthorizationEvidence } from "../actions";
import type { SourceAuthCheck } from "@/features/referrals/queries";
import { AnswerDialog, AnswerFooter, Attestation, ServerAlert } from "./answer-dialogs";
import { EMPTY_EVIDENCE, HireEvidenceList, useHireEvidenceBlockReason, type HireEvidenceState } from "./hire-evidence-list";

const BTN = "h-auto min-h-11 w-full whitespace-normal sm:min-h-10 sm:w-auto";

/**
 * S13 RequestAuthCheckDialog (BR-37, spec §2.13 trigger 3): B asks inside a contested objection or a contested /
 * in-review hire report; once per dispute. The reason and files are admin-only.
 */
export function RequestAuthCheckDialog({ orgSlug, referralId, partner }: { orgSlug: string; referralId: string; partner: string }) {
  const t = useT("referrals");
  return (
    <AnswerDialog
      trigger={<Button variant="outline" className={BTN}><ShieldQuestion className="size-4" aria-hidden /> {t("authCheck.request")}</Button>}
      title={t("authCheck.requestTitle")}
      description={<p>{t("authCheck.requestBody", { partner })}</p>}
    >
      {(close) => <RequestForm orgSlug={orgSlug} referralId={referralId} onDone={close} />}
    </AnswerDialog>
  );
}

function RequestForm({ orgSlug, referralId, onDone }: { orgSlug: string; referralId: string; onDone: () => void }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const router = useRouter();
  const uid = useId();
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<HireEvidenceState>(EMPTY_EVIDENCE);
  const [error, setError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filedRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const blockReason = useHireEvidenceBlockReason(files);

  const submit = () => {
    if (reason.trim().length < 20 || reason.trim().length > 2000) {
      setError(t("hireReport.validation.statement"));
      return requestAnimationFrame(() => focusFirstInvalid(bodyRef.current));
    }
    setError(undefined);
    const fd = new FormData();
    fd.set("referralId", referralId);
    fd.set("reason", reason.trim());
    for (const id of files.readyIds) fd.append("fileIds", id);
    start(async () => {
      const r = await requestAuthorizationCheck(orgSlug, null, fd);
      if (r.ok) {
        filedRef.current = true;
        toast.success(r.message ?? t("authCheck.messages.requested"));
        onDone();
        router.refresh();
        return;
      }
      if (r.fieldErrors?.reason) setError(r.fieldErrors.reason[0]);
      else setServerError(r.error);
    });
  };

  return (
    <>
      <div ref={bodyRef} className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 pb-4">
        <ServerAlert text={serverError} />
        <FormField id={`${uid}-reason`} label={t("authCheck.reason")} required error={error}>
          <Textarea id={`${uid}-reason`} rows={5} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} aria-required aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-reason-error` : undefined} />
          <CharCount count={reason.length} max={2000} />
        </FormField>
        <HireEvidenceList orgSlug={orgSlug} referralId={referralId} kind="auth_request" label={t("hireContest.files")} hint={t("hireContest.filesHint")} onChange={setFiles} filedRef={filedRef} />
      </div>
      <AnswerFooter pending={pending} blockReason={blockReason} label={t("authCheck.requestSubmit")} pendingLabel={tg("common.actions.working")} onSubmit={submit} onCancel={onDone} />
    </>
  );
}

/**
 * S13 AuthCheckPanel (A side only, BR-37): while a check with an evidence request is open, and after A sent
 * evidence until the decision. Statement 20–2,000, 1–5 files, attestation; once, before the deadline.
 */
export function AuthCheckPanel({ orgSlug, referralId, check }: { orgSlug: string; referralId: string; check: SourceAuthCheck }) {
  const t = useT("referrals");
  const f = useFormatter();
  const uid = useId();
  return (
    <Panel className="p-6">
      <section aria-labelledby={`${uid}-title`} className="grid gap-3">
        <h2 id={`${uid}-title`} className="text-base font-semibold">{t("authCheck.title")}</h2>
        <p className="text-sm text-pretty">{t("authCheck.body")}</p>
        {check.evidence_at ? (
          <p role="status" className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-pretty">{t("authCheck.sentLine", { date: f.etDate(check.evidence_at) })}</p>
        ) : check.evidence_due_at ? (
          <BusinessDeadline at={check.evidence_due_at} left={check.evidence_business_days_left} />
        ) : null}
        {check.can_send_evidence && !check.evidence_at ? <EvidenceForm orgSlug={orgSlug} referralId={referralId} checkId={check.id} /> : null}
      </section>
    </Panel>
  );
}

function EvidenceForm({ orgSlug, referralId, checkId }: { orgSlug: string; referralId: string; checkId: string }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const router = useRouter();
  const uid = useId();
  const [statement, setStatement] = useState("");
  const [attested, setAttested] = useState(false);
  const [files, setFiles] = useState<HireEvidenceState>(EMPTY_EVIDENCE);
  const [errors, setErrors] = useState<Partial<Record<"statement" | "files" | "attestation", string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filedRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  const blockReason = useHireEvidenceBlockReason(files);
  const statusId = `${uid}-status`;

  const submit = () => {
    const e: typeof errors = {};
    if (statement.trim().length < 20 || statement.trim().length > 2000) e.statement = t("hireReport.validation.statement");
    if (!files.readyIds.length) e.files = t("claim.file.none");
    if (!attested) e.attestation = t("hireReport.validation.attestation");
    setErrors(e);
    if (Object.keys(e).length) return requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    const fd = new FormData();
    fd.set("checkId", checkId);
    fd.set("statement", statement.trim());
    for (const id of files.readyIds) fd.append("fileIds", id);
    fd.set("attestation", "on");
    start(async () => {
      const r = await submitAuthorizationEvidence(orgSlug, referralId, null, fd);
      if (r.ok) {
        filedRef.current = true;
        toast.success(r.message ?? t("authCheck.submit"));
        router.refresh();
        return;
      }
      const fe = r.fieldErrors ?? {};
      setErrors({ statement: fe.statement?.[0], files: fe.fileIds ? t("claim.file.none") : undefined, attestation: fe.attestation ? t("hireReport.validation.attestation") : undefined });
      setServerError(Object.keys(fe).length ? null : r.error);
    });
  };

  return (
    <div ref={formRef} className="grid gap-4 border-t border-border/60 pt-4">
      <ServerAlert text={serverError} />
      <FormField id={`${uid}-statement`} label={t("authCheck.statement")} required error={errors.statement}>
        <Textarea id={`${uid}-statement`} rows={4} maxLength={2000} value={statement} onChange={(e) => setStatement(e.target.value)} aria-required aria-invalid={errors.statement ? true : undefined} aria-describedby={errors.statement ? `${uid}-statement-error` : undefined} />
        <CharCount count={statement.length} max={2000} />
      </FormField>
      <HireEvidenceList orgSlug={orgSlug} referralId={referralId} kind="auth_evidence" label={t("authCheck.files")} hint={t("claim.filesHint")} onChange={setFiles} filedRef={filedRef} error={errors.files} />
      <Attestation checked={attested} onChange={setAttested} text={t("authCheck.attestation")} error={errors.attestation} />
      {blockReason ? <p id={statusId} className="text-sm text-pretty text-muted-foreground">{blockReason}</p> : null}
      <div className="flex sm:justify-end">
        <Button className={BTN} disabled={pending || !!blockReason} aria-describedby={blockReason ? statusId : undefined} onClick={submit}>
          {pending ? tg("common.actions.working") : t("authCheck.submit")}
        </Button>
      </div>
    </div>
  );
}
