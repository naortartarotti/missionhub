"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { CheckCircle2, CircleAlert, FileText, Loader2, Plus, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFormatter, useT } from "@/i18n/client";
import { getHireEvidenceFiles, removeHireEvidence, uploadHireEvidence, type HireEvidenceFile } from "../actions";
import { HIRE_EVIDENCE_MAX_BYTES, HIRE_EVIDENCE_MIME, type HireEvidenceKind } from "../schemas";

/**
 * N3 evidence upload list (spec §2.5 item 5): the N1 rows exactly (uploading → processing → ready / rejected /
 * upload failed, same copy, `aria-live`), for the hire-evidence bucket and one purpose (`ownerKind`). Up to 5 files,
 * PDF / PNG / JPEG, 10 MB each. Drafts never attached are removed when the list unmounts (closing the dialog
 * discards them; orphans are also purged server-side).
 */
export const HIRE_MAX_FILES = 5;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

type RowStatus = "uploading" | "processing" | "ready" | "rejected" | "failed";
type Row = { key: string; name: string; size: number; status: RowStatus; file?: File; fileId?: string; uploadedAt?: string; sha?: string | null };

export type HireEvidenceState = { readyIds: string[]; count: number; notReady: number; rejected: boolean; failed: boolean };
export const EMPTY_EVIDENCE: HireEvidenceState = { readyIds: [], count: 0, notReady: 0, rejected: false, failed: false };

const fromServer = (f: HireEvidenceFile): Pick<Row, "status" | "uploadedAt" | "size" | "sha"> => ({
  status: f.scan_status === "rejected" ? "rejected" : f.scan_status === "clean" && f.sha256 ? "ready" : "processing",
  uploadedAt: f.uploaded_at,
  size: f.size_bytes,
  sha: f.sha256,
});

