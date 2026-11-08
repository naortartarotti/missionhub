"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileText, ShieldCheck, ShieldOff, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { StatusPill } from "@/components/shared/status-pill";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { LEGAL_BASIS, formatDate } from "@/lib/labels";
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

export function StatusActions({ orgSlug, candidateId, status }: { orgSlug: string; candidateId: string; status: Status }) {
  const [pending, start] = useTransition();
  const run = (next: string) =>
    start(async () => {
      const r = await setCandidateStatus(orgSlug, { candidateId, status: next });
      if (r.ok) toast.success(r.message ?? "Updated");
      else toast.error(r.error);
    });
  if (status === "deleted") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "active_for_matching" ? (
        <Button onClick={() => run("active_for_matching")} disabled={pending}>
          <ShieldCheck className="size-4" aria-hidden /> Activate for matching
        </Button>
      ) : (
        <Button variant="outline" onClick={() => run("unavailable")} disabled={pending}>
          Mark unavailable
        </Button>
      )}
      {status !== "archived" ? (
        <Button variant="ghost" onClick={() => run("archived")} disabled={pending}>
          Archive
        </Button>
      ) : null}
    </div>
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
  const [state, action] = useActionState(recordConsent.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <div className="grid gap-4">
      {consents.length === 0 ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          No authorization recorded yet. This candidate can't be matched or shared until a processing authorization is on file.
        </p>
      ) : (
        <ul className="grid gap-3">
          {consents.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.kind === "processing" ? "Processing for recruitment" : "Job-specific sharing"}</p>
                {c.revoked_at ? (
                  <StatusPill tone="danger" label={`Revoked ${formatDate(c.revoked_at)}`} icon={ShieldOff} />
                ) : (
                  <StatusPill tone="success" label="Active" icon={ShieldCheck} />
                )}
              </div>
              <dl className="mt-2 grid gap-1 text-sm text-muted-foreground">
                <div><dt className="inline font-medium text-foreground">Basis: </dt><dd className="inline">{LEGAL_BASIS[c.legal_basis]}</dd></div>
                <div><dt className="inline font-medium text-foreground">Scope: </dt><dd className="inline">{c.scope}</dd></div>
                <div><dt className="inline font-medium text-foreground">Evidence: </dt><dd className="inline">{c.evidence}</dd></div>
                <div>
                  <dt className="inline font-medium text-foreground">Obtained: </dt>
                  <dd className="inline">{formatDate(c.obtained_at)}{c.expires_at ? ` · expires ${formatDate(c.expires_at)}` : ""}</dd>
                </div>
                {c.revoked_reason ? <div><dt className="inline font-medium text-foreground">Revocation reason: </dt><dd className="inline">{c.revoked_reason}</dd></div> : null}
              </dl>
              {!c.revoked_at && canWrite ? (
                <div className="mt-3">
                  <ConfirmDialog
                    trigger={<Button variant="outline" size="sm">Revoke</Button>}
                    title="Revoke this authorization?"
                    description={
                      c.kind === "job_sharing"
                        ? "The partner recruiter immediately loses access to the shared profile and documents for this referral. This can't be undone; a new authorization would be needed."
                        : "The candidate will stop being matched. Existing records are kept for audit."
                    }
                    confirmLabel="Revoke authorization"
                    destructive
                    reasonLabel="Reason"
                    reasonRequired
                    onConfirm={(reason) => revokeConsent(orgSlug, { consentId: c.id, reason })}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <details className="group rounded-2xl border border-dashed border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Record processing authorization</summary>
          <form action={action} className="mt-4 grid gap-4">
            <input type="hidden" name="candidateId" value={candidateId} />
            <input type="hidden" name="kind" value="processing" />
            <FormField id="legalBasis" label="Legal basis" hint="Draft list — confirm with Canadian privacy counsel.">
              <NativeSelect id="legalBasis" name="legalBasis" defaultValue="consent">
                {Object.entries(LEGAL_BASIS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="scope" label="Scope" error={fe?.scope}>
              <Input id="scope" name="scope" defaultValue="Store profile and match against partner job openings for recruitment purposes" />
            </FormField>
            <FormField id="evidence" label="Evidence" error={fe?.evidence} hint="How and when it was obtained, e.g. 'Signed intake form, 2026-11-03'">
              <Textarea id="evidence" name="evidence" rows={2} />
            </FormField>
            <FormField id="expiresAt" label="Expires (optional)">
              <Input id="expiresAt" name="expiresAt" type="date" />
            </FormField>
            <FormMessage state={state} />
            <SubmitButton className="justify-self-start">Record authorization</SubmitButton>
          </form>
        </details>
      ) : null}
    </div>
  );
}

type Doc = { id: string; file_name: string; size_bytes: number; scan_status: "pending" | "clean" | "rejected"; created_at: string };

export function DocumentsPanel({ orgSlug, candidateId, documents, canWrite }: { orgSlug: string; candidateId: string; documents: Doc[]; canWrite: boolean }) {
  const [state, action] = useActionState(uploadDocument.bind(null, orgSlug, candidateId), null);
  const [pending, start] = useTransition();
  const scanPill = (s: Doc["scan_status"]) =>
    s === "clean" ? <StatusPill tone="success" label="Scanned" /> : s === "pending" ? <StatusPill tone="warning" label="Scanning" /> : <StatusPill tone="danger" label="Rejected" />;
  return (
    <div className="grid gap-4">
      {documents.length ? (
        <ul className="grid gap-2">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3">
              <span className="grid size-10 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{d.file_name}</span>
                <span className="block text-xs text-muted-foreground">{(d.size_bytes / 1024).toFixed(0)} KB · {formatDate(d.created_at)}</span>
              </span>
              {scanPill(d.scan_status)}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${d.file_name}`}
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
                  trigger={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.file_name}`}><Trash2 className="size-4" /></Button>}
                  title="Delete document?"
                  description="The file is permanently removed from storage. Copies already shared in referrals follow that referral's authorization."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => deleteDocument(orgSlug, d.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      )}
      {canWrite ? (
        <form action={action} className="grid gap-3 rounded-2xl border border-dashed border-border p-4">
          <label htmlFor="file" className="text-sm font-medium">Upload resume (PDF or DOCX, max 10 MB)</label>
          <Input id="file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
          <p className="text-xs text-muted-foreground">Stored privately. Uploading does not authorize sharing with any other recruiter.</p>
          <FormMessage state={state} />
          <SubmitButton variant="secondary" className="justify-self-start" pendingLabel="Uploading…">
            <Upload className="size-4" aria-hidden /> Upload
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

export function AnonymizeButton({ orgSlug, candidateId }: { orgSlug: string; candidateId: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="destructive">Anonymize candidate</Button>}
      title="Anonymize this candidate?"
      description="Permanently removes name, contact details, notes, experience and documents, and revokes all authorizations. Referral history and financial records remain for audit. This cannot be undone."
      confirmLabel="Anonymize permanently"
      destructive
      reasonLabel="Reason / request reference"
      reasonRequired
      onConfirm={(reason) => anonymizeCandidate(orgSlug, { candidateId, reason })}
    />
  );
}
