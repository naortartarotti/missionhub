import type { Locale } from "../config";
import type en from "./en";

/**
 * The English tree is the source of truth: `fr` and `pt` are typed against it, so a key that's
 * missing in another language is a type error. Add a namespace by creating `<ns>.json` in every
 * locale folder and listing it in each folder's index.ts.
 */
export type Messages = typeof en;

export const loaders: Record<Locale, () => Promise<Messages>> = {
  en: () => import("./en").then((m) => m.default),
  fr: () => import("./fr").then((m) => m.default),
  pt: () => import("./pt").then((m) => m.default),
};
