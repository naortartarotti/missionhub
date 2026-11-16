import { cn } from "@/lib/utils";
import type { ConnectorDef } from "../catalog";

/** The connector's mark: a coloured monogram tile (no third-party logos are bundled). */
export function ConnectorTile({ def, size = "md" }: { def: Pick<ConnectorDef, "monogram" | "tone">; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl font-semibold tracking-tight",
        size === "lg" ? "size-14 text-lg" : "size-11 text-sm",
        def.monogram.length > 2 && (size === "lg" ? "text-sm" : "text-[11px]"),
        def.tone,
      )}
    >
      {def.monogram}
    </span>
  );
}
