"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * Lets a page tell the sidebar which `?tab=` link it belongs to when the URL alone can't say.
 * Example: /referrals/<id> is either a sent or a received referral; without a hint both
 * "Referrals sent" (My candidates) and "Referrals received" (My jobs) would match the path.
 * A module-level store, so no provider is needed between the layout's sidebar and the page.
 */
type Hint = { path: string; tab: string } | null;

let hint: Hint = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Renders nothing. Registers `tab` as the active nav tab for the current path while mounted. */
export function NavHint({ tab }: { tab: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const mine = { path: pathname, tab };
    hint = mine;
    emit();
    return () => {
      if (hint === mine) {
        hint = null;
        emit();
      }
    };
  }, [pathname, tab]);
  return null;
}

/** The tab hinted for `pathname`, or null when the current page gave none. */
export function useNavHint(pathname: string): string | null {
  const h = useSyncExternalStore(subscribe, () => hint, () => null);
  return h && h.path === pathname ? h.tab : null;
}
