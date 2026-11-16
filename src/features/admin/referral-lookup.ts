const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** S10 lookup: the referral id from a pasted referral link (`…/referrals/<id>…`) or a bare id; null otherwise. */
export function referralIdFrom(input: string): string | null {
  const s = input.trim();
  const inPath = /\/referrals\/([0-9a-f-]{36})/i.exec(s)?.[1];
  const id = inPath && UUID.test(inPath) ? inPath : UUID.exec(s)?.[0];
  return id ? id.toLowerCase() : null;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
