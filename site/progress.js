// =====================================================================
// PLAYPILE :: site/progress.js - XP, LEVELS, BADGES, DAILY CHALLENGE
// =====================================================================
//
// Everything here is kept in this browser under `pd.site.*` keys. That
// prefix is the whole trick: account.js already treats every `pd.*` key
// as "your progress", so XP, badges, favourites and the daily streak go
// into profiles, save codes and (once cloud.json is filled) a cloud
// account with no extra wiring.
//
//   pd.site.stats    { xp, games:{slug:{plays,secs,first,last}}, days:{date:{t:{slug:secs},xpt}}, bestStreak }
//   pd.site.badges   { id: 'YYYY-MM-DD' }
//   pd.site.daily    { streak, best, last:'YYYY-MM-DD', done:{date:1}, today:{date,slug,kind,base} }
//   pd.site.favs     [slug, ...]
//   pd.site.avatar   'g0'..'g11'                      (site/avatar.js)
//   pd.recent        [slug, ...]                      (site/shell.js, older)
//
// XP IS FOR PLAYING, AND IT IS CAPPED. Time only counts while the play
// page is visible AND focused (the game frame having focus counts). Two
// XP a minute, at most 30 minutes per game per day and 240 time-XP per
// day in total, so leaving a tab open all night earns what an evening of
// playing does and no more. On top: 10 XP the first time you play a game,
// 50 for the daily challenge, and each badge's own reward.
//
// TOASTS LIVE ON THE SITE PAGE, never inside the game's frame, at the top
// centre (away from every ad slot), and a click on one only closes it.
import { GAMES } from '/site/catalogue.js';
import { avatarSvg, getAvatar, avatarFor } from '/site/avatar.js';

const K = { stats: 'pd.site.stats', badges: 'pd.site.badges', daily: 'pd.site.daily', favs: 'pd.site.favs' };
const TICK = 5;                     // seconds per activity sample
const GAME_DAY_CAP = 1800;          // seconds per game per day that earn XP
const DAY_XP_CAP = 240;             // time-XP per day, all games together
const DAILY_SECS = 180;             // "play X for 3 minutes"
const SCORE_ALT_SECS = 300;         // a score day can also be done by 5 minutes of play
// games that keep a plain best score in `pd.best.<slug>` (games/_deck/deck.js)
const SCORED = new Set(['crossing', 'drifter', 'hoops', 'merge', 'pipeworks', 'quickdraw', 'spike', 'stack', 'sweep']);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const catOf = (g) => g.cat || g.tag || 'Games';
const bySlug = (s) => GAMES.find((g) => g.slug === s);
const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* play on */ } };

export const dayKey = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const shiftDay = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };

// ---------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------
export function stats() {
  const s = rd(K.stats, {});
  return { xp: +s.xp || 0, games: s.games || {}, days: s.days || {}, bestStreak: +s.bestStreak || 0 };
}
function saveStats(s) {
  // keep four months of days; nothing older is ever read
  const cut = shiftDay(dayKey(), -120);
  for (const d of Object.keys(s.days)) if (d < cut) delete s.days[d];
  wr(K.stats, s);
}
export const best = (slug) => { try { return +localStorage.getItem('pd.best.' + slug) || 0; } catch (e) { return 0; } };
export const hasScore = (slug) => SCORED.has(slug) || best(slug) > 0;

/** level from XP: level 2 needs 100, each level after needs 50 more than the last */
export function levelOf(xp) {
  let level = 1, need = 100, left = Math.max(0, xp);
  while (left >= need) { left -= need; level++; need += 50; }
  return { level, into: left, need, pct: Math.round((left / need) * 100) };
}

