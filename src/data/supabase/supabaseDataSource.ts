/**
 * `HauntDataSource` over Supabase.
 *
 * Mirrors `mockDataSource.ts` method for method — that file is the spec for what
 * each mutation means, and this one moves the same rules into Postgres. The
 * business logic is not duplicated here: compound writes go through the RPCs in
 * `supabase/migrations/0004_writes.sql`, so a torn connection cannot leave a
 * visit logged with no keepsake.
 *
 * Two things happen in this layer and nowhere else:
 *
 *   * Reads come from `haunt_feed`, never from `haunts`. The table has no idea
 *     who is asking; the function does, and redacts accordingly.
 *   * Media is signed in one batch per snapshot rather than per haunt, because
 *     signing is a network call and there is no reason to make thirty of them.
 *
 * The `.returns<T>()` calls below assert the shapes in `rows.ts`. They are needed
 * only because the client is untyped: generate `Database` types (see `rows.ts`)
 * and the inference becomes exact, at which point they can all come out.
 *
 * Verified against a live project on 2026-08-29: sign-in, onboarding, dropping
 * a haunt, sharing it, and reading it all back through `haunt_feed`. Passing and
 * visiting another person's haunt are not yet exercised — see `docs/supabase.md`
 * for exactly what is and is not proven.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { DataError } from '../dataSource'
import type {
  AppSnapshot,
  DropResult,
  FriendRequestResult,
  HauntDataSource,
  PassResult,
  VisitResult,
} from '../dataSource'
import type { CurrentUser, Friend, FriendRequest, Haunt, HauntDraft } from '../../domain'
import { getSupabaseClient, MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS } from './client'
import { requestUserLocation } from '../../lib/geo'
import {
  toCurrentUser,
  toDropPayload,
  toFriend,
  toHaunt,
  toKeepsake,
  toNotification,
} from './mappers'
import type {
  FriendRequestRow,
  FriendRow,
  HauntFeedRow,
  KeepsakeRow,
  NotificationRow,
  ProfileSnapshotRow,
} from './rows'

/** How long to wait for a position after a location-dependent screen is entered. */
const GEOLOCATION_TIMEOUT_MS = 8_000

/**
 * How long a fix stays good enough to reuse.
 *
 * Location-aware reads pass the viewer's position to `haunt_feed`, and
 * re-reading one haunt after a mutation is a read. Without this, each of those
 * waits on the geolocation API again — up to the timeout above when permission
 * is denied or pending, which shows up as the UI taking eight seconds to catch
 * up with a write that already succeeded. Nobody moves far enough in a minute
 * to matter.
 */
const POSITION_TTL_MS = 60_000

/**
 * Postgres error codes, translated into something the UI can act on.
 *
 * The RPCs raise these deliberately — `42501` for a rule the caller broke,
 * `P0002` for something that isn't theirs to see. An RLS rejection also surfaces
 * as `42501`, which is the same answer from the app's point of view.
 */
function toDataErrorFrom(error: PostgrestError | Error, fallback: string): DataError {
  if (!('code' in error)) {
    return new DataError('network', fallback, { cause: error })
  }
  const message = error.message || fallback
  switch (error.code) {
    case 'PGRST116': // no rows where exactly one was expected
    case 'P0002':
      return new DataError('not-found', message, { cause: error })
    case '42501': // insufficient privilege, including an RLS refusal
    case '28000':
      return new DataError('not-permitted', message, { cause: error })
    case '23505': // unique violation
    case '23514': // check violation
      return new DataError('conflict', message, { cause: error })
    default:
      return new DataError('unknown', message, { cause: error })
  }
}

/** Unwraps a Supabase response, turning its error into a `DataError`. */
function unwrap<T>(
  response: { data: T | null; error: PostgrestError | null },
  fallback: string,
): T {
  if (response.error) throw toDataErrorFrom(response.error, fallback)
  if (response.data === null) throw new DataError('not-found', fallback)
  return response.data
}

export type Position = { lat: number; lng: number }

/** The last fix, and when it was taken. `null` covers "asked, and got nothing". */
let cachedPosition: { value: Position | null; at: number } | null = null

/** Forgets the cached fix, so the next read asks again. */
export function clearCachedPosition(): void {
  cachedPosition = null
}

function readPosition(options: PositionOptions): Promise<Position | null> {
  return requestUserLocation(options)
}

