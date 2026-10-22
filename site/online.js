// =====================================================================
// PLAYPILE :: site/online.js - PLAY ONLINE, FROM THE GAME PAGE
// =====================================================================
//
// PLAYPILE is a static site on GitHub Pages: there is no server of ours,
// so online play is PEER TO PEER. Two browsers find each other through
// PeerJS's free public broker (0.peerjs.com), then talk directly over a
// WebRTC data channel. Public STUN servers find a route through home
// routers; PeerJS's public TURN relay is the fallback for the networks
// that block a direct route. Nothing to set up, no account, no cost.
// HOOPS, EGG WARS, SKY ACES and the others already worked this way; this
// file is the same idea once, for any game, with a proper lobby.
//
// WHAT LIVES HERE: the room, the code, the link, quick match, the ping
// and the screens for "waiting", "connected" and "your friend left".
// WHAT DOES NOT: the game. The game runs in the iframe and is told it is
// the HOST or the GUEST (?pponline=host|guest); the two talk through
// games/_shared/pplink.js. The HOST's game is the referee: it runs the
// match and sends the state; the GUEST's game sends its inputs and draws
// what it is told. So a slow guest can never desync the match.
//
// ROOM IDS on the broker are  playpile-v1-<slug>-<CODE>.  Quick match
// uses the slots  playpile-v1-<slug>-Q1 .. Q6:  try to join Q1; if nobody
// is there, wait in it yourself; if it is full, try Q2, and so on.
import { ONLINE } from '/site/multiplayer.js';

const LIB = '/games/_deck/peerjs.min.js';
const PFX = 'playpile-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // PeerJS's own free relay, for networks where no direct route exists
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
const QUICK_SLOTS = 6;
const HEARTBEAT = 1000;          // ms between pings
const LOST_AFTER = 6000;         // ms of silence before we call it

const roomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

