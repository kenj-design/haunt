/**
 * The prototype's backend.
 *
 * Holds the whole dataset in memory, applies the same rules a server would, and
 * mirrors itself to local storage so a reload doesn't lose your walk through the
 * app. It implements `HauntDataSource` exactly as the Supabase adapter does, so
 * whichever one is running, the app above it cannot tell the difference.
 *
 * The business rules live here rather than in the context on purpose: they are
 * the rules a real server owns, and keeping them here means the Supabase
 * implementation has a precise spec to match instead of logic to reinvent.
 */

import { config } from '../config'
import { newHauntFromDraft } from '../domain'
import type { CurrentUser, Friend, FriendRequest, Haunt, Keepsake, LineageEntry } from '../domain'
import {
  seedFriends,
  seedHaunts,
  seedFriendRequests,
  seedKeepsakes,
  seedMissedVisitId,
  seedNotifications,
  seedUser,
} from './fixtures'
import { DataError } from './dataSource'
import type {
  AppSnapshot,
  DropResult,
  FriendRequestResult,
  HauntDataSource,
  PassResult,
  VisitResult,
} from './dataSource'
import { localId } from '../lib/id'

/** Bump when the stored shape changes; an older payload is then ignored. */
const STORAGE_KEY = 'haunt.mock-db.v1'

/**
 * A visit costs a haunt a little clarity.
 *
 * Busy places fog over on other people's maps and quiet time brings them back.
 * Recovery is a scheduled job server-side, so only the dip is modelled here.
 */
const VISIT_SCORE_COST = 4
const VISIT_VELOCITY_COST = 8

/** Vibes assigned to someone whose friend request you accept, until they set their own. */
const NEW_FRIEND_VIBES = ['hidden', 'view']

type Store = AppSnapshot

function seedStore(): Store {
  return {
    user: seedUser,
    friends: seedFriends,
    haunts: seedHaunts,
    keepsakes: seedKeepsakes,
    notifications: seedNotifications,
    friendRequests: seedFriendRequests,
    missedVisitId: seedMissedVisitId,
    onboarded: false,
    notificationsUnread: true,
  }
}

const isBlobUrl = (url: string) => url.startsWith('blob:')

/**
 * Drops anything that cannot survive a reload before writing to storage.
 *
 * Photos and voice notes are held as in-memory object URLs, which die with the
 * page. Real uploads land in a storage bucket and this step disappears.
 */
function toPersistableHaunt(haunt: Haunt): Haunt {
  const audioIsLocal = haunt.arrivalNoteAudioUrl ? isBlobUrl(haunt.arrivalNoteAudioUrl) : false
  return {
    ...haunt,
    photoUrls: haunt.photoUrls.filter((url) => !isBlobUrl(url)),
    audioUrl: haunt.audioUrl && isBlobUrl(haunt.audioUrl) ? undefined : haunt.audioUrl,
    arrivalNoteAudioUrl: audioIsLocal ? undefined : haunt.arrivalNoteAudioUrl,
    arrivalNoteAudioDuration: audioIsLocal ? undefined : haunt.arrivalNoteAudioDuration,
    arrivalNoteKind: audioIsLocal ? null : haunt.arrivalNoteKind,
  }
}

function loadStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch {
    // Unreadable or unavailable storage just means starting from the fixtures.
  }
  return seedStore()
}

function saveStore(store: Store): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...store, haunts: store.haunts.map(toPersistableHaunt) } satisfies Store),
    )
  } catch {
    // Storage can be full or disabled; the session still works in memory.
  }
}

export interface MockDataSourceOptions {
  /** Artificial delay per call, for exercising loading states. */
  latencyMs?: number
  /** Fraction of calls that fail (0–1), for exercising error states. */
  failureRate?: number
  /** Start from the fixtures instead of whatever is in local storage. */
  persist?: boolean
}

