/**
 * Turns an owner-console fetch's response status + parsed body into a message
 * safe to show the user. Pure: no fetching, no state — callers parse the body
 * with `res.json().catch(() => ({}))` first so a non-JSON error page (or an
 * empty body) never throws here.
 */
export function ownerRequestError(status: number, body: { code?: string; error?: string } | null | undefined): string {
  if (status === 503 && body?.code === 'ADMIN_UNCONFIGURED') {
    return body?.error || 'Owner access is not configured on this server.';
  }
  if (status === 401) {
    return 'Owner access required.';
  }
  return `Request failed (HTTP ${status}).`;
}
