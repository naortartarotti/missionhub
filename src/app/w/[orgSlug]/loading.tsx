import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/i18n/server";

export default async function Loading() {
  const t = await getT("auth");
  return (
    <div className="grid gap-6" aria-busy="true" aria-label={t("app.loading")}>
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-4 w-96 max-w-full rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
      </div>
      <Skeleton className="h-72 rounded-3xl" />
    </div>
  );
}
