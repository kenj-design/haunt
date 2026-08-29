/**
 * Recovery codes: an account you can carry, without an email address.
 *
 * A code is 80 bits of randomness, shown once and never stored. Both halves of
 * the credential it stands for — the account identifier and its password — are
 * derived from the code by SHA-256, so typing it on a second device recomputes
 * exactly the pair the account was created with. Nothing server-side holds the
 * code, or a hash of it, or a lookup table that could leak which codes exist.
 *
 * The security rests entirely on the code's entropy. 80 bits against Supabase's
 * per-IP auth rate limiting is far past brute force. It is also why the code
 * cannot be shown again after the one time: there is nowhere it is kept.
 *
 * The derived address uses `.invalid`, which RFC 2606 reserves as permanently
 * undeliverable — nothing here should ever look like a real mailbox.
 */

/**
 * Crockford base32, minus the letters that get misread when copied by hand.
 *
 * No I, L, O or U: the first three are read as 1 and 0, and dropping U keeps
 * the alphabet from spelling anything unfortunate.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const CODE_LENGTH = 16
const GROUP_SIZE = 4
const ENTROPY_BYTES = 10 // 80 bits, which is exactly 16 base32 characters

/** Typos that are really the same character. */
const CONFUSABLE: Record<string, string> = { I: '1', L: '1', O: '0', U: 'V' }

/** A fresh code, formatted for reading aloud: `H4TX-9K2M-7QPD-3RNW`. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ENTROPY_BYTES))

  // Pack the bytes into a bigint and peel off 5 bits at a time; 10 bytes is
  // exactly 16 base32 characters, so nothing is padded or thrown away.
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)

  let code = ''
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code = ALPHABET[Number(value & 31n)] + code
    value >>= 5n
  }
  return formatRecoveryCode(code)
}

/** Groups a bare code for display. */
export function formatRecoveryCode(code: string): string {
  return (code.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) ?? []).join('-')
}

/**
 * Reduces what someone typed to its canonical form.
 *
 * Forgiving on purpose: case, spacing, dashes, and the handful of characters
 * that are routinely misread all normalise away. Someone reading a code off a
 * scrap of paper should not be defeated by an O they wrote as a zero.
 */
export function normalizeRecoveryCode(input: string): string {
  return [...input.toUpperCase().replace(/[^0-9A-Z]/g, '')]
    .map((character) => CONFUSABLE[character] ?? character)
    .join('')
}

/** Whether a normalised code is even the right shape to try. */
export function isRecoveryCodeComplete(input: string): boolean {
  const normalized = normalizeRecoveryCode(input)
  return (
    normalized.length === CODE_LENGTH &&
    [...normalized].every((character) => ALPHABET.includes(character))
  )
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export interface DerivedCredentials {
  email: string
  password: string
}

/**
 * The credential pair a code stands for.
 *
 * The two halves come from different slices of one digest, so possessing the
 * address does not hand over the password — and the digest is only reachable
 * from the code itself.
 *
 * The version prefix is load-bearing: changing it would strand every existing
 * code, so it must stay put unless there is a migration to go with it.
 */
export async function deriveCredentials(code: string): Promise<DerivedCredentials> {
  const digest = await sha256Hex(`haunt.recovery.v1:${normalizeRecoveryCode(code)}`)
  return {
    email: `${digest.slice(0, 32)}@haunt.invalid`,
    password: digest.slice(32, 64),
  }
}
