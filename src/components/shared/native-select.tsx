import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

/** Accessible native <select> styled to match inputs (works with plain form posts). */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-10 w-full appearance-none rounded-xl border border-input bg-card pr-9 pl-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}
