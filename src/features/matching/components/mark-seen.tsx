"use client";

import { useEffect } from "react";
import { markOpportunitiesSeen } from "../actions";

/**
 * Marks matches as seen after they've been painted in the browser. Done client-side on purpose:
 * a server render can happen without anyone looking (link prefetch, HMR refresh), and that must
 * not clear the "New" flag. The page isn't refreshed, so the pills stay visible for this visit.
 */
export function MarkSeen({ orgSlug, ids }: { orgSlug: string; ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => void markOpportunitiesSeen(orgSlug, key.split(",")), 1500);
    return () => clearTimeout(t);
  }, [orgSlug, key]);
  return null;
}
