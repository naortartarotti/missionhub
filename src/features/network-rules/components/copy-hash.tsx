"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { useT } from "@/i18n/client";

/** Short SHA-256 with the full value in a tooltip (title) and on copy (§2.4 item 7). */
export function CopyHash({ hash, locale }: { hash: string; locale: string }) {
  const t = useT("admin");
  return (
    <button
      type="button"
      title={hash}
      translate="no"
      aria-label={`${t("networkRules.copyFingerprint")} (${locale})`}
      onClick={async () => {
        await navigator.clipboard.writeText(hash);
        toast.success(t("networkRules.copied"));
      }}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 font-mono text-xs hover:bg-muted focus-visible:outline-2"
    >
      {hash.slice(0, 8)}
      <Copy className="size-3 text-muted-foreground" aria-hidden />
    </button>
  );
}
