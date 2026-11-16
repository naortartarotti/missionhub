import { Panel } from "@/components/shared/card";
import { Skeleton } from "@/components/ui/skeleton";

/** S14 / S15 loading: skeleton rows, the same shape as the sections. */
export default function Loading() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-busy>
      <div className="grid gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {[0, 1, 2].map((i) => (
        <Panel key={i} className="grid gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </Panel>
      ))}
    </div>
  );
}
