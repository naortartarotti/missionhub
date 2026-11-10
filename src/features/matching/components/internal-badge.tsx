"use client";

import { Link2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Marks a job from an organization the viewer also belongs to: an internal move, not a partner referral. */
export function InternalBadge({ org, className }: { org: string; className?: string }) {
  const t = useT("opportunities");
  return (
    <span
      title={t("internal.hint", { org })}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground", className)}
    >
      <Link2 className="size-3" aria-hidden />
      {t("internal.badge")}
    </span>
  );
}
