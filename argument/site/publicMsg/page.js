const $ = id => document.getElementById(id);
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const words = text => [...segmenter.segment(text.normalize('NFC'))].filter(s => s.isWordLike).length;
let state, pending, busy = false, retryAt = 0;

function update() {
  const text = $('body').value;
  const characters = [...text].length;
  const count = words(text);
  $('count').textContent = `${count.toLocaleString()} words · ${characters.toLocaleString()} / 12,000 characters`;
  if (!state) return;
  const q = state.quota;
  const wait = Math.max(0, Math.ceil((Math.max(q.retryAt, retryAt) - Date.now()) / 1000));
  const reset = new Date(q.resetsAt).toLocaleString();
  $('allowance').textContent = `${q.remainingMessages} / ${q.messages} messages and ${q.remainingWords} / ${q.words} words left. Resets ${reset} (midnight UTC).${wait ? ` Retry in ${wait}s.` : ''}${q.remainingMessages <= 2 || q.remainingWords < 300 ? ' You are nearing your daily limit.' : ''}`;
  $('upgrade').hidden = state.registered || (q.remainingMessages > 2 && q.remainingWords >= 300);
  $('send').disabled = busy || !text.trim() || characters > 12000 || count > q.remainingWords || q.remainingMessages === 0 || wait > 0;
}

async function refresh() {
  const response = await fetch('/api/publicMsg', { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) {
    retryAt = result.retryAt || 0;
    throw new Error(result.error || 'Could not load messages.');
  }
  state = result;
  $('ip').textContent = result.ip || 'Unavailable';
  $('reference').textContent = result.reference;
  $('account').textContent = result.registered ? result.username : 'Anonymous';
  renderHistory();
  update();
}
function renderHistory() {
  const direction = $('history-order').value === 'newest' ? -1 : 1;
  const messages = [...(state?.messages || [])].sort((a, b) => direction * ((a.createdAt - b.createdAt) || a.id.localeCompare(b.id)));
  $('history').replaceChildren();
  if (!messages.length) $('history').textContent = 'No messages yet.';
  for (const message of messages) {
    const article = document.createElement('article');
    const label = document.createElement('small');
    label.textContent = `${message.reviewNote || message.status} · ${new Date(message.createdAt).toLocaleString()} · reference ${message.id}`;
    const body = document.createElement('p');
    body.textContent = message.body;
    article.append(label, body);
    $('history').append(article);
  }
}
$('history-order').addEventListener('change', renderHistory);
$('body').addEventListener('input', update);
$('refresh').addEventListener('click', () => refresh().catch(error => { $('feedback').textContent = error.message; }));
$('message-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state) return;
  const body = $('body').value.trim();
  if (!pending || pending.body !== body) pending = { body, requestKey: crypto.randomUUID() };
  busy = true;
  update();
  try {
    const response = await fetch('/api/publicMsg', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Argument-Request': '1' }, body: JSON.stringify(pending),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.quota) state.quota = result.quota;
      retryAt = result.retryAt || 0;
      throw new Error(result.error || 'Could not send. Retry with the same text.');
    }
    $('body').value = '';
    pending = null;
    $('feedback').textContent = `${result.reviewNote ? 'Received — ' + result.reviewNote + '.' : 'Received for review.'} Reference: ${result.id}. Your message is not public; assistance has not been dispatched.`;
    await refresh();
  } catch (error) { $('feedback').textContent = error.message; }
  finally { busy = false; update(); }
});
setInterval(update, 1000);
refresh().catch(error => { $('feedback').textContent = error.message; });
