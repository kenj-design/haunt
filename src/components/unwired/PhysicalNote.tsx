/**
 * Paper-styled composer for an arrival note plus a private note for a recipient.
 * Not wired up — superseded by `ArrivalNoteComposer`, which also records audio.
 * See README.md in this folder.
 */
import { useState } from 'react'
import { ChevronDown, LockKeyhole, MapPin } from 'lucide-react'

export default function PhysicalNote({
  placeName,
  story,
  note,
  leaving = false,
  motion = true,
  onStoryChange,
  onNoteChange,
}: {
  placeName: string
  story: string
  note: string
  leaving?: boolean
  motion?: boolean
  onStoryChange: (value: string) => void
  onNoteChange: (value: string) => void
}) {
  const [open, setOpen] = useState(note.length > 0)

  return (
    <div className="relative mt-4">
      <div
        data-leaving={leaving}
        data-motion={motion}
        className="physical-note rounded-[26px] border border-white/[0.12] bg-[#121317] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
      >
        {/* Header with location context */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] text-white/70">
              <MapPin size={13} strokeWidth={1.6} />
            </span>
            <div>
              <span className="text-[10px] font-medium text-ink-3">Place</span>
              <p className="max-w-[210px] truncate text-[13px] font-semibold text-white">
                {placeName || 'somewhere unnamed'}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-ink-3">
            Two-part note
          </span>
        </div>

        {/* Section 1: Outside Story (The Invitation) */}
        <div className="pt-4.5">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-white">
                The Invitation
              </h3>
              <p className="mt-0.5 text-[11px] text-ink-3">
                Written on the outside · Visible to wanderers before they go
              </p>
            </div>
          </div>

          <textarea
            value={story}
            aria-label="the story"
            maxLength={280}
            onChange={(event) => onStoryChange(event.target.value.slice(0, 280))}
            rows={4}
            className="mt-3 w-full resize-none rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3.5 text-[14px] leading-relaxed text-ink placeholder:text-white/28 focus:border-white/25 focus:bg-white/[0.055] transition-all"
            placeholder="Tell them what drew you here, when to come, what to look for…"
          />

          <div className="mt-1.5 flex items-center justify-between text-[10px]">
            <span className={story.trim().length < 20 ? 'text-amber-400/80' : 'text-emerald-400/80'}>
              {story.trim().length < 20 ? 'write at least 20 characters' : 'invitation ready'}
            </span>
            <span className="font-mono text-ink-3">{story.length}/280</span>
          </div>
        </div>

        {/* Section 2: Inside the Fold (Secret Arrival Note) */}
        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <button
            type="button"
            disabled={leaving}
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="arrival-note-fold"
            className="pressable flex w-full cursor-pointer items-center justify-between rounded-[20px] border border-white/[0.09] bg-white/[0.035] px-4 py-3 text-left transition-colors hover:bg-white/[0.065]"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                <LockKeyhole size={13} strokeWidth={1.8} />
              </span>
              <div>
                <span className="text-[12px] font-semibold text-white">
                  The Note Inside
                </span>
                <span className="ml-2 text-[10px] text-ink-3">
                  {open ? 'open' : 'locked until arrival'}
                </span>
              </div>
            </div>
            <ChevronDown
              size={15}
              strokeWidth={1.75}
              className={`text-ink-3 transition-transform duration-200 ${open ? 'rotate-180 text-white' : ''}`}
            />
          </button>

          {open && (
            <div id="arrival-note-fold" className="fade-in mt-3 rounded-[18px] border border-white/[0.07] bg-black/25 p-3.5">
              <p className="text-[11px] leading-relaxed text-ink-3">
                Hidden until someone physically arrives at this spot.
              </p>
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value.slice(0, 160))}
                aria-label="arrival note"
                maxLength={160}
                rows={3}
                className="mt-2.5 w-full resize-none rounded-[14px] border border-white/[0.08] bg-white/[0.03] p-3 text-[14px] leading-relaxed text-ink placeholder:text-white/28 focus:border-white/25 focus:bg-white/[0.05] transition-all"
                placeholder="Leave the private note waiting for them…"
              />
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className={note.trim().length < 3 ? 'text-amber-400/80' : 'text-emerald-400/80'}>
                  {note.trim().length < 3 ? 'write at least 3 characters' : 'secret note ready'}
                </span>
                <span className="font-mono text-ink-3">{note.length}/160</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2.5 text-center text-[10px] text-ink-3">
        the outside guides them · the inside waits for their arrival
      </p>
    </div>
  )
}
