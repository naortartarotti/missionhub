"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Circle, MoreHorizontal, Download, FileText, ShieldCheck, ShieldOff, Trash2, Upload } from "lucide-react";
import { Panel } from "@/components/shared/card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { StatusPill } from "@/components/shared/status-pill";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { LEGAL_BASIS } from "@/lib/labels";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import {
  anonymizeCandidate,
  deleteDocument,
  getDocumentUrl,
  recordConsent,
  revokeConsent,
  setCandidateStatus,
  uploadDocument,
} from "../actions";

type Status = "draft" | "active_for_matching" | "unavailable" | "archived" | "deleted";

const TOAST_STATUSES = ["active_for_matching", "unavailable", "archived"] as const;
const hasToast = (s: string): s is (typeof TOAST_STATUSES)[number] => (TOAST_STATUSES as readonly string[]).includes(s);

function Step({ done, current, title, children }: { done: boolean; current: boolean; title: string; children?: React.ReactNode }) {
  const t = useT("candidates");
  return (
    <li className="flex gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      ) : (
        <Circle className={cn("mt-0.5 size-5 shrink-0", current ? "text-foreground" : "text-muted-foreground/50")} aria-hidden />
      )}
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", !done && !current && "text-muted-foreground")}>
          {title}
          <span className="sr-only">{done ? ` (${t("setup.doneSr")})` : current ? ` (${t("setup.nextSr")})` : ""}</span>
        </p>
        {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
      </div>
    </li>
  );
}

