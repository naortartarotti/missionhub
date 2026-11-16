"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { CATEGORIES, CONNECTORS, type ConnectorCategory } from "../catalog";
import { ConnectorTile } from "./connector-tile";

export function ConnectorGallery({ orgSlug, connected }: { orgSlug: string; connected: Record<string, number> }) {
  const t = useT("connectors");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConnectorCategory | "all">("all");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONNECTORS.filter((c) => (category === "all" || c.category === category) && (!q || c.name.toLowerCase().includes(q)))
      // Available first, then alphabetical within each group.
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "available" ? -1 : 1));
  }, [query, category]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("gallery.search")} aria-label={t("gallery.search")} className="pl-9" />
        </div>
        <div role="tablist" aria-label={t("gallery.categories")} className="flex flex-wrap gap-2">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                category === c ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-accent",
              )}
            >
              {t(`category.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("gallery.noResults")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const count = connected[c.id] ?? 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/workspace/${orgSlug}/settings/connectors/${c.id}`}
                  className={cn(
                    "group flex h-full gap-4 rounded-3xl border border-border bg-card p-4 transition-colors hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                    c.status === "soon" && "opacity-80",
                  )}
                >
                  <ConnectorTile def={c} />
                  <span className="grid min-w-0 flex-1 content-start gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      {count > 0 ? (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">{t("gallery.connected", { count })}</span>
                      ) : c.status === "soon" ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("gallery.soon")}</span>
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{t(`providers.${c.id}.tagline` as never)}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {c.entities.map((e) => (
                        <span key={e} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{t(`entity.${e}`)}</span>
                      ))}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
