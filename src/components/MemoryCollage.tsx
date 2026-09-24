import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Asterisk, MapPin, Volume2, X } from 'lucide-react'
import type { Haunt } from '../domain'
import duckSticker from '../assets/memories/duck-sticker.png'

/** A small, private scrapbook of the places this person has left behind. */
export default function MemoryCollage({
  haunts,
  onOpen,
  onCreate,
}: {
  haunts: Haunt[]
  onOpen: (hauntId: string) => void
  onCreate: () => void
}) {
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [unfolding, setUnfolding] = useState(false)
  const [folding, setFolding] = useState(false)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const frontCard = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const current = haunts[Math.min(index, haunts.length - 1)]
  const photos = current?.photoUrls ?? []
  const note = current?.arrivalNote.trim()

  const move = (direction: number) => {
    if (haunts.length < 2) return
    setIndex((value) => (value + direction + haunts.length) % haunts.length)
  }

  const openPage = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setExpanded(true)
    setFolding(false)
    setUnfolding(true)
    requestAnimationFrame(() => closeButton.current?.focus())
  }

  const closePage = () => {
    if (folding) return
    setUnfolding(false)
    setFolding(true)
  }

  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return
    swipeStart.current = { x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    suppressClick.current = true
    move(dx < 0 ? 1 : -1)
    window.setTimeout(() => { suppressClick.current = false }, 0)
  }

  return (
    <section className="memory-section px-5" aria-label="Your place scrapbook">
      <div className="memory-section-heading">
        <div>
          <p className="text-[14px] font-medium tracking-[-0.015em] text-ink-2">Places you left behind</p>
          <p className="mt-1 text-[11px] text-ink-3">a little scrapbook of your haunts</p>
        </div>
        <span className="memory-count">{haunts.length}</span>
      </div>

      {!current ? (
        <div className="memory-paper memory-empty">
          <span className="memory-kicker">YOUR FIELD NOTES</span>
          <div className="memory-empty-frame" aria-hidden="true">
            <MapPin size={25} strokeWidth={1.1} />
          </div>
          <h2>Your first page is waiting.</h2>
          <p>Leave a haunt with a photo and a note. It will find its way back here.</p>
          <button type="button" className="memory-open" onClick={onCreate}>
            leave a haunt <ArrowRight size={15} strokeWidth={1.5} />
          </button>
        </div>
      ) : !expanded ? (
        <div className="memory-stack-shell">
          <div
            className="memory-stack"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { swipeStart.current = null }}
          >
            {haunts.map((haunt, position) => {
              const depth = (position - index + haunts.length) % haunts.length
              const visible = depth < 3
              const previewNote = haunt.arrivalNoteKind === 'audio'
                ? 'A voice note waits at this place.'
                : haunt.arrivalNote || 'A place worth keeping.'
              const photo = haunt.photoUrls[0]
              return (
                <button
                  key={haunt.id}
                  ref={depth === 0 ? frontCard : undefined}
                  type="button"
                  className="memory-stack-card"
                  data-depth={visible ? depth : 'hidden'}
                  style={{ zIndex: haunts.length - depth }}
                  disabled={depth !== 0}
                  aria-label={depth === 0 ? `Open ${haunt.name} scrapbook page` : undefined}
                  aria-hidden={depth !== 0}
                  onClick={openPage}
                >
                  <span className="memory-folded-cover">
                    <span className="memory-folded-heading">
                      <span className="memory-folded-kicker">A PLACE YOU LEFT BEHIND</span>
                      <span className="memory-folded-title">{haunt.name}</span>
                      <span className="memory-folded-copy">{previewNote}</span>
                    </span>
                    <img className="memory-folded-duck" src={duckSticker} alt="" draggable={false} />
                    <span className="memory-folded-photo" style={photo ? undefined : { background: haunt.photoGradient }}>
                      {photo ? <img src={photo} alt="" draggable={false} /> : <span>no photo left here</span>}
                    </span>
                    <span className="memory-folded-flap" aria-hidden="true" />
                    <span className="memory-folded-crease memory-folded-crease-left" aria-hidden="true" />
                    <span className="memory-folded-crease memory-folded-crease-right" aria-hidden="true" />
                    <span className="memory-folded-open-hint">tap to unfold</span>
                    <span className="memory-note-fold" aria-hidden="true" />
                  </span>
                </button>
              )
            })}
            <span className="memory-stack-date">{current.lineage[0]?.time || 'your place'}</span>
          </div>
          <div className="memory-stack-tools">
            <span>swipe for another · tap to unfold</span>
            {haunts.length > 1 && (
              <div className="memory-stack-arrows" aria-label="Browse your haunts">
                <button type="button" onClick={() => move(-1)} aria-label="previous haunt"><ArrowLeft size={15} strokeWidth={1.5} /></button>
                <span>{Math.min(index, haunts.length - 1) + 1} / {haunts.length}</span>
                <button type="button" onClick={() => move(1)} aria-label="next haunt"><ArrowRight size={15} strokeWidth={1.5} /></button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`memory-paper is-expanded ${unfolding ? 'is-unfolding' : ''} ${folding ? 'is-folding' : ''}`}
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.animationName === 'memory-unfold') setUnfolding(false)
            if (event.animationName === 'memory-fold') {
              setExpanded(false)
              setFolding(false)
              requestAnimationFrame(() => frontCard.current?.focus())
            }
          }}
        >
          <div className="memory-masthead">
            <span className="memory-kicker">YOUR FIELD NOTES</span>
            <span className="memory-masthead-actions">
              <span className="memory-page-number">{String(Math.min(index, haunts.length - 1) + 1).padStart(2, '0')} / {String(haunts.length).padStart(2, '0')}</span>
              <button ref={closeButton} type="button" className="memory-collapse" onClick={closePage} aria-label="close scrapbook page"><X size={15} strokeWidth={1.5} /></button>
            </span>
          </div>

          <div className="memory-title-row">
            <div>
              <span className="memory-place-label"><MapPin size={11} strokeWidth={1.5} /> A HAUNT YOU FOUND</span>
              <h2>{current.name}</h2>
            </div>
            <span className="memory-time">{current.lineage[0]?.time || 'your place'}</span>
          </div>

          <div className={`memory-photo-stage ${photos.length === 0 ? 'is-photo-empty' : ''}`}>
            {photos.length ? (
              <>
                <div className="memory-photo memory-photo-main">
                  <img src={photos[0]} alt={`Photo left at ${current.name}`} />
                </div>
                {photos.length > 1 && (
                  <div className="memory-photo memory-photo-detail">
                    <img src={photos[1]} alt={`Another photo left at ${current.name}`} />
                  </div>
                )}
                {photos.length > 2 && (
                  <div className="memory-photo memory-photo-third">
                    <img src={photos[2]} alt={`Third photo left at ${current.name}`} />
                  </div>
                )}
                <span className="memory-tape memory-tape-top" aria-hidden="true" />
                {photos.length > 1 && <span className="memory-tape memory-tape-side" aria-hidden="true" />}
                {photos.length < 3 && <Asterisk className="memory-scribble" size={34} strokeWidth={1.1} aria-hidden="true" />}
              </>
            ) : (
              <div className="memory-photo-placeholder" style={{ background: current.photoGradient }}>
                <span>no photograph<br />just the feeling</span>
              </div>
            )}
          </div>

          <div className="memory-note">
            <span className="memory-note-label">THE NOTE YOU LEFT</span>
            {current.arrivalNoteKind === 'audio' ? (
              <p className="memory-voice"><Volume2 size={16} strokeWidth={1.5} /> A voice note waits at this place.</p>
            ) : (
              <blockquote>{note ? `“${note}”` : 'No note was left here.'}</blockquote>
            )}
          </div>

          <div className="memory-footer">
            <div className="memory-pager" aria-label="Scrapbook pages">
              <button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0} aria-label="previous haunt">
                <ArrowLeft size={16} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => setIndex((value) => Math.min(haunts.length - 1, value + 1))} disabled={index >= haunts.length - 1} aria-label="next haunt">
                <ArrowRight size={16} strokeWidth={1.5} />
              </button>
            </div>
            <button type="button" className="memory-open" onClick={() => onOpen(current.id)}>
              open haunt <ArrowRight size={15} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
