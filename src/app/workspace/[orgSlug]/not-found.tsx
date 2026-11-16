"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { SettlementBlockedPage, useSettlement } from "@/features/network-rules/components/settlement";

/**
 * Workspace not-found. In settlement mode (N10 §2.10 item 5) every route outside the BR-34 allow-list
 * keeps its default-deny notFound(); this boundary sits inside the workspace layout, which shares the
 * org's settlement state, so it renders the settlement-mode page (S22-c) instead of a broken screen.
 * The segment's loading.tsx means the response has already started streaming (HTTP 200).
 */
export default function WorkspaceNotFound() {
  const settlement = useSettlement();
  const t = useT("errors");
  if (settlement) return <SettlementBlockedPage info={settlement} />;
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">{t("notFound.code")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("notFound.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("notFound.body")}</p>
        <Button className="mt-6" asChild>
          <Link href="/">{t("notFound.home")}</Link>
        </Button>
      </div>
    </div>
  );
}
