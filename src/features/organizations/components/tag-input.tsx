"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Chip input: Enter or comma adds, Backspace on empty removes the last chip. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder,
  max = 30,
  describedBy,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  max?: number;
  describedBy?: string;
}) {
  const t = useT("onboarding");
  const [draft, setDraft] = useState("");
  const listId = useId();
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").slice(0, 60);
    if (!t || has(t) || value.length >= max) return;
    onChange([...value, t]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      if (!draft.trim()) return; // let Enter continue to the next step
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const open = suggestions.filter((s) => !has(s));

  return (
    <div className="grid gap-3">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <ul className="contents" aria-label={t("tags.selected")} id={listId}>
          {value.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
              {tag}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== tag))} className="grid size-5 place-items-center rounded-full hover:bg-background" aria-label={t("tags.remove", { tag })}>
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? (add(e.target.value), setDraft("")) : setDraft(e.target.value))}
          onKeyDown={onKeyDown}
          onBlur={() => { if (draft.trim()) { add(draft); setDraft(""); } }}
          placeholder={value.length ? "" : placeholder}
          aria-describedby={[describedBy, listId].filter(Boolean).join(" ")}
          className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label={t("tags.suggestions")}>
          {open.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn("inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground")}
            >
              <Plus className="size-3" aria-hidden /> {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
