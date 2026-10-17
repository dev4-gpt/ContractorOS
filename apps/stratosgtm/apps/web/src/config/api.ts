/**
 * Where the orchestrator lives.
 *
 * In development this stays empty so requests hit the Vite dev-server proxy
 * (see vite.config.ts, which forwards /api and /ws to localhost:4000). In a
 * deployed build there is no proxy, so VITE_ORCHESTRATOR_URL must point at the
 * orchestrator's public origin or every call 404s against the static host.
 *
 * Vite inlines this at build time, so the value must be present when the bundle
 * is built, not when it runs.
 */
const configured = (import.meta.env.VITE_ORCHESTRATOR_URL || '').trim();

/** Base origin for HTTP calls. Empty string means same-origin (dev proxy). */
export const API_BASE = configured.replace(/\/+$/, '');

/** Builds an absolute orchestrator URL for a path like `/api/voice/token`. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Builds a WebSocket URL for a path like `/ws/telemetry`, matching the page's
 * security scheme so an https page never opens an insecure socket.
 */
export function wsUrl(path: string): string {
  if (API_BASE) {
    return `${API_BASE.replace(/^http/, 'ws')}${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
