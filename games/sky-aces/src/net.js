// SKY ACES online transport. PLAYPILE is a static site (GitHub Pages): no game server can run
// there, so online play is PEER TO PEER, the same arrangement as playdeck's HOOPS (games/hoops/net.js):
//   - one player HOSTS: their browser runs the whole match and is the referee
//   - the others JOIN with a short room code; the free public PeerJS broker only introduces the
//     browsers, after that the data goes straight between them over WebRTC
//   - if the host leaves, the match is over; if the broker is down, the room cannot open and we
//     say so (the VS AI modes need nothing and still work)
// Two transports behind one interface:
//   'peer'  - PeerJS (vendor/peerjs.min.js, loaded on demand)
//   'loop'  - a BroadcastChannel between tabs of the same browser (?net=loop). Used by
//             tools/online.mjs when the broker is unreachable, and handy for local testing.
// Interface (both): host() -> code, join(code) -> resolves once the host accepted us,
//   send(id, msg), broadcast(msg), sendHost(msg), close(). Callbacks: onOpen(id), onData(id, msg),
//   onLeave(id) (host side), onLost(reason) (guest side: host gone / connection dropped).
const PREFIX = 'playpile-skyaces-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export const roomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

let PeerLib = null;
async function peerLib() {
  if (PeerLib) return PeerLib;
  // peerjs ships as a UMD bundle: importing it runs it, and it sets window.Peer
  await import('../vendor/peerjs.min.js');
  PeerLib = window.Peer;
  if (!PeerLib) throw new Error('the networking library did not load');
  return PeerLib;
}

class Base {
  constructor(o = {}) { Object.assign(this, o); this.role = null; this.code = ''; this.conns = new Map(); this.nextId = 1; this.closed = false; }
  _open(id) { this.onOpen && this.onOpen(id); }
  _data(id, d) { this.onData && this.onData(id, d); }
  _leave(id) { if (!this.conns.has(id)) return; this.conns.delete(id); this.onLeave && this.onLeave(id); }
  _lost(reason) { if (this.closed) return; this.closed = true; this.onLost && this.onLost(reason); }
}

// ------------------------------------------------------------------------------ PeerJS
export class PeerNet extends Base {
  async host() {
    let Peer;
    try { Peer = await peerLib(); } catch (e) { throw new Error('broker'); }
    this.role = 'host';
    for (let attempt = 0; attempt < 4; attempt++) {
      this.code = roomCode();
      try { await this._openHost(Peer); return this.code; } catch (e) { if (e.message !== 'taken') throw e; }
    }
    throw new Error('broker');
  }
  _openHost(Peer) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + this.code, { debug: 0 });
      this.peer = peer;
      let up = false;
      const t = setTimeout(() => { if (!up) { try { peer.destroy(); } catch (e) { /* */ } reject(new Error('broker')); } }, 12000);
      peer.on('error', (e) => {
        if (up) return; // a single failed guest connection is not the end of the room
        clearTimeout(t);
        try { peer.destroy(); } catch (x) { /* */ }
        reject(new Error(e && e.type === 'unavailable-id' ? 'taken' : 'broker'));
      });
      peer.on('open', () => { up = true; clearTimeout(t); resolve(); });
      peer.on('connection', (c) => {
        const id = this.nextId++;
        c.on('open', () => { this.conns.set(id, c); this._open(id); });
        c.on('data', (d) => this._data(id, d));
        c.on('close', () => this._leave(id));
        c.on('error', () => this._leave(id));
      });
      // the broker connection can drop while the room is open; the data channels to guests that
      // are already in keep working, so only try to reconnect for late joiners
      peer.on('disconnected', () => { try { if (!this.closed) peer.reconnect(); } catch (e) { /* */ } });
    });
  }
  async join(code) {
    let Peer;
    try { Peer = await peerLib(); } catch (e) { throw new Error('broker'); }
    this.role = 'guest';
    this.code = cleanCode(code);
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, { debug: 0 });
      this.peer = peer;
      let settled = false;
      const bail = (msg) => { if (settled) return; settled = true; clearTimeout(t); try { peer.destroy(); } catch (e) { /* */ } reject(new Error(msg)); };
      // a wrong code with a working broker simply never answers: time out instead of hanging
      const t = setTimeout(() => bail('noanswer'), 15000);
      peer.on('error', (e) => {
        if (settled) { if (e && e.type !== 'peer-unavailable') this._lost('connection'); return; }
        bail(e && e.type === 'peer-unavailable' ? 'noroom' : 'broker');
      });
      peer.on('open', () => {
        const c = peer.connect(PREFIX + this.code, { reliable: true });
        this.conn = c;
        c.on('open', () => { if (settled) return; settled = true; clearTimeout(t); this.conns.set(0, c); resolve(); });
        c.on('data', (d) => this._data(0, d));
        c.on('close', () => this._lost('host'));
      });
    });
  }
  send(id, msg) { const c = this.conns.get(id); if (c && c.open) { try { c.send(msg); } catch (e) { /* closing */ } } }
  broadcast(msg) { for (const id of this.conns.keys()) this.send(id, msg); }
  sendHost(msg) { this.send(0, msg); }
  drop(id) { const c = this.conns.get(id); try { if (c) c.close(); } catch (e) { /* */ } this._leave(id); }
  close() {
    this.closed = true;
    for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* */ } }
    this.conns.clear();
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* */ }
    this.peer = null;
  }
}