export function totals(s = stats()) {
  const played = Object.keys(s.games).filter((k) => bySlug(k));
  const secs = played.reduce((n, k) => n + (s.games[k].secs || 0), 0);
  return { played: played.length, secs, streak: playStreak(s) };
}
export function playStreak(s = stats()) {
  let d = dayKey(), n = 0;
  if (!s.days[d]) d = shiftDay(d, -1);           // today not played yet: yesterday still counts
  while (s.days[d]) { n++; d = shiftDay(d, -1); }
  return n;
}
export const fmtTime = (secs) => {
  const m = Math.floor(secs / 60);
  if (m < 1) return secs > 0 ? 'under a minute' : '0 min';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
};
const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return 'just now';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
};

// ---------------------------------------------------------------------
// favourites
// ---------------------------------------------------------------------
export const favs = () => rd(K.favs, []).filter((s) => bySlug(s));
export const isFav = (slug) => favs().includes(slug);
export function toggleFav(slug) {
  const f = rd(K.favs, []).filter((s) => s !== slug);
  const on = !isFav(slug);
  if (on) f.unshift(slug);
  wr(K.favs, f.slice(0, 60));
  checkBadges();
  return on;
}

// ---------------------------------------------------------------------
// badges
// ---------------------------------------------------------------------
const ALLCATS = [...new Set(GAMES.map(catOf))];
export const BADGES = [
  { id: 'first', name: 'First game', desc: 'Play any game', xp: 25, ok: (c) => c.played >= 1 },
  { id: 'five', name: 'Five games', desc: 'Play five different games', xp: 50, ok: (c) => c.played >= 5 },
  { id: 'ten', name: 'Ten games', desc: 'Play ten different games', xp: 100, ok: (c) => c.played >= 10 },
  { id: 'explorer', name: 'Explorer', desc: 'Play 25 different games', xp: 200, ok: (c) => c.played >= 25 },
  { id: 'cats', name: 'Tried everything', desc: 'Play a game in every category', xp: 150, ok: (c) => c.cats >= ALLCATS.length },
  { id: 'hour', name: 'One hour in', desc: 'Play for an hour in total', xp: 75, ok: (c) => c.secs >= 3600 },
  { id: 'regular', name: 'Regular', desc: 'Play for ten hours in total', xp: 250, ok: (c) => c.secs >= 36000 },
  { id: 'marathon', name: 'Marathon', desc: 'Play one game for 30 minutes in a day', xp: 75, ok: (c) => c.marathon },
  { id: 'streak3', name: 'Three days running', desc: 'Play on three days in a row', xp: 50, ok: (c) => c.streak >= 3 },
  { id: 'streak7', name: 'Week streak', desc: 'Play on seven days in a row', xp: 150, ok: (c) => c.streak >= 7 },
  { id: 'daily1', name: 'Challenger', desc: 'Finish a daily challenge', xp: 50, ok: (c) => c.dailies >= 1 },
  { id: 'daily7', name: 'Daily devotee', desc: 'Finish the daily challenge seven days in a row', xp: 200, ok: (c) => c.dailyBest >= 7 },
  { id: 'fav', name: 'Favourite', desc: 'Add a game to your favourites', xp: 15, ok: (c) => c.favs >= 1 },
  { id: 'level5', name: 'Level 5', desc: 'Reach level 5', xp: 0, ok: (c) => c.level >= 5 },
  { id: 'level10', name: 'Level 10', desc: 'Reach level 10', xp: 0, ok: (c) => c.level >= 10 },
];
const BADGE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 9.2 8.9 2 9.6l5.4 4.7L5.8 21 12 17.3 18.2 21l-1.6-6.7L22 9.6l-7.2-.7z"/></svg>';
export const earned = () => rd(K.badges, {});

function context(s) {
  const t = totals(s);
  const d = rd(K.daily, {});
  const cats = new Set(Object.keys(s.games).map(bySlug).filter(Boolean).map(catOf));
  const marathon = Object.values(s.days).some((day) => Object.values(day.t || {}).some((v) => v >= 1800));
  return { ...t, cats: cats.size, marathon, streak: Math.max(t.streak, s.bestStreak),
    dailies: Object.keys(d.done || {}).length, dailyBest: Math.max(+d.best || 0, +d.streak || 0),
    favs: favs().length, level: levelOf(s.xp).level };
}

