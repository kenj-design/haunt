/**
 * Haunt's basemap, written rather than borrowed.
 *
 * Vector tiles come from OpenFreeMap, which serves the OpenMapTiles schema of
 * the whole planet with no key and no quota — hence the familiar layer names
 * below. Everything drawn on top of them is ours, in the app's own tokens, so
 * the map speaks the same language as the rest of the screen instead of
 * importing a second one.
 *
 * Two deliberate absences. There are no labels: the only words on this map are
 * the names of haunts, and a basemap arguing with them would be noise. And there
 * is no sprite or glyph URL, which is also why no layer here may be a `symbol` —
 * MapLibre would fail loudly looking for fonts that were never declared.
 *
 * Buildings are extruded, because a place reads as a place when it has volume.
 * Where OSM knows a height we use it; where it doesn't — which is most of
 * Dumaguete — each building gets a low, stable, slightly varied one derived from
 * its own id, so a street looks like a street rather than one poured slab.
 */
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

/** TileJSON for the planet. Free, keyless, and self-hostable if it ever isn't. */
export const MAP_TILES_URL = 'https://tiles.openfreemap.org/planet'
export const MAP_ATTRIBUTION = '© OpenStreetMap'

const SOURCE = 'basemap'

/* Ground up: land, water, green, tarmac, walls.
   Dark, but not black — the first pass was so close to #000 that the whole city
   was invisible. These sit just far enough apart to read as a place while still
   letting everything drawn on top of them dominate. */
const LAND = '#111214'
const WATER = '#17191c'
const WATER_EDGE = '#2a2c31'
const GREEN = '#151816'
const SAND = '#1a1a1d'
const ROAD = '#414348'
const ROAD_QUIET = '#292b30'
const RAIL = '#34363b'
const WALL = '#292b30'

/** Real height when OSM has one, a plausible one when it doesn't. */
const BUILDING_HEIGHT: ExpressionSpecification = [
  'case',
  ['has', 'render_height'],
  ['get', 'render_height'],
  ['+', 6, ['*', 3.5, ['%', ['to-number', ['coalesce', ['id'], 3]], 4]]],
]

export function hauntMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    /* Low, from the side the camera faces, so the extrusions shade rather than
       glow. `fill-extrusion-vertical-gradient` does the rest. */
    light: { anchor: 'viewport', color: '#c9d6e4', intensity: 0.22, position: [1.4, 200, 38] },
    sources: {
      [SOURCE]: { type: 'vector', url: MAP_TILES_URL, attribution: MAP_ATTRIBUTION },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': LAND } },

      {
        id: 'green',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'scrub', 'farmland']]],
        paint: { 'fill-color': GREEN },
      },
      {
        id: 'sand',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'sand'],
        paint: { 'fill-color': SAND },
      },
      {
        id: 'park',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'park',
        paint: { 'fill-color': GREEN, 'fill-opacity': 0.8 },
      },

      {
        id: 'water',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'water',
        filter: ['!=', ['get', 'intermittent'], 1],
        paint: { 'fill-color': WATER },
      },
      {
        /* A hairline where land meets water — the one edge worth seeing in the
           dark, since the whole city is arranged along it. */
        id: 'shore',
        type: 'line',
        source: SOURCE,
        'source-layer': 'water',
        paint: {
          'line-color': WATER_EDGE,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 16, 1.4],
        },
      },
      {
        id: 'waterway',
        type: 'line',
        source: SOURCE,
        'source-layer': 'waterway',
        paint: {
          'line-color': WATER,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 4],
        },
      },

      {
        id: 'road-quiet',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track']]],
        paint: {
          'line-color': ROAD_QUIET,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 17, 3, 19, 7],
        },
      },
      {
        id: 'road',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'secondary', 'primary']]],
        paint: {
          'line-color': ROAD,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 2.4, 19, 10],
        },
      },
      {
        id: 'road-main',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        paint: {
          'line-color': ROAD,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 15, 3.4, 19, 13],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': RAIL, 'line-width': 0.7 },
      },

      /* A sparse local label layer makes the map feel inhabited without
         competing with Haunt's own names. OpenFreeMap exposes the standard
         OpenMapTiles transportation_name layer, so labels stay vector-sharp
         while the camera moves. */
      {
        id: 'road-labels',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 8, 17, 10],
          'text-max-angle': 35,
          'text-padding': 8,
        },
        paint: {
          'text-color': '#8b8d92',
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.35, 16, 0.58, 18, 0.72],
          'text-halo-color': '#111214',
          'text-halo-width': 1.2,
          'text-halo-blur': 0.5,
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'place',
        minzoom: 11,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 16, 11.5],
          'text-letter-spacing': 0.03,
          'text-padding': 8,
        },
        paint: {
          'text-color': '#a4a6ab',
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.14, 14, 0.3, 17, 0.52],
          'text-halo-color': '#111214',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.6,
        },
      },

      {
        id: 'buildings',
        type: 'fill-extrusion',
        source: SOURCE,
        'source-layer': 'building',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': WALL,
          'fill-extrusion-height': BUILDING_HEIGHT,
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          /* Fades the whole layer in rather than having a city appear at once. */
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.35, 15.5, 0.95],
          'fill-extrusion-vertical-gradient': true,
        },
      },
    ],
  }
}
