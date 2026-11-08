"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ActivityPopover, type ActivityItem } from "./activity-popover";

type Value = { orgSlug: string; items: ActivityItem[]; unread: number };
const ActivityContext = createContext<Value | null>(null);

/** Provided by the workspace layout so any page header can show the notifications bell. */
export function ActivityProvider({ children, ...value }: Value & { children: ReactNode }) {
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function HeaderBell() {
  const v = useContext(ActivityContext);
  if (!v) return null;
  return <ActivityPopover orgSlug={v.orgSlug} items={v.items} unread={v.unread} />;
}
