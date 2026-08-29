/// <reference types="vite/client" />

/**
 * Build-time configuration. Vite only exposes variables prefixed `VITE_`, and
 * every one of them is inlined into the client bundle — so nothing secret may
 * live here. See `.env.example` and `src/config.ts`.
 */
interface ImportMetaEnv {
  /** Which backend the app talks to. Defaults to `mock`. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase'
  /** Artificial delay on mock calls, in ms, for exercising loading states. */
  readonly VITE_MOCK_LATENCY_MS?: string
  /** Fraction of mock calls that fail (0–1), for exercising error states. */
  readonly VITE_MOCK_FAILURE_RATE?: string
  readonly VITE_SUPABASE_URL?: string
  /** The anon/publishable key. Safe to ship only because row-level security is on. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
