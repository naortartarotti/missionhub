"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Pins the page header to the top while content scrolls under it, and publishes its height as
 * `--page-header-h` so other sticky elements (e.g. the Opportunities details panel) sit just below.
 */
export function StickyHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--page-header-h", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--page-header-h");
    };
  }, []);
  return (
    <div
      ref={ref}
      className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-4 backdrop-blur-md sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 lg:py-5"
    >
      {children}
    </div>
  );
}
