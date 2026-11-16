import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/i18n/server";

export default async function Loading() {
  const t = await getT("auth");
  return (
    <div className="grid gap-4" aria-busy="true" aria-label={t("app.loading")}>
      <Skeleton className="h-8 w-56 rounded-xl" />
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}
    </div>
  );
}
