import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/i18n/server";

/** Mirrors the Overview layout: header, three compact stats, attention queue, opportunities, activity. */
export default async function Loading() {
  const t = await getT("auth");
  return (
    <div className="grid gap-8" aria-busy="true" aria-label={t("app.loading")}>
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-4 w-96 max-w-full rounded-lg" />
      </div>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-56 rounded-3xl" />
      </div>
      <Skeleton className="h-64 rounded-3xl" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    </div>
  );
}
