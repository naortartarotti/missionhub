"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT("errors");
  useEffect(() => {
    console.error(JSON.stringify({ evt: "ui.error", digest: error.digest }));
  }, [error]);
  const forbidden = error.name === "AuthorizationError" || error.message.includes("permission");
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-xl font-semibold">{forbidden ? t("page.forbiddenTitle") : t("page.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {forbidden ? t("page.forbiddenBody") : t("page.body")}
        {error.digest ? <span className="mt-1 block font-mono text-xs">{t("page.ref", { digest: error.digest })}</span> : null}
      </p>
      {!forbidden ? <Button className="mt-6" onClick={reset}>{t("page.tryAgain")}</Button> : null}
    </div>
  );
}
