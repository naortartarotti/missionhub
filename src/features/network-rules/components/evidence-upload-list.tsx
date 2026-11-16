"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { CheckCircle2, CircleAlert, FileText, Loader2, Plus, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFormatter, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/actions/result";
import { getConductDraftFiles, removeConductDraftFile, uploadConductEvidence } from "../actions";
import { uploadAdminConductEvidence } from "../admin-actions";
import type { ConductFile } from "../types";

/**
 * N10 evidence upload list (spec §2.8 item 6, "EvidenceUploadList"): the N1 upload rows (states
 * uploading → processing → ready / rejected / upload failed, same copy), for reports, replies,
 * responses, review requests and admin-opened cases. Up to 5 files, PDF / PNG / JPEG, 10 MB each.
 * Uploaded drafts that were never attached are removed when the list unmounts (orphans are also
 * purged server-side).
 */
export const CONDUCT_MAX_FILES = 5;
export const CONDUCT_MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

type RowStatus = "uploading" | "processing" | "ready" | "rejected" | "failed";
type Row = { key: string; name: string; size: number; status: RowStatus; file?: File; fileId?: string; uploadedAt?: string };

export type EvidenceState = { readyIds: string[]; count: number; notReady: number; rejected: boolean; failed: boolean };

const fromServer = (f: ConductFile): Pick<Row, "status" | "uploadedAt" | "size"> => ({
  status: f.scan_status === "rejected" ? "rejected" : f.scan_status === "clean" ? "ready" : "processing",
  uploadedAt: f.uploaded_at,
  size: f.size_bytes,
});

export function EvidenceUploadList({
  orgSlug,
  admin = false,
  label,
  hint,
  onChange,
  filedRef,
  error,
}: {
  /** Member uploads go under the org; `admin` uses the platform-admin path (S18). */
  orgSlug?: string;
  admin?: boolean;
  label: string;
  hint: string;
  onChange: (s: EvidenceState) => void;
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

  const upload_ = useCallback(
    (fd: FormData): Promise<ActionResult<ConductFile>> => (admin ? uploadAdminConductEvidence(null, fd) : uploadConductEvidence(orgSlug!, null, fd)),
    [admin, orgSlug],
  );
  const remove_ = useCallback((id: string) => (admin ? Promise.resolve() : removeConductDraftFile(orgSlug!, id)), [admin, orgSlug]);

  useEffect(() => {
    const ids = uploaded.current;
    return () => {
      // Read at unmount on purpose: the parent sets it once the files are attached (not a DOM ref).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (filedRef.current) return;
      for (const id of ids) void remove_(id);
    };
  }, [remove_, filedRef]);

  useEffect(() => {
    onChange({
      readyIds: rows.filter((r) => r.status === "ready" && r.fileId).map((r) => r.fileId!),
      count: rows.length,
      notReady: rows.filter((r) => r.status === "uploading" || (r.status === "processing" && !admin)).length,
      rejected: rows.some((r) => r.status === "rejected"),
      failed: rows.some((r) => r.status === "failed"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const upload = useCallback(
    async (key: string, file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      try {
        const r = await upload_(fd);
        if (cancelled.current.has(key)) {
          if (r.ok && r.data) void remove_(r.data.id);
          return;
        }
        if (!r.ok || !r.data) {
          patch(key, { status: "failed" });
          return;
        }
        uploaded.current.add(r.data.id);
        // Admin uploads can't be polled (no admin draft-list action): treated as ready, the server checks the scan when the case is opened.
        patch(key, { fileId: r.data.id, file: undefined, ...fromServer(r.data), ...(admin && r.data.scan_status === "pending" ? { status: "ready" as const } : {}) });
      } catch {
        if (!cancelled.current.has(key)) patch(key, { status: "failed" });
      }
    },
    [upload_, remove_, admin],
  );

  // Poll every 2 s while any file is being checked (the worker's scan).
  const processing = rows.some((r) => r.status === "processing");
  useEffect(() => {
    if (!processing || admin) return;
    let inflight = false;
    const timer = setInterval(async () => {
      if (inflight) return;
      inflight = true;
      try {
        const ids = rows.filter((r) => r.fileId).map((r) => r.fileId!);
        const r = await getConductDraftFiles(orgSlug!, ids);
        if (r.ok && r.data) {
          const byId = new Map(r.data.map((x) => [x.id, x]));
          setRows((rs) => rs.map((row) => (row.fileId && byId.has(row.fileId) ? { ...row, ...fromServer(byId.get(row.fileId)!) } : row)));
        }
      } finally {
        inflight = false;
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [processing, admin, orgSlug, rows]);

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const room = CONDUCT_MAX_FILES - rows.length;
    let err: string | undefined;
    const accepted: File[] = [];
    for (const file of list) {
      if (!TYPES.includes(file.type)) err ??= t("claim.validation.fileType");
      else if (file.size > CONDUCT_MAX_BYTES) err ??= t("claim.validation.fileSize");
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
      void remove_(row.fileId);
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
      <p id={`${uid}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files)} />
      {rows.length < CONDUCT_MAX_FILES ? (
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

/** The status line under a form's submit button while files block it (N1 pattern). */
export function useEvidenceBlockReason(s: EvidenceState | null): string | null {
  const t = useT("referrals");
  const tn = useT("network");
  if (!s) return null;
  if (s.rejected) return tn("report.removeRejected");
  if (s.failed) return t("claim.file.retryOrRemove");
  if (s.notReady) return tn("report.filesWaiting");
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
          <p className="truncate text-sm font-medium">{row.name}</p>
          <p className={cn("text-xs text-pretty", row.status === "rejected" ? "text-danger" : "text-muted-foreground")}>
            <span className="sr-only">{row.name} </span>
            {row.status === "uploading"
              ? uploadingLabel
              : row.status === "processing"
                ? t("claim.file.processing")
                : row.status === "ready"
                  ? t("claim.file.ready", { size, when: f.etDateTimeShort(row.uploadedAt) })
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
