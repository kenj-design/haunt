/**
 * The haunting — everyone a place has passed through, oldest first.
 *
 * A group founding collapses into a single card at the top rather than repeating
 * as separate entries, because those people arrived together and the chain
 * should read that way.
 *
 * Anyone outside the viewer's circle appears with the `anon` role: the chain
 * still shows that someone was there, without naming a stranger.
 */
import { MapPin, Users } from 'lucide-react'
import { useApp } from '../context/appState'
import { Avatar, hauntArtworkStyle, ScreenHeader } from '../components/ui'
import { isGroupFounded } from '../domain'

export default function Lineage({ hauntId }: { hauntId: string }) {
  const { haunts, goBack } = useApp()
  const haunt = haunts.find((h) => h.id === hauntId)
  if (!haunt) return null

  // A group founding is shown as one card, with the rest of the chain below it.
  const foundedTogether = isGroupFounded(haunt)
  const founding = foundedTogether
    ? haunt.lineage.filter((entry) => entry.action === 'founded together')
    : []
  const chain = foundedTogether
    ? haunt.lineage.filter((entry) => entry.action !== 'founded together')
    : haunt.lineage

  return (
    <div className="screen-in no-scrollbar h-full overflow-y-auto pb-10">
      <ScreenHeader title="The Haunting" serif onBack={goBack} />

      {/* haunt mini card */}
      <div className="premium-card mx-5 flex items-center gap-3.5 rounded-[24px] p-3.5">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border-[0.5px] border-line"
          style={hauntArtworkStyle(haunt)}
        >
          <MapPin size={16} strokeWidth={1.5} className="text-ink-2" />
        </div>
        <div>
          <p className="text-[14px] font-medium text-ink">{haunt.name}</p>
          <p className="text-[11px] text-ink-3">
            {haunt.visitorCount} {haunt.visitorCount === 1 ? 'person has' : 'people have'} made it
          </p>
        </div>
      </div>

      <div className="px-5 pt-6">
        {/* group founding card */}
        {founding.length > 0 && (
          <div className="glass-panel mb-6 rounded-[26px] p-5">
            <div className="flex items-center gap-2 text-ink-2">
              <Users size={13} strokeWidth={1.5} />
              <span className="text-[12px] font-medium tracking-[-0.01em]">
                founded together
              </span>
            </div>
            <div className="mt-3.5 flex items-center gap-2">
              {founding.map((e) => (
                <Avatar key={e.handle} handle={e.handle} role={e.role} size={34} />
              ))}
              <span className="ml-2 font-mono text-[12px] text-ink-2">
                {founding.map((e) => e.handle).join(' · ')}
              </span>
            </div>
            {founding.some((e) => e.note) && (
              <div className="mt-3.5 border-t-[0.5px] border-line pt-3">
                {founding
                  .filter((e) => e.note)
                  .map((e) => (
                    <p key={e.handle} className="text-[12px] leading-relaxed text-ink-2 italic">
                      “{e.note}” — <span className="font-mono not-italic">{e.handle}</span>
                    </p>
                  ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-ink-3">{founding[0].time}</p>
          </div>
        )}

        {/* vertical chain */}
        <div className="stagger relative">
          {chain.map((e, i) => (
            <div key={i} className="relative flex gap-4 pb-7 last:pb-0">
              {i < chain.length - 1 && (
                <span className="absolute top-[38px] left-[16.5px] h-[calc(100%-42px)] w-px bg-line" />
              )}
              <Avatar handle={e.handle} role={e.role} size={34} />
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-[13px] text-ink">
                  <span className="font-mono">{e.handle}</span>{' '}
                  <span className="text-ink-2">{e.action}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">{e.time}</p>
                {e.note && (
                  <p className="premium-card mt-2.5 rounded-[18px] px-3.5 py-2.5 text-[12px] leading-relaxed text-note-ink/90">
                    “{e.note}”
                  </p>
                )}
              </div>
            </div>
          ))}
          {chain.length === 0 && founding.length === 0 && (
            <p className="py-8 text-center text-[13px] text-ink-3">
              this chain hasn't started yet
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-ink-3">
          a haunt travels only as far as people are willing to go
        </p>
      </div>
    </div>
  )
}
