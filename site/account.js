// =====================================================================
// PLAYPILE :: site/account.js - SIGN IN, AND KEEP YOUR PROGRESS
// =====================================================================
//
// Liam: "make it so people can sign up to save their progress on games".
//
// WHAT A SAVE IS HERE. Every game on PLAYPILE keeps its scores, its names,
// its coins and its unlocks in the browser's own local storage, under keys
// that all begin `pd.` - that prefix is load-bearing and has been since the
// first game shipped. So "your progress" is simply every `pd.*` key on this
// device, and an account is somewhere to keep a copy of them.
//
// TWO MODES, AND THE SITE PICKS WHICHEVER IT CAN
//
//   LOCAL PROFILES (always available, nothing to set up)
//     Several named players share one browser. Each profile owns its own
//     snapshot of the `pd.*` keys; switching profile swaps them over. Your
//     progress can also be copied to another device by hand as a SAVE CODE
//     - a compressed blob you paste in on the other machine.
//
//   CLOUD ACCOUNTS (once `site/cloud.json` exists)
//     A real email-and-password account whose save lives on a server, so it
//     follows you to your phone. PLAYPILE is a static site - a folder of
//     files on a CDN with nobody at home - so it cannot run accounts
//     itself; it borrows Google's Firebase, which has a free tier that
//     signs people in and stores a document per player. See ACCOUNTS.md for
//     the five-minute setup and the security rule that stops one player
//     reading another's save. Until that file exists the sign-in panel says
//     so honestly rather than pretending.
//
// WHAT IS NEVER DONE HERE: no tracking, no analytics, no third-party
// scripts. The only network calls in this file go to Google's identity and
// Firestore endpoints, and only when somebody has actually signed in.
//
// 2026-10-14: the panel was redesigned (name + picture, honest "saved on
// this device" / "saved to your account" states), progress merges
// sensibly per key, and best scores go to a public Firestore leaderboard
// (leaderboards/{game}/scores/{uid}) once cloud accounts are on.
import { AVATARS, avatarSvg, avatarFor, getAvatar, setAvatar } from '/site/avatar.js';

const PREFIX = 'pd.';
const LOCAL_KEY = 'playpile.account';
const SAVE_EVERY = 20000;              // ms between automatic cloud saves
const SCORE_CAP = 10000000;            // the same ceiling the Firestore rules enforce

const $ = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

// ---------------------------------------------------------------------
// the progress itself
// ---------------------------------------------------------------------
function collect() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out[k] = localStorage.getItem(k);
    }
  } catch (e) { /* a blocked store means there is nothing to save */ }
  return out;
}
function apply(data) {
  if (!data) return;
  try {
    // clear what is there first, or a profile switch leaves the previous
    // player's scores behind in any game the new one has never opened
    const mine = Object.keys(collect());
    for (const k of mine) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  } catch (e) { /* ditto */ }
}
const fingerprint = (data) => Object.keys(data).length + ':' + Object.values(data).join('').length;

// a save code: the progress, JSON, squeezed and made paste-able
const encode = (data) => btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/=+$/, '');
const decode = (code) => JSON.parse(decodeURIComponent(escape(atob(code.trim()))));

// ---------------------------------------------------------------------
// where the account lives
// ---------------------------------------------------------------------
const store = {
  read() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch (e) { return {}; } },
  write(v) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch (e) { /* play on */ } },
};

let cloud = null;                      // { apiKey, projectId } once loaded
let state = {                          // who is playing
  mode: 'guest',                       // 'guest' | 'local' | 'cloud'
  name: '',
  email: '',
  uid: '',
  idToken: '',
  refreshToken: '',
  expires: 0,
};
let profiles = {};                     // local mode: name -> save
let lastPrint = '';
let saveTimer = 0;

