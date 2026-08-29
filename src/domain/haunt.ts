/**
 * The haunt domain model.
 *
 * Field names are camelCase here and snake_case in Postgres; the mapping lives
 * in the data layer (`src/data`), never in a screen. Anything marked
 * "viewer-resolved" is not a column on the `haunts` table — the server composes
 * it per request from the viewer's visits, passes, social graph, or location.
 */

/** A point in 0–1 space, so hand-drawn shapes replay at any render size. */
export interface NormalizedPoint {
  x: number
  y: number
}

/** The viewer's own relationship to a haunt, not a property of the haunt. */
export type HauntStatus = 'locked' | 'arrived' | 'visited'

/** How the haunt reached this viewer: directly from a friend, or one hop out. */
export type HauntVisibility = 'friend' | 'fof'

/** Who the finder opened the haunt up to. */
export type HauntAudience = 'self' | 'circle' | 'wanderers'

/** Whether a haunt persists, burns after one visit, or has a last day. */
export type HauntLifespan = 'lasting' | 'single' | 'dated'

/** Arrival notes are text or voice; `null` means the finder left none. */
export type ArrivalNoteKind = 'text' | 'audio' | null

export type LineageRole = 'finder' | 'passer' | 'visitor' | 'you' | 'anon'

/** Picks which of the four shroud shader personalities a haunt renders with. */
export type ShroudTemperament = 0 | 1 | 2 | 3

export type ResidueMark = 'ring' | 'cross' | 'spark' | 'wave'

/**
 * A haunt's vague area — never its exact spot.
 *
 * `x`/`y` are 0–100 coordinates on the prototype's abstract plane, projected
 * onto real latitude/longitude by `src/lib/geo.ts`. Production replaces both
 * with a PostGIS `geography(Point)` plus this radius; see `docs/supabase.md`.
 */
export interface HauntZone {
  x: number
  y: number
  radiusM: number
  /**
   * Real coordinates, when the backend supplies them.
   *
   * Deliberately coarse — the server snaps the centre to a grid the size of the
   * radius, so this locates the area and not the place. Absent on the mock
   * backend, where `x`/`y` are projected instead.
   */
  lat?: number
  lng?: number
}

export interface LineageEntry {
  handle: string
  role: LineageRole
  action: string
  /** Pre-formatted for display ("2 days ago"). Becomes a timestamp with the API. */
  time: string
  note?: string
}

/** A small mark a visitor leaves behind at a haunt. */
export interface HauntResidue {
  id: string
  author: string
  color: string
  mark: ResidueMark
  time: string
}

/**
 * Private telemetry, visible only to the haunt's finder.
 *
 * Everyone else perceives `score` indirectly, as how densely the zone is
 * shrouded on their map. Belongs behind its own row-level security policy.
 */
export interface HauntHealth {
  /** 0–100 composite of the three signals below. */
  score: number
  /** 50% weight — how fast visitors are arriving right now. */
  velocity: number
  /** 30% weight — closeness within the finder's friend circle. */
  networkDistance: number
  /** 20% weight — how many passed invitations turn into visits. */
  conversion: number
}

export interface Haunt {
  id: string
  name: string
  finderHandle: string
  vibeTags: string[]
  bestTimeTags: string[]
  /** Why this place matters — shown once the haunt is shared. */
  story: string
  /** Kept sealed until someone physically arrives. */
  arrivalNote: string
  arrivalNoteKind: ArrivalNoteKind
  arrivalNoteAudioUrl?: string
  /** Seconds. */
  arrivalNoteAudioDuration?: number
  audience: HauntAudience
  lifespan: HauntLifespan
  /** ISO date (YYYY-MM-DD); only meaningful when `lifespan` is 'dated'. */
  expiresAt?: string
  /** ISO datetime the haunt rests until, hiding it from maps in the meantime. */
  sleepUntil?: string
  retired: boolean
  zone: HauntZone
  shroudPath?: NormalizedPoint[]
  shroudSeed?: number
  shroudTemperament: ShroudTemperament
  sigilPath?: NormalizedPoint[]
  /** CSS gradient standing in for artwork wherever no photo exists. */
  photoGradient: string
  /** First entry is the cover. Local `blob:` URLs never survive a reload. */
  photoUrls: string[]
  audioUrl?: string
  /** Seconds. */
  audioDuration?: number
  visitorCount: number
  residues: HauntResidue[]
  lineage: LineageEntry[]
  /** Everyone who found it. A solo find holds just the finder. */
  founders: string[]
  health: HauntHealth

