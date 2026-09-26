// DB rows -> static HTML. This is the whole read path: pages are written
// to disk here (atomically) whenever a write happens, and Caddy serves
// them as plain files — see argument/design.md's "Repo layout &
// deployment" section for why (and where the generated site/ must and
// must not live).
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { siteDir } from './settings.js';
import { listArguments, getArgument } from './db.js';

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap">';

const RELATION_COLOR = {
  claim: '#7bd88f',
  support: '#7bd88f',
  attack: '#e5707a',
  unrelated: '#8fa5c9',
  noise: '#7a8079',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writeAtomic(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}

function relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatClock(isoString) {
  return new Date(isoString).toISOString().slice(11, 19);
}

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${FONT_LINK}
<style>
  body{margin:0;font-family:'JetBrains Mono',monospace;background:#0b0e0c;color:#cfe3d3}
  ::selection{background:#2c4a37;color:#eafaf0}
  a{color:#7bd88f}
  .reply-btn{background:none;border:none;padding:0;font-family:inherit;cursor:pointer;color:#5f8a6e;font-size:13px}
  .reply-btn:hover{color:#7bd88f;text-decoration:underline}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function snippet(body, max = 60) {
  const trimmed = body.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function nodeBlock(node, nodesById, rootNodeId) {
  const color = RELATION_COLOR[node.relation ?? 'claim'] ?? '#8fa5c9';
  const tag = node.relation ? `<span style="color:${color};font-weight:700">[${node.relation}]</span>` : '<span style="color:#7bd88f;font-weight:700">[claim]</span>';
  const dim = node.relation === 'noise' ? ' style="opacity:.55"' : '';
  const parent = node.to_node_id != null ? nodesById.get(node.to_node_id) : null;
  const backlink = parent && node.to_node_id !== rootNodeId
    ? `\n      <div style="margin-top:3px;font-size:13px;color:#4a6155">↳ replying to <span style="color:#7f9186">${escapeHtml(parent.author_label)}</span>: "${escapeHtml(snippet(parent.body, 50))}"</div>`
    : '';
  return `    <div${dim} data-node-id="${node.id}">
      <div style="font-size:16px;color:#5f7268">[${formatClock(node.created_at)}] &lt;${escapeHtml(node.author_label)}&gt; ${tag}</div>${backlink}
      <div style="margin-top:3px;font-size:17px;line-height:1.55">&gt; ${escapeHtml(node.body)}</div>
      <button type="button" class="reply-btn" data-to="${node.id}" data-label="${escapeHtml(node.author_label)}" data-snippet="${escapeHtml(snippet(node.body))}">[ reply ]</button>
    </div>`;
}

export function renderThread(argumentRow) {
  const nodesById = new Map(argumentRow.nodes.map((n) => [n.id, n]));
  const nodes = argumentRow.nodes
    .map((n) => nodeBlock(n, nodesById, argumentRow.root_node_id))
    .join('\n\n');
  const rootTitle = escapeHtml(argumentRow.title);
  const body = `<x-dc-root style="display:block;min-height:100vh">
<div style="max-width:640px;margin:0 auto;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column">

  <div style="padding:18px 20px 14px;border-bottom:1px solid #23302a">
    <div style="font-size:15px;color:#5f7268;letter-spacing:.04em">~/argument/${escapeHtml(argumentRow.slug)}</div>
    <div style="margin-top:6px;font-size:20px;font-weight:700;color:#eafaf0;line-height:1.4">${rootTitle}</div>
  </div>

  <div style="margin:14px 20px 0;padding:12px 14px;border:1px dashed #2c4a37">
    <div style="font-size:13px;color:#5f7268;letter-spacing:.04em">[ topic graph — reserved for later ]</div>
  </div>

  <div style="flex:1 1 auto;padding:14px 20px;display:flex;flex-direction:column;gap:18px">
${nodes}
  </div>

  <div id="reply-target" style="display:none;padding:10px 20px 0;font-size:13px;color:#5f7268;position:sticky;bottom:64px;background:#0b0e0c">
    replying to <span id="reply-target-label" style="color:#a7bcab"></span>: "<span id="reply-target-snippet"></span>"
    <button type="button" id="reply-cancel" class="reply-btn" style="margin-left:6px">[ cancel — reply to thread instead ]</button>
  </div>

  <form id="reply-form" style="border-top:1px solid #23302a;padding:16px 20px;display:flex;gap:10px;align-items:center;position:sticky;bottom:0;background:#0b0e0c">
    <span style="font-size:18px;color:#7bd88f">&gt;</span>
    <input type="hidden" name="toNodeId" id="reply-to">
    <input name="body" placeholder="reply" autocomplete="off" style="flex:1 1 auto;background:transparent;border:none;outline:none;color:#eafaf0;font-family:'JetBrains Mono',monospace;font-size:17px;caret-color:#7bd88f">
    <button style="background:#152019;border:1px solid #2c4a37;color:#7bd88f;font-family:'JetBrains Mono',monospace;font-size:16px;padding:8px 14px;border-radius:3px;cursor:pointer">send</button>
  </form>

</div>
</x-dc-root>
<script>
(function () {
  function token() {
    var k = 'argument_token';
    var t = localStorage.getItem(k);
    if (!t) { t = crypto.randomUUID(); localStorage.setItem(k, t); }
    return t;
  }
  var slug = ${JSON.stringify(argumentRow.slug)};
  var rootNodeId = ${JSON.stringify(argumentRow.root_node_id)};
  var replyTo = document.getElementById('reply-to');
  var target = document.getElementById('reply-target');
  var targetLabel = document.getElementById('reply-target-label');
  var targetSnippet = document.getElementById('reply-target-snippet');
  replyTo.value = rootNodeId;

  // Every reply click shows the indicator, including a click on the root
  // claim itself — it's the oldest message on the page, and giving it a
  // silent no-op while every other reply gets visible feedback reads as
  // "the button doesn't work," not as "you're back to the default."
  function setTarget(id, label, snippetText) {
    replyTo.value = id;
    targetLabel.textContent = label;
    targetSnippet.textContent = snippetText;
    target.style.display = 'block';
  }

  function resetTarget() {
    replyTo.value = rootNodeId;
    target.style.display = 'none';
  }

  document.querySelectorAll('.reply-btn[data-to]').forEach(function (el) {
    el.addEventListener('click', function () {
      setTarget(el.dataset.to, el.dataset.label, el.dataset.snippet);
      document.querySelector('#reply-form input[name=body]').focus();
    });
  });
  document.getElementById('reply-cancel').addEventListener('click', resetTarget);
  document.getElementById('reply-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = e.target.body.value.trim();
    if (!body) return;
    fetch('/api/argument/' + slug + '/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Argument-Token': token() },
      body: JSON.stringify({ toNodeId: Number(replyTo.value), body: body }),
    }).then(function (r) {
      if (r.ok) location.reload();
      else r.json().then(function (j) { alert(j.error || 'Failed to post reply'); });
    });
  });
})();
</script>`;
  return page(argumentRow.title, body);
}

export function renderList(rows) {
  const items = rows.map((row) => `    <div style="padding:16px 0;border-bottom:1px solid #1a231d">
      <a href="/argument/${escapeHtml(row.slug)}" style="text-decoration:none">
        <div style="font-size:17px;font-weight:700;color:#eafaf0;line-height:1.4">${escapeHtml(row.title)}</div>
      </a>
      <div style="margin-top:5px;font-size:14px;color:#7f9186;line-height:1.5">${escapeHtml((row.excerpt ?? '').slice(0, 140))}</div>
      <div style="margin-top:8px;font-size:13px;color:#5f7268">owner <span style="color:#a7bcab">${escapeHtml(row.owner_label ?? '')}</span> · ${row.participants} participant${row.participants === 1 ? '' : 's'} · last reply ${relativeTime(row.last_activity)}</div>
    </div>`).join('\n\n');
  const body = `<div style="max-width:640px;margin:0 auto;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column">

  <div style="padding:18px 20px 14px;border-bottom:1px solid #23302a;display:flex;align-items:baseline;justify-content:space-between">
    <div>
      <div style="font-size:15px;color:#5f7268;letter-spacing:.04em">~/argument</div>
      <div style="margin-top:4px;font-size:13px;color:#4a6155">${rows.length} thread${rows.length === 1 ? '' : 's'}</div>
    </div>
    <a href="/argument/new" style="font-size:14px;color:#7bd88f;text-decoration:none;font-weight:700">[ + start new ]</a>
  </div>

  <div style="flex:1 1 auto;padding:0 20px">
${items || '    <div style="padding:24px 0;color:#5f7268">No threads yet.</div>'}
  </div>

</div>`;
  return page('Arguments', body);
}

export function regenerateThread(dbFile, slug) {
  const argumentRow = getArgument(dbFile, slug);
  if (!argumentRow) throw new Error(`Cannot regenerate unknown argument: ${slug}`);
  writeAtomic(path.join(siteDir, argumentRow.slug, 'index.html'), renderThread(argumentRow));
  return argumentRow;
}

export function regenerateList(dbFile) {
  const rows = listArguments(dbFile);
  writeAtomic(path.join(siteDir, 'index.html'), renderList(rows));
  return rows;
}

// Regenerates every thread page plus the list, so a template change
// (a code deploy) actually reaches already-existing pages instead of
// leaving them stale until their next reply. Call on startup.
export function regenerateAll(dbFile) {
  const rows = listArguments(dbFile);
  for (const row of rows) regenerateThread(dbFile, row.slug);
  writeAtomic(path.join(siteDir, 'index.html'), renderList(rows));
  return rows;
}
