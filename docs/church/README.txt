# Church Building — study 01

An original, procedural stone chapel for SOS Relay. Open `index.html`
through an HTTP server; ES modules do not work reliably from `file://`.

## Use

- Drag to orbit, right-drag to pan, scroll to change distance.
- Touch: one finger orbits; two fingers pan or pinch to zoom.
- Focus the model and use arrow keys to pan.
- Select Exterior, Entrance, Central aisle, Reading alcove, or Open plan.
- Toggle the roof, front/right walls, or slow orbit. Reset restores the
  exterior camera. Reduced-motion preferences disable camera animation.

This is an editable architectural prototype, not a surveyed building.
The camera has no collision detection; it may pass through surfaces.
The books are visual placeholders and do not yet open documents.

## Project structure

- `church.js`: geometry, materials, named library bays, camera presets.
- `church.css`: responsive controls and viewport layout.
- `vendor/`: unmodified Three.js 0.180.0 modules and MIT license,
  downloaded from the version-pinned package on unpkg.com.
- No remote assets, analytics, APIs, or model service is used at runtime.

The project is copied by the existing MkDocs build as static files.
The homepage link is in the root `za-index.md`. No Caddy change is needed
for the planned `/church/` route under the existing static-site root.

## Future document shelves

Each shelf group has a stable name and an empty `userData.documents`
array. A next iteration can use a separate catalog with document id,
title, language, URL, shelf id, and position. Raycasting can select a book
and open a readable document panel. Also provide a normal HTML document
list for keyboard users and devices without WebGL. Keep the document
content outside the 3D geometry so updates do not require rebuilding it.

## Where to get a more detailed model

References checked on 2026-10-26. No third-party model is included here.

- [Church by Tiago Lopes](https://sketchfab.com/3d-models/church-867a847b67364484bf44912e1af190af)
  is presented as a downloadable church with interior and exterior.
  Inspect its current download options and license before selecting it.
- [Church by Kornelija Vitkauskaite](https://sketchfab.com/3d-models/church-34df848e1555415586af9ac90ecfbcdb)
  lists roughly 70,600 triangles and a Creative Commons Attribution
  license. It is a candidate to inspect, not an asset already audited
  or integrated into this project.
- [St Peter's Church Ugborough Interior](https://sketchfab.com/3d-models/st-peters-church-ugborough-interior-f1880eff7acc4dc7b48a8c6680406210)
  by artfletch is a detailed photogrammetry example with about 2.5
  million triangles and a Creative Commons Attribution license. Such a
  scan would need optimization for this lightweight browser viewer.
- [Poly Haven](https://polyhaven.com/) provides models, textures, and
  lighting assets under [CC0](https://polyhaven.com/license). It is a
  useful source for stone, wood, furniture, and lighting; this does not
  imply that a complete suitable church model is available there.

For any imported model, check interior coverage, scale, polygon count,
texture size, missing surfaces, and license requirements. Retain the
creator's name, source link, license and modification notes when needed.
Prefer an optimized GLB/glTF asset for the web. Three.js provides
[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader) for a later import
path; it is not included in this prototype.

## Model or pictures?

For a flexible document library, start with editable geometry, as this
prototype does. Pictures can guide the style, proportions, windows and
materials. One photograph does not describe the unseen walls or interior.

For a particular real church, use multiple overlapping photographs and
measurements, or an existing scan. Photogrammetry is a separate capture,
reconstruction and cleanup task; the Ugborough model's source page
illustrates the amount of photography involved. An exterior-only scan
will not supply a usable interior. A photo-to-3D service may produce a
visual approximation, but its interior and geometry still need checking.
