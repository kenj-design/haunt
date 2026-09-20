/**
 * The one place that knows how Haunt's abstract zone plane meets real geography.
 *
 * The prototype stores each zone as an `x`/`y` pair in 0–100 space. Real data
 * arrives as latitude/longitude, while mock data is projected around the
 * viewer's position (Dumaguete remains the no-permission fallback). Nothing
 * outside this module should hardcode a coordinate or tile URL.
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

export interface UserLocation {
  lat: number
  lng: number
  accuracyM?: number
}

/**
 * Reads the browser's position without turning permission into a boot-time
 * surprise. Callers decide when the explanation and CTA have been shown.
 */
export function requestUserLocation(options: PositionOptions): Promise<UserLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : undefined,
        }),
      () => resolve(null),
      options,
    )
  })
}

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

export function zoneToLatLng(zone: PlanePoint, around?: [number, number]): [number, number] {
  if (around) {
    return [around[0] + (50 - zone.y) * PLANE_LAT_STEP, around[1] + (zone.x - 50) * PLANE_LNG_STEP]
  }
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
export function hauntLatLng(zone: HauntZone, around?: [number, number]): [number, number] {
  if (typeof zone.lat === 'number' && typeof zone.lng === 'number') {
    return [zone.lat, zone.lng]
  }
  return zoneToLatLng(zone, around)
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

/**
 * WGS84 direct geodesic calculation.
 *
 * This answers the useful map question precisely: starting at this latitude
 * and longitude, where do we land after travelling `distanceM` metres on a
 * given bearing? A spherical approximation is close at city scale, but this
 * keeps the radius honest on the ellipsoid used by PostGIS geography.
 */
function wgs84Destination(
  latitude: number,
  longitude: number,
  bearing: number,
  distanceM: number,
): [number, number] {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const toDegrees = (radians: number) => (radians * 180) / Math.PI
  const normalizeLongitude = (degrees: number) => ((degrees + 540) % 360) - 180

  const a = 6378137
  const f = 1 / 298.257223563
  const b = (1 - f) * a
  const phi1 = toRadians(latitude)
  const lambda1 = toRadians(longitude)
  const alpha1 = toRadians(bearing)
  const sinAlpha1 = Math.sin(alpha1)
  const cosAlpha1 = Math.cos(alpha1)
  const tanU1 = (1 - f) * Math.tan(phi1)
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1)
  const sinU1 = tanU1 * cosU1
  const sigma1 = Math.atan2(tanU1, cosAlpha1)
  const sinAlpha = cosU1 * sinAlpha1
  const cosSqAlpha = 1 - sinAlpha * sinAlpha
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const coefficientA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const coefficientB =
    (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))

  const baseSigma = distanceM / (b * coefficientA)
  let sigma = baseSigma
  let previousSigma = Number.POSITIVE_INFINITY
  let sinSigma = 0
  let cosSigma = 1
  let cosTwoSigmaM = 0

  // Vincenty's iteration converges quickly for the short city-scale radii
  // Haunt uses. The cap keeps malformed input from blocking map rendering.
  for (let iteration = 0; iteration < 32 && Math.abs(sigma - previousSigma) > 1e-12; iteration += 1) {
    cosTwoSigmaM = Math.cos(2 * sigma1 + sigma)
    sinSigma = Math.sin(sigma)
    cosSigma = Math.cos(sigma)
    const deltaSigma =
      coefficientB *
      sinSigma *
      (cosTwoSigmaM +
        (coefficientB / 4) *
          (cosSigma * (-1 + 2 * cosTwoSigmaM * cosTwoSigmaM) -
            (coefficientB / 6) *
              cosTwoSigmaM *
                (-3 + 4 * sinSigma * sinSigma) *
                (-3 + 4 * cosTwoSigmaM * cosTwoSigmaM)))
    previousSigma = sigma
    sigma = baseSigma + deltaSigma
  }

  // A spherical fallback is safer than returning NaN if an unexpected
  // antipodal input ever prevents the ellipsoidal iteration from converging.
  if (!Number.isFinite(sigma) || !Number.isFinite(sinSigma) || Math.abs(sigma - previousSigma) > 1e-10) {
    const angularDistance = distanceM / 6371008.8
    const fallbackLatitude = Math.asin(
      Math.sin(phi1) * Math.cos(angularDistance) +
        Math.cos(phi1) * Math.sin(angularDistance) * cosAlpha1,
    )
    const fallbackLongitude =
      lambda1 +
      Math.atan2(
        sinAlpha1 * Math.sin(angularDistance) * Math.cos(phi1),
        Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(fallbackLatitude),
      )
    return [toDegrees(fallbackLatitude), normalizeLongitude(toDegrees(fallbackLongitude))]
  }

  const temporary = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1
  const phi2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + temporary * temporary),
  )
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1,
  )
  const coefficientC = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
  const longitudeCorrection =
    lambda -
    (1 - coefficientC) *
      f *
      sinAlpha *
      (sigma +
        coefficientC *
          sinSigma *
          (cosTwoSigmaM + coefficientC * cosSigma * (-1 + 2 * cosTwoSigmaM * cosTwoSigmaM)))

  return [toDegrees(phi2), normalizeLongitude(toDegrees(lambda1 + longitudeCorrection))]
}

/**
 * Returns a closed WGS84 geodesic circle in MapLibre's [longitude, latitude]
 * coordinate order. The polygon follows the actual radius instead of a
 * screen-space ellipse or a four-point approximation.
 */
export function geodesicCircle(
  center: [number, number],
  radiusM: number,
  segments = 128,
): [number, number][][] {
  const [latitude, longitude] = center
  const safeRadius = Math.max(0, Number.isFinite(radiusM) ? radiusM : 0)
  const safeSegments = Math.max(32, Math.floor(segments))
  const ring = Array.from({ length: safeSegments }, (_, index) => {
    const [nextLatitude, nextLongitude] = wgs84Destination(
      latitude,
      longitude,
      (index / safeSegments) * 360,
      safeRadius,
    )
    return [nextLongitude, nextLatitude] as [number, number]
  })
  ring.push(ring[0])
  return [ring]
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

/**
 * A single satellite tile near the zone, used as placeholder artwork for haunts
 * with no photo. Replace with a real thumbnail once media lives in storage.
 */
export function zonePreviewTileUrl(
  zone: Pick<HauntZone, 'x' | 'y' | 'lat' | 'lng'>,
  around?: [number, number],
): string {
  const coordinates =
    typeof zone.lat === 'number' && typeof zone.lng === 'number'
      ? [zone.lat, zone.lng] as [number, number]
      : zoneToLatLng(zone, around)
  const [latitude, longitude] = coordinates
  const worldTiles = 2 ** PREVIEW_TILE_ZOOM
  const tileX = Math.floor(((longitude + 180) / 360) * worldTiles)
  const latitudeRadians = (latitude * Math.PI) / 180
  const tileY = Math.floor(
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * worldTiles,
  )
  return TILE_URL_TEMPLATE.replace('{z}', String(PREVIEW_TILE_ZOOM))
    .replace('{y}', String(tileY))
    .replace('{x}', String(tileX))
}