/** award anything newly earned; returns the new ones */
export function checkBadges() {
  const got = earned();
  const fresh = [];
  for (let pass = 0; pass < 2; pass++) {          // a badge's XP can level you into another
    const s = stats();
    const c = context(s);
    for (const b of BADGES) {
      if (got[b.id] || !b.ok(c)) continue;
      got[b.id] = dayKey();
      fresh.push(b);
      if (b.xp) addXp(b.xp, true);
    }
    wr(K.badges, got);
  }
  for (const b of fresh) toast('Badge: ' + b.name, b.desc + (b.xp ? ' · +' + b.xp + ' XP' : ''), BADGE_ICON);
  return fresh;
}

function addXp(n, quiet) {
  const s = stats();
  const before = levelOf(s.xp).level;
  s.xp += n;
  saveStats(s);
  const after = levelOf(s.xp).level;
  if (after > before) toast('Level ' + after + '!', 'You reached level ' + after + ' on PLAYPILE.', levelChip(after));
  else if (!quiet && n >= 10) toast('+' + n + ' XP', '', levelChip(after));
}
const levelChip = (l) => '<b class="pp-lvchip">' + l + '</b>';

// ---------------------------------------------------------------------
// the daily challenge
// ---------------------------------------------------------------------
// One game a day, picked from the DATE alone (same for everyone, same all
// day). Unity builds are skipped - an 83 MB download is not a daily ask.
function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function dailyPick(date = dayKey()) {
  const pool = GAMES.filter((g) => g.how !== 'unity').map((g) => g.slug).sort();
  const h = hash('playpile:' + date);
  const slug = pool[h % pool.length];
  const kind = SCORED.has(slug) && (h >>> 8) % 2 === 0 ? 'score' : 'time';
  return { date, slug, kind };
}
export function daily() {
  const date = dayKey();
  const d = rd(K.daily, {});
  let t = d.today;
  if (!t || t.date !== date) {
    t = { ...dailyPick(date), base: 0 };
    if (t.kind === 'score') t.base = best(t.slug);   // the best you had when the day began
    d.today = t;
    wr(K.daily, d);
  }
  const g = bySlug(t.slug);
  const s = stats();
  const secs = ((s.days[date] || {}).t || {})[t.slug] || 0;
  const done = !!(d.done || {})[date];
  const need = t.kind === 'score' ? SCORE_ALT_SECS : DAILY_SECS;
  const streak = d.last === date || d.last === shiftDay(date, -1) ? (+d.streak || 0) : 0;
  const goal = t.kind === 'score'
    ? (t.base > 0 ? 'Beat your best of ' + t.base.toLocaleString() + ', or play for 5 minutes'
                  : 'Set a score, or play for 5 minutes')
    : 'Play for 3 minutes';
  return { ...t, game: g, secs, need, done, streak, goal,
    pct: done ? 100 : Math.min(99, Math.round((secs / need) * 100)) };
}
function checkDaily(slug) {
  const t = daily();
  if (t.done || slug !== t.slug) return;
  const scored = t.kind === 'score' && best(t.slug) > t.base;
  if (!scored && t.secs < t.need) return;
  const d = rd(K.daily, {});
  d.done = d.done || {};
  d.done[t.date] = 1;
  for (const k of Object.keys(d.done)) if (k < shiftDay(t.date, -120)) delete d.done[k];
  d.streak = d.last === shiftDay(t.date, -1) ? (+d.streak || 0) + 1 : 1;
  d.best = Math.max(+d.best || 0, d.streak);
  d.last = t.date;
  wr(K.daily, d);
  toast('Daily challenge done', (d.streak > 1 ? d.streak + '-day streak · ' : '') + '+50 XP', BADGE_ICON);
  addXp(50, true);
}