/**
 * A position good enough to claim you are standing somewhere.
 *
 * Never cached and high accuracy, unlike the one distances are drawn with: this
 * is the reading the server checks against the zone, so a minute-old fix from
 * the other side of town is exactly the thing to avoid.
 */
function preciseNow(): Promise<Position | null> {
  return readPosition({
    enableHighAccuracy: true,
    timeout: GEOLOCATION_TIMEOUT_MS,
    maximumAge: 0,
  })
}

/**
 * The viewer's position, reusing a recent fix.
 *
 * A refusal is cached the same as a fix: someone who declined once should not be
 * made to wait out the timeout on every subsequent read.
 *
 * Distances are a courtesy, not a requirement — without a position the feed
 * still loads and every haunt simply has no distance to show.
 */
async function currentPosition(): Promise<Position | null> {
  if (cachedPosition && Date.now() - cachedPosition.at < POSITION_TTL_MS) {
    return cachedPosition.value
  }
  const value = await readPosition({
    enableHighAccuracy: false,
    timeout: GEOLOCATION_TIMEOUT_MS,
    maximumAge: POSITION_TTL_MS,
  })
  cachedPosition = { value, at: Date.now() }
  return value
}

export function createSupabaseDataSource(
  supabase: SupabaseClient = getSupabaseClient(),
): HauntDataSource {
  /** The signed-in profile id, or a `not-permitted` error if there isn't one. */
  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      throw new DataError('not-permitted', 'you are signed out', { cause: error })
    }
    return data.user.id
  }

  /**
   * Signs every photo path across a batch of haunts in one call.
   *
   * Returns a lookup from storage key to signed URL. Paths that fail to sign are
   * simply absent, and the haunt falls back to its gradient — a missing photo
   * should never take the screen down with it.
   */
  async function signPhotos(rows: HauntFeedRow[]): Promise<Map<string, string>> {
    const paths = [...new Set(rows.flatMap((row) => row.photo_paths))]
    if (paths.length === 0) return new Map()

    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

    if (error || !data) return new Map()
    const signed = new Map<string, string>()
    for (const entry of data) {
      if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl)
    }
    return signed
  }

  function assemble(rows: HauntFeedRow[], signed: Map<string, string>): Haunt[] {
    return rows.map((row) =>
      toHaunt(
        row,
        row.photo_paths
          .map((path) => signed.get(path))
          .filter((url): url is string => Boolean(url)),
      ),
    )
  }

  async function readHaunts(position: Position | null, hauntId?: string): Promise<Haunt[]> {
    const rows = unwrap<HauntFeedRow[]>(
      await supabase.rpc('haunt_feed', {
        p_lat: position?.lat ?? null,
        p_lng: position?.lng ?? null,
        p_haunt: hauntId ?? null,
      }),
      "couldn't reach your places",
    )
    return assemble(rows, await signPhotos(rows))
  }

  /** Re-reads one haunt after a mutation, so the app takes the server's version. */
  async function readHaunt(hauntId: string): Promise<Haunt> {
    const [haunt] = await readHaunts(cachedPosition?.value ?? null, hauntId)
    if (!haunt) throw new DataError('not-found', `no haunt with id "${hauntId}"`)
    return haunt
  }

  async function readUser(): Promise<CurrentUser> {
    return toCurrentUser(
      unwrap<ProfileSnapshotRow>(
        await supabase.rpc('profile_snapshot'),
        "couldn't read your profile",
      ),
    )
  }

  /**
   * The keepsake rows alone — no haunt embedded.
   *
   * Embedding one would need select on `haunts`, which clients no longer have:
   * that table holds the exact point and the sealed note, and row-level security
   * cannot withhold a column. The names get attached from the feed instead, which
   * has already redacted itself for this viewer.
   */
  async function readKeepsakeRows(userId: string): Promise<KeepsakeRow[]> {
    return unwrap<KeepsakeRow[]>(
      await supabase
        .from('keepsakes')
        .select('id, haunt_id, collected_at, sigil_path')
        .eq('owner_id', userId)
        .order('collected_at', { ascending: false })
        .returns<KeepsakeRow[]>(),
      "couldn't read your keepsakes",
    )
  }

  async function readFriends(): Promise<Friend[]> {
    const rows = unwrap<FriendRow[]>(
      await supabase.rpc('friend_list'),
      "couldn't read your friends",
    )
    return rows.map(toFriend)
  }

  /** Everything outstanding, both directions. */
  async function readFriendRequests(): Promise<FriendRequest[]> {
    const rows = unwrap<FriendRequestRow[]>(
      await supabase.rpc('friend_requests'),
      "couldn't read your requests",
    )
    return rows.map((row) => ({ handle: row.handle, direction: row.direction }))
  }

  async function loadSnapshot(position: Position | null): Promise<AppSnapshot> {
    const userId = await requireUserId()

    // Independent reads, so they go out together rather than in a queue.
    const [user, friends, haunts, keepsakeRows, notificationRows, friendRequests, missed] =
      await Promise.all([
        readUser(),
        readFriends(),
        readHaunts(position),
        readKeepsakeRows(userId),
        supabase
          .from('notifications')
          .select('id, kind, haunt_id, body, created_at, read_at, actor:profiles!actor_id(handle)')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)
          .returns<NotificationRow[]>(),
        readFriendRequests(),
        supabase.rpc('missed_visit_id'),
      ])

    const rows = unwrap<NotificationRow[]>(notificationRows, "couldn't read your news")
    // The feed has already decided what this viewer may know about each place,
    // so the keepsakes take their names from it rather than asking again.
    const byId = new Map(haunts.map((haunt) => [haunt.id, haunt]))
    const keepsakes = keepsakeRows.map((row) => toKeepsake(row, byId.get(row.haunt_id)))
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarded')
      .eq('id', userId)
      .single()

    return {
      user,
      friends,
      haunts,
      keepsakes,
      notifications: rows.map(toNotification),
      friendRequests,
      missedVisitId: (missed.data as string | null) ?? null,
      onboarded: Boolean(profile?.onboarded),
      notificationsUnread: rows.some((row) => row.read_at === null),
    }
  }

  return {
    loadSnapshot: () => loadSnapshot(null),

    async requestLocation() {
      const position = await currentPosition()
      if (position) {
        // This is intentionally reached only from a location-dependent screen,
        // never from boot or from the onboarding handle claim.
        await supabase.rpc('record_proximity', { p_lat: position.lat, p_lng: position.lng })
      }
      return { snapshot: await loadSnapshot(position), location: position }
    },

    async completeOnboarding(handle: string): Promise<AppSnapshot> {
      const { error } = await supabase.rpc('complete_onboarding', { p_handle: handle })
      if (error) throw toDataErrorFrom(error, "couldn't claim that handle")
      // A handle threads through lineage entries and founder lists, so the whole
      // snapshot is re-read rather than patched. The contract says as much.
      return loadSnapshot(null)
    },

    async arriveAtHaunt(hauntId: string): Promise<Haunt> {
      // Deliberately not the cached fix: this is the reading the server checks
      // against the zone, so it has to be current and as accurate as available.
      const position = await preciseNow()
      if (!position) {
        throw new DataError(
          'not-permitted',
          'haunt needs your location to know you made it',
        )
      }

      const { error } = await supabase.rpc('arrive_at_haunt', {
        p_haunt: hauntId,
        p_lat: position.lat,
        p_lng: position.lng,
      })
      // A refusal here carries how far off you are; let it through rather than
      // flattening it into a generic failure.
      if (error) throw toDataErrorFrom(error, "couldn't mark you as here")

      // The fresh fix is better than whatever was cached, so distances get it too.
      cachedPosition = { value: position, at: Date.now() }
      return readHaunt(hauntId)
    },

    async logVisit(hauntId: string): Promise<VisitResult> {
      const userId = await requireUserId()
      const { error } = await supabase.rpc('log_visit', { p_haunt: hauntId })
      if (error) throw toDataErrorFrom(error, "couldn't log that visit")

      const [haunt, user, keepsakeRows] = await Promise.all([
        readHaunt(hauntId),
        readUser(),
        readKeepsakeRows(userId),
      ])
      // `log_visit` mints a keepsake only on a first visit, so a returning
      // visitor legitimately gets none back here.
      const row = keepsakeRows.find((item) => item.haunt_id === hauntId)
      const keepsake = row ? toKeepsake(row, haunt) : null
      return { haunt, keepsake, user }
    },

    async dropHaunt(draft: HauntDraft): Promise<DropResult> {
      const userId = await requireUserId()
      const draftPosition =
        typeof draft.zone.lat === 'number' && typeof draft.zone.lng === 'number'
          ? { lat: draft.zone.lat, lng: draft.zone.lng }
          : null
      const position = draftPosition ?? (await currentPosition())
      if (!position) {
        throw new DataError(
          'not-permitted',
          'haunt needs your location to leave a place here',
        )
      }

      // Name the haunt's id up front so media lands at its final path before the
      // row exists; storage policies key on that path.
      const hauntId = crypto.randomUUID()
      const photoPaths = await uploadPhotos(supabase, userId, hauntId, draft.photoUrls)

      const { data, error } = await supabase.rpc('drop_haunt', {
        p_payload: { ...toDropPayload(draft, position, photoPaths), id: hauntId },
      })
      if (error) throw toDataErrorFrom(error, "couldn't leave that haunt")

      const [haunt, user] = await Promise.all([
        readHaunt((data as string) ?? hauntId),
        readUser(),
      ])
      return { haunt, user }
    },

    async shareHaunt(hauntId: string, story: string): Promise<Haunt> {
      // An RPC rather than an update, because the client has no write access to
      // `haunts` — and it had none to spare: granting it meant granting reads.
      const { error } = await supabase.rpc('share_haunt', {
        p_haunt: hauntId,
        p_story: story.trim(),
      })
      if (error) throw toDataErrorFrom(error, "couldn't share that haunt")
      return readHaunt(hauntId)
    },

    async passHaunt(hauntId: string, toHandle: string, note: string): Promise<PassResult> {
      const { error } = await supabase.rpc('pass_haunt', {
        p_haunt: hauntId,
        p_to_handle: toHandle,
        p_note: note,
      })
      if (error) throw toDataErrorFrom(error, "couldn't pass that haunt")

      const [haunt, user] = await Promise.all([readHaunt(hauntId), readUser()])
      return { haunt, user }
    },

    async sendFriendRequest(handle: string): Promise<FriendRequestResult> {
      const { error } = await supabase.rpc('send_friend_request', { p_handle: handle })
      if (error) throw toDataErrorFrom(error, "couldn't ask to know them")

      // The backend decides what the ask meant — a new request, or an answer to
      // one already waiting — so both lists are re-read rather than guessed at.
      const [requests, friends] = await Promise.all([readFriendRequests(), readFriends()])
      const normalized = handle.startsWith('@') ? handle : `@${handle}`
      return {
        requests,
        friend: friends.find((candidate) => candidate.handle === normalized) ?? null,
      }
    },

    async acceptFriendRequest(handle: string): Promise<Friend> {
      const { error } = await supabase.rpc('respond_to_friend_request', {
        p_handle: handle,
        p_accept: true,
      })
      if (error) throw toDataErrorFrom(error, "couldn't accept that request")

      const friend = (await readFriends()).find((candidate) => candidate.handle === handle)
      if (!friend) throw new DataError('not-found', `no request from ${handle}`)
      return friend
    },

    async ignoreFriendRequest(handle: string): Promise<void> {
      const { error } = await supabase.rpc('respond_to_friend_request', {
        p_handle: handle,
        p_accept: false,
      })
      if (error) throw toDataErrorFrom(error, "couldn't dismiss that request")
    },

    async markNotificationsRead(): Promise<void> {
      const { error } = await supabase.rpc('mark_notifications_read')
      if (error) throw toDataErrorFrom(error, "couldn't update your news")
    },

    async dismissMissedVisit(hauntId: string): Promise<void> {
      const { error } = await supabase.rpc('dismiss_missed_visit', { p_haunt: hauntId })
      if (error) throw toDataErrorFrom(error, "couldn't dismiss that prompt")
    },
  }
}

/**
 * Uploads a draft's photos and returns their storage keys.
 *
 * The composer holds photos as in-memory object URLs, so each one is fetched
 * back out of the browser before it can be sent. Anything already remote is
 * passed through untouched.
 */
async function uploadPhotos(
  supabase: SupabaseClient,
  userId: string,
  hauntId: string,
  photoUrls: string[],
): Promise<string[]> {
  const paths: string[] = []

  for (const [index, url] of photoUrls.entries()) {
    if (!url.startsWith('blob:')) {
      paths.push(url)
      continue
    }

    const blob = await fetch(url).then((response) => response.blob())
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
    const path = `${userId}/${hauntId}/photo-${index}.${extension}`

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: true })

    if (error) throw new DataError('unknown', "couldn't upload that photo", { cause: error })
    paths.push(path)
  }

  return paths
}
