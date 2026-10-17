import { describe, it, expect } from 'vitest';
import { parsePlanParam } from './planParam';

describe('parsePlanParam', () => {
  it.each([
    ['?plan=starter', 'starter'],
    ['?plan=pro', 'pro'],
    ['?utm_source=x&plan=enterprise', 'enterprise']
  ])('reads %s', (search, expected) => {
    expect(parsePlanParam(search)).toBe(expected);
  });

  it.each(['', '?plan=gold', '?plan=', '?other=pro'])('ignores %j', (search) => {
    expect(parsePlanParam(search)).toBeNull();
  });
});
