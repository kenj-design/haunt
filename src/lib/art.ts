/**
 * The stamped pages in `public/art`, by the slot each one fills.
 *
 * Screens name a slot and never a path, so replacing a file — or the whole set,
 * or its format — is a change here and nowhere else.
 *
 * What each one is and how they are made: `docs/illustrations.md`. The current
 * files are placeholders cut from a contact sheet, so they are about 250px and
 * softer than they should be; full-resolution replacements drop in under the
 * same names.
 */
export const ART = {
  signIn: 'in-signin.png',
  onboardOpen: 'in-onboard-1.png',
  onboardPassed: 'in-onboard-2.png',
  onboardName: 'in-onboard-3.png',
  onboardEdge: 'in-onboard-4.png',
  onboardInvite: 'in-onboard-5.png',
  onboardWaiting: 'in-onboard-6.png',
  recovery: 'in-recovery.png',
  arrived: 'moment-arrived.png',
  dark: 'state-dark.png',
  mapEmpty: 'state-map-empty.png',
  newsEmpty: 'state-news-empty.png',
  keepsakesEmpty: 'state-keepsakes-empty.png',
  friendsEmpty: 'state-friends-empty.png',
  chainEmpty: 'state-chain-empty.png',
  passed: 'moment-passed.png',
  left: 'moment-left.png',
  sealed: 'moment-sealed.png',
  unknown: 'moment-unknown.png',
} as const

export type ArtSlot = keyof typeof ART

export function artUrl(slot: ArtSlot): string {
  return `/art/${ART[slot]}`
}
