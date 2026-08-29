/**
 * Accounts on Supabase, without asking anyone for an email.
 *
 * Opening the app calls `signInAnonymously()`, which is a real `auth.users` row
 * and a real session — the `handle_new_user` trigger gives it a profile, and
 * every row-level security policy treats it like any other user.
 *
 * Making a recovery code upgrades that account in place with
 * `updateUser({ email, password })`, both derived from the code. The user id
 * never changes, so nothing they have made moves or is re-keyed. Entering the
 * code on another device recomputes the same pair and signs in as that account.
 *
 * SETUP: this needs **Confirm email turned off** in Authentication → Providers →
 * Email, and **anonymous sign-ins enabled**. The derived address is deliberately
 * undeliverable, so a confirmation step would strand every account at the moment
 * it is secured. See `docs/supabase.md`.
 *
 * UNVERIFIED: typechecked, never run against a live project.
 */

import { DataError } from '../dataSource'
import type { AuthGateway, AuthSession } from '../auth'
import { getSupabaseClient } from './client'
import { deriveCredentials, generateRecoveryCode } from '../../lib/recoveryCode'
import type { User } from '@supabase/supabase-js'

/** An account is device-local until it has an address derived from a code. */
function toSession(user: User): AuthSession {
  return { userId: user.id, needsRecoveryCode: !user.email }
}

export function createSupabaseAuthGateway(): AuthGateway {
  const supabase = getSupabaseClient()

  return {
    async currentSession() {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) return null
      return toSession(data.session.user)
    },

    async startFresh() {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error || !data.user) {
        throw new DataError(
          'not-permitted',
          // Almost always the one setting: anonymous sign-ins are off by default.
          error?.message ?? 'could not start an account here',
          { cause: error },
        )
      }
      return toSession(data.user)
    },

    async signInWithRecoveryCode(code: string) {
      const { email, password } = await deriveCredentials(code)

      // Whatever account is on this device is left behind rather than merged.
      // Merging two histories would mean deciding who found what, and there is
      // no honest answer to that — a haunt has one finder.
      await supabase.auth.signOut()

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) {
        // Supabase cannot distinguish a wrong code from an unused one, and it
        // should not: telling them apart would confirm which codes are real.
        throw new DataError('not-found', "that code doesn't open anything", { cause: error })
      }
      return toSession(data.user)
    },

    async createRecoveryCode() {
      const code = generateRecoveryCode()
      const { email, password } = await deriveCredentials(code)

      const { error } = await supabase.auth.updateUser({ email, password })
      if (error) {
        throw new DataError('unknown', "couldn't secure this account", { cause: error })
      }
      // Returned once. It is not stored here, in Postgres, or anywhere else.
      return code
    },

    async signOut() {
      await supabase.auth.signOut()
    },
  }
}
