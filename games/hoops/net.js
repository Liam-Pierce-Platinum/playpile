// =====================================================================
// HOOPS :: net.js - PLAYING SOMEBODY ELSE
// =====================================================================
//
// Liam: "add online multiplay through the site".
//
// PLAYPILE IS A STATIC SITE. It is a folder of files on GitHub Pages -
// there is no server of ours to run a game on, and there never will be
// without somebody paying for one. So this is PEER TO PEER: one player
// HOSTS (their browser runs the match) and the others JOIN with a four
// character room code. The only thing in the middle is a free public
// broker that introduces the two browsers to each other and then gets out
// of the way; after that the data goes straight between them over WebRTC.
//
// WHAT THAT MEANS IN PRACTICE, because it is a real trade and not a free
// lunch:
//   - no lobby, no matchmaking, no accounts: you send a friend a code
//   - the host's browser is the referee. Everything is decided there and
//     the guests are told; a guest who alt-tabs does not desync the match
//   - if the host leaves, the match is over
//   - the broker is somebody else's free service. If it is down, the code
//     will not connect, and the game says so instead of hanging.
//
// THE PROTOCOL is deliberately tiny:
//   guest -> host   { i: [wantX, wantZ, flags], s: shot?, p: pass? }  at 30 Hz
//   host  -> guest  { t, you, ps: [x, z, y, vx, vz, face, flags], b: ball, sc: score, m: message }
//                   at 20 Hz - the guest draws between the snapshots it has
//
// Positions are rounded to a centimetre before they go out; a basketball
// court is twenty units across and nobody can see a millimetre.
const BROKER_LIB = '../_deck/peerjs.min.js';
const PREFIX = 'playpile-hoops-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1

let PeerLib = null;
async function peerLib() {
  if (PeerLib) return PeerLib;
  // peerjs ships as a UMD bundle: it defines window.Peer when loaded
  await import(BROKER_LIB);
  PeerLib = window.Peer;
  if (!PeerLib) throw new Error('the networking library did not load');
  return PeerLib;
}

const roomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  /**
   * @param o.onState   (snapshot) => void      a guest, told where everything is
   * @param o.onInput   (slot, input) => void   a host, told what a guest is doing
   * @param o.onJoin    (slot, count) => void   a host, when somebody arrives
   * @param o.onLeave   (slot) => void
   * @param o.onStatus  (text, kind) => void    for the screen: 'waiting', 'live', 'error'
   */
  constructor(o = {}) {
    Object.assign(this, o);
    this.role = null;          // 'host' | 'guest'
    this.code = '';
    this.peer = null;
    this.conns = [];           // host: one per guest
    this.conn = null;          // guest: the one to the host
    this.slot = 0;             // guest: which player you are
    this.live = false;
    this.lastSent = 0;
  }

  /** open a room and wait for people. Resolves with the code to read out. */
  async host(max = 3) {
    const Peer = await peerLib();
    this.role = 'host';
    this.code = roomCode();
    this.max = max;
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + this.code, { debug: 0 });
      this.peer = peer;
      const fail = (e) => {
        // the one error worth retrying: somebody already has this code
        if (e && e.type === 'unavailable-id') { peer.destroy(); this.host(max).then(resolve, reject); return; }
        this.status('could not open a room: ' + (e && e.type ? e.type : e), 'error');
        reject(e);
      };
      peer.on('error', fail);
      peer.on('open', () => {
        this.status('room ' + this.code + ' - waiting for players', 'waiting');
        resolve(this.code);
      });
      peer.on('connection', (c) => {
        if (this.conns.length >= this.max) { c.close(); return; }
        const slot = this.conns.length + 1;
        c.on('open', () => {
          this.conns.push(c);
          c.send({ hello: true, slot });
          this.live = true;
          this.status(this.conns.length + ' joined', 'live');
          this.onJoin && this.onJoin(slot, this.conns.length);
        });
        c.on('data', (d) => { if (d && d.i) this.onInput && this.onInput(slot, d); });
        c.on('close', () => {
          this.conns = this.conns.filter((q) => q !== c);
          this.onLeave && this.onLeave(slot);
          this.status(this.conns.length ? this.conns.length + ' playing' : 'they left', this.conns.length ? 'live' : 'waiting');
        });
      });
    });
  }

  /** join somebody's room */
  async join(code) {
    const Peer = await peerLib();
    this.role = 'guest';
    this.code = String(code || '').toUpperCase().trim();
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, { debug: 0 });
      this.peer = peer;
      let settled = false;
      const bail = (msg) => {
        if (settled) return;
        settled = true;
        this.status(msg, 'error');
        reject(new Error(msg));
      };
      peer.on('error', (e) => bail(e && e.type === 'peer-unavailable' ? 'no room with that code' : 'could not connect'));
      peer.on('open', () => {
        const c = peer.connect(PREFIX + this.code, { reliable: false });
        this.conn = c;
        // THE TIMEOUT MATTERS. A wrong code with a broker that is up simply
        // never answers, and a game that sits on "connecting..." for ever
        // is indistinguishable from a broken one.
        const t = setTimeout(() => bail('no answer from that room'), 9000);
        c.on('open', () => { this.status('connected', 'live'); });
        c.on('data', (d) => {
          if (d && d.hello) {
            clearTimeout(t);
            this.slot = d.slot;
            this.live = true;
            settled = true;
            resolve(d.slot);
            return;
          }
          if (d && d.ps) this.onState && this.onState(d);
        });
        c.on('close', () => { this.live = false; this.status('the host left', 'error'); });
      });
    });
  }

  /** host: tell everybody where everything is */
  sendState(snap) {
    for (const c of this.conns) { if (c.open) c.send(snap); }
  }

  /** guest: tell the host what you are doing */
  sendInput(input) {
    if (this.conn && this.conn.open) this.conn.send(input);
  }

  status(text, kind) { this.onStatus && this.onStatus(text, kind); }

  close() {
    try { for (const c of this.conns) c.close(); } catch (e) { /* going away anyway */ }
    try { if (this.conn) this.conn.close(); } catch (e) { /* ditto */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ditto */ }
    this.conns = []; this.conn = null; this.peer = null; this.live = false; this.role = null;
  }
}

