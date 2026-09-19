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
import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronUp, Expand, LocateFixed, MapPin, Minus, MoreHorizontal, Plus, X } from 'lucide-react'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../context/appState'
import { hauntArtworkStyle } from '../components/ui'
import HauntShader from '../components/HauntShader'
import { isHauntActive } from '../domain'
import type { Haunt } from '../domain'
import {
  MAP_BEARING,
  MAP_BOUNDS,
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

/** Room a name needs on either side of its zone before it runs off the frame. */
const LABEL_HALF_WIDTH = 78
/** A restrained echo of the map's bearing, keeping captions subtly grounded. */
const LABEL_TILT_DEGREES = MAP_BEARING / 2
/** Shroud shapes cycle through this many variants. */
const SHROUD_VARIANTS = 17

function Zone({
  haunt,
  isOwn,
  onOpen,
  position,
}: {
  haunt: Haunt
  isOwn: boolean
  onOpen: () => void
  position: MarkerPosition
}) {
  const width = position.width || 76
  const height = position.height || 76
  const isFof = haunt.visibility === 'fof' && !isOwn
  const isArrived = haunt.status === 'arrived' && !isFof
  const isVisited = haunt.status === 'visited' && !isFof
  const seed = haunt.shroudSeed ?? stringSeed(haunt.id) % SHROUD_VARIANTS
  return (
    <button
      onClick={onOpen}
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      style={{ left: position.left, top: position.top }}
      aria-label={haunt.name}
    >
      <div
        className="haunt-zone zone-breathe relative flex items-center justify-center"
        style={{ width, height, animationDelay: `${(haunt.zone.x * 37) % 4000}ms` }}
      >
        {isVisited ? (
          <>
            <span className="haunt-memory-marker relative flex h-10 w-10 items-center justify-center rounded-full">
              <span className="haunt-memory-orb" aria-hidden="true" />
              <span className="haunt-memory-glint" aria-hidden="true" />
            </span>
          </>
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
      <div
        className="map-haunt-label pressable-subtle absolute top-[calc(100%+4px)] left-1/2 max-w-[46vw] truncate rounded-full border border-white/[0.11] bg-black/72 px-2.5 py-1 text-white/88 shadow-lg backdrop-blur-xl transition-colors duration-200 group-hover:bg-black/90 group-active:bg-black/90"
        style={{
          transform: `translateX(calc(-50% + ${position.labelShift}px)) rotate(${LABEL_TILT_DEGREES}deg)`,
          transformOrigin: 'center top',
        }}
      >
        {isFof ? '???' : haunt.name}
      </div>
    </button>
  )
}

function SelectedPlaceCard({
  haunt,
  isOwn,
  isClosing,
  onClose,
  onOpen,
}: {
  haunt: Haunt
  isOwn: boolean
  isClosing: boolean
  onClose: () => void
  onOpen: () => void
}) {
  const isFof = haunt.visibility === 'fof' && !isOwn
  const statusLabel = haunt.status === 'visited' ? 'visited' : haunt.status === 'arrived' ? 'you made it' : 'sealed nearby'

  return (
    <div
      className={`selected-place-card absolute inset-x-3 bottom-3 z-[60] overflow-hidden rounded-[28px] border border-white/[0.16] shadow-[0_22px_60px_rgba(0,0,0,.62)] ${isClosing ? 'is-closing' : ''}`}
      role="dialog"
      aria-label={isFof ? 'selected nearby place' : `selected place ${haunt.name}`}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <button
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
    requestLocation,
  } = useApp()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [showDropNotice, setShowDropNotice] = useState(false)
  const [selectedHauntId, setSelectedHauntId] = useState<string | null>(null)
  const [selectedPlaceClosing, setSelectedPlaceClosing] = useState(false)
  const selectedPlaceCloseTimer = useRef<number | null>(null)
  const activeHaunts = haunts.filter((haunt) => isHauntActive(haunt))
  const missed = activeHaunts.find((h) => h.id === missedVisitId)
  const mappableHaunts = activeHaunts.filter((h) => h.audience !== 'self' || h.finderHandle === user.handle)
  const selectedHaunt = mappableHaunts.find((haunt) => haunt.id === selectedHauntId)

  // --- native map pan + zoom ---
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const hauntsRef = useRef(haunts)
  const syncMarkersRef = useRef<() => void>(() => undefined)
  const [markerPositions, setMarkerPositions] = useState<Record<string, MarkerPosition>>({})
  hauntsRef.current = mappableHaunts

  const closeSelectedPlace = () => {
    setSelectedPlaceClosing(true)
    selectedPlaceCloseTimer.current = window.setTimeout(() => {
      setSelectedHauntId(null)
      setSelectedPlaceClosing(false)
      selectedPlaceCloseTimer.current = null
    }, 220)
  }

  const openSelectedPlace = (haunt: Haunt) => {
    if (selectedPlaceCloseTimer.current !== null) {
      window.clearTimeout(selectedPlaceCloseTimer.current)
      selectedPlaceCloseTimer.current = null
    }
    setSelectedPlaceClosing(false)
    setSelectedHauntId(haunt.id)
    setSheetOpen(false)
    const [lat, lng] = hauntLatLng(haunt.zone)
    mapRef.current?.easeTo({
      center: [lng, lat],
      duration: 420,
      essential: true,
    })
  }

  // Location is useful here, but it should never be a boot-time surprise. The
  // map is the first screen where asking for it has a clear explanation.
  useEffect(() => {
    void requestLocation()
  }, [requestLocation])

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
    const next: Record<string, MarkerPosition> = {}
    hauntsRef.current.forEach((haunt) => {
      const [lat, lng] = hauntLatLng(haunt.zone)
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
    let map: MapLibreMap | null = null

    const createMap = () => {
      map = new MapLibreMap({
        container,
        style: hauntMapStyle(),
        // MapLibre takes longitude first, and counts zoom one step coarser than
        // the 256 px-tile scale the rest of the app is written in.
        center: [MAP_CENTER[1], MAP_CENTER[0]],
        zoom: MAP_DEFAULT_ZOOM - 1,
        minZoom: MAP_MIN_ZOOM - 1,
        maxZoom: MAP_MAX_ZOOM - 1,
        pitch: MAP_PITCH,
        bearing: MAP_BEARING,
        maxBounds: [
          [MAP_BOUNDS[0][1], MAP_BOUNDS[0][0]],
          [MAP_BOUNDS[1][1], MAP_BOUNDS[1][0]],
        ],
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
      map?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    syncMarkersRef.current()
  }, [haunts, user.handle])

  const zoomMap = (direction: 1 | -1) => {
    const map = mapRef.current
    if (!map) return
    if (direction > 0) map.zoomIn({ duration: 320 })
    else map.zoomOut({ duration: 320 })
  }

  /** Back to the city, and back to the angle the map is meant to be seen at. */
  const recenterMap = () => {
    mapRef.current?.flyTo({
      center: [MAP_CENTER[1], MAP_CENTER[0]],
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
  return (
    // no entrance animation: the map is the home surface, seen constantly
    <div className="relative h-full overflow-hidden">
      <div
        ref={mapContainerRef}
        /* h-full w-full as well as inset-0: MapLibre's own stylesheet sets
           position: relative on its container, which beats Tailwind's absolute
           and would leave inset-0 doing nothing at all. */
        className="haunt-map absolute inset-0 z-0 h-full w-full"
        aria-label="Dumaguete City map. Drag to explore and pinch to zoom."
      />
      {/* The reference map keeps the center readable and lets the edges fall
          away. This is deliberately softer than a full scrim so the local road
          labels can still breathe through the atmosphere. */}
      <div className="pointer-events-none absolute inset-0 z-[1] map-focus-gradient" />
      {mappableHaunts.map((h) => {
        const position = markerPositions[h.id]
        return position ? (
          <Zone
            key={h.id}
            haunt={h}
            isOwn={h.finderHandle === user.handle}
            position={position}
            onOpen={() => openSelectedPlace(h)}
          />
        ) : null
      })}
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
          onClose={closeSelectedPlace}
          onOpen={() => navigate({ name: 'haunt', hauntId: selectedHaunt.id })}
        />
      )}
      <p className="pointer-events-none absolute right-3 bottom-[148px] z-10 text-[8px] tracking-wide text-white/45">
        {MAP_ATTRIBUTION} · Dumaguete City
      </p>

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-2">
        <div>
          <span className="app-title block text-white">Haunt</span>
        </div>
        <span className="glass-control absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[10px] font-medium tracking-[-0.01em] text-white/68">
          Dumaguete
        </span>
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
          sheetOpen || dragY !== null ? 'z-40' : 'z-20'
        } ${
          dragY === null
              ? `transition-transform duration-450 [transition-timing-function:var(--ease-drawer)] ${
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
            {!sheetOpen && (
              <span className="glass-control flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-white/65">
                {visible.length}
                <ChevronUp
                  size={13}
                  strokeWidth={1.6}
                  className="transition-transform duration-200 [transition-timing-function:var(--ease-in-out)]"
                />
              </span>
            )}
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
              >
                <MapPin
                  size={16}
                  strokeWidth={1.5}
                  color={
                    h.status === 'visited'
                      ? '#b7d2c6'
                      : h.visibility === 'fof'
                        ? '#dfbea4'
                        : '#c8c4ee'
                  }
                />
              </div>
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
