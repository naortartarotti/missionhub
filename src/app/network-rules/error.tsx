"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export default function NetworkRulesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT("errors");
  useEffect(() => {
    console.error(JSON.stringify({ evt: "ui.error", digest: error.digest }));
  }, [error]);
  return (
    <main className="mx-auto mt-16 max-w-md px-4 text-center">
      <h1 className="text-xl font-semibold">{t("page.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("page.body")}
        {error.digest ? <span className="mt-1 block font-mono text-xs">{t("page.ref", { digest: error.digest })}</span> : null}
      </p>
      <Button className="mt-6" onClick={reset}>{t("page.tryAgain")}</Button>
    </main>
  );
}
