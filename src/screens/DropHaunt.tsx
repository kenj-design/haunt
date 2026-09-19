/**
 * Leaving a haunt.
 *
 * Hands a `HauntDraft` to the data layer rather than a finished record — the id,
 * lineage, counters, and health all belong to whatever is storing it.
 *
 * The screen does not leave when the drop lands. The hold closes the fog over
 * everything, the write happens under it, and the fog then holds while the
 * confirmation surfaces on top — so the form stays mounted the whole time,
 * which is also what lets a refused drop come back to a filled-in note rather
 * than an empty one.
 *
 * Photos live as in-memory object URLs until the drop lands, so ownership of
 * them transfers at exactly one moment; `drop()` explains the handoff and why it
 * has to happen before the await rather than after.
 *
 * A new haunt is shared with the finder's circle the moment it lands. Everyone
 * outside that circle sees a fogged zone and `???` — nothing else reaches them —
 * so the map fills up without anything leaking. The few words a finder writes
 * for friends are still added afterwards, on Haunt Detail.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  LockKeyhole,
  MapPin,
  Plus,
  Users,
} from 'lucide-react'
import { useApp } from '../context/appState'
import { PrimaryButton, primaryButtonClass, ScreenHeader, VibePill } from '../components/ui'
import ShareStory from '../components/ShareStory'
import { inviteLabel } from '../lib/invite'
import { stringSeed } from '../lib/seed'
import ArrivalNoteComposer from '../components/ArrivalNoteComposer'
import { HoldToRelease } from '../components/ShroudRitual'
import { GRADIENT_SWATCHES, VIBE_TAGS } from '../domain'
import type { Haunt, HauntDraft } from '../domain'
import { zonePreviewTileUrl } from '../lib/geo'

const MAX_PHOTOS = 3
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
const MAX_VIBES = 3
const MAX_NAME_LENGTH = 50
const MIN_ZONE_RADIUS_M = 100
const MAX_ZONE_RADIUS_M = 400
const DEFAULT_ZONE_RADIUS_M = 200

/**
 * How long the screen stays wholly under fog before the confirmation surfaces.
 *
 * The write can land in a few milliseconds on a fast backend, and the moment is
 * the point: without a floor under it, the fog would close and lift in the same
 * breath.
 */
const ENGULFED_DWELL_MS = 520

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Where the haunt gets left.
 *
 * Fixed for now — `DumaguetePickerMap` in `components/unwired/` is the real
 * picker, waiting on a device location to centre itself on.
 */
const DEFAULT_ZONE_POINT = { x: 44, y: 44 }

function zoneTileStyle(zone: { x: number; y: number }) {
  return {
    backgroundImage: `linear-gradient(145deg, rgba(35,44,54,.12), rgba(4,7,12,.62)), url(${zonePreviewTileUrl(zone)})`,
  }
}

