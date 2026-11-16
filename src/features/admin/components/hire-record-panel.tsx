"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { FormField } from "@/components/shared/form-field";
import { CharCount } from "@/components/shared/char-count";
import { useFormatter, useT } from "@/i18n/client";
import type { AdminHireRecord } from "../queries";
import { saveHireRecordNote } from "../actions";

const NOTE_MAX = 2000;

/**
 * S21 Hire record panel (BR-12 rev. 2, BR-13; spec §2.14). Platform admins only: the record kind, dates, role,
 * the admin-only `late` marker and an audited admin note (e.g. a related-org hire). Rendered only when the
 * referral has a hire record. Nothing here reaches either org.
 */
export function HireRecordPanel({ record, hiringOrg }: { record: AdminHireRecord; hiringOrg: string }) {
  const t = useT("admin");
  const tc = useT("common");
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const [note, setNote] = useState(record.admin_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const save = () => {
    start(async () => {
      const r = await saveHireRecordNote({ referralId: record.referral_id, note });
      if (!r.ok) {
        setError(r.fieldErrors?.note?.[0] ?? r.error);
        fieldRef.current?.focus();
        return;
      }
      setError(null);
      toast.success(r.message ?? t("hireRecord.noteSaved"));
      router.refresh();
    });
  };

  const facts = [
    t("hireRecord.recordedOn", { date: f.date(record.recorded_at) }),
    record.offer_accepted_on ? t("hireRecord.acceptance", { date: f.date(record.offer_accepted_on) }) : t("hireRecord.acceptanceUnknown"),
    record.start_date ? t("hireRecord.start", { date: f.date(record.start_date) }) : null,
    record.hired_role_title ? t("hireRecord.role", { role: record.hired_role_title }) : null,
  ].filter((x): x is string => !!x);

  return (
    <Panel className="grid gap-4 p-6">
      <section aria-labelledby={`${uid}-title`} className="grid gap-4">
        <SectionTitle
          action={
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={record.kind === "placement" ? "success" : "neutral"} label={record.kind === "placement" ? t("hireRecord.kind.placement") : t("hireRecord.kind.noSplit")} wrap />
              {record.late ? <StatusPill tone="warning" icon={Clock} label={t("hireRecord.late")} wrap /> : null}
            </div>
          }
        >
          <span id={`${uid}-title`}>{t("hireRecord.title")}</span>
        </SectionTitle>
        <ul className="-mt-2 grid gap-1 text-sm">
          {facts.map((x) => <li key={x} className="text-pretty break-words">{x}</li>)}
        </ul>
        <FormField id={`${uid}-note`} label={t("hireRecord.note")} hint={t("hireRecord.noteHint", { org: hiringOrg })} error={error ?? undefined}>
          <Textarea
            ref={fieldRef}
            id={`${uid}-note`}
            rows={4}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-note-error` : `${uid}-note-hint`}
          />
          <CharCount count={note.length} max={NOTE_MAX} />
        </FormField>
        <div className="flex sm:justify-end">
          <Button type="button" onClick={save} disabled={pending} aria-busy={pending} className="min-h-11 w-full sm:min-h-10 sm:w-auto">
            {pending ? tc("actions.saving") : t("hireRecord.saveNote")}
          </Button>
        </div>
      </section>
    </Panel>
  );
}