export function HireEvidenceList({
  orgSlug,
  referralId,
  kind,
  label,
  hint,
  onChange,
  filedRef,
  error,
}: {
  orgSlug: string;
  referralId: string;
  kind: HireEvidenceKind;
  label: string;
  hint: string;
  onChange: (s: HireEvidenceState) => void;
  /** Set to true by the parent once the files are attached, so they aren't discarded on unmount. */
  filedRef: RefObject<boolean>;
  error?: string;
}) {
  const t = useT("referrals");
  const uid = useId();
  const [rows, setRows] = useState<Row[]>([]);
  const [pickError, setPickError] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const uploaded = useRef(new Set<string>());
  const cancelled = useRef(new Set<string>());

  useEffect(() => {
    const ids = uploaded.current;
    // The parent flips `filed` after attaching the files: the latest value is wanted at unmount, not a snapshot.
    const filed = filedRef;
    return () => {
      if (filed.current) return;
      for (const fileId of ids) void removeHireEvidence(orgSlug, { fileId });
    };
  }, [orgSlug, filedRef]);

  const report = useRef(onChange);
  useEffect(() => { report.current = onChange; });
  useEffect(() => {
    report.current({
      readyIds: rows.filter((r) => r.status === "ready" && r.fileId).map((r) => r.fileId!),
      count: rows.length,
      notReady: rows.filter((r) => r.status === "uploading" || r.status === "processing").length,
      rejected: rows.some((r) => r.status === "rejected"),
      failed: rows.some((r) => r.status === "failed"),
    });
  }, [rows]);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const upload = useCallback(
    async (key: string, file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      try {
        const r = await uploadHireEvidence(orgSlug, referralId, kind, null, fd);
        if (cancelled.current.has(key)) {
          if (r.ok && r.data) void removeHireEvidence(orgSlug, { fileId: r.data.id });
          return;
        }
        if (!r.ok || !r.data) {
          patch(key, { status: "failed" });
          return;
        }
        uploaded.current.add(r.data.id);
        patch(key, { fileId: r.data.id, file: undefined, ...fromServer(r.data) });
      } catch {
        if (!cancelled.current.has(key)) patch(key, { status: "failed" });
      }
    },
    [orgSlug, referralId, kind],
  );

  // Poll every 2 s while any file is being checked (the worker's scan + SHA-256).
  const processing = rows.some((r) => r.status === "processing");
  useEffect(() => {
    if (!processing) return;
    let inflight = false;
    const timer = setInterval(async () => {
      if (inflight) return;
      inflight = true;
      try {
        const r = await getHireEvidenceFiles(orgSlug, referralId, kind);
        if (r.ok && r.data) {
          const byId = new Map(r.data.map((x) => [x.id, x]));
          setRows((rs) => rs.map((row) => (row.fileId && byId.has(row.fileId) ? { ...row, ...fromServer(byId.get(row.fileId)!) } : row)));
        }
      } finally {
        inflight = false;
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [processing, orgSlug, referralId, kind]);

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const room = HIRE_MAX_FILES - rows.length;
    let err: string | undefined;
    const accepted: File[] = [];
    for (const file of list) {
      if (!(file.type in HIRE_EVIDENCE_MIME)) err ??= t("claim.validation.fileType");
      else if (file.size > HIRE_EVIDENCE_MAX_BYTES) err ??= t("claim.validation.fileSize");
      else if (accepted.length >= room) err ??= t("claim.validation.tooManyFiles");
      else accepted.push(file);
    }
    setPickError(err);
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
      void removeHireEvidence(orgSlug, { fileId: row.fileId });
    }
    setRows((rs) => rs.filter((r) => r.key !== row.key));
    requestAnimationFrame(() => (after ? removeButtons.current.get(after.key) : fileButton.current)?.focus());
  };

  const retry = (row: Row) => {
    if (!row.file) return;
    patch(row.key, { status: "uploading" });
    void upload(row.key, row.file);
    requestAnimationFrame(() => removeButtons.current.get(row.key)?.focus());
  };

  const shownError = pickError ?? error;
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium" id={`${uid}-label`}>{label}</p>
      <p id={`${uid}-hint`} className="text-xs text-pretty text-muted-foreground">{hint}</p>
      <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files)} />
      {rows.length < HIRE_MAX_FILES ? (
        <Button
          ref={fileButton}
          type="button"
          variant="outline"
          className="min-h-11 justify-self-start"
          aria-describedby={[`${uid}-hint`, shownError ? `${uid}-error` : null].filter(Boolean).join(" ")}
          aria-invalid={shownError ? true : undefined}
          onClick={() => fileInput.current?.click()}
        >
          <Plus className="size-4" aria-hidden /> {rows.length ? t("claim.addMoreFiles") : t("claim.addFiles")}
        </Button>
      ) : null}
      {shownError ? <p id={`${uid}-error`} role="alert" className="text-xs font-medium text-danger">{shownError}</p> : null}
      <span className="sr-only" aria-live="polite">
        {rows.length ? t("claim.file.selectedSr", { count: rows.length }) : ""}
        {rows.filter((r) => r.status === "uploading").map((r) => ` · ${r.name} ${t("claim.file.uploading")}`).join("")}
      </span>
      {rows.length ? (
        <ul className="grid gap-2" aria-live="polite" aria-labelledby={`${uid}-label`}>
          {rows.map((row) => (
            <FileRow key={row.key} row={row} onRemove={() => remove(row)} onRetry={() => retry(row)} removeRef={(el) => (el ? removeButtons.current.set(row.key, el) : removeButtons.current.delete(row.key))} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The status line under a form's submit button while files block it (spec §2.5 item 8). */
export function useHireEvidenceBlockReason(s: HireEvidenceState): string | null {
  const t = useT("referrals");
  if (s.rejected) return t("hireReport.file.removeRejected");
  if (s.failed) return t("claim.file.retryOrRemove");
  if (s.notReady) return t("hireReport.file.waiting");
  return null;
}

function FileRow({ row, onRemove, onRetry, removeRef }: { row: Row; onRemove: () => void; onRetry: () => void; removeRef: (el: HTMLButtonElement | null) => void }) {
  const t = useT("referrals");
  const f = useFormatter();
  const size = f.fileSize(row.size);
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
          <p className="truncate text-sm font-medium" title={row.name}>{row.name}</p>
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
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onRetry}>{t("claim.file.retry")}</Button>
          ) : null}
          <Button
            ref={removeRef}
            type="button"
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
