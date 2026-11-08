"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useMemo, useState } from "react";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shared/card";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { LEGAL_BASIS } from "@/lib/labels";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { DISCLOSURE_FIELDS } from "../disclosure";
import { submitReferral } from "../actions";

export function SubmitReferralForm({
  orgSlug,
  matchId,
  recipient,
  jobTitle,
  consents,
  documents,
}: {
  orgSlug: string;
  matchId: string;
  recipient: string;
  jobTitle: string;
  consents: { id: string; evidence: string; obtained_at: string; expires_at: string | null }[];
  documents: { id: string; name: string; ready: boolean }[];
}) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const fmt = useFormatter();
  const [state, action] = useActionState(submitReferral.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [selected, setSelected] = useState<string[]>(DISCLOSURE_FIELDS.filter((f) => f.default).map((f) => f.key));
  const [docs, setDocs] = useState<string[]>([]);
  const [consentId, setConsentId] = useState(consents[0]?.id ?? "new");
  const toggle = (list: string[], set: (v: string[]) => void, key: string, on: boolean) => set(on ? [...list, key] : list.filter((k) => k !== key));
  const identifying = DISCLOSURE_FIELDS.filter((f) => f.identifying && selected.includes(f.key));

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-6">
        <Panel className="grid gap-4 p-6">
          <div>
            <h2 className="text-base font-semibold">{t("form.step1")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("form.step1Body", { recipient })}</p>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">{t("form.fieldsLegend")}</legend>
            {DISCLOSURE_FIELDS.map((f) => (
              <Label key={f.key} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 font-normal">
                <Checkbox name="fields" value={f.key} checked={selected.includes(f.key)} onCheckedChange={(v) => toggle(selected, setSelected, f.key, v === true)} />
                <span className="flex-1">{t(`disclosure.${f.key}`)}</span>
                {f.identifying ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">{t("form.identifying")}</span> : null}
              </Label>
            ))}
          </fieldset>
          {fe?.fields ? <p role="alert" className="text-xs font-medium text-danger">{fe.fields[0]}</p> : null}
          <div>
            <p className="mb-2 text-sm font-medium">{t("form.documents")}</p>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("form.noDocuments")}</p>
            ) : (
              <div className="grid gap-2">
                {documents.map((d) => (
                  <Label key={d.id} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 font-normal">
                    <Checkbox name="documentIds" value={d.id} disabled={!d.ready} checked={docs.includes(d.id)} onCheckedChange={(v) => toggle(docs, setDocs, d.id, v === true)} />
                    <span className="flex-1 truncate">{d.name}</span>
                    {!d.ready ? <span className="text-xs text-muted-foreground">{t("form.awaitingScan")}</span> : null}
                  </Label>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel className="grid gap-4 p-6">
          <div>
            <h2 className="text-base font-semibold">{t("form.step2")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("form.authBefore")} <strong>{recipient}</strong> {t("form.authAnd")} <strong>{jobTitle}</strong>{t("form.authAfter")}
            </p>
          </div>
          {consents.length ? (
            <FormField id="consentId" label={t("form.authorization")}>
              <NativeSelect id="consentId" name="consentId" value={consentId} onChange={(e) => setConsentId(e.target.value)}>
                {consents.map((c) => <option key={c.id} value={c.id}>{t("form.recorded", { date: fmt.date(c.obtained_at), evidence: c.evidence.slice(0, 60) })}</option>)}
                <option value="new">{t("form.newAuthorization")}</option>
              </NativeSelect>
            </FormField>
          ) : <input type="hidden" name="consentId" value="new" />}
          {consentId === "new" ? (
            <>
              <FormField id="newConsentBasis" label={t("form.legalBasis")} hint={t("form.legalBasisHint")}>
                <NativeSelect id="newConsentBasis" name="newConsentBasis" defaultValue="consent">
                  {(Object.keys(LEGAL_BASIS) as (keyof typeof LEGAL_BASIS)[]).map((v) => <option key={v} value={v}>{tg(`labels.legalBasis.${v}`)}</option>)}
                </NativeSelect>
              </FormField>
              <FormField id="newConsentEvidence" label={t("form.evidence")} error={fe?.newConsentEvidence} hint={t("form.evidenceHint")}>
                <Textarea id="newConsentEvidence" name="newConsentEvidence" rows={3} />
              </FormField>
            </>
          ) : null}
          <Label className="flex items-start gap-2.5 font-normal">
            <Checkbox name="confirmInterest" className="mt-0.5" />
            <span>{t("form.confirmInterest")}</span>
          </Label>
          {fe?.confirmInterest ? <p role="alert" className="text-xs font-medium text-danger">{fe.confirmInterest[0]}</p> : null}
        </Panel>

        <Panel className="grid gap-3 p-6">
          <h2 className="text-base font-semibold">{t("form.step3")}</h2>
          <Textarea name="note" rows={3} aria-label={t("form.noteLabel")} placeholder={t("form.notePlaceholder")} />
        </Panel>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Panel className="grid gap-4 p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Eye className="size-4" aria-hidden /> {t("form.whoSees")}</h2>
          <div className="rounded-2xl bg-muted p-4 text-sm">
            <p className="font-medium">{recipient}</p>
            <p className="mt-1 text-muted-foreground">
              {selected.length ? DISCLOSURE_FIELDS.filter((f) => selected.includes(f.key)).map((f) => t(`disclosure.${f.key}`)).join(", ") : t("form.nothingSelected")}
              {docs.length ? ` ${t("form.plusDocuments", { count: docs.length })}` : ""}
            </p>
          </div>
          {identifying.length ? (
            <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">{t("form.identifyingWarning", { fields: identifying.map((f) => t(`disclosure.${f.key}`).toLocaleLowerCase(fmt.tag)).join(", ") })}</p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("form.anonymous")}</p>
          )}
          <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("form.revocation")}</p>
          <FormMessage state={state} />
          <SubmitButton size="lg" className="w-full" pendingLabel={t("form.submitting")}>{t("form.submit")}</SubmitButton>
        </Panel>
      </aside>
    </ActionForm>
  );
}
