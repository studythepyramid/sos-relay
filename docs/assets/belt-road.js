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
  let discoveries = [], discoveryLayers, discoveryLoading = false;
  let hasMore = false;
  const markers = new Map();
  const world = () => { if (map) map.setView([18, 20], 2, { animate: false }); };
  if (window.L) {
    map = L.map('belt-map', { worldCopyJump: true, minZoom: 2, maxZoom: 16 });
    world();
    layers = L.layerGroup().addTo(map);
    discoveryLayers = L.layerGroup().addTo(map);
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
  function fitReports(items = filtered) {
    if (!map || !items.length) return;
    const bounds = L.latLngBounds([]);
    for (const item of items) bounds.extend(locationBounds(item));
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 9, animate: false });
  }
  function renderMap() {
    markers.clear(); if (!map) return;
    layers.clearLayers();
    renderDiscoveries();
    const groups = [];
    for (const item of filtered) {
      const point = [item.location.latitude, item.location.longitude];
      const pixel = map.latLngToLayerPoint(point);
      // Group screen collisions without moving a report to invented coordinates.
      let group = groups.find(candidate => candidate.pixel.distanceTo(pixel) < 44);
      if (!group) { group = { point, pixel, items: [] }; groups.push(group); }
      group.items.push(item);
      const area = L.circle(point, { radius: item.location.radius_m, color: '#8a382d', weight: 1, dashArray: '4 5', fillOpacity: .08 }).addTo(layers);
      area.bindTooltip(locationLabel(item));
    }
    for (const group of groups) {
      const multiple = group.items.length > 1;
      const badge = multiple ? `<span class="skull-count">${group.items.length}</span>` : '';
      const title = multiple ? `${group.items.length} reports in this map area. Select to read each report.` : `${group.items[0].title}. ${locationLabel(group.items[0])}`;
      const marker = L.marker(group.point, {
        icon: L.divIcon({ className: 'skull-marker', html: skull + badge, iconSize: [34, 34], iconAnchor: [17, 17] }),
        title, keyboard: true
      }).addTo(layers);
      const popup = make('div');
      if (multiple) {
        const sameLocation = group.items.every(item => item.location.latitude === group.point[0] && item.location.longitude === group.point[1]);
        popup.append(make('strong', `${group.items.length} reports · ${sameLocation ? 'same approximate location' : 'zoom to separate locations'}`));
        const zoom = make('button', 'Show this group'); zoom.type = 'button';
        zoom.addEventListener('click', () => fitReports(group.items));
        popup.append(make('p'), zoom);
      }
      for (const item of group.items) {
        const entry = make('p'); const button = make('button', item.title); button.type = 'button';
        button.addEventListener('click', () => showCase(item, { focus: true }));
        entry.append(button, make('small', `${item.country} · ${item.reported_on} · ${locationLabel(item)}`));
        popup.append(entry);
        markers.set(item.id, marker);
      }
      marker.bindPopup(popup);
      if (!multiple) marker.on('click', () => showCase(group.items[0], { pan: false }));
    }
  }
  function filter() {
    const query = $('case-search').value.trim().toLocaleLowerCase();
    filtered = cases.filter(item => `${item.title} ${item.country} ${item.location.label}`.toLocaleLowerCase().includes(query));
    if (selectedId && !filtered.some(item => item.id === selectedId)) {
      selectedId = null; $('case-detail').hidden = true; setUrl(null);
    }
    renderList(); renderMap();
    renderDiscoveryList();
    $('data-status').textContent = filtered.length ? (hasMore ? 'Showing the first 500 published reports. Search applies to this loaded set.' : '') : query ? 'No matching reports. Try another name or place.' : 'No reviewed reports published yet.';
  }
  async function load() {
    if (loading) return; loading = true;
    $('data-status').textContent = 'Loading public records…'; $('retry-data').hidden = true;
    try {
      const response = await fetch('/api/belt-road/cases', { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Public records unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.cases)) throw new Error('Unsupported public record format');
      cases = data.cases;
      hasMore = data.has_more === true;
      $('updated-label').textContent = `Updated ${data.generated_at.slice(0, 10)}`;
      $('collection-note').textContent = 'OpenStreetMap supplies map tiles and receives your network address and viewed map areas. Skull reports have been source-checked in the server catalogue. Crawler discoveries are published separately as attributed research candidates awaiting review.';
      filter();
      const id = new URL(location.href).searchParams.get('case');
      const selected = cases.find(item => item.id === id);
      if (selected) showCase(selected);
      else if (id) $('data-status').textContent = 'This report is unavailable in the current public collection.';
      else if (cases.length > 1) fitReports();
    } catch {
      $('data-status').textContent = 'Could not load reports. Retry when the connection is available.';
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
  function matchingDiscoveries() {
    const query = $('case-search').value.trim().toLocaleLowerCase();
    return discoveries.filter(item => `${item.site_code} ${item.country} ${item.publisher} ${item.classification}`.toLocaleLowerCase().includes(query));
  }
  function discoveryLabel(item) {
    return item.classification === 'source_documented' ? 'Publisher-documented' : 'Suspected by publisher';
  }
  function discoverySource(item) {
    const link = make('a', `${item.publisher} · ${item.section} · PDF page ${item.pdf_page}`);
    const url = new URL(item.source_url); url.hash = `page=${item.pdf_page}`;
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }
  function discoveryPopup(item) {
    const popup = make('div');
    popup.append(make('strong', `${item.country} · ${item.site_code}`),
      make('p', `${discoveryLabel(item)} · awaiting SOS Relay review`),
      make('p', `${item.source_title}. Approximate reported area; current activity and public victim-message evidence not assessed.`), discoverySource(item));
    return popup;
  }
  function renderDiscoveries() {
    if (!map) return;
    discoveryLayers.clearLayers();
    if (!$('show-discoveries').checked) return;
    for (const item of matchingDiscoveries()) {
      L.circleMarker([item.location.latitude, item.location.longitude], {
        radius: 7, color: '#99601c', weight: 2, fillColor: '#edb653',
        fillOpacity: item.classification === 'source_documented' ? .7 : .15,
        dashArray: item.classification === 'source_suspected' ? '3 3' : null
      }).bindTooltip(`${item.site_code} · ${discoveryLabel(item)} · needs review`)
        .bindPopup(discoveryPopup(item)).addTo(discoveryLayers);
    }
  }
  function renderDiscoveryList() {
    const list = $('discovery-list'); list.replaceChildren();
    for (const item of matchingDiscoveries()) {
      const li = make('li');
      const button = make('button', `${item.country} · ${item.site_code}`); button.type = 'button';
      button.disabled = !map;
      button.addEventListener('click', () => {
        $('show-discoveries').checked = true; renderDiscoveries();
        map.fitBounds(locationBounds(item), {maxZoom: 12, animate: false});
        L.popup().setLatLng([item.location.latitude, item.location.longitude])
          .setContent(discoveryPopup(item)).openOn(map);
        $('belt-map').scrollIntoView({block: 'center'});
      });
      li.append(button, make('span', discoveryLabel(item)), discoverySource(item)); list.append(li);
    }
  }
  async function loadDiscoveries() {
    if (discoveryLoading) return; discoveryLoading = true;
    $('retry-discoveries').hidden = true;
    try {
      const response = await fetch('/api/belt-road/discoveries', {cache: 'no-store', credentials: 'omit'});
      if (!response.ok) throw new Error('Discoveries unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.discoveries)) throw new Error('Invalid discoveries');
      discoveries = data.discoveries;
      $('discovery-count').textContent = String(discoveries.length);
      const documented = discoveries.filter(item => item.classification === 'source_documented').length;
      $('discovery-status').textContent = `${documented} publisher-documented · ${discoveries.length - documented} suspected · awaiting review${data.has_more ? ' · showing first 500' : ''}`;
      $('fit-discoveries').disabled = !map || !discoveries.length;
      renderDiscoveries(); renderDiscoveryList();
    } catch {
      $('discovery-count').textContent = 'Unavailable';
      $('discovery-status').textContent = 'Could not load crawler discoveries. Reviewed reports are available separately.';
      $('retry-discoveries').hidden = false;
    } finally { discoveryLoading = false; }
  }
  $('show-discoveries').addEventListener('change', renderDiscoveries);
  $('fit-discoveries').addEventListener('click', () => {
    $('show-discoveries').checked = true; renderDiscoveries(); fitReports(matchingDiscoveries());
  });
  $('retry-discoveries').addEventListener('click', loadDiscoveries);
  load();
  loadDiscoveries();
})();
