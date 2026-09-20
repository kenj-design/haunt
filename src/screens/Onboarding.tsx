/**
 * The way in: six steps from cold open to a claimed handle.
 *
 * Every step is laid out the same way — a fixed art zone, copy that begins at
 * the same height on all six, actions pinned to the bottom — so advancing does
 * not move the furniture around. The two narrative steps get the art at full
 * size; the three that ask for something get a smaller mark, so a form still has
 * room to be a form.
 *
 * Nothing here mimes an interaction. The handle is claimed for real, the
 * invitations become real friend requests once it is. Location is requested only
 * after its purpose is explained, from the CTA on its own step.
 *
 * `?onboarding=1` replays this without clearing anything else, for looking at it
 * again without resetting the app.
 */
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Link2,
  LocateFixed,
  UserRoundPlus,
  X,
} from 'lucide-react'
import { useApp } from '../context/appState'
import { PrimaryButton } from '../components/ui'
import Stamp from '../components/Stamp'
import ShareStory from '../components/ShareStory'
import { inviteLabel, inviteLink } from '../lib/invite'
import { stringSeed } from '../lib/seed'

/* Location is a real browser permission, so it has to be requested from a user
 * gesture. Keeping this step in the narrative makes the privacy tradeoff legible
 * before the browser's own modal appears. */
const TOTAL_STEPS = 6

function initialStep() {
  if (typeof window === 'undefined') return 1
  const value = Number(new URLSearchParams(window.location.search).get('step'))
  return Number.isInteger(value) && value >= 1 && value <= TOTAL_STEPS ? value : 1
}

