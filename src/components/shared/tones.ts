/**
 * Colour tones for pills and section badges. Class strings are spelled out in full so Tailwind
 * picks them up. Selected = solid tone; idle = soft tint of the same tone, so every group of
 * choices reads as its own colour family even before anything is picked.
 */
export type Tone = "blue" | "green" | "orange" | "violet" | "neutral";

export const TONE: Record<Tone, { idle: string; selected: string; tag: string; tagRemove: string; badge: string }> = {
  blue: {
    idle: "border-transparent bg-info-soft text-info hover:border-info/40",
    selected: "border-info bg-info text-background shadow-sm",
    tag: "bg-info-soft text-info",
    tagRemove: "hover:bg-info/15",
    badge: "bg-info-soft text-info",
  },
  green: {
    idle: "border-transparent bg-success-soft text-success hover:border-success/40",
    selected: "border-success bg-success text-background shadow-sm",
    tag: "bg-success-soft text-success",
    tagRemove: "hover:bg-success/15",
    badge: "bg-success-soft text-success",
  },
  orange: {
    idle: "border-transparent bg-warning-soft text-warning hover:border-warning/40",
    selected: "border-warning bg-warning text-background shadow-sm",
    tag: "bg-warning-soft text-warning",
    tagRemove: "hover:bg-warning/15",
    badge: "bg-warning-soft text-warning",
  },
  violet: {
    idle: "border-transparent bg-violet-soft text-violet hover:border-violet/40",
    selected: "border-violet bg-violet text-background shadow-sm",
    tag: "bg-violet-soft text-violet",
    tagRemove: "hover:bg-violet/15",
    badge: "bg-violet-soft text-violet",
  },
  neutral: {
    idle: "border-border bg-background text-foreground hover:border-foreground/40",
    selected: "border-foreground bg-foreground text-background",
    tag: "bg-muted text-foreground",
    tagRemove: "hover:bg-background",
    badge: "bg-muted text-foreground",
  },
};

/** 🇨🇦-style flag from an ISO 3166-1 alpha-2 code (falls back to letters where emoji flags aren't rendered). */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
