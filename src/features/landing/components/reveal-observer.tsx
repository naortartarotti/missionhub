"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Mounted once in the marketing layout and re-run on every client navigation, since the layout
 * (and this component) persists between pages. Marks every server-rendered `[data-reveal]` element with
 * `data-shown` the first time it scrolls into view; the CSS in globals.css does the animation.
 * Keeps the page itself a Server Component, and without JS (or with reduced motion) the content
 * is simply visible.
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.setAttribute("data-shown", ""));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    nodes.forEach((n) => io.observe(n));
    root.setAttribute("data-reveal-ready", "");
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
