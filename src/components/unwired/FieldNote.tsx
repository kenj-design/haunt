/**
 * A place, stamped onto a page.
 *
 * A rubber stamp carved down to the least that still says *where*: a ridge, a
 * tower, a stand of trees. Ink goes on in two or three colours, each pressed
 * separately, so the layers sit a fraction out of register and the pad leaves
 * dry gaps. Under it, a typewriter caption — the name, a number, three words,
 * the year.
 *
 * The texture is all SVG filters rather than bitmaps: edges get displaced by
 * noise so no carved line runs true, a second noise field eats holes out of the
 * ink where the pad ran dry, and a third grains what's left. Every layer takes
 * its own seed from the caller, so the same haunt is always stamped the same way
 * and two haunts never look alike.
 *
 * With a photo it lays out the way a field note does — the photograph holding
 * the scene on the left, the stamp keeping only what you'd recognise it by on
 * the right. Without one, the stamp has the page to itself.
 */
import { useId } from 'react'
import { stringSeed } from '../../lib/seed'

/** Spot inks: desaturated, as if mixed for a small press. */
const INK = {
  charcoal: '#33353a',
  green: '#41594a',
  brick: '#9c5748',
  ochre: '#ab8752',
  slate: '#6c8394',
  taupe: '#7b6b5d',
} as const

type Ink = keyof typeof INK

export type MotifKey = 'coast' | 'tower' | 'grove' | 'steps'

/**
 * The carved motifs.
 *
 * Each is a short stack of single-ink layers, drawn in a 100×70 field and read
 * from the bottom up: ground first, then mass, then the one small accent that
 * earns its own pressing. Nothing here tries to be a picture — a motif that
 * needs a fourth layer is a motif that should be simplified instead.
 */
const MOTIFS: Record<MotifKey, Array<{ ink: Ink; draw: React.ReactNode }>> = {
  // A shoulder of land dropping into water, with the town stepping down it.
  coast: [
    {
      ink: 'slate',
      draw: (
        <>
          <path d="M4 52 L30 26 L46 33 L62 46 L78 55 L96 58 L96 62 L4 62 Z" />
          <rect x="63" y="40" width="30" height="1.5" />
          <rect x="70" y="45" width="26" height="1.5" />
          <rect x="66" y="50" width="18" height="1.5" />
          <rect x="78" y="55" width="18" height="1.5" />
        </>
      ),
    },
    {
      ink: 'taupe',
      draw: (
        <>
          <rect x="12" y="44" width="9" height="8" />
          <rect x="20" y="40" width="8" height="12" />
          <rect x="27" y="46" width="10" height="6" />
          <rect x="36" y="42" width="7" height="10" />
          <rect x="42" y="47" width="9" height="5" />
          <rect x="50" y="50" width="8" height="4" />
          <path d="M8 52 L58 52 L62 58 L4 58 Z" />
        </>
      ),
    },
    {
      ink: 'brick',
      draw: (
        <>
          <path d="M20 40 L24 34 L28 40 Z" />
          <rect x="22" y="30" width="1.6" height="4" />
          <path d="M36 42 L39.5 37 L43 42 Z" />
        </>
      ),
    },
  ],

  // One tower worth remembering, and the low line of roofs beside it.
  tower: [
    {
      ink: 'brick',
      draw: (
        <>
          <rect x="43" y="18" width="10" height="34" />
          <path d="M42 18 L48 6 L54 18 Z" />
          <rect x="47.2" y="2" width="1.6" height="4" />
        </>
      ),
    },
    {
      ink: 'charcoal',
      draw: (
        <>
          <rect x="43" y="16" width="10" height="2" />
          <path d="M14 44 L38 44 L38 52 L14 52 Z" />
          <path d="M58 46 L88 46 L88 52 L58 52 Z" />
          <rect x="17" y="47" width="2.5" height="5" />
          <rect x="23" y="47" width="2.5" height="5" />
          <rect x="29" y="47" width="2.5" height="5" />
          <rect x="62" y="48" width="2.2" height="4" />
          <rect x="68" y="48" width="2.2" height="4" />
          <rect x="74" y="48" width="2.2" height="4" />
          <rect x="80" y="48" width="2.2" height="4" />
          <rect x="10" y="52" width="82" height="1.8" />
        </>
      ),
    },
    {
      ink: 'slate',
      draw: (
        <>
          <rect x="14" y="58" width="34" height="1.4" />
          <rect x="54" y="58" width="24" height="1.4" />
          <rect x="24" y="63" width="46" height="1.4" />
          <rect x="10" y="63" width="9" height="1.4" />
        </>
      ),
    },
  ],

  // Trees, and just enough ground to stand them on.
  grove: [
    {
      ink: 'green',
      draw: (
        <>
          <path d="M22 40 C14 40 12 30 20 26 C20 16 34 12 40 20 C50 16 56 26 48 32 C48 40 34 44 22 40 Z" />
          <path d="M62 44 C56 44 54 36 60 33 C60 25 70 22 74 28 C82 26 85 34 79 38 C79 44 70 47 62 44 Z" />
        </>
      ),
    },
    {
      ink: 'charcoal',
      draw: (
        <>
          <path d="M32 40 L34 40 L35 58 L31 58 Z" />
          <path d="M34 46 L42 42 L42.8 43.4 L34.8 47.6 Z" />
          <path d="M70 44 L71.6 44 L72.4 58 L69.2 58 Z" />
          <rect x="8" y="58" width="84" height="1.8" />
          <rect x="16" y="63" width="26" height="1.3" />
          <rect x="56" y="63" width="30" height="1.3" />
        </>
      ),
    },
  ],

  // A way up, worn into the hill.
  steps: [
    {
      ink: 'charcoal',
      draw: (
        <>
          <path d="M20 60 L20 54 L34 54 L34 48 L48 48 L48 42 L62 42 L62 36 L76 36 L76 30 L88 30 L88 62 L20 62 Z" />
          <rect x="14" y="60" width="76" height="2" />
        </>
      ),
    },
    {
      ink: 'green',
      draw: (
        <>
          <path d="M12 54 C8 52 10 46 15 47 C17 43 24 44 24 49 C24 53 17 56 12 54 Z" />
          <path d="M76 26 C72 24 74 18 79 19 C81 15 88 17 87 22 C86 26 80 28 76 26 Z" />
          <rect x="36" y="50" width="6" height="2" />
          <rect x="58" y="38" width="5" height="2" />
        </>
      ),
    },
  ],
}