let Peer = null;
function lib() {
  if (Peer) return Promise.resolve(Peer);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LIB; s.async = true;
    s.onload = () => { Peer = window.Peer; Peer ? res(Peer) : rej(new Error('no Peer')); };
    s.onerror = () => rej(new Error('the networking library did not load'));
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------------
// THE ROOM: one connection to one other player
// ---------------------------------------------------------------------
export class Room {
  constructor(slug, cb = {}) {
    this.slug = slug; this.cb = cb;
    this.peer = null; this.conn = null;
    this.role = null; this.code = ''; this.state = 'idle';
    this.ping = 0; this.heard = 0; this.timer = 0;
  }
  id(code) { return PFX + this.slug + '-' + code; }
  set(state, info) { if (this.state === 'closed') return; this.state = state; if (this.cb.status) this.cb.status(state, info); }

  // a Peer that is registered with the broker, or a rejection with .type
  async newPeer(id) {
    const P = await lib();
    return new Promise((res, rej) => {
      const p = id ? new P(id, { debug: 0, config: { iceServers: ICE } }) : new P({ debug: 0, config: { iceServers: ICE } });
      const t = setTimeout(() => { done(); try { p.destroy(); } catch (e) {} rej(Object.assign(new Error('the broker did not answer'), { type: 'timeout' })); }, 10000);
      const onOpen = () => { done(); res(p); };
      const onErr = (e) => { done(); try { p.destroy(); } catch (x) {} rej(e); };
      const done = () => { clearTimeout(t); p.off('open', onOpen); p.off('error', onErr); };
      p.on('open', onOpen); p.on('error', onErr);
    });
  }

  // ---- host: open a room and wait -------------------------------------
  async create() {
    this.role = 'host';
    this.set('opening');
    for (let i = 0; i < 5; i++) {
      const c = roomCode();
      try { this.peer = await this.newPeer(this.id(c)); this.code = c; break; }
      catch (e) { if (e.type !== 'unavailable-id') throw e; }   // code taken: roll again
    }
    if (this.state === 'closed') { this.destroy(); return null; }
    if (!this.peer) throw new Error('could not get a room code');
    this.listen();
    this.set('waiting', { code: this.code });
    return this.code;
  }
  listen() {
    this.peer.on('connection', (c) => {
      // one guest per room. A second one is told so politely.
      if (this.conn) { c.on('open', () => { try { c.send({ k: 'full' }); } catch (e) {} setTimeout(() => c.close(), 400); }); return; }
      this.conn = c;
      c.on('open', () => { c.send({ k: 'hello', v: 1, slug: this.slug }); this.attach(c); });
    });
    this.peer.on('error', (e) => { if (this.state === 'waiting' && e.type !== 'peer-unavailable') this.set('error', { msg: 'The room closed: ' + (e.type || 'network error') }); });
    // the broker dropping us does not end a match (the data goes direct),
    // but while waiting we need it to be found, so ask to be put back
    this.peer.on('disconnected', () => { if (this.state === 'waiting') { try { this.peer.reconnect(); } catch (e) {} } });
  }

  // ---- guest: dial a room ---------------------------------------------
  // resolves 'ok' | 'none' (nobody has that code) | 'full' | 'timeout'
  dial(id) {
    return new Promise((resolve) => {
      let over = false;
      const c = this.peer.connect(id, { reliable: true, serialization: 'json' });
      const finish = (r) => {
        if (over) return; over = true;
        clearTimeout(t); this.peer.off('error', onErr);
        if (r !== 'ok') { try { c.close(); } catch (e) {} }
        resolve(r);
      };
      const onErr = (e) => { if (e && e.type === 'peer-unavailable') finish('none'); };
      // THE TIMEOUT MATTERS: a code that exists but never answers would
      // otherwise sit on "connecting" for ever, which looks broken.
      const t = setTimeout(() => finish('timeout'), 9000);
      this.peer.on('error', onErr);
      c.on('data', (d) => {
        if (over || !d) return;
        if (d.k === 'hello') { this.conn = c; finish('ok'); this.attach(c); }
        else if (d.k === 'full') finish('full');
      });
    });
  }
  async join(code) {
    this.role = 'guest'; this.code = cleanCode(code);
    this.set('connecting', { code: this.code });
    this.peer = await this.newPeer();
    if (this.state === 'closed') { this.destroy(); return false; }
    const r = await this.dial(this.id(this.code));
    if (this.state === 'closed') { this.destroy(); return false; }
    if (r !== 'ok') {
      this.destroy();
      const msg = r === 'none' ? 'There is no room ' + this.code + '. Check the code, or ask your friend for a new link.'
        : r === 'full' ? 'Room ' + this.code + ' already has two players.'
        : 'Room ' + this.code + ' did not answer. Ask your friend to make a new room.';
      this.set('error', { msg });
      return false;
    }
    return true;
  }

  // ---- quick match ----------------------------------------------------
  async quick() {
    this.set('searching');
    this.peer = await this.newPeer();
    if (this.state === 'closed') { this.destroy(); return null; }
    this.role = 'guest';
    for (let n = 1, retried = false; n <= QUICK_SLOTS; n++) {
      const slot = 'Q' + n, id = this.id(slot);
      const r = await this.dial(id);
      if (this.state === 'closed') return null;
      if (r === 'ok') { this.code = slot; return 'guest'; }
      if (r === 'full' || r === 'timeout') continue;
      // nobody waiting in this slot: wait in it ourselves
      try {
        const hp = await this.newPeer(id);
        if (this.state === 'closed') { hp.destroy(); return null; }
        try { this.peer.destroy(); } catch (e) {}
        this.peer = hp; this.role = 'host'; this.code = slot;
        this.listen();
        this.set('waiting', { code: slot, quick: true });
        return 'host';
      } catch (e) {
        // somebody claimed it between our two tries: go and join them
        if (e.type === 'unavailable-id' && !retried) { retried = true; n--; continue; }
        retried = false;
      }
    }
    this.destroy();
    this.set('error', { msg: 'Quick match is busy right now. Make a room and send a friend the link instead.' });
    return null;
  }

  // ---- once connected -------------------------------------------------
  attach(c) {
    this.heard = performance.now();
    c.on('data', (d) => {
      if (!d) return;
      this.heard = performance.now();
      if (d.k === 'g') { if (this.cb.data) this.cb.data(d.d); }
      else if (d.k === 'ping') c.send({ k: 'pong', t: d.t });
      else if (d.k === 'pong') { this.ping = Math.round(performance.now() - d.t); if (this.cb.ping) this.cb.ping(this.ping); }
      else if (d.k === 'bye') this.lost('left');
    });
    c.on('close', () => this.lost('left'));
    c.on('error', () => this.lost('error'));
    c.on('iceStateChanged', (s) => { if (s === 'failed' || s === 'closed') this.lost('error'); });
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.state !== 'live') return;
      if (performance.now() - this.heard > LOST_AFTER) { this.lost('timeout'); return; }
      try { c.send({ k: 'ping', t: performance.now() }); } catch (e) {}
    }, HEARTBEAT);
    this.set('live', { role: this.role, code: this.code });
    try { c.send({ k: 'ping', t: performance.now() }); } catch (e) {}
  }
  send(d) { if (this.conn && this.conn.open && this.state === 'live') { try { this.conn.send({ k: 'g', d }); } catch (e) {} } }
  lost(why) {
    if (this.state !== 'live') return;
    this.destroy();
    this.set('lost', { why });
  }
  destroy() {
    clearInterval(this.timer);
    try { if (this.conn && this.conn.open) this.conn.send({ k: 'bye' }); } catch (e) {}
    const p = this.peer, c = this.conn;
    this.conn = null; this.peer = null;
    // give the 'bye' a moment to leave before the socket goes
    setTimeout(() => { try { c && c.close(); } catch (e) {} try { p && p.destroy(); } catch (e) {} }, 150);
  }
  close() { const was = this.state; this.state = 'closed'; if (was !== 'closed') this.destroy(); }
}

