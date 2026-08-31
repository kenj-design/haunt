/**
 * A haunt, or an invitation, as a 1080×1920 image somebody can post.
 *
 * There is no way to hand a picture straight to Instagram Stories from a web
 * page: that flow is a native SDK — a pasteboard handover under Instagram's own
 * UTI keys on iOS, an `ADD_TO_STORY` intent on Android — and neither is reachable
 * from a browser. What is reachable is the share sheet with a file attached,
 * which puts Instagram one tap away instead of zero, and works on iOS Safari and
 * Android Chrome today. Where even that is missing, the image downloads.
 *
 * What goes on the card is deliberately coarse: a name the poster chose to
 * reveal, a city, a few words, a link. Never a coordinate, never a map, never a
 * photograph belonging to someone else — a story is public by definition, and
 * the one thing this app promises is that a place's location is not.
 */

const WIDTH = 1080
const HEIGHT = 1920

const INK = '#f2f2f4'
const INK_DIM = 'rgba(242,242,244,0.56)'
const INK_FAINT = 'rgba(242,242,244,0.32)'
const GROUND = '#05070a'

/** Matches the app's stack; falls back to whatever the device has. */
const SANS = '"SF Pro Display", -apple-system, system-ui, "Helvetica Neue", sans-serif'
const MONO = '"SF Mono", ui-monospace, "Menlo", monospace'

export interface StoryCard {
  /** Two or three words at most — it is set at 92px. */
  title: string
  /** A mono line under the title: a city, a number, a few tags. */
  caption?: string
  /** The one line at the foot of the card. Usually an invite link. */
  footer: string
  /** Drives the fog's shape, so the same place always makes the same card. */
  seed: number
}

/** A number in 0–1 that only depends on the seed and the step. */
function noise(seed: number, step: number): number {
  const value = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453
  return value - Math.floor(value)
}

/**
 * The shroud: seven overlapping breaths, and one tighter core so it reads as a
 * mass of fog rather than an evenly diffused glow.
 */
function drawFog(context: CanvasRenderingContext2D, seed: number): void {
  const centreX = WIDTH / 2
  const centreY = HEIGHT * 0.38
  const core = context.createRadialGradient(centreX, centreY, 0, centreX, centreY, 300)
  core.addColorStop(0, 'rgba(214,211,244,0.3)')
  core.addColorStop(0.5, 'rgba(170,178,208,0.13)')
  core.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = core
  context.fillRect(0, 0, WIDTH, HEIGHT)

  for (let index = 0; index < 7; index += 1) {
    const angle = noise(seed, index) * Math.PI * 2
    const distance = 90 + noise(seed, index + 20) * 200
    const radius = 220 + noise(seed, index + 40) * 240
    const x = centreX + Math.cos(angle) * distance
    const y = centreY + Math.sin(angle) * distance * 0.72
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(203,199,240,${0.16 + noise(seed, index + 60) * 0.1})`)
    gradient.addColorStop(0.55, 'rgba(152,162,192,0.07)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, WIDTH, HEIGHT)
  }
}

/** Film grain, drawn small and scaled up so it costs almost nothing. */
function drawGrain(context: CanvasRenderingContext2D): void {
  const small = document.createElement('canvas')
  small.width = 270
  small.height = 480
  const smallContext = small.getContext('2d')
  if (!smallContext) return
  const image = smallContext.createImageData(small.width, small.height)
  for (let index = 0; index < image.data.length; index += 4) {
    const value = 120 + Math.random() * 135
    image.data[index] = value
    image.data[index + 1] = value
    image.data[index + 2] = value
    image.data[index + 3] = 12
  }
  smallContext.putImageData(image, 0, 0)
  context.drawImage(small, 0, 0, WIDTH, HEIGHT)
}

/** Wraps a title onto at most two lines, longest-first. */
function titleLines(context: CanvasRenderingContext2D, title: string): string[] {
  if (context.measureText(title).width <= WIDTH - 200) return [title]
  const words = title.split(' ')
  for (let split = words.length - 1; split > 0; split -= 1) {
    const first = words.slice(0, split).join(' ')
    const second = words.slice(split).join(' ')
    if (
      context.measureText(first).width <= WIDTH - 200 &&
      context.measureText(second).width <= WIDTH - 200
    ) {
      return [first, second]
    }
  }
  return [title]
}

export async function renderStoryCard(card: StoryCard): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('this browser cannot draw the card')

  context.fillStyle = GROUND
  context.fillRect(0, 0, WIDTH, HEIGHT)
  drawFog(context, card.seed)

  // A vignette, so the fog sits inside the frame rather than against it.
  const vignette = context.createRadialGradient(
    WIDTH / 2, HEIGHT * 0.42, HEIGHT * 0.2,
    WIDTH / 2, HEIGHT * 0.42, HEIGHT * 0.78,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.72)')
  context.fillStyle = vignette
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.textAlign = 'center'

  context.font = `600 30px ${MONO}`
  context.fillStyle = INK_FAINT
  context.letterSpacing = '6px'
  context.fillText('HAUNT · PRIVATE PLACES', WIDTH / 2, 190)
  context.letterSpacing = '0px'

  context.font = `600 92px ${SANS}`
  context.fillStyle = INK
  const lines = titleLines(context, card.title)
  const titleTop = HEIGHT * 0.63
  lines.forEach((line, index) => {
    context.fillText(line, WIDTH / 2, titleTop + index * 104)
  })

  if (card.caption) {
    context.font = `400 34px ${MONO}`
    context.fillStyle = INK_DIM
    context.fillText(card.caption, WIDTH / 2, titleTop + lines.length * 104 + 30)
  }

  /* Instagram lays its own chrome over the top and bottom of a story — a profile
     row above, a reply bar below — so nothing important goes near either edge. */
  context.font = `400 32px ${MONO}`
  context.fillStyle = INK_FAINT
  context.fillText(card.footer, WIDTH / 2, HEIGHT - 250)

  drawGrain(context)

  // JPEG rather than PNG: the same card is 2.5MB lossless and about a tenth of
  // that at this quality, and every one of these is re-encoded by whatever it
  // gets posted to anyway.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("couldn't make the image"))),
      'image/jpeg',
      0.92,
    )
  })
}

export type StoryShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Offers the card to the share sheet, or saves it.
 *
 * `canShare` has to be asked about the actual file: plenty of browsers implement
 * `navigator.share` for text and refuse files, and a share that throws after the
 * user has tapped is worse than a download that just works.
 */
export async function shareStoryCard(card: StoryCard, name: string): Promise<StoryShareOutcome> {
  const blob = await renderStoryCard(card)
  const file = new File([blob], `${name}.jpg`, { type: 'image/jpeg' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'cancelled'
      // Anything else falls through to the download rather than dead-ending.
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.jpg`
  link.click()
  // Revoked on the next tick: Safari needs the URL to survive the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
