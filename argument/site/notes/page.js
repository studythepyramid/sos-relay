const $ = id => document.getElementById(id);
const MAX = 100000;
let editing = null, pending = null, busy = false;

async function api(path = '', data) {
  const response = await fetch('/api/notes' + path, { cache: 'no-store', credentials: 'same-origin',
    ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Argument-Request': '1' }, body: JSON.stringify(data) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status });
  return result;
}
function element(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}
function status(note) {
  if (note.status === 'published') return 'published';
  if (note.status === 'removed') return 'removed from the site';
  const label = note.status === 'pending' ? 'awaiting review' : 'rejected';
  return note.live ? `${label} · an earlier version is still published` : label;
}
function link(note) {
  const a = element('a', 'Open'); a.href = note.url; return a;
}
function update() {
  const characters = [...$('body').value].length;
  $('count').textContent = `${characters.toLocaleString()} / ${MAX.toLocaleString()} characters`;
  $('save').disabled = busy || !$('title').value.trim() || !$('body').value.trim() || characters > MAX;
}
function startNew() {
  editing = null; pending = null;
  $('note-form').reset(); $('form-heading').textContent = 'New note'; $('feedback').textContent = '';
  update();
}

async function loadMine() {
  let data;
  try { data = await api($('show-all').checked ? '?all=1' : ''); }
  catch (error) {
    if (error.status !== 401) throw error;
    $('signin').hidden = false; $('note-form').hidden = true; $('mine').hidden = true;
    return;
  }
  $('signin').hidden = true; $('note-form').hidden = false; $('mine').hidden = false;
  $('all-toggle').hidden = !data.admin;
  $('mine-heading').textContent = $('show-all').checked ? 'All notes' : 'Your notes';
  const list = $('mine-list'); list.replaceChildren();
  if (!data.notes.length) list.append(element('p', 'No notes yet.'));
  for (const note of data.notes) {
    const row = element('div'), info = element('div'), actions = element('div');
    row.className = 'note-item'; actions.className = 'app-actions';
    const meta = `${status(note)} · ${note.format === 'md' ? 'Markdown' : 'plain text'} · updated ${new Date(note.updatedAt).toLocaleString()}`;
    info.append(element('strong', note.title), element('small', data.admin && $('show-all').checked ? `${note.username || 'former account'} · ${meta}` : meta));
    const edit = element('button', 'Edit'); edit.type = 'button';
    edit.onclick = () => run(() => openNote(note.id));
    actions.append(edit);
    if (note.url) actions.append(link(note));
    row.append(info, actions); list.append(row);
  }
}
async function loadPublished() {
  const data = await api('/published');
  const list = $('published-list'); list.replaceChildren();
  if (!data.notes.length) list.append(element('p', 'Nothing published yet.'));
  for (const note of data.notes) {
    const row = element('div'), info = element('div'), title = element('a', note.title);
    row.className = 'note-item'; title.href = note.url;
    info.append(title, element('small', `${note.author} · ${new Date(note.publishedAt).toLocaleDateString()}`));
    row.append(info); list.append(row);
  }
}
async function openNote(id) {
  const note = await api('/' + encodeURIComponent(id));
  editing = { id: note.id, revision: note.revision }; pending = null;
  $('title').value = note.title; $('format').value = note.format; $('body').value = note.body;
  $('form-heading').textContent = 'Editing: ' + note.title;
  $('feedback').textContent = status(note);
  update(); $('title').focus();
}
async function run(work) {
  try { await work(); } catch (error) { $('feedback').textContent = error.message; }
}

$('note-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  const note = { title: $('title').value, format: $('format').value, body: $('body').value };
  busy = true; update();
  run(async () => {
    try {
      let result;
      if (editing) {
        result = await api('/' + encodeURIComponent(editing.id), { ...note, revision: editing.revision });
      } else {
        // Reuse the key while the text is unchanged, so a retry after a dropped connection does not duplicate.
        if (!pending || pending.title !== note.title || pending.body !== note.body) pending = { ...note, requestKey: crypto.randomUUID() };
        result = await api('', { ...note, requestKey: pending.requestKey });
        pending = null;
      }
      editing = { id: result.id, revision: result.revision ?? editing?.revision };
      if (result.repeated) await openNote(result.id);
      $('form-heading').textContent = 'Editing: ' + note.title.trim();
      $('feedback').textContent = result.live
        ? 'Saved. Your edit awaits review; the earlier approved version stays published until then.'
        : 'Saved. It will be published after an administrator approves it.';
      await loadMine();
    } finally { busy = false; update(); }
  });
});
$('new-note').addEventListener('click', startNew);
$('show-all').addEventListener('change', () => run(loadMine));
for (const id of ['title', 'body']) $(id).addEventListener('input', update);
update();
run(async () => { await Promise.all([loadMine(), loadPublished()]); });
