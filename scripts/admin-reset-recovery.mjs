/**
 * Emergency account recovery for Haunt alpha support.
 *
 * This is intentionally a local Node script, never browser code. It requires a
 * Supabase service-role key at runtime and reissues a recovery code for one
 * profile. The old code stops working as soon as the auth credentials change.
 * The original code cannot be retrieved because Haunt never stores it.
 *
 * Usage:
 *   VITE_SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/admin-reset-recovery.mjs @handle
 */

import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createClient } from '@supabase/supabase-js'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function generateRecoveryCode() {
  const bytes = randomBytes(10)
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)

  let bare = ''
  for (let index = 0; index < 16; index += 1) {
    bare = alphabet[Number(value & 31n)] + bare
    value >>= 5n
  }
  return bare.match(/.{1,4}/g).join('-')
}

function deriveCredentials(code) {
  const normalized = code.replaceAll('-', '')
  const digest = createHash('sha256')
    .update(`haunt.recovery.v1:${normalized}`)
    .digest('hex')
  return {
    email: `${digest.slice(0, 32)}@haunt.invalid`,
    password: digest.slice(32, 64),
  }
}

const handle = process.argv[2]?.trim().replace(/^@/, '').toLowerCase()
const url = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!handle || !/^[a-z0-9._]{3,30}$/.test(handle)) {
  console.error('Usage: node scripts/admin-reset-recovery.mjs @handle')
  process.exit(1)
}
if (!url || !serviceRoleKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('id, handle')
  .eq('handle', handle)
  .maybeSingle()

if (profileError) {
  console.error(`Could not find the profile: ${profileError.message}`)
  process.exit(1)
}
if (!profile) {
  console.error(`No profile exists for @${handle}.`)
  process.exit(1)
}

const readline = createInterface({ input, output })
const answer = await readline.question(
  `This will invalidate the current recovery code for @${profile.handle}. Type RESET to continue: `,
)
readline.close()

if (answer.trim() !== 'RESET') {
  console.log('No changes made.')
  process.exit(0)
}

const code = generateRecoveryCode()
const credentials = deriveCredentials(code)
const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
  email: credentials.email,
  password: credentials.password,
  email_confirm: true,
})

if (updateError) {
  console.error(`Could not reset the account: ${updateError.message}`)
  process.exit(1)
}

console.log(`New recovery code for @${profile.handle}: ${code}`)
console.log('Save it now. It will not be shown again, and the previous code no longer works.')
