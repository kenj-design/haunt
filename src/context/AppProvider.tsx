import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import BootScreen from '../components/BootScreen'
import PhoneFrame from '../components/PhoneFrame'
import SignIn from '../screens/SignIn'
import { createAuthGateway } from '../data/auth'
import type { AuthGateway } from '../data/auth'
import { createDataSource, toDataError } from '../data'
import type { AppSnapshot, HauntDataSource } from '../data'
import type { Haunt, HauntDraft } from '../domain'
import { AppContext } from './appState'
import type { AppState, Screen, Tab } from './appState'

/**
 * Holds the application's state and hands it to the tree.
 *
 * Two things and nothing else: a cache of the last snapshot the backend gave us,
 * and where the person is in the app. Every rule about what a mutation *means*
 * lives in the data source, so this file stays the same whichever backend runs.
 *
 * The contract screens read is in `appState.ts`, next door — see the note there
 * for why the hook is not in this file.
 */

/** `?onboarding=1` replays the intro without clearing anything else. */
function shouldPreviewOnboarding() {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('onboarding')
  return value === '1' || value === 'true'
}

/** `signed-out` is a destination, not a failure: it renders the way in. */
type BootStatus = 'loading' | 'signed-out' | 'ready' | 'error'

export function AppProvider({ children }: { children: ReactNode }) {
  // One data source for the life of the app, built during boot because the
  // Supabase adapter is imported on demand. Swapping backends is a config change
  // inside `createDataSource`, not a change here.
  const dataSourceRef = useRef<HauntDataSource>(undefined)
  // `null` once resolved means this backend has no accounts, so there is no
  // sign-in step and nothing to recover.
  const authGatewayRef = useRef<AuthGateway | null | undefined>(undefined)

  /**
   * The live data source.
   *
   * Actions can only run once children have mounted, which happens only after
   * boot succeeded — so this is always populated by the time it is called. The
   * guard is here to fail loudly rather than silently if that ever stops holding.
   */
  const source = useCallback((): HauntDataSource => {
    const dataSource = dataSourceRef.current
    if (!dataSource) throw new Error('the app is still starting up')
    return dataSource
  }, [])

  const previewOnboarding = useMemo(shouldPreviewOnboarding, [])

  const [status, setStatus] = useState<BootStatus>('loading')
  const [bootError, setBootError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)

  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [needsRecoveryCode, setNeedsRecoveryCode] = useState(false)
  const [hasAccounts, setHasAccounts] = useState(false)

  const [tab, setTabState] = useState<Tab>('map')
  const [stack, setStack] = useState<Screen[]>([{ name: 'map' }])
  const [focusHauntId, setFocusHauntId] = useState<string | null>(null)

  // --- boot -----------------------------------------------------------------

  const boot = useCallback(async () => {
    setStatus('loading')
    setBootError(null)
    try {
      if (authGatewayRef.current === undefined) {
        authGatewayRef.current = await createAuthGateway()
      }
      const gateway = authGatewayRef.current
      setHasAccounts(gateway !== null)

      if (gateway) {
        const session = await gateway.currentSession()
        if (!session) {
          setStatus('signed-out')
          return
        }
        setNeedsRecoveryCode(session.needsRecoveryCode)
      }

      dataSourceRef.current ??= await createDataSource()
      const loaded = await dataSourceRef.current.loadSnapshot()
      setSnapshot(loaded)
      setTabState('map')
      setStack([{ name: 'map' }])
      setStatus('ready')
    } catch (cause) {
      setBootError(toDataError(cause, "couldn't reach your places").message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  /**
   * Runs a mutation, folding its response into the cached snapshot.
   *
   * `apply` receives the response and the snapshot as it was, and returns the
   * fields that changed — so a mutation only ever writes what the backend
   * actually confirmed.
   */
  const mutate = useCallback(
    async <T,>(
      request: () => Promise<T>,
      apply: (result: T, current: AppSnapshot) => Partial<AppSnapshot>,
      failureMessage: string,
      onSuccess?: (result: T) => void,
    ): Promise<boolean> => {
      setPendingCount((count) => count + 1)
      setError(null)
      try {
        const result = await request()
        setSnapshot((current) => (current ? { ...current, ...apply(result, current) } : current))
        onSuccess?.(result)
        return true
      } catch (cause) {
        setError(toDataError(cause, failureMessage).message)
        return false
      } finally {
        setPendingCount((count) => count - 1)
      }
    },
    [],
  )

  // --- navigation -----------------------------------------------------------

  const navigate = useCallback((next: Screen, options?: { replace?: boolean }) => {
    setStack((current) =>
      options?.replace ? [...current.slice(0, -1), next] : [...current, next],
    )
  }, [])

  const goBack = useCallback(() => {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  }, [])

  const setTab = useCallback((next: Tab) => {
    setTabState(next)
    setStack([{ name: next }])
  }, [])

  const clearFocusHaunt = useCallback(() => setFocusHauntId(null), [])

  // --- account ---------------------------------------------------------------

  /**
   * Signing in re-runs boot, which is what turns a session into a loaded app.
   *
   * These are handed to `SignIn` as plain callbacks rather than the gateway
   * itself, so a screen never holds a piece of the data layer.
   */
  const startFresh = useCallback(async () => {
    await authGatewayRef.current?.startFresh()
    await boot()
  }, [boot])

  const recoverWithCode = useCallback(
    async (code: string) => {
      await authGatewayRef.current?.signInWithRecoveryCode(code)
      await boot()
    },
    [boot],
  )

  const createRecoveryCode = useCallback(async () => {
    const gateway = authGatewayRef.current
    if (!gateway) throw new Error('this backend has no accounts')
    return gateway.createRecoveryCode()
  }, [])

  // The account is no longer device-only, so the shell stops blocking on it.
  const confirmRecoveryCodeSaved = useCallback(() => setNeedsRecoveryCode(false), [])
  const dismissError = useCallback(() => setError(null), [])

  // --- session --------------------------------------------------------------

  const completeOnboarding = useCallback(
    async (handle: string) => {
      const claimed = await mutate(
        () => source().completeOnboarding(handle),
        // Replaces the snapshot wholesale: the new handle is woven through
        // lineage entries and founder lists, not just the user row.
        (next) => next,
        "couldn't claim that handle",
      )
      if (claimed && previewOnboarding) {
        // Drop the preview flag so a reload doesn't replay the intro forever.
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
      }
      return claimed
    },
    [mutate, source, previewOnboarding],
  )

  // --- haunts ---------------------------------------------------------------

  const replaceHaunt = (haunt: Haunt, current: AppSnapshot) => ({
    haunts: current.haunts.map((existing) => (existing.id === haunt.id ? haunt : existing)),
  })

  const arrive = useCallback(
    (hauntId: string) =>
      mutate(() => source().arriveAtHaunt(hauntId), replaceHaunt, "couldn't mark you as here"),
    [mutate, source],
  )

  const logVisit = useCallback(
    (hauntId: string) =>
      mutate(
        () => source().logVisit(hauntId),
        ({ haunt, keepsake, user }, current) => ({
          ...replaceHaunt(haunt, current),
          user,
          keepsakes: keepsake ? [keepsake, ...current.keepsakes] : current.keepsakes,
          missedVisitId: current.missedVisitId === hauntId ? null : current.missedVisitId,
        }),
        "couldn't log that visit",
      ),
    [mutate, source],
  )

  /*
   * Stays on the drop screen deliberately.
   *
   * The screen keeps its own aftermath — the fog holds, then lifts onto a
   * confirmation — so navigating away from here would cut the ceremony short and
   * unmount the shroud mid-flood. The haunt comes back so that screen can name
   * the place it just made.
   */
  const dropHaunt = useCallback(
    async (draft: HauntDraft): Promise<Haunt | null> => {
      let dropped: Haunt | null = null
      const landed = await mutate(
        () => source().dropHaunt(draft),
        ({ haunt, user }, current) => ({ haunts: [...current.haunts, haunt], user }),
        "couldn't leave that haunt",
        ({ haunt }) => {
          dropped = haunt
          // Flashes whenever the map is next opened, so a new haunt is findable
          // without having to open it now.
          setFocusHauntId(haunt.id)
        },
      )
      return landed ? dropped : null
    },
    [mutate, source],
  )

  const shareHaunt = useCallback(
    (hauntId: string, story: string) =>
      mutate(
        () => source().shareHaunt(hauntId, story),
        replaceHaunt,
        "couldn't share that haunt",
      ),
    [mutate, source],
  )

  const passHaunt = useCallback(
    (hauntId: string, toHandle: string, note: string) =>
      mutate(
        () => source().passHaunt(hauntId, toHandle, note),
        ({ haunt, user }, current) => ({ ...replaceHaunt(haunt, current), user }),
        "couldn't pass that haunt",
      ),
    [mutate, source],
  )

  // --- people ---------------------------------------------------------------

  const sendFriendRequest = useCallback(
    (handle: string) =>
      mutate(
        () => source().sendFriendRequest(handle),
        ({ requests, friend }, current) => ({
          friendRequests: requests,
          // Non-null when the ask answered a request already waiting from them.
          friends:
            friend && !current.friends.some((existing) => existing.handle === friend.handle)
              ? [...current.friends, friend]
              : current.friends,
        }),
        "couldn't ask to know them",
      ),
    [mutate, source],
  )

  const acceptRequest = useCallback(
    (handle: string) =>
      mutate(
        () => source().acceptFriendRequest(handle),
        (friend, current) => ({
          friends: [...current.friends, friend],
          friendRequests: current.friendRequests.filter((r) => r.handle !== handle),
        }),
        "couldn't accept that request",
      ),
    [mutate, source],
  )

  const ignoreRequest = useCallback(
    (handle: string) =>
      mutate(
        () => source().ignoreFriendRequest(handle),
        (_result, current) => ({
          friendRequests: current.friendRequests.filter((r) => r.handle !== handle),
        }),
        "couldn't dismiss that request",
      ),
    [mutate, source],
  )

  // --- prompts --------------------------------------------------------------

  const markNotificationsRead = useCallback(
    () =>
      mutate(
        () => source().markNotificationsRead(),
        () => ({ notificationsUnread: false }),
        "couldn't update your news",
      ),
    [mutate, source],
  )

  const dismissMissedVisit = useCallback(async () => {
    const hauntId = snapshot?.missedVisitId
    if (!hauntId) return false
    return mutate(
      () => source().dismissMissedVisit(hauntId),
      () => ({ missedVisitId: null }),
      "couldn't dismiss that prompt",
    )
  }, [mutate, source, snapshot?.missedVisitId])

  const confirmMissedVisit = useCallback(async () => {
    const hauntId = snapshot?.missedVisitId
    if (!hauntId) return false
    return mutate(
      () => source().arriveAtHaunt(hauntId),
      (haunt, current) => ({ ...replaceHaunt(haunt, current), missedVisitId: null }),
      "couldn't mark you as here",
      () => navigate({ name: 'haunt', hauntId }),
    )
  }, [mutate, source, navigate, snapshot?.missedVisitId])

  // --- assembly -------------------------------------------------------------

  const value = useMemo<AppState | null>(() => {
    if (!snapshot) return null
    return {
      user: snapshot.user,
      friends: snapshot.friends,
      haunts: snapshot.haunts,
      keepsakes: snapshot.keepsakes,
      notifications: snapshot.notifications,
      friendRequests: snapshot.friendRequests,
      onboarded: previewOnboarding ? false : snapshot.onboarded,
      screen: stack[stack.length - 1],
      tab,
      focusHauntId,
      missedVisitId: snapshot.missedVisitId,
      notificationsUnread: snapshot.notificationsUnread,
      needsRecoveryCode,
      hasAccounts,
      createRecoveryCode,
      confirmRecoveryCodeSaved,
      isBusy: pendingCount > 0,
      error,
      dismissError,
      completeOnboarding,
      navigate,
      goBack,
      setTab,
      arrive,
      logVisit,
      dropHaunt,
      shareHaunt,
      passHaunt,
      sendFriendRequest,
      acceptRequest,
      ignoreRequest,
      markNotificationsRead,
      dismissMissedVisit,
      confirmMissedVisit,
      clearFocusHaunt,
    }
  }, [
    snapshot,
    previewOnboarding,
    stack,
    tab,
    focusHauntId,
    pendingCount,
    error,
    dismissError,
    needsRecoveryCode,
    hasAccounts,
    createRecoveryCode,
    confirmRecoveryCodeSaved,
    completeOnboarding,
    navigate,
    goBack,
    setTab,
    arrive,
    logVisit,
    dropHaunt,
    shareHaunt,
    passHaunt,
    sendFriendRequest,
    acceptRequest,
    ignoreRequest,
    markNotificationsRead,
    dismissMissedVisit,
    confirmMissedVisit,
    clearFocusHaunt,
  ])

  if (status === 'signed-out' && authGatewayRef.current) {
    return (
      <PhoneFrame>
        <SignIn onStartFresh={startFresh} onRecoverWithCode={recoverWithCode} />
      </PhoneFrame>
    )
  }

  // Screens only mount once there is data, so nothing downstream has to handle
  // a half-loaded app or null-check every field.
  if (status !== 'ready' || !value) {
    // 'signed-out' only reaches here if a gateway vanished between checks,
    // which would be a bug — show it as a failure rather than a blank wait.
    return (
      <BootScreen
        status={status === 'ready' ? 'loading' : status === 'signed-out' ? 'error' : status}
        error={bootError}
        onRetry={boot}
      />
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export default AppProvider
