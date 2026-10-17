/// <reference types="vite/client" />

/**
 * Build-time configuration. Vite inlines these into the bundle, so they must be
 * set when the build runs (locally, in Docker, or in the Vercel project), not at
 * runtime.
 */
interface ImportMetaEnv {
  /**
   * Public origin of the orchestrator, e.g. https://api.stratosgtm.example.
   * Leave unset in development so requests fall through to the Vite dev proxy.
   */
  readonly VITE_ORCHESTRATOR_URL?: string;
  /** Bearer key for gated orchestrator routes, when ORCHESTRATOR_API_KEY is set. */
  readonly VITE_ORCHESTRATOR_API_KEY?: string;
  /** Neon Auth (managed Better Auth) base URL; sign-in is hidden when unset. */
  readonly VITE_NEON_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
