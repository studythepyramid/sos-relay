/* Local test API only. No public SOS dispatch or analytics. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('signal-form');
  const latInput = $('latitude');
  const lngInput = $('longitude');
  const status = $('form-status');
  const pins = [];
  let map, draft;
  let pendingSubmission;
  let loading = false;
  let saving = false;
  const submit = form.querySelector('[type="submit"]');
  const markers = [];
  const icon = published => L.divIcon({ className: `sos-marker${published ? ' published' : ''}`, iconSize: [26, 26], iconAnchor: [13, 26] });
  // crypto.randomUUID() isn't available in every WebView/older browser
  // (confirmed missing on a real Android WebView) — fall back to
  // crypto.getRandomValues, then Math.random, still producing a valid
  // RFC 4122 v4 string the backend's UUID() parsing accepts.
  function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint8Array(16))
      : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  function coordinates() {
    if (!latInput.reportValidity() || !lngInput.reportValidity()) return null;
    return { lat: Number(latInput.value), lng: Number(lngInput.value) };
  }
  function select(point, pan = false) {
    if (saving) return;
    latInput.value = String(point.lat);
    lngInput.value = String(point.lng);
    if (!map) return;
    if (!draft) {
      draft = L.marker(point, { icon: icon(false), draggable: true, title: 'Selected SOS location', autoPan: true }).addTo(map);
      draft.on('dragend', () => select(draft.getLatLng().wrap()));
    } else draft.setLatLng(point);
    if (pan) map.setView(point, Math.max(map.getZoom(), 10), { animate: false });
  }
  if (window.L) {
    map = L.map('map', { worldCopyJump: true }).setView([23, 15], 3);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);
    let tileFailed = false;
    tiles.on('loading', () => { tileFailed = false; });
    tiles.on('tileerror', () => { tileFailed = true; $('tile-status').textContent = 'Some map tiles could not load. Coordinates still work; this demo does not send an SOS.'; });
    tiles.on('load', () => { if (!tileFailed) $('tile-status').textContent = 'Tap a location to place a pin. Drag it to adjust the exact position.'; });
    map.on('click', event => select(event.latlng.wrap()));
    $('center-pin').addEventListener('click', () => { select(map.getCenter().wrap()); latInput.focus(); });
  } else {
    $('tile-status').textContent = 'The map library could not load. You can still try the form using coordinates.';
    $('center-pin').disabled = true;
  }
  $('use-coordinates').addEventListener('click', () => { const point = coordinates(); if (point) select(point, true); });
  $('message').addEventListener('input', () => { $('character-count').textContent = `${$('message').value.length} / 600`; $('message').setCustomValidity(''); });
  $('share-contact').addEventListener('change', event => {
    $('contact-label').hidden = !event.target.checked;
    $('contact').disabled = !event.target.checked;
    if (!event.target.checked) $('contact').value = '';
  });
  function element(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
  function render(pin) {
    const card = document.createElement('li');
    const link = element('button', `Saved test message · View location`);
    link.type = 'button';
    link.addEventListener('click', () => { if (map) { map.setView(pin, 14, { animate: false }); $('map').scrollIntoView({ block: 'center' }); } });
    link.disabled = !map;
    card.append(link, element('p', pin.message), element('small', `${pin.lat}, ${pin.lng}`), element('small', `${pin.contact || 'Anonymous'} · ${new Date(pin.createdAt).toLocaleString()}`));
    $('signal-list').prepend(card);
    if (map) {
      const popup = document.createElement('div');
      popup.append(element('strong', 'Saved locally — no rescue dispatch'), element('p', pin.message), element('small', `${pin.lat}, ${pin.lng}\n${pin.contact || 'Anonymous'}\n${new Date(pin.createdAt).toLocaleString()}`));
      markers.push(L.marker(pin, { icon: icon(true), title: 'Demo SOS signal' }).addTo(map).bindPopup(popup));
    }
    $('signal-count').textContent = String(pins.length);
    $('empty-state').hidden = true;

  }
  function normalize(pin) {
    return { ...pin, lat: pin.latitude, lng: pin.longitude, createdAt: pin.created_at };
  }
  // AbortSignal.timeout is also missing on the same older WebView that
  // lacked crypto.randomUUID — AbortController + setTimeout is the same
  // effect with much older/wider support.
  function timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, credentials: 'omit', cache: 'no-store', signal: timeoutSignal(15000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Local database API unavailable. Open this page on port 18188.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Database request failed.');
    return result;
  }
  async function loadPins() {
    if (loading) return;
    loading = true;
    $('reload-signals').disabled = true;
    submit.disabled = true;
    try {
      const loaded = [];
      let offset = 0;
      do {
        const result = await request(`/api/sos/pins?offset=${offset}`);
        loaded.push(...result.pins.map(normalize));
        offset = result.next_offset;
      } while (offset !== null);
      pins.splice(0, pins.length, ...loaded);
      markers.splice(0).forEach(marker => marker.remove());
      $('signal-list').replaceChildren();
      [...pins].reverse().forEach(render);
      $('signal-count').textContent = String(pins.length);
      $('empty-state').hidden = pins.length > 0;
      $('empty-state').textContent = 'No saved test messages yet. Choose a location to try the flow.';
      status.textContent = `Loaded ${pins.length} saved test messages from the local database.`;
    } catch (error) {
      status.textContent = `Could not load saved messages: ${error.message} Use Reload saved messages to retry.`;
      $('empty-state').textContent = 'Saved messages could not be loaded.';
    } finally {
      loading = false;
      submit.disabled = false;
      $('reload-signals').disabled = false;
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const point = coordinates();
    if (!point) return;
    const message = $('message').value.trim();
    if (!message) { $('message').setCustomValidity('Describe the help needed.'); $('message').reportValidity(); return; }
    const values = { latitude: point.lat, longitude: point.lng, message,
      share_contact: $('share-contact').checked,
      contact: $('share-contact').checked ? $('contact').value.trim() : null };
    const fingerprint = JSON.stringify(values);
    if (!pendingSubmission || pendingSubmission.fingerprint !== fingerprint) {
      pendingSubmission = { fingerprint, body: { ...values, id: makeId() } };
    }
    const body = JSON.stringify(pendingSubmission.body);
    saving = true;
    if (draft) draft.dragging.disable();
    // Lock the draft during a request; failures retain it and the retry ID.
    const controls = [...form.querySelectorAll('input, textarea, button')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    $('reload-signals').disabled = true;
    status.textContent = 'Saving to the local database…';
    let saved = false;
    try {
      const result = await request('/api/sos/pins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      const pin = normalize(result.pin);
      if (!pins.some(existing => existing.id === pin.id)) { pins.push(pin); render(pin); }
      pendingSubmission = null;
      if (draft) { draft.remove(); draft = null; }
      form.reset();
      $('contact-label').hidden = true;
      $('character-count').textContent = '0 / 600';
      status.textContent = 'Saved to genone.db. This test message survives reload; it is not a public SOS. Location restrictions were not checked.';
      saved = true;
    } catch (error) {
      status.textContent = `Save not confirmed: ${error.message} Your draft is retained. Retry unchanged to avoid duplicate messages.`;
    } finally {
      saving = false;
      if (draft) draft.dragging.enable();
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
      if (saved) $('contact').disabled = true;
      $('reload-signals').disabled = false;
      status.focus();
    }
  });
  $('reload-signals').addEventListener('click', loadPins);
  loadPins();
})();
