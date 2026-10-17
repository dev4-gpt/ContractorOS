import { describe, it, expect } from 'vitest';
import { isBelowFold } from './motion';

describe('isBelowFold', () => {
  it('returns false when the element top is above the viewport', () => {
    expect(isBelowFold(-10, 800)).toBe(false);
  });

  it('returns false when the element top is within the viewport', () => {
    expect(isBelowFold(400, 800)).toBe(false);
  });

  it('returns true when the element top is exactly at the fold', () => {
    expect(isBelowFold(800, 800)).toBe(true);
  });

  it('returns true when the element top is below the fold', () => {
    expect(isBelowFold(950, 800)).toBe(true);
  });
});
