/**
 * Freehand sigil capture, normalized to 0–1 so it replays at any size.
 * Not wired up — intended for the keepsake a visit produces.
 * See README.md in this folder.
 */
import { useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import type { NormalizedPoint } from '../../domain'

const MAX_SIGIL_POINTS = 64

function pointList(points: NormalizedPoint[]) {
  return points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')
}

export function SigilGlyph({
  points,
  className = '',
}: {
  points: NormalizedPoint[] | undefined
  className?: string
}) {
  if (!points || points.length < 2) return null
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-hidden="true">
      <polyline
        points={pointList(points)}
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default function SigilDraw({
  value,
  onChange,
}: {
  value: NormalizedPoint[]
  onChange: (points: NormalizedPoint[]) => void
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<number | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const pointFromEvent = (event: React.PointerEvent): NormalizedPoint => {
    const bounds = surfaceRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0.5, y: 0.5 }
    return {
      x: Math.min(0.94, Math.max(0.06, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(0.94, Math.max(0.06, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== null) return
    event.preventDefault()
    pointerRef.current = event.pointerId
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointers may not support capture.
    }
    const points = [pointFromEvent(event)]
    valueRef.current = points
    onChange(points)
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = valueRef.current
    if (pointerRef.current !== event.pointerId || current.length >= MAX_SIGIL_POINTS) return
    event.preventDefault()
    const point = pointFromEvent(event)
    const last = current[current.length - 1]
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.018) return
    const points = [...current, point]
    valueRef.current = points
    onChange(points)
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
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
        aria-label="Draw a personal symbol"
        className="sigil-pad relative mx-auto aspect-square w-[132px] touch-none select-none overflow-hidden rounded-full border border-white/[0.13]"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <span className="pointer-events-none absolute inset-[18%] rounded-full border border-dashed border-white/[0.1]" />
        {value.length > 1 ? (
          <SigilGlyph points={value} className="pointer-events-none absolute inset-[20%] h-[60%] w-[60%] text-white/82" />
        ) : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-white/36">
            draw here
          </span>
        )}
      </div>
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="pressable mx-auto mt-2 flex h-8 items-center gap-1.5 rounded-full px-3 text-[10px] text-white/42 transition-colors hover:text-white/72"
        >
          <RotateCcw size={11} strokeWidth={1.6} />
          redraw
        </button>
      )}
    </div>
  )
}
