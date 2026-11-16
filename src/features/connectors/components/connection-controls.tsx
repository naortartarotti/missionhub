"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useT } from "@/i18n/client";
import { SYNC_INTERVALS } from "../catalog";
import { deleteConnection, syncConnectionNow, updateConnection } from "../actions";

export function ConnectionControls({
  orgSlug,
  connectionId,
  status,
  interval,
  jobStatus,
  importsJobs,
  scheduled,
}: {
  orgSlug: string;
  connectionId: string;
  status: string;
  interval: number;
  jobStatus: "draft" | "active";
  importsJobs: boolean;
  /** false for one-off uploads (no schedule, no pause). */
  scheduled: boolean;
}) {
  const t = useT("connectors");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? t("messages.updated"));
      else toast.error(r.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {scheduled ? (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => syncConnectionNow(orgSlug, connectionId))}>
            <RefreshCw className="size-3.5" aria-hidden /> {t("connection.syncNow")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => updateConnection(orgSlug, { connectionId, status: status === "paused" ? "active" : "paused" }))}
          >
            {status === "paused" ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            {status === "paused" ? t("connection.resume") : t("connection.pause")}
          </Button>
          <div className="w-40">
            <NativeSelect aria-label={t("connect.interval")} defaultValue={String(interval)} disabled={pending} onChange={(e) => run(() => updateConnection(orgSlug, { connectionId, interval: Number(e.target.value) }))}>
              {SYNC_INTERVALS.map((m) => <option key={m} value={m}>{t(`interval.${m}`)}</option>)}
            </NativeSelect>
          </div>
          {importsJobs ? (
            <div className="w-52">
              <NativeSelect aria-label={t("connect.jobStatus")} defaultValue={jobStatus} disabled={pending} onChange={(e) => run(() => updateConnection(orgSlug, { connectionId, jobStatus: e.target.value as "draft" | "active" }))}>
                {(["draft", "active"] as const).map((s) => <option key={s} value={s}>{t(`connect.jobStatusOption.${s}`)}</option>)}
              </NativeSelect>
            </div>
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        trigger={<Button size="sm" variant="ghost" disabled={pending}>{t("connection.disconnect")}</Button>}
        title={t("connection.disconnectTitle")}
        description={t("connection.disconnectDescription")}
        confirmLabel={t("connection.disconnect")}
        destructive
        onConfirm={() => deleteConnection(orgSlug, connectionId)}
      />
    </div>
  );
}
