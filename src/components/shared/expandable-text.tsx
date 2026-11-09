"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Long plain text clamped to a few lines, with a toggle that only appears when it actually overflows. */
export function ExpandableText({ text, moreLabel, lessLabel, lines = 6 }: { text: string; moreLabel: string; lessLabel: string; lines?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <p
        ref={ref}
        className={cn("text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground", !open && "line-clamp-(--lines)")}
        style={{ "--lines": lines } as CSSProperties}
      >
        {text}
      </p>
      {overflows || open ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-3 inline-flex items-center gap-1 rounded-full text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
