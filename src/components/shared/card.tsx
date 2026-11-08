import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-3xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)]", className)} {...props} />;
}
