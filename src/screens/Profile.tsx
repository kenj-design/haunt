/**
 * A profile, yours or a friend's.
 *
 * The two variants differ by more than styling: your own carries counters,
 * keepsakes, the friends list, and any pending request, while a friend's shows
 * their vibe and how many people you share — and no list of their places. Their
 * haunts reach you by being passed, never by being browsed.
 */
import { Check, X } from 'lucide-react'
import { useApp } from '../context/appState'
import { Avatar, ScreenHeader, VibePill } from '../components/ui'

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="premium-card flex flex-1 flex-col items-center rounded-[24px] py-5">
      <span className="text-[30px] font-semibold tracking-[-0.04em] text-ink">{value}</span>
      <span className="mt-1 text-[10px] font-medium tracking-[-0.01em] text-ink-2">
        {label}
      </span>
    </div>
  )
}

export default function Profile({
  variant,
  handle,
}: {
  variant: 'own' | 'friend'
  handle?: string
}) {
  const { user, friends, keepsakes, incomingRequest, acceptRequest, ignoreRequest, goBack, navigate } =
    useApp()
  const friend = variant === 'friend' ? friends.find((f) => f.handle === handle) : null
  const shown = friend
    ? // A friend's join date isn't on the friend list yet; a profile endpoint will carry it.
      { handle: friend.handle, vibes: friend.vibes, memberSince: 'March 2025' }
    : { handle: user.handle, vibes: user.vibes, memberSince: user.memberSince }

  return (
    // own profile is a tab switch (frequent — no entrance); friend profile is pushed
    <div
      className={`${variant === 'friend' ? 'screen-in' : ''} no-scrollbar h-full overflow-y-auto pb-32`}
    >
      {variant === 'friend' && <ScreenHeader title="" onBack={goBack} />}

      <div className="flex flex-col items-center pt-10">
        <div className="rounded-full border border-white/15 bg-white/[0.05] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,.28)] backdrop-blur-xl">
          <Avatar handle={shown.handle} role={variant === 'own' ? 'you' : 'passer'} size={72} />
        </div>
        <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.04em] text-ink">{shown.handle}</h1>
        <p className="mt-1 text-[12px] text-ink-3">haunting since {shown.memberSince}</p>
      </div>

      {variant === 'own' ? (
        <>
          <div className="mt-8 flex gap-2.5 px-5">
            <Stat value={user.hauntsDropped} label="dropped" />
            <Stat value={user.hauntsVisited} label="visited" />
            <Stat value={user.hauntsPassedOn} label="passed on" />
          </div>

          <div className="mt-8 px-5">
            <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Your vibe</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {shown.vibes.map((v) => (
                <VibePill key={v} label={v} tone="indigo" />
              ))}
            </div>
          </div>

          {incomingRequest && (
            <div className="glass-panel mx-5 mt-8 rounded-[26px] p-4">
              <p className="text-[13px] font-medium tracking-[-0.01em] text-ink-2">Wants to know your places</p>
              <div className="mt-3 flex items-center gap-3">
                <Avatar handle={incomingRequest} role="visitor" size={34} />
                <span className="flex-1 font-mono text-[13px] text-ink">{incomingRequest}</span>
                <button
                  onClick={() => void acceptRequest()}
                  className="flex h-9 w-9 pressable cursor-pointer items-center justify-center rounded-full border border-white bg-white text-black transition-colors duration-200 hover:bg-white/90"
                  aria-label="accept"
                >
                  <Check size={14} strokeWidth={2} />
                </button>
                <button
                  onClick={() => void ignoreRequest()}
                  className="glass-control flex h-9 w-9 pressable cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors duration-200 hover:text-white"
                  aria-label="ignore"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 px-5">
            <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Friends <span className="text-ink-3">· {friends.length}</span></p>
            <div className="mt-3 flex flex-col gap-2">
              {friends.map((f) => (
                <button
                  key={f.handle}
                  onClick={() => navigate({ name: 'friend', handle: f.handle })}
                  className="premium-card flex pressable cursor-pointer items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-200 hover:bg-white/[0.09]"
                >
                  <Avatar handle={f.handle} role="passer" size={32} />
                  <div className="flex-1">
                    <p className="font-mono text-[13px] text-ink">{f.handle}</p>
                    <p className="text-[11px] text-ink-3">{f.vibes.join(' · ')}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 px-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Keepsakes</p>
              <span className="text-[11px] text-ink-3">{keepsakes.length}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {keepsakes.map((keepsake) => (
                <button
                  key={keepsake.id}
                  type="button"
                  onClick={() => navigate({ name: 'haunt', hauntId: keepsake.hauntId })}
                  className="keepsake-fragment pressable relative aspect-[1.15] overflow-hidden border border-white/[0.11] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_15px_34px_rgba(0,0,0,.24)]"
                  style={{ background: keepsake.photoGradient }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/12 to-white/[0.03]" />
                  <span className="absolute inset-x-3 bottom-3">
                    <span className="block truncate text-[11px] font-medium text-white/90">{keepsake.name}</span>
                    <span className="mt-0.5 block text-[8px] text-white/42">{keepsake.collectedAt}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-8 px-5">
            <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Their vibe</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {shown.vibes.map((v) => (
                <VibePill key={v} label={v} tone="indigo" />
              ))}
            </div>
          </div>
          <div className="premium-card mx-5 mt-8 rounded-[22px] px-4 py-3.5">
            <p className="text-[12px] text-ink-2">
              {friend?.mutualCount ?? 1} mutual friend{(friend?.mutualCount ?? 1) > 1 ? 's' : ''}
            </p>
          </div>
          <p className="mt-10 px-10 text-center text-[12px] leading-relaxed text-ink-3">
            their haunts reach you through trust, not a list.
          </p>
        </>
      )}
    </div>
  )
}
