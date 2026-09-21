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
const PREFIX = 'pd.';
const LOCAL_KEY = 'playpile.account';
const SAVE_EVERY = 20000;              // ms between automatic cloud saves

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
  try {
    const r = await fetch('/site/cloud.json', { cache: 'no-store' });
    // DRAIN THE BODY EVEN WHEN IT IS A 404. An unread response body leaves
    // the request open as far as the browser is concerned, so 'networkidle'
    // never arrives - which hung every page-level test on the site until it
    // timed out. Reading the four hundred bytes of a 404 page costs nothing.
    if (!r.ok) { try { await r.arrayBuffer(); } catch (e) { /* already gone */ } return null; }
    const c = await r.json();
    return c && c.apiKey && c.projectId ? c : null;
  } catch (e) { return null; }
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
  if (r.status === 404) return null;                 // a new account has no save yet
  if (!r.ok) throw new Error('could not read your save');
  const j = await r.json();
  const raw = j.fields && j.fields.data && j.fields.data.stringValue;
  return raw ? JSON.parse(raw) : null;
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
    try { await cloudPush(data); setNote('saved', 'good'); } catch (e) { setNote(e.message, 'bad'); }
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
function merge(localData, cloudData) {
  return { ...localData, ...cloudData };
}

// ---------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------
let ui = {};

function setNote(text, kind) {
  if (!ui.note) return;
  ui.note.textContent = text || '';
  ui.note.className = 'acc-note' + (kind ? ' ' + kind : '');
}

function render() {
  if (!ui.button) return;
  const signed = state.mode !== 'guest';
  ui.button.innerHTML = '';
  const dot = $('span', 'acc-dot');
  dot.style.background = state.mode === 'cloud' ? '#35d07f' : state.mode === 'local' ? '#ffb15e' : '#55617a';
  ui.button.append(dot, $('span', 'acc-name', signed ? state.name : 'Sign in'));
  ui.button.title = state.mode === 'cloud' ? 'signed in as ' + state.email
    : state.mode === 'local' ? 'playing as ' + state.name + ' on this device'
    : 'sign in to keep your progress';
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

function drawPanel() {
  const body = ui.body;
  body.innerHTML = '';
  if (state.mode !== 'guest') {
    body.append(
      row('Signed in as', state.mode === 'cloud' ? state.email : state.name + ' (this device)'),
      note(state.mode === 'cloud'
        ? 'Your scores, coins and unlocks are saved to your account and follow you to any browser you sign in on.'
        : 'This profile is saved in this browser. Use the save code below to carry it to another device.'),
    );
    const bSave = $('button', 'acc-btn', 'Save now');
    bSave.onclick = async () => { await saveNow('force'); setNote('saved', 'good'); };
    const bOut = $('button', 'acc-btn ghost', 'Sign out');
    bOut.onclick = async () => { await saveNow('force'); signOut(); drawPanel(); };
    body.append(buttons(bSave, bOut), codeBlock());
    return;
  }

  // ---- signed out: the two ways in ------------------------------------
  const tabs = $('div', 'acc-tabs');
  const tSignIn = $('button', 'acc-tab on', 'Sign in');
  const tSignUp = $('button', 'acc-tab', 'Create account');
  tabs.append(tSignIn, tSignUp);
  const form = $('div', 'acc-form');
  const email = input('email', 'Email', 'you@example.com');
  const pass = input('password', 'Password', 'six characters or more');
  const name = input('text', 'Player name', 'three letters or a nickname');
  const go = $('button', 'acc-btn', 'Sign in');
  let mode = 'in';
  const paint = () => {
    form.innerHTML = '';
    tSignIn.classList.toggle('on', mode === 'in');
    tSignUp.classList.toggle('on', mode === 'up');
    go.textContent = mode === 'in' ? 'Sign in' : 'Create account';
    if (cloud) {
      form.append(email.wrap, pass.wrap);
      if (mode === 'up') form.append(name.wrap);
    } else {
      form.append(note('Accounts that follow you between devices are not switched on for this site yet. '
        + 'You can still make a PROFILE here, which keeps your progress in this browser, and carry it '
        + 'to another device with the save code below.'), name.wrap);
    }
    form.append(go);
  };
  tSignIn.onclick = () => { mode = 'in'; paint(); };
  tSignUp.onclick = () => { mode = 'up'; paint(); };
  go.onclick = async () => {
    setNote('');
    try {
      if (!cloud) {
        const who = (name.el.value || '').trim();
        if (!who) return setNote('pick a name first', 'bad');
        localSignIn(who);
      } else if (mode === 'up') {
        await cloudSignUp(email.el.value.trim(), pass.el.value, (name.el.value || '').trim());
      } else {
        await cloudSignIn(email.el.value.trim(), pass.el.value);
      }
      drawPanel();
    } catch (e) { setNote(e.message, 'bad'); }
  };
  paint();
  body.append(tabs, form);

  // the profiles already on this machine
  const names = Object.keys(profiles);
  if (names.length) {
    const list = $('div', 'acc-list');
    list.append($('div', 'acc-label', 'Profiles on this device'));
    for (const n of names) {
      const b = $('button', 'acc-chip', n);
      b.onclick = () => { localSignIn(n); drawPanel(); };
      list.append(b);
    }
    body.append(list);
  }
  body.append(codeBlock());
}

const row = (k, v) => { const d = $('div', 'acc-row'); d.append($('span', 'acc-label', k), $('b', null, v)); return d; };
const note = (t) => $('p', 'acc-small', t);
const buttons = (...b) => { const d = $('div', 'acc-buttons'); d.append(...b); return d; };
function input(type, label, placeholder) {
  const wrap = $('label', 'acc-field');
  wrap.append($('span', 'acc-label', label));
  const el = document.createElement('input');
  el.type = type; el.placeholder = placeholder; el.autocomplete = type === 'password' ? 'current-password' : 'on';
  wrap.append(el);
  return { wrap, el };
}

/** the copy-it-to-another-device block, which works in every mode */
function codeBlock() {
  const wrap = $('div', 'acc-code');
  wrap.append($('div', 'acc-label', 'Save code'));
  const ta = document.createElement('textarea');
  ta.rows = 3;
  ta.readOnly = false;
  ta.placeholder = 'paste a code here to load it';
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
      setNote('loaded - your games will see it next time they open', 'good');
    } catch (e) { setNote('that code did not read', 'bad'); }
  };
  wrap.append(buttons(copy, load));
  return wrap;
}

