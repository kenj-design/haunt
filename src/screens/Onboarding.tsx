/**
 * The way in: five steps from cold open to a claimed handle.
 *
 * Every step is laid out the same way — a fixed art zone, copy that begins at
 * the same height on all five, actions pinned to the bottom — so advancing does
 * not move the furniture around. The two narrative steps get the art at full
 * size; the three that ask for something get a smaller mark, so a form still has
 * room to be a form.
 *
 * Nothing here mimes an interaction. The handle is claimed for real, the
 * invitations become real friend requests once it is, and the step that asked
 * for permissions the web build cannot use is gone — see
 * `components/unwired/PermissionSteps.tsx`.
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
  UserRoundPlus,
  X,
} from 'lucide-react'
import { useApp } from '../context/appState'
import { PrimaryButton } from '../components/ui'
import Stamp from '../components/Stamp'
import ShareStory from '../components/ShareStory'
import { inviteLabel, inviteLink } from '../lib/invite'
import { stringSeed } from '../lib/seed'

/*
 * Five, not six. The permissions step is gone from the web build: location is
 * asked for at the moment it is needed anyway, and nothing sends a notification
 * yet. Its UI is kept whole in `components/unwired/PermissionSteps.tsx` for the
 * native app.
 */
const TOTAL_STEPS = 5

export default function Onboarding() {
  const { completeOnboarding, navigate, sendFriendRequest } = useApp()
  const [step, setStep] = useState(1)
  const [handle, setHandle] = useState('')
  const [query, setQuery] = useState('')
  /** Handles to ask about, sent for real once this handle is actually claimed. */
  const [invites, setInvites] = useState<string[]>([])
  const [shareStatus, setShareStatus] = useState('')

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

      <main className="relative z-10 min-h-0 flex-1">
        {step === 1 && (
          <OnboardingStep key={1}>
            <div className="onboarding-art">
              <Stamp slot="onboardOpen" eager tilt={-1.9} className="note-reveal w-[250px]" />
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
              <Stamp slot="onboardPassed" tilt={1.7} className="note-reveal w-[244px]" />
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
              <Stamp slot="onboardName" tilt={1.5} className="w-[112px]" />
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
            <div className="onboarding-actions">
              <PrimaryButton onClick={() => claimed && setStep(4)} disabled={!claimed}>
                claim this name
              </PrimaryButton>
            </div>
          </OnboardingStep>
        )}

        {step === 4 && (
          <OnboardingStep key={4}>
            <div className="onboarding-art onboarding-art-small">
              <Stamp slot="onboardInvite" tilt={-1.6} className="w-[132px]" />
            </div>
            <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Haunt needs one other person.
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/50">
              Places only move between people who know each other, so a map of one is
              a map of nothing. Send someone your link, or add them by handle if they
              are already here.
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
              <PrimaryButton onClick={() => setStep(5)}>
                {invites.length > 0
                  ? `ask ${invites.length} ${invites.length === 1 ? 'person' : 'people'}`
                  : 'bring a friend'}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="pressable min-h-10 w-full cursor-pointer text-[12px] text-white/38 transition-colors duration-200 hover:text-white/64"
              >
                do this later
              </button>
            </div>
          </OnboardingStep>
        )}

        {step === 5 && (
          <OnboardingStep key={5}>
            <div className="onboarding-art">
              <Stamp slot="onboardWaiting" tilt={-1.2} className="w-[228px]" />
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
  return <section className={`onboarding-step flex h-full flex-col ${className}`}>{children}</section>
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
