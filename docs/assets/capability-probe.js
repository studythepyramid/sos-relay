// Phase 1.1: probes what a visitor's browser can actually do before the
// guide page tells them which path to take. No network calls — pure
// feature detection, runs once against a container element.
(function () {
  async function wasmSimdSupported() {
    // Minimal valid WASM module using a v128 (SIMD) local — if the engine
    // rejects it, SIMD isn't available.
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
      10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);
    try {
      await WebAssembly.instantiate(bytes);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function storageEstimate() {
    if (!(navigator.storage && navigator.storage.estimate)) return null;
    try {
      return await navigator.storage.estimate();
    } catch (e) {
      return null;
    }
  }

  async function runChecks() {
    const checks = [];

    const hasWasm = typeof WebAssembly === 'object';
    checks.push({
      name: 'WebAssembly',
      ok: hasWasm,
      detail: hasWasm ? 'supported' : 'not supported — nothing here will run',
    });

    const simd = hasWasm ? await wasmSimdSupported() : false;
    checks.push({
      name: 'WASM SIMD',
      ok: simd,
      detail: simd
        ? 'supported — fast build available'
        : 'not supported — falls back to the slower non-SIMD build',
    });

    const hasGpu = 'gpu' in navigator;
    checks.push({
      name: 'WebGPU',
      ok: hasGpu,
      detail: hasGpu ? 'available (optional acceleration)' : 'not available — CPU only, still works',
    });

    const hasCaches = 'caches' in window;
    checks.push({
      name: 'Cache API',
      ok: hasCaches,
      detail: hasCaches ? 'available' : 'not available — use the manual download/load path',
    });

    const estimate = await storageEstimate();
    if (estimate && typeof estimate.quota === 'number') {
      const freeMB = Math.round((estimate.quota - (estimate.usage || 0)) / 1e6);
      checks.push({
        name: 'Storage available',
        ok: freeMB > 350,
        detail: `~${freeMB}MB free (models can be 40–300MB — plan accordingly)`,
      });
    } else {
      checks.push({
        name: 'Storage available',
        ok: null,
        detail: 'could not be estimated in this browser',
      });
    }

    let persisted = null;
    if (navigator.storage && navigator.storage.persist) {
      try {
        persisted = await navigator.storage.persist();
      } catch (e) {
        persisted = false;
      }
    }
    checks.push({
      name: 'Persistent storage',
      ok: persisted,
      detail:
        persisted === null
          ? 'not requestable in this browser'
          : persisted
          ? 'granted — cache is less likely to be evicted'
          : 'denied/unavailable — use the manual download/load path instead',
    });

    const hasFsAccess = 'showOpenFilePicker' in window;
    checks.push({
      name: 'File System Access API',
      ok: hasFsAccess,
      detail: hasFsAccess
        ? 'available — model file can be reloaded without re-picking each visit'
        : 'not available — plain file picker still works, just asks each visit',
    });

    const hasFilePicker = 'File' in window && 'FileReader' in window;
    checks.push({
      name: '<input type="file"> (fallback loader)',
      ok: hasFilePicker,
      detail: hasFilePicker ? 'supported' : 'not supported — this browser cannot load a saved model file at all',
    });

    const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    checks.push({
      name: 'Microphone capture (getUserMedia)',
      ok: hasMic,
      detail: hasMic ? 'available — needed for the STT step' : 'not available — STT step will not work here',
    });

    const hasAudioContext = 'AudioContext' in window || 'webkitAudioContext' in window;
    checks.push({
      name: 'Web Audio API',
      ok: hasAudioContext,
      detail: hasAudioContext ? 'available' : 'not available — playback/recording will fail',
    });

    return checks;
  }

  function statusIcon(ok) {
    if (ok === true) return '✅';
    if (ok === false) return '❌';
    return '❓';
  }

  async function renderInto(container) {
    container.textContent = 'Checking your browser…';
    const checks = await runChecks();
    const list = document.createElement('ul');
    list.className = 'capability-probe-list';
    checks.forEach((c) => {
      const li = document.createElement('li');
      li.textContent = `${statusIcon(c.ok)} ${c.name} — ${c.detail}`;
      list.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(list);
    container.dataset.checks = JSON.stringify(checks);
    container.dispatchEvent(new CustomEvent('capability-probe:done', { detail: checks }));
  }

  function init() {
    document.querySelectorAll('.capability-probe').forEach((el) => {
      if (el.dataset.probeInit) return;
      el.dataset.probeInit = '1';
      renderInto(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
