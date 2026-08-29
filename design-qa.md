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
