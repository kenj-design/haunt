/**
 * The map — the app's home surface, and the only screen most sessions touch.
 *
 * The basemap is MapLibre against vector tiles, pitched, with the buildings
 * extruded — see `lib/mapStyle.ts`. Haunts are drawn as absolutely-positioned
 * React overlays rather than map markers, because each one is a live WebGL
 * shroud and a marker only holds static content. The cost is that their
 * positions have to be projected by hand on every camera movement, which is what
 * `syncMarkers` does; being overlays, they stand up out of the map rather than
 * lying flat on it, which suits a haunt being a cloud over a place.
 *
 * Two details worth knowing before changing anything here: the map is not built
 * until its container reports a real size (see the effect below for why), and
 * the bottom sheet tracks the finger 1:1 with a velocity window, so a flick
 * commits before the sheet crosses its midpoint.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bell, Expand, LocateFixed, MapPin, Minus, MoreHorizontal, Plus, X } from 'lucide-react'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../context/appState'
import { hauntArtworkStyle } from '../components/ui'
import HauntShader from '../components/HauntShader'
import { isHauntActive } from '../domain'
import type { Haunt } from '../domain'
import {
  MAP_BEARING,
  MAP_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_PITCH,
  geodesicCircle,
  hauntLatLng,
} from '../lib/geo'
import { MAP_ATTRIBUTION, hauntMapStyle } from '../lib/mapStyle'
import { stringSeed } from '../lib/seed'

/** The collapsed rail shows only the handle, title, and count. */
const SHEET_PEEK = 112
const OVERSCROLL_FRICTION = 0.32
const FLICK_VELOCITY = 0.45 // px/ms; recent finger velocity, not whole-gesture average
const VELOCITY_WINDOW = 100 // ms

type PointerSample = { y: number; time: number }

type SheetDrag = {
  pointerId: number
  startY: number
  startOffset: number
  currentOffset: number
  moved: boolean
  samples: PointerSample[]
}

/**
 * Where a zone lands on the glass, and how big it is in each direction.
 *
 * Two sizes rather than one, because the camera is pitched: a circle lying on
 * the ground is an ellipse on screen, squashed vertically, and squashed more the
 * further back it sits. Measuring the width and height separately makes the fog
 * read as a footprint on the ground rather than a ball hovering over it.
 */
type MarkerPosition = {
  left: number
  top: number
  width: number
  height: number
  /** Sideways nudge that keeps a name inside the frame near the edges. */
  labelShift: number
}

type HauntClusterMember = {
  haunt: Haunt
  isOwn: boolean
  position: MarkerPosition
}

type ClusterChooserState = { hauntIds: string[] }

/** Nearby projected centres merge into one quiet marker until the map resolves them. */
const CLUSTER_JOIN_DISTANCE = 112
/** A little hysteresis keeps the cluster from flickering at the join boundary. */
const CLUSTER_SPLIT_DISTANCE = 136

function findMarkerClusters(
  positions: Record<string, MarkerPosition>,
  previousClusters: string[][],
): string[][] {
  const entries = Object.entries(positions)
    .map(([id, position]) => ({ id, position }))
    .sort((a, b) => a.position.left - b.position.left || a.position.top - b.position.top)
  const parent = entries.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }
  const join = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
  }
  const previousClusterById = new Map<string, string>()
  previousClusters.forEach((ids) => {
    const key = ids.slice().sort().join('\u0000')
    ids.forEach((id) => previousClusterById.set(id, key))
  })

  for (let left = 0; left < entries.length; left++) {
    for (let right = left + 1; right < entries.length; right++) {
      const dx = entries[right].position.left - entries[left].position.left
      if (dx > CLUSTER_SPLIT_DISTANCE) break
      const leftId = entries[left].id
      const rightId = entries[right].id
      const isExistingPair =
        previousClusterById.has(leftId) &&
        previousClusterById.get(leftId) === previousClusterById.get(rightId)
      const radius = isExistingPair ? CLUSTER_SPLIT_DISTANCE : CLUSTER_JOIN_DISTANCE
      const dy = entries[right].position.top - entries[left].position.top
      if (dx * dx + dy * dy <= radius * radius) join(left, right)
    }
  }

  const groups = new Map<number, string[]>()
  entries.forEach(({ id }, index) => {
    const root = find(index)
    const group = groups.get(root) ?? []
    group.push(id)
    groups.set(root, group)
  })
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ids.sort())
    .sort((a, b) => a[0].localeCompare(b[0]))
}

function sameClusters(left: string[][], right: string[][]) {
  return (
    left.length === right.length &&
    left.every((group, index) => group.length === right[index].length && group.every((id, member) => id === right[index][member]))
  )
}

/** Room a name needs on either side of its zone before it runs off the frame. */
const LABEL_HALF_WIDTH = 78
/** A restrained echo of the map's bearing, keeping captions subtly grounded. */
const LABEL_TILT_DEGREES = MAP_BEARING / 2
/** Keep the map readable at neighborhood scale; zones remain tappable below it. */
const MAP_LABEL_MIN_ZOOM = 14.5
/** Shroud shapes cycle through this many variants. */
const SHROUD_VARIANTS = 17

