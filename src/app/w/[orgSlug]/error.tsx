"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ evt: "ui.error", digest: error.digest }));
  }, [error]);
  const forbidden = error.name === "AuthorizationError" || error.message.includes("permission");
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-xl font-semibold">{forbidden ? "You don't have access to this" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {forbidden ? "Ask an organization admin if you need this permission." : "The error was logged. Try again, and contact support if it continues."}
        {error.digest ? <span className="mt-1 block font-mono text-xs">Ref: {error.digest}</span> : null}
      </p>
      {!forbidden ? <Button className="mt-6" onClick={reset}>Try again</Button> : null}
    </div>
  );
}