export default function DropHaunt() {
  const { goBack, navigate, dropHaunt, friends, user, isBusy, requestLocation } = useApp()
  const scrollRef = useRef<HTMLDivElement>(null)
  const photoUrlsRef = useRef<string[]>([])
  const submittedRef = useRef(false)
  // Non-null once the drop has landed: the haunt this screen just made, and the
  // signal that the fog is now holding for its confirmation.
  const [dropped, setDropped] = useState<Haunt | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [vibes, setVibes] = useState<string[]>([])
  const [arrivalNote, setArrivalNote] = useState('')
  const [arrivalNoteAudioUrl, setArrivalNoteAudioUrl] = useState<string | null>(null)
  const [arrivalNoteAudioDuration, setArrivalNoteAudioDuration] = useState(0)
  const [radius, setRadius] = useState(DEFAULT_ZONE_RADIUS_M)
  const [zoneEditing, setZoneEditing] = useState(false)
  const [whosHere, setWhosHere] = useState<string[]>([])
  const [askGroup, setAskGroup] = useState(false)
  const [zonePoint] = useState(DEFAULT_ZONE_POINT)

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [])

  // Ask when the person chooses to leave a place, not while the app is still
  // explaining itself. The cached result is reused by the final drop.
  useEffect(() => {
    void requestLocation()
  }, [requestLocation])

  useEffect(() => {
    photoUrlsRef.current = photoUrls
  }, [photoUrls])

  useEffect(
    () => () => {
      if (!submittedRef.current) {
        photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      }
    },
    [],
  )

  const toggleVibe = (tag: string) => {
    setVibes((current) => {
      if (current.includes(tag)) return current.filter((value) => value !== tag)
      return current.length < MAX_VIBES ? [...current, tag] : current
    })
  }

  const choosePhotos = (files: FileList | null) => {
    if (!files?.length) return

    const remaining = MAX_PHOTOS - photoUrlsRef.current.length
    const nextUrls: string[] = []
    let error: string | null = null

    Array.from(files).forEach((file) => {
      if (nextUrls.length >= remaining) {
        error = 'up to 3 photos is plenty for one haunt'
        return
      }
      if (!file.type.startsWith('image/')) {
        error = 'choose image files only'
        return
      }
      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        error = 'keep each photo under 5 MB'
        return
      }
      nextUrls.push(URL.createObjectURL(file))
    })

    if (nextUrls.length > 0) {
      const next = [...photoUrlsRef.current, ...nextUrls]
      photoUrlsRef.current = next
      setPhotoUrls(next)
    }
    setPhotoError(error)
  }

  const canSubmit = name.trim().length > 0

  const goBackFromDrop = (_event: MouseEvent<HTMLButtonElement>) => {
    if (askGroup) {
      setAskGroup(false)
      return
    }
    goBack()
  }

  const drop = async (): Promise<boolean> => {
    if (!canSubmit || isBusy) return false

    const hasAudioNote = arrivalNoteAudioUrl !== null
    const typedNote = arrivalNote.trim()
    const draft: HauntDraft = {
      name: name.trim(),
      vibeTags: vibes,
      bestTimeTags: [],
      // A voice note replaces a typed one rather than sitting alongside it.
      arrivalNoteKind: hasAudioNote ? 'audio' : typedNote ? 'text' : null,
      arrivalNote: hasAudioNote ? '' : typedNote,
      arrivalNoteAudioUrl: arrivalNoteAudioUrl ?? undefined,
      arrivalNoteAudioDuration: hasAudioNote ? arrivalNoteAudioDuration : undefined,
      zone: { ...zonePoint, radiusM: radius },
      lifespan: 'lasting',
      // Shared on arrival rather than kept private: a haunt nobody can see does
      // nothing, and an alpha with an empty map reads as broken rather than
      // quiet. Everyone outside the circle still only sees fog.
      audience: 'circle',
      photoGradient: GRADIENT_SWATCHES[0],
      photoUrls,
      foundedWith: whosHere,
    }

    // Hand the object URLs over before awaiting: once the drop lands they belong
    // to the new haunt, and this screen's cleanup would otherwise revoke photos
    // the haunt is now showing.
    submittedRef.current = true
    const [haunt] = await Promise.all([dropHaunt(draft), wait(ENGULFED_DWELL_MS)])
    if (!haunt) {
      // Refused, so the photos are ours to clean up again — and reporting the
      // failure unwinds the ritual, retreating the fog off a form that still has
      // everything that was typed into it.
      submittedRef.current = false
      return false
    }
    setDropped(haunt)
    return true
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="drop-screen drop-screen-notes screen-in no-scrollbar h-full overflow-y-auto pb-5"
        /* Under fog the form is still there and still scrollable, which would let
           a stray touch or a tab press wander into a screen nobody can see. */
        inert={dropped !== null}
      >
        <ScreenHeader title="Leave a Haunt" serif onBack={goBackFromDrop} />

        <main className="notes-compose px-4 pb-6">
          <section className="notes-section notes-place-section" aria-labelledby="place-heading">
            <h2 id="place-heading" className="sr-only">
              Photo and place name
            </h2>
            <div className="notes-place-row">
              <label
                className="notes-photo-slot pressable cursor-pointer"
                title="Add photo"
                aria-label="Add photo"
                data-count={photoUrls.length}
              >
                {photoUrls.length === 0 ? (
                  <span className="notes-photo-slot-skeleton" aria-hidden="true">
                    <Camera size={17} strokeWidth={1.35} />
                  </span>
                ) : (
                  <span className="notes-photo-slot-media" aria-hidden="true">
                    {photoUrls.map((url, index) => (
                      <span
                        key={url}
                        className={`notes-photo-thumb notes-photo-thumb-${index + 1}`}
                        style={{
                          backgroundImage: `linear-gradient(to top,rgba(8,10,15,.25),transparent 64%),url(${url})`,
                        }}
                      />
                    ))}
                  </span>
                )}
                <span className="notes-photo-slot-plus" aria-hidden="true">
                  <Plus size={15} strokeWidth={1.8} />
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    choosePhotos(event.currentTarget.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>

              <input
                value={name}
                aria-label="name this place"
                aria-required="true"
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => setName(event.target.value.slice(0, MAX_NAME_LENGTH))}
                placeholder="name this place"
                className="notes-name-input"
              />
            </div>
            {photoError && <p className="notes-error">{photoError}</p>}
          </section>

          <section className="notes-section notes-main-note-section" aria-labelledby="arrival-heading">
            <div className="notes-main-note-heading">
              <div>
                <h2 id="arrival-heading" className="notes-section-label notes-main-note-title">
                  leave a note for whoever arrives
                </h2>
                <p className="notes-main-note-subtext">optional · locked until they get there</p>
              </div>
              <LockKeyhole size={14} strokeWidth={1.45} aria-hidden="true" />
            </div>
            <div className="notes-main-note-field">
              <ArrivalNoteComposer
                value={arrivalNote}
                audioUrl={arrivalNoteAudioUrl}
                audioDuration={arrivalNoteAudioDuration}
                onTextChange={(value) => {
                  setArrivalNoteAudioUrl(null)
                  setArrivalNoteAudioDuration(0)
                  setArrivalNote(value)
                }}
                onAudioChange={(url, duration) => {
                  setArrivalNote('')
                  setArrivalNoteAudioUrl(url)
                  setArrivalNoteAudioDuration(duration)
                }}
              />
            </div>
          </section>

          <section className="notes-section notes-feelings-section" aria-labelledby="feelings-heading">
            <div className="notes-section-heading">
              <h2 id="feelings-heading" className="notes-section-label">
                feelings · optional
              </h2>
              <span className="notes-section-count">{vibes.length} / {MAX_VIBES}</span>
            </div>
            <div className="notes-vibe-grid">
              {VIBE_TAGS.map((tag) => (
                <VibePill key={tag} label={tag} active={vibes.includes(tag)} onClick={() => toggleVibe(tag)} />
              ))}
            </div>
          </section>

          <section className="notes-section notes-zone-section" aria-labelledby="zone-heading">
            <div className="notes-zone-row">
              <span className="notes-zone-thumb" style={zoneTileStyle(zonePoint)} aria-hidden="true">
                <MapPin size={15} strokeWidth={1.55} />
              </span>
              <span className="notes-zone-copy">
                <span id="zone-heading" className="notes-zone-title">
                  Dumaguete · {radius}m zone
                </span>
                <span className="notes-zone-subtext">friends see this area, not the exact spot</span>
              </span>
              <button
                type="button"
                className="notes-inline-edit pressable"
                aria-expanded={zoneEditing}
                onClick={() => setZoneEditing((editing) => !editing)}
              >
                edit
              </button>
            </div>
            {zoneEditing && (
              <div className="notes-zone-editor">
                <div className="notes-zone-editor-heading">
                  <span>zone radius</span>
                  <strong>{radius}m</strong>
                </div>
                <input
                  type="range"
                  min={MIN_ZONE_RADIUS_M}
                  max={MAX_ZONE_RADIUS_M}
                  step={10}
                  value={radius}
                  aria-label="zone radius in metres"
                  onChange={(event) => setRadius(Number(event.target.value))}
                />
                <div className="notes-zone-editor-scale" aria-hidden="true">
                  <span>{MIN_ZONE_RADIUS_M}m</span>
                  <span>{MAX_ZONE_RADIUS_M}m</span>
                </div>
              </div>
            )}
          </section>

          <section className="notes-group-section">
            <button
              type="button"
              className="notes-group-link pressable"
              aria-expanded={askGroup}
              onClick={() => setAskGroup((open) => !open)}
            >
              <Users size={14} strokeWidth={1.45} aria-hidden="true" />
              <span>friends with you? found it together</span>
              <ChevronDown
                size={14}
                strokeWidth={1.45}
                className={`notes-group-chevron ${askGroup ? 'is-open' : ''}`}
                aria-hidden="true"
              />
            </button>
            {askGroup && (
              <div className="notes-group-panel">
                <p className="notes-group-helper">choose anyone who is here with you</p>
                <div className="notes-group-list">
                  {friends.map((friend) => {
                    const selected = whosHere.includes(friend.handle)
                    return (
                      <button
                        type="button"
                        key={friend.handle}
                        onClick={() =>
                          setWhosHere((current) =>
                            selected
                              ? current.filter((handle) => handle !== friend.handle)
                              : [...current, friend.handle],
                          )
                        }
                        aria-pressed={selected}
                        className={`notes-group-person pressable ${selected ? 'is-selected' : ''}`}
                      >
                        <span>{friend.handle}</span>
                        <span className="notes-group-check" aria-hidden="true">
                          {selected ? (
                            <Check size={14} strokeWidth={1.9} />
                          ) : (
                            <span className="notes-group-empty-check" />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="notes-group-done pressable"
                  onClick={() => setAskGroup(false)}
                >
                  {whosHere.length > 0
                    ? `founding with ${whosHere.length} friend${whosHere.length === 1 ? '' : 's'}`
                    : 'just me'}
                </button>
              </div>
            )}
          </section>

          <div className="notes-action-dock">
            <HoldToRelease
              disabled={!canSubmit || isBusy}
              onRelease={drop}
              actionLabel="hold to add the haunt"
              releasedLabel="added"
              disabledLabel="name the place first"
              disabledSubtext="then hold to add"
              actionAriaLabel="Press and hold the fog orb to add this haunt"
              disabledAriaLabel="Name the place first to add this haunt"
            />
          </div>
        </main>
      </div>
      {dropped && (
        <Aftermath
          haunt={dropped}
          canPass={friends.length > 0}
          onMap={goBack}
          inviteFooter={inviteLabel(user.handle)}
          onOpen={() => navigate({ name: 'haunt', hauntId: dropped.id }, { replace: true })}
          onPass={() => navigate({ name: 'pass', hauntId: dropped.id }, { replace: true })}
        />
      )}
    </div>
  )
}

/**
 * What the fog lifts onto.
 *
 * Sits above the shroud instead of replacing it: the place is left, the screen
 * is still under fog, and what is left to do is hand it to someone, look at it,
 * or go. It renders the haunt the backend handed back rather than looking one
 * up, so it can only ever show a place that really landed — photos included,
 * which is why the fanned stack from the form above reappears here.
 */
function Aftermath({
  haunt,
  canPass,
  inviteFooter,
  onMap,
  onOpen,
  onPass,
}: {
  haunt: Haunt
  canPass: boolean
  inviteFooter: string
  onMap: () => void
  onOpen: () => void
  onPass: () => void
}) {
  const photos = haunt.photoUrls
  return (
    <div className="drop-aftermath no-scrollbar absolute inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto px-9 py-8 text-center">
      {photos.length > 0 ? (
        <div
          className="notes-photo-slot notes-photo-slot-static note-reveal"
          data-count={photos.length}
          role="img"
          aria-label={
            photos.length === 1
              ? 'the photo you left with this haunt'
              : `the ${photos.length} photos you left with this haunt`
          }
        >
          <span className="notes-photo-slot-media" aria-hidden="true">
            {photos.map((url, index) => (
              <span
                key={url}
                className={`notes-photo-thumb notes-photo-thumb-${index + 1}`}
                style={{
                  backgroundImage: `linear-gradient(to top,rgba(8,10,15,.25),transparent 64%),url(${url})`,
                }}
              />
            ))}
          </span>
        </div>
      ) : (
        <div className="glass-panel note-reveal flex h-16 w-16 items-center justify-center rounded-full">
          <MapPin size={22} strokeWidth={1.5} className="text-white" />
        </div>
      )}

      <h1 className="mt-7 text-[30px] font-semibold tracking-[-0.045em] text-ink">
        left in the fog
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        <span className="text-ink">{haunt.name}</span> is resting where you stood.
        Friends see its name inside a {haunt.zone.radiusM}m zone; everyone else
        just sees the fog.
      </p>
      {haunt.arrivalNoteKind && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          your note stays sealed until someone gets there
        </p>
      )}

      <div className="mt-9 flex w-full flex-col gap-2">
        {canPass && <PrimaryButton onClick={onPass}>pass it on</PrimaryButton>}
        <PrimaryButton variant={canPass ? 'green-outline' : 'solid'} onClick={onOpen}>
          open it
        </PrimaryButton>
        <ShareStory
          card={{
            title: haunt.name,
            caption: ['DUMAGUETE', haunt.vibeTags.slice(0, 3).join(' / ')]
              .filter(Boolean)
              .join(' · '),
            footer: inviteFooter,
            seed: stringSeed(haunt.id),
          }}
          name={`haunt-${haunt.id.slice(0, 8)}`}
          className={primaryButtonClass('ghost')}
        >
          share to a story
        </ShareStory>
      </div>
      <button
        type="button"
        onClick={onMap}
        className="pressable mt-4 cursor-pointer text-[13px] text-ink-3 transition-colors duration-200 hover:text-ink-2"
      >
        back to the map
      </button>
      {!canPass && (
        <p className="mt-5 text-[11px] leading-relaxed text-ink-3">
          you can pass it on once there is someone to pass it to
        </p>
      )}
    </div>
  )
}
