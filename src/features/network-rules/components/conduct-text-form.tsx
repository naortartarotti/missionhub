"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type ResolverResult } from "react-hook-form";
import { toast } from "sonner";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CharCount } from "@/components/shared/char-count";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useGlobalT, useT } from "@/i18n/client";
import { translateMarked } from "@/i18n/translate";
import type { ActionResult } from "@/lib/actions/result";
import { replyToConductFollowup, replyToConductInfoRequest, requestSanctionReview, submitConductResponse } from "../actions";
import { followupReplySchema, reportReplySchema, responseSchema, reviewRequestSchema } from "../schemas";
import { EvidenceUploadList, useEvidenceBlockReason, type EvidenceState } from "./evidence-upload-list";

/**
 * One text + files form for the four member writes that carry evidence (react-hook-form + the same
 * Zod schema as the Server Action): the reporter's reply (S9), the org's response and follow-up reply
 * (S11) and the review request (S11). Server codes with context copy are passed in `codeMessages`.
 */
type Kind = "reportReply" | "response" | "followupReply" | "reviewRequest";

const CONFIG = {
  reportReply: { schema: reportReplySchema, idField: "caseId", textField: "body", max: 4000 },
  response: { schema: responseSchema, idField: "noticeId", textField: "body", max: 8000 },
  followupReply: { schema: followupReplySchema, idField: "followupId", textField: "body", max: 4000 },
  reviewRequest: { schema: reviewRequestSchema, idField: "caseId", textField: "text", max: 8000 },
} as const;

type Values = { id: string; text: string; fileIds: string[] };

export function ConductTextForm({
  orgSlug,
  kind,
  targetId,
  label,
  hint,
  submitLabel,
  filesHint,
  confirm,
  successToast,
  codeMessages = {},
  onDone,
  onCancel,
}: {
  orgSlug: string;
  kind: Kind;
  targetId: string;
  label: string;
  hint: string;
  submitLabel: string;
  filesHint: string;
  /** Confirm dialog before sending (the one response per notice, §2.11). */
  confirm?: { title: string; body: string; confirmLabel: string };
  successToast: string;
  codeMessages?: Record<string, string>;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const t = useT("network");
  const tg = useGlobalT();
  const router = useRouter();
  const uid = useId();
  const cfg = CONFIG[kind];
  const [files, setFiles] = useState<EvidenceState | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const filedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const blockReason = useEvidenceBlockReason(files);

  // The schema's field names differ per action; the form maps them to { id, text, fileIds }.
  const toInput = (v: Values) => ({ [cfg.idField]: v.id, [cfg.textField]: v.text, fileIds: v.fileIds });
  const form = useForm<Values>({
    defaultValues: { id: targetId, text: "", fileIds: [] },
    // The action's own schema validates the mapped input; its text error is shown on the textarea.
    resolver: async (values) => {
      const r = cfg.schema.safeParse(toInput(values));
      if (r.success) return { values, errors: {} };
      const issue = r.error.issues.find((i) => i.path[0] === cfg.textField) ?? r.error.issues[0];
      return { values: {}, errors: { text: { type: "validate", message: issue?.message ?? "" } } } as unknown as ResolverResult<Values>;
    },
  });
  const text = useWatch({ control: form.control, name: "text" }) ?? "";
  const textError = form.formState.errors.text?.message;

  const send = async (): Promise<ActionResult | void> => {
    const v = { id: targetId, text: form.getValues("text"), fileIds: files?.readyIds ?? [] };
    let r: ActionResult;
    if (kind === "reportReply") r = await replyToConductInfoRequest(orgSlug, { caseId: v.id, body: v.text, fileIds: v.fileIds });
    else if (kind === "response") r = await submitConductResponse(orgSlug, { noticeId: v.id, body: v.text, fileIds: v.fileIds });
    else if (kind === "followupReply") r = await replyToConductFollowup(orgSlug, { followupId: v.id, body: v.text, fileIds: v.fileIds });
    else r = await requestSanctionReview(orgSlug, { caseId: v.id, text: v.text, fileIds: v.fileIds });
    if (!r.ok) {
      const fe = r.fieldErrors?.[cfg.textField]?.[0];
      if (fe) form.setError("text", { type: "server", message: fe });
      else setServerError((r.code && codeMessages[r.code]) || r.error);
      requestAnimationFrame(() => (fe ? document.getElementById(`${uid}-text`) : errorRef.current)?.focus());
      return;
    }
    filedRef.current = true;
    toast.success(successToast);
    onDone?.();
    router.refresh();
  };

  const onValid = () => {
    setServerError(null);
    if (confirm) setConfirmOpen(true);
    else start(async () => void (await send()));
  };

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => void form.handleSubmit(onValid, () => requestAnimationFrame(() => document.getElementById(`${uid}-text`)?.focus()))(e)}
    >
      {serverError ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-text`} className="text-sm font-medium">{label}</Label>
        <Textarea
          id={`${uid}-text`}
          rows={6}
          maxLength={cfg.max}
          aria-invalid={textError ? true : undefined}
          aria-describedby={textError ? `${uid}-error` : `${uid}-hint`}
          {...form.register("text")}
        />
        {textError ? (
          <p id={`${uid}-error`} role="alert" className="text-xs font-medium text-danger">{translateMarked(tg, textError)}</p>
        ) : (
          <p id={`${uid}-hint`} className="text-xs text-muted-foreground">{hint}</p>
        )}
        <CharCount count={text.length} max={cfg.max} />
      </div>
      <EvidenceUploadList orgSlug={orgSlug} label={t("case.files")} hint={filesHint} onChange={setFiles} filedRef={filedRef} />
      <div className="grid gap-2">
        {blockReason ? <p id={`${uid}-status`} className="text-sm text-muted-foreground">{blockReason}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={pending || !!blockReason} aria-describedby={blockReason ? `${uid}-status` : undefined}>
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {pending ? tg("common.actions.working") : submitLabel}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={onCancel} disabled={pending}>
              {tg("common.actions.cancel")}
            </Button>
          ) : null}
        </div>
      </div>
      {confirm ? (
        <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={confirm.title} description={confirm.body} confirmLabel={confirm.confirmLabel} onConfirm={async () => (await send()) ?? undefined} />
      ) : null}
    </form>
  );
}
