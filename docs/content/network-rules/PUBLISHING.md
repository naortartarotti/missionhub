# Publishing the Network Rules: making publish-ready copies

- **Owner:** UX Writer & Marketing · **Date:** 2026-11-16
- **Use it:** once, for each version, **after** the founder and counsel approve the text (P0-1, PD-053.7). Then again for every later version.
- **Produces:** three stripped Markdown files, ready to paste into `/admin/network-rules/new` (spec S6): `docs/content/network-rules/publish/<label>/en.md`, `fr-CA.md`, `pt-BR.md`.
- **Doesn't do:** publishing. A platform admin publishes in `/admin/network-rules`, and only when the user decides to. Nothing in this procedure is sent or posted anywhere.

The source files (`en.md`, `fr-CA.md`, `pt-BR.md`) stay as they are: they keep the review history. **Never strip the source files in place.** Always write to `publish/<label>/`.

---

## 1. What gets removed, and why

The source files carry three kinds of markers (see `README.md`). None of them may reach members, and the publish form refuses them anyway (BR-2 b, `marker_found`: `<!--`, `[TODO`, `[placeholder`, `⚖️`).

| Marker | Example | In the publish copy |
|---|---|---|
| `<!-- ships with X -->…<!-- /ships with X -->` | 1.6 (N5), 2.6 last sentence (access expiry), 4.6 last two sentences (P1-5), 8.1 "Report a problem" (P0-3) | **X has shipped:** keep the text, remove the two markers. **X hasn't shipped:** remove the markers and the text between them. |
| `<!-- until P0-3 ships -->…<!-- /until P0-3 ships -->` | 8.1 support-email wording | The reverse: **P0-3 has shipped:** remove the markers and the text. **Not shipped:** keep the text, remove the markers. |
| Any other `<!-- … -->` | the header comment, `<!-- ⚖️ counsel: … -->` notes | Remove, with the space before an inline comment. |
| `[TODO: …]` | effective date, 6.8 pricing, 7.5 arbitration values, 8.1 support address, 10.6 governing version | **Must already be filled in the source.** If one is left in the output, stop (§4). |

Two lines are also removed because the app shows them from the version record (S1, S4), and keeping them would duplicate or contradict it:
- the H1 title (`# MissionHub Network Rules` / `# Règles du réseau MissionHub` / `# Regras da rede MissionHub`): the page already has its own `h1`, and the rules sections must start at `h2` (spec §6);
- the status line (`**Version:** v1 — draft · **Effective date:** …`, fr `**Version :** …`, pt `**Versão:** …`): the label and the effective date come from the published record.

The one-sentence tagline under the title and the "Introduction" section stay.

---

## 2. Before you start (stop if any answer is no)

1. **Approval is recorded.** The founder and counsel approved this exact text, with a date. Write it down in the form the admin will paste into **Approval reference**, for example "Founder and counsel approval, Dec 1, 2026".
2. **Counsel's ⚖️ items are closed in the source.** For each `<!-- ⚖️ counsel: … -->`, counsel's change is in the text, and the comment was deleted or replaced by `<!-- counsel approved YYYY-MM-DD: … -->`. The header's `LEGAL.` line no longer contains ⚖️. Check:
   ```sh
   grep -n '⚖️' docs/content/network-rules/{en,fr-CA,pt-BR}.md   # must print nothing
   ```
3. **Every `[TODO` outside a block you're removing is filled** in all three files, with the same value (effective date, pricing reference, 7.5 values, support address if P0-3 hasn't shipped, 10.6).
4. **The three files have the same rule numbers** and the same meaning. A native reader checked fr-CA and pt-BR against en after counsel's changes.
5. **Promises that aren't wrapped in a marker are true on the publish date.** These sentences describe the product but have no marker. Confirm each one with the PM; if one isn't true yet, stop and have it wrapped in a `ships with` marker in all three files first (PD-055 item 6):

   | Rule | Sentence | True when |
   |---|---|---|
   | 1.1, 10.1–10.3 | versioned acceptance, blocking new partner activity | N10 (P0-2) is live |
   | 9.1 level 2, 9.4, 9.5 | network hold, immediate hold, obligations continue during a suspension | N10 (P0-3, settlement mode) is live |
   | 4.5 | "Only platform admins see it" (the end client) | N3 client-name prerequisite is live |
   | 6.6 | "Late payouts show in your record." | X9 / RD-007 is live. **Not wrapped today**: PD-055 recommends a `ships with X9` marker. Founder's call. |
   | 8.4 | "We aim to respond to a report within 2 business days" | staffing is in place (launch checklist) |

