// Materials, building kits and the 15 city blocks. Everything here creates
// physics bodies; values are in dollars of damage.
import { Body } from './physics.js';

export const MATS = {
  //          density friction hp   $/unit²  joint force/torque
  brick:    { d: 1.9, fr: 0.85, hp: 62, val: 9000, jf: 4420, jt: 2210, col: '#c4553b', dark: '#7d2f22', lite: '#e8825e', dust: '#d6a184', chunk: '#b24a33', snd: 'brick' },
  stucco:   { d: 1.8, fr: 0.85, hp: 57, val: 8000, jf: 4080, jt: 2040, col: '#e7c58f', dark: '#9b7448', lite: '#fbe2b4', dust: '#ead3ad', chunk: '#d6b07a', snd: 'brick' },
  wood:     { d: 0.75, fr: 0.75, hp: 42, val: 4500, jf: 2550, jt: 1275, col: '#b5743f', dark: '#6d3f1f', lite: '#d9965c', dust: '#c9a27b', chunk: '#9a5f31', snd: 'wood' },
  glass:    { d: 1.0, fr: 0.4, hp: 5, val: 7000, jf: 714, jt: 357, col: '#5fb4d9', dark: '#22506e', lite: '#c9f1ff', dust: '#d9f4ff', chunk: '#9fe3ff', snd: 'glass' },
  concrete: { d: 2.3, fr: 0.85, hp: 101, val: 11000, jf: 7140, jt: 3570, col: '#b8b0c8', dark: '#6a6280', lite: '#dcd6e8', dust: '#cfc8d8', chunk: '#9c94ae', snd: 'concrete' },
  steel:    { d: 2.6, fr: 0.5, hp: 600, val: 15000, jf: 8160, jt: 4080, col: '#d9542c', dark: '#7c2614', lite: '#f6845a', dust: '#b8a8a0', chunk: '#a83e1e', snd: 'metal' },
  metal:    { d: 0.9, fr: 0.5, hp: 34, val: 5000, jf: 1870, jt: 935, col: '#7f97ad', dark: '#3e5266', lite: '#a9c0d4', dust: '#b9c4cf', chunk: '#6c8399', snd: 'metal' },
  sign:     { d: 0.7, fr: 0.6, hp: 24, val: 6000, jf: 1530, jt: 765, col: '#2f2a4a', dark: '#16122a', lite: '#4a426e', dust: '#c9a27b', chunk: '#3a335a', snd: 'wood' },
  tank:     { d: 1.1, fr: 0.6, hp: 8, val: 30000, jf: 1020, jt: 510, col: '#e63946', dark: '#8a1c27', lite: '#ff7b84', dust: '#ffb15c', chunk: '#c22d3a', snd: 'metal' },
  water:    { d: 1.5, fr: 0.7, hp: 31, val: 40000, jf: 2040, jt: 1020, col: '#8a5634', dark: '#4e2d18', lite: '#b37b50', dust: '#9fd6ff', chunk: '#7a4a2a', snd: 'wood' },
  car:      { d: 1.0, fr: 0.9, hp: 1e9, val: 26000, jf: 1, jt: 1, col: '#4cc9f0', dark: '#1d1630', lite: '#ffffff', dust: '#cfc8d8', chunk: '#555', snd: 'car' },
  lamp:     { d: 2.0, fr: 0.5, hp: 600, val: 3000, jf: 1190, jt: 510, col: '#3d3a5c', dark: '#1d1630', lite: '#6b6890', dust: '#b8a8a0', chunk: '#3d3a5c', snd: 'metal' },
};

