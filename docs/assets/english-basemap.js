/* English-first OpenMapTiles labels; Leaflet continues to own interaction. */
function englishBasemapStyle(style) {
  for (const layer of style.layers) {
    const field = layer.layout && layer.layout['text-field'];
    if (field && JSON.stringify(field).includes('name')) {
      layer.layout['text-field'] = ['coalesce', ['get', 'name:en'], ['get', 'name_en'],
        ['get', 'name:latin'], ['get', 'name'], ''];
    }
  }
  return style;
}

async function addEnglishBasemap(map, status) {
  let layer, fallback = false;
  const container = map.getContainer();
  const standardMap = () => {
    if (fallback) return;
    fallback = true;
    if (layer) map.removeLayer(layer);
    container.dataset.labelLanguage = 'local-fallback';
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    status('English basemap unavailable. Standard map labels shown; sources still work.');
  };
  try {
    status('Loading English map…');
    if (!window.maplibregl || !L.maplibreGL) throw new Error('Vector renderer unavailable');
    const response = await fetch('https://tiles.openfreemap.org/styles/positron', {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Style unavailable');
    const style = englishBasemapStyle(await response.json());
    layer = L.maplibreGL({style, attributionControl: {customAttribution:
      '<a href="https://openfreemap.org/">OpenFreeMap</a> · &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}}).addTo(map);
    const vectorMap = layer.getMaplibreMap();
    vectorMap.on('load', () => {
      if (fallback) return;
      container.dataset.labelLanguage = 'en';
      status('English labels · select a skull for sources.');
    });
    vectorMap.on('error', () => {
      if (!fallback) status('Some map content unavailable. Location records and sources still work.');
    });
    vectorMap.getCanvas().addEventListener('webglcontextlost', standardMap, {once: true});
  } catch { standardMap(); }
}
