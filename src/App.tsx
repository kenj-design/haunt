/**
 * The shell: a phone frame, a two-tab rail, and a switch over the current screen.
 *
 * Navigation is a stack in `AppContext` rather than a router. The prototype has
 * no URLs to speak of and every screen is reached from the map or the profile,
 * so a stack models it honestly and skips the dependency.
 */
import { Map as MapIcon, User, X } from 'lucide-react'
import AppProvider from './context/AppProvider'
import { useApp } from './context/appState'
import Onboarding from './screens/Onboarding'
import MapScreen from './screens/MapScreen'
import HauntDetail from './screens/HauntDetail'
import DropHaunt from './screens/DropHaunt'
import Lineage from './screens/Lineage'
import PassHaunt from './screens/PassHaunt'
import Profile from './screens/Profile'
import Notifications from './screens/Notifications'
import PhoneFrame from './components/PhoneFrame'
import SaveRecoveryCode from './screens/SaveRecoveryCode'
import DesignPreview from './screens/DesignPreview'
import SignIn from './screens/SignIn'

function TabBar() {
  const { tab, setTab, screen } = useApp()
  if (screen.name !== 'map' && screen.name !== 'profile') return null
  return (
    <nav
      className={`app-tab-surface pointer-events-none absolute left-1/2 z-[55] -translate-x-1/2 rounded-full p-1.5 ${screen.name === 'map' ? 'bottom-[126px]' : 'bottom-5'}`}
      aria-label="primary navigation"
    >
      <div className="pointer-events-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTab('map')}
          aria-current={tab === 'map' ? 'page' : undefined}
          title="Map"
          className={`app-tab-floater-item pressable ${tab === 'map' ? 'is-active' : ''}`}
        >
          <MapIcon size={17} strokeWidth={tab === 'map' ? 1.8 : 1.45} />
          <span className="sr-only">Map</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('profile')}
          aria-current={tab === 'profile' ? 'page' : undefined}
          title="Profile"
          className={`app-tab-floater-item pressable ${tab === 'profile' ? 'is-active' : ''}`}
        >
          <User size={18} strokeWidth={tab === 'profile' ? 1.8 : 1.45} />
          <span className="sr-only">Profile</span>
        </button>
      </div>
    </nav>
  )
}

/**
 * Surfaces a failed action without interrupting what the person was doing.
 *
 * Mutations don't roll the UI back on failure — the cached snapshot simply
 * never took the change, so the screen still shows the truth and this explains
 * why nothing moved.
 */
function ErrorToast() {
  const { error, dismissError } = useApp()
  if (!error) return null
  return (
    <div
      role="alert"
      /* Sits at the bottom, above the home indicator: the top of the frame is
         already busy with the map's controls and the missed-visit prompt. */
      className="glass-panel banner-in absolute inset-x-4 bottom-6 z-[60] flex items-center gap-3 rounded-[22px] px-4 py-3"
    >
      <p className="flex-1 text-[12px] leading-snug text-ink">{error}</p>
      <button
        type="button"
        onClick={dismissError}
        aria-label="dismiss"
        className="pressable shrink-0 cursor-pointer text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        <X size={14} strokeWidth={1.6} />
      </button>
    </div>
  )
}

/** The profile's route into replacing a code. */
function RecoveryCodeScreen() {
  const { createRecoveryCode, goBack } = useApp()
  return (
    <SaveRecoveryCode
      variant="replace"
      createCode={createRecoveryCode}
      onDone={goBack}
      onBack={goBack}
    />
  )
}

function RecoveryPreviewScreen() {
  const { goBack } = useApp()
  return (
    <SaveRecoveryCode
      createCode={async () => 'HAUN-TDES-IGN0-0001'}
      onDone={goBack}
    />
  )
}

function SignInPreviewScreen() {
  const { goBack } = useApp()
  return <SignIn onStartFresh={async () => goBack()} onRecoverWithCode={async () => goBack()} />
}

function Router() {
  const { screen } = useApp()
  switch (screen.name) {
    case 'map':
      return <MapScreen />
    case 'profile':
      return <Profile variant="own" />
    case 'friend':
      return <Profile variant="friend" handle={screen.handle} />
    case 'haunt':
      return <HauntDetail hauntId={screen.hauntId} />
    case 'lineage':
      return <Lineage hauntId={screen.hauntId} />
    case 'pass':
      return <PassHaunt hauntId={screen.hauntId} />
    case 'drop':
      return <DropHaunt />
    case 'notifications':
      return <Notifications />
    case 'recovery':
      return <RecoveryCodeScreen />
    case 'design':
      return <DesignPreview />
    case 'recovery-preview':
      return <RecoveryPreviewScreen />
    case 'sign-in-preview':
      return <SignInPreviewScreen />
  }
}

function Shell() {
  const { onboarded, needsRecoveryCode, createRecoveryCode, confirmRecoveryCodeSaved } =
    useApp()
  return (
    <PhoneFrame>
        {/*
          Three gates, in order. Onboarding claims a handle; the recovery code
          makes the account portable; only then does the map open. The middle one
          comes after onboarding rather than before, because a code is worth
          saving once there is something behind it — and it is skipped entirely
          on a backend without accounts.
        */}
        {!onboarded ? (
          <Onboarding />
        ) : needsRecoveryCode ? (
          <SaveRecoveryCode
            createCode={createRecoveryCode}
            onDone={confirmRecoveryCodeSaved}
          />
        ) : (
          <>
            <div className="relative flex-1 overflow-hidden">
              <Router />
            </div>
            <TabBar />
            <span className="pointer-events-none absolute bottom-1.5 left-1/2 z-50 h-1 w-28 -translate-x-1/2 rounded-full bg-white/75" />
          </>
        )}
        <ErrorToast />
    </PhoneFrame>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
