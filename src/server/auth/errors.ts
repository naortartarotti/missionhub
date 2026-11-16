export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** N10 (EC-1): the org is in settlement mode and the caller didn't opt in. guard → `settlement_mode_unavailable`. */
export class SettlementModeError extends AuthorizationError {
  constructor() {
    super("settlement_mode_unavailable");
    this.name = "SettlementModeError";
  }
}

/** N10 (BR-7): the user has never accepted any Network Rules version. guard → `rules_acceptance_required`. */
export class RulesAcceptanceRequiredError extends AuthorizationError {
  constructor() {
    super("rules_acceptance_required");
    this.name = "RulesAcceptanceRequiredError";
  }
}

export function isSettlementModeError(e: unknown): e is SettlementModeError {
  return e instanceof Error && e.name === "SettlementModeError";
}