async function loadCloudConfig() {
  // ALWAYS READ THE WHOLE BODY, whatever the status, and give up after
  // five seconds. An unread body (a 404 page, or an HTML fallback where
  // JSON was expected) leaves the request open as far as the browser is
  // concerned, so 'networkidle' never arrives and every page-level tool
  // on the site waits for ever. text() drains it; the abort guarantees
  // the request ends even on a host that never finishes answering.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 5000);
  try {
    const r = await fetch('/site/cloud.json', { cache: 'no-store', signal: stop.signal });
    const text = await r.text();
    if (!r.ok) return null;
    const c = JSON.parse(text);
    return c && c.apiKey && c.projectId ? c : null;
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------------
// Google's identity endpoints, called with plain fetch. No SDK: the whole
// of what this site needs is three POSTs, and a megabyte of library to
// make them would be the biggest thing on the page.
// ---------------------------------------------------------------------
const idURL = (m) => 'https://identitytoolkit.googleapis.com/v1/accounts:' + m + '?key=' + cloud.apiKey;

async function idCall(method, body) {
  const r = await fetch(idURL(method), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(friendly(j && j.error && j.error.message));
  return j;
}

/** Google's error strings are shouty constants; these are for a person */
function friendly(code) {
  switch (code) {
    case 'EMAIL_EXISTS': return 'that email already has an account - try signing in';
    case 'EMAIL_NOT_FOUND': return 'no account with that email';
    case 'INVALID_PASSWORD': case 'INVALID_LOGIN_CREDENTIALS': return 'wrong email or password';
    case 'WEAK_PASSWORD : Password should be at least 6 characters': return 'the password needs six characters or more';
    case 'INVALID_EMAIL': return 'that does not look like an email address';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER': return 'too many tries - wait a minute';
    default: return code ? code.toLowerCase().replace(/_/g, ' ') : 'something went wrong';
  }
}

async function freshToken() {
  if (state.mode !== 'cloud') return '';
  if (Date.now() < state.expires - 60000) return state.idToken;
  const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + cloud.apiKey, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(state.refreshToken),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('signed out');
  state.idToken = j.id_token;
  state.refreshToken = j.refresh_token;
  state.expires = Date.now() + Number(j.expires_in || 3600) * 1000;
  persist();
  return state.idToken;
}

const docURL = () => 'https://firestore.googleapis.com/v1/projects/' + cloud.projectId
  + '/databases/(default)/documents/players/' + state.uid;

async function cloudPull() {
  const token = await freshToken();
  const r = await fetch(docURL(), { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 404) { await r.text(); return null; }   // a new account has no save yet
  if (!r.ok) { await r.text(); throw new Error('could not read your save'); }
  const j = await r.json();
  const raw = j.fields && j.fields.data && j.fields.data.stringValue;
  const nm = j.fields && j.fields.name && j.fields.name.stringValue;
  if (nm) state.name = nm;                          // the name chosen at sign-up, on any device
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------------
// LEADERBOARDS: leaderboards/{game}/scores/{uid}
// ---------------------------------------------------------------------
// One document per player per game, holding their best. Anyone can read
// a board; only the signed-in owner can write their own entry, and the
// rules in ACCOUNTS.md cap the score and the shape of the document.
// The score is the game's own `pd.best.<slug>` key.
const fsBase = () => 'https://firestore.googleapis.com/v1/projects/' + cloud.projectId + '/databases/(default)/documents';
const bestOf = (data, slug) => Math.min(SCORE_CAP, Math.max(0, Math.floor(+data['pd.best.' + slug] || 0)));

async function pushScores(data) {
  const sent = store.read().sent || {};
  const mine = sent[state.uid] || {};
  for (const k of Object.keys(data)) {
    if (!k.startsWith('pd.best.')) continue;
    const slug = k.slice(8);
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) continue;
    const score = bestOf(data, slug);
    if (!score || score <= (mine[slug] || 0)) continue;
    const token = await freshToken();
    const fields = {
      uid: { stringValue: state.uid },
      name: { stringValue: (state.name || 'Player').slice(0, 24) },
      avatar: { stringValue: getAvatar() || avatarFor(state.name) },
      score: { integerValue: String(score) },
      updated: { timestampValue: new Date().toISOString() },
    };
    const mask = Object.keys(fields).map((f) => 'updateMask.fieldPaths=' + f).join('&');
    const r = await fetch(fsBase() + '/leaderboards/' + slug + '/scores/' + state.uid + '?' + mask, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    await r.text();
    if (r.ok) mine[slug] = score;
  }
  const s = store.read();
  s.sent = { ...(s.sent || {}), [state.uid]: mine };
  store.write(s);
}

/** the board for one game: global top ten when cloud is on, else this device's profiles */
async function board(slug) {
  if (cloud) {
    try {
      const r = await fetch(fsBase() + '/leaderboards/' + slug + ':runQuery?key=' + cloud.apiKey, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'scores' }],
          orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }], limit: 10 } }),
      });
      const j = await r.json();
      if (r.ok) {
        const rows = (Array.isArray(j) ? j : []).filter((x) => x.document).map((x) => {
          const f = x.document.fields || {};
          return { name: f.name && f.name.stringValue, avatar: f.avatar && f.avatar.stringValue,
            score: +(f.score && f.score.integerValue) || 0, me: !!(f.uid && f.uid.stringValue === state.uid) };
        });
        return { scope: 'global', rows };
      }
    } catch (e) { /* fall through to the device board */ }
  }
  return { scope: 'device', rows: deviceBoard(slug) };
}