const MOTIF_KEYS = Object.keys(MOTIFS) as MotifKey[]

export interface FieldNoteProps {
  /** The place, printed as typed on a machine that only has capitals. */
  name: string
  /** The three words underneath. More than three stops being a note. */
  tags?: string[]
  /** `No. 04`. Zero-padded, because a collection implies more of them. */
  number?: number
  year?: number | string
  /**
   * Which carving. `auto` picks one from the seed, so a haunt keeps the same
   * stamp for as long as it keeps its name.
   */
  motif?: MotifKey | 'auto'
  /** What the ink jitter and the motif choice are derived from. Defaults to the name. */
  seed?: string
  /** The photograph, if there is one. Its absence is not a gap; it is a blank page. */
  photoUrl?: string
  className?: string
}

export default function FieldNote({
  name,
  tags = [],
  number,
  year = new Date().getFullYear(),
  motif = 'auto',
  seed,
  photoUrl,
  className = '',
}: FieldNoteProps) {
  const rawId = useId()
  const id = `stamp-${rawId.replace(/:/g, '')}`
  const grain = stringSeed(seed ?? name)
  const layers = MOTIFS[motif === 'auto' ? MOTIF_KEYS[grain % MOTIF_KEYS.length] : motif]

  return (
    <figure className={`field-note ${photoUrl ? 'has-photo' : ''} ${className}`}>
      {photoUrl && (
        <div
          className="field-note-photo"
          style={{ backgroundImage: `url(${photoUrl})` }}
          role="presentation"
        />
      )}
      <div className="field-note-page">
        <svg
          className="field-note-stamp"
          viewBox="0 0 100 70"
          role="img"
          aria-label={`a stamp of ${name}`}
        >
          <defs>
            {layers.map((layer, index) => {
              // Each pressing gets its own noise: shared seeds would make the
              // colours break in the same places and read as one flat print.
              const s = (grain + index * 37) % 90
              return (
                <filter
                  key={layer.ink}
                  id={`${id}-${index}`}
                  x="-14%"
                  y="-14%"
                  width="128%"
                  height="128%"
                  colorInterpolationFilters="sRGB"
                >
                  {/* no carved line runs true */}
                  <feTurbulence type="fractalNoise" baseFrequency="0.58" numOctaves="2" seed={s} result="edge" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="edge"
                    scale="1.7"
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="rough"
                  />
                  {/* the pad never inks the whole face */}
                  <feTurbulence type="fractalNoise" baseFrequency="0.09 0.13" numOctaves="4" seed={s + 5} result="dry" />
                  <feColorMatrix in="dry" type="luminanceToAlpha" result="dryAlpha" />
                  <feComponentTransfer in="dryAlpha" result="dryMask">
                    <feFuncA type="table" tableValues="0 0.35 1 1" />
                  </feComponentTransfer>
                  <feComposite in="rough" in2="dryMask" operator="in" result="inked" />
                  {/* and what lands is grainy */}
                  <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed={s + 13} result="tooth" />
                  <feColorMatrix in="tooth" type="luminanceToAlpha" result="toothAlpha" />
                  <feComponentTransfer in="toothAlpha" result="toothMask">
                    <feFuncA type="table" tableValues="0.62 1" />
                  </feComponentTransfer>
                  <feComposite in="inked" in2="toothMask" operator="in" />
                </filter>
              )
            })}
          </defs>
          {layers.map((layer, index) => {
            // A millimetre or so of misregistration, different per colour.
            const drift = (grain + index * 11) % 7
            return (
              <g
                key={layer.ink}
                fill={INK[layer.ink]}
                filter={`url(#${id}-${index})`}
                opacity={0.93}
                transform={`translate(${(drift % 3) * 0.45 - 0.45} ${(drift % 2) * 0.5 - 0.25})`}
              >
                {layer.draw}
              </g>
            )
          })}
        </svg>

        <figcaption className="field-note-caption">
          <span className="field-note-name">{name}</span>
          {number !== undefined && (
            <span>No. {String(number).padStart(2, '0')}</span>
          )}
          {tags.length > 0 && <span>{tags.slice(0, 3).join(' / ')}</span>}
          <span>{year}</span>
        </figcaption>
      </div>
    </figure>
  )
}