export const UPG = {
  weight: { name: 'Heavier ball', desc: 'More mass: bigger hits, and it ploughs on through.', tiers: [{ cost: 0, m: 26, r: 0.7 }, { cost: 1e6, m: 38, r: 0.78 }, { cost: 2.5e6, m: 52, r: 0.86 }, { cost: 5.5e6, m: 72, r: 0.95 }] },
  cable: { name: 'Longer cable', desc: 'Reach the ground floors and swing in wider arcs.', tiers: [{ cost: 0, k: 0.78 }, { cost: 1.2e6, k: 0.89 }, { cost: 3e6, k: 1 }] },
  spike: { name: 'Spiked ball', desc: 'Double damage, and it rips welds apart on contact.', toggle: true, tiers: [{ cost: 0 }, { cost: 4e6 }] },
  chain: { name: '2-ball chain', desc: 'A second ball on a chain whips through whatever the first one misses.', toggle: true, tiers: [{ cost: 0 }, { cost: 7e6 }] },
};

export const DISTRICTS = [
  { name: 'Old Town', sub: 'Brick and timber', sky: ['#36296a', '#9c4479', '#f07a5a', '#ffcf7a'], sun: '#fff0c0', far: '#b9577c', near: '#7c3a6c', haze: '#ffb07a' },
  { name: 'Downtown', sub: 'Glass towers', sky: ['#1b2058', '#4d2e70', '#c14f7c', '#ff9d6a'], sun: '#ffe2b0', far: '#6d3c80', near: '#3e2a5e', haze: '#ff8f7a' },
  { name: 'Industrial', sub: 'Steel and smoke', sky: ['#33263d', '#7d3846', '#dc6a3c', '#ffbb5e'], sun: '#ffe4a0', far: '#94494a', near: '#552c3a', haze: '#ffa060' },
];

const CAR_COLS = ['#4cc9f0', '#f72585', '#ffd166', '#06d6a0', '#ff8c42', '#9b5de5', '#f1faee'];
const SHOP = ['DELI', 'BAR', 'CAFE', 'BOOKS', 'PAWN', 'DINER', 'PIZZA', 'SHOES', 'HOTEL', 'BANK', 'TOYS', 'RECORDS'];
const BOARDS = ['WRECK & ROLL', 'BIG BALL COLA', 'SMASH FM', 'DEMO DAILY', 'BOOM BURGER'];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ builder
class Builder {
  constructor(world, seed) {
    this.w = world; this.r = rng(seed); this.blds = []; this.cur = null;
    this.ground = world.add(new Body({ x: 0, y: -5, hw: 400, hh: 5, static: true, friction: 0.9, data: { ground: true } }));
    this.maxH = 0; this.minX = 1e9; this.maxX = -1e9; this.dm = 1;
  }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  begin(name) { this.cur = { name, value: 0, paid: 0, done: false, blocks: 0 }; this.blds.push(this.cur); return this.cur; }
  block(x, y, hw, hh, mat, extra = {}) {
    const M = MATS[mat];
    const area = 4 * hw * hh;
    const b = this.w.add(new Body({ x, y, hw, hh, a: extra.a || 0, density: M.d * (extra.dens || 1), friction: M.fr, sleep: true }));
    const val = Math.round(M.val * Math.max(0.35, area) * (extra.valMul || 1) * this.dm);
    b.data = Object.assign({ mat, hp: M.hp * (0.6 + 0.4 * Math.min(area, 3)) * (extra.hpMul || 1), val, paid: 0, hx: x, hy: y, ha: b.a, bld: this.cur, seed: this.r() }, extra);
    b.data.hpMax = b.data.hp;
    if (this.cur && !extra.noBld) { this.cur.value += val; this.cur.blocks++; }
    this.maxH = Math.max(this.maxH, y + b.ey); this.minX = Math.min(this.minX, x - b.ex); this.maxX = Math.max(this.maxX, x + b.ex);
    return b;
  }
  weld(a, b, x, y, k = 1) {
    const ma = MATS[a.data ? a.data.mat : 'concrete'], mb = b.data && b.data.mat ? MATS[b.data.mat] : ma;
    const f = Math.min(ma.jf, mb.jf) * k, t = Math.min(ma.jt, mb.jt) * k;
    return this.w.weld(a, b, x, y, f, t);
  }

