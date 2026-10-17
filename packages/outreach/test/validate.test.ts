import { describe, expect, it } from 'vitest';
import { ValidationError, validateProspect } from '../src/validate.js';
import { domainOf, identitiesOf, identityFromInput, phoneKey } from '../src/identity.js';

describe('validateProspect', () => {
  const ok = { name: 'A B', email: 'a@b.example', sourceOfDetails: 'https://b.example' };

  it('accepts the minimum: a name, one contact route and where the facts came from', () => {
    expect(validateProspect(ok).name).toBe('A B');
  });

  it('gives the same id for the same business', () => {
    expect(validateProspect(ok).id).toBe(validateProspect({ ...ok }).id);
  });

  it('requires a source for the details, so every fact is traceable', () => {
    expect(() => validateProspect({ name: 'A', email: 'a@b.example' })).toThrow(/sourceOfDetails is required/);
  });

  it('requires at least one contact route', () => {
    expect(() => validateProspect({ name: 'A', sourceOfDetails: 'x' })).toThrow(/at least one of website, email or phone/);
  });

  it('rejects bad emails, phones, colors and non-http websites', () => {
    const bad = (extra: object) => () => validateProspect({ ...ok, ...extra });
    expect(bad({ email: 'nope' })).toThrow(ValidationError);
    expect(bad({ phone: 'call me' })).toThrow(ValidationError);
    expect(bad({ accentColor: 'blue' })).toThrow(ValidationError);
    expect(bad({ website: 'ftp://x.example' })).toThrow(/http or https/);
  });

  it('rejects control characters and oversized lists', () => {
    expect(() => validateProspect({ ...ok, name: 'A\u0000B' })).toThrow(/control characters/);
    expect(() => validateProspect({ ...ok, services: Array(9).fill('x') })).toThrow(/at most 8/);
  });
});

describe('identity matching', () => {
  it('matches the same domain however it is written', () => {
    expect(domainOf('https://www.Example.com/about')).toBe('example.com');
    expect(domainOf('example.com')).toBe('example.com');
    expect(domainOf('localhost')).toBeNull();
  });

  it('matches phones across formats and ignores too-short numbers', () => {
    expect(phoneKey('+1 (555) 010-0000')).toBe(phoneKey('555.010.0000'));
    expect(phoneKey('12')).toBeNull();
  });

  it('turns CLI input into an identity', () => {
    expect(identityFromInput('Owner@Shop.example')).toBe('email:owner@shop.example');
    expect(identityFromInput('www.shop.example')).toBe('domain:shop.example');
    expect(identityFromInput('555 010 0000')).toBe('phone:5550100000');
    expect(identitiesOf({ website: 'https://shop.example', email: 'a@shop.example' })).toEqual(['domain:shop.example', 'email:a@shop.example']);
  });
});
