/**
 * The one place that knows how Haunt's abstract zone plane meets real geography.
 *
 * The prototype stores each zone as an `x`/`y` pair in 0–100 space and fakes
 * coordinates by projecting that square onto a patch of Dumaguete. Real data
 * arrives as latitude/longitude, so when the API lands, `zoneToLatLng` and
 * `latLngToZone` collapse into passthroughs and everything else here still
 * holds. Nothing outside this module should hardcode a coordinate or tile URL.
 */

import type { HauntZone } from '../domain'

/**
 * Esri World Imagery, still used for the *still* pictures — the zone thumbnail on
 * the drop screen and the stand-in artwork for a haunt with no photo. The live
 * map is vector tiles now; see `lib/mapStyle.ts`.
 *
 * Free for development; check licensing before shipping.
 */
export const TILE_URL_TEMPLATE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const TILE_ATTRIBUTION = 'Tiles © Esri'

/** The prototype is set in Dumaguete City, Philippines. */
export const MAP_CENTER: [number, number] = [9.3015, 123.3054]

/*
 * Zoom levels are in the 256 px-tile scale — the one `metresPerPixel` below is
 * written in. MapLibre serves 512 px tiles and so counts one step coarser for
 * the same ground scale, which is why the map screen subtracts one on the way in
 * and adds one on the way back out. Convert at that boundary and nowhere else.
 */
/*
 * The default sits closer than it used to. The vector tiles carry no buildings
 * below their own z14, so at the old city-wide framing there was nothing to
 * extrude and the map read as a street plan; this lands on a neighbourhood, with
 * volume in it and several haunts still in frame.
 */
export const MAP_DEFAULT_ZOOM = 16
export const MAP_MIN_ZOOM = 12
export const MAP_MAX_ZOOM = 19

/**
 * How far the camera leans, and which way it faces.
 *
 * Flat-on, extruded buildings show only their roofs and the city reads as a
 * street plan. A lean puts walls on screen, which is the whole reason for
 * extruding them. The bearing is a few degrees off north so the grid doesn't
 * line up with the screen edges and look like a diagram.
 */
export const MAP_PITCH = 47
export const MAP_BEARING = -16

/**
 * Panning is fenced to the region so the faked projection stays plausible.
 *
 * Wider than the city itself on purpose: a tight fence combined with a pitched
 * camera silently forces a minimum zoom, because MapLibre keeps the bounds
 * covering a viewport that a lean makes much deeper. The framing below should be
 * a decision, not a side effect of this.
 */
export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [8.95, 122.95],
  [9.65, 123.65],
]

/** Anchor of the zone plane: where `x: 0, y: 0` lands. */
const PLANE_ORIGIN_LAT = 9.324
const PLANE_ORIGIN_LNG = 123.2914
/** Degrees per unit of zone space — roughly 38 m of latitude, 31 m of longitude. */
const PLANE_LAT_STEP = 0.00034
const PLANE_LNG_STEP = 0.00028

/** Zones stay inside these bounds so a marker never lands off the plane. */
export const ZONE_MIN = 8
export const ZONE_MAX = 92

type PlanePoint = Pick<HauntZone, 'x' | 'y'>

const clampToPlane = (value: number) => Math.max(ZONE_MIN, Math.min(ZONE_MAX, value))

export function zoneToLatLng(zone: PlanePoint): [number, number] {
  return [PLANE_ORIGIN_LAT - zone.y * PLANE_LAT_STEP, PLANE_ORIGIN_LNG + zone.x * PLANE_LNG_STEP]
}

export function latLngToZone(latitude: number, longitude: number): PlanePoint {
  return {
    x: Math.round(clampToPlane((longitude - PLANE_ORIGIN_LNG) / PLANE_LNG_STEP)),
    y: Math.round(clampToPlane((PLANE_ORIGIN_LAT - latitude) / PLANE_LAT_STEP)),
  }
}

/**
 * Where a zone draws on the map.
 *
 * Real coordinates win when the backend sent them; otherwise the zone's plane
 * position is projected onto Dumaguete. Every map surface goes through here, so
 * both backends render without knowing which one is running.
 */
export function hauntLatLng(zone: HauntZone): [number, number] {
  if (typeof zone.lat === 'number' && typeof zone.lng === 'number') {
    return [zone.lat, zone.lng]
  }
  return zoneToLatLng(zone)
}

/** Nudges a zone within the plane, for keyboard placement. */
export function nudgeZone(zone: PlanePoint, deltaX: number, deltaY: number): PlanePoint {
  return { x: clampToPlane(zone.x + deltaX), y: clampToPlane(zone.y + deltaY) }
}

/** Earth's circumference at the equator, in metres. */
const EQUATORIAL_CIRCUMFERENCE_M = 40075016.686

/**
 * Ground resolution of a 256 px web-mercator tile at a given latitude and zoom.
 *
 * A caller holding a MapLibre camera passes `map.getZoom() + 1`.
 */
export function metresPerPixel(latitudeDegrees: number, zoom: number): number {
  const radians = (latitudeDegrees * Math.PI) / 180
  return (EQUATORIAL_CIRCUMFERENCE_M * Math.cos(radians)) / Math.pow(2, zoom + 8)
}

/** Renders a zone's diameter in screen pixels, clamped to stay legible. */
export function zoneDiameterPx(
  radiusM: number,
  latitudeDegrees: number,
  zoom: number,
  { min, max }: { min: number; max: number },
): number {
  const diameter = (radiusM * 2) / metresPerPixel(latitudeDegrees, zoom)
  return Math.max(min, Math.min(max, diameter))
}

/** Fixed zoom level of the still tile used as stand-in artwork. */
const PREVIEW_TILE_ZOOM = 15
const PREVIEW_TILE_ORIGIN_X = 27604
const PREVIEW_TILE_ORIGIN_Y = 15527
const PREVIEW_TILE_SPAN_X = 7
const PREVIEW_TILE_SPAN_Y = 10

/**
 * A single satellite tile near the zone, used as placeholder artwork for haunts
 * with no photo. Replace with a real thumbnail once media lives in storage.
 */
export function zonePreviewTileUrl(zone: PlanePoint): string {
  const tileX = PREVIEW_TILE_ORIGIN_X + Math.round((zone.x / 100) * PREVIEW_TILE_SPAN_X)
  const tileY = PREVIEW_TILE_ORIGIN_Y + Math.round((zone.y / 100) * PREVIEW_TILE_SPAN_Y)
  return TILE_URL_TEMPLATE.replace('{z}', String(PREVIEW_TILE_ZOOM))
    .replace('{y}', String(tileY))
    .replace('{x}', String(tileX))
}