  // A framed building: columns, floor slabs and infill per bay.
  // o: { floors, bays, bayW, floorH, colW, slabT, col, slab, infill(f, bay) -> kind, setback(f) -> [b0, b1] }
  frame(x0, o) {
    const { floors, bays, bayW, floorH, colW, slabT } = o;
    let below = null; // slabs of the floor below, or null for the ground
    const all = { cols: [], slabs: [], top: [] };
    for (let f = 0; f < floors; f++) {
      const [s0, s1] = o.setback ? o.setback(f) : [0, bays];
      const yb = f * (floorH + slabT);
      const cols = [];
      for (let c = s0; c <= s1; c++) {
        const x = x0 + c * bayW;
        const col = this.block(x, yb + floorH / 2, colW / 2, floorH / 2, o.col, { part: 'col', hpMul: 2.6 });
        cols[c] = col; all.cols.push(col);
        if (!below) this.weld(col, this.ground, x, yb, 1.4);
        else for (const s of below) if (s && Math.abs(s.x - x) <= s.hw + 0.02) this.weld(col, s, x, yb);
      }
      const slabs = [];
      for (let c = s0; c < s1; c++) {
        let l = x0 + c * bayW, r = l + bayW;
        if (c === s0) l -= colW / 2; if (c === s1 - 1) r += colW / 2;
        const sl = this.block((l + r) / 2, yb + floorH + slabT / 2, (r - l) / 2, slabT / 2, o.slab, { part: 'slab', roof: f === floors - 1, floor: f, hpMul: 1.7 });
        slabs[c] = sl; all.slabs.push(sl);
        for (const cc of [c, c + 1]) if (cols[cc]) this.weld(cols[cc], sl, cols[cc].x, yb + floorH);
        if (c > s0) this.weld(slabs[c - 1], sl, x0 + c * bayW, sl.y);
        // infill
        const kind = o.infill ? o.infill(f, c) : 'none';
        this.infill(kind, x0 + (c + 0.5) * bayW, yb, bayW - colW, floorH, below ? below[c] : this.ground, sl, f);
      }
      below = slabs;
      if (f === floors - 1) all.top = slabs.filter(Boolean);
    }
    all.roofY = floors * (floorH + slabT);
    all.x0 = x0 - colW / 2; all.x1 = x0 + bays * bayW + colW / 2;
    return all;
  }

  infill(kind, cx, yb, w, h, under, over, f) {
    const hw = w / 2;
    const at = (y0, y1, mat, extra) => this.block(cx, (y0 + y1) / 2, hw, (y1 - y0) / 2, mat, extra);
    const tie = (b, y, k) => { if (under) this.weld(b, under, cx, y, k); };
    const cap = (b, y, k) => this.weld(b, over, cx, y, k);
    if (kind === 'none') return;
    if (kind === 'brickwin' || kind === 'stuccowin') {
      const m = kind === 'brickwin' ? 'brick' : 'stucco';
      const s = at(yb, yb + 0.45, m, { part: 'sill' }); tie(s, yb, 0.6);
      at(yb + 0.45, yb + h - 0.32, 'glass', { part: 'win', lit: this.r() < 0.35 });
      const l = at(yb + h - 0.32, yb + h, m, { part: 'lintel' }); cap(l, yb + h, 0.6);
    } else if (kind === 'shop') {
      at(yb, yb + h - 0.4, 'glass', { part: 'shop', lit: true });
      const s = at(yb + h - 0.4, yb + h, 'sign', { part: 'signband', text: this.pick(SHOP), hue: this.pick(CAR_COLS) }); cap(s, yb + h, 0.7);
    } else if (kind === 'curtain') {
      at(yb, yb + h, 'glass', { part: 'curtain', lit: this.r() < 0.25 });
    } else if (kind === 'spandrel') {
      const s = at(yb, yb + 0.4, 'concrete', { part: 'spandrel' }); tie(s, yb, 0.6);
      at(yb + 0.4, yb + h, 'glass', { part: 'curtain', lit: this.r() < 0.3 });
    } else if (kind === 'woodwin') {
      const s = at(yb, yb + 0.5, 'wood', { part: 'plank' }); tie(s, yb, 0.6);
      at(yb + 0.5, yb + h - 0.3, 'glass', { part: 'win', lit: this.r() < 0.4 });
      const l = at(yb + h - 0.3, yb + h, 'wood', { part: 'plank' }); cap(l, yb + h, 0.6);
    } else if (kind === 'panel') {
      const p = at(yb, yb + h, 'metal', { part: 'panel' }); tie(p, yb, 0.5);
    } else if (kind === 'panelwin') {
      const p = at(yb, yb + h * 0.55, 'metal', { part: 'panel' }); tie(p, yb, 0.5);
      at(yb + h * 0.55, yb + h, 'glass', { part: 'win' });
    } else if (kind === 'brace' || kind === 'brace2') {
      const L = Math.hypot(w, h) - 0.42, a = Math.atan2(h, w) * (kind === 'brace' ? 1 : -1);
      const b = this.block(cx, yb + h / 2, L / 2, 0.08, 'steel', { a, part: 'brace', valMul: 0.6 });
      const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2;
      this.weld(b, under, cx - dx, yb + h / 2 - dy, 0.7); this.weld(b, over, cx + dx, yb + h / 2 + dy, 0.7);
    }
  }

