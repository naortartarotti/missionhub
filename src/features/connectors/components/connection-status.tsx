import { StatusPill } from "@/components/shared/status-pill";
import { getT } from "@/i18n/server";

export async function ConnectionStatus({ status, provider, hasError, running }: { status: string; provider: string; hasError: boolean; running?: boolean }) {
  const t = await getT("connectors");
  if (provider === "csv_upload") return <StatusPill tone="neutral" label={t("status.upload")} />;
  if (running) return <StatusPill tone="info" label={t("status.syncing")} />;
  if (status === "error" || hasError) return <StatusPill tone="danger" label={t("status.error")} />;
  if (status === "paused") return <StatusPill tone="warning" label={t("status.paused")} />;
  return <StatusPill tone="success" label={t("status.active")} />;
}
