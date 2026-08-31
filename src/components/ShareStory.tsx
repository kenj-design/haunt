/**
 * Hands a story-shaped image to the share sheet.
 *
 * Owns its own feedback, because the outcome is not knowable in advance: on a
 * phone the sheet opens and Instagram is one tap away, on a desktop the file
 * downloads instead, and either is a success worth saying out loud. The label
 * comes back after a moment so the button is never left reading as done.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { shareStoryCard } from '../lib/storyCard'
import type { StoryCard } from '../lib/storyCard'

const SETTLE_MS = 2600

export default function ShareStory({
  card,
  name,
  className,
  children,
}: {
  card: StoryCard
  name: string
  className?: string
  children: ReactNode
}) {
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const say = (message: string) => {
    setNote(message)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNote(null), SETTLE_MS)
  }

  const run = async () => {
    setBusy(true)
    try {
      const outcome = await shareStoryCard(card, name)
      if (outcome === 'downloaded') say('image saved')
      else if (outcome === 'shared') say('sent')
    } catch {
      say("couldn't make that image")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" disabled={busy} onClick={() => void run()} className={className}>
      {busy ? 'drawing…' : (note ?? children)}
    </button>
  )
}
