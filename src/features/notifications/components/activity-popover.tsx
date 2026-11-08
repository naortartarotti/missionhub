"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { markAllRead, openNotification } from "../actions";
import { useFormatter, useT } from "@/i18n/client";

export type ActivityItem = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };

/** Header bell: recent activity in a floating panel, with a link to the full list. */
export function ActivityPopover({
  orgSlug,
  items,
  unread,
  placement = "below",
}: {
  orgSlug: string;
  items: ActivityItem[];
  unread: number;
  /** "beside" opens to the right of the trigger (sidebar); "below" drops down (mobile top bar). */
  placement?: "below" | "beside";
}) {
  const t = useT("activity");
  const f = useFormatter();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={placement === "beside" ? "ghost" : "outline"} size="icon" className="relative" aria-label={unread ? `${t("title")}, ${t("unreadCount", { count: unread })}` : t("title")}>
          <Bell className="size-[18px]" aria-hidden />
          {unread ? <span className="absolute top-2 right-2.5 size-2 rounded-full bg-danger ring-2 ring-card" aria-hidden /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent side={placement === "beside" ? "right" : "bottom"} align={placement === "beside" ? "start" : "end"} sideOffset={placement === "beside" ? 20 : 8} className="w-[min(24rem,calc(100vw-2rem))] rounded-3xl border-border/60 p-0 shadow-lg">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="text-xs text-muted-foreground">{unread ? t("unreadCount", { count: unread }) : t("caughtUp")}</p>
          </div>
          {unread ? (
            <form action={markAllRead.bind(null, orgSlug)}>
              <Button type="submit" variant="ghost" size="sm">{t("markAllRead")}</Button>
            </form>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted-foreground">{t("emptyShort")}</p>
        ) : (
          <ul className="max-h-[min(26rem,60vh)] divide-y divide-border/60 overflow-y-auto border-t border-border/60">
            {items.map((n) => (
              <li key={n.id}>
                <form action={openNotification.bind(null, orgSlug, n.id)} onSubmit={() => setOpen(false)}>
                  <button type="submit" className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-danger")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !n.read_at && "font-semibold")}>
                        {n.title}
                        {!n.read_at ? <span className="sr-only"> ({t("unread")})</span> : null}
                      </span>
                      {n.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span> : null}
                      <span className="mt-1 block text-xs text-muted-foreground">{f.relative(n.created_at)}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border/60 p-2">
          <Button variant="ghost" className="w-full" asChild>
            <Link href={`/w/${orgSlug}/notifications`} onClick={() => setOpen(false)}>{t("viewAll")}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