// ---------------------------------------------------------------------
// TURNING A MATCH INTO A MESSAGE, AND BACK
//
// These two live here rather than in half.js so that the wire format is
// one thing in one place: if a field is added to the snapshot, the packer
// and the unpacker are four lines apart and cannot drift.
// ---------------------------------------------------------------------
const r2 = (v) => Math.round(v * 100) / 100;

export function packState(half, t) {
  const b = half.ball;
  return {
    t,
    ps: half.players.map((p) => [r2(p.x), r2(p.z), r2(p.y), r2(p.vx), r2(p.vz), p.face,
      (p.guard ? 1 : 0) | (b.holder === p ? 2 : 0), r2(p.stam)]),
    b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.live ? 1 : 0, b.shot ? 1 : 0,
      b.holder ? half.players.indexOf(b.holder) : -1],
    sc: half.score.slice(),
    ck: Math.ceil(half.shotClock),
    gm: half.C.id === 'full' ? Math.max(0, Math.round(half.gameClock)) : null,
    m: half.msgT > 0 ? half.msg : '',
  };
}

export function applyState(half, s) {
  const ps = half.players;
  for (let i = 0; i < ps.length && i < s.ps.length; i++) {
    const p = ps[i], q = s.ps[i];
    // THE HOST IS RIGHT, BUT NOT INSTANTLY. Snapping every player to the
    // packet would stutter at twenty a second; easing towards it keeps the
    // feet moving and the animation code - which reads velocity - happy.
    p.x += (q[0] - p.x) * 0.5; p.z += (q[1] - p.z) * 0.5; p.y = q[2];
    p.vx = q[3]; p.vz = q[4]; p.face = q[5];
    p.guard = !!(q[6] & 1);
    p.stam = q[7];
  }
  const b = half.ball, q = s.b;
  b.x += (q[0] - b.x) * 0.6; b.y += (q[1] - b.y) * 0.6; b.z += (q[2] - b.z) * 0.6;
  b.vx = q[3]; b.vy = q[4]; b.vz = q[5];
  b.live = !!q[6]; b.shot = !!q[7];
  b.holder = q[8] >= 0 ? ps[q[8]] : null;
  half.score[0] = s.sc[0]; half.score[1] = s.sc[1];
  half.shotClock = s.ck;
  if (s.gm != null) half.gameClock = s.gm;
  if (s.m && s.m !== half.msg) { half.msg = s.m; half.msgT = 1.2; }
}

/** what a guest's hands are doing, small enough to send thirty times a second */
export function packInput(p, extra) {
  return {
    i: [r2(p.wantX || 0), r2(p.wantZ || 0), (p.guard ? 1 : 0) | (extra.jump ? 2 : 0) | (extra.swat ? 4 : 0)],
    s: extra.shot || null,
    p: extra.pass || null,
  };
}
