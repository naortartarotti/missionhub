"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { setJobStatus } from "../actions";

type StatusLabel = "publish" | "pause" | "markFilled" | "close" | "resume" | "reopen";
type Move = { to: string; label: StatusLabel };

// `primary` is the one obvious next step (shown as a button); the rest go in the "⋯" menu.
const NEXT: Record<string, { primary?: Move; more: Move[] }> = {
  draft: { primary: { to: "active", label: "publish" }, more: [] },
  active: { more: [{ to: "paused", label: "pause" }, { to: "filled", label: "markFilled" }, { to: "closed", label: "close" }] },
  paused: { primary: { to: "active", label: "resume" }, more: [{ to: "closed", label: "close" }] },
  closed: { more: [{ to: "active", label: "reopen" }] },
  filled: { more: [] },
  cancelled: { more: [] },
};

export function JobStatusActions({ orgSlug, jobId, status }: { orgSlug: string; jobId: string; status: string }) {
  const [pending, start] = useTransition();
  const t = useT("jobs");
  const { primary, more } = NEXT[status] ?? { more: [] };
  const run = (m: Move) =>
    start(async () => {
      const r = await setJobStatus(orgSlug, { jobId, status: m.to });
      if (r.ok) toast.success(r.message ?? t("status.updated"));
      else toast.error(r.error);
    });
  return (
    <>
      {primary ? (
        <Button disabled={pending} onClick={() => run(primary)}>
          {t(`status.${primary.label}`)}
        </Button>
      ) : null}
      {more.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" disabled={pending} aria-label={t("status.more")} title={t("status.more")}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5">
            {more.map((m) => (
              <DropdownMenuItem key={m.to} className="rounded-xl" onSelect={() => run(m)}>
                {t(`status.${m.label}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
