/* Shared by Caddy-served reading pages. Drafts stay in the current tab. */
(() => {
  'use strict';
  if (window.sosPassageDiscussion) return;
  window.sosPassageDiscussion = true;
  const draftKey = 'sos.argument.draft.v1';
  const normalize = text => text.replace(/\s+/gu, ' ').trim();
  const excluded = 'script,style,noscript,nav,header,footer,button,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],.sos-passage-tools,.sos-passage-status';
  const blockSelector = 'p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th,div,section';
  let tools, status, pending, dismissed = '', timer;
  const root = () => document.querySelector('.md-content__inner,[data-discussion-content],main,article');

  // Normalized reading text with DOM offsets, including block boundaries.
  function textIndex(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node, raw = '', points = [], previousBlock;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded) || !parent.getClientRects().length) continue;
      const block = parent.closest(blockSelector);
      if (previousBlock && block !== previousBlock) { raw += ' '; points.push(null); }
      previousBlock = block;
      raw += node.data;
      for (let i = 0; i < node.length; i++) points.push({node, offset: i});
    }
    let text = '', starts = [], ends = [], whitespace = false;
    for (let i = 0; i < raw.length; i++) {
      if (/\s/u.test(raw[i])) { whitespace = text.length > 0; continue; }
      if (whitespace) { text += ' '; starts.push(null); ends.push(null); whitespace = false; }
      text += raw[i]; starts.push(points[i]); ends.push(points[i]);
    }
    return {text, starts, ends};
  }
  function matches(text, quote) {
    const hits = [];
    for (let start = 0; (start = text.indexOf(quote, start)) !== -1; start++) {
      hits.push(start);
      if (hits.length > 1000) break;
    }
    return hits;
  }
  function notify(message) {
    if (!status) {
      status = document.createElement('div'); status.className = 'sos-passage-status';
      const text = document.createElement('span'); text.setAttribute('role', 'status');
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
      close.setAttribute('aria-label', 'Dismiss passage message');
      close.onclick = () => { status.hidden = true; };
      status.append(text, close); document.body.append(status);
    }
    status.firstChild.textContent = message; status.hidden = false;
  }
  function hide() { if (tools) tools.hidden = true; }
  function offer() {
    const selection = window.getSelection(), container = root();
    pending = null;
    if (!container || !selection?.rangeCount || selection.isCollapsed) return hide();
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer) ||
        range.startContainer.parentElement?.closest(excluded) || range.endContainer.parentElement?.closest(excluded)) return hide();
    const rawQuote = selection.toString().trim();
    const quote = normalize(rawQuote);
    if (!quote || rawQuote.length > 2000 || quote === dismissed) return hide();
    const index = textIndex(container);
    const start = matches(index.text, quote).find(i => {
      const point = index.starts[i];
      return point && range.isPointInRange(point.node, point.offset);
    });
    let heading = range.startContainer.parentElement?.closest('p[id],li[id],h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
    if (!heading) for (const candidate of container.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')) {
      if (candidate.contains(range.startContainer) || (candidate.compareDocumentPosition(range.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING)) heading = candidate;
    }
    const url = new URL(location.pathname + location.search, 'https://sosweb.org');
    // The Markdown viewer displays a note at its original /tecNotes/... URL.
    pending = {source: {
      url: url.href, title: document.title.slice(0, 300) || 'SOS Relay', quote: rawQuote,
      prefix: start == null ? '' : index.text.slice(Math.max(0, start - 120), start),
      suffix: start == null ? '' : index.text.slice(start + quote.length, start + quote.length + 120),
      anchor: (heading?.id || (location.hash.startsWith('#sos-passage=') ? '' : location.hash.slice(1))).slice(0, 300),
      language: document.documentElement.lang || '', capturedAt: new Date().toISOString(),
    }, title: '', body: ''};
    if (!tools) {
      tools = document.createElement('div'); tools.className = 'sos-passage-tools';
      const discuss = document.createElement('button'); discuss.type = 'button';
      discuss.textContent = 'Discuss this passage'; discuss.title = 'Discuss selected text (Alt+Shift+D)';
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
      close.setAttribute('aria-label', 'Dismiss discussion action');
      close.onclick = () => { dismissed = normalize(pending?.source.quote || ''); hide(); };
      tools.addEventListener('mousedown', event => event.preventDefault());
      discuss.onclick = () => {
        if (!pending) return;
        try {
          if (sessionStorage.getItem(draftKey) && !window.confirm('Replace the unfinished discussion draft in this tab?')) return;
          sessionStorage.setItem(draftKey, JSON.stringify(pending));
          location.assign('/argument/new/');
        } catch { notify('Your browser could not save this draft. Allow tab storage, then try again.'); }
      };
      tools.append(discuss, close); document.body.append(tools);
    }
    tools.hidden = false;
    const rect = range.getBoundingClientRect();
    tools.style.left = Math.max(8, Math.min(innerWidth - tools.offsetWidth - 8, rect.left)) + 'px';
    tools.style.top = Math.max(8, Math.min(innerHeight - tools.offsetHeight - 8, rect.bottom + 8)) + 'px';
  }
  function locatePassage() {
    if (window.CSS?.highlights) CSS.highlights.delete('sos-passage');
    if (!location.hash.startsWith('#sos-passage=')) return;
    const container = root();
    if (!container) return;
    let target;
    try { target = JSON.parse(decodeURIComponent(location.hash.slice(13))); } catch { return; }
    if (typeof target.quote !== 'string' || !target.quote || target.quote.length > 2000) return;
    if (container.textContent.trim() === 'Loading…') return; // async Markdown viewer
    const quote = normalize(target.quote), index = textIndex(container);
    let hits = matches(index.text, quote);
    if (hits.length > 1) hits = hits.filter(i =>
      (!target.prefix || normalize(index.text.slice(0, i)).endsWith(normalize(String(target.prefix)))) &&
      (!target.suffix || normalize(index.text.slice(i + quote.length)).startsWith(normalize(String(target.suffix)))));
    if (hits.length !== 1) {
      if (typeof target.anchor === 'string') document.getElementById(target.anchor)?.scrollIntoView();
      notify('The exact passage could not be located. The page may have changed, or the quotation may occur more than once.');
      return;
    }
    const first = index.starts[hits[0]], last = index.ends[hits[0] + quote.length - 1];
    if (!first || !last) return;
    const range = document.createRange(); range.setStart(first.node, first.offset); range.setEnd(last.node, last.offset + 1);
    if (window.Highlight && CSS.highlights) CSS.highlights.set('sos-passage', new Highlight(range));
    else { const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
    first.node.parentElement.scrollIntoView({block: 'center'});
    notify('Quoted passage located.');
  }
  function init() {
    document.addEventListener('selectionchange', () => {
      clearTimeout(timer); timer = setTimeout(offer, 200);
      if (getSelection()?.isCollapsed) dismissed = '';
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { dismissed = normalize(pending?.source.quote || ''); hide(); }
      if (event.altKey && event.shiftKey && event.code === 'KeyD') {
        offer(); if (tools && !tools.hidden) { event.preventDefault(); tools.firstChild.focus(); }
      }
    });
    window.addEventListener('scroll', hide, {passive: true});
    window.addEventListener('resize', hide);
    window.addEventListener('hashchange', locatePassage);
    locatePassage();
    // The Markdown viewer fetches its content after this script loads.
    const note = document.getElementById('note');
    if (note) new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(locatePassage, 100); }).observe(note, {childList: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
