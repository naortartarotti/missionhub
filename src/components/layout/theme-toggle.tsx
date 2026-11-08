"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle dark mode"
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
