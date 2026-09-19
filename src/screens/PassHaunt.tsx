/**
 * Passing a haunt to one person.
 *
 * Three steps: choose someone, write the note, done. The note is not optional —
 * a pass always carries one, and the backend enforces that too, so this is not
 * the only thing standing between an empty note and the database.
 *
 * The confirmation only appears once the pass has actually landed. Showing it
 * optimistically would mean telling someone their place had travelled when it
 * had not.
 */
import { useState } from 'react'
import { Send } from 'lucide-react'
import { useApp } from '../context/appState'
import { Avatar, hauntArtworkStyle, HauntReferenceCard, PrimaryButton, ScreenHeader } from '../components/ui'

export default function PassHaunt({ hauntId }: { hauntId: string }) {
  const { haunts, friends, goBack, passHaunt, setTab, user, isBusy } = useApp()
  const haunt = haunts.find((h) => h.id === hauntId)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [to, setTo] = useState<string | null>(null)
  const [note, setNote] = useState('')
  if (!haunt) return null
  const eligibleFriends = friends.filter((friend) => friend.handle !== haunt.finderHandle)

  const confirm = async () => {
    if (!to || !haunt) return
    if (await passHaunt(haunt.id, to, note.trim())) setStep(3)
  }

  if (step === 3) {
    return (
      <div className="screen-in flex h-full flex-col items-center justify-center px-10 text-center">
        <div className="glass-panel note-reveal flex h-16 w-16 items-center justify-center rounded-full">
          <Send size={22} strokeWidth={1.5} className="text-white" />
        </div>
        <h1 className="mt-7 text-[30px] font-semibold tracking-[-0.045em] text-ink">passed to {to}</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          {haunt.name} is theirs to find now. They'll see the zone, your note, and nothing
          more — until they make it.
        </p>
        <button
          onClick={() => setTab('map')}
          className="mt-10 pressable cursor-pointer text-[13px] text-ink-3 transition-colors duration-200 hover:text-ink-2"
        >
          back to the map
        </button>
      </div>
    )
  }

  return (
    <div className="screen-in no-scrollbar h-full overflow-y-auto pb-10">
      <ScreenHeader
        title="Pass this Haunt"
        onBack={step === 1 ? goBack : () => setStep(1)}
        right={<span className="font-mono text-[11px] text-ink-3">{step}/2</span>}
      />

      {/* haunt ref card */}
      <HauntReferenceCard
        haunt={haunt}
        className="mx-5"
        subtitle={
          <>
            found by <span className="font-mono">{haunt.finderHandle}</span>
          </>
        }
      />

      {step === 1 && (
        <div className="fade-in px-5 pt-6">
          <p className="text-[13px] text-ink-2">
            {haunt.audience === 'circle'
              ? 'Choose someone from your circle. One person, one quiet invitation.'
              : haunt.audience === 'wanderers'
                ? 'It can find wanderers on its own — or you can guide one person there.'
                : 'One friend. That’s how a haunt begins to travel.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {eligibleFriends.map((f) => {
              const on = to === f.handle
              return (
                <button
                  key={f.handle}
                  type="button"
                  onClick={() => setTo(f.handle)}
                  aria-pressed={on}
                  className={`flex pressable cursor-pointer items-center gap-3 rounded-[22px] border px-4 py-3.5 text-left transition-colors duration-200 ${
                    on ? 'border-white bg-white/[0.12]' : 'border-white/[0.09] bg-white/[0.055]'
                  }`}
                >
                  <Avatar handle={f.handle} role="passer" size={32} />
                  <div className="flex-1">
                    <p className="font-mono text-[13px] text-ink">{f.handle}</p>
                    <p className="text-[11px] text-ink-3">{f.vibes.join(' · ')}</p>
                  </div>
                  <span
                    className={`block h-4.5 w-4.5 rounded-full border transition-[border-width,border-color] duration-200 ease-out ${
                      on ? 'border-[5px] border-white bg-black' : 'border border-white/20'
                    }`}
                  />
                </button>
              )
            })}
            {eligibleFriends.length === 0 && (
              <p className="rounded-[16px] border border-line bg-surface px-4 py-6 text-center text-[13px] text-ink-3">
                there’s no one eligible to receive this haunt yet
              </p>
            )}
          </div>
          <div className="mt-8">
            <PrimaryButton disabled={!to} onClick={() => setStep(2)}>
              continue
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 2 && to && (
        <div className="fade-in px-5 pt-6">
          <div className="glass-control rounded-full px-4 py-2.5 text-center text-[12px] text-note-ink">
            passing to <span className="font-mono">{to}</span>
          </div>
          <p className="mt-6 text-[14px] font-medium tracking-[-0.015em] text-ink-2">Tell them why</p>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={180}
            aria-label="note for the recipient"
            rows={3}
            placeholder="what should they know before they go?"
            className="glass-control mt-3 w-full resize-none rounded-[22px] px-5 py-4 text-[14px] leading-relaxed text-ink placeholder:text-ink-3"
          />
          <p className="mt-6 text-[14px] font-medium tracking-[-0.015em] text-ink-2">What they’ll receive</p>
          <div className="mt-3 overflow-hidden rounded-[26px] border border-white/[0.11] shadow-[0_18px_44px_rgba(0,0,0,.28)]">
            <div className="h-20" style={hauntArtworkStyle(haunt)} />
            <div className="bg-white/[0.06] p-4 backdrop-blur-xl">
              <p className="text-[14px] font-medium text-ink">{haunt.name}</p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                passed by <span className="font-mono">{user.handle}</span> · zone only, no exact
                spot
              </p>
              {note.trim() && (
                <p className="mt-3 border-l border-unvisited/70 pl-3 text-[12px] leading-relaxed text-ink-2 italic">
                  “{note.trim()}”
                </p>
              )}
            </div>
          </div>
          <p className="mt-2 text-right font-mono text-[10px] text-ink-3">{note.length}/180</p>
          <div className="mt-8">
            <PrimaryButton
              disabled={note.trim().length === 0 || isBusy}
              onClick={() => void confirm()}
            >
              {isBusy ? 'passing…' : 'let someone in'}
            </PrimaryButton>
            {note.trim().length === 0 && (
              <p className="mt-2 text-center text-[11px] text-ink-3">
                a pass always carries a note
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