function deviceBoard(slug) {
  const rows = [];
  const live = collect();
  const meName = state.mode === 'guest' ? 'You' : state.name;
  for (const [n, data] of Object.entries(profiles)) {
    if (state.mode === 'local' && n === state.name) continue;   // the live copy is newer
    const sc = bestOf(data, slug);
    if (sc) rows.push({ name: n, avatar: data['pd.site.avatar'] || avatarFor(n), score: sc });
  }
  const mine = bestOf(live, slug);
  if (mine) rows.push({ name: meName, avatar: getAvatar() || avatarFor(meName), score: mine, me: true });
  return rows.sort((a, b) => b.score - a.score);
}

async function cloudPush(data) {
  const token = await freshToken();
  const body = {
    fields: {
      data: { stringValue: JSON.stringify(data) },
      updated: { integerValue: String(Date.now()) },
      name: { stringValue: state.name || '' },
    },
  };
  const r = await fetch(docURL() + '?updateMask.fieldPaths=data&updateMask.fieldPaths=updated&updateMask.fieldPaths=name', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('could not save');
}

// ---------------------------------------------------------------------
// keeping the two in step
// ---------------------------------------------------------------------
function persist() {
  const s = store.read();
  s.state = { ...state, idToken: undefined };        // the short-lived token is not worth keeping
  s.profiles = profiles;
  store.write(s);
}

async function saveNow(reason) {
  const data = collect();
  const print = fingerprint(data);
  if (print === lastPrint && reason !== 'force') return;
  lastPrint = print;
  if (state.mode === 'local') {
    profiles[state.name] = data;
    persist();
  } else if (state.mode === 'cloud') {
    try { await cloudPush(data); await pushScores(data); setNote('saved to your account', 'good'); }
    catch (e) { setNote(e.message, 'bad'); }
  }
}

/**
 * MERGING TWO SAVES. There is no clever answer: a player who played on
 * their phone and then on a laptop has two piles of scores and neither is
 * "right". So the rule is per KEY and it is the honest one - whichever
 * copy is there, and when both are there, the CLOUD copy wins, because
 * that is the one the player has been carrying around. Anything the cloud
 * has never heard of (a game only played on this machine) survives.
 */
//
// Except for the keys where a better answer is obvious: a BEST SCORE is
// the higher of the two, and the site's own XP/badges/favourites/daily
// records combine rather than one copy wiping out the other.
function merge(localData, cloudData) {
  const out = { ...localData, ...cloudData };
  for (const k of Object.keys(out)) {
    if (!(k in localData) || !(k in cloudData)) continue;
    const a = localData[k], b = cloudData[k];
    try {
      if (k.startsWith('pd.best.')) out[k] = String(Math.max(+a || 0, +b || 0));
      else if (k === 'pd.site.stats') out[k] = JSON.stringify(mergeStats(JSON.parse(a), JSON.parse(b)));
      else if (k === 'pd.site.badges') out[k] = JSON.stringify({ ...JSON.parse(a), ...JSON.parse(b) });
      else if (k === 'pd.site.favs') out[k] = JSON.stringify([...new Set([...JSON.parse(b), ...JSON.parse(a)])]);
      else if (k === 'pd.site.daily') {
        const x = JSON.parse(a), y = JSON.parse(b);
        const later = (x.last || '') > (y.last || '') ? x : y;
        out[k] = JSON.stringify({ ...later, best: Math.max(+x.best || 0, +y.best || 0), done: { ...(x.done || {}), ...(y.done || {}) } });
      }
    } catch (e) { /* a key that will not parse keeps the cloud copy */ }
  }
  return out;
}
function mergeStats(a, b) {
  const games = { ...(a.games || {}) };
  for (const [k, v] of Object.entries(b.games || {})) {
    const u = games[k] || {};
    games[k] = { plays: Math.max(u.plays || 0, v.plays || 0), secs: Math.max(u.secs || 0, v.secs || 0),
      first: Math.min(u.first || Infinity, v.first || Infinity), last: Math.max(u.last || 0, v.last || 0) };
  }
  const days = { ...(a.days || {}) };
  for (const [d, v] of Object.entries(b.days || {})) {
    const u = days[d] || { t: {}, xpt: 0 };
    const t = { ...u.t };
    for (const [s, n] of Object.entries(v.t || {})) t[s] = Math.max(t[s] || 0, n);
    days[d] = { t, xpt: Math.max(u.xpt || 0, v.xpt || 0) };
  }
  return { xp: Math.max(+a.xp || 0, +b.xp || 0), games, days, bestStreak: Math.max(+a.bestStreak || 0, +b.bestStreak || 0) };
}

// ---------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------
// Three honest states, always said in words, never only in colour:
//   guest   "Playing as a guest - saved on this device"
//   local   "Saved on this device"         (a profile; cloud is not on)
//   cloud   "Saved to your account"        (follows you to other devices)
let ui = {};
const changed = () => dispatchEvent(new CustomEvent('pp-account'));

function setNote(text, kind) {
  if (!ui.note) return;
  ui.note.textContent = text || '';
  ui.note.className = 'acc-note' + (kind ? ' ' + kind : '');
}

const myAvatar = () => getAvatar() || avatarFor(state.name || 'guest');

function render() {
  if (!ui.button) return;
  const signed = state.mode !== 'guest';
  ui.button.innerHTML = signed ? avatarSvg(myAvatar(), 26) : '';
  if (!signed) ui.button.append($('span', 'acc-dot'));
  const dot = signed ? $('span', 'acc-mode ' + state.mode) : null;
  if (dot) ui.button.append(dot);
  ui.button.append($('span', 'acc-name', signed ? state.name : 'Sign in'));
  ui.button.title = state.mode === 'cloud' ? 'signed in as ' + state.email + ' - saved to your account'
    : state.mode === 'local' ? 'playing as ' + state.name + ' - saved on this device'
    : 'sign in to keep your progress';
  ui.button.setAttribute('aria-label', ui.button.title);
}

function openPanel() {
  ui.shade.classList.add('on');
  ui.panel.classList.add('on');
  drawPanel();
}
function closePanel() {
  ui.shade.classList.remove('on');
  ui.panel.classList.remove('on');
}

/** a row of the twelve pictures; returns { el, value() } */
function avatarPicker(current) {
  let pick = current;
  const el = $('div', 'acc-avs');
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', 'Choose a picture');
  for (const id of AVATARS) {
    const b = $('button', 'acc-av' + (id === pick ? ' on' : ''));
    b.type = 'button';
    b.innerHTML = avatarSvg(id, 36);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === pick));
    b.setAttribute('aria-label', 'picture ' + (AVATARS.indexOf(id) + 1));
    b.onclick = () => {
      pick = id;
      el.querySelectorAll('.acc-av').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
    };
    el.append(b);
  }
  return { el, value: () => pick };
}

