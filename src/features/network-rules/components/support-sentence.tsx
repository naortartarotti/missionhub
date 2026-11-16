/**
 * "…Before {support} …After" sentences (spec §5.0): the support address is data, never translated,
 * and becomes a mailto link. Without a configured address the `…NoSupport` variant is used, or the
 * whole line is hidden when there is none (`noSupport` omitted).
 */
export function SupportSentence({ before, after, noSupport, email, className }: { before: string; after: string; noSupport?: string; email: string | null; className?: string }) {
  if (!email) return noSupport ? <span className={className}>{noSupport}</span> : null;
  return (
    <span className={className}>
      {before}{" "}
      <a href={`mailto:${email}`} className="font-medium underline underline-offset-4">
        {email}
      </a>
      {after.startsWith(".") || after.startsWith(",") ? "" : " "}
      {after}
    </span>
  );
}
