"use client";

import { useFormatter, useT } from "@/i18n/client";

/**
 * Character counter shown under a textarea, outside the hint so it stays visible when an error
 * replaces the hint. Compact visually ("37/1,000"); screen readers get `common.charCount`.
 */
export function CharCount({ count, max }: { count: number; max: number }) {
  const t = useT("common");
  const f = useFormatter();
  return (
    <p aria-live="off" className="-mt-0.5 text-right text-xs text-muted-foreground tabular-nums">
      <span aria-hidden>{f.number(count)}/{f.number(max)}</span>
      <span className="sr-only">{t("charCount", { count, max })}</span>
    </p>
  );
}
