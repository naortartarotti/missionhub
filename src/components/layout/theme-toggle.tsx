"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function ThemeToggle({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  const t = useT("common");
  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={t("theme.toggle")}
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        try {
          localStorage.setItem("mh-theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <Sun className="size-[18px] dark:hidden" aria-hidden />
      <Moon className="hidden size-[18px] dark:block" aria-hidden />
    </Button>
  );
}
