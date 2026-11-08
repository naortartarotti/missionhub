import { describe, expect, it } from "vitest";
import en from "../messages/en";
import fr from "../messages/fr";
import pt from "../messages/pt";
import { matchAcceptLanguage } from "../config";
import { createTranslator, createGlobalTranslator, msg, translateMarked } from "../translate";

type Tree = { [k: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each([
  ["fr", fr],
  ["pt", pt],
])("%s messages", (_, messages) => {
  const source = leaves(en as unknown as Tree);
  const target = leaves(messages as unknown as Tree);

  it("has exactly the same keys as English", () => {
    expect([...target.keys()].filter((k) => !source.has(k))).toEqual([]);
    expect([...source.keys()].filter((k) => !target.has(k))).toEqual([]);
  });

  it("keeps the same {placeholders} in every message", () => {
    // The singular/zero form of a plural may drop {count} ("Ouvrir votre correspondance gardée").
    const isOptionalCount = (k: string) => /\.(one|zero)$/.test(k);
    const mismatched = [...source].filter(([k, v]) => {
      if (!target.has(k)) return false;
      const want = placeholders(v);
      const got = placeholders(target.get(k)!);
      if (isOptionalCount(k)) return got.some((p) => !want.includes(p)) || want.some((p) => p !== "count" && !got.includes(p));
      return want.join() !== got.join();
    });
    expect(mismatched.map(([k]) => k)).toEqual([]);
  });

  it("has no empty translations", () => {
    expect([...target].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
});

describe("translator", () => {
  it("interpolates and pluralizes per locale", () => {
    const t = createTranslator(en, "en", "activity");
    expect(t("unreadCount", { count: 1 })).toBe("1 unread");
    const tf = createTranslator(fr, "fr", "activity");
    expect(tf("unreadCount", { count: 2 })).toBe("2 non lues");
    expect(createTranslator(pt, "pt", "overview")("welcome", { name: "Ana" })).toBe("Bem-vindo de volta, Ana!");
  });

  it("returns the key when a message is missing", () => {
    const t = createGlobalTranslator(en, "en");
    // @ts-expect-error unknown key on purpose
    expect(t("nope.missing")).toBe("nope.missing");
  });

  it("translates server-side markers", () => {
    const t = createGlobalTranslator(fr, "fr");
    expect(translateMarked(t, msg("errors.forbidden"))).toBe("Vous n'avez pas la permission de faire cela.");
    expect(translateMarked(t, "plain text")).toBe("plain text");
  });

  it("matches Accept-Language", () => {
    expect(matchAcceptLanguage("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(matchAcceptLanguage("de-DE,fr;q=0.5")).toBe("fr");
    expect(matchAcceptLanguage("de-DE")).toBeUndefined();
  });
});
