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
  constructor(o = {}) { Object.assign(this, o); this.role = null; this.code = ''; this.peer = null; this.conns = []; this.conn = null; this.pending = null; this.live = false; }
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
        if (this.conns.length || this.pending) { c.once('open', () => { c.send({ full: 1 }); setTimeout(() => c.close(), 300); }); return; }
        this.pending = c;
        const timer = setTimeout(() => { if (!c.open) { leave(); c.close(); } }, 9000);
        const leave = () => {
          clearTimeout(timer);
          if (this.pending === c) this.pending = null;
          if (!this.conns.includes(c)) return;
          this.conns = this.conns.filter((q) => q !== c);
          this.live = false;
          this.onLeave?.(1);
        };
        c.on('open', () => {
          if (this.pending !== c) { c.close(); return; }
          clearTimeout(timer);
          this.pending = null;
          this.conns.push(c); this.live = true; c.send({ hello: 1, slot: 1 }); this.status('challenger joined', 'live'); this.onJoin?.(1);
        });
        c.on('data', (d) => { if (this.conns.includes(c)) this.onMsg?.(1, d); });
        c.on('close', leave);
        c.on('error', () => { leave(); c.close(); });
      });
    });
  }

  async join(code) {
    const Peer = await peerLib();
    this.role = 'guest'; this.code = String(code || '').toUpperCase().trim();
    return new Promise((resolve, reject) => {
      let settled = false;
      const bail = (m) => { if (settled) return; settled = true; clearTimeout(timer); this.status(m, 'error'); try { peer.destroy(); } catch (e) { /* */ } reject(new Error(m)); };
      const timer = setTimeout(() => bail('no answer from the online service or room'), 12000);
      const peer = new Peer(undefined, { debug: 0 });
      this.peer = peer;
      peer.on('error', (e) => bail(e && e.type === 'peer-unavailable' ? 'no room with that code' : 'could not connect'));
      peer.on('open', () => {
        const c = peer.connect(PREFIX + this.code, { reliable: true });
        this.conn = c;
        c.on('data', (d) => {
          if (d?.full) { bail('that room is full'); return; }
          if (d?.hello && !settled) { clearTimeout(timer); settled = true; this.live = true; resolve(d.slot); return; }
          if (this.live) this.onMsg?.(0, d);
        });
        c.on('close', () => {
          if (!settled) { bail('that room closed before the match started'); return; }
          if (this.live) { this.live = false; this.onLeave?.(0); }
        });
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
    try { this.pending && this.pending.close(); } catch (e) { /* */ }
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    this.conns = []; this.conn = null; this.pending = null; this.peer = null; this.live = false; this.role = null;
  }
}