  // decorative roof edge
  cornice(fr, mat) {
    const y = fr.roofY + 0.14;
    const c = this.block((fr.x0 + fr.x1) / 2, y, (fr.x1 - fr.x0) / 2 + 0.2, 0.14, mat, { part: 'cornice' });
    for (const s of fr.top) this.weld(c, s, s.x, fr.roofY, 0.8);
    return c;
  }
  waterTower(x, y, onto) {
    const legH = 0.8;
    const l1 = this.block(x - 0.7, y + legH / 2, 0.08, legH / 2, 'wood', { part: 'leg' });
    const l2 = this.block(x + 0.7, y + legH / 2, 0.08, legH / 2, 'wood', { part: 'leg' });
    if (onto) { this.weld(l1, onto, x - 0.7, y, 0.6); this.weld(l2, onto, x + 0.7, y, 0.6); }
    const p = this.block(x, y + legH + 0.08, 0.95, 0.08, 'wood', { part: 'deck' });
    this.weld(l1, p, x - 0.7, y + legH, 0.7); this.weld(l2, p, x + 0.7, y + legH, 0.7);
    const t = this.block(x, y + legH + 0.16 + 0.75, 0.75, 0.75, 'water', { part: 'watertank' });
    this.weld(p, t, x, y + legH + 0.16, 0.8);
  }
  steelTower(x) {
    const H = 4.2;
    const l1 = this.block(x - 1, H / 2, 0.1, H / 2, 'steel', { part: 'col' });
    const l2 = this.block(x + 1, H / 2, 0.1, H / 2, 'steel', { part: 'col' });
    this.weld(l1, this.ground, x - 1, 0, 0.6); this.weld(l2, this.ground, x + 1, 0, 0.6);
    const L = Math.hypot(1.8, H * 0.5) - 0.1, a = Math.atan2(H * 0.5, 1.8);
    for (const [yy, s] of [[H * 0.25, 1], [H * 0.75, -1]]) {
      const br = this.block(x, yy, L / 2, 0.06, 'steel', { a: a * s, part: 'brace', valMul: 0.5 });
      this.weld(br, l1, x - 0.9, yy - s * H * 0.25 * 0.9, 0.5); this.weld(br, l2, x + 0.9, yy + s * H * 0.25 * 0.9, 0.5);
    }
    const p = this.block(x, H + 0.1, 1.25, 0.1, 'steel', { part: 'deck' });
    this.weld(l1, p, x - 1, H, 0.7); this.weld(l2, p, x + 1, H, 0.7);
    const t = this.block(x, H + 0.2 + 0.9, 1.0, 0.9, 'water', { part: 'watertank', ind: true });
    this.weld(p, t, x, H + 0.2, 0.7);
  }
  billboard(x, y, onto) {
    const p1 = this.block(x - 1.1, y + 0.6, 0.07, 0.6, 'steel', { part: 'post', valMul: 0.4 });
    const p2 = this.block(x + 1.1, y + 0.6, 0.07, 0.6, 'steel', { part: 'post', valMul: 0.4 });
    this.weld(p1, onto, x - 1.1, y, 0.5); this.weld(p2, onto, x + 1.1, y, 0.5);
    const b = this.block(x, y + 1.2 + 0.65, 1.7, 0.65, 'sign', { part: 'billboard', text: this.pick(BOARDS), hue: this.pick(CAR_COLS) });
    this.weld(p1, b, x - 1.1, y + 1.2, 0.6); this.weld(p2, b, x + 1.1, y + 1.2, 0.6);
  }
  antenna(x, y, onto) {
    const a = this.block(x, y + 1.4, 0.06, 1.4, 'steel', { part: 'antenna', valMul: 0.5 });
    this.weld(a, onto, x, y, 0.4);
  }
  aframe(fr, mat) {
    const w = fr.x1 - fr.x0 + 0.3, h = Math.min(1.6, w * 0.32), L = Math.hypot(w / 2, h) + 0.1, a = Math.atan2(h, w / 2);
    const cx = (fr.x0 + fr.x1) / 2, y0 = fr.roofY;
    const left = this.block(cx - w / 4, y0 + h / 2 + 0.06, L / 2, 0.12, mat, { a, part: 'roof' });
    const right = this.block(cx + w / 4, y0 + h / 2 + 0.06, L / 2, 0.12, mat, { a: -a, part: 'roof' });
    this.weld(left, right, cx, y0 + h, 0.6);
    const s0 = fr.top[0], s1 = fr.top[fr.top.length - 1];
    this.weld(left, s0, fr.x0 + 0.1, y0, 0.6); this.weld(right, s1, fr.x1 - 0.1, y0, 0.6);
  }
  chimney(x, n) {
    this.begin('Smokestack');
    let prev = this.ground, y = 0;
    const top = [];
    for (let i = 0; i < n; i++) {
      const hw = i < 2 ? 0.62 : i < 5 ? 0.52 : 0.45, hh = 0.5;
      const b = this.block(x, y + hh, hw, hh, 'brick', { part: 'stack', band: i % 4 === 3 });
      this.weld(b, prev, x, y, prev === this.ground ? 1.2 : 0.75);
      prev = b; y += 2 * hh; top.push(b);
    }
    prev.data.smoke = true;
    return top;
  }
  car(x) {
    const b = this.block(x, 0.42, 0.95, 0.42, 'car', { part: 'car', hue: this.pick(CAR_COLS), crumple: 0, noBld: true, flip: this.r() < 0.5 });
    return b;
  }
  tank(x, y, onto) {
    const b = this.block(x, y + 0.5, 0.36, 0.5, 'tank', { part: 'tank', noBld: true });
    if (onto) this.weld(b, onto, x, y, 0.3);
    return b;
  }
  lamp(x) {
    const b = this.block(x, 1.4, 0.06, 1.4, 'lamp', { part: 'lamp', noBld: true });
    this.weld(b, this.ground, x, 0, 1);
  }
  crate(x, y, s = 0.32) { return this.block(x, y + s, s, s, 'wood', { part: 'crate', noBld: true }); }

