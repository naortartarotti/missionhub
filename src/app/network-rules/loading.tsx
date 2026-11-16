import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/i18n/server";

export default async function Loading() {
  const t = await getT("auth");
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-8" aria-busy="true" aria-label={t("app.loading")}>
      <Skeleton className="h-8 w-64 rounded-xl" />
      <Skeleton className="h-10 w-80 max-w-full rounded-full" />
      <Skeleton className="h-40 rounded-3xl" />
      <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}
