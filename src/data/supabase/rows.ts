/**
 * The shapes Postgres actually returns.
 *
 * Hand-written to match `supabase/migrations/`, and snake_case on purpose — they
 * are database rows, not app objects. Nothing outside `mappers.ts` should ever
 * import from here.
 *
 * Once a project exists, prefer generating these:
 *
 *   supabase gen types typescript --project-id <id> > src/data/supabase/database.types.ts
 *
 * and narrow these interfaces to the generated `Database` type, so a schema
 * change becomes a compile error rather than a runtime surprise.
 */

/** JSON-encoded `{ x, y }` pairs from a `jsonb` column. */
export interface PointRow {
  x: number
  y: number
}

export interface LineageEntryRow {
  /** `null` for anyone more than two hops away; the row still counts. */
  handle: string | null
  role: 'finder' | 'passer' | 'visitor' | 'you' | 'anon'
  action: string
  happened_at: string
  note: string | null
}

export interface HauntHealthRow {
  score: number
  velocity: number
  network_distance: number
  conversion: number
}

/** One row of `haunt_feed(p_lat, p_lng, p_haunt)`. */
export interface HauntFeedRow {
  id: string
  name: string
  finder_handle: string | null
  vibe_tags: string[]
  best_time_tags: string[]
  story: string
  arrival_note: string
  arrival_note_kind: 'text' | 'audio' | null
  arrival_note_audio_path: string | null
  arrival_note_audio_duration_s: number | null
  audience: 'self' | 'circle' | 'wanderers'
  lifespan: 'lasting' | 'single' | 'dated'
  expires_on: string | null
  sleep_until: string | null
  retired: boolean
  zone_radius_m: number
  /** Coarsened zone centre; `null` only if the point were ever missing. */
  zone_lat: number | null
  zone_lng: number | null
  shroud_path: PointRow[] | null
  shroud_seed: number | null
  shroud_temperament: number
  sigil_path: PointRow[] | null
  photo_gradient: string
  /** Object keys in the `haunt-media` bucket. Signed before the app sees them. */
  photo_paths: string[]
  audio_path: string | null
  audio_duration_s: number | null
  visitor_count: number
  founder_handles: string[]
  status: 'locked' | 'arrived' | 'visited'
  visibility: 'friend' | 'fof'
  /** Metres from the viewer, or `null` when no position was supplied. */
  distance_m: number | null
  passed_by_handle: string | null
  passer_note: string | null
  /** Only ever populated for the finder; RLS says the same independently. */
  health: HauntHealthRow | null
  lineage: LineageEntryRow[]
}

/** The `profile_snapshot()` payload. */
export interface ProfileSnapshotRow {
  handle: string
  vibes: string[]
  onboarded: boolean
  member_since: string
  haunts_dropped: number
  haunts_visited: number
  haunts_passed_on: number
}

/** One row of `friend_list()`. */
export interface FriendRow {
  handle: string
  vibes: string[]
  mutual_count: number
}

export interface NotificationRow {
  id: string
  kind: 'visit' | 'pass' | 'anon'
  haunt_id: string
  body: string
  created_at: string
  read_at: string | null
  actor: { handle: string } | null
}

export interface KeepsakeRow {
  id: string
  haunt_id: string
  collected_at: string
  sigil_path: PointRow[] | null
  haunt: {
    name: string
    photo_gradient: string
    finder: { handle: string } | null
  } | null
}

/** One row of `friend_requests()`. */
export interface FriendRequestRow {
  handle: string
  direction: 'incoming' | 'outgoing'
}
