import type { RequestContext } from "@/server/auth/context";

/**
 * What the job form needs to explain partner visibility under N10 (§2.6 items 2 and 4, S20-b). Computed
 * on the server from the caller's own context; serializable for the client form.
 */
export type JobNetworkState = {
  restriction: "network_hold" | "rules_not_accepted" | null;
  /** BR-9 b: the member must accept this version before opening a job to partners. */
  userMustAcceptLabel: string | null;
  acceptHref: string;
};

export function jobNetworkState(ctx: RequestContext, nextHref: string): JobNetworkState {
  const restriction = ctx.restriction === "network_hold" || ctx.restriction === "rules_not_accepted" ? ctx.restriction : null;
  const label = ctx.rules.required?.label ?? ctx.rules.current?.label ?? "";
  return {
    restriction,
    userMustAcceptLabel: ctx.rules.userRestricted ? label : null,
    acceptHref: `/workspace/${ctx.organizationSlug}/accept-rules?v=${encodeURIComponent(label)}&next=${encodeURIComponent(nextHref)}`,
  };
}