// ---------------------------------------------------------------------
// playing: the only place XP for time is earned
// ---------------------------------------------------------------------
/** count a play of `slug` and start the activity clock; returns stop() */
export function trackPlay(slug) {
  const s = stats();
  const g = s.games[slug] || (s.games[slug] = { plays: 0, secs: 0, first: Date.now(), last: 0 });
  const isNewGame = !g.plays;
  g.plays++;
  g.last = Date.now();
  const day = s.days[dayKey()] || (s.days[dayKey()] = { t: {}, xpt: 0 });
  day.t[slug] = day.t[slug] || 0;
  s.bestStreak = Math.max(s.bestStreak, playStreak(s));
  saveStats(s);
  if (isNewGame) addXp(10, true);
  checkBadges();
  dispatchEvent(new CustomEvent('pp-progress'));
  const id = setInterval(() => {
    if (document.hidden || !document.hasFocus()) return;
    addTime(slug, TICK);
  }, TICK * 1000);
  return () => clearInterval(id);
}

/** add `secs` of active play to a game (the clock above, and the tools) */
export function addTime(slug, secs) {
  const s = stats();
  const today = dayKey();
  const day = s.days[today] || (s.days[today] = { t: {}, xpt: 0 });
  const g = s.games[slug] || (s.games[slug] = { plays: 1, secs: 0, first: Date.now(), last: Date.now() });
  const before = day.t[slug] || 0;
  secs = Math.min(secs, 4 * 3600 - before);       // four hours a day in one game is plenty to count
  if (secs <= 0) return;
  day.t[slug] = before + secs;
  g.secs = (g.secs || 0) + secs;
  g.last = Date.now();
  const xpBefore = Math.floor(Math.min(before, GAME_DAY_CAP) / 30);
  const xpAfter = Math.floor(Math.min(day.t[slug], GAME_DAY_CAP) / 30);
  const gain = Math.max(0, Math.min(xpAfter - xpBefore, DAY_XP_CAP - (day.xpt || 0)));
  day.xpt = (day.xpt || 0) + gain;
  s.bestStreak = Math.max(s.bestStreak, playStreak(s));
  saveStats(s);
  if (gain) addXp(gain, true);
  checkDaily(slug);
  checkBadges();
  dispatchEvent(new CustomEvent('pp-progress'));
}

// ---------------------------------------------------------------------
// toasts
// ---------------------------------------------------------------------
export function toast(title, sub, icon) {
  let box = document.querySelector('.pp-toasts');
  if (!box) { box = document.createElement('div'); box.className = 'pp-toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'pp-toast';
  t.innerHTML = '<span class="pp-ti">' + (icon || BADGE_ICON) + '</span><span><b>' + esc(title) + '</b>'
    + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>';
  const bye = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  t.addEventListener('click', bye);
  box.append(t);
  setTimeout(bye, 5000);
}

// ---------------------------------------------------------------------
// shared bits of markup
// ---------------------------------------------------------------------
const shot = (g) => '<img src="/shots/t/' + g.slug + '.webp" alt="" width="640" height="360" loading="lazy" decoding="async" onerror="this.remove()">';
function miniCard(g, meta) {
  return '<a class="card" href="/play/' + g.slug + '/" title="' + esc(g.title) + '">'
    + '<span class="thumb"><span class="ph">' + esc(g.title.slice(0, 2)) + '</span>' + shot(g)
    + '<span class="badge">' + esc(catOf(g)) + '</span><span class="hover"><span>PLAY</span></span></span>'
    + '<span class="cname">' + esc(g.title) + '</span><span class="cmeta">' + meta + '</span></a>';
}
const recentSlugs = () => rd('pd.recent', []).filter((s) => bySlug(s));

export function dailyCardHtml(t = daily()) {
  if (!t.game) return '';
  const g = t.game;
  return '<a class="pp-daily' + (t.done ? ' done' : '') + '" href="/play/' + g.slug + '/">'
    + '<span class="pp-dshot">' + shot(g) + '</span>'
    + '<span class="pp-dbody">'
    + '<span class="pp-kick">Daily challenge &middot; ' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })) + '</span>'
    + '<b class="pp-dtitle">' + esc(g.title) + '</b>'
    + '<span class="pp-dgoal">' + (t.done ? 'Done for today. Come back tomorrow for a new one.' : esc(t.goal)) + '</span>'
    + '<span class="pp-bar"><i style="width:' + t.pct + '%"></i></span>'
    + '<span class="pp-dfoot"><span class="pp-streak">' + flame + ' ' + (t.streak ? t.streak + '-day streak' : 'Start a streak today') + '</span>'
    + '<span class="pp-go">' + (t.done ? 'Play again' : 'Play now') + ' &rarr;</span></span>'
    + '</span></a>';
}
const flame = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3.2-.6 4.6-2 6-1.7 1.7-3 3.2-3 5.6A5.4 5.4 0 0 0 12 19a5.4 5.4 0 0 0 5-5.4c0-3-2-4.3-2-7-1 1.2-1.6 1.7-2.3 1.7C11.6 8.3 12.6 5.4 12 2z"/></svg>';

