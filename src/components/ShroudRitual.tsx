/**
 * Leaving a haunt as something you do, not something you submit.
 *
 * `HoldToRelease` is the drop control: press and hold while the fog gathers, and
 * let go to release the place into the world. A hold rather than a tap because
 * this is the one irreversible act in the app, and the delay is the point.
 *
 * `ShroudSculptor` lets a finder draw the shroud's shape by hand, normalized to
 * 0–1 so it replays at any size. It is not wired into a flow yet — the drop
 * screen seeds a shape instead.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import type { NormalizedPoint, ShroudTemperament } from '../domain'
import HauntShader from './HauntShader'

import { ShroudEngulfShader } from './ShroudEngulfShader'

const MAX_SHROUD_POINTS = 56
const RELEASE_DURATION = 2200

function makeSuggestedShroud(): NormalizedPoint[] {
  const phase = Math.random() * Math.PI * 2
  return Array.from({ length: 24 }, (_, index) => {
    const t = index / 23
    return {
      x: 0.18 + t * 0.64 + Math.sin(t * 8.2 + phase) * 0.045,
      y: 0.55 + Math.sin(t * 4.4 + phase) * 0.18 + Math.cos(t * 9.7) * 0.035,
    }
  })
}

export function ShroudSculptor({
  value,
  onChange,
  temperament = 0,
}: {
  value: NormalizedPoint[]
  onChange: (points: NormalizedPoint[]) => void
  temperament?: ShroudTemperament
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<number | null>(null)
  const valueRef = useRef(value)
  const [animateFormation, setAnimateFormation] = useState(true)
  const rawId = useId()
  const filterId = `shroud-${rawId.replace(/:/g, '')}`
  valueRef.current = value

  const path = useMemo(() => {
    if (value.length === 0) return ''
    const [first, ...rest] = value
    const start = `M ${first.x * 100} ${first.y * 100}`
    if (rest.length === 0) return `${start} l 0.01 0.01`
    return `${start} ${rest.map((point) => `L ${point.x * 100} ${point.y * 100}`).join(' ')}`
  }, [value])

  const pointFromEvent = (event: React.PointerEvent): NormalizedPoint => {
    const bounds = surfaceRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0.5, y: 0.5 }
    return {
      x: Math.min(0.94, Math.max(0.06, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(0.94, Math.max(0.06, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  const startDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== null) return
    event.preventDefault()
    setAnimateFormation(true)
    pointerRef.current = event.pointerId
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture can be absent in synthetic browser tests.
    }
    const next = [pointFromEvent(event)]
    valueRef.current = next
    onChange(next)
  }

  const keepDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = valueRef.current
    if (pointerRef.current !== event.pointerId || current.length >= MAX_SHROUD_POINTS) return
    event.preventDefault()
    const point = pointFromEvent(event)
    const last = current[current.length - 1]
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.018) {
      const next = [...current, point]
      valueRef.current = next
      onChange(next)
    }
  }

  const stopDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return
    pointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div>
      <div
        ref={surfaceRef}
        role="img"
        aria-label={
          value.length > 3
            ? 'Your hand-drawn cloudy shroud'
            : 'Blank shroud. Drag a finger here to shape it.'
        }
        onPointerDown={startDrawing}
        onPointerMove={keepDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        className="shroud-sculptor relative mx-auto aspect-square w-full max-w-[248px] touch-none select-none overflow-hidden rounded-[34px] border border-white/[0.1] bg-[#090a0d] shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_24px_60px_rgba(0,0,0,.34)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,rgba(123,139,165,.11),transparent_56%)]" />
        {value.length > 3 && (
          <div className={`${animateFormation ? 'shroud-formed' : ''} pointer-events-none absolute inset-0 opacity-90`}>
            <HauntShader seed={13} shape={value} temperament={temperament} />
          </div>
        )}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.025 0.072"
                numOctaves="4"
                seed="13"
                result="noise"
              />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="13" />
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>
          {path && (
            <>
              <path
                d={path}
                fill="none"
                stroke="rgba(166,185,211,.16)"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${filterId})`}
              />
              <path
                d={path}
                fill="none"
                stroke="rgba(223,231,241,.08)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
        {value.length < 4 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <span className="text-[12px] font-medium text-white/72">drag slowly through the dark</span>
            <span className="mt-1 text-[10px] leading-relaxed text-white/34">
              your gesture becomes its shape
            </span>
          </div>
        )}
        <div className="shroud-grain pointer-events-none absolute -inset-8 opacity-55" />
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            setAnimateFormation(event.detail > 0)
            onChange(makeSuggestedShroud())
          }}
          className="pressable inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-3 text-[10px] font-medium text-white/62 transition-colors hover:bg-white/[0.09] hover:text-white/84"
        >
          <Sparkles size={11} strokeWidth={1.6} />
          shape one for me
        </button>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="pressable inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] text-white/48 transition-colors hover:text-white/80"
            aria-label="clear shroud and draw again"
          >
            <RotateCcw size={11} strokeWidth={1.6} />
          </button>
        )}
      </div>
    </div>
  )
}

export function HoldToRelease({
  disabled,
  onRelease,
  shroudPath,
  temperament = 0,
  actionLabel = 'hold to seal',
  releasedLabel = 'sealed',
  disabledLabel = 'not ready',
  disabledSubtext = 'complete above',
  actionAriaLabel,
  disabledAriaLabel,
}: {
  disabled?: boolean
  onRelease: () => void
  shroudPath?: NormalizedPoint[]
  temperament?: ShroudTemperament
  actionLabel?: string
  releasedLabel?: string
  disabledLabel?: string
  disabledSubtext?: string
  actionAriaLabel?: string
  disabledAriaLabel?: string
}) {
  const [holding, setHolding] = useState(false)
  const [released, setReleased] = useState(false)
  const holdTimerRef = useRef<number | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const pointerRef = useRef<number | null>(null)
  const releasedRef = useRef(false)

  const cancel = () => {
    if (releasedRef.current) return
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
    setHolding(false)
  }

  const finish = () => {
    if (releasedRef.current) return
    releasedRef.current = true
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
    setHolding(false)
    setReleased(true)
    if ('vibrate' in navigator) navigator.vibrate([24, 50, 40])
    releaseTimerRef.current = window.setTimeout(onRelease, 600)
  }

  const begin = () => {
    if (disabled || releasedRef.current || holdTimerRef.current !== null) return
    setHolding(true)
    holdTimerRef.current = window.setTimeout(finish, RELEASE_DURATION)
  }

  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current)
    },
    [],
  )

  return (
    <div className="my-6 flex flex-col items-center justify-center select-none">
      <button
        type="button"
        disabled={disabled}
        aria-label={
          disabled
            ? disabledAriaLabel ?? 'Complete the note above to add this haunt'
            : actionAriaLabel ?? 'Press and hold the fog orb to seal this haunt'
        }
        onPointerDown={(event) => {
          if (disabled) return
          pointerRef.current = event.pointerId
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Pointer capture can be absent in synthetic tests
          }
          begin()
        }}
        onPointerUp={(event) => {
          if (pointerRef.current !== event.pointerId) return
          pointerRef.current = null
          if (!releasedRef.current) cancel()
        }}
        onPointerCancel={() => {
          pointerRef.current = null
          cancel()
        }}
        onKeyDown={(event) => {
          if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
            event.preventDefault()
            begin()
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            if (!releasedRef.current) cancel()
          }
        }}
        onClick={(event) => event.preventDefault()}
        data-holding={holding}
        data-released={released}
        className={`mystic-ritual-talisman group relative h-[140px] w-[140px] cursor-pointer touch-none rounded-full outline-none transition-opacity duration-300 focus-visible:ring-2 focus-visible:ring-white/40 ${
          disabled ? 'cursor-not-allowed opacity-45' : 'opacity-100'
        }`}
      >
        {/* Sleek Crystal Orb Sphere with live app Shroud Shader */}
        <div className="mystic-orb-sphere h-[132px] w-[132px]">
          {/* Live Shroud Fog inside the orb */}
          <div className="pointer-events-none absolute inset-0 z-0 scale-125 opacity-90">
            <HauntShader seed={29} temperament={temperament} shape={shroudPath} />
          </div>

          {/* Center Ritual Text with graceful fade-out when fog expands */}
          <div
            className={`relative z-10 flex flex-col items-center justify-center px-3 text-center transition-all duration-200 ${
              holding
                ? 'translate-y-1 scale-90 opacity-0'
                : 'translate-y-0 scale-100 opacity-100'
            }`}
          >
            <span className="text-[13px] font-semibold tracking-[-0.015em] text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)]">
              {released ? releasedLabel : disabled ? disabledLabel : actionLabel}
            </span>
            <span className="mt-0.5 text-[9px] font-medium tracking-tight text-white/65 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {released ? 'resting in secret' : disabled ? disabledSubtext : 'press & hold'}
            </span>
          </div>
        </div>

        {/* Ambient soft glow aura */}
        <div
          className={`pointer-events-none absolute -inset-3 rounded-full transition-opacity duration-300 ${
            holding ? 'opacity-100 bg-radial from-indigo-500/25 via-cyan-500/10 to-transparent blur-xl' : 'opacity-0'
          }`}
        />

        {/* Real-Time Live Accelerated Shroud WebGL Shader */}
        <ShroudEngulfShader
          holding={holding}
          released={released}
          duration={RELEASE_DURATION}
          onComplete={finish}
        />
      </button>
    </div>
  )
}
