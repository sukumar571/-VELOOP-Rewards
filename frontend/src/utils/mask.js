/**
 * Defensive PII-masking helpers.
 *
 * Business rule: public winner records must NEVER show full emails, phone
 * numbers or addresses. Mock data already stores masked values only; these
 * helpers are applied again in the service layer so that a future real API
 * response containing raw PII is still rendered safely by this frontend.
 */

/** "arjun.kumar@gmail.com" → "aru••••@•••.com" (never length-preserving). */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const [local = '', domain = ''] = email.split('@');
  const head = local.slice(0, 3);
  const tld = domain.includes('.') ? domain.split('.').pop() : '';
  return `${head}••••@•••.${tld}`;
}

/** "+91 98765 43210" → "••••• ••710" style: last 2 digits max. */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  const tail = digits.slice(-2);
  return `•••••${tail}`;
}

/** "Arjun Kumar" → "A•••• K••" (initial + bullet mask per token). */
export function maskName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .split(/\s+/)
    .map((part) => `${part[0]}••`)
    .join(' ');
}

/** Raw address → never rendered; returns a fixed redaction marker. */
export function redactAddress() {
  return '••• ••••••';
}

/** Apply masking pass to a winner record (idempotent for already-masked data). */
export function maskWinnerRecord(w) {
  return {
    ...w,
    maskedUserId: w.maskedUserId ?? 'VU-••••-••••',
    displayAlias: w.displayAlias ?? 'V••••',
    // Drop any unexpected PII fields that a real API might include.
    email: undefined,
    phone: undefined,
    address: undefined,
  };
}
