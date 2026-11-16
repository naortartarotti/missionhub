"use client";

import { useId, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharCount } from "@/components/shared/char-count";
import { useT } from "@/i18n/client";
import { getAdminConductEvidenceUrl } from "../admin-actions";
import type { RulesLocale } from "../domain";

/** Template strings of the notice / incident in each notice language, prepared on the server (§5.0). */
export type NoticeTemplates = Record<RulesLocale, Record<string, string>>;

/** `{name}` interpolation for the server-provided template strings (preview only). */
export const fill = (template: string | undefined, vars: Record<string, string | number> = {}) =>
  (template ?? "").replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k])));

/** 60-second signed URL for a conduct file, audited server-side (reuses the AdminEvidenceDownload pattern). */
export function AdminConductEvidenceDownload({ fileId, name, ready }: { fileId: string; name: string; ready: boolean }) {
  const t = useT("admin");
  const tr = useT("referrals");
  const [pending, start] = useTransition();
  if (!ready) return <span className="shrink-0 text-xs text-muted-foreground">{tr("claim.panel.scanning")}</span>;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 shrink-0 sm:size-10"
      aria-label={t("conduct.case.download", { name })}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await getAdminConductEvidenceUrl(fileId);
          if (r.ok && r.data) window.location.assign(r.data.url);
          else if (!r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
    </Button>
  );
}

/** Labelled textarea with hint / error / counter (admin forms). */
export function TextField({
  label,
  value,
  onChange,
  max,
  hint,
  error,
  rows = 4,
  lang,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  hint?: ReactNode;
  error?: string | null;
  rows?: number;
  lang?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        maxLength={max}
        lang={lang}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <CharCount count={value.length} max={max} />
    </div>
  );
}

/** "Write between {min} and {max} characters." when the trimmed length is out of range, else null. */
export function useLengthError() {
  const t = useT("network");
  return (v: string, min: number, max: number) => {
    const n = v.trim().length;
    return n < min || n > max ? t("validation.length", { min, max }) : null;
  };
}

/** Rule numbers ("2.3") grouped by their section number ("2"), in order. */
export function groupRules(rules: { number: string; excerpt: string }[], sections: { number: string; title: string }[]) {
  const bySection = new Map<string, { number: string; excerpt: string }[]>();
  for (const r of rules) {
    const s = r.number.split(".")[0];
    bySection.set(s, [...(bySection.get(s) ?? []), r]);
  }
  return [...bySection.entries()].map(([num, list]) => ({ number: num, title: sections.find((x) => x.number === num)?.title ?? num, rules: list }));
}

/** Toronto calendar date (YYYY-MM-DD) for date inputs. */
export const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Preview only: now + n weekdays (the server computes the frozen deadline with the holiday calendar). */
export function addWeekdays(n: number, from = new Date()): Date {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** Org locale ("fr-CA", "pt", "en-CA") → the notice language default. */
export const noticeLanguageFor = (orgLocale: string | null | undefined): RulesLocale =>
  orgLocale?.toLowerCase().startsWith("fr") ? "fr-CA" : orgLocale?.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
