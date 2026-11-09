"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string };

const MAX_RENDERED = 200;
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

/**
 * Searchable single-select that posts its value through a hidden input (works with plain form
 * posts / server actions). Long lists render the first matches only; typing narrows them down.
 * With `allowCustom`, the typed text can be used as-is (e.g. a city missing from the dataset).
 */
export function Combobox({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  customLabel,
  moreText,
  allowCustom = false,
  disabled = false,
  loading = false,
  invalid = false,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  /** Label for the "use what I typed" row. */
  customLabel?: (query: string) => string;
  /** Shown under a truncated list. */
  moreText?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? value;

  const { rows, truncated } = useMemo(() => {
    const q = fold(query.trim());
    const matches = q ? options.filter((o) => fold(o.label).includes(q)) : options;
    // Prefix matches first ("San" → "San Diego" before "Pleasanton").
    if (q) matches.sort((a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)));
    const exact = q && matches.some((o) => fold(o.label) === q);
    const list: (ComboboxOption & { custom?: boolean })[] = matches.slice(0, MAX_RENDERED);
    if (allowCustom && q && !exact) list.push({ value: query.trim(), label: query.trim(), custom: true });
    return { rows: list, truncated: matches.length > MAX_RENDERED };
  }, [options, query, allowCustom]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) pick(rows[active].value);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(Math.max(0, options.findIndex((x) => x.value === value)));
        }
      }}
    >
      <input type="hidden" name={name} value={value} />
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          className={cn(
            "flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-card pr-3 pl-3 text-left text-sm shadow-xs outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !display && "text-muted-foreground")}>{display || placeholder}</span>
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 rounded-xl p-0">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          aria-controls={`${id}-listbox`}
          className="h-10 w-full rounded-t-xl border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul ref={listRef} id={`${id}-listbox`} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {rows.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li> : null}
          {rows.map((o, i) => (
            <li
              key={`${o.custom ? "custom:" : ""}${o.value}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              onMouseMove={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm", i === active && "bg-muted")}
            >
              {o.custom ? <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
              <span className="min-w-0 flex-1 truncate">{o.custom && customLabel ? customLabel(o.label) : o.label}</span>
              {o.value === value && !o.custom ? <Check className="size-4 shrink-0" aria-hidden /> : null}
            </li>
          ))}
        </ul>
        {truncated && moreText ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{moreText}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