function statusPill() {
  return state.mode === 'cloud' ? $('span', 'acc-pill good', 'Saved to your account')
    : state.mode === 'local' ? $('span', 'acc-pill warn', 'Saved on this device')
    : $('span', 'acc-pill', 'Guest · saved on this device');
}

function levelLine() {
  const P = window.__pp;
  if (!P) return null;
  const s = P.stats();
  const L = P.levelOf(s.xp);
  const d = $('a', 'acc-level');
  d.href = '/me/';
  d.innerHTML = '<span><b>Level ' + L.level + '</b> · ' + s.xp.toLocaleString() + ' XP</span>'
    + '<span class="acc-bar"><i style="width:' + L.pct + '%"></i></span><span class="acc-more">View your profile &rarr;</span>';
  return d;
}

function drawPanel() {
  const body = ui.body;
  body.innerHTML = '';
  setNote('');
  if (state.mode !== 'guest') return drawSignedIn(body);

  // ---- signed out: make one, or come back to one -----------------------
  const who = $('div', 'acc-who');
  who.innerHTML = avatarSvg(myAvatar(), 48);
  const wt = $('div');
  wt.append($('b', null, 'Playing as a guest'), statusPill());
  who.append(wt);
  body.append(who);

  const tabs = $('div', 'acc-tabs');
  tabs.setAttribute('role', 'tablist');
  const tUp = $('button', 'acc-tab on', cloud ? 'Create account' : 'New profile');
  const tIn = $('button', 'acc-tab', cloud ? 'Sign in' : 'Switch profile');
  tUp.type = tIn.type = 'button';
  tabs.append(tUp, tIn);
  const form = $('form', 'acc-form');
  let mode = 'up';
  const paint = () => {
    form.innerHTML = '';
    tUp.classList.toggle('on', mode === 'up');
    tIn.classList.toggle('on', mode === 'in');
    tUp.setAttribute('aria-selected', String(mode === 'up'));
    tIn.setAttribute('aria-selected', String(mode === 'in'));
    if (mode === 'up') {
      const name = input('text', 'Player name', 'a nickname, not your real name', 'username');
      name.el.maxLength = 24;
      const av = avatarPicker(myAvatar());
      const pickWrap = $('div', 'acc-field');
      pickWrap.append($('span', 'acc-label', 'Picture'), av.el);
      form.append(name.wrap, pickWrap);
      let email, pass;
      if (cloud) {
        email = input('email', 'Email', 'you@example.com', 'email');
        pass = input('password', 'Password', 'six characters or more', 'new-password');
        form.append(email.wrap, pass.wrap);
      } else {
        form.append(note('Your progress is saved on this device. Accounts that follow you to other '
          + 'devices are not switched on yet; to move your progress, use a save code below.'));
      }
      const go = $('button', 'acc-btn wide', cloud ? 'Create account' : 'Create profile');
      go.type = 'submit';
      form.append(go);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const nm = cleanName(name.el.value);
        if (!nm) return setNote('pick a player name first', 'bad');
        setAvatar(av.value());
        go.disabled = true;
        try {
          if (cloud) await cloudSignUp(email.el.value.trim(), pass.el.value, nm);
          else {
            if (profiles[nm]) return setNote('there is already a profile called ' + nm + ' - switch to it instead', 'bad');
            localSignIn(nm, true);
          }
          drawPanel();
        } catch (err) { setNote(err.message, 'bad'); }
        finally { go.disabled = false; }
      };
    } else if (cloud) {
      const email = input('email', 'Email', 'you@example.com', 'email');
      const pass = input('password', 'Password', '', 'current-password');
      const go = $('button', 'acc-btn wide', 'Sign in');
      go.type = 'submit';
      form.append(email.wrap, pass.wrap, go);
      form.onsubmit = async (e) => {
        e.preventDefault();
        go.disabled = true;
        try { await cloudSignIn(email.el.value.trim(), pass.el.value); drawPanel(); }
        catch (err) { setNote(err.message, 'bad'); }
        finally { go.disabled = false; }
      };
    } else {
      form.onsubmit = (e) => e.preventDefault();
      form.append(profileList('Profiles on this device') || note('No profiles on this device yet. Make one with New profile.'));
    }
  };
  tUp.onclick = () => { mode = 'up'; paint(); };
  tIn.onclick = () => { mode = 'in'; paint(); };
  paint();
  body.append(tabs, form);
  if (cloud) { const pl = profileList('Or play as a profile on this device'); if (pl) body.append(pl); }
  body.append(codeBlock());
}

