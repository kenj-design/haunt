/**
 * Accounts, kept separate from data.
 *
 * The mock backend has no accounts at all — it is a single imaginary person —
 * so `createAuthGateway()` returns `null` there and the app skips the whole
 * step. Anything that gates on a session has to cope with its absence.
 *
 * The model is device-first: opening the app makes an account, and a recovery
 * code is what lets that account move to another device. No email, no password
 * to invent, nothing to verify. The cost is that a lost code is a lost account,
 * which is why saving it is a step you cannot walk past.
 */

export interface AuthSession {
  userId: string
  /**
   * True while the account exists only on this device.
   *
   * Until a recovery code is made, losing the device loses the account, so the
   * app blocks on this before letting anyone properly in.
   */
  needsRecoveryCode: boolean
}

export interface AuthGateway {
  /** The session on this device, or `null`. Never throws for "signed out". */
  currentSession(): Promise<AuthSession | null>

  /** Makes a new account that lives on this device until a code is created. */
  startFresh(): Promise<AuthSession>

  /**
   * Moves an existing account onto this device.
   *
   * Whatever was on this device before is left behind, not merged — see
   * `supabaseAuthGateway.ts` for why merging is not on the table.
   */
  signInWithRecoveryCode(code: string): Promise<AuthSession>

  /**
   * Mints a code for the signed-in account and returns it once.
   *
   * The only time it is ever readable. Calling this again replaces the old code,
   * which stops working immediately.
   */
  createRecoveryCode(): Promise<string>

  signOut(): Promise<void>
}

/** Builds the gateway for the configured backend, or `null` if it has no accounts. */
export async function createAuthGateway(): Promise<AuthGateway | null> {
  const { config } = await import('../config')
  if (config.dataSource !== 'supabase') return null
  const { createSupabaseAuthGateway } = await import('./supabase/supabaseAuthGateway')
  return createSupabaseAuthGateway()
}
