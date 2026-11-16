import { normalizeRulesText } from "./domain";

/**
 * A deliberately small Markdown reader for the published Network Rules (spec Q-D16). It knows only
 * what the rules files use: headings, paragraphs, bullet and numbered lists, and **bold** / *italic*
 * runs. There is no raw HTML, no links and no images: everything comes back as plain text segments
 * that React escapes, so a published text can never inject markup.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type RulesBlock =
  | { kind: "heading"; level: 2 | 3 | 4; id: string; text: string }
  | { kind: "paragraph"; id?: string; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

/** Anchor for a section heading ("1. Membership and acceptance" → "rules-section-1"). */
export function sectionAnchor(number: string): string {
  return `rules-section-${number.replace(/[^0-9]/g, "")}`;
}

/** Anchor for a rule paragraph ("**2.3** …" → "rule-2-3"). */
export function ruleAnchor(number: string): string {
  return `rule-${number.replace(/\./g, "-")}`;
}

function slug(text: string): string {
  return (
    "rules-" +
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)
  );
}

/** **bold** and *italic* / _italic_ runs. Unbalanced markers stay as text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2] ?? m[3], italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((i) => i.text.length > 0);
}

export function parseRulesMarkdown(source: string): RulesBlock[] {
  // Published texts carry no comments (the publish RPC refuses `<!--`); drafts previewed by admins may.
  const text = normalizeRulesText(source).replace(/<!--[\s\S]*?-->/g, "");
  const blocks: RulesBlock[] = [];
  const used = new Set<string>();
  const unique = (id: string) => {
    let candidate = id;
    for (let n = 2; used.has(candidate); n++) candidate = `${id}-${n}`;
    used.add(candidate);
    return candidate;
  };
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join(" ").trim();
    para = [];
    if (!joined) return;
    const rule = /^\*\*(\d+\.\d+)\*\*/.exec(joined);
    blocks.push({ kind: "paragraph", id: rule ? unique(ruleAnchor(rule[1])) : undefined, inlines: parseInline(joined) });
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      const title = heading[2].replace(/\*\*/g, "").trim();
      const section = /^(\d+)\.\s/.exec(title);
      const level = Math.min(heading[1].length + 1, 4) as 2 | 3 | 4;
      blocks.push({ kind: "heading", level, id: unique(section ? sectionAnchor(section[1]) : slug(title)), text: title });
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1].trim());
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // Continuation line of the last list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}
