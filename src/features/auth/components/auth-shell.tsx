import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-[2rem] border border-border/60 bg-card p-7 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.25)] sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
