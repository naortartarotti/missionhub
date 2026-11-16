"use client";

import { useId, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/shared/native-select";
import { useGlobalT, useT } from "@/i18n/client";
import { HIRE_EVIDENCE_TYPES } from "../schemas";

export { newItem, validateItems, itemsToPost, type ItemDraft, type ItemErrors } from "../form-helpers";
import type { ItemDraft, ItemErrors } from "../form-helpers";
import { newItem } from "../form-helpers";

/**
 * S5 evidence cards (§2.5 item 4, §6): an `ol` of `fieldset` cards (type → date → captured → link → backs-tail →
 * Remove item). **Add another item** focuses the new card's Type; **Remove item** focuses the previous card's
 * Type, or **Add another item**.
 */
export function EvidenceItems({
  items,
  setItems,
  errors,
  min,
  today,
  tail,
}: {
  items: ItemDraft[];
  setItems: (fn: (items: ItemDraft[]) => ItemDraft[]) => void;
  errors: ItemErrors;
  /** 1 for a report, 0 for a rebuttal. */
  min: number;
  today: string;
  /** Show the per-item "This item shows when the process started" checkbox (tail filing, BR-6). */
  tail: boolean;
}) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const uid = useId();
  const typeRefs = useRef(new Map<string, HTMLSelectElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const patch = (key: string, p: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const add = () => {
    const it = newItem();
    setItems((xs) => [...xs, it]);
    requestAnimationFrame(() => typeRefs.current.get(it.key)?.focus());
  };
  const remove = (i: number) => {
    const prev = items[i - 1];
    setItems((xs) => xs.filter((_, j) => j !== i));
    requestAnimationFrame(() => (prev ? typeRefs.current.get(prev.key) : addRef.current)?.focus());
  };

  return (
    <div className="grid gap-3">
      {items.length ? (
        <ol className="grid gap-3" aria-label={t("hireReport.evidence")}>
          {items.map((it, i) => {
            const err = (f: string) => errors[`${i}.${f}`];
            const id = (f: string) => `${uid}-${it.key}-${f}`;
            return (
              <li key={it.key}>
                <fieldset className="grid gap-3 rounded-2xl border border-border p-4">
                  <legend className="px-1 text-sm font-semibold">{t("hireReport.item.legend", { n: i + 1 })}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id={id("type")} label={t("hireReport.item.type")} error={err("type")} required>
                      <NativeSelect
                        ref={(el) => { if (el) typeRefs.current.set(it.key, el); else typeRefs.current.delete(it.key); }}
                        id={id("type")}
                        value={it.type}
                        onChange={(e) => patch(it.key, { type: e.target.value })}
                        aria-required
                        aria-invalid={err("type") ? true : undefined}
                        aria-describedby={err("type") ? `${id("type")}-error` : undefined}
                      >
                        <option value="">{tg("common.none")}</option>
                        {HIRE_EVIDENCE_TYPES.map((v) => <option key={v} value={v}>{tg(`labels.hireEvidenceType.${v}`)}</option>)}
                      </NativeSelect>
                    </Field>
                    <Field id={id("date")} label={t("hireReport.item.date")} error={err("itemDate")} required>
                      <Input
                        id={id("date")}
                        type="date"
                        max={today}
                        value={it.itemDate}
                        onChange={(e) => patch(it.key, { itemDate: e.target.value })}
                        aria-required
                        aria-invalid={err("itemDate") ? true : undefined}
                        aria-describedby={err("itemDate") ? `${id("date")}-error` : undefined}
                      />
                    </Field>
                    <Field id={id("captured")} label={t("hireReport.item.captured")} error={err("capturedOn")}>
                      <Input
                        id={id("captured")}
                        type="date"
                        min={it.itemDate || undefined}
                        max={today}
                        value={it.capturedOn}
                        onChange={(e) => patch(it.key, { capturedOn: e.target.value })}
                        aria-invalid={err("capturedOn") ? true : undefined}
                        aria-describedby={err("capturedOn") ? `${id("captured")}-error` : undefined}
                      />
                    </Field>
                    <Field id={id("url")} label={t("hireReport.item.link")} error={err("url")} hint={t("hireReport.item.linkHint")}>
                      <Input
                        id={id("url")}
                        type="url"
                        inputMode="url"
                        placeholder="https://"
                        maxLength={2000}
                        value={it.url}
                        onChange={(e) => patch(it.key, { url: e.target.value })}
                        aria-invalid={err("url") ? true : undefined}
                        aria-describedby={err("url") ? `${id("url")}-error` : `${id("url")}-hint`}
                      />
                    </Field>
                  </div>
                  {tail ? (
                    <Label className="flex min-h-11 items-start gap-3 rounded-xl bg-muted/40 p-3 leading-5 font-normal">
                      <Checkbox checked={it.backsTail} onCheckedChange={(v) => patch(it.key, { backsTail: v === true })} className="mt-0.5" />
                      <span className="text-sm text-pretty">{t("hireReport.item.backsTail")}</span>
                    </Label>
                  ) : null}
                  {items.length > min ? (
                    <Button type="button" variant="ghost" className="min-h-11 justify-self-start text-muted-foreground" onClick={() => remove(i)}>
                      <X className="size-4" aria-hidden /> {t("hireReport.item.remove", { n: i + 1 })}
                    </Button>
                  ) : null}
                </fieldset>
              </li>
            );
          })}
        </ol>
      ) : null}
      {items.length < 5 ? (
        <Button ref={addRef} type="button" variant="outline" className="min-h-11 justify-self-start" onClick={add}>
          <Plus className="size-4" aria-hidden /> {t("hireReport.item.add")}
        </Button>
      ) : null}
    </div>
  );
}

function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
      </Label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-pretty text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
