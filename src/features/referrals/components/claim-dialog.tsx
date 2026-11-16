"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, CheckCircle2, CircleAlert, Clock, FileText, Loader2, Plus, ShieldOff, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusPill } from "@/components/shared/status-pill";
import { REFERRAL_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { fileClaim, getClaimEvidenceFiles, removeClaimEvidence, uploadClaimEvidence, type ClaimEvidenceFile } from "../actions";
import { CLAIM_EVIDENCE_MAX_BYTES, CLAIM_EVIDENCE_MAX_FILES, CLAIM_EVIDENCE_TYPES, fileClaimSchema } from "../schemas";
import type { EvidenceReferralOption } from "../queries";
import { deadlineLeft } from "../deadline";
import { BusinessDeadline } from "./business-deadline";

/** Everything the objection form needs, prepared on the server for one claim-eligible referral (AC-27). */
export type ClaimContext = {
  referralId: string;
  version: number;
  /** The sourcing org (who will see the dates, evidence type and note). */
  partner: string;
  deadlineAt: string;
  deadlineLeft: number | null;
  deliveredAt: string;
  options: (EvidenceReferralOption & { revoked?: boolean })[];
  /** N2 (BR-20): the referral's look-back in months (its ownership window; 6 for legacy referrals). */
  lookbackMonths: number;
  /** The server's lower bound (ET date, YYYY-MM-DD); the same rule the claim RPC enforces. */
  priorDateMin: string | null;
  /** Committed under a terms version: the hint names its window. */
  snapshot: boolean;
};

type RowStatus = "uploading" | "processing" | "ready" | "rejected" | "failed";
type Row = { key: string; name: string; size: number; status: RowStatus; file?: File; fileId?: string; uploadedAt?: string; sha?: string | null };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const ET = "America/Toronto";

/** The delivery's calendar date in Toronto as YYYY-MM-DD (en-CA formats ISO-like). */
const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/**
 * Allowed prior-process dates (PD-028, N2 BR-20): from delivery − the look-back months (inclusive,
 * end-of-month clamped, ET) to the day before delivery. The server's bound wins when it sent one.
 */
export function priorDateRange(deliveredAt: string, months = 6, serverMin: string | null = null) {
  const [y, m, d] = etDay(deliveredAt).split("-").map(Number);
  const max = new Date(Date.UTC(y, m - 1, d - 1));
  const lastDay = new Date(Date.UTC(y, m - 1 - months + 1, 0)).getUTCDate();
  const min = new Date(Date.UTC(y, m - 1 - months, Math.min(d, lastDay)));
  const minIso = serverMin && /^\d{4}-\d{2}-\d{2}$/.test(serverMin) ? serverMin : ymd(min);
  return { min: minIso, max: ymd(max), delivered: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const fromServer = (f: ClaimEvidenceFile): Pick<Row, "status" | "uploadedAt" | "sha" | "size"> => ({
  status: f.scan_status === "rejected" ? "rejected" : f.scan_status === "clean" && f.sha256 ? "ready" : "processing",
  uploadedAt: f.uploaded_at,
  sha: f.sha256,
  size: f.size_bytes,
});

/**
 * S5 body: header, scrollable fields and a sticky footer. Mount it inside a DialogContent that is a
 * flex column. Uploaded-but-unfiled files are discarded when the form unmounts (the dialog closes).
 */
export function ClaimForm({
  orgSlug,
  ctx,
  onBack,
  onCancel,
  onFiled,
  inactive = false,
}: {
  orgSlug: string;
  ctx: ClaimContext;
  onBack?: () => void;
  onCancel: () => void;
  onFiled: () => void;
  /** Kept mounted but hidden behind the decline reasons: render plain headings so the dialog has one title. */
  inactive?: boolean;
}) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const f = useFormatter();
  const uid = useId();
  const range = priorDateRange(ctx.deliveredAt, ctx.lookbackMonths, ctx.priorDateMin);
  const [kind, setKind] = useState<"file" | "referral">("file");
  const [rows, setRows] = useState<Row[]>([]);
  const [pickedReferral, setPickedReferral] = useState<string>("");
  const [priorDate, setPriorDate] = useState("");
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"files" | "referral" | "priorDate" | "attested", string>>>({});
  const [serverError, setServerError] = useState<{ text: string; windowClosed: boolean } | null>(null);
  const [pending, start] = useTransition();

  const fileButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const errorBlock = useRef<HTMLDivElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const attestBox = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  // The window-closed message carries the deadline: recognise it by its localized prefix.
  const closedPrefix = tg("errors.claim_window_closed", { when: "\u0000" }).split("\u0000")[0];
  // Uploaded objects that haven't been filed: removed when the form goes away. Cancelled uploads are
  // removed as soon as their (non-abortable) Server Action returns.
  const uploaded = useRef(new Set<string>());
  const cancelled = useRef(new Set<string>());
  const filed = useRef(false);

  useEffect(() => {
    const ids = uploaded.current;
    return () => {
      if (filed.current) return;
      for (const id of ids) void removeClaimEvidence(orgSlug, { fileId: id });
    };
  }, [orgSlug]);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const upload = useCallback(
    async (key: string, file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      try {
        const r = await uploadClaimEvidence(orgSlug, ctx.referralId, null, fd);
        if (cancelled.current.has(key)) {
          if (r.ok && r.data) void removeClaimEvidence(orgSlug, { fileId: r.data.id });
          return;
        }
        if (!r.ok || !r.data) {
          // After the deadline a retry can't succeed: the row can only be removed, and the way back is offered (P7).
          const closed = !r.ok && r.error.startsWith(closedPrefix);
          patch(key, { status: closed ? "rejected" : "failed" });
          if (!r.ok && r.error) setServerError({ text: r.error, windowClosed: closed });
          return;
        }
        uploaded.current.add(r.data.id);
        patch(key, { fileId: r.data.id, file: undefined, ...fromServer(r.data) });
      } catch {
        if (!cancelled.current.has(key)) patch(key, { status: "failed" });
      }
    },
    [orgSlug, ctx.referralId, closedPrefix],
  );

  // Poll every 2 s while any file is being checked (status comes from the worker's scan + SHA-256).
  const processing = rows.some((r) => r.status === "processing");
  useEffect(() => {
    if (!processing) return;
    let inflight = false;
    const timer = setInterval(async () => {
      if (inflight) return;
      inflight = true;
      try {
        const r = await getClaimEvidenceFiles(orgSlug, ctx.referralId);
        if (r.ok && r.data) {
          const byId = new Map(r.data.map((x) => [x.id, x]));
          setRows((rs) => rs.map((row) => (row.fileId && byId.has(row.fileId) ? { ...row, ...fromServer(byId.get(row.fileId)!) } : row)));
        }
      } finally {
        inflight = false;
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [processing, orgSlug, ctx.referralId]);

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = [...list];
    const room = CLAIM_EVIDENCE_MAX_FILES - rows.length;
    let error: string | undefined;
    const accepted: File[] = [];
    for (const file of picked) {
      if (!(file.type in CLAIM_EVIDENCE_TYPES)) error ??= t("claim.validation.fileType");
      else if (file.size > CLAIM_EVIDENCE_MAX_BYTES) error ??= t("claim.validation.fileSize");
      else if (accepted.length >= room) error ??= t("claim.validation.tooManyFiles");
      else accepted.push(file);
    }
    setErrors((e) => ({ ...e, files: error }));
    const next = accepted.map((file) => ({ key: crypto.randomUUID(), name: file.name, size: file.size, status: "uploading" as const, file }));
    setRows((rs) => [...rs, ...next]);
    for (const row of next) void upload(row.key, row.file);
    if (fileInput.current) fileInput.current.value = "";
  };

  const remove = (row: Row) => {
    const i = rows.findIndex((r) => r.key === row.key);
    const after = rows[i + 1] ?? rows[i - 1];
    if (row.status === "uploading") cancelled.current.add(row.key);
    if (row.fileId) {
      uploaded.current.delete(row.fileId);
      void removeClaimEvidence(orgSlug, { fileId: row.fileId });
    }
    setRows((rs) => rs.filter((r) => r.key !== row.key));
    // Focus the next row's Remove button, or the file button when none is left (§6).
    requestAnimationFrame(() => (after ? removeButtons.current.get(after.key) : fileButton.current)?.focus());
  };

  const retry = (row: Row) => {
    if (!row.file) return;
    patch(row.key, { status: "uploading" });
    void upload(row.key, row.file);
    // "Try again" disappears while uploading: keep focus on the row (its Cancel upload button).
    requestAnimationFrame(() => removeButtons.current.get(row.key)?.focus());
  };

  // EC-4: the file path can only be filed once every attached file is ready.
  const notReady = rows.filter((r) => r.status === "uploading" || r.status === "processing").length;
  const rejected = rows.some((r) => r.status === "rejected");
  const failed = rows.some((r) => r.status === "failed");
  const blockReason =
    kind !== "file"
      ? null
      : rows.length === 0
        ? t("claim.file.none")
        : rejected
          ? t("claim.file.removeRejected")
          : failed
            ? t("claim.file.retryOrRemove")
            : notReady
              ? t("claim.file.waiting", { count: notReady })
              : null;
  const statusId = `${uid}-status`;

  const submit = () => {
    const readyIds = rows.filter((r) => r.status === "ready" && r.fileId).map((r) => r.fileId!);
    const input = {
      referralId: ctx.referralId,
      version: ctx.version,
      evidenceKind: kind,
      fileIds: kind === "file" ? readyIds : [],
      evidenceReferralId: kind === "referral" ? pickedReferral || undefined : undefined,
      priorProcessDate: kind === "file" ? priorDate || undefined : undefined,
      attested,
      note: note.trim(),
    };
    // Same schema as the server; messages from the spec's form copy.
    const next: typeof errors = {};
    const parsed = fileClaimSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const p = issue.path[0];
        if (p === "attested") next.attested = t("claim.validation.attestationRequired");
        else if (p === "fileIds") next.files = t("claim.validation.evidenceRequired");
        else if (p === "evidenceReferralId") next.referral = t("claim.validation.evidenceRequired");
        else if (p === "priorProcessDate") next.priorDate = t("claim.validation.priorDateRequired");
      }
    }
    if (kind === "file" && priorDate && !next.priorDate) {
      if (priorDate >= range.delivered) next.priorDate = t("claim.validation.priorDateAfterDelivery", { date: f.date(range.delivered) });
      else if (priorDate < range.min) next.priorDate = t("claim.validation.priorDateTooOld", { date: f.date(range.min), count: ctx.lookbackMonths });
    }
    setErrors(next);
    if (Object.keys(next).length) {
      // Focus the first invalid control: the file button, the first picker option, the date, then the attestation.
      const firstRadio = picker.current?.querySelector<HTMLButtonElement>("button[role=radio]:not([disabled])") ?? null;
      const first = next.files ? fileButton.current : next.referral ? firstRadio : next.priorDate ? dateInput.current : attestBox.current;
      requestAnimationFrame(() => first?.focus());
      return;
    }
    start(async () => {
      setServerError(null);
      const r = await fileClaim(orgSlug, input);
      if (!r.ok) {
        const fe = r.fieldErrors;
        if (fe && Object.keys(fe).length) {
          setErrors({
            attested: fe.attested ? t("claim.validation.attestationRequired") : undefined,
            files: fe.fileIds ? t("claim.validation.evidenceRequired") : undefined,
            referral: fe.evidenceReferralId ? t("claim.validation.evidenceRequired") : undefined,
            priorDate: fe.priorProcessDate ? t("claim.validation.priorDateRequired") : undefined,
          });
          return;
        }
        // The window-closed message carries the deadline; offer the way back to the other reasons.
        setServerError({ text: r.error, windowClosed: r.error.startsWith(closedPrefix) });
        requestAnimationFrame(() => errorBlock.current?.focus());
        return;
      }
      filed.current = true;
      toast.success(t("claim.messages.filed", { partner: ctx.partner, when: f.etDateTime(r.data?.contestDeadlineAt ?? ctx.deadlineAt) }));
      onFiled();
    });
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4">
        {onBack ? (
          <Button data-claim-back variant="ghost" size="sm" className="-ml-3 mb-2 min-h-11 sm:min-h-8" onClick={onBack}>
            <ChevronLeft className="size-4" aria-hidden /> {t("claim.back")}
          </Button>
        ) : null}
        {inactive ? (
          <h2 className="pr-8 text-lg leading-snug font-semibold">{t("claim.title")}</h2>
        ) : (
          <DialogTitle className="pr-8 leading-snug">{t("claim.title")}</DialogTitle>
        )}
        {inactive ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("claim.description", { partner: ctx.partner })}</p>
        ) : (
          <DialogDescription className="mt-2">{t("claim.description", { partner: ctx.partner })}</DialogDescription>
        )}
        <BusinessDeadline className="mt-3" label={t("claim.deadlineLabel")} at={ctx.deadlineAt} left={ctx.deadlineLeft} />

        {serverError ? (
          <div ref={errorBlock} tabIndex={-1} role="alert" className="mt-4 grid gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{serverError.text}</p>
            {serverError.windowClosed && onBack ? (
              <Button variant="outline" size="sm" className="min-h-11 justify-self-start sm:min-h-8" onClick={onBack}>{t("claim.back")}</Button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5">
          {/* Evidence type */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("claim.evidenceType")}</legend>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as "file" | "referral")} className="gap-2" aria-label={t("claim.evidenceType")}>
              <Label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground">
                <RadioGroupItem value="file" className="mt-0.5" aria-describedby={`${uid}-file-hint`} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{t("claim.evidenceFile")}</span>
                  <span id={`${uid}-file-hint`} className="text-xs text-muted-foreground">{t("claim.evidenceFileHint")}</span>
                </span>
              </Label>
              <Label className={cn("flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground", !ctx.options.length && "opacity-60")}>
                <RadioGroupItem value="referral" disabled={!ctx.options.length} className="mt-0.5" aria-describedby={`${uid}-ref-hint`} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{t("claim.evidenceReferral")}</span>
                  <span id={`${uid}-ref-hint`} className="text-xs text-muted-foreground">
                    {ctx.options.length ? t("claim.evidenceReferralHint") : t("claim.evidenceReferralNone")}
                  </span>
                </span>
              </Label>
            </RadioGroup>
          </fieldset>

          {kind === "file" ? (
            <>
              <div className="grid gap-2">
                <p className="text-sm font-medium" id={`${uid}-files-label`}>{t("claim.files")}</p>
                <p id={`${uid}-files-hint`} className="text-xs text-muted-foreground">{t("claim.filesHint")}</p>
                <p className="flex items-start gap-2 text-sm">
                  <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-pretty">{t("claim.uploadDeadline", { when: f.etDateTime(ctx.deadlineAt), left: deadlineLeft(t, f, ctx.deadlineAt, ctx.deadlineLeft) })}</span>
                </p>
                <input
                  ref={fileInput}
                  id={`${uid}-file`}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => onPick(e.target.files)}
                />
                {rows.length < CLAIM_EVIDENCE_MAX_FILES ? (
                  <Button
                    ref={fileButton}
                    type="button"
                    variant="outline"
                    className="min-h-11 justify-self-start"
                    aria-describedby={[`${uid}-files-hint`, errors.files ? `${uid}-files-error` : null].filter(Boolean).join(" ")}
                    aria-invalid={errors.files ? true : undefined}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Plus className="size-4" aria-hidden /> {rows.length ? t("claim.addMoreFiles") : t("claim.addFiles")}
                  </Button>
                ) : null}
                {errors.files ? <p id={`${uid}-files-error`} role="alert" className="text-xs font-medium text-danger">{errors.files}</p> : null}
                {/* Uploading rows are aria-busy, so their "Uploading…" is announced here instead. */}
                <span className="sr-only" aria-live="polite">
                  {rows.length ? t("claim.file.selectedSr", { count: rows.length }) : ""}
                  {rows.filter((r) => r.status === "uploading").map((r) => ` · ${r.name} ${t("claim.file.uploading")}`).join("")}
                </span>
                {rows.length ? (
                  <ul className="grid gap-2" aria-live="polite" aria-labelledby={`${uid}-files-label`}>
                    {rows.map((row) => (
                      <FileRow key={row.key} row={row} onRemove={() => remove(row)} onRetry={() => retry(row)} removeRef={(el) => (el ? removeButtons.current.set(row.key, el) : removeButtons.current.delete(row.key))} />
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-date`} className="text-sm font-medium">{t("claim.priorDate")}</Label>
                <Input
                  ref={dateInput}
                  id={`${uid}-date`}
                  type="date"
                  min={range.min}
                  max={range.max}
                  value={priorDate}
                  onChange={(e) => setPriorDate(e.target.value)}
                  aria-invalid={errors.priorDate ? true : undefined}
                  aria-describedby={errors.priorDate ? `${uid}-date-error` : `${uid}-date-hint`}
                  className="h-11 max-w-xs sm:h-10"
                />
                {errors.priorDate ? (
                  <p id={`${uid}-date-error`} role="alert" className="text-xs font-medium text-danger">{errors.priorDate}</p>
                ) : (
                  <p id={`${uid}-date-hint`} className="text-xs text-muted-foreground">
                    {t("claim.priorDateHint", { from: f.date(range.min), to: f.date(range.max) })}
                    {ctx.snapshot ? <> {t("claim.priorDateWindowHint", { count: ctx.lookbackMonths })}</> : null}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <p id={`${uid}-pick-label`} className="text-sm font-medium">{t("claim.pickReferral")}</p>
              <RadioGroup
                ref={picker}
                value={pickedReferral}
                onValueChange={setPickedReferral}
                aria-labelledby={`${uid}-pick-label`}
                aria-invalid={errors.referral ? true : undefined}
                aria-describedby={errors.referral ? `${uid}-pick-error` : undefined}
                className="gap-2"
              >
                {ctx.options.map((o) => (
                  <Label key={o.referral_id} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground">
                    <RadioGroupItem value={o.referral_id} className="mt-0.5" />
                    <span className="grid min-w-0 flex-1 gap-1.5">
                      <span className="text-sm text-pretty">
                        {t("claim.pickerOption", { candidate: o.candidate_label, job: o.job_title, partner: o.source_org_name, date: f.etDate(o.delivered_at) })}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={REFERRAL_STATUS[o.status as keyof typeof REFERRAL_STATUS]?.tone ?? "neutral"} label={tg(`labels.referralStatus.${o.status}` as Parameters<typeof tg>[0])} className="text-xs" />
                        {o.revoked ? <span className="inline-flex items-center gap-1 text-xs text-danger"><ShieldOff className="size-3" aria-hidden />{t("queue.revoked")}</span> : null}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {errors.referral ? <p id={`${uid}-pick-error`} role="alert" className="text-xs font-medium text-danger">{errors.referral}</p> : null}
              {pickedReferral ? (
                <p className="text-sm text-muted-foreground">
                  {t("claim.priorDateFromReferral", { date: f.etDate(ctx.options.find((o) => o.referral_id === pickedReferral)?.delivered_at) })}
                </p>
              ) : null}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-note`} className="text-sm font-medium">{t("claim.note")}</Label>
            <Textarea id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} aria-describedby={`${uid}-note-hint`} />
            <p id={`${uid}-note-hint`} className="text-xs text-muted-foreground">{t("claim.noteHint", { partner: ctx.partner })}</p>
          </div>

          <div className="grid gap-1.5">
            <Label className="flex min-h-11 items-start gap-2.5 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
              <Checkbox
                ref={attestBox}
                checked={attested}
                onCheckedChange={(v) => setAttested(v === true)}
                className="mt-0.5"
                aria-invalid={errors.attested ? true : undefined}
                aria-describedby={errors.attested ? `${uid}-attest-error` : undefined}
              />
              <span className="text-sm">{t("claim.attestation")}</span>
            </Label>
            {errors.attested ? <p id={`${uid}-attest-error`} role="alert" className="text-xs font-medium text-danger">{errors.attested}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-t border-border/60 bg-background px-6 py-4">
        {blockReason ? <p id={statusId} className="text-sm text-muted-foreground">{blockReason}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button variant="destructive" className="min-h-11 sm:min-h-10" disabled={pending || !!blockReason} aria-describedby={blockReason ? statusId : undefined} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {pending ? t("claim.submitting") : t("claim.submit")}
          </Button>
          <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={pending} onClick={onCancel}>{tg("common.actions.cancel")}</Button>
        </div>
      </div>
    </>
  );
}

function FileRow({ row, onRemove, onRetry, removeRef }: { row: Row; onRemove: () => void; onRetry: () => void; removeRef: (el: HTMLButtonElement | null) => void }) {
  const t = useT("referrals");
  const f = useFormatter();
  const size = f.fileSize(row.size);
  // Indeterminate bar, no percentage (AC-65 as amended, PD-029): Server Actions report no upload progress.
  const uploadingLabel = t("claim.file.uploading");
  return (
    <li aria-busy={row.status === "uploading" || undefined} className={cn("grid gap-2 rounded-2xl border border-border/60 p-3", row.status === "rejected" && "border-danger/30 bg-danger-soft")}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden>
          {row.status === "ready" ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : row.status === "rejected" ? (
            <XCircle className="size-4 text-danger" />
          ) : row.status === "failed" ? (
            <CircleAlert className="size-4 text-warning" />
          ) : row.status === "processing" ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <FileText className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.name}</p>
          {/* Inside the list's polite live region: each state change ("Uploading…", "Checking file…", ready, can't be used) is announced with the file name. */}
          <p className={cn("text-xs text-pretty", row.status === "rejected" ? "text-danger" : "text-muted-foreground")}>
            <span className="sr-only">{row.name} </span>
            {row.status === "uploading"
              ? uploadingLabel
              : row.status === "processing"
                ? t("claim.file.processing")
                : row.status === "ready"
                  ? `${t("claim.file.ready", { size, when: f.etDateTimeShort(row.uploadedAt) })}${row.sha ? ` · ${row.sha.slice(0, 12)}…` : ""}`
                  : row.status === "rejected"
                    ? t("claim.file.rejected")
                    : t("claim.file.failed")}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {row.status === "failed" && row.file ? (
            <Button variant="ghost" size="sm" className="min-h-11" onClick={onRetry}>{t("claim.file.retry")}</Button>
          ) : null}
          <Button
            ref={removeRef}
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={row.status === "uploading" ? t("claim.file.cancelAria", { name: row.name }) : t("claim.removeFileAria", { name: row.name })}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      {row.status === "uploading" ? (
        <div role="progressbar" aria-label={uploadingLabel} aria-valuetext={uploadingLabel} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-foreground/60 motion-reduce:animate-none" />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Standalone S5 (referral page action bar, and the review panel footer for revoked referrals):
 * opens the objection form directly, with no "Back to decline reasons".
 */
export function PriorPresentationClaimDialog({ orgSlug, ctx, triggerClassName, onFiled }: { orgSlug: string; ctx: ClaimContext; triggerClassName?: string; onFiled?: () => void }) {
  const t = useT("referrals");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" title={t("claim.title")} className={cn("min-h-11 w-full sm:min-h-0 sm:w-auto", triggerClassName)}>{t("claim.trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg">
        <ClaimForm
          orgSlug={orgSlug}
          ctx={ctx}
          onCancel={() => setOpen(false)}
          onFiled={() => {
            setOpen(false);
            if (onFiled) onFiled();
            else router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
