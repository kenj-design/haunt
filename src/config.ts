/**
 * Runtime configuration, read once from the build-time environment.
 *
 * Everything here ships inside the client bundle, so it holds only public
 * values. Anything secret belongs behind an API or a Supabase edge function.
 */

export type DataSourceKind = 'mock' | 'supabase'

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const dataSource: DataSourceKind = import.meta.env.VITE_DATA_SOURCE === 'supabase' ? 'supabase' : 'mock'

export const config = {
  /** Which implementation `createDataSource()` builds. */
  dataSource,

  /**
   * Knobs for making the mock backend behave like a real one.
   *
   * Both default to zero so day-to-day use stays instant. Turn them up to see
   * how the app holds together when the network is slow or flaky.
   */
  mock: {
    latencyMs: readNumber(import.meta.env.VITE_MOCK_LATENCY_MS, 0),
    failureRate: Math.min(1, Math.max(0, readNumber(import.meta.env.VITE_MOCK_FAILURE_RATE, 0))),
  },

  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  },
} as const

/** True when the Supabase project details are actually present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.anonKey)
}