// ------------------------------------------------------------------------------ loopback
// Same interface over a BroadcastChannel: every tab of this origin hears every message, so each
// message carries from/to and the room code. Structured clone stands in for the wire.
export class LoopNet extends Base {
  constructor(o) { super(o); this.me = Math.random().toString(36).slice(2, 10); this.byKey = new Map(); }
  _chan() {
    this.ch = new BroadcastChannel('skyaces-loop');
    this.ch.onmessage = (ev) => this._recv(ev.data);
  }
  async host() {
    this.role = 'host'; this.code = roomCode(); this._chan();
    return this.code;
  }
  async join(code) {
    this.role = 'guest'; this.code = cleanCode(code); this._chan();
    return new Promise((resolve, reject) => {
      this._acked = () => { clearTimeout(t); this.conns.set(0, this.me); resolve(); };
      const t = setTimeout(() => { this._acked = null; reject(new Error('noroom')); }, 4000);
      this._post({ k: 'hello', to: 'host' });
    });
  }
  _post(m) { if (this.ch) this.ch.postMessage({ ...m, room: this.code, from: this.role === 'host' ? 'host' : this.me }); }
  _recv(m) {
    if (!m || m.room !== this.code || this.closed) return;
    if (this.role === 'host') {
      if (m.to !== 'host') return;
      if (m.k === 'hello') { if (this.byKey.has(m.from)) return; const id = this.nextId++; this.byKey.set(m.from, id); this.conns.set(id, m.from); this._post({ k: 'ack', to: m.from }); this._open(id); return; }
      const id = this.byKey.get(m.from); if (!id) return;
      if (m.k === 'bye') { this.byKey.delete(m.from); this._leave(id); return; }
      if (m.k === 'd') this._data(id, m.d);
    } else {
      if (m.to !== this.me && m.to !== '*') return;
      if (m.k === 'ack') { if (this._acked) { this._acked(); this._acked = null; } return; }
      if (m.k === 'bye') { this._lost('host'); return; }
      if (m.k === 'd') this._data(0, m.d);
    }
  }
  send(id, msg) { const key = this.conns.get(id); if (key) this._post({ k: 'd', to: this.role === 'host' ? key : 'host', d: msg }); }
  broadcast(msg) { for (const id of this.conns.keys()) this.send(id, msg); }
  sendHost(msg) { this._post({ k: 'd', to: 'host', d: msg }); }
  drop(id) { const key = this.conns.get(id); if (key) { this._post({ k: 'bye', to: key }); this.byKey.delete(key); } this._leave(id); }
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this._post({ k: 'bye', to: this.role === 'host' ? '*' : 'host' }); } catch (e) { /* */ }
    try { this.ch && this.ch.close(); } catch (e) { /* */ }
    this.conns.clear();
  }
}

export function makeNet(kind, o) { return kind === 'loop' ? new LoopNet(o) : new PeerNet(o); }
export const NET_ERRORS = {
  broker: 'Could not reach the matchmaking broker (the free public PeerJS server). Check your internet connection and try again. The VS AI modes work offline.',
  noroom: 'No room with that code. Check the code with the host.',
  noanswer: 'That room did not answer. Check the code, or the host may have closed it.',
  host: 'The host left the match. Online matches end when the host leaves.',
  connection: 'Lost the connection to the host.',
  full: 'That room is full (8 players).',
};