function drawSignedIn(body) {
  const who = $('div', 'acc-who');
  who.innerHTML = avatarSvg(myAvatar(), 56);
  const wt = $('div');
  wt.append($('b', null, state.name), statusPill());
  if (state.mode === 'cloud') wt.append($('small', null, state.email));
  who.append(wt);
  body.append(who);
  const lv = levelLine();
  if (lv) body.append(lv);
  body.append(note(state.mode === 'cloud'
    ? 'Your scores, XP, badges and unlocks are saved to your account and follow you to any browser you sign in on.'
    : 'Your progress is saved on this device, in this browser. Use a save code to carry it to another device.'));

  // ---- name and picture -------------------------------------------------
  const ed = $('details', 'acc-edit');
  ed.append($('summary', null, 'Change name or picture'));
  const name = input('text', 'Player name', '', 'username');
  name.el.value = state.name;
  name.el.maxLength = 24;
  const av = avatarPicker(myAvatar());
  const save = $('button', 'acc-btn small', 'Save changes');
  save.type = 'button';
  save.onclick = async () => {
    const nm = cleanName(name.el.value);
    if (!nm) return setNote('a name cannot be empty', 'bad');
    if (state.mode === 'local' && nm !== state.name) {
      if (profiles[nm]) return setNote('another profile already has that name', 'bad');
      profiles[nm] = profiles[state.name] || collect();
      delete profiles[state.name];
    }
    state.name = nm;
    setAvatar(av.value());
    resetSent();
    persist();
    await saveNow('force');
    render(); changed(); drawPanel();
    setNote('saved', 'good');
  };
  ed.append(name.wrap, av.el, buttons(save));
  body.append(ed);

  const bSave = $('button', 'acc-btn', 'Save now');
  bSave.onclick = async () => { await saveNow('force'); setNote(state.mode === 'cloud' ? 'saved to your account' : 'saved on this device', 'good'); };
  const bOut = $('button', 'acc-btn ghost', 'Sign out');
  bOut.onclick = async () => { await saveNow('force'); signOut(); drawPanel(); };
  body.append(buttons(bSave, bOut));
  if (state.mode === 'local') { const pl = profileList('Switch profile'); if (pl) body.append(pl); }
  body.append(codeBlock());
}

