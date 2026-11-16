"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { deactivateMemberInSettlement } from "../actions";

/**
 * Team in settlement mode (§2.10 item 7): deactivate only, through the dedicated action. Hidden by the
 * page for the caller and for the last active org admin; the server refuses both anyway
 * (`self_change`, `last_admin`), and the error shows as a toast.
 */
export function SettlementDeactivateButton({ orgSlug, membershipId }: { orgSlug: string; membershipId: string }) {
  const t = useT("settings");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 sm:min-h-8"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await deactivateMemberInSettlement(orgSlug, { membershipId });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(t("team.updated"));
          router.refresh();
        })
      }
    >
      {t("team.suspend")}
    </Button>
  );
}
