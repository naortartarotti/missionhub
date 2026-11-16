import Link from "next/link";
import { BookText, Plus } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { listNetworkRules } from "@/features/network-rules/admin-queries";
import { RULES_LOCALES, type RulesLocale, type VersionType } from "@/features/network-rules/domain";
import { CopyHash } from "@/features/network-rules/components/copy-hash";

export async function generateMetadata() {
  return { title: (await getT("admin"))("networkRules.title") };
}

type Row = {
  id: string;
  label: string;
  type: VersionType;
  status: "draft" | "published";
  effective_on: string | null;
  effective_at: string | null;
  published_at: string | null;
  approval_reference: string | null;
  is_current: boolean;
  is_upcoming: boolean;
  texts: Partial<Record<RulesLocale, { sha256: string; change_summary: string | null }>>;
};

/** S5: drafts, current, upcoming and history. Published rows are read-only (no edit, no delete). */
export default async function AdminNetworkRulesPage() {
  const db = await createClient();
  const [t, tg, f, raw] = await Promise.all([getT("admin"), getGlobalT(), getFormatter(), listNetworkRules(db)]);
  const rows = (Array.isArray(raw) ? raw : []) as unknown as Row[];
  const drafts = rows.filter((r) => r.status === "draft");
  const published = rows.filter((r) => r.status === "published");
  const upcoming = published.find((r) => r.is_upcoming);
  const current = published.find((r) => r.is_current);
  const newButton = upcoming ? (
    <div className="grid gap-1 sm:justify-items-end">
      <Button disabled aria-describedby="upcoming-hint" className="min-h-11 sm:min-h-9"><Plus className="size-4" aria-hidden /> {t("networkRules.new")}</Button>
      <p id="upcoming-hint" className="max-w-xs text-xs text-muted-foreground">{t("networkRules.upcomingExists")}</p>
    </div>
  ) : (
    <Button asChild className="min-h-11 sm:min-h-9"><Link href="/admin/network-rules/new"><Plus className="size-4" aria-hidden /> {t("networkRules.new")}</Link></Button>
  );
  const hashes = (r: Row) => (
    <span className="flex flex-wrap gap-1">
      {RULES_LOCALES.map((l) => (r.texts[l]?.sha256 ? <CopyHash key={l} hash={r.texts[l]!.sha256} locale={l} /> : <span key={l}>—</span>))}
    </span>
  );
  const card = (r: Row, heading: string) => (
    <Panel className="grid gap-2">
      <SectionTitle action={<Badge variant="outline">{tg(`labels.rulesVersionType.${r.type}`)}</Badge>}>{heading}: {r.label}</SectionTitle>
      <p className="text-sm text-muted-foreground">{t("networkRules.col.effective")}: {f.etDate(r.effective_at)} · {t("networkRules.col.published")}: {f.etDate(r.published_at)}</p>
      <p className="text-sm">{t("networkRules.col.approval")}: {r.approval_reference ?? "—"}</p>
      <div className="text-sm"><span className="text-muted-foreground">{t("networkRules.col.fingerprint")}: </span>{hashes(r)}</div>
    </Panel>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title={t("networkRules.title")} description={t("networkRules.description")} actions={newButton} />
      {drafts.length ? (
        <Panel>
          <SectionTitle>{t("networkRules.drafts")}</SectionTitle>
          <ul className="divide-y divide-border/60">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium">{d.label} · {tg(`labels.rulesVersionType.${d.type}`)}</span>
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-8"><Link href={`/admin/network-rules/${d.id}/edit`}>{tg("common.actions.edit")}</Link></Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {published.length === 0 ? (
        <EmptyState icon={BookText} title={t("networkRules.empty")} description={t("networkRules.emptyDescription")} action={upcoming ? undefined : <Button asChild><Link href="/admin/network-rules/new">{t("networkRules.new")}</Link></Button>} />
      ) : (
        <>
          {upcoming ? card(upcoming, t("networkRules.upcoming")) : null}
          {current ? card(current, t("networkRules.current")) : null}
          <Panel className="p-0">
            <div className="px-5 pt-5"><SectionTitle>{t("networkRules.history")}</SectionTitle></div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("networkRules.col.label")}</TableHead>
                    <TableHead>{t("networkRules.col.type")}</TableHead>
                    <TableHead>{t("networkRules.col.effective")}</TableHead>
                    <TableHead>{t("networkRules.col.published")}</TableHead>
                    <TableHead>{t("networkRules.col.approval")}</TableHead>
                    <TableHead>{t("networkRules.col.fingerprint")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {published.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell>{tg(`labels.rulesVersionType.${r.type}`)}</TableCell>
                      <TableCell className="whitespace-nowrap">{f.etDate(r.effective_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{f.etDate(r.published_at)}</TableCell>
                      <TableCell className="max-w-56 whitespace-normal">{r.approval_reference ?? "—"}</TableCell>
                      <TableCell>{hashes(r)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
