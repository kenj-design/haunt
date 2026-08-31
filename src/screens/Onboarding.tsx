/**
 * The way in: six steps from cold open to a claimed handle.
 *
 * The permission step asks for real permissions — the Contact Picker, the
 * Notification API, and geolocation — rather than miming the prompts. Each can
 * be declined without blocking anything, which is also the product's position:
 * everything here is optional except the handle.
 *
 * `?onboarding=1` replays this without clearing anything else, for looking at it
 * again without resetting the app.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  Check,
  Link2,
  MapPin,
  Share2,
  Sparkles,
  UserRoundPlus,
  X,
} from 'lucide-react'
import { useApp } from '../context/appState'
import { PrimaryButton } from '../components/ui'
import Stamp from '../components/Stamp'

type PermissionKind = 'notifications' | 'location'
/** `unsupported` is not a failure — it is a browser that has no such API. */
type PermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'

const TOTAL_STEPS = 6

/*
 * There was a third row here, asking for Contacts through the Contact Picker
 * API. It is gone, and not because it was hard: the API exists only in Chrome on
 * Android, and even where it works it hands back names and phone numbers with no
 * way to turn them into Haunt accounts — this app has no directory to look
 * anyone up in, by design. So it read an address book and did nothing with it,
 * while a green tick claimed otherwise on every browser that lacks the API. A
 * permission that cannot pay for itself should not be asked for.
 */
const PERMISSIONS: Array<{
  id: PermissionKind
  title: string
  description: string
  icon: typeof Bell
}> = [
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Hear when a friend passes you a place or a haunt wakes nearby.',
    icon: Bell,
  },
  {
    id: 'location',
    title: 'Location',
    description: 'Reveal a haunt only when you cross into its hidden edge.',
    icon: MapPin,
  },
]

/** What the browser already thinks, so the screen doesn't ask twice or lie once. */
function initialPermissions(): Record<PermissionKind, PermissionStatus> {
  const notifications: PermissionStatus =
    typeof Notification === 'undefined'
      ? 'unsupported'
      : Notification.permission === 'granted'
        ? 'granted'
        : Notification.permission === 'denied'
          ? 'denied'
          : 'idle'
  const location: PermissionStatus =
    typeof navigator !== 'undefined' && navigator.geolocation ? 'idle' : 'unsupported'
  return { notifications, location }
}

