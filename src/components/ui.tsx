/**
 * Shared building blocks: the avatar, the vibe orb, haunt reference cards, the
 * screen header, the primary button, and the artwork style a haunt renders
 * behind its name.
 *
 * Deliberately small. Anything only one screen uses belongs to that screen, and
 * anything with real behaviour — the note composer, the shroud controls — is its
 * own file rather than another export here.
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Haunt, LineageRole } from '../domain'
import { zonePreviewTileUrl } from '../lib/geo'
import { stringSeed } from '../lib/seed'

const VIBE_MESHES: Record<string, [string, string, string]> = {
  quiet: ['#3b82f6', '#8b5cf6', '#172554'],
  nature: ['#10b981', '#84cc16', '#064e3b'],
  hidden: ['#a855f7', '#6366f1', '#3b0764'],
  weird: ['#f43f5e', '#a855f7', '#4c0519'],
  historic: ['#f59e0b', '#c2410c', '#451a03'],
  view: ['#06b6d4', '#3b82f6', '#083344'],
  'late night': ['#4f46e5', '#9333ea', '#0f172a'],
  seasonal: ['#f43f5e', '#ea580c', '#4c0519'],
  effort: ['#ea580c', '#e11d48', '#431407'],
  food: ['#f97316', '#eab308', '#451a03'],
  water: ['#06b6d4', '#0284c7', '#042f2e'],
  morning: ['#f59e0b', '#ec4899', '#451a03'],
  afternoon: ['#eab308', '#ea580c', '#451a03'],
  evening: ['#c026d3', '#f43f5e', '#3b0764'],
  night: ['#3b82f6', '#6366f1', '#090d1f'],
  spring: ['#10b981', '#a855f7', '#064e3b'],
  summer: ['#f59e0b', '#ef4444', '#7c2d12'],
  autumn: ['#f97316', '#b45309', '#431407'],
  winter: ['#38bdf8', '#818cf8', '#082f49'],
  'any time': ['#818cf8', '#38bdf8', '#1e1b4b'],
}

type VibeMeshStyle = CSSProperties & {
  '--vibe-a': string
  '--vibe-b': string
  '--vibe-c': string
  '--vibe-phase': number
}

/**
 * Background style for a haunt's artwork.
 *
 * Falls back to a satellite tile near the zone when there is no photo, which
 * keeps the card looking like a place rather than an empty slot. Once media
 * lives in object storage this reads a real thumbnail URL instead.
 */
