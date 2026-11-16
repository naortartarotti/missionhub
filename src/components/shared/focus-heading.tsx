"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** An h1 that takes focus when it mounts, for result pages reached after a form submit (§6). */
export function FocusHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
