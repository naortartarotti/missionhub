import "server-only";

/**
 * One branded layout for every MissionHub email (auth, invitations, candidate requests).
 * Table-based with inline styles so it renders in Gmail, Outlook and Apple Mail; every
 * template also gets a plain-text version. All dynamic text is escaped here.
 */
export type EmailContent = {
  /** Hidden preview line shown by inboxes next to the subject. */
  preheader?: string;
  heading: string;
  paragraphs: string[];
  /** Key facts in a soft box (e.g. role, company, expiry). */
  details?: { label: string; value: string }[];
  /** One-time code shown large (reauthentication). */
  code?: { label: string; value: string };
  /** Quoted text from a person (e.g. the recruiter's note). */
  quote?: { label: string; text: string };
  cta?: { label: string; url: string };
  /** Small print under the button: expiry, "ignore if this wasn't you". */
  note?: string;
  /** Localized chrome. */
  chrome: { linkFallback: string; footer: string };
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const para = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#111111";
const MUTED = "#666666";
const SOFT = "#f4f4f5";
const BRAND = "#f6d365";

const logo = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:22px;height:20px;background:${BRAND};border-radius:10px"></td>
<td style="width:22px;height:20px;background:${INK};border-radius:10px;position:relative;left:-6px"></td>
<td style="padding-left:6px;font:600 17px ${FONT};color:${INK};letter-spacing:-0.2px">MissionHub</td>
</tr></table>`;

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${SOFT};border-radius:14px">
${c.details
  .map(
    (d, i) => `<tr><td style="padding:${i === 0 ? 14 : 6}px 16px ${i === c.details!.length - 1 ? 14 : 6}px;font:13px ${FONT};color:${MUTED};width:38%;vertical-align:top">${escapeHtml(d.label)}</td>
<td style="padding:${i === 0 ? 14 : 6}px 16px ${i === c.details!.length - 1 ? 14 : 6}px;font:600 14px ${FONT};color:${INK};vertical-align:top">${escapeHtml(d.value)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : "";
  const code = c.code
    ? `<p style="margin:0 0 6px;font:13px ${FONT};color:${MUTED}">${escapeHtml(c.code.label)}</p>
<p style="margin:0 0 24px;font:700 32px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:8px;color:${INK}">${escapeHtml(c.code.value)}</p>`
    : "";
  const quote = c.quote
    ? `<p style="margin:0 0 6px;font:13px ${FONT};color:${MUTED}">${escapeHtml(c.quote.label)}</p>
<p style="margin:0 0 24px;padding:12px 16px;border-left:3px solid ${BRAND};background:${SOFT};border-radius:0 12px 12px 0;font:14px/1.5 ${FONT};color:${INK}">${para(c.quote.text)}</p>`
    : "";
  const cta = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px"><tr><td style="background:${INK};border-radius:999px">
<a href="${escapeHtml(c.cta.url)}" style="display:inline-block;padding:13px 24px;font:600 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(c.cta.label)}</a>
</td></tr></table>`
    : "";
  const note = c.note ? `<p style="margin:0 0 16px;font:13px/1.5 ${FONT};color:${MUTED}">${para(c.note)}</p>` : "";
  const fallback = c.cta
    ? `<p style="margin:0;font:12px/1.5 ${FONT};color:${MUTED}">${escapeHtml(c.chrome.linkFallback)}<br><a href="${escapeHtml(c.cta.url)}" style="color:${MUTED};word-break:break-all">${escapeHtml(c.cta.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f7">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(c.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px">${logo}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #ececee;border-radius:20px;overflow:hidden">
<div style="height:6px;background:linear-gradient(90deg,#cfe0f3,#e6dcf5,${BRAND})"></div>
<div style="padding:32px 32px 28px">
<h1 style="margin:0 0 16px;font:600 22px/1.3 ${FONT};color:${INK};letter-spacing:-0.3px">${escapeHtml(c.heading)}</h1>
${c.paragraphs.map((p) => `<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:#333333">${para(p)}</p>`).join("\n")}
${details}${code}${quote}${cta}${note}${fallback}
</div></td></tr>
<tr><td style="padding:20px 8px 0;font:12px/1.5 ${FONT};color:#8a8a8f;text-align:center">${escapeHtml(c.chrome.footer)}<br>MissionHub</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.details?.length ? [...c.details.map((d) => `${d.label}: ${d.value}`), ""] : []),
    ...(c.code ? [`${c.code.label}: ${c.code.value}`, ""] : []),
    ...(c.quote ? [`${c.quote.label}:`, c.quote.text, ""] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ""] : []),
    ...(c.note ? [c.note, ""] : []),
    "—",
    c.chrome.footer,
  ].join("\n");
  return { html, text };
}
