/**
 * Leaving and displaying the marks visitors leave at a haunt.
 * Not wired up — `Haunt.residues` is modelled and always empty.
 * See README.md in this folder.
 */
import { Check } from 'lucide-react'
import { useState } from 'react'
import type { HauntResidue, ResidueMark } from '../../domain'
import { stringSeed } from '../../lib/seed'

export const RESIDUE_COLORS = ['#78aeba', '#9a89c7', '#c37b78', '#8eb179', '#d0a466']
const RESIDUE_MARKS: ResidueMark[] = ['ring', 'cross', 'spark', 'wave']

export function ResidueGlyph({
  mark,
  className = '',
}: {
  mark: ResidueMark
  className?: string
}) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      {mark === 'ring' && <circle cx="16" cy="16" r="8.5" stroke="currentColor" strokeWidth="2" />}
      {mark === 'cross' && (
        <path d="M9 9l14 14M23 9L9 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
      {mark === 'spark' && (
        <path d="M16 5c.8 6.7 4.3 10.2 11 11-6.7.8-10.2 4.3-11 11-.8-6.7-4.3-10.2-11-11 6.7-.8 10.2-4.3 11-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      )}
      {mark === 'wave' && (
        <path d="M5 18c3.7-7.2 7.3 7.2 11 0s7.3 7.2 11 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}

function residuePosition(id: string, index: number) {
  const seed = stringSeed(id)
  return {
    left: `${14 + ((seed * 17 + index * 29) % 70)}%`,
    top: `${18 + ((seed * 11 + index * 23) % 58)}%`,
    transform: `translate(-50%, -50%) rotate(${(seed % 31) - 15}deg)`,
  }
}

export function ResidueField({ residues }: { residues: HauntResidue[] }) {
  if (residues.length === 0) return null
  return (
    <div className="residue-field relative mt-4 h-24 overflow-hidden rounded-[22px] border border-white/[0.09]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_54%,rgba(111,132,158,.16),transparent_62%)]" />
      {residues.slice(-8).map((residue, index) => (
        <span
          key={residue.id}
          className="absolute flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-black/25 shadow-[0_8px_20px_rgba(0,0,0,.28)] backdrop-blur-md"
          style={{ ...residuePosition(residue.id, index), color: residue.color }}
          title={`${residue.author} · ${residue.time}`}
        >
          <ResidueGlyph mark={residue.mark} className="h-6 w-6" />
        </span>
      ))}
    </div>
  )
}

export default function ResidueComposer({
  residues,
  currentUser,
  canLeave,
  onLeave,
}: {
  residues: HauntResidue[]
  currentUser: string
  canLeave: boolean
  onLeave: (mark: ResidueMark, color: string) => void
}) {
  const existing = residues.find((residue) => residue.author === currentUser)
  const [mark, setMark] = useState<ResidueMark>(existing?.mark ?? 'ring')
  const [color, setColor] = useState(existing?.color ?? RESIDUE_COLORS[0])

  return (
    <div className="premium-card mt-5 rounded-[26px] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">
          {canLeave ? 'Leave a trace' : 'Traces left here'}
        </p>
        {residues.length > 0 && <span className="text-[10px] text-ink-3">{residues.length}</span>}
      </div>
      <ResidueField residues={residues} />
      {canLeave && (
        <>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {RESIDUE_MARKS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMark(option)}
                  aria-label={`Choose ${option} trace`}
                  aria-pressed={mark === option}
                  className={`pressable flex h-10 w-10 items-center justify-center rounded-full border transition-[border-color,background-color] duration-200 ${
                    mark === option ? 'border-white/44 bg-white/[0.12]' : 'border-white/[0.08] bg-white/[0.035]'
                  }`}
                >
                  <ResidueGlyph mark={option} className="h-6 w-6 text-white/72" />
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {RESIDUE_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label="Choose trace color"
                  aria-pressed={color === option}
                  className={`pressable h-5 w-5 rounded-full border ${color === option ? 'border-white' : 'border-white/10'}`}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onLeave(mark, color)}
            className="pressable mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/[0.13] bg-white/[0.075] text-[12px] font-medium text-white/82 transition-colors hover:bg-white/[0.11]"
          >
            {existing && <Check size={13} strokeWidth={1.8} />}
            {existing ? 'change my trace' : 'leave this trace'}
          </button>
        </>
      )}
    </div>
  )
}
