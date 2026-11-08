import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export async function Pagination({ base, params, page, total, pageSize }: { base: string; params: Record<string, string>; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const t = await getT("common");
  const href = (p: number) => `${base}?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <nav aria-label={t("pagination.label")} className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{t("pagination.summary", { page, pages, total })}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(page - 1)}>{t("actions.previous")}</Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(page + 1)}>{t("actions.next")}</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