export default function Onboarding() {
  const {
    claimOnboardingHandle,
    completeOnboarding,
    navigate,
    sendFriendRequest,
    requestLocation,
    location,
  } = useApp()
  const [step, setStep] = useState(initialStep)
  const [handle, setHandle] = useState('')
  const [query, setQuery] = useState('')
  /** Handles to ask about, sent for real once this handle is actually claimed. */
  const [invites, setInvites] = useState<string[]>([])
  const [shareStatus, setShareStatus] = useState('')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const [handleBusy, setHandleBusy] = useState(false)
  const [handleError, setHandleError] = useState('')

  const claimed = handle.trim().length >= 3
  // `?add=` is read back on boot and turned into a real request to know them.
  const invite = useMemo(() => inviteLink(handle), [handle])

  const typedHandle = query.trim().replace(/^@/, '').toLowerCase()
  const canInvite =
    typedHandle.length >= 3 &&
    typedHandle !== handle.trim().toLowerCase() &&
    !invites.includes(typedHandle)




  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(invite)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = invite
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
    }
    setShareStatus('invite link copied')
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

  const claimHandle = async () => {
    if (!claimed || handleBusy) return
    setHandleBusy(true)
    setHandleError('')
    const error = await claimOnboardingHandle('@' + handle.trim())
    setHandleBusy(false)
    if (error) {
      setHandleError(error)
      return
    }
    setStep(5)
  }

  const allowLocation = async () => {
    if (location) {
      setStep(4)
      return
    }
    setLocationBusy(true)
    setLocationMessage('')
    const allowed = await requestLocation()
    setLocationBusy(false)
    if (allowed) {
      setStep(4)
    } else {
      setLocationMessage('we could not use your location. you can enable it later in your browser settings.')
    }
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
          Haunt
        </p>
        <p className="w-11 text-right font-mono text-[10px] text-white/36">
          {step}/{TOTAL_STEPS}
        </p>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar">
        {step === 1 && (
          <OnboardingStep key={1}>
            <div className="onboarding-art">
              <div className="onboarding-stamp-print">
                <Stamp slot="onboardOpen" eager tilt={-1.9} className="w-[250px] aspect-square" />
              </div>
            </div>
            <h1 className="max-w-[335px] text-[40px] font-semibold leading-[1] tracking-[-0.055em] text-white">
              Save a place.<br />Give it to one<br />friend.
            </h1>
            <p className="mt-4 max-w-[318px] text-[16px] leading-[1.52] text-white/56">
              Haunt is a private map of real spots — a bench, a rooftop, a stretch of
              shore. You leave a note at one, and whoever you pass it to has to go
              there to read it.
            </p>
            <div className="onboarding-actions">
              <PrimaryButton onClick={() => setStep(2)}>how it works</PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 2 && (
          <OnboardingStep key={2}>
            <div className="onboarding-art">
              <div className="onboarding-stamp-print">
                <Stamp slot="onboardPassed" tilt={1.7} className="w-[244px] aspect-square" />
              </div>
            </div>
            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Nobody gets the exact spot.
            </h1>
            <p className="mt-5 text-[16px] leading-[1.55] text-white/56">
              A place shows on the map as fog a few hundred metres wide. The name and
              the note stay shut until you are actually standing in it. No feed, no
              ratings, no strangers browsing your places.
            </p>
            <div className="onboarding-actions">
              <PrimaryButton onClick={() => setStep(3)}>got it</PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 3 && (
          <OnboardingStep key={3}>
            <div className="onboarding-art onboarding-art-small">
              <div className="onboarding-location-mark">
                <LocateFixed size={38} strokeWidth={1.2} />
              </div>
            </div>
            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Let Haunt find the places around you.
            </h1>
            <p className="mt-3 text-[15px] leading-[1.5] text-white/52">
              We use your location to show nearby haunts and to know when you are
              standing inside a fogged zone. Your exact position stays private —
              friends only see the area around a haunt.
            </p>
            {locationMessage && (
              <p className="mt-4 text-[11px] leading-[1.45] text-white/44">{locationMessage}</p>
            )}
            <div className="onboarding-actions">
              <PrimaryButton onClick={() => void allowLocation()} disabled={locationBusy}>
                {locationBusy ? 'finding you…' : location ? 'location is on' : 'use my location'}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="pressable min-h-10 w-full cursor-pointer text-[12px] text-white/38 transition-colors duration-200 hover:text-white/64"
              >
                not now
              </button>
            </div>
          </OnboardingStep>
        )}

        {step === 4 && (
          <OnboardingStep key={4}>
            <div className="onboarding-art onboarding-art-small">
              <div className="onboarding-stamp-print">
                <Stamp slot="onboardName" tilt={1.5} className="w-[112px] aspect-square" />
              </div>
            </div>
            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              What should friends call you?
            </h1>
            <p className="mt-3 text-[15px] leading-[1.5] text-white/52">
              This is how you show up when a place is passed along. No email, no
              password — this name and the code on the next screen are the account.
            </p>
            <div className="onboarding-field mt-7 flex items-center rounded-[24px] px-5 py-4">
              <span className="font-mono text-[17px] text-white/38">@</span>
              <input
                autoFocus
                aria-label="handle"
                autoCapitalize="none"
                autoCorrect="off"
                value={handle}
                onChange={(event) => {
                  setHandle(event.target.value.replace(/[^a-zA-Z0-9._]/g, ''))
                  setHandleError('')
                }}
                placeholder="yourname"
                className="ml-1 w-full bg-transparent text-[17px] font-medium text-white placeholder:text-white/26"
              />
            </div>
            <div className="mt-3 min-h-5">
              {claimed && (
                <p className="fade-in flex items-center gap-1.5 text-[12px] text-white/42">
                  <Check size={13} strokeWidth={2} /> valid handle format
                </p>
              )}
              {handleError && <p className="fade-in text-[12px] text-fof">{handleError}</p>}
            </div>
            <div className="onboarding-actions">
              <PrimaryButton onClick={() => void claimHandle()} disabled={!claimed || handleBusy}>
                {handleBusy ? 'checking…' : 'claim this name'}
              </PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 5 && (
          <OnboardingStep key={5}>
            <div className="onboarding-art onboarding-art-small">
              <div className="onboarding-stamp-print">
                <Stamp slot="onboardInvite" tilt={-1.6} className="w-[132px] aspect-square" />
              </div>
            </div>
            <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Start alone. Bring a friend when you’re ready.
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/50">
              Haunt gets better when a place can travel to someone, but this part is
              optional. Send your link, or add someone by handle if they are already here.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <InviteAction icon={Link2} label="copy invite link" onClick={copyInvite} />
              <ShareStory
                card={{
                  title: 'Some places find you.',
                  caption: `@${handle.trim() || 'you'}`,
                  footer: inviteLabel(handle),
                  seed: stringSeed(handle || 'haunt'),
                }}
                name={`haunt-invite-${handle.trim() || 'you'}`}
                className="onboarding-invite-action pressable flex min-h-[68px] w-full cursor-pointer items-center gap-3 rounded-[20px] px-4 text-left text-[12px] font-semibold text-white/82"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/76">
                  <ImageIcon size={16} strokeWidth={1.6} />
                </span>
                share to a story
              </ShareStory>
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
              Handles are exact and there is no directory to search. That is also why
              nobody can look you up.
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
            <div className="onboarding-actions">
              <PrimaryButton onClick={() => setStep(6)}>
                {invites.length > 0
                  ? `ask ${invites.length} ${invites.length === 1 ? 'person' : 'people'}`
                  : 'continue'}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="pressable min-h-10 w-full cursor-pointer text-[12px] text-white/38 transition-colors duration-200 hover:text-white/64"
              >
                skip for now
              </button>
            </div>
          </OnboardingStep>
        )}

        {step === 6 && (
          <OnboardingStep key={6}>
            <div className="onboarding-art">
              <div className="onboarding-stamp-print">
                <Stamp slot="onboardWaiting" tilt={-1.2} className="w-[228px] aspect-square" />
              </div>
            </div>
            <div className="onboarding-handle-chip">@{handle || 'you'} · you are in</div>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.06] tracking-[-0.05em] text-white">
              That is the whole app.
            </h1>
            <p className="mt-3 text-[15px] leading-[1.5] text-white/50">
              Leave a place you already know, or open the map and see what is near you
              that somebody else kept.
            </p>
            <div className="onboarding-actions">
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
  return <section className={`onboarding-step flex min-h-full flex-col ${className}`}>{children}</section>
}


function InviteAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Link2
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