function meCardHtml() {
  const s = stats();
  const L = levelOf(s.xp);
  const acc = window.__playpileAccount && window.__playpileAccount.who();
  const name = acc && acc.mode !== 'guest' ? acc.name : 'Guest';
  const av = getAvatar() || avatarFor(name);
  const b = Object.keys(earned()).length;
  return '<a class="pp-mecard" href="/me/">'
    + avatarSvg(av, 52)
    + '<span class="pp-mebody"><b>' + esc(name) + '</b>'
    + '<span class="pp-lv">Level ' + L.level + ' &middot; ' + s.xp.toLocaleString() + ' XP</span>'
    + '<span class="pp-bar"><i style="width:' + L.pct + '%"></i></span>'
    + '<span class="pp-mesub">' + b + ' of ' + BADGES.length + ' badges &middot; ' + playStreak(s) + '-day play streak</span></span>'
    + '<span class="pp-go">Your profile &rarr;</span></a>';
}

// ---------------------------------------------------------------------
// HOME: daily challenge, your card, and the continue-playing row
// ---------------------------------------------------------------------
export function mountHome(el) {
  if (!el) return;
  const paint = () => {
    const s = stats();
    const rec = recentSlugs().slice(0, 8);
    el.innerHTML = '<div class="pp-homegrid">' + dailyCardHtml() + meCardHtml() + '</div>'
      + (rec.length
        ? '<section class="row pp-continue"><div class="rowhead"><h2>Continue playing</h2>'
          + '<span class="n">' + rec.length + '</span><a class="seeall" href="/me/">Your profile <span>&rsaquo;</span></a></div>'
          + '<div class="strip">' + rec.map((slug) => {
            const g = s.games[slug];
            const meta = g ? fmtTime(g.secs || 0) + ' played &middot; ' + ago(g.last || Date.now()) : 'played recently';
            return miniCard(bySlug(slug), meta);
          }).join('') + '</div></section>'
        : '');
  };
  paint();
  addEventListener('pp-account', paint);
}