6. **Fill the mechanism table** below. The PM confirms each line on the publish date.

   | Tag in the files | Mechanism | Shipped on the publish date? |
   |---|---|---|
   | `N5` | Verified badge (1.6) | yes / no |
   | `access expiry (after N3)` | shared-profile access expiry (2.6) | yes / no |
   | `P1-5` | 30-day job confirmation (4.6) | yes / no |
   | `P0-3` | "Report a problem" (8.1) — part of N10 | yes / no |

   If a tag appears in the files that isn't in this table, stop and add it.

---

## 3. Steps

Work in a copy. `LABEL` is the version label (for example `1.0`).

1. **Copy** the three source files to `docs/content/network-rules/publish/LABEL/`.
2. **Apply the mechanism table** to each copy, tag by tag:
   - shipped: keep the inner text, remove both markers;
   - not shipped: remove both markers and the inner text;
   - `until P0-3 ships` blocks: the reverse of `P0-3`.
3. **Remove every remaining HTML comment**, including multi-line ones, and the spaces before inline comments.
4. **Remove the H1 line and the status line** (§1).
5. **Clean whitespace:** no trailing spaces, never more than one blank line in a row, no blank lines at the start, exactly one newline at the end. LF line endings, UTF-8 without BOM.
6. **fr-CA typography only:** no-break space (U+00A0) before `:`, after `«` and before `»`, and between a number and `%` (README "Language notes"). No space before `?`, `!` or `;`. Leave apostrophes as they are (`’`).
7. **Run the checks in §4.** If any fails, delete the copies, fix the **source**, and start again from step 1. Never hand-edit a publish copy: it would drift from the approved source.
8. **Read each copy once, start to end**, as a member would. Look hardest at the places where text was removed (1.6, 2.6, 4.6, 8.1): the sentence must still be complete and read naturally in each language.
9. **Compute the fingerprints** and write them down:
   ```sh
   shasum -a 256 docs/content/network-rules/publish/LABEL/*.md
   ```
10. **Hand over** to the platform admin who will publish: the three files, the approval reference, the change summaries (none for the first version; required for every later one, written in all three languages), and the fingerprints. After publishing, the admin checks that the SHA-256 shown for each locale in `/admin/network-rules` equals the value from step 9. If one differs, the text changed on the way (see the note on line endings below): don't announce the version, and tell the backend.
11. **Record it** in `README.md` under a "Published versions" heading: label, publish date, approval reference, the mechanism table used, and the three fingerprints.

### Reference commands (step 2 to step 6)

A sketch to make the steps repeatable. Read it before you run it, and still do the checks and the reading in §4 and step 8. Set `SHIPPED` and `NOT_SHIPPED` from the mechanism table.

