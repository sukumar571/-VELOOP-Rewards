/**
 * ============================================================================
 * CLAIM STATUS — the documented API enum set + display metadata.
 * ============================================================================
 * These five values are the authoritative, consistent claim states used by the
 * (future) backend. Both the service and the UI reference them by these exact
 * string codes, so a real API returning the same enums needs no UI change.
 * Semantics are generic prize-claim lifecycle states; any VELOOP-specific
 * transition timing is [PDF]/backend-pending and NOT asserted here.
 * ========================================================================= */

export const CLAIM_STATUS = {
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  SUBMITTED: 'SUBMITTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
};

/**
 * Presentation metadata for each status. `tone` maps to a ClaimStatusIndicator
 * style; `actionable` marks the only state in which a winner may submit a claim
 * (the server still re-checks deadline + ownership before accepting).
 */
export const CLAIM_STATUS_META = {
  [CLAIM_STATUS.NOT_SUBMITTED]: { label: 'Not submitted', tone: 'neutral', actionable: true },
  [CLAIM_STATUS.SUBMITTED]: { label: 'Submitted', tone: 'info', actionable: false },
  [CLAIM_STATUS.PROCESSING]: { label: 'Processing', tone: 'info', actionable: false },
  [CLAIM_STATUS.COMPLETED]: { label: 'Completed', tone: 'success', actionable: false },
  [CLAIM_STATUS.EXPIRED]: { label: 'Expired', tone: 'error', actionable: false },
};

export function statusMeta(status) {
  return (
    CLAIM_STATUS_META[status] ?? {
      label: String(status ?? 'Unknown'),
      tone: 'neutral',
      actionable: false,
    }
  );
}
