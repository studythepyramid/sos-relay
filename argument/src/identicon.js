// Deterministic avatar from a token — same idea as labelForToken (db.js),
// same input, no user action required. A 5x5 grid mirrored left-right
// (classic GitHub-identicon shape), color and pattern both derived from
// one sha256 hash. Single source of truth: used both by render.js (baked
// into generated pages) and the /api/user profile endpoint (so the
// profile page's live preview matches exactly, without duplicating this
// logic in client-side JS).
import crypto from 'node:crypto';

export function identicon(token, size = 28) {
  const hash = crypto.createHash('sha256').update(String(token)).digest();
  const hue = hash[0] % 360;
  const bg = `hsl(${hue}, 45%, 22%)`;
  const fg = `hsl(${hue}, 60%, 62%)`;
  const cell = size / 5;
  let rects = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = hash[row * 3 + col + 1] & 1;
      if (!bit) continue;
      const y = (row * cell).toFixed(2);
      rects += `<rect x="${(col * cell).toFixed(2)}" y="${y}" width="${cell}" height="${cell}" fill="${fg}"/>`;
      if (col !== 2) {
        rects += `<rect x="${((4 - col) * cell).toFixed(2)}" y="${y}" width="${cell}" height="${cell}" fill="${fg}"/>`;
      }
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="avatar" style="border-radius:3px;flex-shrink:0"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
}
