/* Read-only reviewed export. Collection and review tools never run in the browser. */
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
  const markers = new Map();
  const world = () => { if (map) map.setView([18, 20], 2, { animate: false }); };
  if (window.L) {
    map = L.map('belt-map', { worldCopyJump: true, minZoom: 2, maxZoom: 16 });
    world();
    layers = L.layerGroup().addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);
    let failed = false;
    tiles.on('loading', () => { failed = false; });
    tiles.on('tileerror', () => { failed = true; $('tile-status').textContent = 'Some tiles unavailable. Reports and source links still work.'; });
    tiles.on('load', () => { if (!failed) $('tile-status').textContent = 'Select a skull to read the report.'; });
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
      if (map) map.closePopup(); renderList();
      const button = document.querySelector('#case-list button'); if (button) button.focus();
    });
    actions.append(close, make('span', `Reported ${item.reported_on}`));
    const title = make('h2', item.title); title.id = 'case-title';
    detail.append(actions, title, make('span', item.evidence_status, 'status-tag'), make('p', item.summary));
    detail.append(make('h3', 'Public communication'), make('p', item.communication), make('p', item.current_status));
    detail.append(make('h3', 'Location'), make('p', `${item.location.label}. ${locationLabel(item)}.`));
    detail.append(make('h3', 'Belt & Road relationship'), make('p', item.belt_road_status));
    const sources = make('details'); sources.open = true;
    sources.append(make('summary', `Sources (${item.sources.length})`));
    const list = make('ol', undefined, 'sources');
    for (const source of item.sources) {
      const li = make('li'); const link = make('a', source.publisher);
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      li.append(link, make('small', `${source.title} · ${source.published_on}`), make('p', source.supports));
      list.append(li);
    }
    sources.append(list);
    const precision = make('details'); precision.append(make('summary', 'Location & collection details'));
    precision.append(make('p', item.location.basis), make('p', `Collection: ${item.collection_method === 'crawler' ? 'crawler import' : 'manually checked source seed'}. Reviewed ${item.reviewed_at.slice(0, 10)}. Publication status is separate from proof of the underlying claim.`));
    const share = make('button', 'Copy report link'); share.type = 'button';
    share.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); share.textContent = 'Link copied'; }
      catch { share.textContent = 'Copy the URL from your address bar'; }
    });
    detail.append(sources, precision, share); detail.hidden = false;
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
      li.append(make('p', `${item.country} · ${item.reported_on}`, 'case-meta'), button, make('span', locationLabel(item), 'precision'));
      list.append(li);
    }
    $('case-count').textContent = String(filtered.length);
  }
  function renderMap() {
    markers.clear(); if (!map) return;
    layers.clearLayers();
    for (const item of filtered) {
      const point = [item.location.latitude, item.location.longitude];
      const area = L.circle(point, { radius: item.location.radius_m, color: '#8a382d', weight: 1, dashArray: '4 5', fillOpacity: .08 }).addTo(layers);
      area.bindTooltip(locationLabel(item));
      const marker = L.marker(point, {
        icon: L.divIcon({ className: 'skull-marker', html: skull, iconSize: [34, 34], iconAnchor: [17, 17] }),
        title: `${item.title}. ${locationLabel(item)}`, keyboard: true
      }).addTo(layers);
      const popup = make('div'); const button = make('button', item.title); button.type = 'button';
      button.addEventListener('click', () => showCase(item, { focus: true, pan: false }));
      popup.append(button, make('p', `${item.country} · Reported ${item.reported_on}`), make('small', locationLabel(item)));
      marker.bindPopup(popup);
      marker.on('click', () => showCase(item, { pan: false }));
      markers.set(item.id, marker);
    }
  }
  function filter() {
    const query = $('case-search').value.trim().toLocaleLowerCase();
    filtered = cases.filter(item => `${item.title} ${item.country} ${item.location.label}`.toLocaleLowerCase().includes(query));
    if (selectedId && !filtered.some(item => item.id === selectedId)) {
      selectedId = null; $('case-detail').hidden = true; setUrl(null);
    }
    renderList(); renderMap();
    $('data-status').textContent = filtered.length ? '' : query ? 'No matching reports. Try another name or place.' : 'No reviewed reports published yet.';
  }
  async function load() {
    if (loading) return; loading = true;
    $('data-status').textContent = 'Loading public records…'; $('retry-data').hidden = true;
    try {
      const response = await fetch('./cases.json', { cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error('Public records unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.cases)) throw new Error('Unsupported public record format');
      cases = data.cases;
      $('updated-label').textContent = `Updated ${data.generated_at.slice(0, 10)}`;
      $('collection-note').textContent = 'OpenStreetMap supplies map tiles and receives your network address and viewed map areas. The public map currently uses a manually checked source seed. Crawler discoveries stay in a private review queue.';
      filter();
      const id = new URL(location.href).searchParams.get('case');
      const selected = cases.find(item => item.id === id);
      if (selected) showCase(selected); else if (id) $('data-status').textContent = 'This report is unavailable in the current public collection.';
    } catch {
      $('data-status').textContent = 'Could not load reports. Retry when the connection is available.';
      $('retry-data').hidden = false;
    } finally { loading = false; }
  }
  $('case-search').addEventListener('input', filter);
  $('world-view').addEventListener('click', world);
  $('fit-reports').addEventListener('click', () => {
    if (!map || !filtered.length) return;
    const bounds = L.latLngBounds([]);
    for (const item of filtered) bounds.extend(locationBounds(item));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9, animate: false });
  });
  $('retry-data').addEventListener('click', load);
  load();
})();
