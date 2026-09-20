/**
 * The application-state contract, and the hook screens read it through.
 *
 * Separate from `AppProvider.tsx` on purpose. React Fast Refresh can only
 * hot-update a module whose exports are all components, so a file exporting both
 * the provider and this hook gets invalidated on every edit — forcing a full
 * remount, during which stale children briefly render against a torn-down
 * context and throw. Splitting the two keeps edits to either side fast and quiet.
 */

import { createContext, useContext } from 'react'
import type {
  CurrentUser,
  Friend,
  FriendRequest,
  Haunt,
  HauntDraft,
  Keepsake,
  Notification,
} from '../domain'
import type { UserLocation } from '../lib/geo'

export type Screen =
  | { name: 'map' }
  | { name: 'profile' }
  | { name: 'haunt'; hauntId: string }
  | { name: 'lineage'; hauntId: string }
  | { name: 'pass'; hauntId: string }
  | { name: 'drop' }
  | { name: 'notifications' }
  | { name: 'recovery' }
  | { name: 'design' }
  | { name: 'recovery-preview' }
  | { name: 'sign-in-preview' }
  | { name: 'friend'; handle: string }

export type Tab = 'map' | 'profile'

export interface AppState {
  // --- data, as of the last snapshot or mutation response ---
  user: CurrentUser
  friends: Friend[]
  haunts: Haunt[]
  keepsakes: Keepsake[]
  notifications: Notification[]
  friendRequests: FriendRequest[]

  // --- account ---
  /**
   * True while this account exists only on this device.
   *
   * The shell blocks on it after onboarding: without a recovery code, losing
   * the device loses everything. Always false on a backend without accounts.
   */
  needsRecoveryCode: boolean
  /** Whether this backend has accounts. False on the mock backend. */
  hasAccounts: boolean
  /** Mints a recovery code and returns it once. Never callable twice for the same code. */
  createRecoveryCode: () => Promise<string>
  /** Marks the code as saved, releasing the shell. */
  confirmRecoveryCodeSaved: () => void

  // --- session + navigation ---
  onboarded: boolean
  screen: Screen
  tab: Tab
  /** Haunt to flash on the map right after it is dropped. */
  focusHauntId: string | null
  /** Haunt the app thinks you walked past without logging. */
  missedVisitId: string | null
  notificationsUnread: boolean
  /** The last browser position granted by the person, kept in memory only. */
  location: UserLocation | null

  // --- request state ---
  /** True while any mutation is in flight. */
  isBusy: boolean
  /** The last action failure, in words a person can read. */
  error: string | null
  dismissError: () => void

  /*
   * Actions. Every mutation resolves to whether the change landed — as a flag,
   * or as the record itself where the caller needs it — so a screen that moves
   * on success can wait for the answer instead of assuming it. `PassHaunt` shows
   * its confirmation that way, and `DropHaunt` hands its photo URLs over. Callers
   * with nothing to decide may fire and forget; failures surface through `error`
   * either way.
  */
  completeOnboarding: (handle: string) => Promise<boolean>
  /** Claims a handle early so onboarding can show availability before advancing. */
  claimOnboardingHandle: (handle: string) => Promise<string | null>
  /** Asks for location only when a location-dependent screen is entered. */
  requestLocation: () => Promise<boolean>
  /**
   * Pushes a screen, or with `replace` swaps the current one for it.
   *
   * Replacing is for a screen that has finished its job and should not be
   * returned to: the drop flow hands its new haunt straight to `pass`, and
   * going back to an emptied form would be a dead end.
   */
  navigate: (screen: Screen, options?: { replace?: boolean }) => void
  goBack: () => void
  setTab: (tab: Tab) => void
  arrive: (hauntId: string) => Promise<boolean>
  logVisit: (hauntId: string) => Promise<boolean>
  /**
   * Leaves a haunt, resolving to the record itself rather than to a flag.
   *
   * The drop screen needs it: the fog only lifts onto a confirmation once there
   * is something to confirm, and that confirmation names the place. `null` means
   * the drop did not land, and `error` says why.
   */
  dropHaunt: (draft: HauntDraft) => Promise<Haunt | null>
  shareHaunt: (hauntId: string, story: string) => Promise<boolean>
  passHaunt: (hauntId: string, toHandle: string, note: string) => Promise<boolean>
  sendFriendRequest: (handle: string) => Promise<boolean>
  acceptRequest: (handle: string) => Promise<boolean>
  ignoreRequest: (handle: string) => Promise<boolean>
  markNotificationsRead: () => Promise<boolean>
  dismissMissedVisit: () => Promise<boolean>
  confirmMissedVisit: () => Promise<boolean>
  clearFocusHaunt: () => void
}


export const AppContext = createContext<AppState | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
