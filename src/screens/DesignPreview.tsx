/**
 * Local-only screen tour for visual design work.
 *
 * It is intentionally a navigator rather than a second copy of each screen:
 * illustration work should inspect the real states and real transitions so a
 * layout change is evaluated where it will actually ship.
 */
import type { ReactNode } from 'react'
import {
  ArrowRight,
  Bell,
  BookOpen,
  Image,
  KeyRound,
  LogIn,
  Map,
  MapPin,
  LocateFixed,
  Send,
  User,
  Users,
} from 'lucide-react'
import { useApp } from '../context/appState'
import { ScreenHeader } from '../components/ui'

function openOnboardingStep(step: number) {
  const params = new URLSearchParams(window.location.search)
  params.set('onboarding', '1')
  params.set('step', String(step))
  window.location.assign(`${window.location.pathname}?${params.toString()}${window.location.hash}`)
}

function TourRow({
  icon,
  title,
  detail,
  onClick,
  disabled = false,
}: {
  icon: ReactNode
  title: string
  detail: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="premium-card flex w-full pressable items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-200 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.055] text-white/68">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10px] text-ink-3">{detail}</span>
      </span>
      <ArrowRight size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
    </button>
  )
}

export default function DesignPreview() {
  const { haunts, friends, goBack, navigate, setTab } = useApp()
  const haunt = haunts[0]
  const friend = friends[0]

  return (
    <div className="screen-in no-scrollbar h-full overflow-y-auto pb-10">
      <ScreenHeader title="Screen tour" serif onBack={goBack} />

      <div className="px-5 pb-4 pt-2">
        <p className="text-[13px] leading-relaxed text-ink-3">
          Real screens, real states. Use this while making illustrations or moving
          the flow around.
        </p>
      </div>

      <section className="px-5" aria-labelledby="onboarding-preview-heading">
        <h2 id="onboarding-preview-heading" className="text-[14px] font-medium text-ink-2">
          Onboarding
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {[
            ['Welcome', 'Save a place. Give it to one friend.'],
            ['How it works', 'Fog, privacy, and the exact spot.'],
            ['Location', 'Why Haunt needs your location before asking.'],
            ['Claim a name', 'The handle that becomes the account identity.'],
            ['Invite someone', 'Copy, share, or add a handle.'],
            ['You are in', 'Drop a first haunt or explore the map.'],
          ].map(([title, detail], index) => (
            <TourRow
              key={title}
              icon={index === 2 ? <LocateFixed size={14} strokeWidth={1.5} /> : <BookOpen size={14} strokeWidth={1.5} />}
              title={`${index + 1}. ${title}`}
              detail={detail}
              onClick={() => openOnboardingStep(index + 1)}
            />
          ))}
        </div>
      </section>

      <section className="mt-8 px-5" aria-labelledby="app-preview-heading">
        <h2 id="app-preview-heading" className="text-[14px] font-medium text-ink-2">
          App surfaces
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <TourRow
            icon={<Map size={14} strokeWidth={1.5} />}
            title="Map"
            detail="Collapsed nearby sheet and map controls."
            onClick={() => setTab('map')}
          />
          <TourRow
            icon={<User size={14} strokeWidth={1.5} />}
            title="Your profile"
            detail="Stats, friends, keepsakes, and account actions."
            onClick={() => setTab('profile')}
          />
          <TourRow
            icon={<MapPin size={14} strokeWidth={1.5} />}
            title="Selected place"
            detail="Tap a haunt on the map to see the rising preview card."
            onClick={() => setTab('map')}
          />
          <TourRow
            icon={<Image size={14} strokeWidth={1.5} />}
            title="Haunt detail"
            detail={haunt ? haunt.name : 'Requires a haunt fixture.'}
            disabled={!haunt}
            onClick={() => haunt && navigate({ name: 'haunt', hauntId: haunt.id })}
          />
          <TourRow
            icon={<Users size={14} strokeWidth={1.5} />}
            title="The haunting"
            detail="Lineage and the people a place has travelled through."
            disabled={!haunt}
            onClick={() => haunt && navigate({ name: 'lineage', hauntId: haunt.id })}
          />
          <TourRow
            icon={<Send size={14} strokeWidth={1.5} />}
            title="Pass this haunt"
            detail="Choose someone, write a note, and confirm the pass."
            disabled={!haunt}
            onClick={() => haunt && navigate({ name: 'pass', hauntId: haunt.id })}
          />
          <TourRow
            icon={<Image size={14} strokeWidth={1.5} />}
            title="Drop a haunt"
            detail="The place, note, vibe, audience, and release flow."
            onClick={() => navigate({ name: 'drop' })}
          />
          <TourRow
            icon={<Users size={14} strokeWidth={1.5} />}
            title="Friend profile"
            detail={friend ? friend.handle : 'Requires a friend fixture.'}
            disabled={!friend}
            onClick={() => friend && navigate({ name: 'friend', handle: friend.handle })}
          />
          <TourRow
            icon={<Bell size={14} strokeWidth={1.5} />}
            title="Quiet news"
            detail="Pass and visit notifications."
            onClick={() => navigate({ name: 'notifications' })}
          />
          <TourRow
            icon={<KeyRound size={14} strokeWidth={1.5} />}
            title="Recovery code"
            detail="Local visual preview of the account key screen."
            onClick={() => navigate({ name: 'recovery-preview' })}
          />
          <TourRow
            icon={<LogIn size={14} strokeWidth={1.5} />}
            title="Sign in"
            detail="Local visual preview of the account entry screen."
            onClick={() => navigate({ name: 'sign-in-preview' })}
          />
        </div>
      </section>

      <p className="mt-8 px-10 text-center text-[11px] leading-relaxed text-ink-3">
        This screen tour is development-only and appears on localhost only.
      </p>
    </div>
  )
}
