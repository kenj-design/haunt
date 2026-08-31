/**
 * A profile, yours or a friend's.
 *
 * The two variants differ by more than styling: your own carries counters,
 * keepsakes, the friends list, and any pending request, while a friend's shows
 * their vibe and how many people you share — and no list of their places. Their
 * haunts reach you by being passed, never by being browsed.
 */
import { useState } from 'react'
import { Check, Clock, KeyRound, UserRoundPlus, X } from 'lucide-react'
import { useApp } from '../context/appState'
import { Avatar, ScreenHeader, VibePill } from '../components/ui'
import StampPage from '../components/StampPage'

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
  const {
    user,
    friends,
    keepsakes,
    friendRequests,
    acceptRequest,
    ignoreRequest,
    goBack,
    navigate,
    hasAccounts,
    sendFriendRequest,
    isBusy,
  } = useApp()
  const [askHandle, setAskHandle] = useState('')
  const incoming = friendRequests.filter((request) => request.direction === 'incoming')
  const outgoing = friendRequests.filter((request) => request.direction === 'outgoing')

  const ask = async () => {
    const handle = askHandle.trim()
    if (!handle || isBusy) return
    if (await sendFriendRequest(handle)) setAskHandle('')
  }
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

          {incoming.length > 0 && (
            <div className="mt-8 px-5">
              <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">
                Wants to know your places
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {incoming.map((request) => (
                  <div
                    key={request.handle}
                    className="glass-panel flex items-center gap-3 rounded-[22px] p-4"
                  >
                    <Avatar handle={request.handle} role="visitor" size={34} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">
                      {request.handle}
                    </span>
                    <button
                      onClick={() => void acceptRequest(request.handle)}
                      disabled={isBusy}
                      className="flex h-9 w-9 pressable cursor-pointer items-center justify-center rounded-full border border-white bg-white text-black transition-colors duration-200 hover:bg-white/90 disabled:opacity-50"
                      aria-label={`accept ${request.handle}`}
                    >
                      <Check size={14} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => void ignoreRequest(request.handle)}
                      disabled={isBusy}
                      className="glass-control flex h-9 w-9 pressable cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors duration-200 hover:text-white disabled:opacity-50"
                      aria-label={`ignore ${request.handle}`}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/*
            Asking is by exact handle and nothing else — no directory, no search,
            no suggestions. If you don't already know what someone is called, you
            can't find them, which is the same rule the map runs on.
          */}
          <div className="mt-8 px-5">
            <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Know someone?</p>
            <p className="mt-1 text-[11px] leading-[1.45] text-ink-3">
              Type their handle exactly. There's no list to browse.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="glass-control flex flex-1 items-center rounded-[20px] px-4 py-3">
                <span className="font-mono text-[13px] text-ink-3">@</span>
                <input
                  value={askHandle.replace(/^@/, '')}
                  onChange={(event) =>
                    setAskHandle(event.target.value.replace(/[^a-zA-Z0-9._]/g, '').toLowerCase())
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void ask()
                  }}
                  aria-label="handle to ask"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="theirname"
                  className="ml-1 w-full bg-transparent font-mono text-[13px] text-ink placeholder:text-ink-3"
                />
              </div>
              <button
                type="button"
                onClick={() => void ask()}
                disabled={askHandle.trim().length === 0 || isBusy}
                aria-label="ask to know them"
                className="pressable flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.16] bg-white/[0.08] text-white transition-colors hover:bg-white/[0.13] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UserRoundPlus size={16} strokeWidth={1.6} />
              </button>
            </div>

            {outgoing.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {outgoing.map((request) => (
                  <div
                    key={request.handle}
                    className="flex items-center gap-2 px-1 text-[11px] text-ink-3"
                  >
                    <Clock size={11} strokeWidth={1.6} />
                    <span className="font-mono">{request.handle}</span>
                    <span>hasn't answered yet</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 px-5">
            <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">
              Friends <span className="text-ink-3">· {friends.length}</span>
            </p>
            {friends.length === 0 ? (
              <div className="mt-3 flex flex-col items-center rounded-[22px] border border-line bg-surface px-4 py-7">
                <StampPage slot="friendsEmpty" className="w-[132px]" />
                <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-3">
                  no one yet. haunts travel through people, so this is where the map
                  starts filling in.
                </p>
              </div>
            ) : (
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
            )}
          </div>

          {/*
            Only shown on a backend that has accounts. The existing code cannot
            be displayed — it is not stored — so the only thing on offer is
            replacing it, which is exactly what someone whose code got out needs.
          */}
          {hasAccounts && (
            <div className="mt-8 px-5">
              <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Account</p>
              <button
                type="button"
                onClick={() => navigate({ name: 'recovery' })}
                className="premium-card mt-3 flex w-full pressable cursor-pointer items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-200 hover:bg-white/[0.09]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.055] text-white/68">
                  <KeyRound size={14} strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">Recovery code</span>
                  <span className="mt-0.5 block text-[10px] text-ink-3">
                    make a new one if yours got out
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">replace →</span>
              </button>
            </div>
          )}

          <div className="mt-8 px-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Keepsakes</p>
              <span className="text-[11px] text-ink-3">{keepsakes.length}</span>
            </div>
            {keepsakes.length === 0 && (
              <div className="mt-3 flex flex-col items-center rounded-[22px] border border-line bg-surface px-4 py-7">
                <StampPage slot="keepsakesEmpty" className="w-[132px]" />
                <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-3">
                  nothing kept yet. logging a visit is what mints one.
                </p>
              </div>
            )}
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
