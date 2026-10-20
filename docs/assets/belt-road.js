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
  const skull = '<svg aria-hidden="true" viewBox="0 0 24 24"><use href="../assets/icons/lucide.svg#skull"></use></svg>';
  let map, layers, cases = [], filtered = [], selectedId = null;
  let loading = false;
  let selectedArea = null;
  let loadErrors = [];
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
    detail.append(actions, title, make('span', item.evidence_status, 'status-tag'), make('p', item.summary));
    detail.append(make('h3', 'Evidence'), make('p', item.communication), make('p', item.current_status));
    detail.append(make('h3', 'Location'), make('p', `${item.location.label}. ${locationLabel(item)}.`));
    detail.append(make('h3', 'Belt & Road relationship'), make('p', item.belt_road_status));
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
    precision.append(make('p', item.location.basis), make('p', `Collection: ${item.collection_method === 'crawler' ? 'crawler import' : 'manually checked source seed'}. ${item.reviewed_at ? 'Reviewed ' + item.reviewed_at.slice(0, 10) + '.' : 'Awaiting SOS Relay review.'} Publication status is separate from proof of the underlying claim.`));
    const share = make('button', 'Copy report link'); share.type = 'button';
    share.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); share.textContent = 'Link copied'; }
      catch { share.textContent = 'Copy the URL from your address bar'; }
    });
    detail.append(sources, precision, share); detail.hidden = false;
    if (map) {
      if (selectedArea) selectedArea.remove();
      selectedArea = L.circle([item.location.latitude, item.location.longitude], {radius: item.location.radius_m,
        color: '#8a382d', weight: 1, dashArray: '4 5', fillOpacity: .06}).addTo(map);
    }
    if (map && pan) {
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
        make('span', item.evidence_status, 'record-status'));
      list.append(li);
    }
    $('case-count').textContent = String(filtered.length);
  }
  function fitReports(items = filtered) {
    if (!map || !items.length) return;
    const bounds = L.latLngBounds([]);
    for (const item of items) bounds.extend(locationBounds(item));
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 9, animate: false });
  }
  function renderMap() {
    markers.clear(); if (!map) return;
    layers.clearLayers();
    for (const item of filtered) {
      const marker = L.marker([item.location.latitude, item.location.longitude], {
        icon: L.divIcon({className: 'skull-marker', html: skull, iconSize: [22, 22], iconAnchor: [11, 11]}),
        title: `${item.title}. ${item.evidence_status}. ${locationLabel(item)}`, keyboard: true
      }).addTo(layers);
      const popup = make('div');
      const button = make('button', item.title); button.type = 'button';
      button.addEventListener('click', () => showCase(item, {focus: true}));
      popup.append(button, make('p', item.evidence_status), make('small', locationLabel(item)));
      marker.bindPopup(popup, {maxWidth: 240, autoPanPadding: [15, 15]});
      marker.on('click', () => showCase(item, {pan: false}));
      markers.set(item.id, marker);
    }
  }
  function filter() {
    const query = $('case-search').value.trim().toLocaleLowerCase();
    filtered = cases.filter(item => `${item.title} ${item.country} ${item.location.label} ${item.evidence_status} ${item.sources.map(source => source.publisher).join(' ')}`.toLocaleLowerCase().includes(query));
    if (selectedId && !filtered.some(item => item.id === selectedId)) {
      selectedId = null; $('case-detail').hidden = true; setUrl(null);
      if (selectedArea) { selectedArea.remove(); selectedArea = null; }
      if (map) map.closePopup();
    }
    renderList(); renderMap();
    const notes = [...loadErrors];
    if (hasMore) notes.push('Showing up to 500 records from each source collection.');
    if (!filtered.length) notes.push(query ? 'No matching locations.' : 'No locations loaded.');
    $('data-status').textContent = notes.join(' ');
  }
  function discoveryRecord(item) {
    const suspected = item.classification === 'source_suspected';
    const year = item.source_title.match(/\b(?:19|20)\d{2}\b/)?.[0] || 'Date unavailable';
    const source = new URL(item.source_url); source.hash = `page=${item.pdf_page}`;
    return {
      id: `source-${item.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `Site ${item.site_code}`, country: item.country, reported_on: year,
      evidence_status: suspected ? 'Suspected by source · review pending' : 'Documented by source · review pending',
      summary: `${item.publisher} lists this location in ${item.section} of ${item.source_title}.`,
      communication: 'Public victim-message evidence has not been assessed for this source record.',
      current_status: 'Historical source report. Current activity has not been assessed.',
      belt_road_status: 'Not established', collection_method: 'crawler', reviewed_at: null,
      location: {...item.location, precision: 'region', label: `${item.country} · ${item.site_code}`,
        basis: 'Public report coordinates rounded to two decimal places. The 2 km display area is illustrative, not a confidence bound or an exact building location.'},
      sources: [{url: source.href, publisher: item.publisher, title: item.source_title,
        published_on: year, supports: `${suspected ? 'Suspected' : 'Documented'} by the publisher. ${item.section}, PDF page ${item.pdf_page}. Awaiting SOS Relay review.`}]
    };
  }
  async function load() {
    if (loading) return; loading = true;
    $('data-status').textContent = 'Loading locations…'; $('retry-data').hidden = true;
    const previousId = selectedId || new URL(location.href).searchParams.get('case');
    const endpoints = ['/api/belt-road/cases', '/api/belt-road/discoveries'];
    const results = await Promise.allSettled(endpoints.map(async url => {
      const response = await fetch(url, {cache: 'no-store', credentials: 'omit'});
      if (!response.ok) throw new Error('Public records unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(url.endsWith('/cases') ? data.cases : data.discoveries)) throw new Error('Unsupported records');
      return data;
    }));
    const crawlResult = results[1];
    if (crawlResult.status === 'fulfilled') {
      const rows = crawlResult.value.discoveries;
      const documented = rows.filter(item => item.classification === 'source_documented').length;
      $('crawler-summary').textContent = `Crawler discoveries ${rows.length} · ${documented} documented by source · ${rows.length - documented} suspected · awaiting review${crawlResult.value.has_more ? ' · showing first 500' : ''}`;
    } else {
      $('crawler-summary').textContent = 'Crawler summary temporarily unavailable. Retry loading locations.';
    }
    cases = []; loadErrors = []; hasMore = false;
    let latest = '';
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        loadErrors.push('Some locations could not be loaded. Retry to load the complete map.');
        return;
      }
      const data = result.value;
      cases.push(...(index === 0 ? data.cases : data.discoveries.map(discoveryRecord)));
      hasMore ||= data.has_more === true;
      if (data.generated_at > latest) latest = data.generated_at;
    });
    loadErrors = [...new Set(loadErrors)];
    cases.sort((a, b) => a.country.localeCompare(b.country) || a.title.localeCompare(b.title, 'en', {numeric: true}));
    $('updated-label').textContent = latest ? `Updated ${latest.slice(0, 10)}` : '';
    $('retry-data').hidden = !loadErrors.length;
    $('collection-note').textContent = 'OpenFreeMap supplies OpenStreetMap-based tiles and receives your network address and viewed map areas. English names are preferred, with Latin-script or local-name fallbacks. Source classifications and SOS Relay review status are shown per record.';
    filter();
    const selected = cases.find(item => item.id === previousId && filtered.some(row => row.id === item.id));
    if (selected) showCase(selected);
    else if (previousId && !loadErrors.length) $('data-status').textContent = 'This location is unavailable in the current collection.';
    else if (cases.length && !selectedId) fitReports();
    loading = false;
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
