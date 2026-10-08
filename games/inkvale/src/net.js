// net.js - TWO WARDENS: playing Inkvale with a friend.
//
// Liam (2026-10-07): "add in a multiplayer for playpile.net".
//
// PlayPile is a static site - a folder of files, no game server - so this is
// peer to peer, the same way HOOPS does it. One player HOSTS: their browser
// runs the battle and is the referee. The other JOINS with a four-letter
// code. A free public broker (PeerJS) introduces the two browsers and then
// steps aside; after that everything goes straight between them over WebRTC.
//
//   guest -> host   { hi: {hero, xp} }       once, on joining
//                   { cmd: {...} }           a build, upgrade, spell, order...
//   host  -> guest  { start: {...} }         the battle the host picked
//                   { s: snapshot }          ~12 a second while it runs
//                   { lobby: {...} }         host back on the map
//
// If the broker is down, the code will not connect - and the screen says so
// rather than sitting on "connecting..." for ever.
const PREFIX = 'playpile-inkvale-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1

let PeerLib = null;
function peerLib() {
  if (PeerLib) return Promise.resolve(PeerLib);
  if (window.Peer) { PeerLib = window.Peer; return Promise.resolve(PeerLib); }
  // peerjs is a UMD bundle: loaded as a plain script it defines window.Peer
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => (window.Peer ? resolve(PeerLib = window.Peer) : reject(new Error('the networking library did not load')));
    s.onerror = () => reject(new Error('the networking library did not load'));
    document.head.appendChild(s);
  });
}
const roomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  constructor() {
    this.role = null;          // 'host' | 'guest'
    this.code = '';
    this.peer = null;
    this.conn = null;          // the one connection, either way round
    this.live = false;
    this.status = '';
    this.partner = null;       // host: what the guest told us {hero, xp}
    this.handlers = {};        // name -> fn(msg)
  }
  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, v) { const f = this.handlers[name]; if (f) f(v); }
  say(text) { this.status = text; this.emit('status', text); }

  /** open a room; resolves with the code once the broker has it */
  async host() {
    const Peer = await peerLib();
    this.role = 'host';
    this.code = roomCode();
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + this.code, { debug: 0 });
      this.peer = peer;
      peer.on('error', (e) => {
        if (e && e.type === 'unavailable-id') { peer.destroy(); this.host().then(resolve, reject); return; }
        this.say('Could not open a room (' + (e?.type || e) + ').');
        reject(e);
      });
      peer.on('open', () => { this.say('Waiting for your partner...'); resolve(this.code); });
      peer.on('connection', (c) => {
        if (this.conn && this.conn.open) { c.close(); return; }       // two wardens, no more
        c.on('open', () => {
          this.conn = c; this.live = true;
          c.send({ hello: true });
          this.say('Your partner is here.');
        });
        c.on('data', (d) => this.recv(d));
        c.on('close', () => { if (this.conn === c) { this.live = false; this.conn = null; this.partner = null; this.say('Your partner left.'); this.emit('leave'); } });
      });
    });
  }

  /** join a room by its code */
  async join(code, hi) {
    const Peer = await peerLib();
    this.role = 'guest';
    this.code = String(code || '').toUpperCase().trim();
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, { debug: 0 });
      this.peer = peer;
      let done = false;
      const bail = (msg) => { if (done) return; done = true; this.say(msg); reject(new Error(msg)); };
      peer.on('error', (e) => bail(e && e.type === 'peer-unavailable' ? 'No room with that code.' : 'Could not connect.'));
      peer.on('open', () => {
        const c = peer.connect(PREFIX + this.code, { reliable: true });
        this.conn = c;
        const t = setTimeout(() => bail('No answer from that room.'), 10000);
        c.on('data', (d) => {
          if (d && d.hello) {
            clearTimeout(t); done = true; this.live = true;
            c.send({ hi });
            this.say('Connected. The host is choosing a battle.');
            resolve();
            return;
          }
          this.recv(d);
        });
        c.on('close', () => { this.live = false; this.say('The host left.'); this.emit('leave'); });
      });
    });
  }

  recv(d) {
    if (!d) return;
    if (d.hi) { this.partner = d.hi; this.emit('hi', d.hi); }
    else if (d.cmd) this.emit('cmd', d.cmd);
    else if (d.start) this.emit('start', d.start);
    else if (d.s) this.emit('snap', d.s);
    else if (d.lobby) this.emit('lobby', d.lobby);
  }
  send(o) { if (this.conn && this.conn.open) this.conn.send(o); }

  close() {
    try { if (this.conn) this.conn.close(); } catch (e) { /* going anyway */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ditto */ }
    this.conn = null; this.peer = null; this.live = false; this.role = null; this.partner = null;
  }
}
