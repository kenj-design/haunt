/**
 * Small, owner-only maintenance tools for the Haunt alpha.
 *
 * This never belongs in browser code. It needs a Supabase secret/service-role
 * key and defaults to read-only reporting. Cleanup requires --apply plus a
 * second confirmation so a mistaken shell command does not remove accounts.
 *
 * Examples:
 *   VITE_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/supabase-maintenance.mjs report
 *   ... node scripts/supabase-maintenance.mjs pause
 *   ... node scripts/supabase-maintenance.mjs resume
 *   ... node scripts/supabase-maintenance.mjs cleanup --apply
 */

import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const action = process.argv[2] ?? 'report'
const apply = process.argv.includes('--apply')

if (!url || !secretKey) {
  console.error(
    'Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY first (or the legacy SUPABASE_SERVICE_ROLE_KEY).',
  )
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAllUsers() {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Could not list users: ${error.message}`)
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

async function listMediaObjects(prefix) {
  const objects = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from('haunt-media').list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Could not list media under ${prefix}: ${error.message}`)

    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) {
        objects.push({
          path,
          size: Number(entry.metadata?.size ?? 0),
          updatedAt: entry.updated_at,
        })
      } else objects.push(...(await listMediaObjects(path)))
    }
    if ((data ?? []).length < 1000) break
  }
  return objects
}

async function readControls() {
  const { data, error } = await supabase
    .from('app_controls')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(`Could not read app controls: ${error.message}`)
  return data
}

async function listAllHauntIds() {
  const ids = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('haunts')
      .select('id')
      .range(offset, offset + 999)
    if (error) throw new Error(`Could not list haunts: ${error.message}`)
    ids.push(...(data ?? []).map((row) => row.id))
    if ((data ?? []).length < 1000) return ids
  }
}

async function report() {
  const [users, controls, hauntCount, mediaObjects] = await Promise.all([
    listAllUsers(),
    readControls(),
    supabase.from('haunts').select('id', { count: 'exact', head: true }),
    listMediaObjects(''),
  ])
  if (hauntCount.error) throw new Error(`Could not count haunts: ${hauntCount.error.message}`)

  const anonymous = users.filter((user) => user.is_anonymous).length
  const recentAnonymous = users.filter(
    (user) =>
      user.is_anonymous &&
      Date.parse(user.created_at) >= Date.now() - 24 * 60 * 60 * 1000,
  ).length
  const mediaBytes = mediaObjects.reduce((total, object) => total + object.size, 0)
  const mediaMegabytes = (mediaBytes / (1024 * 1024)).toFixed(1)

  console.log(`users: ${users.length}`)
  console.log(`anonymous users: ${anonymous} (${recentAnonymous} in the last 24h)`)
  console.log(`haunts: ${hauntCount.count ?? 0}`)
  console.log(`media files: ${mediaObjects.length} (${mediaMegabytes} MB)`)
  console.log(`new accounts: ${controls?.new_accounts_enabled ? 'on' : 'paused'}`)
  console.log(`haunt drops: ${controls?.drops_enabled ? 'on' : 'paused'}`)
  console.log(`media uploads: ${controls?.media_uploads_enabled ? 'on' : 'paused'}`)
}

async function setControls(values) {
  const { error } = await supabase
    .from('app_controls')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw new Error(`Could not update app controls: ${error.message}`)
}

async function confirm(prompt) {
  const readline = createInterface({ input, output })
  const answer = await readline.question(prompt)
  readline.close()
  return answer.trim()
}

async function cleanup() {
  const users = await listAllUsers()
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const abandoned = users.filter(
    (user) => user.is_anonymous && Date.parse(user.created_at) < cutoff,
  )
  const hauntIds = new Set(await listAllHauntIds())

  const abandonedIds = new Set(abandoned.map((user) => user.id))
  const orphanedPaths = []
  const abandonedPaths = []
  const orphanCutoff = Date.now() - 24 * 60 * 60 * 1000
  const mediaObjects = await listMediaObjects('')
  for (const object of mediaObjects) {
    const path = object.path
    const [ownerId, hauntId] = path.split('/')
    if (abandonedIds.has(ownerId)) abandonedPaths.push(path)
    else if (!hauntIds.has(hauntId) && Date.parse(object.updatedAt) < orphanCutoff) {
      orphanedPaths.push(path)
    }
  }

  console.log(`abandoned anonymous accounts: ${abandoned.length}`)
  console.log(`media belonging to abandoned accounts: ${abandonedPaths.length}`)
  console.log(`orphaned media: ${orphanedPaths.length}`)
  if (!apply) {
    console.log('Dry run only. Add --apply to remove these accounts and files.')
    return
  }

  if ((await confirm('Type CLEANUP to continue: ')) !== 'CLEANUP') {
    console.log('No changes made.')
    return
  }

  const mediaToRemove = [...new Set([...abandonedPaths, ...orphanedPaths])]
  if (mediaToRemove.length > 0) {
    const { error } = await supabase.storage.from('haunt-media').remove(mediaToRemove)
    if (error) throw new Error(`Could not remove media: ${error.message}`)
  }
  for (const user of abandoned) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) throw new Error(`Could not delete ${user.id}: ${error.message}`)
  }
  console.log(`Removed ${abandoned.length} abandoned accounts and ${mediaToRemove.length} files.`)
}

try {
  if (action === 'report') await report()
  else if (action === 'pause') {
    await setControls({ new_accounts_enabled: false, drops_enabled: false, media_uploads_enabled: false })
    console.log('New onboarding, haunt drops, and media uploads are paused.')
  } else if (action === 'resume') {
    await setControls({ new_accounts_enabled: true, drops_enabled: true, media_uploads_enabled: true })
    console.log('New onboarding, haunt drops, and media uploads are enabled.')
  } else if (action === 'cleanup') await cleanup()
  else {
    console.error('Usage: report | pause | resume | cleanup [--apply]')
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