  /** Viewer-resolved: from the viewer's row in `visits`. */
  status: HauntStatus
  /** Viewer-resolved: how many hops through the social graph this took. */
  visibility: HauntVisibility
  /** Viewer-resolved: pre-formatted ("1.2 km"). Computed from the viewer's position. */
  distanceLabel: string
  /** Viewer-resolved: who passed it to this viewer, if anyone did. */
  passedByHandle?: string
  /** Viewer-resolved: the note that came with that pass. */
  passerNote: string | null
}

/** True when more than one person was there for the finding. */
export function isGroupFounded(haunt: Pick<Haunt, 'founders'>): boolean {
  return haunt.founders.length > 1
}

/**
 * Whether a haunt should appear on a map right now.
 *
 * Retired haunts are gone for good; dated ones lapse at the end of their last
 * day; sleeping ones return on their own. Production runs the same rules
 * server-side so a client can't surface an expired haunt.
 */
export function isHauntActive(haunt: Haunt, now = Date.now()): boolean {
  if (haunt.retired) return false
  if (haunt.expiresAt && new Date(`${haunt.expiresAt}T23:59:59`).getTime() < now) return false
  if (haunt.sleepUntil && new Date(haunt.sleepUntil).getTime() > now) return false
  return true
}

/**
 * What a person actually fills in when leaving a haunt.
 *
 * Everything else on `Haunt` — id, lineage, counters, health, the viewer's own
 * status — is derived or server-owned, which is why the drop screen hands over
 * a draft rather than a finished record.
 */
export interface HauntDraft {
  name: string
  vibeTags: string[]
  bestTimeTags: string[]
  arrivalNote: string
  arrivalNoteKind: ArrivalNoteKind
  arrivalNoteAudioUrl?: string
  arrivalNoteAudioDuration?: number
  zone: HauntZone
  lifespan: HauntLifespan
  audience: HauntAudience
  photoGradient: string
  photoUrls: string[]
  /** Anyone else who was there for the finding, excluding the finder. */
  foundedWith: string[]
}

/**
 * Builds a complete haunt from a draft.
 *
 * Pure on purpose: the id and finder come in as arguments so the same logic
 * works whether ids are minted locally or returned by an insert. A server
 * implementation replaces the derived fields below with real ones and keeps
 * the lineage rules identical.
 */
export function newHauntFromDraft(
  draft: HauntDraft,
  { id, finderHandle }: { id: string; finderHandle: string },
): Haunt {
  const foundTogether = draft.foundedWith.length > 0
  const lineage: LineageEntry[] = foundTogether
    ? [
        { handle: finderHandle, role: 'you', action: 'founded together', time: 'just now' },
        ...draft.foundedWith.map((handle) => ({
          handle,
          role: 'visitor' as const,
          action: 'founded together',
          time: 'just now',
        })),
      ]
    : [{ handle: finderHandle, role: 'you', action: 'found this place', time: 'just now' }]

  return {
    id,
    name: draft.name,
    finderHandle,
    vibeTags: draft.vibeTags,
    bestTimeTags: draft.bestTimeTags,
    story: '',
    arrivalNote: draft.arrivalNote,
    arrivalNoteKind: draft.arrivalNoteKind,
    arrivalNoteAudioUrl: draft.arrivalNoteAudioUrl,
    arrivalNoteAudioDuration: draft.arrivalNoteAudioDuration,
    audience: draft.audience,
    lifespan: draft.lifespan,
    retired: false,
    zone: draft.zone,
    shroudTemperament: 0,
    photoGradient: draft.photoGradient,
    photoUrls: draft.photoUrls,
    visitorCount: 1,
    residues: [],
    lineage,
    founders: foundTogether ? [finderHandle, ...draft.foundedWith] : [finderHandle],
    // A brand-new haunt is at full clarity: nobody has worn a path to it yet.
    health: { score: 100, velocity: 100, networkDistance: 100, conversion: 100 },
    // The finder has by definition already arrived, and is standing there now.
    status: 'visited',
    visibility: 'friend',
    distanceLabel: 'here',
    passerNote: null,
  }
}