// ---------------------------------------------------------------------
// signing in and out
// ---------------------------------------------------------------------
function localSignIn(name) {
  saveNow('force');
  state = { mode: 'local', name, email: '', uid: '', idToken: '', refreshToken: '', expires: 0 };
  if (profiles[name]) apply(profiles[name]);
  else profiles[name] = collect();
  lastPrint = fingerprint(collect());
  persist();
  render();
  setNote('playing as ' + name, 'good');
}

async function cloudSignUp(email, password, name) {
  const j = await idCall('signUp', { email, password });
  state = { mode: 'cloud', name: name || email.split('@')[0], email, uid: j.localId,
    idToken: j.idToken, refreshToken: j.refreshToken, expires: Date.now() + Number(j.expiresIn) * 1000 };
  persist();
  await saveNow('force');                 // whatever is on this device becomes the first save
  render();
  setNote('account made - your progress is saved', 'good');
}

async function cloudSignIn(email, password) {
  const j = await idCall('signInWithPassword', { email, password });
  state = { mode: 'cloud', name: email.split('@')[0], email, uid: j.localId,
    idToken: j.idToken, refreshToken: j.refreshToken, expires: Date.now() + Number(j.expiresIn) * 1000 };
  persist();
  const remote = await cloudPull();
  if (remote) { apply(merge(collect(), remote)); setNote('progress loaded', 'good'); }
  else { await saveNow('force'); setNote('signed in', 'good'); }
  lastPrint = fingerprint(collect());
  render();
}

function signOut() {
  state = { mode: 'guest', name: '', email: '', uid: '', idToken: '', refreshToken: '', expires: 0 };
  persist();
  render();
  setNote('signed out - this device keeps its own scores', '');
}

// ---------------------------------------------------------------------
// start up
// ---------------------------------------------------------------------
function build() {
  const slot = document.getElementById('accountSlot');
  if (!slot) return;
  ui.button = $('button', 'acc-button');
  ui.button.onclick = openPanel;
  slot.append(ui.button);

  ui.shade = $('div', 'acc-shade');
  ui.shade.onclick = closePanel;
  ui.panel = $('div', 'acc-panel');
  const head = $('div', 'acc-head');
  head.append($('h2', null, 'Your progress'));
  const x = $('button', 'acc-x', '×');
  x.onclick = closePanel;
  head.append(x);
  ui.body = $('div', 'acc-body');
  ui.note = $('div', 'acc-note');
  ui.panel.append(head, ui.body, ui.note);
  document.body.append(ui.shade, ui.panel);
  render();
}

async function start() {
  const saved = store.read();
  profiles = saved.profiles || {};
  if (saved.state && saved.state.mode && saved.state.mode !== 'guest') state = { ...state, ...saved.state };
  build();
  cloud = await loadCloudConfig();
  render();
  if (state.mode === 'cloud' && state.refreshToken) {
    try {
      const remote = await cloudPull();
      if (remote) apply(merge(collect(), remote));
      lastPrint = fingerprint(collect());
    } catch (e) { signOut(); }
  }
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
  who: () => ({ mode: state.mode, name: state.name, email: state.email, cloud: !!cloud }),
  open: openPanel,
  save: () => saveNow('force'),
  profiles: () => Object.keys(profiles),
  localSignIn,
  signOut,
  code: () => encode(collect()),
  loadCode: (c) => { apply(merge(collect(), decode(c))); return true; },
};
