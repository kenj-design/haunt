/**
 * The link an invitation carries.
 *
 * One place, because three screens hand it out and `AppProvider` reads it back
 * on boot — and because it used to be a hardcoded `haunt.place` domain that
 * nobody owns, so every invite ever sent was dead.
 */

/** Where an invite points: this app, with a handle to ask about. */
export function inviteLink(handle: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const trimmed = handle.trim().replace(/^@/, '')
  return `${origin}/?add=${encodeURIComponent(trimmed || 'friend')}`
}

/** The same link, shortened for print — no protocol, since nobody reads it aloud. */
export function inviteLabel(handle: string): string {
  return inviteLink(handle).replace(/^https?:\/\//, '')
}
