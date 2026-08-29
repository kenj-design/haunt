/**
 * The Supabase client, created once.
 *
 * The anon key ships inside the bundle. That is safe only because row-level
 * security is on for every table (see `supabase/migrations/0002_security.sql`) —
 * the key identifies the app, and the signed-in user's JWT decides what they can
 * actually reach. If RLS were ever disabled, this key would be a public door.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { config, isSupabaseConfigured } from '../../config'

/** Bucket holding photos and voice notes. Private; reads go through signed URLs. */
export const MEDIA_BUCKET = 'haunt-media'

/** How long a signed media URL stays good. Long enough to browse, short enough to expire. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set to use the ' +
        'Supabase backend. See .env.example and docs/supabase.md.',
    )
  }
  client ??= createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return client
}
