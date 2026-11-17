import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock, ShieldCheck, X } from "lucide-react";
import { can, getRequestContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { getConnector } from "@/features/connectors/catalog";
import { ConnectorTile } from "@/features/connectors/components/connector-tile";
import { ConnectForm } from "@/features/connectors/components/connect-form";
import { UploadForm } from "@/features/connectors/components/upload-form";
import { ConnectionControls } from "@/features/connectors/components/connection-controls";
import { ConnectionStatus } from "@/features/connectors/components/connection-status";
import { CopyBlock, CreateApiKeyForm, RevokeKeyButton } from "@/features/connectors/components/api-keys";
import { listApiKeys, listConnections } from "@/features/connectors/queries";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/workspace/[orgSlug]/settings/connectors/[provider]">) {
  const { provider } = await params;
  return { title: getConnector(provider)?.name ?? (await getT("connectors"))("metaTitle") };
}

export default async function ConnectorPage({ params }: PageProps<"/workspace/[orgSlug]/settings/connectors/[provider]">) {
  const { orgSlug, provider } = await params;
  const def = getConnector(provider);
  if (!def) notFound();
  const ctx = await getRequestContext(orgSlug);
  const manage = can(ctx, "integrations:manage");
  const [connections, keys, t, f] = await Promise.all([
    def.mode === "api" ? Promise.resolve([]) : listConnections(ctx, def.id),
    def.mode === "api" && manage ? listApiKeys(ctx) : Promise.resolve([]),
    getT("connectors"),
    getFormatter(),
  ]);
  const p = (key: string) => t(`providers.${def.id}.${key}` as never);
  const apiBase = `${env.NEXT_PUBLIC_APP_URL ?? ""}/api/v1`;

  return (
    <div className="grid gap-6">
      <Link href={`/workspace/${orgSlug}/settings/connectors`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("detail.back")}
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <ConnectorTile def={def} size="lg" />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{def.name}</h2>
            {def.status === "soon" ? <StatusPill tone="neutral" label={t("gallery.soon")} icon={Clock} /> : null}
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{p("description")}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {def.entities.map((e) => <span key={e} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{t(`entity.${e}`)}</span>)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel className="grid content-start gap-5">
          <div className="grid gap-2">
            <SectionTitle>{t("detail.does")}</SectionTitle>
            <ul className="grid gap-2 text-sm">
              {(["does1", "does2"] as const).map((k) => (
                <li key={k} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{p(k)}</li>
              ))}
              <li className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{t("detail.never")}</li>
            </ul>
          </div>
          {def.status === "available" && def.mode !== "api" ? (
            <div className="grid gap-2">
              <SectionTitle>{t("detail.steps")}</SectionTitle>
              <ol className="grid gap-2 text-sm">
                {(["step1", "step2", "step3"] as const).map((k, i) => (
                  <li key={k} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold" aria-hidden>{i + 1}</span>
                    <span className="pt-0.5">{p(k)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="flex gap-2 rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-foreground" aria-hidden />
            {def.entities.includes("candidates") ? t("detail.privacyCandidates") : t("detail.privacyJobs")}
          </p>
        </Panel>

        <Panel className="grid content-start gap-4">
          {def.status === "soon" ? (
            <>
              <SectionTitle>{t("detail.soonTitle")}</SectionTitle>
              <p className="text-sm text-muted-foreground">{t("detail.soonBody", { name: def.name })}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link className="rounded-full border border-border px-3 py-1.5 font-medium hover:bg-accent" href={`/workspace/${orgSlug}/settings/connectors/workatent_api`}>Workatent API</Link>
                <Link className="rounded-full border border-border px-3 py-1.5 font-medium hover:bg-accent" href={`/workspace/${orgSlug}/settings/connectors/google_sheets`}>Google Sheets</Link>
                <Link className="rounded-full border border-border px-3 py-1.5 font-medium hover:bg-accent" href={`/workspace/${orgSlug}/settings/connectors/csv_upload`}>CSV</Link>
              </div>
            </>
          ) : !manage && def.mode !== "upload" ? (
            <>
              <SectionTitle>{t("detail.connect")}</SectionTitle>
              <p className="text-sm text-muted-foreground">{t("detail.adminOnly")}</p>
            </>
          ) : def.mode === "sync" ? (
            <>
              <SectionTitle>{connections.length ? t("detail.connectAnother") : t("detail.connect")}</SectionTitle>
              <ConnectForm orgSlug={orgSlug} def={def} />
            </>
          ) : def.mode === "upload" ? (
            <>
              <SectionTitle>{t("upload.title")}</SectionTitle>
              <UploadForm orgSlug={orgSlug} canJobs={can(ctx, "jobs:write")} />
            </>
          ) : (
            <>
              <SectionTitle>{t("api.keysTitle")}</SectionTitle>
              <p className="text-sm text-muted-foreground">{t("api.keysBody")}</p>
              <CreateApiKeyForm orgSlug={orgSlug} />
              {keys.length ? (
                <ul className="divide-y divide-border/60 rounded-2xl border border-border">
                  {keys.map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{k.name} <code className="ml-1 text-xs font-normal text-muted-foreground">{k.prefix}…</code></span>
                        <span className="block text-xs text-muted-foreground">
                          {t("api.keyMeta", { who: k.creator?.full_name || k.creator?.email || "—", created: f.date(k.created_at) })}
                          {" · "}
                          {k.last_used_at ? t("api.lastUsed", { when: f.relative(k.last_used_at) }) : t("api.neverUsed")}
                        </span>
                      </span>
                      {k.revoked_at ? <StatusPill tone="neutral" label={t("api.revoked")} /> : <RevokeKeyButton orgSlug={orgSlug} keyId={k.id} name={k.name} />}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      {def.mode === "api" ? (
        <Panel className="grid gap-4">
          <SectionTitle>{t("api.docsTitle")}</SectionTitle>
          <p className="text-sm text-muted-foreground">{t("api.docsBody")}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="text-muted-foreground">{t("api.baseUrl")}</dt>
            <dd><code>{apiBase}</code></dd>
            <dt className="text-muted-foreground">{t("api.auth")}</dt>
            <dd><code>Authorization: Bearer mh_live_…</code></dd>
            <dt className="text-muted-foreground">{t("api.limits")}</dt>
            <dd>{t("api.limitsValue")}</dd>
          </dl>
          <CopyBlock
            label={t("api.exampleCandidates")}
            code={`curl -X POST ${apiBase}/candidates \\
  -H "Authorization: Bearer $WORKATENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [{
      "externalId": "ats-48213",
      "fullName": "Ana Souza",
      "email": "ana@example.com",
      "headline": "Senior Product Designer",
      "skills": ["figma", "design systems"],
      "seniority": "senior",
      "location": { "city": "Toronto", "country": "CA" },
      "workArrangements": ["remote", "hybrid"],
      "ownerEmail": "recruiter@youragency.com"
    }]
  }'`}
          />
          <CopyBlock
            label={t("api.exampleJobs")}
            code={`curl -X POST ${apiBase}/jobs \\
  -H "Authorization: Bearer $WORKATENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "req-1042",
    "title": "Backend Engineer",
    "description": "Build and run our payments APIs.",
    "requiredSkills": ["go", "postgresql"],
    "workArrangement": "hybrid",
    "contractType": "permanent",
    "location": { "city": "Lisbon", "country": "PT" },
    "salary": { "min": 60000, "max": 80000, "currency": "EUR" },
    "status": "draft"
  }'`}
          />
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            {(["note1", "note2", "note3", "note4"] as const).map((k) => <li key={k}>• {t(`api.${k}`)}</li>)}
          </ul>
        </Panel>
      ) : null}

      {connections.length ? (
        <div className="grid gap-4">
          <SectionTitle>{def.mode === "upload" ? t("detail.history") : t("detail.connections")}</SectionTitle>
          {connections.map((c) => (
            <Panel key={c.id} className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{def.mode === "upload" ? def.name : c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("connection.owner", { name: c.owner?.full_name || c.owner?.email || "—" })}
                    {" · "}
                    {c.last_sync_at ? t("connected.lastSync", { when: f.relative(c.last_sync_at) }) : t("connected.firstSyncPending")}
                    {def.mode === "sync" && c.status === "active" ? ` · ${t("connection.next", { when: f.relative(c.next_sync_at) })}` : ""}
                  </p>
                  {c.last_error ? <p className="mt-1 text-sm text-danger">{t(`errors.${c.last_error}` as never, { column: "" })}</p> : null}
                </div>
                <ConnectionStatus status={c.status} provider={c.provider} hasError={Boolean(c.last_error)} running={c.running} />
              </div>
              {manage ? (
                <ConnectionControls
                  orgSlug={orgSlug}
                  connectionId={c.id}
                  status={c.status}
                  interval={c.sync_interval_minutes}
                  jobStatus={c.config.jobStatus === "active" ? "active" : "draft"}
                  importsJobs={def.mode === "sync" && (c.config.entity ?? "jobs") === "jobs" && def.entities.includes("jobs")}
                  scheduled={def.mode === "sync"}
                />
              ) : null}
              {c.runs.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <caption className="sr-only">{t("runs.caption")}</caption>
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th scope="col" className="py-2 font-medium">{t("runs.when")}</th>
                        <th scope="col" className="py-2 font-medium">{t("runs.result")}</th>
                        <th scope="col" className="py-2 text-right font-medium">{t("runs.created")}</th>
                        <th scope="col" className="py-2 text-right font-medium">{t("runs.updated")}</th>
                        <th scope="col" className="py-2 text-right font-medium">{t("runs.paused")}</th>
                        <th scope="col" className="py-2 text-right font-medium">{t("runs.failed")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.runs.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2 text-muted-foreground">{f.dateTime(r.started_at)} · {t(`runs.trigger.${r.trigger}` as never)}</td>
                          <td className="py-2">
                            <StatusPill tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "info"} label={t(`runs.status.${r.status}` as never)} />
                          </td>
                          <td className="py-2 text-right tabular-nums">{r.created_count}</td>
                          <td className="py-2 text-right tabular-nums">{r.updated_count}</td>
                          <td className="py-2 text-right tabular-nums">{r.closed_count}</td>
                          <td className="py-2 text-right tabular-nums">{r.failed_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}
