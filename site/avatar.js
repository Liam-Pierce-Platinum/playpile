// =====================================================================
// PLAYPILE :: site/avatar.js - the twelve player pictures
// =====================================================================
// Drawn here as tiny SVGs in the site's own colours, so there is no
// upload, no image host and nothing to moderate. A player's choice is a
// short id kept in `pd.site.avatar`, which means it travels with their
// progress (profiles, save codes and cloud accounts all carry pd.* keys).
const BG = ['#22d37a', '#2f7df6', '#ffb15e', '#ff6b8b', '#9b7bff', '#18b6c9'];
const FACES = {
  // each one is drawn on a 40x40 tile, in near-black on the colour
  bot:   '<rect x="10" y="12" width="20" height="17" rx="4"/><rect x="19" y="6" width="2" height="6"/><circle cx="20" cy="6" r="2"/>'
       + '<circle cx="15.5" cy="20" r="2.4" fill="#fff"/><circle cx="24.5" cy="20" r="2.4" fill="#fff"/><rect x="15" y="25" width="10" height="2" rx="1" fill="#fff"/>',
  cat:   '<path d="M9 30V13l6 5h10l6-5v17a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"/><circle cx="16" cy="23" r="2" fill="#fff"/><circle cx="24" cy="23" r="2" fill="#fff"/><path d="M18.5 27h3l-1.5 1.6z" fill="#fff"/>',
  ghost: '<path d="M10 33V19a10 10 0 0 1 20 0v14l-3.4-2.6L23.3 33 20 30.4 16.7 33l-3.3-2.6z"/><circle cx="16" cy="20" r="2.4" fill="#fff"/><circle cx="24" cy="20" r="2.4" fill="#fff"/>',
  alien: '<ellipse cx="20" cy="21" rx="11" ry="12"/><ellipse cx="15" cy="21" rx="3.4" ry="2.2" fill="#fff" transform="rotate(25 15 21)"/><ellipse cx="25" cy="21" rx="3.4" ry="2.2" fill="#fff" transform="rotate(-25 25 21)"/>',
  blob:  '<path d="M8 27c0-9 5-17 12-17s12 8 12 17c0 4-5 6-12 6S8 31 8 27z"/><circle cx="16" cy="22" r="2.2" fill="#fff"/><circle cx="24" cy="22" r="2.2" fill="#fff"/><path d="M16 27q4 3 8 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  star:  '<path d="M20 6l4 9 9.6.9-7.3 6.4 2.2 9.5L20 26.8l-8.5 5 2.2-9.5-7.3-6.4L16 15z"/><circle cx="17" cy="19" r="1.6" fill="#fff"/><circle cx="23" cy="19" r="1.6" fill="#fff"/>',
};
const KEYS = Object.keys(FACES);

/** every avatar there is: 'g0'..'g11' */
export const AVATARS = Array.from({ length: 12 }, (_, i) => 'g' + i);

/** a stable default for a name, so a new player has one without choosing */
export function avatarFor(name) {
  let h = 2166136261;
  for (const c of String(name || 'player')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return AVATARS[(h >>> 0) % AVATARS.length];
}

export function avatarSvg(id, size = 40) {
  const i = Math.max(0, AVATARS.indexOf(id));
  const bg = BG[i % BG.length];
  const face = FACES[KEYS[(i + Math.floor(i / 6) * 3) % KEYS.length]];
  return '<svg class="pp-av" viewBox="0 0 40 40" width="' + size + '" height="' + size + '" aria-hidden="true">'
    + '<rect width="40" height="40" rx="12" fill="' + bg + '"/>'
    + '<g fill="#061325">' + face + '</g></svg>';
}

export function getAvatar() {
  try { const v = localStorage.getItem('pd.site.avatar'); return AVATARS.includes(v) ? v : ''; } catch (e) { return ''; }
}
export function setAvatar(id) {
  try { localStorage.setItem('pd.site.avatar', id); } catch (e) { /* play on */ }
}
