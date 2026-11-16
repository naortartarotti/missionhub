/**
 * TS mirror of `app.client_key()` (N1 BR-23, 20261113000300_presentation_core.sql): lowercase, accents
 * stripped, punctuation dropped, whitespace collapsed, trailing legal forms removed. Placeholder names
 * ("Confidential", "N/A", "TBD", …) give no key (null).
 *
 * N3 BR-1 uses it to refuse opening a job to partners without a real client name before anything is
 * saved. The database is the authority (trigger `jobs_open_client_name`, `app.job_partner_visible`);
 * an integration test checks this mirror against the SQL function.
 */
const LEGAL = new Set(["inc", "incorporated", "ltd", "limited", "ltee", "corp", "corporation", "co", "llc", "llp", "lp", "senc", "enr", "sa", "sas", "gmbh", "plc"]);
const PLACEHOLDERS = new Set([
  "", "confidential", "confidentiel", "confidentielle", "confidencial", "undisclosed", "stealth", "client", "na", "tbd",
  "confidentialclient", "clientconfidential", "clientconfidentiel", "clientconfidentielle", "clienteconfidencial",
  "undisclosedclient", "stealthstartup", "cliente",
]);
const FROM = "àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöøōőùúûüūůűýÿžźżśšłđ";
const TO = "aaaaaaaaacccdeeeeeeeeiiiiiinnnoooooooouuuuuuuyyzzzssld";

export function clientKey(name: string | null | undefined): string | null {
  let v = (name ?? "").trim().toLowerCase();
  v = v.replaceAll("ß", "ss").replaceAll("æ", "ae").replaceAll("œ", "oe").replaceAll("&", " ");
  v = [...v].map((ch) => {
    const i = FROM.indexOf(ch);
    return i >= 0 ? TO[i] : ch;
  }).join("");
  v = v.replace(/[.'’]/g, "");
  v = v.replace(/[^a-z0-9]+/g, " ");
  v = v.replace(/\s+/g, " ").trim();
  if (PLACEHOLDERS.has(v.replaceAll(" ", ""))) return null;
  const toks = v.split(" ");
  while (toks.length > 1 && LEGAL.has(toks[toks.length - 1])) toks.pop();
  v = toks.join(" ");
  if (PLACEHOLDERS.has(v.replaceAll(" ", ""))) return null;
  return v;
}
