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
  signIn: 'in-signin.jpg',
  onboardOpen: 'in-onboard-1.jpg',
  onboardPassed: 'in-onboard-2.jpg',
  onboardName: 'in-onboard-3.jpg',
  onboardEdge: 'in-onboard-4.jpg',
  onboardInvite: 'in-onboard-5.jpg',
  onboardWaiting: 'in-onboard-6.jpg',
  recovery: 'in-recovery.jpg',
  arrived: 'moment-arrived.jpg',
  dark: 'state-dark.jpg',
  mapEmpty: 'state-map-empty.jpg',
  newsEmpty: 'state-news-empty.jpg',
  keepsakesEmpty: 'state-keepsakes-empty.jpg',
  friendsEmpty: 'state-friends-empty.jpg',
  chainEmpty: 'state-chain-empty.jpg',
  passed: 'moment-passed.jpg',
  left: 'moment-left.jpg',
  sealed: 'moment-sealed.jpg',
  unknown: 'moment-unknown.jpg',
  paper: 'paper-tile.jpg',
} as const

export type ArtSlot = keyof typeof ART

export function artUrl(slot: ArtSlot): string {
  return `/art/${ART[slot]}`
}
