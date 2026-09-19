/**
 * One haunt, and the note waiting inside it.
 *
 * The body is driven entirely by the viewer's own status, which is the shape of
 * the whole product: `locked` shows a zone and a promise, `arrived` unseals the
 * note the finder left, `visited` opens up passing and the chain. A friend of a
 * friend gets none of it — just the fact that something is there.
 *
 * The health panel renders only for the finder. That is a courtesy here, not a
 * defence: on the real backend the numbers are simply never sent to anyone else.
 *
 * Photos are the same set the finder chose on the way in — up to three — so the
 * hero opens a gallery rather than pretending the first one is the only one. A
 * friend of a friend gets none of them; the feed sends an empty list, and this
 * screen refuses to show any it was handed anyway.
 */
import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Expand,
  EyeOff,
  Footprints,
  Images,
  Infinity as InfinityIcon,
  Lock,
  LockKeyhole,
  Share2,
  UserRound,
  Users,
  Volume2,
} from 'lucide-react'
import { useApp } from '../context/appState'
import {
  Avatar,
  hauntArtworkStyle,
  primaryButtonClass,
  PrimaryButton,
  ScreenHeader,
  VibePill,
} from '../components/ui'
import ShareStory from '../components/ShareStory'
import { inviteLabel } from '../lib/invite'
import { stringSeed } from '../lib/seed'
import { AudioNotePlayer } from '../components/ArrivalNoteComposer'
import PhotoGallery from '../components/PhotoGallery'
import { isGroupFounded } from '../domain'
import type { Haunt } from '../domain'

const LIFESPAN_DETAILS = {
  lasting: { icon: InfinityIcon, label: 'This haunt stays until its finder removes it.' },
  single: { icon: UserRound, label: 'This haunt vanishes after one person makes it.' },
  dated: { icon: CalendarDays, label: 'This haunt has a last day.' },
} as const

function MiniLineage({ haunt }: { haunt: Haunt }) {
  if (haunt.lineage.length === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {haunt.lineage.slice(0, 4).map((e, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[11px] text-ink-3">→</span>}
          <Avatar handle={e.handle} role={e.role} size={22} />
        </div>
      ))}
      {haunt.lineage.length > 4 && (
        <span className="ml-1 text-[11px] text-ink-3">+{haunt.lineage.length - 4}</span>
      )}
    </div>
  )
}

function ArrivalNoteContent({ haunt }: { haunt: Haunt }) {
  if (haunt.arrivalNoteKind === 'audio' && haunt.arrivalNoteAudioUrl) {
    return (
      <AudioNotePlayer
        src={haunt.arrivalNoteAudioUrl}
        duration={haunt.arrivalNoteAudioDuration}
      />
    )
  }
  return (
    <p className="mt-3 text-[20px] font-medium leading-[1.5] tracking-[-0.02em] text-note-ink">
      {haunt.arrivalNote || 'no note was left here.'}
    </p>
  )
}

