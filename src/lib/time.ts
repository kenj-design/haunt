/**
 * Turning timestamps into the app's voice.
 *
 * The UI shows "2 days ago", never an ISO string, and the prototype's fixtures
 * are written that way already. A real backend sends timestamps, so this is
 * where they become words again — client-side, where the reader's clock is.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/**
 * How long ago something happened, in the app's lowercase register.
 *
 * Gets vaguer with distance on purpose: recent things are the ones worth being
 * precise about, and "oct 2024" says as much as any exact date would.
 */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const elapsed = now - then
  if (elapsed < 0) return 'just now'
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`
  if (elapsed < 2 * WEEK) return 'last week'

  const date = new Date(then)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "January 2025" — for the slower marks: keepsakes, join dates. */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/**
 * How far away a haunt is.
 *
 * Anything inside its own radius reads as "here" rather than a number, because
 * at that point the distance stopped being the interesting part.
 */
export function distanceLabel(metres: number | null | undefined, radiusM = 0): string {
  if (metres === null || metres === undefined || Number.isNaN(metres)) return ''
  if (metres <= radiusM) return 'here'
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`
  return `${(metres / 1000).toFixed(1)} km`
}
