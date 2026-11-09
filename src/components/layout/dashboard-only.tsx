"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

/** Renders children only on the workspace dashboard (`/w/[orgSlug]/overview`). */
export function DashboardOnly({ children }: { children: ReactNode }) {
  return useSelectedLayoutSegment() === "overview" ? children : null;
}
