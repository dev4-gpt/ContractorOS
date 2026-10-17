import { describe, it, expect } from 'vitest';
import { ownerRequestError } from './ownerRequestError';

describe('ownerRequestError', () => {
  it('shows the server error text on 503 ADMIN_UNCONFIGURED', () => {
    expect(ownerRequestError(503, { code: 'ADMIN_UNCONFIGURED', error: 'Owner access is not configured on this server.' })).toBe(
      'Owner access is not configured on this server.'
    );
  });

  it('falls back to a generic message on 503 ADMIN_UNCONFIGURED with no error text', () => {
    expect(ownerRequestError(503, { code: 'ADMIN_UNCONFIGURED' })).toBe('Owner access is not configured on this server.');
  });

  it('shows "Owner access required." on 401', () => {
    expect(ownerRequestError(401, {})).toBe('Owner access required.');
    expect(ownerRequestError(401, { error: 'ignored' })).toBe('Owner access required.');
  });

  it('shows a generic HTTP status message for any other failure', () => {
    expect(ownerRequestError(500, {})).toBe('Request failed (HTTP 500).');
    expect(ownerRequestError(404, null)).toBe('Request failed (HTTP 404).');
    expect(ownerRequestError(503, { code: 'SOMETHING_ELSE' })).toBe('Request failed (HTTP 503).');
  });

  it('handles a missing body', () => {
    expect(ownerRequestError(500, undefined)).toBe('Request failed (HTTP 500).');
  });
});
