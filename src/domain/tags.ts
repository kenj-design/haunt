/**
 * The closed vocabularies a haunt can be tagged with.
 *
 * Deliberately fixed: free-text tags would turn the map into a search index,
 * which is what Haunt is not. These become Postgres enums or a lookup table.
 */

export const VIBE_TAGS = [
  'quiet',
  'nature',
  'hidden',
  'weird',
  'historic',
  'view',
  'late night',
  'seasonal',
  'effort',
  'food',
  'water',
] as const

export const BEST_TIME_TAGS = [
  'morning',
  'afternoon',
  'evening',
  'night',
  'spring',
  'summer',
  'autumn',
  'winter',
  'any time',
] as const

export type VibeTag = (typeof VIBE_TAGS)[number]
export type BestTimeTag = (typeof BEST_TIME_TAGS)[number]

/** Fallback artwork for haunts with no photo. */
export const GRADIENT_SWATCHES = [
  'linear-gradient(150deg,#4a4a4f,#121214)',
  'linear-gradient(150deg,#3c3a43,#111114)',
  'linear-gradient(150deg,#433d39,#121112)',
  'linear-gradient(150deg,#344044,#101214)',
  'linear-gradient(150deg,#3b433d,#111312)',
  'linear-gradient(150deg,#40383c,#111012)',
]