// ---------------------------------------------------------------------
// THE LOBBY ON THE PLAY PAGE
// ---------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param o.g        the catalogue entry
 * @param o.stage    the .stage element (the lobby is drawn over it)
 * @param o.frame    the game iframe
 * @param o.launch   (role) => void   start the game in the frame as 'host' | 'guest'
 * @param o.stop     () => void       take the game out of the frame
 * @param o.before   async () => void  run once before the lobby first opens (the ad gate)
 * @param o.pill     an element in the stage bar for the status and ping
 */
export function mountOnline(o) {
  const info = ONLINE[o.g.slug];
  if (!info || info.via !== 'site') return null;
  const box = document.createElement('div');
  box.className = 'ol'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Play online');
  o.stage.appendChild(box);
  const pill = o.pill;

  let room = null, ready = false, queue = [], opened = false;

  const linkFor = (code) => location.origin + location.pathname + '?room=' + code;
  const toGame = (m) => { try { o.frame.contentWindow.postMessage(m, '*'); } catch (e) {} };
  const status = (s) => toGame({ pp: 'net', t: 'status', s, ping: room ? room.ping : 0 });

  function setPill(kind, text) {
    if (!pill) return;
    pill.hidden = !kind;
    pill.className = 'olpill ' + (kind || '');
    pill.innerHTML = '<i></i>' + esc(text || '');
  }

  // the game asks for its role when it boots, and sends its messages
  addEventListener('message', (e) => {
    if (!room || e.source !== o.frame.contentWindow) return;
    const m = e.data;
    if (!m || m.pp !== 'net') return;
    if (m.t === 'ready') {
      ready = true;
      status(room.state === 'live' ? 'live' : 'lost');
      for (const d of queue) toGame({ pp: 'net', t: 'msg', d });
      queue = [];
    } else if (m.t === 'send') room.send(m.d);
    else if (m.t === 'leave') { room.close(); room = null; o.stop(); setPill(null); show('menu'); }
  });

  const cb = {
    data(d) { if (ready) toGame({ pp: 'net', t: 'msg', d }); else if (queue.length < 300) queue.push(d); },
    ping(ms) { setPill('live', 'Online · ' + (room.role === 'host' ? 'host' : 'guest') + ' · ' + ms + ' ms'); status('live'); },
    status(s, inf = {}) {
      if (s === 'opening' || s === 'connecting' || s === 'searching') {
        show('busy', s === 'searching' ? 'Looking for somebody to play…'
          : s === 'connecting' ? 'Joining room ' + inf.code + '…' : 'Making a room…');
        setPill('wait', s === 'searching' ? 'Searching' : 'Connecting');
      } else if (s === 'waiting') {
        show(inf.quick ? 'quickwait' : 'waiting', inf.code);
        setPill('wait', inf.quick ? 'Waiting for a player' : 'Room ' + inf.code + ' · waiting');
      } else if (s === 'live') {
        ready = false; queue = [];
        box.hidden = true;
        setPill('live', 'Online · ' + inf.role + ' · …');
        // a link only works once: take ?room off the address so Restart
        // or a reload does not try to join a room that has finished
        if (location.search.includes('room=')) history.replaceState(null, '', location.pathname + location.hash);
        o.launch(inf.role);
      } else if (s === 'lost') {
        status('lost');
        setPill('bad', 'Disconnected');
        show('lost', inf.why === 'left' ? 'Your friend left the match.' : 'The connection was lost.');
        room = null;
      } else if (s === 'error') {
        setPill(null);
        show('menu', null, inf.msg);
        room = null;
      }
    },
  };

  function fresh() { if (room) room.close(); room = new Room(o.g.slug, cb); return room; }

  // ---- the panel's screens --------------------------------------------
  function show(view, arg, err) {
    box.hidden = false;
    const close = '<button class="olx" data-a="close" type="button" aria-label="Close">&times;</button>';
    let h = '';
    if (view === 'menu') {
      h = close + '<h3>Play online</h3>'
        + '<p class="olsub">' + esc(o.g.title) + ' with a friend, browser to browser. No account, nothing to install.</p>'
        + (err ? '<p class="olerr" role="alert">' + esc(err) + '</p>' : '')
        + '<div class="olbtns">'
        + '<button class="btn" data-a="quick" type="button">Quick match</button>'
        + '<button class="btn ghost" data-a="create" type="button">Create a room</button></div>'
        + '<form class="oljoin" data-f="join"><label for="olcode">Got a code?</label>'
        + '<input id="olcode" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" inputmode="text">'
        + '<button class="btn ghost" type="submit">Join</button></form>'
        + (info.note ? '<p class="olnote">' + esc(info.note) + '</p>' : '');
    } else if (view === 'busy') {
      h = close + '<div class="olspin" aria-hidden="true"></div><p class="olsub" aria-live="polite">' + esc(arg) + '</p>'
        + '<button class="btn ghost" data-a="cancel" type="button">Cancel</button>';
    } else if (view === 'waiting') {
      const link = linkFor(arg);
      h = close + '<h3>Your room</h3>'
        + '<div class="olcode" aria-label="Room code">' + esc(arg) + '</div>'
        + '<p class="olsub">Send your friend this link, or tell them the code.</p>'
        + '<div class="ollink"><input readonly value="' + esc(link) + '" aria-label="Room link">'
        + '<button class="btn" data-a="copy" type="button">Copy link</button>'
        + (navigator.share ? '<button class="btn ghost" data-a="share" type="button">Share</button>' : '') + '</div>'
        + '<p class="olwait" aria-live="polite"><span class="olspin sm" aria-hidden="true"></span>Waiting for your friend to join…</p>'
        + '<button class="btn ghost" data-a="cancel" type="button">Cancel</button>';
    } else if (view === 'quickwait') {
      h = close + '<div class="olspin" aria-hidden="true"></div><h3>Waiting for a player</h3>'
        + '<p class="olsub">You are first in the queue for ' + esc(o.g.title) + '. The match starts the moment somebody else presses Quick match.</p>'
        + '<button class="btn ghost" data-a="cancel" type="button">Cancel</button>';
    } else if (view === 'lost') {
      h = '<h3>Match over</h3><p class="olsub" role="alert">' + esc(arg) + '</p>'
        + '<div class="olbtns"><button class="btn" data-a="again" type="button">Play online again</button>'
        + '<button class="btn ghost" data-a="solo" type="button">Play on my own</button></div>';
    }
    box.innerHTML = '<div class="olcard">' + h + '</div>';
    box.dataset.view = view;
    const inp = box.querySelector('#olcode');
    if (inp) inp.addEventListener('input', () => { inp.value = cleanCode(inp.value); });
  }

  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'quick') { const r = fresh(); r.quick().catch((x) => cb.status('error', { msg: brokerMsg(x) })); }
    else if (a === 'create') { const r = fresh(); r.create().catch((x) => cb.status('error', { msg: brokerMsg(x) })); }
    else if (a === 'copy') {
      const inp = box.querySelector('.ollink input');
      try { await navigator.clipboard.writeText(inp.value); } catch (x) { inp.select(); try { document.execCommand('copy'); } catch (y) {} }
      b.textContent = 'Copied';
      setTimeout(() => { if (b.isConnected) b.textContent = 'Copy link'; }, 1600);
    } else if (a === 'share') {
      const inp = box.querySelector('.ollink input');
      navigator.share({ title: o.g.title + ' on PLAYPILE', text: 'Play ' + o.g.title + ' with me', url: inp.value }).catch(() => {});
    } else if (a === 'cancel') { if (room) room.close(); room = null; setPill(null); show('menu'); }
    else if (a === 'close') { if (room) room.close(); room = null; setPill(null); box.hidden = true; }
    else if (a === 'again') { o.stop(); setPill(null); show('menu'); }
    else if (a === 'solo') { o.stop(); setPill(null); box.hidden = true; o.solo && o.solo(); }
  });
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = cleanCode(box.querySelector('#olcode').value);
    if (code.length !== 4) { show('menu', null, 'A room code is four letters or numbers.'); return; }
    joinCode(code);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden && box.dataset.view !== 'lost') box.querySelector('[data-a="close"]')?.click(); });
  addEventListener('pagehide', () => { if (room) room.close(); });

  function joinCode(code) { const r = fresh(); r.join(code).catch((x) => cb.status('error', { msg: brokerMsg(x) })); }
  const brokerMsg = (x) => (x && (x.type === 'network' || x.type === 'server-error' || x.type === 'timeout' || x.type === 'socket-error'))
    ? 'Could not reach the online service. Check your connection and try again.'
    : 'Could not connect' + (x && x.type ? ' (' + x.type + ')' : '') + '. Try again.';

  async function open() {
    if (!opened) { opened = true; if (o.before) await o.before(); }
    show('menu');
  }

  // arrived from a friend's link: go straight to joining
  const linked = cleanCode(new URLSearchParams(location.search).get('room'));
  if (linked.length === 4) { opened = true; joinCode(linked); }

  return { open, get room() { return room; }, linked: linked.length === 4 ? linked : '' };
}