/** Shared marker artwork so clustered and individual haunts keep the same fog/orb treatment. */
function HauntArtwork({
  haunt,
  isOwn,
  position,
}: {
  haunt: Haunt
  isOwn: boolean
  position: MarkerPosition
}) {
  const isFof = haunt.visibility === 'fof' && !isOwn
  const isArrived = haunt.status === 'arrived' && !isFof
  const isVisited = haunt.status === 'visited' && !isFof
  const seed = haunt.shroudSeed ?? stringSeed(haunt.id) % SHROUD_VARIANTS

  return (
    <div
      className="haunt-zone zone-breathe pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ width: position.width || 76, height: position.height || 76, animationDelay: `${(haunt.zone.x * 37) % 4000}ms` }}
    >
      {isVisited ? (
        <span className="haunt-memory-marker relative flex h-10 w-10 items-center justify-center rounded-full">
          <span className="haunt-memory-orb" aria-hidden="true" />
        </span>
      ) : (
        <div
          className={`haunt-field relative h-full w-full ${isFof ? 'opacity-55 blur-[0.4px]' : isArrived ? 'opacity-50' : 'opacity-100'}`}
        >
          <HauntShader
            seed={seed + 1}
            shape={haunt.shroudPath}
            temperament={haunt.shroudTemperament}
          />
          {isArrived && <span className="haunt-discovered-ring pointer-events-none absolute inset-[7%] rounded-full" />}
        </div>
      )}
    </div>
  )
}

function Zone({
  haunt,
  isOwn,
  onOpen,
  position,
  showLabel,
}: {
  haunt: Haunt
  isOwn: boolean
  onOpen: () => void
  position: MarkerPosition
  showLabel: boolean
}) {
  const height = position.height || 76
  const isFof = haunt.visibility === 'fof' && !isOwn
  return (
    <button
      type="button"
      onClick={onOpen}
      className="haunt-marker-emerge group absolute z-10 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full"
      style={{ left: position.left, top: position.top }}
      aria-label={isFof ? 'Open sealed nearby haunt' : `Open ${haunt.name}`}
    >
      <HauntArtwork haunt={haunt} isOwn={isOwn} position={position} />
      {showLabel && (
        <div
          className="map-haunt-label pointer-events-none pressable-subtle absolute left-1/2 max-w-[46vw] truncate rounded-full border border-white/[0.11] bg-black/72 px-2.5 py-1 text-white/88 shadow-lg backdrop-blur-xl transition-colors duration-200 group-hover:bg-black/90 group-active:bg-black/90"
          style={{
            top: `calc(50% + ${height / 2 + 4}px)`,
            transform: `translateX(calc(-50% + ${position.labelShift}px)) rotate(${LABEL_TILT_DEGREES}deg)`,
            transformOrigin: 'center top',
          }}
        >
          {isFof ? '???' : haunt.name}
        </div>
      )}
    </button>
  )
}

function HauntCluster({
  left,
  top,
  members,
  isExpanded,
  onOpen,
}: {
  left: number
  top: number
  members: HauntClusterMember[]
  isExpanded: boolean
  onOpen: (trigger: HTMLButtonElement) => void
}) {
  const visibleMembers = members.slice(0, 4)

  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      className="pressable absolute z-10 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full"
      style={{ left, top }}
      aria-haspopup="dialog"
      aria-expanded={isExpanded}
      aria-label={`Zoom in to choose between ${members.length} nearby haunts`}
    >
      <span className="map-cluster-glyph" aria-hidden="true">
        {visibleMembers.map((member) => {
          // Each haunt keeps its own shroud/orb state, but the cluster preview
          // is a compact composition rather than a stack of full-size zones.
          const extent = Math.max(member.position.width, member.position.height, 1)
          const scale = Math.min(1, 62 / extent)
          const artPosition = {
            ...member.position,
            width: member.position.width * scale,
            height: member.position.height * scale,
          }
          const offsetX = member.position.left - left
          const offsetY = member.position.top - top
          const offsetLength = Math.hypot(offsetX, offsetY)
          const offsetScale = offsetLength > 0 ? Math.min(0.13, 9 / offsetLength) : 0

          return (
            <span
              key={member.haunt.id}
              className="map-cluster-layer"
              style={{
                left: 36 + offsetX * offsetScale,
                top: 36 + offsetY * offsetScale,
                width: artPosition.width,
                height: artPosition.height,
              }}
            >
              <HauntArtwork haunt={member.haunt} isOwn={member.isOwn} position={artPosition} />
            </span>
          )
        })}
      </span>
    </button>
  )
}

