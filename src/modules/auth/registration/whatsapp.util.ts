/**
 * Builds a single normalized WhatsApp identifier for storage/search.
 * Accepts E.164-style country codes (e.g. +1) and strips non-digits from the local number.
 */
export function buildNormalizedWhatsappNumber(
  whatsappCountryCode: string,
  whatsappNumber: string,
): string {
  const cc = whatsappCountryCode.trim();
  const digitsCc = cc.replace(/\D/g, '');
  const digitsLocal = whatsappNumber.replace(/\D/g, '');
  return `+${digitsCc}${digitsLocal}`;
}
