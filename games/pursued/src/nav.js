// The monster's map of where it can go: a 0.5 m grid with two layers (street level and the
// first floor up), rasterised straight from the collision boxes so it can never disagree with
// the walls. Stairs join the layers wherever two cells meet at nearly the same height.
// Cells remember whether they are a fence to leap (VAULT), something to crawl under (DUCK)
// or a doorway (door index), and A* prices those in.
import { SOLID, VAULT, LOW } from './collide.js';

export const F_VAULT = 1, F_DUCK = 2;
const CLEAR_LO = 0.35, CLEAR_HI = 1.9, INFLATE = 0.22, LAYER_SPLIT = 2.4, MAX_DH = 0.45;

export class Nav {
  constructor(statics, x0, z0, x1, z1, cs = 0.5) {
    this.cs = cs; this.x0 = x0; this.z0 = z0;
    this.W = Math.ceil((x1 - x0) / cs); this.H = Math.ceil((z1 - z0) / cs);
    this.N = this.W * this.H;
    this.L = 2;
    this.h = [new Float32Array(this.N).fill(NaN), new Float32Array(this.N).fill(NaN)];
    this.f = [new Uint8Array(this.N), new Uint8Array(this.N)];
    this.door = [new Int16Array(this.N).fill(-1), new Int16Array(this.N).fill(-1)];
    this.vaultH = new Float32Array(this.N);
    this.doors = [];
    this.statics = statics;
    this.build();
    const M = this.N * 2;
    this.g = new Float32Array(M); this.from = new Int32Array(M); this.seen = new Uint32Array(M); this.closed = new Uint32Array(M);
    this.stampN = 0;
    this.heap = new Int32Array(M); this.heapF = new Float32Array(M);
  }
  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cs), j = Math.floor((z - this.z0) / this.cs);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }
  cx(c) { return this.x0 + ((c % this.W) + 0.5) * this.cs; }
  cz(c) { return this.z0 + (Math.floor(c / this.W) + 0.5) * this.cs; }

  build() {
    const S = this.statics, cs = this.cs;
    const cand = [];
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
      const c = j * this.W + i, x = this.x0 + (i + 0.5) * cs, z = this.z0 + (j + 0.5) * cs;
      cand.length = 0; cand.push(0);
      const near = [];
      S.query(x - INFLATE, z - INFLATE, x + INFLATE, z + INFLATE, b => { near.push(b); });
      for (const b of near) if (b.k === SOLID && !b.noFloor && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 < 6.5) cand.push(b.y1);
      cand.sort((a, b) => a - b);
      let best0 = NaN, best1 = NaN, f0 = 0, f1 = 0, vh0 = 0;
      for (const h of cand) {
        let ok = true, fl = 0, vh = 0;
        for (const b of near) {
          if (b.y1 <= h + CLEAR_LO || b.y0 >= h + CLEAR_HI) continue;
          const inside = x >= b.x0 - INFLATE && x <= b.x1 + INFLATE && z >= b.z0 - INFLATE && z <= b.z1 + INFLATE;
          if (!inside) continue;
          if (b.k === VAULT && b.y1 - h < 2.4) { fl |= F_VAULT; vh = Math.max(vh, b.y1 - h); continue; }
          if (b.k === LOW && b.y0 - h > 0.85) { fl |= F_DUCK; continue; }
          // a solid block counts only if the cell centre is genuinely inside it, or it is a wall we are hugging
          ok = false; break;
        }
        if (!ok) continue;
        if (h < LAYER_SPLIT) { best0 = h; f0 = fl; vh0 = vh; } else { best1 = h; f1 = fl; }
      }
      this.h[0][c] = best0; this.f[0][c] = f0; this.vaultH[c] = vh0;
      this.h[1][c] = best1; this.f[1][c] = f1;
    }
  }
  // door: {cells:[...]} registered after build (closed footprint)
  addDoor(door, x0, z0, x1, z1, y) {
    const id = this.doors.length; this.doors.push(door);
    door.navId = id;
    for (let z = z0; z <= z1 + 1e-6; z += this.cs * 0.5) for (let x = x0; x <= x1 + 1e-6; x += this.cs * 0.5) {
      const c = this.idx(x, z); if (c < 0) continue;
      for (let l = 0; l < 2; l++) if (Math.abs(this.h[l][c] - y) < 0.6) this.door[l][c] = id;
    }
  }
  // nearest walkable node to a world point; prefers the layer at that height
  nodeAt(x, y, z, search = 6) {
    const c0 = this.idx(x, z);
    if (c0 >= 0) { const n = this._pick(c0, y); if (n >= 0) return n; }
    const i0 = Math.floor((x - this.x0) / this.cs), j0 = Math.floor((z - this.z0) / this.cs);
    for (let r = 1; r <= search; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
        const n = this._pick(j * this.W + i, y);
        if (n >= 0) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = n; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  _pick(c, y) {
    let best = -1, bd = 1.6;
    for (let l = 0; l < 2; l++) { const h = this.h[l][c]; if (h === h && Math.abs(h - y) < bd && !(this.f[l][c] & F_VAULT)) { bd = Math.abs(h - y); best = l * this.N + c; } }
    return best;
  }
  hOf(n) { return n < this.N ? this.h[0][n] : this.h[1][n - this.N]; }
  flagOf(n) { return n < this.N ? this.f[0][n] : this.f[1][n - this.N]; }
  doorOf(n) { return n < this.N ? this.door[0][n] : this.door[1][n - this.N]; }
  walkable(n) { const h = this.hOf(n); return h === h; }
  pos(n, v) { const c = n % this.N; v.x = this.cx(c); v.z = this.cz(c); v.y = this.hOf(n); return v; }

  // A*. doorCost(door) gives the extra cost of a closed door (Infinity = impassable).
  path(start, goal, { doorCost = () => 0, vaultCost = 2.5, duckCost = 2, maxIter = 70000 } = {}) {
    if (start < 0 || goal < 0) return null;
    const N = this.N, W = this.W, Hh = this.H;
    const stamp = ++this.stampN;
    const g = this.g, from = this.from, seen = this.seen, closed = this.closed;
    const heap = this.heap, hf = this.heapF; let hn = 0;
    const gx = (goal % N) % W, gz = Math.floor((goal % N) / W);
    const heur = (n) => { const c = n % N, dx = Math.abs(c % W - gx), dz = Math.abs(Math.floor(c / W) - gz); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * this.cs; };
    const push = (n, f) => {
      let i = hn++;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; }
      heap[i] = n; hf[i] = f;
    };
    const pop = () => {
      const top = heap[0]; const ln = heap[--hn], lf = hf[hn];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= hn) break;
        if (c + 1 < hn && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        heap[i] = heap[c]; hf[i] = hf[c]; i = c;
      }
      heap[i] = ln; hf[i] = lf;
      return top;
    };
    g[start] = 0; seen[start] = stamp; from[start] = -1;
    push(start, heur(start));
    let bestN = start, bestH = heur(start), it = 0;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (hn > 0 && it++ < maxIter) {
      const n = pop();
      if (closed[n] === stamp) continue;
      closed[n] = stamp;
      if (n === goal) { bestN = n; break; }
      const hh = heur(n); if (hh < bestH) { bestH = hh; bestN = n; }
      const l = n >= N ? 1 : 0, c = n - l * N, i = c % W, j = (c - i) / W;
      const h0 = this.h[l][c];
      for (let k = 0; k < 8; k++) {
        const ni = i + DX[k], nj = j + DZ[k];
        if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
        const nc = nj * W + ni;
        if (k >= 4) {   // no corner cutting
          const a = j * W + ni, b = nj * W + i;
          if (!(this._near(a, h0)) || !(this._near(b, h0))) continue;
        }
        for (let nl = 0; nl < 2; nl++) {
          const h1 = this.h[nl][nc];
          if (h1 !== h1 || Math.abs(h1 - h0) > MAX_DH) continue;
          const nn = nl * N + nc;
          if (closed[nn] === stamp) continue;
          let cost = (k >= 4 ? 1.414 : 1) * this.cs;
          const fl = this.f[nl][nc];
          if (fl & F_VAULT) cost += vaultCost * this.cs;
          if (fl & F_DUCK) cost += duckCost * this.cs;
          const d = this.door[nl][nc];
          if (d >= 0 && !(this.door[l][c] === d)) { const dc = doorCost(this.doors[d]); if (dc === Infinity) continue; cost += dc; }
          const ng = g[n] + cost;
          if (seen[nn] !== stamp || ng < g[nn]) { seen[nn] = stamp; g[nn] = ng; from[nn] = n; push(nn, ng + heur(nn)); }
        }
      }
    }
    const out = [];
    for (let n = bestN; n !== -1 && out.length < 4000; n = from[n]) out.push(n);
    out.reverse();
    return { nodes: out, complete: bestN === goal, cost: g[bestN] };
  }
  _near(c, h) {
    for (let l = 0; l < 2; l++) { const v = this.h[l][c]; if (v === v && Math.abs(v - h) <= MAX_DH) return true; }
    return false;
  }
  // straight walk between two nodes without leaving the walkable surface (no fences / doors in between)
  clearLine(a, b, allowFlags = 0) {
    const N = this.N;
    const ac = a % N, bc = b % N;
    const ax = this.cx(ac), az = this.cz(ac), bx = this.cx(bc), bz = this.cz(bc);
    const len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / (this.cs * 0.5));
    let h = this.hOf(a);
    for (let s = 1; s <= steps; s++) {
      const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
      const c = this.idx(x, z); if (c < 0) return false;
      let ok = false;
      for (let l = 0; l < 2; l++) {
        const v = this.h[l][c];
        if (v === v && Math.abs(v - h) <= MAX_DH && !(this.f[l][c] & ~allowFlags) && this.door[l][c] < 0) { h = v; ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }
  // a random walkable node within radius r of (x,z) on layer 0 (for searching / spawns)
  randomNear(x, y, z, r, rnd = Math.random) {
    for (let t = 0; t < 40; t++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r;
      const n = this.nodeAt(x + Math.cos(a) * d, y, z + Math.sin(a) * d, 2);
      if (n >= 0 && !(this.flagOf(n) & (F_VAULT | F_DUCK))) return n;
    }
    return -1;
  }
}