export function createMockDataSource(options: MockDataSourceOptions = {}): HauntDataSource {
  const {
    latencyMs = config.mock.latencyMs,
    failureRate = config.mock.failureRate,
    persist = true,
  } = options

  let store: Store = persist ? loadStore() : seedStore()

  /** Every call pays the same latency and failure odds a real one would. */
  async function call<T>(produce: () => T): Promise<T> {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs))
    }
    if (failureRate > 0 && Math.random() < failureRate) {
      throw new DataError('network', 'the connection dropped. try that again.')
    }
    return produce()
  }

  /** Commits a change and hands back deep copies, so callers can't reach in. */
  function commit<T>(next: Store, result: T): T {
    store = next
    if (persist) saveStore(store)
    return structuredClone(result)
  }

  function requireHaunt(hauntId: string): Haunt {
    const haunt = store.haunts.find((candidate) => candidate.id === hauntId)
    if (!haunt) throw new DataError('not-found', `no haunt with id "${hauntId}"`)
    return haunt
  }

  function replaceHaunt(updated: Haunt): Haunt[] {
    return store.haunts.map((haunt) => (haunt.id === updated.id ? updated : haunt))
  }

  return {
    loadSnapshot() {
      return call(() => structuredClone(store))
    },

    completeOnboarding(handle) {
      return call(() => {
        const previousHandle = store.user.handle
        const user: CurrentUser = { ...store.user, handle }

        // The fixtures refer to the signed-in person by the placeholder handle,
        // so claiming a real one rewrites those references. A real schema keys
        // on a profile id and gets this consistency for free.
        const rename = (value: string) => (value === previousHandle ? handle : value)
        const haunts = store.haunts.map((haunt) => ({
          ...haunt,
          finderHandle: rename(haunt.finderHandle),
          passedByHandle: haunt.passedByHandle ? rename(haunt.passedByHandle) : undefined,
          founders: haunt.founders.map(rename),
          lineage: haunt.lineage.map((entry) => ({ ...entry, handle: rename(entry.handle) })),
        }))

        const next: Store = { ...store, user, haunts, onboarded: true }
        return commit(next, next)
      })
    },

    /*
     * Unlike the real backend, this does not check where you are.
     *
     * The mock's zones live on an abstract 0–100 plane with no geography behind
     * them, so there is nothing to measure a position against. Arrival
     * verification is a Supabase-only rule; see `0006_arrival.sql`. Anything
     * relying on it being enforced has to be tested against the real backend.
     */
    arriveAtHaunt(hauntId) {
      return call(() => {
        const haunt = requireHaunt(hauntId)
        // Arriving somewhere already visited is a no-op, not an error.
        if (haunt.status !== 'locked') return structuredClone(haunt)
        const updated: Haunt = { ...haunt, status: 'arrived' }
        return commit({ ...store, haunts: replaceHaunt(updated) }, updated)
      })
    },

    logVisit(hauntId) {
      return call<VisitResult>(() => {
        const haunt = requireHaunt(hauntId)
        const entry: LineageEntry = {
          handle: store.user.handle,
          role: 'you',
          action: 'made it here',
          time: 'just now',
        }
        const updated: Haunt = {
          ...haunt,
          status: 'visited',
          visitorCount: haunt.visitorCount + 1,
          lineage: [...haunt.lineage, entry],
          // A single-visit haunt burns out the moment someone reaches it.
          retired: haunt.lifespan === 'single' ? true : haunt.retired,
          health: {
            ...haunt.health,
            score: Math.max(0, haunt.health.score - VISIT_SCORE_COST),
            velocity: Math.max(0, haunt.health.velocity - VISIT_VELOCITY_COST),
          },
        }

        const alreadyCollected = store.keepsakes.some(
          (keepsake) => keepsake.hauntId === hauntId,
        )
        const keepsake: Keepsake | null = alreadyCollected
          ? null
          : {
              id: `keepsake-${haunt.id}-${store.user.handle}`,
              hauntId: haunt.id,
              name: haunt.name,
              finderHandle: haunt.finderHandle,
              collectedAt: 'just now',
              photoGradient: haunt.photoGradient,
            }

        const user: CurrentUser = { ...store.user, hauntsVisited: store.user.hauntsVisited + 1 }

        return commit(
          {
            ...store,
            user,
            haunts: replaceHaunt(updated),
            keepsakes: keepsake ? [keepsake, ...store.keepsakes] : store.keepsakes,
            // Logging the visit answers the "did you make it?" prompt.
            missedVisitId: store.missedVisitId === hauntId ? null : store.missedVisitId,
          },
          { haunt: updated, keepsake, user },
        )
      })
    },

    dropHaunt(draft) {
      return call<DropResult>(() => {
        const haunt = newHauntFromDraft(draft, {
          id: localId('drop', draft.name),
          finderHandle: store.user.handle,
        })
        const user: CurrentUser = {
          ...store.user,
          hauntsDropped: store.user.hauntsDropped + 1,
          // Leaving a haunt means being there, which counts as a visit.
          hauntsVisited: store.user.hauntsVisited + 1,
        }
        return commit({ ...store, user, haunts: [...store.haunts, haunt] }, { haunt, user })
      })
    },

    shareHaunt(hauntId, story) {
      return call(() => {
        const haunt = requireHaunt(hauntId)
        const updated: Haunt = {
          ...haunt,
          audience: 'circle',
          visibility: 'friend',
          story: story.trim(),
        }
        return commit({ ...store, haunts: replaceHaunt(updated) }, updated)
      })
    },

    passHaunt(hauntId, toHandle, note) {
      return call<PassResult>(() => {
        const haunt = requireHaunt(hauntId)
        if (haunt.status === 'locked') {
          throw new DataError('not-permitted', 'you can pass a haunt once you have been')
        }
        const entry: LineageEntry = {
          handle: store.user.handle,
          role: 'passer',
          action: `passed it to ${toHandle}`,
          time: 'just now',
          note: note || undefined,
        }
        const updated: Haunt = {
          ...haunt,
          passedByHandle: store.user.handle,
          passerNote: note || null,
          lineage: [...haunt.lineage, entry],
        }
        const user: CurrentUser = {
          ...store.user,
          hauntsPassedOn: store.user.hauntsPassedOn + 1,
        }
        return commit(
          { ...store, user, haunts: replaceHaunt(updated) },
          { haunt: updated, user },
        )
      })
    },

    /*
     * The mock has no directory of people, so unlike the real backend it cannot
     * tell you that a handle does not exist — any well-formed one becomes an
     * outgoing request that nobody is there to answer. Asking someone who has
     * already asked you still accepts, which is the rule that matters.
     */
    sendFriendRequest(handle) {
      return call<FriendRequestResult>(() => {
        const normalized = handle.startsWith('@') ? handle : `@${handle}`

        if (normalized === store.user.handle) {
          throw new DataError('conflict', 'that one is you')
        }
        if (store.friends.some((friend) => friend.handle === normalized)) {
          throw new DataError('conflict', 'you already know each other')
        }

        const existing = store.friendRequests.find((request) => request.handle === normalized)
        if (existing?.direction === 'outgoing') {
          throw new DataError('conflict', 'you have already asked them')
        }
        if (existing?.direction === 'incoming') {
          // They asked first; asking back is an answer.
          const friend: Friend = { handle: normalized, vibes: NEW_FRIEND_VIBES, mutualCount: 1 }
          const requests = store.friendRequests.filter((r) => r.handle !== normalized)
          return commit(
            { ...store, friends: [...store.friends, friend], friendRequests: requests },
            { requests, friend },
          )
        }

        const requests: FriendRequest[] = [
          ...store.friendRequests,
          { handle: normalized, direction: 'outgoing' },
        ]
        return commit({ ...store, friendRequests: requests }, { requests, friend: null })
      })
    },

    acceptFriendRequest(handle) {
      return call(() => {
        const pending = store.friendRequests.find(
          (request) => request.handle === handle && request.direction === 'incoming',
        )
        if (!pending) {
          throw new DataError('not-found', `no request from ${handle}`)
        }
        const friend: Friend = { handle, vibes: NEW_FRIEND_VIBES, mutualCount: 1 }
        return commit(
          {
            ...store,
            friends: [...store.friends, friend],
            friendRequests: store.friendRequests.filter((r) => r.handle !== handle),
          },
          friend,
        )
      })
    },

    ignoreFriendRequest(handle) {
      return call(() => {
        commit(
          { ...store, friendRequests: store.friendRequests.filter((r) => r.handle !== handle) },
          null,
        )
      })
    },

    markNotificationsRead() {
      return call(() => {
        commit({ ...store, notificationsUnread: false }, null)
      })
    },

    dismissMissedVisit(hauntId) {
      return call(() => {
        if (store.missedVisitId === hauntId) {
          commit({ ...store, missedVisitId: null }, null)
        }
      })
    },
  }
}

/** Clears the mock database, so the next boot starts from the fixtures. */
export function resetMockDataSource(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