const cleanName = (v) => String(v || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
function resetSent() { const s = store.read(); if (s.sent) { delete s.sent[state.uid]; store.write(s); } }

function profileList(label) {
  const names = Object.keys(profiles).filter((n) => !(state.mode === 'local' && n === state.name));
  if (!names.length) return null;
  const list = $('div', 'acc-list');
  list.append($('div', 'acc-label', label));
  for (const n of names) {
    const b = $('button', 'acc-chip');
    b.type = 'button';
    const a = (profiles[n] && profiles[n]['pd.site.avatar']) || avatarFor(n);
    b.innerHTML = avatarSvg(a, 20);
    b.append($('span', null, n));
    b.onclick = () => { localSignIn(n); drawPanel(); };
    list.append(b);
  }
  return list;
}

const row = (k, v) => { const d = $('div', 'acc-row'); d.append($('span', 'acc-label', k), $('b', null, v)); return d; };
void row;
const note = (t) => $('p', 'acc-small', t);
const buttons = (...b) => { const d = $('div', 'acc-buttons'); d.append(...b); return d; };
function input(type, label, placeholder, auto) {
  const wrap = $('label', 'acc-field');
  wrap.append($('span', 'acc-label', label));
  const el = document.createElement('input');
  el.type = type; el.placeholder = placeholder || ''; el.autocomplete = auto || 'on';
  if (type === 'email' || type === 'password') el.required = true;
  wrap.append(el);
  return { wrap, el };
}

/** the copy-it-to-another-device block, which works in every mode */
function codeBlock() {
  const wrap = $('details', 'acc-code');
  wrap.append($('summary', null, 'Move progress with a save code'));
  wrap.append(note('Copy a code here, paste it on another device, and your scores, XP and badges load there. Nothing is sent anywhere.'));
  const ta = document.createElement('textarea');
  ta.rows = 3;
  ta.placeholder = 'paste a code here to load it';
  ta.setAttribute('aria-label', 'save code');
  wrap.append(ta);
  const copy = $('button', 'acc-btn small', 'Copy my progress');
  copy.onclick = async () => {
    ta.value = encode(collect());
    ta.select();
    try { await navigator.clipboard.writeText(ta.value); setNote('copied', 'good'); }
    catch (e) { setNote('select it and copy', ''); }
  };
  const load = $('button', 'acc-btn small ghost', 'Load a code');
  load.onclick = async () => {
    try {
      const data = decode(ta.value);
      apply(merge(collect(), data));
      await saveNow('force');
      changed();
      setNote('loaded - your games will see it next time they open', 'good');
    } catch (e) { setNote('that code did not read', 'bad'); }
  };
  wrap.append(buttons(copy, load));
  return wrap;
}

// ---------------------------------------------------------------------
// signing in and out
// ---------------------------------------------------------------------
// `fresh` = a brand-new profile that should keep what this browser
// already has (a guest's scores become the new profile's first save).
function localSignIn(name, fresh) {
  saveNow('force');
  state = { mode: 'local', name, email: '', uid: '', idToken: '', refreshToken: '', expires: 0 };
  if (profiles[name] && !fresh) apply(profiles[name]);
  else profiles[name] = collect();
  lastPrint = fingerprint(collect());
  persist();
  render();
  changed();
  setNote('playing as ' + name + ' - saved on this device', 'good');
}

async function cloudSignUp(email, password, name) {
  const j = await idCall('signUp', { email, password });
  state = { mode: 'cloud', name: name || email.split('@')[0], email, uid: j.localId,
    idToken: j.idToken, refreshToken: j.refreshToken, expires: Date.now() + Number(j.expiresIn) * 1000 };
  persist();
  await saveNow('force');                 // whatever is on this device becomes the first save
  render();
  changed();
  setNote('account made - your progress is saved to your account', 'good');
}

async function cloudSignIn(email, password) {
  const j = await idCall('signInWithPassword', { email, password });
  state = { mode: 'cloud', name: email.split('@')[0], email, uid: j.localId,
    idToken: j.idToken, refreshToken: j.refreshToken, expires: Date.now() + Number(j.expiresIn) * 1000 };
  persist();
  const remote = await cloudPull();
  persist();
  if (remote) { apply(merge(collect(), remote)); setNote('progress loaded from your account', 'good'); }
  else { await saveNow('force'); setNote('signed in - saved to your account', 'good'); }
  lastPrint = fingerprint(collect());
  render();
  changed();
}

function signOut() {
  state = { mode: 'guest', name: '', email: '', uid: '', idToken: '', refreshToken: '', expires: 0 };
  persist();
  render();
  changed();
  setNote('signed out - this device keeps its own scores', '');
}

// ---------------------------------------------------------------------
// start up
// ---------------------------------------------------------------------
function build() {
  const slot = document.getElementById('accountSlot');
  if (!slot) return;
  ui.button = $('button', 'acc-button');
  ui.button.type = 'button';
  ui.button.onclick = openPanel;
  slot.append(ui.button);

  ui.shade = $('div', 'acc-shade');
  ui.shade.onclick = closePanel;
  ui.panel = $('div', 'acc-panel');
  ui.panel.setAttribute('role', 'dialog');
  ui.panel.setAttribute('aria-label', 'Your account');
  const head = $('div', 'acc-head');
  head.append($('h2', null, 'Your progress'));
  const x = $('button', 'acc-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.onclick = closePanel;
  head.append(x);
  ui.body = $('div', 'acc-body');
  ui.note = $('div', 'acc-note');
  ui.note.setAttribute('aria-live', 'polite');
  ui.panel.append(head, ui.body, ui.note);
  document.body.append(ui.shade, ui.panel);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.panel.classList.contains('on')) closePanel(); });
  render();
}

