/**
 * The snake_case / camelCase boundary.
 *
 * Everything above this file speaks the domain model; everything below speaks
 * Postgres. Keeping the translation in one place is what lets the schema and the
 * app model evolve at different speeds — and it is where the joins, the handle
 * decoration, and the timestamp-to-words conversion get to live once each.
 */

import type {
  CurrentUser,
  Friend,
  Haunt,
  HauntDraft,
  HauntStatus,
  Keepsake,
  LineageEntry,
  Notification,
  ShroudTemperament,
} from '../../domain'
import { distanceLabel, monthYear, relativeTime } from '../../lib/time'
import type {
  FriendRow,
  HauntFeedRow,
  KeepsakeRow,
  LineageEntryRow,
  NotificationRow,
  ProfileSnapshotRow,
} from './rows'

/** Anyone the viewer may not name reads as an unattributed mark in the chain. */
const ANONYMOUS_HANDLE = '@someone'

function toLineageEntry(row: LineageEntryRow): LineageEntry {
  return {
    handle: row.handle ?? ANONYMOUS_HANDLE,
    role: row.role,
    action: row.action,
    time: relativeTime(row.happened_at),
    note: row.note ?? undefined,
  }
}

/**
 * Builds the app's flat `Haunt` from one feed row.
 *
 * `signedPhotoUrls` comes in separately because signing is a round trip of its
 * own: the feed returns storage keys, and the data source batches them into one
 * `createSignedUrls` call rather than one per haunt.
 */
export function toHaunt(row: HauntFeedRow, signedPhotoUrls: string[] = []): Haunt {
  return {
    id: row.id,
    name: row.name,
    // A shrouded haunt has no finder to name, and the UI shows '???' either way.
    finderHandle: row.finder_handle ?? '???',
    vibeTags: row.vibe_tags,
    bestTimeTags: row.best_time_tags,
    story: row.story,
    arrivalNote: row.arrival_note,
    arrivalNoteKind: row.arrival_note_kind,
    arrivalNoteAudioUrl: row.arrival_note_audio_path ?? undefined,
    arrivalNoteAudioDuration: row.arrival_note_audio_duration_s ?? undefined,
    audience: row.audience,
    lifespan: row.lifespan,
    expiresAt: row.expires_on ?? undefined,
    sleepUntil: row.sleep_until ?? undefined,
    retired: row.retired,
    // The exact point never leaves the database; `zone_lat`/`zone_lng` are
    // snapped to a grid as wide as the radius. `x`/`y` belong to the prototype's
    // abstract plane and have no meaning here, so they stay at the origin.
    zone: {
      x: 0,
      y: 0,
      radiusM: row.zone_radius_m,
      lat: row.zone_lat ?? undefined,
      lng: row.zone_lng ?? undefined,
    },
    shroudPath: row.shroud_path ?? undefined,
    shroudSeed: row.shroud_seed ?? undefined,
    shroudTemperament: clampTemperament(row.shroud_temperament),
    sigilPath: row.sigil_path ?? undefined,
    photoGradient: row.photo_gradient,
    photoUrls: signedPhotoUrls,
    audioUrl: row.audio_path ?? undefined,
    audioDuration: row.audio_duration_s ?? undefined,
    visitorCount: row.visitor_count,
    residues: [],
    lineage: row.lineage.map(toLineageEntry),
    founders: row.founder_handles,
    health: row.health
      ? {
          score: row.health.score,
          velocity: row.health.velocity,
          networkDistance: row.health.network_distance,
          conversion: row.health.conversion,
        }
      : // Not the finder, so the numbers were never sent. Zeroes here are a
        // placeholder the UI never reads: it only renders health when isOwn.
        { score: 0, velocity: 0, networkDistance: 0, conversion: 0 },
    status: row.status as HauntStatus,
    visibility: row.visibility,
    distanceLabel: distanceLabel(row.distance_m, row.zone_radius_m),
    passedByHandle: row.passed_by_handle ?? undefined,
    passerNote: row.passer_note,
  }
}

function clampTemperament(value: number): ShroudTemperament {
  const rounded = Math.max(0, Math.min(3, Math.round(value)))
  return rounded as ShroudTemperament
}

export function toCurrentUser(row: ProfileSnapshotRow): CurrentUser {
  return {
    handle: row.handle,
    hauntsDropped: row.haunts_dropped,
    hauntsVisited: row.haunts_visited,
    hauntsPassedOn: row.haunts_passed_on,
    vibes: row.vibes,
    memberSince: monthYear(row.member_since),
  }
}

export function toFriend(row: FriendRow): Friend {
  return { handle: row.handle, vibes: row.vibes, mutualCount: row.mutual_count }
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    text: row.body,
    time: relativeTime(row.created_at),
    hauntId: row.haunt_id,
    actorHandle: row.actor ? `@${row.actor.handle}` : null,
  }
}

export function toKeepsake(row: KeepsakeRow): Keepsake {
  return {
    id: row.id,
    hauntId: row.haunt_id,
    name: row.haunt?.name ?? '???',
    finderHandle: row.haunt?.finder ? `@${row.haunt.finder.handle}` : '???',
    collectedAt: monthYear(row.collected_at),
    photoGradient: row.haunt?.photo_gradient ?? '',
    sigilPath: row.sigil_path ?? undefined,
  }
}

/**
 * Turns a draft into the payload `drop_haunt` expects.
 *
 * The zone arrives as a real position rather than the prototype's plane
 * coordinates, so the caller supplies it — the draft has no idea where it is.
 */
export function toDropPayload(
  draft: HauntDraft,
  position: { lat: number; lng: number },
  photoPaths: string[],
): Record<string, unknown> {
  return {
    name: draft.name,
    story: '',
    arrival_note: draft.arrivalNote,
    arrival_note_kind: draft.arrivalNoteKind,
    arrival_note_audio_path: draft.arrivalNoteAudioUrl ?? null,
    arrival_note_audio_duration_s: draft.arrivalNoteAudioDuration ?? null,
    audience: draft.audience,
    lifespan: draft.lifespan,
    expires_on: null,
    lat: position.lat,
    lng: position.lng,
    zone_radius_m: draft.zone.radiusM,
    vibe_tags: draft.vibeTags,
    best_time_tags: draft.bestTimeTags,
    photo_gradient: draft.photoGradient,
    photo_paths: photoPaths,
    founded_with: draft.foundedWith,
  }
}