  // ---------------------------------------------------------------- kits
  rowhouse(x0, floors, bays, o = {}) {
    this.begin(o.name || 'Row house');
    const mat = o.mat || (this.r() < 0.6 ? 'brick' : 'stucco');
    const fr = this.frame(x0, {
      floors, bays, bayW: 2.0, floorH: 1.5, colW: 0.4, slabT: 0.26, col: mat, slab: 'wood',
      infill: (f) => (f === 0 && o.shop !== false ? 'shop' : mat === 'brick' ? 'brickwin' : 'stuccowin'),
    });
    const c = this.cornice(fr, mat);
    if (o.water) this.waterTower((fr.x0 + fr.x1) / 2 + (this.r() - 0.5) * 0.8, c.y + c.hh, c);
    return x0 + bays * 2.0 + 0.2;
  }
  woodhouse(x0, floors, bays) {
    this.begin('Timber house');
    const fr = this.frame(x0, { floors, bays, bayW: 2.0, floorH: 1.45, colW: 0.3, slabT: 0.22, col: 'wood', slab: 'wood', infill: () => 'woodwin' });
    this.aframe(fr, 'wood');
    return x0 + bays * 2.0 + 0.15;
  }
  clocktower(x0, floors) {
    this.begin('Clock tower');
    const fr = this.frame(x0, { floors, bays: 1, bayW: 2.2, floorH: 1.5, colW: 0.45, slabT: 0.28, col: 'brick', slab: 'wood',
      infill: (f) => (f === floors - 1 ? 'clock' : f === 0 ? 'brickwin' : 'brickwin') });
    // the clock face sits in the top bay
    const top = fr.top[0];
    const ck = this.block(x0 + 1.1, fr.roofY - 0.28 - 0.75, 0.8, 0.75, 'stucco', { part: 'clock' });
    this.weld(ck, top, x0 + 1.1, fr.roofY - 0.28, 0.6);
    this.aframe(fr, 'wood');
    return x0 + 2.2 + 0.25;
  }
  office(x0, floors, bays, o = {}) {
    this.begin(o.name || 'Office block');
    const fr = this.frame(x0, { floors, bays, bayW: 2.2, floorH: 1.45, colW: 0.38, slabT: 0.28, col: 'concrete', slab: 'concrete',
      infill: (f) => (f === 0 ? 'shop' : o.curtain ? 'curtain' : 'spandrel'), setback: o.setback });
    const roof = fr.top[Math.floor(fr.top.length / 2)];
    if (o.roof === 'billboard' && roof) this.billboard(roof.x, fr.roofY, roof);
    if (o.roof === 'antenna' && roof) this.antenna(roof.x, fr.roofY, roof);
    if (o.roof === 'water' && roof) this.waterTower(roof.x, fr.roofY, roof);
    return x0 + bays * 2.2 + 0.2;
  }
  warehouse(x0, floors, bays, o = {}) {
    this.begin(o.name || 'Warehouse');
    const fr = this.frame(x0, { floors, bays, bayW: 2.6, floorH: 1.7, colW: 0.3, slabT: 0.24, col: 'steel', slab: 'steel',
      infill: (f, c) => ((f + c) % 3 === 1 ? (c % 2 ? 'brace' : 'brace2') : f === floors - 1 ? 'panelwin' : 'panel') });
    if (o.tanks) for (const s of fr.top) if (this.r() < 0.6) this.tank(s.x + (this.r() - 0.5), fr.roofY, s);
    if (o.water && fr.top[0]) this.waterTower(fr.top[0].x, fr.roofY, fr.top[0]);
    return x0 + bays * 2.6 + 0.15;
  }
  steelframe(x0, floors, bays) {
    this.begin('Steel frame');
    this.frame(x0, { floors, bays, bayW: 2.4, floorH: 1.6, colW: 0.26, slabT: 0.22, col: 'steel', slab: 'steel',
      infill: (f, c) => ((f + c) % 2 ? 'brace' : 'brace2') });
    return x0 + bays * 2.4 + 0.15;
  }
}

