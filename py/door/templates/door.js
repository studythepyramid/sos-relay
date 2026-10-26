(() => {
  const widget = document.getElementById('language-float');
  const close = document.getElementById('close-languages');
  const key = 'sos-door-languages-dismissed';
  try { widget.hidden = sessionStorage.getItem(key) === 'yes'; } catch {}
  close.addEventListener('click', () => {
    widget.hidden = true;
    try { sessionStorage.setItem(key, 'yes'); } catch {}
    document.querySelector('.masthead nav a[aria-current]').focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const menu = widget.querySelector('details');
      if (menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    }
  });
})();

(() => {
  if (document.documentElement.lang !== 'en') return;
  const base = '/share/door-tts/';
  const article = document.querySelector('article');
  const edition = document.querySelector('.edition');
  if (!article || !edition) return;

  const plain = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  fetch(base + 'voices.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then(start)
    .catch(() => {});

  function start(voices) {
    if (!Array.isArray(voices) || !voices.length) return;
    const bar = document.createElement('div');
    bar.className = 'tts-bar';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Voice');
    voices.forEach((voice) => select.add(new Option(voice.label, voice.manifest)));
    const play = document.createElement('button');
    play.type = 'button';
    play.textContent = 'Listen';
    const status = document.createElement('span');
    status.className = 'tts-status';
    status.setAttribute('role', 'status');
    const audio = new Audio();
    audio.preload = 'none';
    bar.append(select, play, status);
    edition.after(bar);

    let segments = [];
    let blocks = [];

    function load(manifestPath) {
      audio.pause();
      clearCurrent();
      const folder = base + manifestPath.replace(/[^/]+$/, '');
      return fetch(base + manifestPath, { cache: 'no-cache' })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((manifest) => {
          segments = manifest.segments || [];
          blocks = segments.map((segment) => article.children[segment.index]);
          const stale = segments.some((segment, i) => !blocks[i]
            || !plain(blocks[i].textContent).startsWith(plain(segment.text).slice(0, 40)));
          blocks.forEach((block) => block && block.classList.remove('tts-block'));
          if (stale) {
            segments = [];
            blocks = [];
            status.textContent = 'Audio is out of date for this page.';
            play.disabled = true;
            return;
          }
          blocks.forEach((block) => block.classList.add('tts-block'));
          audio.src = folder + manifest.audio;
          play.disabled = false;
          status.textContent = `${segments.length} paragraphs narrated`;
        })
        .catch(() => {
          play.disabled = true;
          status.textContent = 'Audio unavailable.';
        });
    }

    function clearCurrent() {
      article.querySelectorAll('.tts-current').forEach((el) => el.classList.remove('tts-current'));
    }

    audio.addEventListener('timeupdate', () => {
      clearCurrent();
      const t = audio.currentTime;
      if (audio.paused && t === 0) return;
      const i = segments.findIndex((segment) => t >= segment.start && t < segment.end + 0.4);
      if (i !== -1) blocks[i].classList.add('tts-current');
    });
    audio.addEventListener('play', () => { play.textContent = 'Pause'; });
    audio.addEventListener('pause', () => { play.textContent = 'Listen'; });
    audio.addEventListener('ended', () => { clearCurrent(); play.textContent = 'Listen'; });

    play.addEventListener('click', () => {
      if (audio.paused) audio.play().catch(() => { status.textContent = 'Playback was blocked.'; });
      else audio.pause();
    });
    select.addEventListener('change', () => load(select.value));
    article.addEventListener('click', (event) => {
      const i = blocks.findIndex((block) => block.contains(event.target));
      if (i === -1 || event.target.closest('a')) return;
      audio.currentTime = segments[i].start;
      audio.play().catch(() => {});
    });

    load(select.value);
  }
})();