/** One place that explains where the candidate stands and what to do next. */
export function MatchingSetup({
  orgSlug,
  candidateId,
  firstName,
  status,
  hasPermission,
  canWrite,
}: {
  orgSlug: string;
  candidateId: string;
  firstName: string;
  status: Status;
  hasPermission: boolean;
  canWrite: boolean;
}) {
  const t = useT("candidates");
  const [pending, start] = useTransition();
  const run = (next: string) =>
    start(async () => {
      const r = await setCandidateStatus(orgSlug, { candidateId, status: next });
      if (r.ok) toast.success(hasToast(next) ? t(`setup.toast.${next}`) : (r.message ?? t("setup.updated")));
      else toast.error(r.error);
    });
  if (status === "deleted") return null;

  // When matching is on, the header status + "⋯" menu say it all; no banner.
  if (status === "active_for_matching") return null;

  const paused = status === "unavailable" || status === "archived";
  return (
    <Panel className="grid gap-4">
      <div>
        <p className="font-medium">{paused ? t("setup.pausedTitle", { name: firstName }) : t("setup.getMatchedTitle", { name: firstName })}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {paused ? t("setup.pausedBody") : t("setup.getMatchedBody")}
        </p>
      </div>
      <ol className="grid gap-3">
        <Step done current={false} title={t("setup.stepProfile")} />
        <Step done={hasPermission} current={!hasPermission} title={t("setup.stepPermission")}>
          {hasPermission ? null : (
            <>
              {t("setup.stepPermissionHint")}{" "}
              <a href="#permission" className="font-medium text-foreground underline underline-offset-4">{t("setup.stepPermissionLink")}</a>
            </>
          )}
        </Step>
        <Step done={false} current={hasPermission} title={t("setup.stepMatching")}>
          {hasPermission ? t("setup.stepMatchingReady") : t("setup.stepMatchingLocked")}
        </Step>
      </ol>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("active_for_matching")} disabled={pending || !hasPermission}>
            <ShieldCheck className="size-4" aria-hidden /> {t("setup.turnOn")}
          </Button>
          {status !== "archived" ? (
            <Button variant="ghost" onClick={() => run("archived")} disabled={pending}>
              {t("setup.archive")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

/** Header "⋯" menu: the less common status moves (pause / archive). */
export function CandidateStatusMenu({ orgSlug, candidateId, status }: { orgSlug: string; candidateId: string; status: Status }) {
  const t = useT("candidates");
  const [pending, start] = useTransition();
  const moves = [
    ...(status === "active_for_matching" ? [{ to: "unavailable", label: t("setup.pause") }] : []),
    ...(status !== "archived" && status !== "deleted" ? [{ to: "archived", label: t("setup.archive") }] : []),
  ];
  if (!moves.length) return null;
  const run = (next: string) =>
    start(async () => {
      const r = await setCandidateStatus(orgSlug, { candidateId, status: next });
      if (r.ok) toast.success(hasToast(next) ? t(`setup.toast.${next}`) : (r.message ?? t("setup.updated")));
      else toast.error(r.error);
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" disabled={pending} aria-label={t("detail.more")} title={t("detail.more")}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5">
        {moves.map((m) => (
          <DropdownMenuItem key={m.to} className="rounded-xl" onSelect={() => run(m.to)}>
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Consent = {
  id: string;
  kind: "processing" | "job_sharing";
  legal_basis: keyof typeof LEGAL_BASIS;
  scope: string;
  evidence: string;
  obtained_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  job_id: string | null;
};

export function ConsentPanel({ orgSlug, candidateId, consents, canWrite }: { orgSlug: string; candidateId: string; consents: Consent[]; canWrite: boolean }) {
  const t = useT("candidates");
  const tg = useGlobalT();
  const f = useFormatter();
  const [state, action] = useActionState(recordConsent.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <div className="grid gap-4">
      {consents.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          <ShieldOff className="size-4 shrink-0" aria-hidden /> {t("consent.none")}
        </p>
      ) : (
        <ul className="-my-1 divide-y divide-border/60">
          {consents.map((c) => (
            <li key={c.id} className="py-3 first:pt-1 last:pb-1">
              <div className="flex items-start gap-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", c.revoked_at ? "bg-danger/10 text-danger" : "bg-success/10 text-success")} aria-hidden>
                  {c.revoked_at ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.kind === "processing" ? t("consent.processing") : t("consent.jobSharing")}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={cn("font-medium", c.revoked_at ? "text-danger" : "text-success")}>
                      {c.revoked_at ? t("consent.revokedOn", { date: f.date(c.revoked_at) }) : t("consent.active")}
                    </span>
                    {" · "}
                    {[tg(`labels.legalBasis.${c.legal_basis}`), f.date(c.obtained_at), c.expires_at ? t("consent.expires", { date: f.date(c.expires_at) }) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <details className="group mt-2 pl-12 text-sm">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  {t("consent.details")}
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <dl className="mt-2 grid gap-1.5 text-muted-foreground">
                  <div><dt className="text-xs font-medium text-foreground">{t("consent.covers")}</dt><dd>{c.scope}</dd></div>
                  <div><dt className="text-xs font-medium text-foreground">{t("consent.evidence")}</dt><dd>{c.evidence}</dd></div>
                  {c.revoked_reason ? <div><dt className="text-xs font-medium text-foreground">{t("consent.revocationReason")}</dt><dd>{c.revoked_reason}</dd></div> : null}
                </dl>
                {!c.revoked_at && canWrite ? (
                  <div className="mt-3">
                    <ConfirmDialog
                      trigger={<Button variant="outline" size="sm">{t("consent.revoke")}</Button>}
                      title={t("consent.revokeTitle")}
                      description={c.kind === "job_sharing" ? t("consent.revokeJobSharing") : t("consent.revokeProcessing")}
                      confirmLabel={t("consent.revokeConfirm")}
                      destructive
                      reasonLabel={t("consent.reason")}
                      reasonRequired
                      onConfirm={(reason) => revokeConsent(orgSlug, { consentId: c.id, reason })}
                    />
                  </div>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <details
          id="permission"
          open={!consents.some((c) => c.kind === "processing" && !c.revoked_at)}
          className="group scroll-mt-6 rounded-2xl border border-dashed border-border p-4"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
            {t("consent.recordTitle")}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ActionForm action={action} className="mt-4 grid gap-4">
            <input type="hidden" name="candidateId" value={candidateId} />
            <input type="hidden" name="kind" value="processing" />
            <FormField id="legalBasis" label={t("consent.basisLabel")} hint={t("consent.basisHint")}>
              <NativeSelect id="legalBasis" name="legalBasis" defaultValue="consent">
                {(Object.keys(LEGAL_BASIS) as (keyof typeof LEGAL_BASIS)[]).map((v) => (
                  <option key={v} value={v}>{tg(`labels.legalBasis.${v}`)}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="scope" label={t("consent.scope")} error={fe?.scope}>
              <Input id="scope" name="scope" defaultValue={t("consent.scopeDefault")} />
            </FormField>
            <FormField id="evidence" label={t("consent.evidenceLabel")} error={fe?.evidence} hint={t("consent.evidenceHint")}>
              <Textarea id="evidence" name="evidence" rows={2} />
            </FormField>
            <FormField id="expiresAt" label={t("consent.expiresAt")}>
              <Input id="expiresAt" name="expiresAt" type="date" />
            </FormField>
            <FormMessage state={state} />
            <SubmitButton className="justify-self-start">{t("consent.save")}</SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

type Doc = { id: string; file_name: string; size_bytes: number; scan_status: "pending" | "clean" | "rejected"; created_at: string };

export function DocumentsPanel({ orgSlug, candidateId, documents, canWrite }: { orgSlug: string; candidateId: string; documents: Doc[]; canWrite: boolean }) {
  const t = useT("candidates");
  const f = useFormatter();
  const [state, action] = useActionState(uploadDocument.bind(null, orgSlug, candidateId), null);
  const [pending, start] = useTransition();
  const scanPill = (s: Doc["scan_status"]) =>
    s === "clean" ? (
      <StatusPill tone="success" label={t("documents.scanned")} />
    ) : s === "pending" ? (
      <StatusPill tone="warning" label={t("documents.scanning")} />
    ) : (
      <StatusPill tone="danger" label={t("documents.rejected")} />
    );
  return (
    <div className="grid gap-4">
      {documents.length ? (
        <ul className="grid gap-2">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3">
              <span className="grid size-10 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{d.file_name}</span>
                <span className="block text-xs text-muted-foreground">{t("documents.meta", { size: (d.size_bytes / 1024).toFixed(0), date: f.date(d.created_at) })}</span>
              </span>
              {scanPill(d.scan_status)}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("documents.download", { name: d.file_name })}
                disabled={pending || d.scan_status === "rejected"}
                onClick={() =>
                  start(async () => {
                    const r = await getDocumentUrl(orgSlug, d.id);
                    if (r.ok && r.data) window.location.assign(r.data.url);
                    else if (!r.ok) toast.error(r.error);
                  })
                }
              >
                <Download className="size-4" />
              </Button>
              {canWrite ? (
                <ConfirmDialog
                  trigger={<Button variant="ghost" size="icon-sm" aria-label={t("documents.delete", { name: d.file_name })}><Trash2 className="size-4" /></Button>}
                  title={t("documents.deleteTitle")}
                  description={t("documents.deleteBody")}
                  confirmLabel={t("documents.deleteConfirm")}
                  destructive
                  onConfirm={() => deleteDocument(orgSlug, d.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-4 text-sm text-muted-foreground">
          <FileText className="size-5 shrink-0" aria-hidden /> {t("documents.none")}
        </div>
      )}
      {canWrite ? (
        <ActionForm action={action} className="grid gap-2 rounded-2xl border border-dashed border-border p-3">
          <label htmlFor="file" className="sr-only">{t("documents.uploadLabel")}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="file" name="file" type="file" className="min-w-0 flex-1" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
            <SubmitButton variant="secondary" className="shrink-0" pendingLabel={t("documents.uploading")}>
              <Upload className="size-4" aria-hidden /> {t("documents.upload")}
            </SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">{t("documents.uploadHint")}</p>
          <FormMessage state={state} />
        </ActionForm>
      ) : null}
    </div>
  );
}

export function AnonymizeButton({ orgSlug, candidateId }: { orgSlug: string; candidateId: string }) {
  const t = useT("candidates");
  return (
    <ConfirmDialog
      trigger={<Button variant="destructive">{t("anonymize.trigger")}</Button>}
      title={t("anonymize.title")}
      description={t("anonymize.body")}
      confirmLabel={t("anonymize.confirm")}
      destructive
      reasonLabel={t("anonymize.reason")}
      reasonRequired
      onConfirm={(reason) => anonymizeCandidate(orgSlug, { candidateId, reason })}
    />
  );
}
