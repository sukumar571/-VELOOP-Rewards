/**
 * ============================================================================
 * FRAUD RISK ENGINE — pure decision logic (DB-free).
 * ============================================================================
 * The one invariant that must hold by construction, not by configuration:
 * a single device OR ip velocity signal is NEVER conclusive on its own — it can
 * only FLAG. A REJECT always needs corroboration from a distinct, non-velocity
 * category. These tests pin that down without touching MongoDB.
 * ========================================================================= */
const { classifySignals, crosses } = require('../../src/services/fraud.service.js');
const { FRAUD_EVENT_TYPE, RISK_DECISION } = require('../../src/config/constants.js');

const sig = (type, severity = 'MEDIUM') => ({ type, severity });

describe('fraud.crosses', () => {
  it('is true only when a finite observed value reaches a finite threshold', () => {
    expect(crosses(5, 5)).toBe(true);
    expect(crosses(4, 5)).toBe(false);
    expect(crosses(undefined, 5)).toBe(false);
    expect(crosses(5, undefined)).toBe(false);
  });
});

describe('fraud.classifySignals — decision core', () => {
  it('allows when there is no signal at all', () => {
    expect(classifySignals({ signals: [] })).toBe(RISK_DECISION.ALLOW);
  });

  it('a lone device velocity can only FLAG, never REJECT', () => {
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.DEVICE_VELOCITY, 'HIGH')] }))
      .toBe(RISK_DECISION.FLAG_FOR_REVIEW);
  });

  it('a lone ip velocity can only FLAG, never REJECT', () => {
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.IP_VELOCITY)] }))
      .toBe(RISK_DECISION.FLAG_FOR_REVIEW);
  });

  it('device + ip (both velocity, no corroboration) is still only a FLAG', () => {
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.DEVICE_VELOCITY, 'HIGH'), sig(FRAUD_EVENT_TYPE.IP_VELOCITY)] }))
      .toBe(RISK_DECISION.FLAG_FOR_REVIEW);
  });

  it('device velocity corroborated by a repeated-failure pattern is a REJECT', () => {
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.DEVICE_VELOCITY, 'HIGH'), sig(FRAUD_EVENT_TYPE.REPEATED_FAILURE)] }))
      .toBe(RISK_DECISION.REJECT);
  });

  it('two distinct non-velocity patterns meet the corroborated-reject bar', () => {
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.REPEATED_FAILURE), sig(FRAUD_EVENT_TYPE.PARTICIPATION_VELOCITY)] }))
      .toBe(RISK_DECISION.REJECT);
  });

  it('respects the configured rejectMinSignals (3 distinct still FLAGs at min 3 when only 2 present)', () => {
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.REPEATED_FAILURE), sig(FRAUD_EVENT_TYPE.PARTICIPATION_VELOCITY)], rejectMinSignals: 3 }))
      .toBe(RISK_DECISION.FLAG_FOR_REVIEW);
  });

  it('a duplicate category counts once toward distinct corroboration', () => {
    // Two DEVICE_VELOCITY objects are one category -> still just a FLAG.
    expect(classifySignals({ signals: [sig(FRAUD_EVENT_TYPE.DEVICE_VELOCITY, 'HIGH'), sig(FRAUD_EVENT_TYPE.DEVICE_VELOCITY, 'HIGH')] }))
      .toBe(RISK_DECISION.FLAG_FOR_REVIEW);
  });
});