function ShareHauntPanel({ haunt }: { haunt: Haunt }) {
  const { shareHaunt, isBusy } = useApp()
  const [open, setOpen] = useState(false)
  const [story, setStory] = useState('')
  const canShare = story.trim().length >= 20

  return (
    <section className="notes-share-section notes-detail-share-section" aria-labelledby="share-haunt-heading">
      <button
        type="button"
        className="notes-share-row pressable"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="notes-share-icon" aria-hidden="true">
          <Share2 size={15} strokeWidth={1.45} />
        </span>
        <span className="notes-share-copy">
          <span id="share-haunt-heading" className="notes-share-title">
            add a few words for friends
          </span>
          <span className="notes-share-subtext">
            {open
              ? 'they read this when the haunt reaches them'
              : 'optional · what would you tell someone before they go?'}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.45}
          className={`notes-share-chevron ${open ? 'is-open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="notes-post-share-panel">
          <p className="notes-story-hint">what would you tell a friend before they go?</p>
          <textarea
            value={story}
            aria-label="message for friends"
            maxLength={280}
            rows={5}
            onChange={(event) => setStory(event.target.value.slice(0, 280))}
            className="notes-story-editor notes-post-share-editor"
          />
          <div className="notes-story-counter" aria-live="polite">
            {story.length} / 280 · min 20
          </div>
          <button
            type="button"
            disabled={!canShare || isBusy}
            className="notes-post-share-action pressable"
            onClick={() => void shareHaunt(haunt.id, story)}
          >
            <span>{isBusy ? 'saving…' : 'save it'}</span>
            <ArrowRight size={15} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}

/** Only the finder ever sees the score as numbers; everyone else
 *  just watches the zone fade on the map. */
function ScoreBreakdown({ haunt }: { haunt: Haunt }) {
  const [isOpen, setIsOpen] = useState(false)

  const rows = [
    { label: 'visitor velocity', value: haunt.health.velocity, weight: '50%', note: 'quiet time restores fog clarity' },
    { label: 'network distance', value: haunt.health.networkDistance, weight: '30%', note: 'closeness within friend circle' },
    { label: 'pass-to-visit', value: haunt.health.conversion, weight: '20%', note: 'visit rate from passed invites' },
  ]

  const healthStatus =
    haunt.health.score >= 80
      ? 'Fully Intact & Vibrant'
      : haunt.health.score >= 50
        ? 'Resting (Light Shroud)'
        : 'Deeply Shrouded (Fading)'

  return (
    <div className="mt-4 overflow-hidden rounded-[26px] border border-white/[0.15] bg-[#0f1013] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_18px_40px_rgba(0,0,0,0.42)]">
      {/* Interactive Trigger / Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="pressable flex w-full cursor-pointer items-center justify-between gap-3 p-4.5 text-left transition-colors duration-200 hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <LockKeyhole size={15} strokeWidth={1.6} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">
                Place health & stats
              </span>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium tracking-wide text-emerald-400">
                PRIVATE
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-3">
              Only visible to you as the creator
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex items-baseline gap-0.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 font-mono text-[12px] font-semibold text-white/90">
            {haunt.health.score}
            <span className="text-[9px] text-ink-3">/100</span>
          </span>
          <span className="text-ink-3">
            {isOpen ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
          </span>
        </div>
      </button>

      {/* Expanded Secret Telemetry Vault */}
      {isOpen && (
        <div className="border-t border-white/[0.08] bg-black/35 p-5 pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-ink-3">
              <EyeOff size={11} strokeWidth={1.6} />
              Hidden from visitors
            </span>
            <span className="text-[11px] font-medium text-emerald-400/90">
              {healthStatus}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3.5">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-ink-2">
                    {r.label} <span className="text-ink-3">· {r.weight}</span>
                  </span>
                  <span className="font-mono text-[11px] font-medium text-white/90">{r.value}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full w-full origin-left rounded-full bg-visited transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
                    style={{ transform: `scaleX(${r.value / 100})` }}
                  />
                </div>
                <p className="mt-1 text-[9px] text-ink-3">{r.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-3.5">
            <div className="flex items-start gap-2.5">
              <Activity size={14} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-3" />
              <p className="text-[11px] leading-relaxed text-ink-3">
                Busy spells fade your zone on friends' maps; quiet time brings it back.
                Visitors only see smoke cloud density — metrics and scores are private to you.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HauntDetail({ hauntId }: { hauntId: string }) {
  const { haunts, goBack, navigate, arrive, logVisit, user, isBusy } = useApp()
  // Which photo the gallery is open on, or null for closed. Declared before the
  // early return below so the hook order survives a haunt going away.
  const [galleryAt, setGalleryAt] = useState<number | null>(null)
  const haunt = haunts.find((h) => h.id === hauntId)
  const isOwn = Boolean(haunt && haunt.finderHandle === user.handle)
  const isFof = Boolean(haunt && haunt.visibility === 'fof' && !isOwn)
  const coverPhoto = !isFof ? haunt?.photoUrls[0] : undefined
  const [heroAspectRatio, setHeroAspectRatio] = useState(4 / 5)

  /*
   * The hero is portrait by default so the place feels like a found image,
   * not a generic map banner. Once a real cover photo loads, let its natural
   * orientation decide: landscape photos get a landscape frame, portrait
   * photos keep the portrait treatment.
   */
  useEffect(() => {
    setHeroAspectRatio(4 / 5)
    if (!coverPhoto) return

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled || image.naturalHeight === 0) return
      const naturalRatio = image.naturalWidth / image.naturalHeight
      setHeroAspectRatio(
        naturalRatio > 1
          ? Math.min(1.7, Math.max(1.25, naturalRatio))
          : Math.min(0.9, Math.max(0.72, naturalRatio)),
      )
    }
    image.src = coverPhoto

    return () => {
      cancelled = true
      image.onload = null
    }
  }, [coverPhoto])

  if (!haunt) return null
  const audience =
    haunt.audience === 'self'
      ? { icon: Lock, label: 'only you', note: 'this haunt is kept close' }
      : haunt.audience === 'wanderers'
        ? { icon: Footprints, label: 'wanderers', note: 'anyone nearby may encounter it' }
        : { icon: Users, label: 'your circle', note: 'friends see its name, everyone else sees fog' }
  const AudienceIcon = audience.icon
  // Belt and braces: a shrouded haunt's photos never arrive, and are not shown
  // even if some other backend hands them over.
  const photos = isFof ? [] : haunt.photoUrls

  return (
    <div className="relative h-full">
      <div
        className="screen-in no-scrollbar h-full overflow-y-auto pb-10"
        /* Nothing behind a fullscreen photo should be reachable through it. */
        inert={galleryAt !== null}
      >
        <ScreenHeader title="" onBack={goBack} />

        {/* hero */}
        <div className="mx-4 overflow-hidden rounded-[30px] border border-white/[0.12] shadow-[0_24px_58px_rgba(0,0,0,.34)]">
          <div
            className="relative flex flex-col justify-end p-5 transition-[aspect-ratio] duration-300 [transition-timing-function:var(--ease-out)]"
            style={{ ...hauntArtworkStyle(haunt), aspectRatio: heroAspectRatio }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            {photos.length > 0 && (
              <>
                {/* A transparent cover rather than a wrapping button: the name is a
                    heading, which has no business inside one. */}
                <button
                  type="button"
                  onClick={() => setGalleryAt(0)}
                  aria-label={photos.length === 1 ? 'open the photo' : `open all ${photos.length} photos`}
                  className="absolute inset-0 z-10 cursor-pointer"
                />
                <span className="glass-control pointer-events-none absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium text-ink">
                  {photos.length > 1 ? (
                    <>
                      <Images size={11} strokeWidth={1.7} aria-hidden="true" />
                      {photos.length}
                    </>
                  ) : (
                    <Expand size={11} strokeWidth={1.7} aria-hidden="true" />
                  )}
                </span>
              </>
            )}
            <div className="relative">
              <h1 className="text-[30px] font-semibold tracking-[-0.045em] text-ink">{isFof ? '???' : haunt.name}</h1>
              <p className="mt-1 text-[12px] text-ink-2">
                {isFof ? (
                  'a friend of a friend keeps this one'
                ) : (
                  <>
                    found by <span className="font-mono">{haunt.finderHandle}</span>
                    {haunt.passedByHandle && (
                      <>
                        {' '}· passed by <span className="font-mono">{haunt.passedByHandle}</span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5">
          {/* tags + lineage */}
          {!isFof && (
            <>
              {(haunt.status === 'visited' || haunt.status === 'arrived') && (
                <div className="mt-4 flex items-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-medium tracking-[-0.01em] backdrop-blur-xl ${
                      haunt.status === 'visited'
                        ? 'border-visited/25 bg-visited/[0.09] text-visited'
                        : 'note-reveal border-unvisited/25 bg-unvisited/[0.09] text-unvisited'
                    }`}
                  >
                    {haunt.status === 'visited' ? (
                      <Check size={11} strokeWidth={2} />
                    ) : (
                      <Footprints size={11} strokeWidth={1.8} />
                    )}
                    {haunt.status === 'visited' ? 'visited' : 'you made it'}
                  </span>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {haunt.vibeTags.map((t) => (
                  <VibePill key={t} label={t} />
                ))}
                {haunt.bestTimeTags.map((t) => (
                  <VibePill key={t} label={t} tone="indigo" />
                ))}
              </div>
              {isOwn && (
                <div className="premium-card mt-4 flex items-center gap-3 rounded-[22px] px-4 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.055] text-white/68">
                    <AudienceIcon size={14} strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold text-ink">{audience.label}</p>
                    <p className="mt-0.5 text-[9px] text-ink-3">{audience.note}</p>
                  </div>
                  {haunt.audience !== 'self' && (
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'pass', hauntId: haunt.id })}
                      className="pressable ml-auto shrink-0 rounded-full border border-white/[0.11] bg-white/[0.06] px-3 py-2 text-[9px] font-semibold text-white/72 transition-colors hover:bg-white/[0.1] hover:text-white"
                    >
                      pass it →
                    </button>
                  )}
                </div>
              )}
              {/* Until there are words for it. A haunt is shared from the moment
                  it lands now, so this panel is about the story, not the audience. */}
              {isOwn && haunt.status === 'visited' && !haunt.story && (
                <ShareHauntPanel haunt={haunt} />
              )}
              {haunt.lifespan !== 'lasting' && (() => {
                const detail = LIFESPAN_DETAILS[haunt.lifespan]
                const LifespanIcon = detail.icon
                return (
                  <div className="mt-4 flex items-center gap-2.5 px-1 text-[11px] text-ink-3">
                    <LifespanIcon size={13} strokeWidth={1.5} />
                    <span>
                      {detail.label}
                      {haunt.lifespan === 'dated' && haunt.expiresAt ? ` ${haunt.expiresAt}.` : ''}
                    </span>
                  </div>
                )
              })()}
              <button
                onClick={() => navigate({ name: 'lineage', hauntId: haunt.id })}
                className="premium-card mt-4 flex w-full pressable cursor-pointer items-center justify-between rounded-[22px] px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.09]"
              >
                <MiniLineage haunt={haunt} />
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-3">
                  <Footprints size={12} strokeWidth={1.6} aria-hidden="true" />
                  the haunting
                  <ArrowRight size={12} strokeWidth={1.7} aria-hidden="true" />
                </span>
              </button>
            </>
          )}

          {haunt.audioUrl && haunt.status !== 'locked' && !isFof && (
            <div className="premium-card mt-5 rounded-[24px] p-4">
              <div className="mb-3 flex items-center gap-2 text-[12px] text-ink-2">
                <Volume2 size={14} strokeWidth={1.5} />
                <span>Sound kept here</span>
              </div>
              <audio src={haunt.audioUrl} controls className="h-9 w-full" aria-label="Sound left at this haunt" />
            </div>
          )}

          {/* story */}
          {isFof ? (
            <div className="premium-card mt-5 rounded-[26px] p-5 text-center">
              <Lock size={16} strokeWidth={1.5} className="mx-auto text-ink-3" />
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
                Somewhere in this zone, a friend of a friend keeps a place. Its story stays
                locked until it's passed to you.
              </p>
            </div>
          ) : haunt.story ? (
            <div className="mt-5">
              <p className="text-[14px] leading-[1.7] text-ink">{haunt.story}</p>
            </div>
          ) : null}

          {/* status-specific body */}
          {haunt.status === 'locked' && !isFof && (
            <>
              <div className="glass-panel mt-6 flex items-center gap-3 rounded-[24px] p-4">
                <Lock size={15} strokeWidth={1.5} className="shrink-0 text-note-ink/70" />
                <p className="text-[13px] text-note-ink/90">a note waits for you there</p>
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <PrimaryButton
                  variant="green-outline"
                  disabled={isBusy}
                  onClick={() => void arrive(haunt.id)}
                >
                  mark that I’m here
                </PrimaryButton>
                <PrimaryButton disabled>pass this haunt</PrimaryButton>
                <p className="text-center text-[11px] text-ink-3">
                  you can pass a haunt once you've been
                </p>
              </div>
            </>
          )}

          {haunt.status === 'arrived' && (
            <div className="mt-6">
              {haunt.passerNote && (
                <div className="fade-in border-l border-unvisited/70 py-1 pl-4">
                  <p className="text-[11px] text-ink-3">
                    <span className="font-mono">{haunt.passedByHandle ?? haunt.finderHandle}</span> told you
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2 italic">
                    “{haunt.passerNote}”
                  </p>
                </div>
              )}
              <div className="glass-panel note-reveal relative mt-5 overflow-hidden rounded-[26px] p-6">
                <p className="text-[12px] font-medium tracking-[-0.01em] text-note-ink/62">
                  {haunt.finderHandle} left this here
                </p>
                <ArrivalNoteContent haunt={haunt} />
              </div>
              <div className="mt-6 flex flex-col gap-2">
                <PrimaryButton
                  variant="green-outline"
                  disabled={isBusy}
                  onClick={() => void logVisit(haunt.id)}
                >
                  log this visit
                </PrimaryButton>
                <p className="text-center text-[10px] text-ink-3">a small keepsake will be saved to your profile</p>
                <PrimaryButton variant="ghost" onClick={goBack}>
                  maybe later
                </PrimaryButton>
              </div>
            </div>
          )}

          {haunt.status === 'visited' && (
            <div className="mt-6">
              <div className="glass-panel relative overflow-hidden rounded-[26px] p-6">
                <p className="text-[12px] font-medium tracking-[-0.01em] text-note-ink/62">
                  {haunt.finderHandle === '???' ? 'the note' : `${haunt.finderHandle} left this here`}
                </p>
                <ArrivalNoteContent haunt={haunt} />
              </div>
              {isOwn && <ScoreBreakdown haunt={haunt} />}
              {isGroupFounded(haunt) && (
                <div className="premium-card mt-4 flex items-center gap-2.5 rounded-[22px] px-4 py-3.5">
                  <Users size={14} strokeWidth={1.5} className="text-ink-3" />
                  <p className="text-[12px] text-ink-2">
                    founded together by{' '}
                    <span className="font-mono">{haunt.founders.join(', ')}</span>
                  </p>
                </div>
              )}
              <div className="mt-6 flex flex-col gap-3">
                {(!isOwn || haunt.audience !== 'self') && (
                  <PrimaryButton
                    variant="green-outline"
                    onClick={() => navigate({ name: 'pass', hauntId: haunt.id })}
                  >
                    pass this haunt
                  </PrimaryButton>
                )}
                {isOwn && (
                  /* Only your own places. A story is public, and someone else's
                     haunt is not yours to post. */
                  <ShareStory
                    card={{
                      title: haunt.name,
                      caption: ['DUMAGUETE', haunt.vibeTags.slice(0, 3).join(' / ')]
                        .filter(Boolean)
                        .join(' · '),
                      footer: inviteLabel(user.handle),
                      seed: stringSeed(haunt.id),
                    }}
                    name={`haunt-${haunt.id.slice(0, 8)}`}
                    className={primaryButtonClass('ghost')}
                  >
                    share to a story
                  </ShareStory>
                )}
              </div>
            </div>
          )}

          {isFof && (
            <div className="mt-6">
              <PrimaryButton disabled>locked until someone lets you in</PrimaryButton>
            </div>
          )}
        </div>
      </div>
      {galleryAt !== null && photos.length > 0 && (
        <PhotoGallery photos={photos} startIndex={galleryAt} onClose={() => setGalleryAt(null)} />
      )}
    </div>
  )
}
