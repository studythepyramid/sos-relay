# Browser map dependencies

- MapLibre GL JS **5.24.0**, BSD-3-Clause and bundled dependency notices:
  `maplibre-gl.js`, `maplibre-gl.css`, `MAPLIBRE-LICENSE.txt`.
  Source: https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.24.0.tgz
- MapLibre GL Leaflet adapter **0.1.3**, ISC:
  `leaflet-maplibre-gl.js`, `LEAFLET-ADAPTER-LICENSE`.
  Source: https://registry.npmjs.org/@maplibre/maplibre-gl-leaflet/-/maplibre-gl-leaflet-0.1.3.tgz

These pinned browser distributions are served locally; there is no runtime npm
or JavaScript CDN dependency. The adapter supports Leaflet 1.9 and MapLibre 5.
`english-basemap.js` fetches the OpenFreeMap Positron style and requests English
name fields, falling back to Latin-script and local names. Road reference shields
remain unchanged. OpenFreeMap hosts the tiles, fonts and sprites; attribution is
visible in Leaflet. No account or API key is required.
