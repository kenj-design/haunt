/**
 * People, and the traces they leave on each other's maps.
 *
 * Handles (`@maya`) are the prototype's identity. Production keys every one of
 * these on a `profiles.id` UUID and carries the handle alongside it, so treat
 * handle equality as a stand-in for an identity join, not the real thing.
 */

export interface Friend {
  handle: string
  vibes: string[]
  /** Friends the two of you share. */
  mutualCount: number
}

/** The signed-in person. Counters are denormalized for a cheap profile read. */
export interface CurrentUser {
  handle: string
  hauntsDropped: number
  hauntsVisited: number
  hauntsPassedOn: number
  vibes: string[]
  /** Pre-formatted for display ("October 2024"). */
  memberSince: string
}

/** A haunt someone visited, kept as a small memento on their profile. */
export interface Keepsake {
  id: string
  hauntId: string
  name: string
  finderHandle: string
  /** Pre-formatted for display ("January 2025"). */
  collectedAt: string
  photoGradient: string
  sigilPath?: import('./haunt').NormalizedPoint[]
}

/**
 * An outstanding request to know someone.
 *
 * Outgoing ones are shown too, so an ask doesn't disappear into silence while
 * you wait. Ignoring is quiet — the other person is never told.
 */
export interface FriendRequest {
  handle: string
  direction: 'incoming' | 'outgoing'
}

/** `anon` hides who acted, which is the point — it reports the event, not the person. */
export type NotificationKind = 'visit' | 'pass' | 'anon'

export interface Notification {
  id: string
  kind: NotificationKind
  text: string
  /** Pre-formatted for display ("2h ago"). */
  time: string
  hauntId: string
  /** `null` for anonymous events. */
  actorHandle: string | null
}
