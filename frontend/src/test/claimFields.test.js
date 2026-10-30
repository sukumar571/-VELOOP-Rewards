import { describe, it, expect } from 'vitest';
import {
  getClaimFields,
  validateClaimFields,
  pickClaimFields,
} from '../config/claimFields.js';

const names = (mode) => getClaimFields(mode).map((f) => f.name);

describe('claim field schema (physical vs gift-card)', () => {
  it('physical prizes request exactly the fulfilment fields', () => {
    expect(names('physical')).toEqual([
      'fullName',
      'phone',
      'address',
      'city',
      'state',
      'pin',
    ]);
  });

  it('gift-card prizes request ONLY the delivery email', () => {
    expect(names('digital')).toEqual(['deliveryEmail']);
  });

  it('a gift-card never asks for a physical address', () => {
    expect(names('digital')).not.toContain('address');
    expect(names('digital')).not.toContain('pin');
  });

  it('a physical prize never asks for a delivery email', () => {
    expect(names('physical')).not.toContain('deliveryEmail');
  });

  it('unknown delivery modes request nothing (never invented)', () => {
    expect(names('mystery')).toEqual([]);
  });
});

describe('validateClaimFields', () => {
  it('flags every required physical field when empty', () => {
    const errs = validateClaimFields('physical', {});
    expect(Object.keys(errs).sort()).toEqual(
      ['address', 'city', 'fullName', 'phone', 'pin', 'state'].sort(),
    );
  });

  it('accepts a fully valid physical payload', () => {
    const errs = validateClaimFields('physical', {
      fullName: 'Asha Kumar',
      phone: '9876543210',
      address: '12 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pin: '411001',
    });
    expect(errs).toEqual({});
  });

  it('rejects a malformed PIN and email', () => {
    expect(validateClaimFields('physical', { pin: '12' })).toHaveProperty('pin');
    expect(validateClaimFields('digital', { deliveryEmail: 'nope' })).toHaveProperty(
      'deliveryEmail',
    );
  });

  it('requires a valid email for a gift card', () => {
    expect(validateClaimFields('digital', { deliveryEmail: 'a@b.com' })).toEqual({});
  });
});

describe('pickClaimFields', () => {
  it('keeps only schema fields and trims values (drops stray client keys)', () => {
    const picked = pickClaimFields('digital', {
      deliveryEmail: '  a@b.com  ',
      status: 'COMPLETED', // a tampered client value
      address: 'should be dropped',
    });
    expect(picked).toEqual({ deliveryEmail: 'a@b.com' });
  });
});
