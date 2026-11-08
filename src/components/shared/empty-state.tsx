import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "./card";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <Panel className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted" aria-hidden>
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground text-pretty">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Panel>
  );
}
