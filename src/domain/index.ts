/** Barrel for the domain model. Screens import from here, never from `src/data`. */

export type {
  ArrivalNoteKind,
  Haunt,
  HauntAudience,
  HauntHealth,
  HauntLifespan,
  HauntResidue,
  HauntStatus,
  HauntVisibility,
  HauntZone,
  LineageEntry,
  LineageRole,
  NormalizedPoint,
  ResidueMark,
  ShroudTemperament,
} from './haunt'
export type { HauntDraft } from './haunt'
export { isGroupFounded, isHauntActive, newHauntFromDraft } from './haunt'

export type {
  CurrentUser,
  Friend,
  FriendRequest,
  Keepsake,
  Notification,
  NotificationKind,
} from './social'

export type { BestTimeTag, VibeTag } from './tags'
export { BEST_TIME_TAGS, GRADIENT_SWATCHES, VIBE_TAGS } from './tags'
