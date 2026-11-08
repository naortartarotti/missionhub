import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export function AuthShell({ title, subtitle, children, footer, wide }: { title?: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className={wide ? "w-full max-w-[620px]" : "w-full max-w-[420px]"}>
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-[2rem] border border-border/60 bg-card p-7 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.25)] sm:p-9">
          {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
          {subtitle ? <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p> : null}
          <div className={title || subtitle ? "mt-7" : undefined}>{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
        <div className="mt-4 flex justify-center">
          <LanguageSwitcher variant="full" />
        </div>
      </div>
    </main>
  );
}