// ------------------------------------------------------------------ the 15 blocks
// Each is a list of steps run left to right; `x` is the running cursor.
const L = [
  // OLD TOWN
  { name: 'Main Street', d: 0, f: 0.3, hint: true, build: (B) => {
    let x = 0; B.lamp(x - 1.2); x = B.rowhouse(x, 3, 2); B.car(x + 1.0); x += 2.2;
    x = B.rowhouse(x, 4, 3, { water: true }); B.lamp(x + 0.7); x += 1.4; x = B.woodhouse(x, 2, 2); B.car(x + 1.1);
  } },
  { name: 'Market Row', d: 0, f: 0.32, build: (B) => {
    let x = 0; x = B.woodhouse(x, 2, 2); x += 0.9; x = B.rowhouse(x, 3, 2); x += 0.2; x = B.rowhouse(x, 4, 2); B.car(x + 1.1); x += 2.3; x = B.rowhouse(x, 3, 3); B.lamp(x + 0.8);
  } },
  { name: 'Clock Square', d: 0, f: 0.33, build: (B) => {
    let x = 0; x = B.rowhouse(x, 3, 2); x += 0.8; x = B.clocktower(x, 6); x += 0.7; x = B.rowhouse(x, 4, 2, { water: true }); B.car(x + 1.1); x += 2.3; x = B.woodhouse(x, 2, 2);
  } },
  { name: 'Water Works', d: 0, f: 0.34, build: (B) => {
    let x = 0; x = B.rowhouse(x, 4, 2, { water: true }); B.tank(x + 0.5, 0); B.tank(x + 1.3, 0); x += 2.0; x = B.rowhouse(x, 5, 2, { water: true }); x += 0.8; B.car(x + 0.2); x += 1.6; x = B.rowhouse(x, 3, 3); B.tank(x + 0.6, 0);
  } },
  { name: 'Old Quarter', d: 0, f: 0.35, build: (B) => {
    let x = 0; x = B.woodhouse(x, 3, 2); x += 0.5; x = B.rowhouse(x, 5, 2, { water: true }); x += 0.3; x = B.clocktower(x, 7); x += 0.4; x = B.rowhouse(x, 4, 3); B.car(x + 1.1); x += 2.3; x = B.rowhouse(x, 3, 2);
  } },
  // DOWNTOWN
  { name: 'Glass Avenue', d: 1, f: 0.32, build: (B) => {
    let x = 0; x = B.office(x, 5, 2, { roof: 'antenna' }); B.car(x + 1.1); x += 2.3; x = B.office(x, 8, 3, { curtain: true, roof: 'water', name: 'Glass tower' }); x += 0.6; x = B.office(x, 4, 2);
  } },
  { name: 'Billboard Blvd', d: 1, f: 0.33, build: (B) => {
    let x = 0; x = B.office(x, 6, 2, { roof: 'billboard' }); x += 0.6; x = B.office(x, 9, 2, { curtain: true, roof: 'antenna', name: 'Glass tower' }); B.lamp(x + 0.7); x += 1.4; x = B.office(x, 5, 3, { roof: 'billboard' }); B.car(x + 1.1);
  } },
  { name: 'Setback Plaza', d: 1, f: 0.34, build: (B) => {
    let x = 0; x = B.office(x, 4, 2); x += 0.6;
    x = B.office(x, 11, 4, { curtain: true, name: 'Deco tower', roof: 'antenna', setback: (f) => (f < 5 ? [0, 4] : f < 8 ? [1, 4] : [1, 3]) });
    B.car(x + 1.1); x += 2.3; x = B.office(x, 5, 2, { roof: 'water' });
  } },
  { name: 'Twin Peaks', d: 1, f: 0.35, build: (B) => {
    let x = 0; x = B.office(x, 10, 2, { curtain: true, roof: 'antenna', name: 'West tower' }); B.car(x + 1.1); x += 2.3;
    x = B.office(x, 10, 2, { curtain: true, roof: 'antenna', name: 'East tower' }); x += 0.6; x = B.office(x, 5, 2, { roof: 'billboard' });
  } },
  { name: 'Skyline', d: 1, f: 0.36, build: (B) => {
    let x = 0; x = B.office(x, 7, 2, { roof: 'water' }); x += 0.5; x = B.office(x, 12, 3, { curtain: true, roof: 'antenna', name: 'Sky tower', setback: (f) => (f < 9 ? [0, 3] : [1, 2]) });
    x += 0.5; x = B.office(x, 9, 2, { curtain: true, roof: 'billboard', name: 'Glass tower' }); B.car(x + 1.1);
  } },
  // INDUSTRIAL
  { name: 'Rail Yard', d: 2, f: 0.32, build: (B) => {
    let x = 0; x = B.warehouse(x, 2, 3, { tanks: true }); B.tank(x + 0.5, 0); B.tank(x + 1.3, 0); x += 2.0; x = B.warehouse(x, 3, 2, { water: true }); B.crate(x + 0.6, 0); B.crate(x + 0.6, 0.64); B.crate(x + 1.3, 0);
  } },
  { name: 'Smokestacks', d: 2, f: 0.33, build: (B) => {
    let x = 0; x = B.warehouse(x, 2, 2); x += 1.2; B.chimney(x, 12); x += 1.6; x = B.warehouse(x, 3, 2, { tanks: true }); x += 1.2; B.chimney(x, 10); x += 1.4; B.tank(x, 0);
  } },
  { name: 'Tank Farm', d: 2, f: 0.34, build: (B) => {
    let x = 0; for (let i = 0; i < 4; i++) B.tank(x + i * 0.8, 0); x += 3.6; x = B.steelframe(x, 3, 2); x += 0.4;
    for (let i = 0; i < 3; i++) { B.tank(x + i * 0.8, 0); } for (let i = 0; i < 2; i++) B.tank(x + 0.4 + i * 0.8, 1.0); x += 2.8; x = B.warehouse(x, 3, 2, { tanks: true }); B.tank(x + 0.5, 0);
  } },
  { name: 'Steel Mill', d: 2, f: 0.35, build: (B) => {
    let x = 0; B.begin('Water tower'); B.steelTower(x + 1.2); x += 3.2; x = B.steelframe(x, 6, 2); x += 1.0; B.chimney(x, 14); x += 1.5; x = B.warehouse(x, 3, 3, { tanks: true });
  } },
  { name: 'Meltdown', d: 2, f: 0.36, build: (B) => {
    let x = 0; x = B.warehouse(x, 3, 2, { tanks: true }); x += 1.0; B.chimney(x, 13); x += 1.3; x = B.steelframe(x, 7, 2); x += 0.3;
    for (let i = 0; i < 3; i++) B.tank(x + 0.4 + i * 0.8, 0); x += 2.6; x = B.warehouse(x, 4, 2, { water: true, tanks: true }); x += 0.9; B.chimney(x, 11);
  } },
];
export const LEVELS = L.map((l, i) => ({ ...l, n: i + 1 }));

