/**
 * A stamp pressed straight onto the dark.
 *
 * The art arrives as ink on paper; the paper is keyed out before it ships, so
 * what is left is the impression itself — transparent where the pad ran dry,
 * carrying its carving texture in the alpha channel rather than in a colour. The
 * inks are remapped to the app's own state colours, so a stamp sits in the
 * palette instead of importing a second one. See `docs/illustrations.md`.
 *
 * Still hand-pressed, so it keeps a degree or two of tilt. Nothing under it: ink
 * on a black ground casts no shadow.
 *
 * Decoration only. Every screen that shows one already says in words what it
 * means, so these carry no alt text and are hidden from assistive tech, and a
 * missing file simply doesn't appear.
 */
import { useState } from 'react'
import { artUrl } from '../lib/art'
import type { ArtSlot } from '../lib/art'

export default function Stamp({
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
      className={`stamp-mark ${className}`}
    />
  )
}