let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });

async function start() {
  const saved = store.read();
  profiles = saved.profiles || {};
  if (saved.state && saved.state.mode && saved.state.mode !== 'guest') state = { ...state, ...saved.state };
  build();
  cloud = await loadCloudConfig();
  if (state.mode === 'cloud' && !cloud) signOut();      // cloud switched off again: say so, do not pretend
  render();
  if (state.mode === 'cloud' && state.refreshToken) {
    try {
      const remote = await cloudPull();
      if (remote) apply(merge(collect(), remote));
      lastPrint = fingerprint(collect());
      render();
    } catch (e) { signOut(); }
  }
  readyResolve();
  changed();
  // AUTOSAVE, quietly. A game writes its scores whenever it likes, so this
  // watches for the pile of `pd.` keys changing rather than asking games to
  // announce anything - and it always saves on the way out of the page,
  // which is the moment that actually matters.
  setInterval(() => { if (state.mode !== 'guest') saveNow('auto'); }, SAVE_EVERY);
  addEventListener('pagehide', () => { if (state.mode !== 'guest') saveNow('auto'); });
  addEventListener('visibilitychange', () => { if (document.hidden && state.mode !== 'guest') saveNow('auto'); });
  void saveTimer;
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
else start();

// for the tools, and for a game that wants to know who is playing
window.__playpileAccount = {
  who: () => ({ mode: state.mode, name: state.name, email: state.email, cloud: !!cloud, avatar: myAvatar() }),
  ready,
  open: openPanel,
  save: () => saveNow('force'),
  profiles: () => Object.keys(profiles),
  board: async (slug) => { await ready; return board(slug); },
  localSignIn,
  signOut,
  code: () => encode(collect()),
  loadCode: (c) => { apply(merge(collect(), decode(c))); changed(); return true; },
};