// ---------------------------------------------------------------------
// PLAY PAGE: your stats for this game, favourite, the board
// ---------------------------------------------------------------------
export function mountPlay(el, slug) {
  if (!el) return;
  const g = bySlug(slug);
  const paint = async () => {
    const s = stats();
    const mine = s.games[slug] || { plays: 0, secs: 0 };
    const t = daily();
    const fav = isFav(slug);
    let html = '<div class="pp-gamebar">'
      + '<span class="pp-stat"><b>' + fmtTime(mine.secs || 0) + '</b><small>played</small></span>'
      + '<span class="pp-stat"><b>' + (mine.plays || 0) + '</b><small>' + (mine.plays === 1 ? 'session' : 'sessions') + '</small></span>'
      + (hasScore(slug) ? '<span class="pp-stat"><b>' + best(slug).toLocaleString() + '</b><small>your best</small></span>' : '')
      + '<span class="pp-sp"></span>'
      + '<button type="button" class="pp-fav' + (fav ? ' on' : '') + '" aria-pressed="' + fav + '">'
      + '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.4C12 6.1 13.4 5 15.4 5c3.4 0 5.5 3.4 4.1 6.7C19.5 16.4 12 21 12 21z"/></svg>'
      + (fav ? 'Favourite' : 'Add to favourites') + '</button></div>';
    if (t.slug === slug) {
      html += '<div class="pp-today' + (t.done ? ' done' : '') + '"><b>Today\'s daily challenge</b> '
        + (t.done ? 'done &mdash; nice.' : esc(t.goal) + '. <span class="pp-bar"><i style="width:' + t.pct + '%"></i></span>')
        + '</div>';
    }
    if (hasScore(slug)) html += '<div class="pp-board" id="ppBoard"><div class="pp-bhead"><b>Leaderboard</b><small>loading&hellip;</small></div></div>';
    el.innerHTML = html;
    el.querySelector('.pp-fav').onclick = () => { toggleFav(slug); paint(); };
    if (hasScore(slug)) drawBoard(el.querySelector('#ppBoard'), slug, g);
  };
  paint();
  addEventListener('pp-progress', () => {                 // cheap repaint of the numbers
    const bits = el.querySelectorAll('.pp-stat b');
    const mine = stats().games[slug] || {};
    if (bits[0]) bits[0].textContent = fmtTime(mine.secs || 0);
    if (bits[1]) bits[1].textContent = String(mine.plays || 0);
    const bar = el.querySelector('.pp-today .pp-bar i');
    if (bar) bar.style.width = daily().pct + '%';
  });
  addEventListener('pp-account', paint);
}

async function drawBoard(box, slug, g) {
  const A = window.__playpileAccount;
  let res = { scope: 'device', rows: [] };
  try { if (A && A.board) res = await A.board(slug); } catch (e) { /* show the device board */ }
  const rows = res.rows || [];
  const label = res.scope === 'global'
    ? 'Top scores from everyone signed in'
    : 'On this device only &middot; a global board appears when PLAYPILE accounts are switched on';
  box.innerHTML = '<div class="pp-bhead"><b>' + (res.scope === 'global' ? 'Global leaderboard' : 'Leaderboard') + '</b>'
    + '<small>' + label + '</small></div>'
    + (rows.length
      ? '<ol class="pp-rows">' + rows.slice(0, 10).map((r, i) => '<li class="' + (r.me ? 'me' : '') + '">'
        + '<span class="pp-rank">' + (i + 1) + '</span>' + avatarSvg(r.avatar || avatarFor(r.name), 24)
        + '<span class="pp-rname">' + esc(r.name || 'Player') + '</span>'
        + '<b>' + Number(r.score).toLocaleString() + '</b></li>').join('') + '</ol>'
      : '<p class="pp-empty">No scores yet. Play ' + esc(g.title) + ' and your best lands here.</p>');
}

