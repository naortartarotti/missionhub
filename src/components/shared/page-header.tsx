import type { ReactNode } from "react";
import { StickyHeader } from "@/components/layout/sticky-header";
import { HeaderBell } from "@/features/notifications/components/activity-context";

/**
 * The page's header bar: title + description on the left, page actions (and, on the dashboard, the
 * notifications bell) on the right. Sticky on every screen. Render it as the FIRST child of the page.
 * Actions render once: beside the title from `sm` up, on their own row below it on phones.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  leading,
  showBell = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small line above the title (e.g. "Sent to Acme · Nov 8"). */
  eyebrow?: ReactNode;
  /** Element before the title, e.g. an avatar. */
  leading?: ReactNode;
  /** Notifications bell (desktop). Only the dashboard shows it. */
  showBell?: boolean;
}) {
  return (
    <StickyHeader>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {leading}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="truncate text-sm text-muted-foreground">{eyebrow}</p> : null}
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground text-pretty sm:text-[15px]">{description}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
        {showBell ? (
          <div className="hidden shrink-0 lg:block">
            <HeaderBell />
          </div>
        ) : null}
      </div>
    </StickyHeader>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
