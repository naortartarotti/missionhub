import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { getConnector } from "@/features/connectors/catalog";
import { ConnectorGallery } from "@/features/connectors/components/connector-gallery";
import { ConnectorTile } from "@/features/connectors/components/connector-tile";
import { ConnectionStatus } from "@/features/connectors/components/connection-status";
import { listConnections } from "@/features/connectors/queries";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("connectors"))("metaTitle") };
}

export default async function ConnectorsPage({ params }: PageProps<"/workspace/[orgSlug]/settings/connectors">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const [connections, t, f] = await Promise.all([listConnections(ctx), getT("connectors"), getFormatter()]);
  const counts: Record<string, number> = {};
  for (const c of connections) counts[c.provider] = (counts[c.provider] ?? 0) + 1;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {connections.length ? (
        <Panel className="p-0">
          <div className="px-5 pt-4">
            <SectionTitle>{t("connected.title")}</SectionTitle>
          </div>
          <ul className="divide-y divide-border/60">
            {connections.map((c) => {
              const def = getConnector(c.provider);
              if (!def) return null;
              return (
                <li key={c.id}>
                  <Link href={`/workspace/${orgSlug}/settings/connectors/${c.provider}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                    <ConnectorTile def={def} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{def.name}{c.name !== def.name && c.provider !== "csv_upload" ? <span className="font-normal text-muted-foreground"> · {c.name}</span> : null}</span>
                      <span className="block text-sm text-muted-foreground">
                        {c.last_sync_at ? t("connected.lastSync", { when: f.relative(c.last_sync_at) }) : t("connected.firstSyncPending")}
                        {c.lastRun ? ` · ${t("connected.lastRun", { created: c.lastRun.created_count, updated: c.lastRun.updated_count })}` : ""}
                      </span>
                    </span>
                    <ConnectionStatus status={c.status} provider={c.provider} hasError={Boolean(c.last_error)} />
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <ConnectorGallery orgSlug={orgSlug} connected={counts} />
    </div>
  );
}