const BOT = [827e3, 1112e3, 980e3, 1816e3, 1842e3, 3177e3, 2434e3, 2333e3, 4183e3, 5328e3, 1640e3, 1723e3, 1854e3, 1281e3, 3687e3];
const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };

export function buildLevel(world, n) {
  const lv = LEVELS[n - 1];
  const B = new Builder(world, 1000 + n * 77);
  B.dm = [1, 1.5, 2.4][lv.d];
  lv.build(B);
  world.prime();
  let total = 0, extras = 0;
  for (const b of world.bodies) if (b.data && b.data.val) { total += b.data.val; if (b.data.noBld) extras += b.data.val; }
  const bldVal = B.blds.reduce((a, b) => a + b.value, 0);
  const potential = total + bldVal * 0.25; // demolition bonuses
  // targets come from bot runs with base gear (tools/calib.sh): 1 star is an easy fraction of the bot's score
  const bot = BOT[n - 1], f = 0.18 + (n - 1) * (0.2 / 14);
  const target = nice(bot * f);
  return {
    lv, blds: B.blds, ground: B.ground, district: lv.d,
    minX: B.minX, maxX: B.maxX, maxH: B.maxH, total: potential,
    target, stars: [target, nice(Math.max(bot * 0.75, target * 1.8)), nice(Math.max(bot * 1.3, target * 3))],
  };
}
