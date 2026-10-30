/**
 * ============================================================================
 * CLAIM FIELD SCHEMA — required fulfilment info, driven by prize deliveryMode.
 * ============================================================================
 * The form renders ONLY from this structured schema, chosen generically from the
 * prize type's deliveryMode ('physical' | 'digital') — never from the prize name.
 *   • Physical prizes request exactly: full name, phone, address, city, state, PIN.
 *   • Gift-card / digital prizes request ONLY a delivery email and never an address.
 * validateClaimFields() is a client-side UX convenience; the claim API re-validates
 * authoritatively, so a tampered client cannot bypass these requirements.
 * ========================================================================= */

const REQUIRED = (label) => `${label} is required.`;

export const CLAIM_FIELDS = {
  physical: [
    {
      name: 'fullName',
      label: 'Full name',
      type: 'text',
      required: true,
      autoComplete: 'name',
      maxLength: 120,
      validate: (v) => (v.trim().length >= 2 ? '' : REQUIRED('Full name')),
    },
    {
      name: 'phone',
      label: 'Phone number',
      type: 'tel',
      required: true,
      autoComplete: 'tel',
      inputMode: 'numeric',
      maxLength: 16,
      hint: 'Include your country code if outside India.',
      // Basic format sanity only; the server is authoritative.
      validate: (v) =>
        /^\+?[\d\s-]{7,16}$/.test(v.trim()) ? '' : 'Enter a valid phone number.',
    },
    {
      name: 'address',
      label: 'Address',
      type: 'textarea',
      required: true,
      autoComplete: 'street-address',
      maxLength: 400,
      validate: (v) => (v.trim().length >= 6 ? '' : REQUIRED('Address')),
    },
    {
      name: 'city',
      label: 'City',
      type: 'text',
      required: true,
      autoComplete: 'address-level2',
      maxLength: 80,
      validate: (v) => (v.trim().length >= 2 ? '' : REQUIRED('City')),
    },
    {
      name: 'state',
      label: 'State',
      type: 'text',
      required: true,
      autoComplete: 'address-level1',
      maxLength: 80,
      validate: (v) => (v.trim().length >= 2 ? '' : REQUIRED('State')),
    },
    {
      name: 'pin',
      label: 'PIN code',
      type: 'text',
      required: true,
      autoComplete: 'postal-code',
      inputMode: 'numeric',
      maxLength: 6,
      // Basic 6-digit sanity for Indian PIN codes; server re-validates.
      validate: (v) => (/^\d{6}$/.test(v.trim()) ? '' : 'Enter a valid 6-digit PIN code.'),
    },
  ],
  digital: [
    {
      name: 'deliveryEmail',
      label: 'Delivery email',
      type: 'email',
      required: true,
      autoComplete: 'email',
      maxLength: 254,
      hint: 'Your gift-card code is sent to this email — no physical address is needed.',
      validate: (v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address.',
    },
  ],
};

/** Fields for a delivery mode (empty for unknown modes so nothing is invented). */
export function getClaimFields(deliveryMode) {
  return CLAIM_FIELDS[deliveryMode] ?? [];
}

/** Names only — used to persist exactly the required values (never extra). */
export function getFieldNames(deliveryMode) {
  return getClaimFields(deliveryMode).map((f) => f.name);
}

/**
 * Client-side validation pass. Returns a map of { fieldName: message } (empty
 * when valid). This mirrors the schema so the UI can give instant feedback; the
 * authoritative validation lives in the (mock) claim API.
 */
export function validateClaimFields(deliveryMode, values = {}) {
  const errors = {};
  for (const field of getClaimFields(deliveryMode)) {
    const raw = values[field.name];
    const v = raw == null ? '' : String(raw);
    if (field.required && v.trim() === '') {
      errors[field.name] = REQUIRED(field.label);
      continue;
    }
    if (v.trim() !== '' && field.validate) {
      const msg = field.validate(v);
      if (msg) errors[field.name] = msg;
    }
  }
  return errors;
}

/** Keep only the schema's fields from an arbitrary client payload. */
export function pickClaimFields(deliveryMode, values = {}) {
  const clean = {};
  for (const name of getFieldNames(deliveryMode)) {
    clean[name] = values[name] == null ? '' : String(values[name]).trim();
  }
  return clean;
}

/**
 * Serializable render metadata for a set of schema fields — the validate()
 * functions are intentionally stripped so field descriptors can be returned
 * across the (mock) API boundary and cloned safely. The UI renders from these;
 * the authoritative validation still runs via validateClaimFields() in the API.
 */
export function publicFieldViews(fields) {
  return fields.map((f) => ({
    name: f.name,
    label: f.label,
    type: f.type,
    required: !!f.required,
    autoComplete: f.autoComplete,
    inputMode: f.inputMode,
    hint: f.hint,
    maxLength: f.maxLength,
  }));
}

