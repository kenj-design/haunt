/**
 * The contract between the app and whatever is storing its data.
 *
 * Screens never see this — they go through `useApp()`. The context is the only
 * caller, which means swapping the mock backend for Supabase (or an HTTP API)
 * touches exactly one factory function and nothing else.
 *
 * Two rules keep implementations honest:
 *
 * 1. Every method is async, even when the mock answers instantly. A synchronous
 *    signature anywhere would let a caller assume something a network cannot do.
 * 2. Mutations return the records they changed. The caller merges the response
 *    into local state rather than guessing at the result, so server-computed
 *    fields — counters, lineage, health — always come from the server.
 */

import type {
  CurrentUser,
  Friend,
  FriendRequest,
  Haunt,
  HauntDraft,
  Keepsake,
  Notification,
} from '../domain'
import type { UserLocation } from '../lib/geo'

/**
 * Everything the app needs to render, in one round trip.
 *
 * The dataset is small and the map wants nearly all of it at once, so a single
 * snapshot beats five independent fetches and five loading states. A Supabase
 * implementation fans this out into parallel queries or one RPC.
 */
export interface AppSnapshot {
  user: CurrentUser
  friends: Friend[]
  /** Already filtered and viewer-resolved: only what this person may see. */
  haunts: Haunt[]
  keepsakes: Keepsake[]
  notifications: Notification[]
  /** Everything outstanding, both directions. */
  friendRequests: FriendRequest[]
  /** A haunt the viewer passed through without logging, if the geofence saw one. */
  missedVisitId: string | null
  /** Whether this person has claimed a handle yet. */
  onboarded: boolean
  notificationsUnread: boolean
}

export interface LocationRequestResult {
  snapshot: AppSnapshot
  /** Null means the person denied location or the browser could not provide it. */
  location: UserLocation | null
}

/** Logging a visit touches the haunt, the visitor's counters, and their keepsakes. */
export interface VisitResult {
  haunt: Haunt
  /** `null` when this person already held a keepsake for the haunt. */
  keepsake: Keepsake | null
  user: CurrentUser
}

export interface DropResult {
  haunt: Haunt
  user: CurrentUser
}

export interface PassResult {
  haunt: Haunt
  user: CurrentUser
}

/**
 * The outcome of asking to know someone.
 *
 * `friend` is non-null when the ask answered a request that was already waiting
 * from them — reaching for each other connects you rather than queueing a second
 * request nobody needs to answer.
 */
export interface FriendRequestResult {
  /** The full outstanding set afterwards, both directions. */
  requests: FriendRequest[]
  friend: Friend | null
}

export type DataErrorCode = 'not-found' | 'not-permitted' | 'conflict' | 'network' | 'unknown'

/**
 * A failure the UI can react to, rather than a raw driver error.
 *
 * Adapters translate their own failures into these — a PostgREST `PGRST116`
 * becomes `not-found`, an RLS rejection becomes `not-permitted` — so the app
 * never has to know which backend it is talking to.
 */
export class DataError extends Error {
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DataError'
    this.code = code
  }
}

/** Wraps anything thrown into a `DataError`, so callers only handle one shape. */
export function toDataError(error: unknown, fallbackMessage: string): DataError {
  if (error instanceof DataError) return error
  const message = error instanceof Error ? error.message : fallbackMessage
  return new DataError('unknown', message, { cause: error })
}

export interface HauntDataSource {
  /** Loads everything the app renders. Called at boot and on retry. */
  loadSnapshot(): Promise<AppSnapshot>

  /**
   * Explicitly asks for location once a location-dependent screen is visible,
   * then refreshes the snapshot with distance and proximity data when a fix is
   * available. A denied or unavailable position is still a valid snapshot.
   */
  requestLocation(): Promise<LocationRequestResult>

  /**
   * Claims a handle and marks this person onboarded.
   *
   * Returns a whole snapshot rather than just the user, because a handle is
   * denormalized into lineage entries and founder lists: changing it changes
   * how existing haunts read. A backend keying lineage on profile ids reaches
   * the same place through a join, and still has to re-resolve to show it.
   */
  completeOnboarding(handle: string): Promise<AppSnapshot>

  /**
   * Records crossing into a haunt's zone, which unseals its arrival note.
   *
   * Distinct from logging a visit: arriving is something the world does to you,
   * logging it is a choice. Production verifies this against a real position
   * rather than trusting the client's word.
   */
  arriveAtHaunt(hauntId: string): Promise<Haunt>

  /** Commits the visit: lineage entry, visitor count, keepsake, health dip. */
  logVisit(hauntId: string): Promise<VisitResult>

  /** Creates a haunt from what the finder filled in. */
  dropHaunt(draft: HauntDraft): Promise<DropResult>

  /** Opens a haunt the finder had kept private up to their circle. */
  shareHaunt(hauntId: string, story: string): Promise<Haunt>

  /** Hands a haunt to one person, with the note that has to come with it. */
  passHaunt(hauntId: string, toHandle: string, note: string): Promise<PassResult>

  /**
   * Asks to know someone by their exact handle.
   *
   * Narrow on purpose: there is no directory and no search. Asking someone who
   * already asked you accepts instead, so two people reaching for each other
   * don't end up waiting on each other.
   */
  sendFriendRequest(handle: string): Promise<FriendRequestResult>

  /** Answers a request made to you. Returns the new friend when accepted. */
  acceptFriendRequest(handle: string): Promise<Friend>
  ignoreFriendRequest(handle: string): Promise<void>

  markNotificationsRead(): Promise<void>

  /** Answers "not this time" so the prompt doesn't come back. */
  dismissMissedVisit(hauntId: string): Promise<void>
}
