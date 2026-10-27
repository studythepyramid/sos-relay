(() => {
  'use strict';
  const key = 'sos.argument.draft.v1';
  const title = document.getElementById('new-title');
  const claim = document.getElementById('new-claim');
  const status = document.getElementById('draft-status');
  const error = document.getElementById('error');
  const submit = document.getElementById('submit');
  let source, titleTouched = false;
  function fail(message) { error.textContent = message; error.style.display = 'block'; }
  function preview() {
    document.getElementById('source-preview').hidden = !source;
    if (!source) return;
    document.getElementById('source-quote').textContent = source.quote;
    const link = document.getElementById('source-link');
    link.textContent = source.title; link.href = source.url;
  }
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (draft) {
      title.value = typeof draft.title === 'string' ? draft.title.slice(0, 200) : '';
      claim.value = typeof draft.body === 'string' ? draft.body.slice(0, 4000) : '';
      titleTouched = Boolean(title.value);
      if (draft.source && typeof draft.source.quote === 'string' && draft.source.quote.length <= 2000) {
        const url = new URL(draft.source.url);
        if (url.protocol === 'https:' && url.hostname === 'sosweb.org' && !url.username && !url.password && !url.port) source = draft.source;
      }
      status.textContent = 'Draft restored in this tab. Review it before publishing.';
    }
  } catch { status.textContent = 'Draft recovery is unavailable. Keep this tab open until you publish.'; }
  preview();
  function save() {
    try {
      sessionStorage.setItem(key, JSON.stringify({title: title.value, body: claim.value, source}));
      status.textContent = 'Draft saved in this tab.';
      return true;
    } catch {
      status.textContent = 'This browser could not save your draft. Keep this tab open.';
      return false;
    }
  }
  title.addEventListener('input', () => { titleTouched = true; save(); });
  claim.addEventListener('input', () => {
    if (!titleTouched) title.value = claim.value.trim().split(/\s+/).filter(Boolean).slice(0, 6).join(' ').slice(0, 200);
    save();
  });
  document.getElementById('remove-source').onclick = () => { source = undefined; preview(); save(); };
  document.getElementById('discard-draft').onclick = () => {
    if (!window.confirm('Discard this discussion draft?')) return;
    try { sessionStorage.removeItem(key); } catch {}
    title.value = ''; claim.value = ''; source = undefined; titleTouched = false;
    preview(); status.textContent = 'Draft discarded.'; error.style.display = 'none';
  };
  submit.onclick = async () => {
    error.style.display = 'none';
    if (!title.value.trim() || !claim.value.trim()) return fail('Enter a title and your question or contribution.');
    save(); submit.disabled = true;
    try {
      const response = await fetch('/api/argument', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-Argument-Request': '1'},
        body: JSON.stringify({title: title.value.trim(), body: claim.value.trim(), source}),
      });
      if (response.status === 401) {
        if (save()) location.assign('/user/?next=%2Fargument%2Fnew%2F');
        else fail('Your session expired. Copy your draft before logging in again.');
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not publish your thread.');
      try { sessionStorage.removeItem(key); } catch {}
      location.assign('/argument/' + encodeURIComponent(result.slug) + '/');
    } catch (err) { fail(err.message || 'Could not publish. Your draft is still here.'); }
    finally { submit.disabled = false; }
  };
})();