// ---------------------------------------------------------------------
// THE PROFILE PAGE
// ---------------------------------------------------------------------
export function mountMe(el) {
  if (!el) return;
  const paint = () => {
    const s = stats();
    const t = totals(s);
    const L = levelOf(s.xp);
    const acc = window.__playpileAccount ? window.__playpileAccount.who() : { mode: 'guest', name: '' };
    const name = acc.mode !== 'guest' ? acc.name : 'Guest';
    const av = getAvatar() || avatarFor(name);
    const got = earned();
    const where = acc.mode === 'cloud'
      ? '<span class="pp-pill good">Saved to your account</span>'
      : acc.mode === 'local' ? '<span class="pp-pill warn">Saved on this device</span>'
      : '<span class="pp-pill">Playing as a guest &middot; saved on this device</span>';
    const fv = favs();
    const rec = recentSlugs();
    const top = Object.entries(s.games).filter(([k]) => bySlug(k))
      .sort((a, b) => (b[1].secs || 0) - (a[1].secs || 0)).slice(0, 5);
    const tile = (v, k) => '<div class="pp-tile"><b>' + v + '</b><small>' + k + '</small></div>';
    el.innerHTML =
      '<section class="pp-hero">' + avatarSvg(av, 88)
      + '<div class="pp-who"><h1>' + esc(name) + '</h1>' + where
      + '<div class="pp-lvrow"><b>Level ' + L.level + '</b><span>' + L.into + ' / ' + L.need + ' XP to level ' + (L.level + 1) + '</span></div>'
      + '<span class="pp-bar big"><i style="width:' + L.pct + '%"></i></span>'
      + '<div class="pp-acts"><button class="btn" type="button" id="ppEdit">'
      + (acc.mode === 'guest' ? 'Sign in or make a profile' : 'Edit name and picture') + '</button></div>'
      + '</div></section>'
      + '<div class="pp-tiles">'
      + tile(s.xp.toLocaleString(), 'total XP')
      + tile(t.played + '<i> / ' + GAMES.length + '</i>', 'games played')
      + tile(fmtTime(t.secs), 'time played')
      + tile(t.streak, 'day play streak')
      + tile(daily().streak, 'daily challenge streak')
      + tile(Object.keys(got).length + '<i> / ' + BADGES.length + '</i>', 'badges')
      + '</div>'
      + '<section class="row"><div class="rowhead"><h2>Today</h2></div>' + dailyCardHtml() + '</section>'
      + '<section class="row"><div class="rowhead"><h2>Badges</h2><span class="n">' + Object.keys(got).length + '</span></div>'
      + '<div class="pp-badges">' + BADGES.map((b) => '<div class="pp-badge' + (got[b.id] ? ' on' : '') + '">'
        + '<span class="pp-bi">' + BADGE_ICON + '</span><span><b>' + esc(b.name) + '</b><small>' + esc(b.desc)
        + (got[b.id] ? ' &middot; earned ' + got[b.id] : b.xp ? ' &middot; +' + b.xp + ' XP' : '') + '</small></span></div>').join('')
      + '</div></section>'
      + (fv.length ? '<section class="row"><div class="rowhead"><h2>Favourites</h2><span class="n">' + fv.length + '</span></div>'
        + '<div class="strip">' + fv.map((x) => miniCard(bySlug(x), fmtTime((s.games[x] || {}).secs || 0) + ' played')).join('') + '</div></section>'
        : '<section class="row"><div class="rowhead"><h2>Favourites</h2></div><p class="pp-empty">Tap <b>Add to favourites</b> under any game and it is kept here.</p></section>')
      + (rec.length ? '<section class="row"><div class="rowhead"><h2>Recently played</h2><span class="n">' + rec.length + '</span></div>'
        + '<div class="strip">' + rec.map((x) => { const g = s.games[x]; return miniCard(bySlug(x), g ? ago(g.last || Date.now()) : 'played recently'); }).join('') + '</div></section>' : '')
      + (top.length ? '<section class="row"><div class="rowhead"><h2>Most played</h2></div><ol class="pp-top">'
        + top.map(([k, v]) => '<li><a href="/play/' + k + '/">' + esc(bySlug(k).title) + '</a><span>' + fmtTime(v.secs || 0)
          + ' &middot; ' + v.plays + ' ' + (v.plays === 1 ? 'session' : 'sessions') + (hasScore(k) && best(k) ? ' &middot; best ' + best(k).toLocaleString() : '') + '</span></li>').join('')
        + '</ol></section>' : '')
      + '<p class="pp-fine">XP comes from time spent playing (two a minute, while the page is open and in front of you, up to 30 minutes per game per day), '
      + '10 XP the first time you play a game, 50 for each daily challenge and the reward on each badge. '
      + (acc.mode === 'cloud' ? 'All of it is saved to your account.' : 'All of it is kept in this browser. Use the save code in the account panel to move it to another device.')
      + '</p>';
    el.querySelector('#ppEdit').onclick = () => window.__playpileAccount && window.__playpileAccount.open();
  };
  paint();
  addEventListener('pp-account', paint);
}

// for the tools
window.__pp = { stats, daily, dailyPick, addTime, trackPlay, levelOf, checkBadges, toast, earned, favs, toggleFav };
