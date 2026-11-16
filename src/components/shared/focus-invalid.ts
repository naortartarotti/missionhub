/**
 * Moves focus to the first invalid control inside `root` (after a refused save). A radio group root
 * can't take focus, so its checked radio (or the first one) gets it instead. Returns false when
 * nothing is invalid, so callers can fall back to a summary message.
 */
export function focusFirstInvalid(root: ParentNode | null | undefined): boolean {
  const el = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!el) return false;
  const target =
    el.getAttribute("role") === "radiogroup"
      ? (el.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? el.querySelector<HTMLElement>('[role="radio"]'))
      : el;
  target?.scrollIntoView({ block: "center" });
  target?.focus({ preventScroll: true });
  return Boolean(target);
}
