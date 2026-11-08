import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({ base, params, page, total, pageSize }: { base: string; params: Record<string, string>; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(page - 1)}>Previous</Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(page + 1)}>Next</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
