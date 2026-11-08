"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setJobStatus } from "../actions";

const NEXT: Record<string, { to: string; label: string; variant?: "outline" | "ghost" | "default" }[]> = {
  draft: [{ to: "active", label: "Publish" }],
  active: [
    { to: "paused", label: "Pause", variant: "outline" },
    { to: "filled", label: "Mark filled", variant: "outline" },
    { to: "closed", label: "Close", variant: "ghost" },
  ],
  paused: [{ to: "active", label: "Resume" }, { to: "closed", label: "Close", variant: "ghost" }],
  closed: [{ to: "active", label: "Reopen", variant: "outline" }],
  filled: [],
  cancelled: [],
};

export function JobStatusActions({ orgSlug, jobId, status }: { orgSlug: string; jobId: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {(NEXT[status] ?? []).map((n) => (
        <Button
          key={n.to}
          variant={n.variant ?? "default"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setJobStatus(orgSlug, { jobId, status: n.to });
              if (r.ok) toast.success(r.message ?? "Updated");
              else toast.error(r.error);
            })
          }
        >
          {n.label}
        </Button>
      ))}
    </div>
  );
}
