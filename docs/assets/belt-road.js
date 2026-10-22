/* One public map/list; evidence status remains attached to every source record. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const warning = 'Source-reported information. Please check the facts yourself; locations may be approximate.';
  const uncertain = item => item.source_classification !== 'documented' || !item.location;
  const skull = '<svg aria-hidden="true" viewBox="0 0 24 24"><use href="../assets/icons/lucide.svg#skull"></use></svg>';
  let map, layers, cases = [], filtered = [], selectedId = null;
  let loading = false;
  let selectedArea = null;
  let hasMore = false;
  const markers = new Map();
  const world = () => { if (map) map.setView([18, 20], 2, { animate: false }); };
  if (window.L) {
    map = L.map('belt-map', { worldCopyJump: true, minZoom: 2, maxZoom: 16,
      maxBounds: [[-85, -Infinity], [85, Infinity]], maxBoundsViscosity: 1 });
    world();
    layers = L.layerGroup().addTo(map);
    addEnglishBasemap(map, message => { $('tile-status').textContent = message; });
  } else {
    $('tile-status').textContent = 'Map unavailable. Read the reports and sources below.';
    $('world-view').disabled = true;
    $('fit-reports').disabled = true;
  }
  function locationBounds(item) {
    return L.latLng(item.location.latitude, item.location.longitude).toBounds(item.location.radius_m * 2);
  }
  function locationLabel(item) {
    if (!item.location) return 'Location not yet placed';
    return item.location.precision === 'region' ? 'Approximate area · not an exact building' : 'Reported site · see location source';
  }
  function setUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('case', id); else url.searchParams.delete('case');
    history.replaceState(null, '', url);
  }
  function showCase(item, { focus = false, pan = true } = {}) {
    selectedId = item.id;
    setUrl(item.id);
    renderList();
    const detail = $('case-detail');
    detail.replaceChildren();
    detail.dataset.contentId = `belt-road:${item.id}`;
    const actions = make('div', undefined, 'detail-actions');
    const close = make('button', 'Close report'); close.type = 'button';
    close.addEventListener('click', () => {
      selectedId = null; setUrl(null); detail.hidden = true;
      if (map) map.closePopup();
      if (selectedArea) { selectedArea.remove(); selectedArea = null; }
      renderList();
      const button = document.querySelector('#case-list button'); if (button) button.focus();
    });
    actions.append(close, make('span', `Source date ${item.reported_on}`));
    const title = make('h2', item.title); title.id = 'case-title';
    detail.append(actions, title, make('p', warning), make('p', item.summary));
    if (item.communication) detail.append(make('p', item.communication));
    if (item.current_status) detail.append(make('p', item.current_status));
    detail.append(make('h3', 'Location'), make('p', `${item.location?.label || item.title}. ${locationLabel(item)}.`));
    const sources = make('details'); sources.open = true;
    const uniqueSources = new Map();
    for (const source of item.sources) {
      if (!uniqueSources.has(source.url)) uniqueSources.set(source.url, { ...source, statements: [] });
      uniqueSources.get(source.url).statements.push(source.supports);
    }
    sources.append(make('summary', `Sources (${uniqueSources.size})`));
    const list = make('ol', undefined, 'sources');
    for (const source of uniqueSources.values()) {
      const li = make('li'); const link = make('a', source.publisher);
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      li.append(link, make('small', `${source.title} · ${source.published_on}`), make('p', [...new Set(source.statements)].join(' ')));
      list.append(li);
    }
    sources.append(list);
    const precision = make('details'); precision.append(make('summary', 'Location & collection details'));
    precision.append(make('p', item.location?.basis || 'Report retained; no map position has been assigned.'), make('p', `Source classification: ${item.source_classification}. SOS Relay links the source and does not independently certify its claims.`));
    const share = make('button', 'Copy report link'); share.type = 'button';
    share.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); share.textContent = 'Link copied'; }
      catch { share.textContent = 'Copy the URL from your address bar'; }
    });
    detail.append(sources, precision, share); detail.hidden = false;
    if (selectedArea) { selectedArea.remove(); selectedArea = null; }
    if (map && item.location) {
      selectedArea = L.circle([item.location.latitude, item.location.longitude], {radius: item.location.radius_m,
        color: '#8a382d', weight: 1, dashArray: '4 5', fillOpacity: .06}).addTo(map);
    }
    if (map && pan && item.location) {
      // A regional report must not zoom to an apparent building location.
      map.fitBounds(locationBounds(item), { padding: [30, 30], maxZoom: item.location.precision === 'region' ? 9 : 15, animate: false });
      const marker = markers.get(item.id); if (marker) marker.openPopup();
    }
    if (focus) { detail.focus({ preventScroll: true }); detail.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
  }
  function renderList() {
    const list = $('case-list'); list.replaceChildren();
    for (const item of filtered) {
      const li = make('li', undefined, item.id === selectedId ? 'selected' : '');
      const button = make('button', item.title, 'case-link'); button.type = 'button';
      button.addEventListener('click', () => showCase(item, { focus: true }));
      li.append(make('p', `${item.country} · ${item.reported_on}`, 'case-meta'), button,
        make('span', `${uncertain(item) ? '? Unverified · ' : ''}${!item.location ? 'Location not yet placed · ' : ''}Source: ${[...new Set(item.sources.map(source => source.publisher))].join(', ')}`, 'record-status'));
      list.append(li);
    }
    $('case-count').textContent = String(filtered.length);
  }
  function fitReports(items = filtered) {
    items = items.filter(item => item.location);
    if (!map || !items.length) return;
    const bounds = L.latLngBounds([]);
    for (const item of items) bounds.extend(locationBounds(item));
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 9, animate: false });
  }
  function renderMap() {
    markers.clear(); if (!map) return;
    layers.clearLayers();
    for (const item of filtered) {
      if (!item.location) continue;
      const question = uncertain(item);
      const marker = L.marker([item.location.latitude, item.location.longitude], {
        icon: L.divIcon({className: question ? 'question-marker' : 'skull-marker', html: question ? '<span aria-hidden="true">?</span>' : skull, iconSize: [22, 22], iconAnchor: [11, 11]}),
        title: `${question ? 'Unverified report: ' : ''}${item.title}. ${item.source_classification} by source. ${locationLabel(item)}`, keyboard: true
      }).addTo(layers);
      const popup = make('div');
      const button = make('button', item.title); button.type = 'button';
      button.addEventListener('click', () => showCase(item, {focus: true}));
      const sourceLine = make('p', 'Source: ');
      const source = item.sources[0];
      const sourceLink = make('a', source.publisher + (item.source_classification === 'suspected' ? ' (suspected by source)' : ''));
      sourceLink.href = source.url; sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer';
      sourceLine.append(sourceLink);
      popup.append(button, sourceLine, make('small', question ? 'Unverified report. Please check the linked sources.' : `Warning: ${warning}`));
      marker.bindPopup(popup, {maxWidth: 240, autoPanPadding: [15, 15]});
      marker.on('click', () => showCase(item, {pan: false}));
      markers.set(item.id, marker);
    }
  }
  function filter() {
    const query = $('case-search').value.trim().toLocaleLowerCase();
    filtered = cases.filter(item => `${item.title} ${item.country} ${item.location?.label || 'location unknown'} ${item.source_classification} by source ${item.sources.map(source => source.publisher).join(' ')}`.toLocaleLowerCase().includes(query));
    if (selectedId && !filtered.some(item => item.id === selectedId)) {
      selectedId = null; $('case-detail').hidden = true; setUrl(null);
      if (selectedArea) { selectedArea.remove(); selectedArea = null; }
      if (map) map.closePopup();
    }
    renderList(); renderMap();
    const notes = [];
    if (hasMore) notes.push('Showing the first 500 records. Search applies to this loaded set.');
    if (!filtered.length) notes.push(query ? 'No matching locations.' : 'No locations loaded.');
    $('data-status').textContent = notes.join(' ');
  }
  async function load() {
    if (loading) return; loading = true;
    $('data-status').textContent = 'Loading locations…'; $('retry-data').hidden = true;
    const previousId = selectedId || new URL(location.href).searchParams.get('case');
    try {
      const response = await fetch('/api/belt-road/locations', {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Locations unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.locations)) throw new Error('Unsupported records');
      cases = data.locations;
      cases.sort((a, b) => a.country.localeCompare(b.country) || a.title.localeCompare(b.title, 'en', {numeric: true}));
      hasMore = data.has_more === true;
      const documented = cases.filter(item => item.source_classification === 'documented').length;
      const questions = cases.filter(uncertain).length;
      const unplaced = cases.filter(item => !item.location).length;
      $('crawler-summary').textContent = `Source records ${cases.length} · ${documented} documented by source · ${questions} unverified · ${unplaced} not yet placed${hasMore ? ' · showing first 500' : ''}`;
      $('updated-label').textContent = data.generated_at ? `Updated ${data.generated_at.slice(0, 10)}` : '';
      $('collection-note').textContent = 'OpenFreeMap supplies OpenStreetMap-based tiles and receives your network address and viewed map areas. English names are preferred, with Latin-script or local-name fallbacks.';
      filter();
      const selected = cases.find(item => item.id === previousId && filtered.some(row => row.id === item.id));
      if (selected) showCase(selected);
      else if (previousId) $('data-status').textContent = 'This location is unavailable in the current collection.';
      else if (cases.length && !selectedId) fitReports();
    } catch {
      $('data-status').textContent = 'Could not refresh locations. Retry when the connection is available.';
      $('crawler-summary').textContent = 'Source records could not be refreshed.';
      $('retry-data').hidden = false;
    } finally { loading = false; }
  }
  $('case-search').addEventListener('input', filter);
  $('world-view').addEventListener('click', world);
  $('fit-reports').addEventListener('click', () => fitReports());
  if (map) map.on('zoomend', () => {
    renderMap();
    if (selectedId && markers.has(selectedId)) markers.get(selectedId).openPopup();
  });
  $('retry-data').addEventListener('click', load);
  load();
})();
