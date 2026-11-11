"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Combobox } from "./combobox";
import { FormField } from "./form-field";
import { useCountryOptions } from "./location-fields";
import { useT } from "@/i18n/client";

/**
 * Pick several countries. Posts `name` as comma-separated ISO 3166-1 alpha-2 codes ("CA, PT"),
 * so matching can compare them with a job's country; shows names in the viewer's language.
 */
export function CountryMultiSelect({
  id,
  name,
  label,
  hint,
  error,
  defaultValue = [],
  max = 30,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string | string[];
  defaultValue?: string[];
  max?: number;
}) {
  const t = useT("common");
  const { options, loading } = useCountryOptions();
  const [codes, setCodes] = useState<string[]>(() => [...new Set(defaultValue.map((c) => c.toUpperCase()))]);
  const labelOf = (code: string) => options.find((o) => o.value === code)?.label ?? code;
  const available = options.filter((o) => !codes.includes(o.value));

  return (
    <FormField id={id} label={label} hint={hint} error={error}>
      <div className="grid gap-2">
        {codes.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {codes.map((c) => (
              <li key={c}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pr-1 pl-3 text-sm">
                  {labelOf(c)}
                  <button
                    type="button"
                    onClick={() => setCodes((xs) => xs.filter((x) => x !== c))}
                    aria-label={t("countries.remove", { country: labelOf(c) })}
                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {codes.length < max ? (
          <Combobox
            id={id}
            name={`${name}__pick`}
            value=""
            onChange={(v) => v && setCodes((xs) => (xs.includes(v) ? xs : [...xs, v]))}
            options={available}
            placeholder={t("countries.add")}
            searchPlaceholder={t("location.search")}
            emptyText={t("location.noResults")}
            moreText={t("location.more")}
            loading={loading}
            invalid={!!error}
          />
        ) : null}
      </div>
      <input type="hidden" name={name} value={codes.join(", ")} />
    </FormField>
  );
}
