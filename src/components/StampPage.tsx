/**
 * A stamped page, resting on the dark.
 *
 * The app is nearly black, so a warm sheet of paper reads as a physical object
 * someone kept rather than as a picture pasted onto a screen — which is the
 * whole idea of a haunt. Hence the tilt, the weight underneath, and the hairline
 * along the top edge.
 *
 * Decoration only: every screen that shows one already says in words what it
 * means, so these carry no alt text and are hidden from assistive tech. If the
 * file is missing the page simply doesn't appear — a placeholder that can't load
 * should cost nothing.
 */
import { useState } from 'react'
import { artUrl } from '../lib/art'
import type { ArtSlot } from '../lib/art'

export default function StampPage({
  slot,
  className = '',
  /** Degrees of tilt. A page never lands square. */
  tilt = -1.4,
  /** Load immediately rather than when it scrolls into view. */
  eager = false,
}: {
  slot: ArtSlot
  className?: string
  tilt?: number
  eager?: boolean
}) {
  const [missing, setMissing] = useState(false)
  if (missing) return null

  return (
    <img
      src={artUrl(slot)}
      alt=""
      aria-hidden="true"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setMissing(true)}
      style={{ transform: `rotate(${tilt}deg)` }}
      className={`stamp-page ${className}`}
    />
  )
}
