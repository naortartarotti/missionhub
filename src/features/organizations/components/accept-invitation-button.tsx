"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form-message";
import type { ActionResult } from "@/lib/actions/result";
import { acceptInvitation } from "../actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);
  return (
    <div className="grid gap-4">
      <FormMessage state={state} />
      <Button size="lg" disabled={pending} onClick={() => start(async () => setState(await acceptInvitation(token)))}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
