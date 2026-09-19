# Design QA — shrouded fields and live Dumaguete map

## Comparison target

- Source visual truth: `/Users/kenanaiahjo/Haunt/.design-qa/haunt-shader-ui-final.jpg` (the preceding spiral treatment).
- Browser-rendered implementation: `/Users/kenanaiahjo/Haunt/.design-qa/haunt-cloud-map-final.jpg`.
- Side-by-side evidence: `/Users/kenanaiahjo/Haunt/.design-qa/spiral-vs-cloud-map.jpg`.
- Browser viewport and app CSS size: 388 × 734 CSS px at device scale factor 1.
- Source and implementation pixels: 388 × 734 each. Composite pixels: 840 × 790.
- Density normalization: both app captures use identical pixel and CSS dimensions and are shown at identical scale.
- State: Dumaguete discovery map, nearby sheet resting, notification banner dismissed.

## Full-view comparison evidence

The implementation removes the readable vortex/spiral silhouette. Haunted places now appear as irregular, overlapping pockets of cool smoke with soft cores, domain-warped edges, slow lateral drift, and animated grain. The background is no longer a manually transformed tile mosaic: it is a Leaflet map centered on real Dumaguete coordinates with live Esri satellite tiles and geographic marker projection.

## Focused region evidence

The location picker was exercised separately at Drop a Haunt step 3. It uses the same Leaflet tile source, supports native drag, tap-to-place, wheel/pinch zoom, explicit zoom buttons, keyboard movement, live radius projection, and the shrouded shader marker. A separate crop was not required because the picker filled the main content width and its marker, radius, controls, and tile detail were directly readable in the browser capture.

## Required fidelity surfaces

- **Fonts and typography:** the established SF Pro-style display/text hierarchy remains intact and labels do not revert to italics.
- **Spacing and layout rhythm:** the live map fills the same viewport, fixed controls clear the 142 px sheet reveal, labels remain legible, and all six initial zones fit the visible Dumaguete frame.
- **Colors and visual tokens:** satellite imagery stays dark, desaturated, and high-contrast. Cloud fields use smoke gray and cool silver without a bright circular rim.
- **Image quality and map fidelity:** Esri tiles load through Leaflet at the current zoom instead of being hard-coded to a fixed grid. Tile loading, live reprojection, and recenter were observed in-browser.
- **Shader fidelity:** the fragment shader contains no polar angle, logarithmic curl, sinusoidal arm, or rotation logic. Five-octave FBM noise is domain-warped into broad cloud, veil, and vapor layers with transparent irregular falloff.
- **Copy and content:** Dumaguete attribution is visible and existing haunt names remain unchanged.
- **Accessibility:** map and picker expose descriptive labels; the picker retains arrow-key placement; reduced-motion users receive a static shader frame.

## Findings

No actionable P0, P1, or P2 issue remains for the requested change.

## Comparison history

### Pass 1

- **[P1] Haunted fields still read as spirals.** Removed all polar and arm-generation math and replaced it with drifting domain-warped cloud layers. Post-fix evidence: `spiral-vs-cloud-map.jpg`.
- **[P1] The map looked interactive but used a fixed stitched tile surface and custom projection math.** Replaced it with Leaflet 1.9.4, live Esri tiles, real lat/lng projection, native map gestures, and geographic marker anchoring. The same engine now powers the drop-location picker.
- **[P2] Unbounded native inertia could fling the view far from Dumaguete during a very fast gesture.** Added capped inertia, geographic bounds, and a working recenter control.

### Pass 2

- Six live tiles/markers rendered without errors in the resting map state. Pan changed projected marker positions, zoom reprojected them, and every shader wrapper remained exactly 76 × 76 CSS px. The picker accepted a new location, kept its marker fixed-size, and centered the selection during explicit zoom.

## Interaction verification

- Native pointer drag and inertial pan.
- Wheel/button zoom and marker reprojection.
- Recenter to Dumaguete.
- Fixed-size 76 × 76 shader fields through zoom.
- Drop-location map drag, tap placement, zoom, projected privacy radius, and keyboard controls.
- Nearby sheet and Map/Profile navigation retained.
- Console errors checked: none.
- TypeScript project check: passed.
- Vite production build: passed.

## Open questions

- None blocking.

final result: passed
# Design QA — Neighborhoods-inspired map pass (2026-09-19)

## Comparison target

- Source visual truth: [Cam Worboys' Neighborhoods map update](https://x.com/camworboys/status/2101000329647227078), inspected in Chrome from the linked post's embedded video frame.
- Browser-rendered implementation: `http://localhost:5173/`, rendered in the Codex in-app browser at 393 × 852 CSS px, device scale factor 1.
- State: Dumaguete discovery map, nearby sheet resting with the compact featured haunt card visible.
- Density normalization: the source is a video reference rather than a pixel-matched mock; comparison was made against the phone UI's visible map composition and controls, not the surrounding X chrome.

## Full-view comparison evidence

The map now follows the reference's main visual cues: charcoal local basemap, visible neighborhood road/building density, restrained place labels, a soft edge falloff, and a low rounded result surface. Haunt's fog fields, attribution, location prompt, navigation rail, and map controls remain product-specific so the redesign does not erase the app's core meaning.

## Focused region comparison evidence

- Map surface: local road lines and place labels remain readable under the dark treatment; the fog field still dominates as the primary Haunt marker.
- Bottom surface: the resting state now exposes a compact `sealed nearby` place card, closer to the reference's selected-place card, while the existing full nearby list remains available by dragging or tapping the sheet.

## Required fidelity surfaces

- **Fonts and typography:** existing SF Pro-style display/text hierarchy is preserved; the new card uses the same small uppercase eyebrow, compact title, and mono distance treatment already used by the app.
- **Spacing and layout rhythm:** map controls continue to clear the sheet; the resting sheet peek increased from 142 px to 188 px so the featured card is visible without opening the list.
- **Colors and visual tokens:** basemap colors are warmer charcoal/graphite and road/building layers are lifted enough to match the reference's readable dark map; overlays remain muted.
- **Image quality and asset fidelity:** no new raster assets were needed; the map continues to use live vector tiles and existing haunt artwork previews. Icons continue to use the app's established Lucide set.
- **Copy and content:** existing Haunt copy and place names are unchanged; the new label is `sealed nearby` to connect the reference's local-place treatment to Haunt's sealed-note mechanic.

## Findings

No actionable P0, P1, or P2 issue remains for this adaptation. A P3 difference remains intentionally: the source has category-specific merchant pins and a merchant photo card, while Haunt retains fog zones and haunt artwork because exact-place privacy and sealed notes are core product behavior.

## Interaction verification

- Tapped the resting nearby sheet to expand the full list.
- Opened a haunt from the nearby list and returned to the map.
- Verified the compact featured card is exposed in the resting state.
- TypeScript project check and Vite production build passed.
- Browser console inspection was not available through the in-app browser surface; no runtime error was visible in the rendered state.

final result: passed
