// Peer-to-peer online play over a free public PeerJS broker (same approach as
// PLAYPILE's HOOPS). One player HOSTS - their browser is the referee and runs the
// whole battle, bots included - the other JOINS with a 4-letter code.
// If the broker is unreachable we time out and say so instead of hanging.
const PREFIX = 'playpile-toysoldier-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let PeerLib = null;
async function peerLib() {
  if (PeerLib) return PeerLib;
  if (!window.Peer) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
      s.onload = res; s.onerror = () => rej(new Error('the networking library did not load'));
      document.head.appendChild(s);
    });
  }
  PeerLib = window.Peer;
  if (!PeerLib) throw new Error('the networking library did not load');
  return PeerLib;
}
const roomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  constructor(o = {}) { Object.assign(this, o); this.role = null; this.code = ''; this.peer = null; this.conns = []; this.conn = null; this.live = false; }
  status(t, k) { this.onStatus && this.onStatus(t, k); }

  async host() {
    const Peer = await peerLib();
    this.role = 'host'; this.code = roomCode();
    return new Promise((resolve, reject) => {
      let done = false;
      const peer = new Peer(PREFIX + this.code, { debug: 0 });
      this.peer = peer;
      const to = setTimeout(() => { if (!done) { done = true; this.status('online service unreachable - play vs bots instead', 'error'); try { peer.destroy(); } catch (e) { /* */ } reject(new Error('timeout')); } }, 8000);
      peer.on('error', (e) => {
        if (e && e.type === 'unavailable-id' && !done) { done = true; clearTimeout(to); peer.destroy(); this.host().then(resolve, reject); return; }
        if (!done) { done = true; clearTimeout(to); this.status('could not open a room (' + (e && e.type || e) + ')', 'error'); reject(e); }
      });
      peer.on('open', () => { if (done) return; done = true; clearTimeout(to); this.status('room ' + this.code + ' - waiting for a challenger', 'waiting'); resolve(this.code); });
      peer.on('connection', (c) => {
        if (this.conns.length >= 1) { c.on('open', () => { c.send({ full: 1 }); setTimeout(() => c.close(), 300); }); return; }
        c.on('open', () => { this.conns.push(c); this.live = true; c.send({ hello: 1, slot: 1 }); this.status('challenger joined', 'live'); this.onJoin && this.onJoin(1); });
        c.on('data', (d) => this.onMsg && this.onMsg(1, d));
        c.on('close', () => { this.conns = this.conns.filter((q) => q !== c); this.live = this.conns.length > 0; this.onLeave && this.onLeave(1); });
      });
    });
  }

  async join(code) {
    const Peer = await peerLib();
    this.role = 'guest'; this.code = String(code || '').toUpperCase().trim();
    return new Promise((resolve, reject) => {
      let settled = false;
      const bail = (m) => { if (settled) return; settled = true; this.status(m, 'error'); try { this.peer.destroy(); } catch (e) { /* */ } reject(new Error(m)); };
      const to0 = setTimeout(() => bail('online service unreachable'), 9000);
      const peer = new Peer(undefined, { debug: 0 });
      this.peer = peer;
      peer.on('error', (e) => bail(e && e.type === 'peer-unavailable' ? 'no room with that code' : 'could not connect'));
      peer.on('open', () => {
        clearTimeout(to0);
        const c = peer.connect(PREFIX + this.code, { reliable: true });
        this.conn = c;
        const t = setTimeout(() => bail('no answer from that room'), 9000);
        c.on('data', (d) => {
          if (d && d.full) { clearTimeout(t); bail('that room is full'); return; }
          if (d && d.hello) { clearTimeout(t); settled = true; this.live = true; resolve(d.slot); return; }
          this.onMsg && this.onMsg(0, d);
        });
        c.on('close', () => { this.live = false; this.onLeave && this.onLeave(0); });
      });
    });
  }
  send(d) {
    if (this.role === 'host') { for (const c of this.conns) if (c.open) c.send(d); }
    else if (this.conn && this.conn.open) this.conn.send(d);
  }
  close() {
    try { for (const c of this.conns) c.close(); } catch (e) { /* */ }
    try { this.conn && this.conn.close(); } catch (e) { /* */ }
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    this.conns = []; this.conn = null; this.peer = null; this.live = false; this.role = null;
  }
}
