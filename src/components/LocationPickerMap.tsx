import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import HauntShader from './HauntShader'
import {
  MAP_CENTER,
  MAP_MAX_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL_TEMPLATE,
  zoneDiameterPx,
} from '../lib/geo'

export interface PickedLocation {
  lat: number
  lng: number
}

const PICKER_MIN_ZOOM = 2
const PICKER_DEFAULT_ZOOM = 15
const RADIUS_PX_BOUNDS = { min: 64, max: 190 }

/**
 * Manual fallback for people who decline browser location.
 *
 * There is no geographic fence here: a person can pan anywhere in the world
 * and tap the map to choose the centre of the fogged zone.
 */
export default function LocationPickerMap({
  location,
  radius,
  onChange,
}: {
  location: PickedLocation | null
  radius: number
  onChange: (location: PickedLocation) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const locationRef = useRef(location)
  const onChangeRef = useRef(onChange)
  const syncRef = useRef<() => void>(() => undefined)
  const [markerPoint, setMarkerPoint] = useState({ left: 0, top: 0 })
  const [radiusPixels, setRadiusPixels] = useState(120)

  locationRef.current = location
  onChangeRef.current = onChange

  syncRef.current = () => {
    const map = mapRef.current
    if (!map) return
    const point = map.latLngToContainerPoint(locationRef.current ?? map.getCenter())
    setMarkerPoint({ left: point.x, top: point.y })
    setRadiusPixels(
      zoneDiameterPx(radius, map.getCenter().lat, map.getZoom(), RADIUS_PX_BOUNDS),
    )
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const sync = () => syncRef.current()
    const choose = (event: L.LeafletMouseEvent) =>
      onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng })
    let map: L.Map | null = null

    const createMap = () => {
      const selected = locationRef.current
      map = L.map(container, {
        center: selected ? [selected.lat, selected.lng] : MAP_CENTER,
        zoom: PICKER_DEFAULT_ZOOM,
        minZoom: PICKER_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: true,
        doubleClickZoom: false,
        keyboard: false,
        boxZoom: false,
        inertia: true,
        inertiaDeceleration: 3400,
        inertiaMaxSpeed: 420,
        zoomAnimation: true,
        fadeAnimation: true,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
      })

      L.tileLayer(TILE_URL_TEMPLATE, {
        minZoom: PICKER_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        crossOrigin: true,
        attribution: TILE_ATTRIBUTION,
      }).addTo(map)

      mapRef.current = map
      map.on('move zoom moveend zoomend resize', sync)
      map.on('click', choose)
      sync()
    }

    const hasSize = () => container.clientWidth > 0 && container.clientHeight > 0
    const observer = new ResizeObserver(() => {
      if (!hasSize()) return
      if (!map) {
        createMap()
        return
      }
      map.invalidateSize({ pan: false })
      sync()
    })
    observer.observe(container)
    if (hasSize()) createMap()

    return () => {
      observer.disconnect()
      map?.off('move zoom moveend zoomend resize', sync)
      map?.off('click', choose)
      map?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    syncRef.current()
  }, [location, radius])

  const zoomMap = (direction: 1 | -1) => {
    const map = mapRef.current
    if (!map) return
    const nextZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + direction))
    map.flyTo(map.getCenter(), nextZoom, { duration: 0.45 })
  }

  return (
    <div
      className="relative mt-3 h-56 overflow-hidden rounded-[28px] border border-white/[0.12] bg-[#07080a] shadow-[0_20px_48px_rgba(0,0,0,.28)] outline-none"
      role="application"
      aria-label="Choose the haunt zone on the world map. Drag to explore, pinch or use the controls to zoom, and tap to place it."
    >
      <div ref={containerRef} className="haunt-leaflet-map absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-black/20" />
      <span
        className="pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/28 bg-white/[0.035] shadow-[0_0_34px_rgba(255,255,255,.1)] backdrop-blur-[2px] transition-[width,height] duration-75"
        style={{ ...markerPoint, width: radiusPixels, height: radiusPixels }}
      />
      <span
        className="haunt-field pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-1/2 transition-[width,height] duration-75"
        style={{ ...markerPoint, width: radiusPixels, height: radiusPixels }}
      >
        <HauntShader seed={8} />
      </span>
      <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/76 backdrop-blur-md">
        tap to place
      </span>
      <div className="glass-control absolute right-2.5 top-2.5 z-10 flex flex-col overflow-hidden rounded-[15px]">
        <button
          type="button"
          onClick={() => zoomMap(1)}
          className="pressable flex h-9 w-9 items-center justify-center text-white/75"
          aria-label="zoom zone map in"
        >
          <Plus size={15} strokeWidth={1.7} />
        </button>
        <span className="mx-2 h-px bg-white/10" />
        <button
          type="button"
          onClick={() => zoomMap(-1)}
          className="pressable flex h-9 w-9 items-center justify-center text-white/75"
          aria-label="zoom zone map out"
        >
          <Minus size={15} strokeWidth={1.7} />
        </button>
      </div>
      <span className="pointer-events-none absolute right-2.5 bottom-2 z-10 text-[7px] tracking-wide text-white/42">
        {TILE_ATTRIBUTION}
      </span>
    </div>
  )
}
