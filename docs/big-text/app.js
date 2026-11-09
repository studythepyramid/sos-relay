const editor = document.querySelector('#editor');
const display = document.querySelector('#display');
const input = document.querySelector('#message');
const output = document.querySelector('#big-message');
const area = document.querySelector('#message-area');
const smaller = document.querySelector('#smaller');
const larger = document.querySelector('#larger');
const fullscreen = document.querySelector('#fullscreen');
const toolbar = document.querySelector('.toolbar');
let scale = 1;
let wakeLock = null;
let frame = 0;
let hideTimer = 0;

function setControls(visible) {
  clearTimeout(hideTimer);
  toolbar.hidden = !visible;
  display.classList.toggle('immersive', !visible);
  if (!visible) display.focus({ preventScroll: true });
  scheduleFit();
  if (visible) {
    hideTimer = setTimeout(() => setControls(false), 4000);
  }
}

function updateCount() {
  document.querySelector('#count').textContent =
    `${input.value.length} / 240`;
  input.setCustomValidity('');
}

function fits(size) {
  output.style.fontSize = `${size}px`;
  return output.scrollHeight <= area.clientHeight &&
    output.scrollWidth <= area.clientWidth;
}

function fitText() {
  if (display.hidden || !area.clientHeight) return;
  let low = 1;
  let high = 1600;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  output.style.fontSize = `${Math.max(1, Math.floor(low * scale))}px`;
  smaller.disabled = scale <= 0.4;
  larger.disabled = scale >= 1;
}

function scheduleFit() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(fitText);
}

async function keepAwake() {
  if (!('wakeLock' in navigator) || display.hidden ||
      document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    if (display.hidden) await wakeLock.release();
  } catch {
    // The message still works when screen wake lock is unavailable.
  }
}

function enterFullscreen() {
  if (document.fullscreenElement || !display.requestFullscreen) return;
  try {
    display.requestFullscreen().catch(() => {});
  } catch {
    // Some mobile browsers only support the normal browser view.
  }
}

document.querySelector('#message-form').addEventListener(
  'submit', (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) {
      input.setCustomValidity('Type a message first.');
      input.reportValidity();
      return;
    }
    output.textContent = message;
    display.classList.toggle('light', document.querySelector(
      'input[name="colour"]:checked'
    ).value === 'light');
    input.blur();
    editor.hidden = true;
    display.hidden = false;
    document.body.style.overflow = 'hidden';
    scale = 1;
    setControls(true);
    enterFullscreen();
    keepAwake();
    scheduleFit();
    document.querySelector('#edit').focus({ preventScroll: true });
  }
);

async function editMessage() {
  clearTimeout(hideTimer);
  display.hidden = true;
  editor.hidden = false;
  document.body.style.overflow = '';
  if (wakeLock) wakeLock.release().catch(() => {});
  input.focus({ preventScroll: true });
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch {}
  }
}

input.addEventListener('input', updateCount);
document.querySelectorAll('[data-message]').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.message;
    updateCount();
    input.focus();
  });
});
document.querySelector('#edit').addEventListener('click', editMessage);
area.addEventListener('click', () => setControls(toolbar.hidden));
toolbar.addEventListener('click', () => {
  if (!display.hidden) setControls(true);
});
smaller.addEventListener('click', () => {
  scale = Math.max(0.4, scale - 0.1);
  scheduleFit();
});
larger.addEventListener('click', () => {
  scale = Math.min(1, scale + 0.1);
  scheduleFit();
});
document.querySelector('#fit').addEventListener('click', () => {
  scale = 1;
  scheduleFit();
});
fullscreen.hidden = !display.requestFullscreen;
fullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else enterFullscreen();
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.setAttribute('aria-label', document.fullscreenElement
    ? 'Exit fullscreen' : 'Enter fullscreen');
  scheduleFit();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !display.hidden) editMessage();
  if (event.key === 'Tab' && !display.hidden) {
    clearTimeout(hideTimer);
    if (toolbar.hidden) {
      event.preventDefault();
      setControls(true);
      clearTimeout(hideTimer);
      document.querySelector('#edit').focus();
    }
  }
});
document.addEventListener('visibilitychange', keepAwake);
window.addEventListener('resize', scheduleFit);
window.visualViewport?.addEventListener('resize', scheduleFit);
new ResizeObserver(scheduleFit).observe(area);
updateCount();
