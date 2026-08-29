/**
 * Picks a haunt's shroud temperament and lifespan.
 * Not wired up — Drop a Haunt hardcodes both. See README.md in this folder.
 */
import { Calendar, Check } from 'lucide-react'
import HauntShader from '../HauntShader'
import type { HauntLifespan, ShroudTemperament } from '../../domain'

const MOVEMENTS: Array<{ value: ShroudTemperament; label: string; seed: number }> = [
  { value: 0, label: 'wide drifting fog', seed: 7 },
  { value: 1, label: 'close clinging fog', seed: 13 },
  { value: 2, label: 'restless quick fog', seed: 19 },
  { value: 3, label: 'nearly still fog', seed: 25 },
]

export function FogMovementPicker({
  value,
  onChange,
}: {
  value: ShroudTemperament
  onChange: (value: ShroudTemperament) => void
}) {
  return (
    <div>
      <p className="text-center text-[13px] text-ink-2">Choose how it moves</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {MOVEMENTS.map((movement) => {
          const selected = value === movement.value
          return (
            <button
              key={movement.value}
              type="button"
              onClick={() => onChange(movement.value)}
              aria-label={movement.label}
              aria-pressed={selected}
              className={`pressable relative aspect-square overflow-hidden rounded-[20px] border bg-[#090a0d] transition-[border-color,box-shadow,opacity] duration-200 ${
                selected
                  ? 'border-white/52 shadow-[0_0_0_1px_rgba(255,255,255,.08),0_12px_28px_rgba(0,0,0,.3)]'
                  : 'border-white/[0.09] opacity-62'
              }`}
            >
              <HauntShader seed={movement.seed} temperament={movement.value} />
              {selected && (
                <span className="absolute right-1.5 bottom-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
                  <Check size={9} strokeWidth={2.2} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface LifespanCard {
  value: HauntLifespan
  title: string
  subtitle: string
  renderGraphic: (selected: boolean) => React.ReactNode
}

const LIFESPAN_CARDS: LifespanCard[] = [
  {
    value: 'lasting',
    title: 'Endless',
    subtitle: 'stays until removed',
    renderGraphic: (selected: boolean) => (
      <div className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-br from-indigo-950/70 via-purple-950/40 to-[#0c0e14]">
        <svg viewBox="0 0 64 36" className="h-8 w-14 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
          <defs>
            <linearGradient id="infinity-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <path
            d="M 20 18 C 11 8, 3 8, 3 18 C 3 28, 11 28, 20 18 C 29 8, 37 8, 37 18 C 37 28, 29 28, 20 18 Z"
            fill="none"
            stroke="url(#infinity-glow)"
            strokeWidth="4"
            opacity={selected ? '0.45' : '0.15'}
            filter="blur(2.5px)"
          />
          <path
            d="M 20 18 C 11 8, 3 8, 3 18 C 3 28, 11 28, 20 18 C 29 8, 37 8, 37 18 C 37 28, 29 28, 20 18 Z"
            fill="none"
            stroke="url(#infinity-glow)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="20" cy="18" r="1.5" fill="#ffffff" opacity={selected ? '1' : '0.4'} />
          <circle cx="7" cy="13" r="1" fill="#93c5fd" opacity={selected ? '0.9' : '0.3'} />
          <circle cx="33" cy="23" r="1" fill="#c084fc" opacity={selected ? '0.9' : '0.3'} />
        </svg>
      </div>
    ),
  },
  {
    value: 'single',
    title: 'One Whisper',
    subtitle: 'vanishes on visit',
    renderGraphic: (selected: boolean) => (
      <div className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-br from-rose-950/70 via-pink-950/40 to-[#0c0e14]">
        <svg viewBox="0 0 64 36" className="h-8 w-14 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
          <defs>
            <linearGradient id="whisper-glow" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="50%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#fed7aa" />
            </linearGradient>
          </defs>
          <path
            d="M 8 26 Q 18 10, 26 16 T 40 6"
            fill="none"
            stroke="url(#whisper-glow)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="4 3"
            opacity={selected ? '0.95' : '0.45'}
          />
          <path
            d="M 14 30 Q 24 18, 32 22 T 46 12"
            fill="none"
            stroke="url(#whisper-glow)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="2 3"
            opacity={selected ? '0.75' : '0.3'}
          />
          <circle cx="41" cy="6" r="1.5" fill="#fef08a" opacity={selected ? '1' : '0.5'} />
          <circle cx="32" cy="11" r="1" fill="#fca5a5" opacity="0.6" />
          <circle cx="48" cy="14" r="1.2" fill="#fed7aa" opacity="0.5" />
        </svg>
      </div>
    ),
  },
  {
    value: 'dated',
    title: 'A Season',
    subtitle: 'until a set date',
    renderGraphic: (selected: boolean) => (
      <div className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-br from-amber-950/70 via-emerald-950/40 to-[#0c0e14]">
        <svg viewBox="0 0 64 36" className="h-8 w-14 transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
          <defs>
            <linearGradient id="season-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="60%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#67e8f9" />
            </linearGradient>
          </defs>
          <path
            d="M 24 7 A 11 11 0 0 0 24 29 A 8.5 8.5 0 0 1 24 7 Z"
            fill="url(#season-glow)"
            opacity={selected ? '0.95' : '0.5'}
          />
          <circle cx="24" cy="18" r="14" fill="none" stroke="rgba(245, 158, 11, 0.28)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="37" cy="12" r="1.5" fill="#fbbf24" opacity={selected ? '0.95' : '0.4'} />
          <circle cx="12" cy="24" r="1" fill="#34d399" opacity={selected ? '0.8' : '0.3'} />
        </svg>
      </div>
    ),
  },
]

export function LifespanPicker({
  value,
  expiresAt,
  onChange,
  onExpiresAtChange,
}: {
  value: HauntLifespan
  expiresAt: string
  onChange: (value: HauntLifespan) => void
  onExpiresAtChange: (value: string) => void
}) {
  const choose = (lifespan: HauntLifespan) => {
    onChange(lifespan)
    if (lifespan === 'dated' && !expiresAt) {
      const date = new Date()
      date.setDate(date.getDate() + 7)
      onExpiresAtChange(date.toISOString().slice(0, 10))
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-semibold tracking-[-0.015em] text-white">How long will it wait?</p>
        <span className="text-[10px] text-ink-3">Haunt lifespan</span>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        {LIFESPAN_CARDS.map((card) => {
          const selected = value === card.value
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => choose(card.value)}
              aria-pressed={selected}
              className={`group pressable flex flex-col items-center rounded-[22px] border p-2.5 text-center transition-all duration-250 cursor-pointer ${
                selected
                  ? 'border-white/50 bg-[#16181f] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_12px_28px_rgba(0,0,0,0.4)]'
                  : 'border-white/[0.08] bg-[#0e1014]/80 opacity-70 hover:opacity-95 hover:border-white/[0.18]'
              }`}
            >
              {card.renderGraphic(selected)}

              <div className="mt-2.5 w-full">
                <p className="text-[12px] font-semibold text-white tracking-tight">
                  {card.title}
                </p>
                <p className="mt-0.5 text-[9px] leading-tight text-ink-3">
                  {card.subtitle}
                </p>
              </div>

              {selected && (
                <div className="mt-2 flex items-center justify-center gap-1 rounded-full border border-white/15 bg-white/[0.08] px-2 py-0.5 text-[8px] font-semibold text-white/90">
                  <Check size={8} strokeWidth={2.5} />
                  selected
                </div>
              )}
            </button>
          )
        })}
      </div>

      {value === 'dated' && (
        <div className="fade-in mt-3.5 rounded-[20px] border border-amber-500/20 bg-amber-500/[0.05] p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-amber-200">
            <Calendar size={14} className="text-amber-400" />
            <span>Dissolves on this date</span>
          </div>
          <input
            type="date"
            value={expiresAt}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => onExpiresAtChange(event.target.value)}
            aria-label="Last day for this haunt"
            className="glass-control mt-2 w-full rounded-[14px] px-3.5 py-2.5 text-[13px] text-ink [color-scheme:dark] border border-white/[0.12] bg-black/40"
          />
        </div>
      )}
    </div>
  )
}

