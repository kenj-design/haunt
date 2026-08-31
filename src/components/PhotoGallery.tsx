/**
 * Every photo left at a haunt, full size, one at a time.
 *
 * The read-only counterpart to the drop screen's fanned photo stack — the same
 * up-to-three images, no longer overlapping. Paging is native snap scrolling
 * rather than a JavaScript carousel: the browser already knows how a swipe
 * should feel, and the only state worth keeping is which page it settled on.
 *
 * Positioned `absolute`, so whichever screen opens it has to give it a
 * positioned box the size of the screen to fill.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export default function PhotoGallery({
  photos,
  startIndex = 0,
  onClose,
}: {
  photos: string[]
  startIndex?: number
  onClose: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [current, setCurrent] = useState(startIndex)

  // Opens on the photo that was tapped, rather than sliding there from the first.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (track) track.scrollLeft = track.clientWidth * startIndex
  }, [startIndex])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const label = photos.length === 1 ? 'photo left here' : `${photos.length} photos left here`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="photo-gallery fade-in absolute inset-0 z-[70] flex flex-col"
    >
      <header className="flex min-h-16 shrink-0 items-center justify-end px-4 pt-2">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="close photos"
          className="glass-control pressable flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink shadow-sm transition-colors duration-200 hover:bg-white/[0.1]"
        >
          <X size={17} strokeWidth={1.5} />
        </button>
      </header>

      <div
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget
          if (track.clientWidth > 0) {
            setCurrent(Math.round(track.scrollLeft / track.clientWidth))
          }
        }}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {photos.map((url, position) => (
          <div key={url} className="flex min-w-full snap-center items-center justify-center px-5">
            <img
              src={url}
              alt={
                photos.length === 1
                  ? 'photo left at this haunt'
                  : `photo ${position + 1} of ${photos.length} left at this haunt`
              }
              className="max-h-full max-w-full rounded-[20px] object-contain shadow-[0_30px_72px_rgba(0,0,0,.62)]"
            />
          </div>
        ))}
      </div>

      <footer className="flex min-h-16 shrink-0 items-center justify-center gap-2 pb-2">
        <p className="sr-only" aria-live="polite">
          {photos.length > 1 ? `photo ${current + 1} of ${photos.length}` : label}
        </p>
        {photos.length > 1 &&
          photos.map((url, position) => (
            <span
              key={url}
              className={`photo-gallery-dot ${position === current ? 'is-current' : ''}`}
              aria-hidden="true"
            />
          ))}
      </footer>
    </div>
  )
}
