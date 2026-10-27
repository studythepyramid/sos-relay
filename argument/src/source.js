// Reader-supplied source snapshots; never fetch a submitted URL on the server.
export function normalizeSource(source) {
  if (source == null) return null;
  if (typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid source passage');
  function text(key, max, required = false) {
    const value = source[key];
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
      throw new Error(`Invalid source ${key} (maximum ${max} characters)`);
    }
    return value.trim();
  }
  const url = new URL(text('url', 2048, true));
  if (url.protocol !== 'https:' || url.hostname !== 'sosweb.org' || url.port || url.username || url.password ||
      /^\/(api|user|my|mymd|share|publicMsg)(\/|$)/i.test(decodeURIComponent(url.pathname)) ||
      /(?:^|\/)\.[^/]/.test(decodeURIComponent(url.pathname))) {
    throw new Error('Source must be a public https://sosweb.org page');
  }
  url.hash = '';
  const capturedAt = text('capturedAt', 32, true);
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('Invalid source capture time');
  return {
    url: url.href, title: text('title', 300, true), quote: text('quote', 2000, true),
    prefix: text('prefix', 120), suffix: text('suffix', 120),
    anchor: text('anchor', 300), language: text('language', 35),
    capturedAt: new Date(capturedAt).toISOString(),
  };
}

export function sourceReturnUrl(source) {
  return source.url + '#sos-passage=' + encodeURIComponent(JSON.stringify({
    quote: source.quote, prefix: source.prefix, suffix: source.suffix, anchor: source.anchor,
  }));
}
