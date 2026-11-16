import { describe, expect, it } from "vitest";
import en from "../messages/en";
import fr from "../messages/fr";
import pt from "../messages/pt";

// QA (N1, C-6, scenario 32, AC-59): no stop / closure / candidate-page / release / claim string says
// or implies the candidate can't be hired, in any language; the neutral stop copy names no scope.
type Tree = { [k: string]: string | Tree };
const leaves = (tree: Tree, prefix = ""): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));

const FORBIDDEN: Record<string, RegExp> = {
  en: /(can(no|')t|may not|must not|not allowed to|unable to) be hired|can(no|')t hire|ineligible|blacklist|no-?poach/i,
  fr: /ne (peut|pourra|doit) (pas|plus) être (embauché|engagé|recruté)|ne peut pas (l'|le |la )?(embaucher|engager)|inadmissible|liste noire/i,
  pt: /não (pode|poderá|deve) ser contratad|não pode contratar|inelegível|lista negra/i,
};

describe.each([["en", en], ["fr", fr], ["pt", pt]] as const)("%s N1 copy", (locale, messages) => {
  const all = leaves(messages as unknown as Tree);
  const n1 = all.filter(([k]) => /^(referrals\.(submit|stop|composer|release|withdraw|claim|objection|deadline|presentation|detail)|candidate\.|errors\.(claim|contest|release|dispute)|emails\.)/i.test(k));

  it("has N1 strings to check", () => expect(n1.length).toBeGreaterThan(20));

  it("never says the candidate can't be hired (C-6)", () => {
    const hits = n1.filter(([, v]) => FORBIDDEN[locale].test(v));
    expect(hits).toEqual([]);
  });

  it("the neutral stop / closure / already-sent copy never mentions job vs another role, dates or counts (BR-9)", () => {
    const neutral = all.filter(([k]) => /(stopTitle|stopNext|already_?[sS]ent|alreadyPresented|closedAlreadyPresented)/.test(k) || /^referrals\.[^.]+\.message$/.test(k));
    expect(neutral.length).toBeGreaterThan(0);
    const scopeWords = { en: /another (job|role)|this job|other job|same job|\bon \d|\bdate\b|\btimes?\b/i, fr: /autre (poste|offre)|ce poste|même poste/i, pt: /outra vaga|esta vaga|mesma vaga/i }[locale];
    expect(neutral.filter(([, v]) => scopeWords.test(v))).toEqual([]);
  });
});