export function hauntArtworkStyle(haunt: Pick<Haunt, 'photoUrls' | 'zone'>): CSSProperties {
  const image = haunt.photoUrls[0] ?? zonePreviewTileUrl(haunt.zone)
  const scrim = haunt.photoUrls[0]
    ? 'rgba(0,0,0,.72), rgba(0,0,0,.08)'
    : 'rgba(0,0,0,.74), rgba(0,0,0,.12)'
  return {
    backgroundColor: '#111114',
    backgroundImage: `linear-gradient(to top, ${scrim}), url(${image})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  }
}

/**
 * The small haunt identity card used when a screen needs to keep the place in
 * view while the person takes another action. Keeping the artwork, spacing,
 * and title treatment here prevents pass, lineage, and future flows from
 * drifting apart.
 */
export function HauntReferenceCard({
  haunt,
  subtitle,
  className = '',
  artworkSize = 'compact',
}: {
  haunt: Pick<Haunt, 'name' | 'photoUrls' | 'zone'>
  subtitle: ReactNode
  className?: string
  artworkSize?: 'compact' | 'medium'
}) {
  const artworkClass = artworkSize === 'medium' ? 'h-12 w-12' : 'h-11 w-11'

  return (
    <div className={`premium-card flex items-center gap-3.5 rounded-[24px] p-3.5 ${className}`}>
      <div
        className={`shrink-0 rounded-[14px] border-[0.5px] border-line ${artworkClass}`}
        style={hauntArtworkStyle(haunt)}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-ink">{haunt.name}</p>
        <p className="truncate text-[11px] text-ink-3">{subtitle}</p>
      </div>
    </div>
  )
}

export function VibePill({
  label,
  active = false,
  onClick,
  tone = 'neutral',
}: {
  label: string
  active?: boolean
  onClick?: () => void
  tone?: 'neutral' | 'indigo'
}) {
  const [a, b, c] = VIBE_MESHES[label.toLowerCase()] ?? ['#526178', '#6e5674', '#202731']
  const meshStyle: VibeMeshStyle = {
    '--vibe-a': a,
    '--vibe-b': b,
    '--vibe-c': c,
    '--vibe-phase': stringSeed(label) % 4,
  }

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-active={active}
      data-tone={tone}
      style={meshStyle}
      className="vibe-orb vibe-orb-interactive pressable cursor-pointer"
    >
      <span className="vibe-orb-mesh" aria-hidden="true" />
      <span className="vibe-orb-label">{label}</span>
    </button>
  ) : (
    <span className="vibe-orb" data-tone={tone} style={meshStyle}>
      <span className="vibe-orb-mesh" aria-hidden="true" />
      <span className="vibe-orb-label">{label}</span>
    </span>
  )
}

export const ROLE_COLORS: Record<LineageRole, { bg: string; ink: string }> = {
  finder: { bg: '#403c35', ink: '#f2ede5' },
  passer: { bg: '#3a3947', ink: '#efedf9' },
  visitor: { bg: '#33413b', ink: '#eef7f3' },
  you: { bg: '#f4f4f6', ink: '#101012' },
  anon: { bg: '#2a2a2e', ink: '#a9a9af' },
}

export function Avatar({
  handle,
  role = 'visitor',
  size = 34,
}: {
  handle: string
  role?: LineageRole
  size?: number
}) {
  const c = ROLE_COLORS[role]
  const letter = handle.replace('@', '').charAt(0).toUpperCase() || '?'
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-medium"
      role="img"
      aria-label={role === 'anon' ? 'anonymous person' : handle}
      style={{
        width: size,
        height: size,
        background: c.bg,
        color: c.ink,
        fontSize: size * 0.4,
        border: '1px solid rgba(255,255,255,.13)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08), 0 8px 20px rgba(0,0,0,.18)',
      }}
    >
      {role === 'anon' ? '?' : letter}
    </div>
  )
}

export function ScreenHeader({
  title,
  onBack,
  serif = false,
  right,
}: {
  title: string
  onBack?: (event: MouseEvent<HTMLButtonElement>) => void
  serif?: boolean
  right?: ReactNode
}) {
  return (
    <header className="glass-header sticky top-0 z-30 flex min-h-16 items-center gap-3 px-5 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="glass-control pressable flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink shadow-sm transition-colors duration-200 hover:bg-white/[0.1]"
          aria-label="back"
        >
          <ArrowLeft size={17} strokeWidth={1.5} />
        </button>
      )}
      {title && (
        <h1
          className={
            serif
              ? 'font-serif text-[21px] text-ink'
              : 'text-[17px] font-semibold tracking-[-0.025em] text-ink'
          }
        >
          {title}
        </h1>
      )}
      {right && <div className="ml-auto">{right}</div>}
    </header>
  )
}

export type ButtonVariant = 'solid' | 'green-outline' | 'ghost'

/**
 * How a primary button looks.
 *
 * Exported because a couple of controls are buttons in every sense except that
 * they own their own behaviour — sharing a story image, say — and they should not
 * have to copy this string to sit in the same stack.
 */
export function primaryButtonClass(variant: ButtonVariant = 'solid', disabled = false): string {
  const base =
    'min-h-[52px] w-full rounded-full border px-5 py-3.5 text-center text-[15px] font-semibold transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-200 ease-out'
  const look = disabled
    ? 'cursor-not-allowed border-white/[0.07] bg-white/[0.045] text-ink-3'
    : variant === 'solid'
      ? 'pressable cursor-pointer border-white bg-[#f4f4f6] text-[#0d0d0f] shadow-[0_14px_34px_rgba(0,0,0,.34)] hover:bg-white'
      : variant === 'green-outline'
        ? 'pressable cursor-pointer border-white/[0.16] bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl hover:bg-white/[0.13]'
        : 'pressable cursor-pointer border-transparent bg-transparent text-ink-2 hover:text-white'
  return `${base} ${look}`
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  variant = 'solid',
}: {
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  variant?: ButtonVariant
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={primaryButtonClass(variant, disabled)}
    >
      {children}
    </button>
  )
}