export default function Onboarding() {
  const { completeOnboarding, navigate, sendFriendRequest } = useApp()
  const [step, setStep] = useState(1)
  const [handle, setHandle] = useState('')
  const [query, setQuery] = useState('')
  /** Handles to ask about, sent for real once this handle is actually claimed. */
  const [invites, setInvites] = useState<string[]>([])
  const [shareStatus, setShareStatus] = useState('')
  const [permissions, setPermissions] =
    useState<Record<PermissionKind, PermissionStatus>>(initialPermissions)

  const claimed = handle.trim().length >= 3
  /*
   * A link back to this app, not to a domain nobody owns — it used to point at
   * haunt.place, which does not resolve. `?add=` is read on boot and turned into
   * a real request to know them; see AppProvider.
   */
  const inviteLink = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    return `${origin}/?add=${encodeURIComponent(handle.trim() || 'friend')}`
  }, [handle])

  const askable = PERMISSIONS.filter(
    (permission) => permissions[permission.id] !== 'unsupported',
  )
  const typedHandle = query.trim().replace(/^@/, '').toLowerCase()
  const canInvite =
    typedHandle.length >= 3 &&
    typedHandle !== handle.trim().toLowerCase() &&
    !invites.includes(typedHandle)

  // A browser can be asked about location without prompting for it.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let live = true
    void navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        if (!live || result.state === 'prompt') return
        setPermissions((current) => ({
          ...current,
          location: result.state === 'granted' ? 'granted' : 'denied',
        }))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const updatePermission = (kind: PermissionKind, status: PermissionStatus) => {
    setPermissions((current) => ({ ...current, [kind]: status }))
  }

  /**
   * Asks the browser, and reports exactly what it said.
   *
   * Nothing here ever reports success for an API that isn't there — a row for a
   * missing API is not rendered at all, and the old code's habit of ticking
   * those green was the whole bug.
   */
  const requestPermission = async (kind: PermissionKind) => {
    updatePermission(kind, 'requesting')

    try {
      if (kind === 'notifications') {
        const result = await Notification.requestPermission()
        updatePermission(kind, result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'idle')
        return
      }

      navigator.geolocation.getCurrentPosition(
        () => updatePermission(kind, 'granted'),
        (error) => updatePermission(kind, error.code === error.PERMISSION_DENIED ? 'denied' : 'idle'),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      )
    } catch (error) {
      const dismissed = error instanceof DOMException && error.name === 'AbortError'
      updatePermission(kind, dismissed ? 'idle' : 'denied')
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = inviteLink
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
    }
    setShareStatus('invite link copied')
  }

  const shareInvite = async () => {
    if (!navigator.share) {
      await copyInvite()
      return
    }
    try {
      await navigator.share({
        title: 'Come find me on Haunt',
        text: `I saved you a way into Haunt. Find me as @${handle.trim()}.`,
        url: inviteLink,
      })
      setShareStatus('invite sent into the wild')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setShareStatus('sharing is unavailable here')
      }
    }
  }

  const finish = async (dropFirst: boolean) => {
    // Only send someone to the drop screen once the handle is actually theirs;
    // otherwise they'd be leaving a haunt under a name that never landed.
    const handleClaimed = await completeOnboarding('@' + handle.trim())
    if (!handleClaimed) return
    // And only now do the invitations go out, so they arrive from the claimed
    // name rather than from the placeholder the account was created with. One at
    // a time: a handle that doesn't exist should say so on its own.
    for (const invite of invites) {
      await sendFriendRequest('@' + invite)
    }
    if (dropFirst) navigate({ name: 'drop' })
  }

  return (
    <div className="onboarding-shell relative flex h-full flex-col overflow-hidden bg-black px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <MysticAtmosphere />

      <header className="relative z-20 flex min-h-11 items-center justify-between">
        <div className="flex min-w-11 items-center">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              className="onboarding-icon-button pressable flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white/74"
              aria-label="go back"
            >
              <ArrowLeft size={17} strokeWidth={1.6} />
            </button>
          ) : (
            <span className="onboarding-mini-orb" aria-hidden="true" />
          )}
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">
          The veil opens
        </p>
        <p className="w-11 text-right font-mono text-[10px] text-white/36">
          {step}/{TOTAL_STEPS}
        </p>
      </header>

      <main className="relative z-10 min-h-0 flex-1">
        {step === 1 && (
          <OnboardingStep key={1} className="justify-end pb-6 pt-12">
            <Stamp slot="onboardOpen" eager tilt={-1.9} className="note-reveal mb-auto mt-4 w-[250px]" />
            <p className="onboarding-kicker">Haunt · private places</p>
            <h1 className="mt-3 max-w-[335px] text-[42px] font-semibold leading-[0.98] tracking-[-0.055em] text-white">
              Some places<br />find you.
            </h1>
            <p className="mt-4 max-w-[310px] text-[16px] leading-[1.52] text-white/56">
              Keep the places with a pulse, then pass them quietly to the people who belong there.
            </p>
            <div className="mt-8">
              <PrimaryButton onClick={() => setStep(2)}>enter softly</PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 2 && (
          <OnboardingStep key={2} className="justify-center py-8">
            <Stamp slot="onboardPassed" tilt={1.7} className="note-reveal mb-8 w-[244px]" />
            <p className="onboarding-kicker">Passed person to person</p>
            <h1 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              No feed. No ratings. Just a map with secrets.
            </h1>
            <p className="mt-5 text-[16px] leading-[1.55] text-white/56">
              A haunt stays hidden until a friend trusts you with it—or you wander close enough to feel it.
            </p>
            <div className="mt-10">
              <PrimaryButton onClick={() => setStep(3)}>I know the feeling</PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 3 && (
          <OnboardingStep key={3} className="justify-center py-8">
            <p className="onboarding-kicker">Name your trace</p>
            <h1 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              How should the map remember you?
            </h1>
            <p className="mt-3 text-[15px] leading-[1.5] text-white/52">
              This is the name friends will see in a haunt’s lineage.
            </p>
            <div className="onboarding-field mt-8 flex items-center rounded-[24px] px-5 py-4">
              <span className="font-mono text-[17px] text-white/38">@</span>
              <input
                autoFocus
                aria-label="handle"
                autoCapitalize="none"
                autoCorrect="off"
                value={handle}
                onChange={(event) => setHandle(event.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
                placeholder="yourname"
                className="ml-1 w-full bg-transparent text-[17px] font-medium text-white placeholder:text-white/26"
              />
            </div>
            <div className="mt-3 h-5">
              {claimed && (
                <p className="fade-in flex items-center gap-1.5 text-[12px] text-visited">
                  <Check size={13} strokeWidth={2} /> this name is yours
                </p>
              )}
            </div>
            <div className="mt-9">
              <PrimaryButton onClick={() => claimed && setStep(4)} disabled={!claimed}>
                leave my mark
              </PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 4 && (
          <OnboardingStep key={4} className="no-scrollbar overflow-y-auto py-7">
            <p className="onboarding-kicker">Choose what Haunt can sense</p>
            <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Let the map meet you halfway.
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/50">
              Everything is optional. Change any of this later.
            </p>
            <div className="onboarding-stagger mt-6 flex flex-col gap-2.5">
              {askable.map((permission) => (
                <PermissionRow
                  key={permission.id}
                  {...permission}
                  status={permissions[permission.id]}
                  onRequest={() => requestPermission(permission.id)}
                />
              ))}
              {askable.length === 0 && (
                <p className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-5 text-center text-[12px] leading-relaxed text-white/36">
                  this browser has none of these to give. everything still works —
                  you will just be asked for your location when it matters.
                </p>
              )}
            </div>
            <div className="mt-3 flex items-start gap-2 px-1 text-[11px] leading-[1.45] text-white/38">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-unvisited/70" />
              <span>
                Start with “While Using.” We’ll only ask for Always Allow later, when nearby haunts have proved useful.
              </span>
            </div>
            <div className="mt-6">
              <PrimaryButton onClick={() => setStep(5)}>continue</PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="pressable mt-2.5 min-h-10 w-full cursor-pointer text-[12px] text-white/38 transition-colors duration-200 hover:text-white/64"
              >
                not now
              </button>
            </div>
          </OnboardingStep>
        )}

        {step === 5 && (
          <OnboardingStep key={5} className="no-scrollbar overflow-y-auto py-7">
            <p className="onboarding-kicker">Begin with a whisper</p>
            <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Bring someone into the fold.
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/50">
              Haunts travel through trust. Send someone your link, or ask for a handle
              you already know.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <InviteAction icon={Share2} label="other apps" onClick={shareInvite} />
              <InviteAction icon={Link2} label="copy link" onClick={copyInvite} />
            </div>
            <div className="h-6 pt-2 text-center">
              {shareStatus && <p className="fade-in text-[11px] text-visited">{shareStatus}</p>}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!canInvite) return
                setInvites((current) => [...current, typedHandle])
                setQuery('')
              }}
              className="onboarding-field mt-2 flex items-center gap-2 rounded-[22px] px-4 py-3.5"
            >
              <span className="font-mono text-[14px] text-white/38">@</span>
              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value.replace(/[^a-zA-Z0-9._]/g, ''))
                }
                aria-label="their handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="their handle, exactly"
                className="w-full bg-transparent text-[13px] text-white placeholder:text-white/32"
              />
              <button
                type="submit"
                disabled={!canInvite}
                aria-label="add this handle"
                className={`pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  canInvite
                    ? 'cursor-pointer border-white/16 bg-white/[0.1] text-white'
                    : 'cursor-not-allowed border-white/[0.07] bg-white/[0.03] text-white/26'
                }`}
              >
                <UserRoundPlus size={14} strokeWidth={1.7} />
              </button>
            </form>
            <p className="mt-2 px-1 text-[10px] leading-[1.45] text-white/34">
              Exact handles only. There is no list to browse — which is also why
              nobody can browse you.
            </p>

            <div className="onboarding-stagger mt-3 flex flex-col gap-2">
              {invites.map((invite) => (
                <InviteRow
                  key={invite}
                  handle={invite}
                  onRemove={() =>
                    setInvites((current) => current.filter((item) => item !== invite))
                  }
                />
              ))}
            </div>
            <div className="mt-6">
              <PrimaryButton onClick={() => setStep(6)}>
                {invites.length > 0
                  ? `ask ${invites.length} ${invites.length === 1 ? 'person' : 'people'}`
                  : 'continue'}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="pressable mt-2.5 min-h-10 w-full cursor-pointer text-[12px] text-white/38 transition-colors duration-200 hover:text-white/64"
              >
                do this later
              </button>
            </div>
          </OnboardingStep>
        )}

        {step === 6 && (
          <OnboardingStep key={6} className="justify-end pb-6 pt-8">
            <Stamp slot="onboardWaiting" tilt={-1.2} className="mb-auto mt-6 w-[228px]" />
            <div className="onboarding-handle-chip">@{handle || 'you'} · the map remembers</div>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.06] tracking-[-0.05em] text-white">
              A place is already waiting for you.
            </h1>
            <p className="mt-3 text-[15px] leading-[1.5] text-white/50">
              Leave your first trace, or wander the map until something glows back.
            </p>
            <div className="mt-8 flex flex-col gap-2">
              <PrimaryButton onClick={() => void finish(true)}>
                drop my first haunt
              </PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => void finish(false)}>
                explore the map first
              </PrimaryButton>
            </div>
          </OnboardingStep>
        )}
      </main>

      <div className="relative z-20 flex justify-center gap-1.5 pt-3" aria-label={`step ${step} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((item) => (
          <span
            key={item}
            className={`h-1 w-7 origin-center rounded-full transition-[transform,background-color,opacity] duration-200 [transition-timing-function:var(--ease-out)] ${
              item === step ? 'scale-x-100 bg-white/90 opacity-100' : item < step ? 'scale-x-[0.32] bg-unvisited/70 opacity-80' : 'scale-x-[0.18] bg-white/18 opacity-70'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function MysticAtmosphere() {
  return (
    <div className="onboarding-atmosphere pointer-events-none absolute inset-0" aria-hidden="true">
      <span className="onboarding-fog onboarding-fog-one" />
      <span className="onboarding-fog onboarding-fog-two" />
      <span className="onboarding-wisp onboarding-wisp-one" />
      <span className="onboarding-wisp onboarding-wisp-two" />
      <span className="onboarding-ambient-orb onboarding-ambient-orb-one" />
      <span className="onboarding-ambient-orb onboarding-ambient-orb-two" />
      <span className="onboarding-grain" />
    </div>
  )
}

function OnboardingStep({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <section className={`onboarding-step flex h-full flex-col ${className}`}>{children}</section>
}

function PermissionRow({
  title,
  description,
  icon: Icon,
  status,
  onRequest,
}: {
  title: string
  description: string
  icon: typeof Bell
  status: PermissionStatus
  onRequest: () => void
}) {
  const isGranted = status === 'granted'
  return (
    <div className="onboarding-permission-card flex items-center gap-3 rounded-[22px] p-3.5">
      <div className="onboarding-permission-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80">
        <Icon size={17} strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white/92">{title}</p>
        <p className="mt-0.5 text-[10px] leading-[1.35] text-white/42">{description}</p>
      </div>
      <button
        type="button"
        onClick={onRequest}
        disabled={status === 'requesting' || isGranted}
        aria-label={`${isGranted ? 'allowed' : 'allow'} ${title}`}
        className={`pressable flex min-h-8 min-w-[61px] shrink-0 cursor-pointer items-center justify-center rounded-full border px-3 text-[10px] font-semibold transition-[color,background-color,border-color] duration-200 ${
          isGranted
            ? 'border-visited/40 bg-visited/12 text-visited'
            : status === 'denied'
              ? 'border-white/10 bg-white/[0.04] text-white/42'
              : 'border-white/16 bg-white/[0.075] text-white/78 hover:bg-white/[0.12]'
        }`}
      >
        {isGranted ? <Check size={13} /> : status === 'requesting' ? 'asking…' : status === 'denied' ? 'retry' : 'allow'}
      </button>
    </div>
  )
}

function InviteAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Share2
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="onboarding-invite-action pressable flex min-h-[68px] cursor-pointer items-center gap-3 rounded-[20px] px-4 text-left"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/76">
        <Icon size={16} strokeWidth={1.6} />
      </span>
      <span className="text-[12px] font-semibold text-white/82">{label}</span>
    </button>
  )
}

/**
 * One handle waiting to be asked.
 *
 * Nothing has been sent at this point: the requests go out in `finish`, once the
 * handle doing the asking actually belongs to this account.
 */
function InviteRow({ handle, onRemove }: { handle: string; onRemove: () => void }) {
  return (
    <div className="onboarding-contact-row flex items-center gap-3 rounded-[20px] px-3.5 py-3">
      <div className="onboarding-contact-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white/88">
        {handle.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12px] font-medium text-white/88">@{handle}</p>
        <p className="truncate text-[10px] text-white/38">asked as soon as you finish here</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`don't ask @${handle}`}
        className="pressable flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.055] px-3 text-[10px] font-semibold text-white/64 transition-colors duration-200 hover:text-white"
      >
        <X size={12} strokeWidth={2} />
        remove
      </button>
    </div>
  )
}
