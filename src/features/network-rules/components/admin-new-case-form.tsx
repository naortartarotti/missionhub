"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Combobox } from "@/components/shared/combobox";
import { NativeSelect } from "@/components/shared/native-select";
import { useGlobalT, useT } from "@/i18n/client";
import { referralIdFrom } from "@/features/admin/referral-lookup";
import { openConductCase } from "../admin-actions";
import { CONDUCT_CATEGORIES, type ConductCategory } from "../domain";
import { conductOpenSchema } from "../schemas";
import { EvidenceUploadList, useEvidenceBlockReason, type EvidenceState } from "./evidence-upload-list";
import { TextField, useLengthError } from "./admin-case-shared";

type Source = "confirmation_invalid" | "objection_fabricated" | "other";

/**
 * S18 admin-initiated case (BR-24): org (prefilled from ?org=), category (also the admin category),
 * source, optional referral (pasted link or id: there is no admin referral list per org yet), an
 * admin-internal description and optional files. Opens the case page in state `new`.
 */
export function AdminNewCaseForm({ orgs, defaultOrgId }: { orgs: { id: string; name: string }[]; defaultOrgId: string | null }) {
  const t = useT("admin");
  const tc = useT("common");
  const tg = useGlobalT();
  const uid = useId();
  const len = useLengthError();
  const router = useRouter();
  const [orgId, setOrgId] = useState(defaultOrgId ?? "");
  const [category, setCategory] = useState<ConductCategory>("other");
  const [source, setSource] = useState<Source>("other");
  const [referral, setReferral] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<EvidenceState | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filedRef = useRef(false);
  const blockReason = useEvidenceBlockReason(files);

  const submit = () => {
    const referralId = referral.trim() ? referralIdFrom(referral) : null;
    const input = { orgId, category, adminSource: source, referralId, description, fileIds: files?.readyIds ?? [] };
    const e = { org: orgId ? null : tg("errors.invalidFields"), referral: referral.trim() && !referralId ? tg("errors.invalidId") : null, description: len(description, 20, 4000) };
    setErrors(e);
    if (Object.values(e).some(Boolean) || !conductOpenSchema.safeParse(input).success) return;
    start(async () => {
      const r = await openConductCase(input);
      if (!r.ok || !r.data) return setAlert(!r.ok ? r.error : tg("errors.generic"));
      filedRef.current = true;
      toast.success(t("conduct.newCaseCreated"));
      router.push(`/admin/disputes/conduct/${r.data.caseId}`);
    });
  };

  return (
    <div className="grid gap-5">
      {alert ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {alert}</div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-org`} className="text-sm font-medium">{t("conduct.newCaseOrg")}</Label>
        <Combobox id={`${uid}-org`} name="org" value={orgId} onChange={setOrgId} options={orgs.map((o) => ({ value: o.id, label: o.name }))} placeholder={t("conduct.newCaseOrg")} searchPlaceholder={tc("location.search")} emptyText={tc("location.noResults")} invalid={!!errors.org} />
        {errors.org ? <p role="alert" className="text-xs font-medium text-danger">{errors.org}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-cat`} className="text-sm font-medium">{t("conduct.newCaseCategory")}</Label>
        <NativeSelect id={`${uid}-cat`} value={category} onChange={(e) => setCategory(e.target.value as ConductCategory)}>
          {CONDUCT_CATEGORIES.map((c) => <option key={c} value={c}>{tg(`labels.conductCategory.${c}`)}</option>)}
        </NativeSelect>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("conduct.newCaseSource")}</legend>
        <RadioGroup value={source} onValueChange={(v) => setSource(v as Source)} className="gap-2" aria-label={t("conduct.newCaseSource")}>
          {([["confirmation_invalid", "rd029"], ["objection_fabricated", "n1"], ["other", "other"]] as const).map(([v, k]) => (
            <Label key={v} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 px-3 font-normal has-[[data-state=checked]]:border-foreground">
              <RadioGroupItem value={v} /> {t(`conduct.source.${k}`)}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-ref`} className="text-sm font-medium">{t("conduct.newCaseReferral")}</Label>
        <Input id={`${uid}-ref`} value={referral} onChange={(e) => setReferral(e.target.value)} aria-invalid={errors.referral ? true : undefined} aria-describedby={errors.referral ? `${uid}-ref-error` : undefined} />
        {errors.referral ? <p id={`${uid}-ref-error`} role="alert" className="text-xs font-medium text-danger">{errors.referral}</p> : null}
      </div>
      <TextField label={t("conduct.newCaseDescription")} hint={t("conduct.newCaseDescriptionHint")} value={description} onChange={setDescription} max={4000} rows={6} error={errors.description} required />
      <EvidenceUploadList admin label={t("conduct.newCaseFiles")} hint={tg("network.report.filesHint")} onChange={setFiles} filedRef={filedRef} />
      <div className="grid gap-2">
        {blockReason ? <p id={`${uid}-status`} className="text-sm text-muted-foreground">{blockReason}</p> : null}
        <Button className="min-h-11 justify-self-start sm:min-h-10" disabled={pending || !!blockReason} aria-describedby={blockReason ? `${uid}-status` : undefined} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {t("conduct.newCaseSubmit")}
        </Button>
      </div>
    </div>
  );
}