function HauntClusterChooser({
  haunts,
  left,
  top,
  viewerHandle,
  origin,
  onClose,
  onSelect,
}: {
  haunts: Haunt[]
  left: number
  top: number
  viewerHandle: string
  origin: { x: number; y: number }
  onClose: () => void
  onSelect: (haunt: Haunt) => void
}) {
  const firstChoiceRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    firstChoiceRef.current?.focus()
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-[64]">
      <section
        role="dialog"
        aria-label="Choose a nearby haunt"
        className="map-cluster-choice pointer-events-auto absolute overflow-hidden rounded-[22px] border border-white/[0.15] shadow-[0_20px_56px_rgba(0,0,0,.58)] backdrop-blur-2xl"
        style={{ left, top, transformOrigin: `${origin.x}px ${origin.y}px` }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-3">
          <p className="text-[12px] font-medium tracking-[-0.01em] text-white/90">Choose a haunt</p>
          <button
            type="button"
            onClick={onClose}
            className="pressable flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white/56 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Close haunt chooser"
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>
        <div className="no-scrollbar max-h-[min(260px,calc(100dvh-150px))] overflow-y-auto overscroll-contain p-1.5">
          {haunts.map((haunt, index) => {
            const isFof = haunt.visibility === 'fof' && haunt.finderHandle !== viewerHandle
            return (
              <button
                key={haunt.id}
                ref={index === 0 ? firstChoiceRef : undefined}
                type="button"
                onClick={() => onSelect(haunt)}
                className="pressable flex w-full cursor-pointer items-center gap-2.5 rounded-[15px] px-2 py-2 text-left transition-colors hover:bg-white/[0.07]"
                aria-label={isFof
                  ? `Select ???, sealed nearby, ${haunt.distanceLabel}`
                  : `Select ${haunt.name} from ${haunt.finderHandle}, ${haunt.distanceLabel}`}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-[13px] border border-white/[0.12]"
                  style={hauntArtworkStyle(haunt)}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-white/90">
                    {isFof ? '???' : haunt.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-white/44">
                    {isFof ? 'sealed nearby' : `from ${haunt.finderHandle}`} · {haunt.distanceLabel}
                  </span>
                </span>
                <span className="ml-1 text-[9px] text-white/36">select</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SelectedPlaceCard({
  haunt,
  isOwn,
  isClosing,
  sourcePoint,
  onClose,
  onOpen,
}: {
  haunt: Haunt
  isOwn: boolean
  isClosing: boolean
  sourcePoint: { x: number; y: number } | null
  onClose: () => void
  onOpen: () => void
}) {
  const isFof = haunt.visibility === 'fof' && !isOwn
  const statusLabel = haunt.status === 'visited' ? 'visited' : haunt.status === 'arrived' ? 'you made it' : 'sealed nearby'
  const cardRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    const card = cardRef.current
    const parent = card?.parentElement
    if (!card || !parent || !sourcePoint || typeof card.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const parentRect = parent.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const sourceX = parentRect.left + sourcePoint.x
    const sourceY = parentRect.top + sourcePoint.y
    const cardCenterX = cardRect.left + cardRect.width / 2
    const cardCenterY = cardRect.top + cardRect.height / 2
    const deltaX = sourceX - cardCenterX
    const deltaY = sourceY - cardCenterY
    const sourceTransform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.16)`
    const animation = card.animate(
      isClosing
        ? [
            {
              opacity: 1,
              transform: 'translate3d(0, 0, 0) scale(1)',
              borderRadius: '28px',
              filter: 'blur(0px)',
            },
            {
              opacity: 0,
              transform: sourceTransform,
              borderRadius: '50%',
              filter: 'blur(2px)',
            },
          ]
        : [
            {
              opacity: 0,
              transform: sourceTransform,
              borderRadius: '50%',
              filter: 'blur(2px)',
            },
            {
              opacity: 1,
              transform: `translate3d(${deltaX * 0.035}px, ${deltaY * 0.035}px, 0) scale(1.025)`,
              borderRadius: '30px',
              filter: 'blur(0px)',
              offset: 0.78,
            },
            {
              opacity: 1,
              transform: 'translate3d(0, 0, 0) scale(1)',
              borderRadius: '28px',
              filter: 'blur(0px)',
            },
          ],
      {
        duration: isClosing ? 240 : 500,
        easing: isClosing ? 'cubic-bezier(0.32, 0, 0.67, 0)' : 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      },
    )

    return () => animation.cancel()
  }, [isClosing, sourcePoint])

  return (
    <div
      ref={cardRef}
      className={`selected-place-card absolute inset-x-3 bottom-3 z-[60] overflow-hidden rounded-[28px] border border-white/[0.16] shadow-[0_22px_60px_rgba(0,0,0,.62)] ${isClosing ? 'is-closing' : ''}`}
      role="dialog"
      aria-label={isFof ? 'selected nearby place' : `selected place ${haunt.name}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isClosing) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="glass-control pressable flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-white/[0.1]"
          aria-label="close place preview"
        >
          <X size={15} strokeWidth={1.65} />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="glass-control pressable flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-white/[0.1]"
            aria-label="open place details"
          >
            <Expand size={14} strokeWidth={1.55} />
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="glass-control pressable flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-white/[0.1]"
            aria-label="more place details"
          >
            <MoreHorizontal size={15} strokeWidth={1.55} />
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer p-3.5 pt-2.5 text-left">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-white/42">{statusLabel}</p>
            <p className="mt-1 truncate text-[20px] font-semibold tracking-[-0.035em] text-white/94">
              {isFof ? '???' : haunt.name}
            </p>
            <p className="mt-1 truncate text-[10px] text-white/46">
              from <span className="font-mono">{isFof ? 'someone nearby' : haunt.finderHandle}</span>
              <span className="px-1.5 text-white/22">·</span>
              {haunt.distanceLabel}
            </p>
          </div>
          <span className="shrink-0 text-[10px] text-white/42">tap to open</span>
        </div>
        <div
          className="mt-3 h-[82px] overflow-hidden rounded-[18px] border border-white/[0.11]"
          style={hauntArtworkStyle(haunt)}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

export default function MapScreen() {
  const {
    haunts,
    navigate,
    missedVisitId,
    dismissMissedVisit,
    confirmMissedVisit,
    focusHauntId,
    clearFocusHaunt,
    notificationsUnread,
    user,
    location,
    requestLocation,
  } = useApp()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [showDropNotice, setShowDropNotice] = useState(false)
  const [selectedHauntId, setSelectedHauntId] = useState<string | null>(null)
  const [selectedPlaceSource, setSelectedPlaceSource] = useState<{ x: number; y: number } | null>(null)
  const [selectedPlaceClosing, setSelectedPlaceClosing] = useState(false)
  const [clusterGroups, setClusterGroups] = useState<string[][]>([])
  const clusterGroupsRef = useRef<string[][]>([])
  const [clusterChooser, setClusterChooser] = useState<ClusterChooserState | null>(null)
  const clusterChooserTriggerRef = useRef<HTMLButtonElement | null>(null)
  const selectedPlaceCloseTimer = useRef<number | null>(null)
  const activeHaunts = haunts.filter((haunt) => isHauntActive(haunt))
  const missed = activeHaunts.find((h) => h.id === missedVisitId)
  const mappableHaunts = activeHaunts.filter((h) => h.audience !== 'self' || h.finderHandle === user.handle)
  const selectedHaunt = mappableHaunts.find((haunt) => haunt.id === selectedHauntId)

  // --- native map pan + zoom ---
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const initialMapCenterRef = useRef<[number, number]>(
    location ? [location.lat, location.lng] : MAP_CENTER,
  )
  const hauntsRef = useRef(haunts)
  const syncMarkersRef = useRef<() => void>(() => undefined)
  const [markerPositions, setMarkerPositions] = useState<Record<string, MarkerPosition>>({})
  const [mapLabelsVisible, setMapLabelsVisible] = useState(true)
  hauntsRef.current = mappableHaunts

  const closeSelectedPlace = () => {
    setSelectedPlaceClosing(true)
    selectedPlaceCloseTimer.current = window.setTimeout(() => {
      setSelectedHauntId(null)
      setSelectedPlaceSource(null)
      setSelectedPlaceClosing(false)
      selectedPlaceCloseTimer.current = null
    }, 250)
  }

  const openSelectedPlace = (haunt: Haunt) => {
    setClusterChooser(null)
    if (selectedPlaceCloseTimer.current !== null) {
      window.clearTimeout(selectedPlaceCloseTimer.current)
      selectedPlaceCloseTimer.current = null
    }
    setSelectedPlaceClosing(false)
    setSelectedHauntId(haunt.id)
    const marker = markerPositions[haunt.id]
    setSelectedPlaceSource(marker ? { x: marker.left, y: marker.top } : null)
    setSheetOpen(false)
    const [lat, lng] = hauntLatLng(haunt.zone, location ? [location.lat, location.lng] : undefined)
    const map = mapRef.current
    if (map) {
      const target = { center: [lng, lat] as [number, number] }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        map.jumpTo(target)
      } else {
        map.easeTo({ ...target, duration: 360 })
      }
    }
  }

  const openCluster = (haunts: Haunt[], position: MarkerPosition, trigger: HTMLButtonElement) => {
    const map = mapRef.current
    if (!map) return
    if (map.getZoom() >= map.getMaxZoom() - 0.01) {
      clusterChooserTriggerRef.current = trigger
      setClusterChooser({ hauntIds: haunts.map((haunt) => haunt.id) })
      return
    }

    const [longitude, latitude] = map.unproject([position.left, position.top]).toArray()
    const target = {
      center: [longitude, latitude] as [number, number],
      zoom: Math.min(map.getZoom() + 2.25, map.getMaxZoom()),
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      map.jumpTo(target)
    } else {
      map.easeTo({ ...target, duration: 360 })
    }
  }

  const closeClusterChooser = (restoreFocus = false) => {
    setClusterChooser(null)
    if (restoreFocus) {
      window.requestAnimationFrame(() => clusterChooserTriggerRef.current?.focus())
    }
  }

  useEffect(() => {
    if (!clusterChooser) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setClusterChooser(null)
      window.requestAnimationFrame(() => clusterChooserTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clusterChooser])

  // A reload forgets the in-memory fix. Restore it silently only when the
  // browser already says permission is granted; the onboarding CTA remains the
  // only path that can turn a fresh permission prompt into a surprise.
  useEffect(() => {
    if (location || typeof navigator === 'undefined' || !navigator.permissions) return
    let active = true
    void navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (active && permission.state === 'granted') void requestLocation()
    })
    return () => {
      active = false
    }
  }, [location, requestLocation])

  useEffect(
    () => () => {
      if (selectedPlaceCloseTimer.current !== null) {
        window.clearTimeout(selectedPlaceCloseTimer.current)
      }
    },
    [],
  )

  syncMarkersRef.current = () => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvas()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const labelsVisible = map.getZoom() >= MAP_LABEL_MIN_ZOOM
    setMapLabelsVisible((current) => (current === labelsVisible ? current : labelsVisible))
    const next: Record<string, MarkerPosition> = {}
    hauntsRef.current.forEach((haunt) => {
      const [lat, lng] = hauntLatLng(haunt.zone, location ? [location.lat, location.lng] : undefined)
      const point = map.project([lng, lat])

      // `project` still returns a coordinate for places that are beyond the
      // camera's visible surface. That matters with this map's pitch: a haunt
      // behind the horizon can project into the page, and its label (which
      // sits below the marker) can become visible even though the location is
      // not. Only keep overlays whose anchor is actually in the viewport.
      const isVisible =
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= width &&
        point.y >= 0 &&
        point.y <= height &&
        map.transform.isPointOnMapSurface(point)
      if (!isVisible) return

      /*
       * Project the actual WGS84 radius, not four degree-offset points. The
       * full ring matters under pitch and bearing: perspective changes scale
       * across the footprint, and the projected north/south extremes are not
       * perfectly symmetric around the projected centre. The fog gets the
       * exact visible bounds without a readability clamp changing its size.
       */
      const footprint = geodesicCircle([lat, lng], haunt.zone.radiusM, 64)[0]
      const projectedFootprint = footprint.map(([footprintLng, footprintLat]) =>
        map.project([footprintLng, footprintLat]),
      )
      const minX = Math.min(...projectedFootprint.map((candidate) => candidate.x))
      const maxX = Math.max(...projectedFootprint.map((candidate) => candidate.x))
      const minY = Math.min(...projectedFootprint.map((candidate) => candidate.y))
      const maxY = Math.max(...projectedFootprint.map((candidate) => candidate.y))
      const footprintCenterX = (minX + maxX) / 2
      const footprintCenterY = (minY + maxY) / 2

      // A name centred on a zone near the edge hangs off the frame and gets
      // cut. The zone itself stays put — only the caption slides.
      const overLeft = Math.max(LABEL_HALF_WIDTH - footprintCenterX, 0)
      const overRight = Math.max(footprintCenterX + LABEL_HALF_WIDTH - width, 0)

      next[haunt.id] = {
        left: footprintCenterX,
        top: footprintCenterY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        labelShift: overLeft - overRight,
      }
    })
    setMarkerPositions(next)
    const nextClusters = findMarkerClusters(next, clusterGroupsRef.current)
    if (!sameClusters(clusterGroupsRef.current, nextClusters)) {
      clusterGroupsRef.current = nextClusters
      setClusterGroups(nextClusters)
    }
  }

  /**
   * Builds the map, but not before the container has a real size.
   *
   * A map created against a 0×0 container starts with a broken idea of its own
   * viewport, and overlay positions projected from it land nowhere. That happens
   * whenever the app mounts before layout settles — a background tab, a
   * collapsed pane, a parent still resolving its height — so creation waits for
   * the first non-zero measurement instead of assuming one.
   */
  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return

    const sync = () => syncMarkersRef.current()
    const dismissClusterChooser = () => setClusterChooser(null)
    let map: MapLibreMap | null = null

    const createMap = () => {
      map = new MapLibreMap({
        container,
        style: hauntMapStyle(),
        // MapLibre takes longitude first, and counts zoom one step coarser than
        // the 256 px-tile scale the rest of the app is written in.
        center: [initialMapCenterRef.current[1], initialMapCenterRef.current[0]],
        zoom: MAP_DEFAULT_ZOOM - 1,
        minZoom: MAP_MIN_ZOOM - 1,
        maxZoom: MAP_MAX_ZOOM - 1,
        pitch: MAP_PITCH,
        bearing: MAP_BEARING,
        attributionControl: false,
        // The pitch is the point of the style, so let it be adjusted, but never
        // past the horizon: beyond ~60° the sky would need something in it.
        maxPitch: 62,
        dragRotate: true,
        touchPitch: true,
        pitchWithRotate: true,
        // Nothing here reads or writes a location hash.
        hash: false,
        fadeDuration: 220,
      })

      // A basemap that fails leaves a black screen and no clue, so say so.
      map.on('error', (event) => {
        const message = event.error?.message ?? String(event)
        console.error('[map]', message)
        if (import.meta.env.DEV) Object.assign(window, { __mapError: message })
      })
      if (import.meta.env.DEV) Object.assign(window, { __map: map })

      mapRef.current = map
      // `move` covers pan, zoom, rotate and pitch, and fires per frame while any
      // of them is animating, which is exactly when the overlays have to keep up.
      map.on('move', sync)
      map.on('resize', sync)
      map.on('click', dismissClusterChooser)
      map.once('load', sync)
      sync()
    }

    const hasSize = () => container.clientWidth > 0 && container.clientHeight > 0

    const observer = new ResizeObserver(() => {
      if (!hasSize()) return
      if (!map) {
        createMap()
        return
      }
      map.resize()
      sync()
    })
    observer.observe(container)

    if (hasSize()) createMap()

    return () => {
      observer.disconnect()
      map?.off('move', sync)
      map?.off('resize', sync)
      map?.off('click', dismissClusterChooser)
      map?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!location) return
    mapRef.current?.flyTo({
      center: [location.lng, location.lat],
      zoom: MAP_DEFAULT_ZOOM - 1,
      pitch: MAP_PITCH,
      bearing: MAP_BEARING,
      duration: 760,
    })
  }, [location])

  useEffect(() => {
    syncMarkersRef.current()
  }, [haunts, user.handle, location])

  const zoomMap = (direction: 1 | -1) => {
    const map = mapRef.current
    if (!map) return
    if (direction > 0) map.zoomIn({ duration: 320 })
    else map.zoomOut({ duration: 320 })
  }

  /** Back to the viewer's area, and back to the angle the map is meant to be seen at. */
  const recenterMap = () => {
    const center: [number, number] = location
      ? [location.lng, location.lat]
      : [MAP_CENTER[1], MAP_CENTER[0]]
    mapRef.current?.flyTo({
      center,
      zoom: MAP_DEFAULT_ZOOM - 1,
      pitch: MAP_PITCH,
      bearing: MAP_BEARING,
      duration: 760,
    })
  }

  // --- bottom-sheet drag ---
  // Tracks the finger 1:1 in range. At either boundary the extra distance is
  // resisted, and release uses the last 100ms of motion so a flick can commit
  // before the sheet crosses its midpoint.
  const sheetRef = useRef<HTMLDivElement>(null)
  const [dragY, setDragY] = useState<number | null>(null)
  const drag = useRef<SheetDrag>({
    pointerId: -1,
    startY: 0,
    startOffset: 0,
    currentOffset: 0,
    moved: false,
    samples: [],
  })

  const closedOffset = () => Math.max(0, (sheetRef.current?.offsetHeight ?? 0) - SHEET_PEEK)

  const resistedOffset = (offset: number) => {
    const max = closedOffset()
    if (offset < 0) return offset * OVERSCROLL_FRICTION
    if (offset > max) return max + (offset - max) * OVERSCROLL_FRICTION
    return offset
  }

  const recordSample = (y: number, time: number) => {
    const cutoff = time - VELOCITY_WINDOW
    drag.current.samples = [...drag.current.samples.filter((sample) => sample.time >= cutoff), { y, time }]
  }

  const onSheetPointerDown = (e: React.PointerEvent) => {
    if (drag.current.pointerId !== -1) return // ignore extra touch points
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startOffset: sheetOpen ? 0 : closedOffset(),
      currentOffset: sheetOpen ? 0 : closedOffset(),
      moved: false,
      samples: [{ y: e.clientY, time: performance.now() }],
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic/test pointers have no active pointer to capture
    }
  }

  const onSheetPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== drag.current.pointerId) return
    const delta = e.clientY - drag.current.startY
    if (Math.abs(delta) > 6) drag.current.moved = true
    const next = resistedOffset(drag.current.startOffset + delta)
    drag.current.currentOffset = next
    recordSample(e.clientY, performance.now())
    setDragY(next)
  }

  const onSheetPointerUp = (e: React.PointerEvent) => {
    if (e.pointerId !== drag.current.pointerId) return
    recordSample(e.clientY, performance.now())
    drag.current.pointerId = -1
    if (!drag.current.moved) {
      setDragY(null)
      return
    }

    const first = drag.current.samples[0]
    const last = drag.current.samples[drag.current.samples.length - 1]
    const velocity = (last.y - first.y) / Math.max(last.time - first.time, 1)
    let open: boolean
    if (Math.abs(velocity) >= FLICK_VELOCITY) {
      open = velocity < 0 // a quick flick commits its direction
    } else {
      open = drag.current.currentOffset < closedOffset() / 2
    }
    setDragY(null)
    setSheetOpen(open)
  }

  const onSheetPointerCancel = (e: React.PointerEvent) => {
    if (e.pointerId !== drag.current.pointerId) return
    drag.current.pointerId = -1
    setDragY(null)
  }

  const onSheetToggle = () => {
    if (drag.current.moved) return // a drag isn't a tap
    setSheetOpen((o) => !o)
  }

  useEffect(() => {
    if (focusHauntId) {
      setFlash(focusHauntId)
      setShowDropNotice(true)
      const t = setTimeout(() => {
        setFlash(null)
        setShowDropNotice(false)
        clearFocusHaunt()
      }, 2600)
      return () => clearTimeout(t)
    }
  }, [focusHauntId, clearFocusHaunt])

  const visible = activeHaunts.filter(
    (h) =>
      (h.audience !== 'self' || h.finderHandle === user.handle) &&
      (h.visibility === 'friend' || h.finderHandle === user.handle),
  )
  const hauntById = new Map(mappableHaunts.map((haunt) => [haunt.id, haunt] as const))
  const clusterViews = clusterGroups.flatMap((ids) => {
    const members = ids
      .map((id) => ({ haunt: hauntById.get(id), position: markerPositions[id] }))
      .filter(
        (member): member is { haunt: Haunt; position: MarkerPosition } =>
          member.haunt !== undefined && member.position !== undefined,
      )
    if (members.length < 2) return []
    return [{
      ids: members.map(({ haunt }) => haunt.id),
      members: members.map(({ haunt, position }) => ({
        haunt,
        isOwn: haunt.finderHandle === user.handle,
        position,
      })),
      position: {
        left: members.reduce((sum, member) => sum + member.position.left, 0) / members.length,
        top: members.reduce((sum, member) => sum + member.position.top, 0) / members.length,
        width: 72,
        height: 72,
        labelShift: 0,
      },
    }]
  })
  const clusteredHauntIds = new Set(clusterViews.flatMap((cluster) => cluster.ids))
  const chooserHaunts = clusterChooser
    ? clusterChooser.hauntIds.map((id) => hauntById.get(id)).filter((haunt): haunt is Haunt => Boolean(haunt))
    : []
  const chooserPositions = clusterChooser
    ? clusterChooser.hauntIds
        .map((id) => markerPositions[id])
        .filter((position): position is MarkerPosition => Boolean(position))
    : []
  const chooserAnchor = chooserPositions.length
    ? {
        left: chooserPositions.reduce((sum, position) => sum + position.left, 0) / chooserPositions.length,
        top: chooserPositions.reduce((sum, position) => sum + position.top, 0) / chooserPositions.length,
      }
    : null
  const mapWidth = mapContainerRef.current?.clientWidth || 320
  const mapHeight = mapContainerRef.current?.clientHeight || 640
  const chooserPosition = chooserAnchor
    ? {
        left: Math.max(12, Math.min(chooserAnchor.left - 140, Math.max(12, mapWidth - 292))),
        top: Math.max(84, Math.min(chooserAnchor.top - 160, Math.max(84, mapHeight - 336))),
      }
    : null
  const chooserOrigin = chooserAnchor && chooserPosition
    ? {
        x: Math.max(0, Math.min(chooserAnchor.left - chooserPosition.left, Math.min(280, mapWidth - 24))),
        y: Math.max(0, Math.min(chooserAnchor.top - chooserPosition.top, mapHeight - chooserPosition.top)),
      }
    : null
  return (
    // no entrance animation: the map is the home surface, seen constantly
    <div className="relative h-full overflow-hidden">
      <div
        ref={mapContainerRef}
        /* h-full w-full as well as inset-0: MapLibre's own stylesheet sets
           position: relative on its container, which beats Tailwind's absolute
           and would leave inset-0 doing nothing at all. */
        className="haunt-map absolute inset-0 z-0 h-full w-full"
        aria-label="Haunt map. Drag to explore and pinch to zoom."
      />
      {/* The reference map keeps the center readable and lets the edges fall
          away. This is deliberately softer than a full scrim so the local road
          labels can still breathe through the atmosphere. */}
      <div className="pointer-events-none absolute inset-0 z-[1] map-focus-gradient" />
      {mappableHaunts.map((h) => {
        const position = markerPositions[h.id]
        return position && !clusteredHauntIds.has(h.id) ? (
          <Zone
            key={h.id}
            haunt={h}
            isOwn={h.finderHandle === user.handle}
            position={position}
            showLabel={mapLabelsVisible}
            onOpen={() => openSelectedPlace(h)}
          />
        ) : null
      })}
      {clusterViews.map((cluster) => (
        <HauntCluster
          key={cluster.ids.join('|')}
          left={cluster.position.left}
          top={cluster.position.top}
          members={cluster.members}
          isExpanded={clusterChooser?.hauntIds.join('|') === cluster.ids.join('|')}
          onOpen={(trigger) => openCluster(cluster.members.map(({ haunt }) => haunt), cluster.position, trigger)}
        />
      ))}
      {clusterChooser && chooserPosition && chooserOrigin && chooserHaunts.length > 1 && (
        <HauntClusterChooser
          haunts={chooserHaunts}
          left={chooserPosition.left}
          top={chooserPosition.top}
          viewerHandle={user.handle}
          origin={chooserOrigin}
          onClose={() => closeClusterChooser(true)}
          onSelect={openSelectedPlace}
        />
      )}
      {flash && (() => {
        const haunt = haunts.find((h) => h.id === flash)
        const position = markerPositions[flash]
        return haunt && position ? (
            <div
              className="fade-in pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-visited/60"
              style={{
                ...position,
                width: 110,
                height: 110,
              }}
            />
        ) : null
      })()}
      {selectedHaunt && (
        <SelectedPlaceCard
          haunt={selectedHaunt}
          isOwn={selectedHaunt.finderHandle === user.handle}
          isClosing={selectedPlaceClosing}
          sourcePoint={selectedPlaceSource}
          onClose={closeSelectedPlace}
          onOpen={() => navigate({ name: 'haunt', hauntId: selectedHaunt.id })}
        />
      )}
      <p className="pointer-events-none absolute right-3 bottom-[148px] z-10 text-[8px] tracking-wide text-white/45">
        {MAP_ATTRIBUTION}
      </p>

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-2">
        <div>
          <span className="app-title block text-white">Haunt</span>
        </div>
        <button
          onClick={() => navigate({ name: 'notifications' })}
          className="glass-control pressable relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-white/10"
          aria-label="notifications"
        >
          <Bell size={17} strokeWidth={1.5} />
          {notificationsUnread && (
            <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full border border-black/40 bg-white" />
          )}
        </button>
      </div>

      {showDropNotice && !missed && (
        <div
          className="glass-panel toast-in absolute top-16 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-medium text-white"
          role="status"
        >
          haunt dropped nearby
        </div>
      )}

      {/* missed visit banner */}
      {missed && (
        <div className="arrival-prompt screen-in absolute inset-x-3 top-17 z-20 rounded-[28px] p-3.5">
          <div className="flex items-start gap-3">
            <div className="arrival-prompt-icon mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
              <MapPin size={17} strokeWidth={1.55} />
            </div>
            <div className="min-w-0 flex-1 pr-1">
              <p className="pt-0.5 text-[15px] leading-[1.36] tracking-[-0.02em] text-ink/94">
                looks like you were near <span className="font-semibold text-white">{missed.name}</span> —
                did you make it?
              </p>
              <div className="arrival-segment mt-3 flex w-full max-w-[306px] items-stretch">
                <button
                  onClick={() => void confirmMissedVisit()}
                  data-active="true"
                  className="arrival-segment-option pressable flex-1 cursor-pointer px-2.5 text-[13px] font-medium tracking-[-0.02em]"
                >
                  I made it
                </button>
                <button
                  onClick={() => void dismissMissedVisit()}
                  data-active="false"
                  className="arrival-segment-option pressable flex-1 cursor-pointer px-2.5 text-[13px] font-medium tracking-[-0.02em]"
                >
                  not this time
                </button>
              </div>
            </div>
            <button
              onClick={() => void dismissMissedVisit()}
              className="pressable cursor-pointer text-ink-3 transition-colors duration-200 hover:text-ink-2"
              aria-label="dismiss"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <div className="glass-control absolute right-5 bottom-[258px] z-20 flex flex-col overflow-hidden rounded-[18px]">
        <button
          type="button"
          onClick={() => zoomMap(1)}
          className="pressable flex h-10 w-10 items-center justify-center text-ink-2 transition-colors hover:text-ink"
          aria-label="zoom in"
        >
          <Plus size={17} strokeWidth={1.7} />
        </button>
        <span className="mx-2 h-px bg-white/10" />
        <button
          type="button"
          onClick={() => zoomMap(-1)}
          className="pressable flex h-10 w-10 items-center justify-center text-ink-2 transition-colors hover:text-ink"
          aria-label="zoom out"
        >
          <Minus size={17} strokeWidth={1.7} />
        </button>
        <span className="mx-2 h-px bg-white/10" />
        <button
          type="button"
          onClick={recenterMap}
          className="pressable flex h-10 w-10 items-center justify-center text-ink-2 transition-colors hover:text-ink"
          aria-label="recenter map"
        >
          <LocateFixed size={16} strokeWidth={1.6} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => navigate({ name: 'drop' })}
        className="pressable absolute right-5 bottom-[126px] z-[45] flex h-[46px] w-[46px] cursor-pointer items-center justify-center rounded-full border border-white/90 bg-[#f4f4f6] text-black shadow-[0_12px_30px_rgba(0,0,0,.42)]"
        aria-label="drop a haunt"
      >
        <Plus size={20} strokeWidth={1.55} />
      </button>

      {/* bottom sheet — draggable from the handle, tap still toggles */}
      <div
        ref={sheetRef}
        className={`map-sheet absolute inset-x-0 bottom-0 rounded-t-[32px] border-t shadow-[0_-26px_70px_rgba(0,0,0,.5)] ${
          selectedHaunt ? 'pointer-events-none opacity-0' : 'opacity-100'
        } ${
          // The expanded sheet should own the foreground layer, covering the
          // floating map actions as it rises. Keep the selected place card
          // above it, though, so an already-open preview is not interrupted.
          sheetOpen || dragY !== null ? 'z-[58]' : 'z-20'
        } ${
          dragY === null
              ? `transition-[transform,opacity] duration-450 [transition-timing-function:var(--ease-drawer)] ${
                sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-112px)]'
              }`
            : ''
        }`}
        style={{
          height: '62%',
          ...(dragY !== null ? { transform: `translateY(${dragY}px)` } : {}),
        }}
      >
        <button
          onClick={onSheetToggle}
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={onSheetPointerCancel}
          className="flex w-full cursor-grab touch-none flex-col items-center px-5 pt-2.5 pb-2 active:cursor-grabbing"
          aria-label="toggle nearby haunts"
          aria-expanded={sheetOpen}
          aria-controls="nearby-haunts"
        >
          <span className="h-1 w-9 rounded-full bg-white/24" />
          <div className="mt-3 flex w-full items-center justify-between">
            <div className="text-left">
              <span className="block text-[16px] font-semibold tracking-[-0.025em] text-white/92">
                Places close to you
              </span>
            </div>
          </div>
        </button>
        <div
          id="nearby-haunts"
          className={`no-scrollbar h-full overflow-y-auto px-3 pt-1 pb-36 transition-opacity duration-200 [transition-timing-function:var(--ease-out)] ${sheetOpen || dragY !== null ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {visible.map((h) => (
            <button
              key={h.id}
              onClick={() => navigate({ name: 'haunt', hauntId: h.id })}
              className="flex w-full pressable cursor-pointer items-center gap-3.5 rounded-[20px] border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color] duration-200 hover:border-white/[0.07] hover:bg-white/[0.05]"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"
                style={hauntArtworkStyle(h)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold tracking-[-0.012em] text-ink">{h.name}</p>
                <p className="mt-0.5 text-[10px] tracking-[0.01em] text-ink-3">
                  from <span className="font-mono">{h.finderHandle}</span>
                </p>
              </div>
              <span className="font-mono text-[11px] text-ink-3">{h.distanceLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