```sh
LABEL=1.0
OUT=docs/content/network-rules/publish/$LABEL
mkdir -p "$OUT"
SHIPPED='P0-3'                                   # tags that have shipped, separated by |
NOT_SHIPPED='N5|access expiry (after N3)|P1-5'   # tags that haven't

for f in en fr-CA pt-BR; do
  SHIPPED="$SHIPPED" NOT_SHIPPED="$NOT_SHIPPED" LOCALE="$f" \
  perl -CSD -Mutf8 -0777 -pe '
    for my $t (split /\|/, $ENV{SHIPPED}) {
      s/<!-- ships with \Q$t\E -->(.*?)<!-- \/ships with \Q$t\E -->/$1/gs;
      s/<!-- until \Q$t\E ships -->.*?<!-- \/until \Q$t\E ships -->//gs;
    }
    for my $t (split /\|/, $ENV{NOT_SHIPPED}) {
      s/<!-- ships with \Q$t\E -->.*?<!-- \/ships with \Q$t\E -->//gs;
      s/<!-- until \Q$t\E ships -->(.*?)<!-- \/until \Q$t\E ships -->/$1/gs;
    }
    s/[ \t]*<!--.*?-->//gs;                        # every other comment
    s/^# [^\n]*\n//m;                              # H1
    s/^\*\*Vers(?:ion|ão) ?:\*\*[^\n]*\n//m;       # status line (en, fr, pt)
    s/[ \t]+$//mg;                                 # trailing spaces
    s/\n{3,}/\n\n/g;                               # one blank line at most
    s/\A\n+//;                                     # no leading blank lines
    s/\n*\z/\n/;                                   # one final newline
    if ($ENV{LOCALE} eq "fr-CA") {
      s/ :/\x{00A0}:/g; s/« /«\x{00A0}/g; s/ »/\x{00A0}»/g; s/(\d) %/$1\x{00A0}%/g;
    }
  ' "docs/content/network-rules/$f.md" > "$OUT/$f.md"
done
```

The header comment mentions the markers as `<!- - ships with X - ->` (with spaces) on purpose, so the patterns above don't match inside it; it's removed whole by the "every other comment" line.

---

## 4. Checks: refuse to produce a publish copy if any fails

Run on the three files in `publish/LABEL/`. Every command must print nothing (or, for the last two, show no difference).

```sh
OUT=docs/content/network-rules/publish/LABEL

# 1. No markers or placeholders left (the same list the publish form refuses, plus our tags)
grep -nE '<!--|-->|\[TODO|\[placeholder|⚖️|ships with|until P0-3' "$OUT"/*.md

# 2. No unresolved counsel item in the source either (comments were stripped, so check the source)
grep -n '⚖️' docs/content/network-rules/{en,fr-CA,pt-BR}.md

# 3. No leftovers from removed text: double spaces, a space before punctuation (en, pt), an empty bold
grep -nE '[^ ]  +[^ ]| [.,](\s|$)|\*\*\*\*' "$OUT"/en.md "$OUT"/pt-BR.md
grep -nE '[^ ]  +[^ ]| [.,](\s|$)|\*\*\*\*' "$OUT"/fr-CA.md

# 4. Same rule numbers in all three files
for f in en fr-CA pt-BR; do grep -oE '^\*\*[0-9]+\.[0-9]+\*\*' "$OUT/$f.md" > "/tmp/rules-$f.txt"; done
diff /tmp/rules-en.txt /tmp/rules-fr-CA.txt && diff /tmp/rules-en.txt /tmp/rules-pt-BR.txt

# 5. Same section structure: Introduction + sections 1 to 10, as h2
for f in en fr-CA pt-BR; do grep -c '^## ' "$OUT/$f.md"; done   # each must print 11
```

If check 1 or 2 finds anything, the text isn't approved or isn't complete. Don't work around it by editing the copy. Fix the source with the owner (counsel for ⚖️, the founder or PM for `[TODO]` values and mechanism status), then start again.

---

## 5. Notes for the team

- **Line endings and the fingerprint.** A browser `<textarea>` submits line breaks as CRLF. If the server hashes the pasted text as received, the SHA-256 won't match step 9, and members' acceptance records would point to a hash nobody can reproduce from the file. The backend should normalize CRLF to LF before storing and hashing (or the form should accept a file upload). Until that's confirmed, step 10's comparison is mandatory.
- **The acceptance summary** (U-N10-4, about 150 words, "not part of the rules") isn't produced here. It's a separate text that counsel must clear, and it isn't part of the hashed rules.
- **Later versions:** same procedure. The change summary is required in all three languages, and the type (material, minor, required by law) follows the admin form's rules (spec §2.4).
- **Rule 9.6 wording (optional, PD-058):** if the founder and counsel want it to cover "a sanction or a breach finding", change it in the source before step 1, in all three files.
