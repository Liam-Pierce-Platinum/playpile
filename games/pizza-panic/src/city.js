// City layout: an NB x NB grid of blocks separated by two-lane roads.
export const P = 360, R = 120, NB = 8, SW = 18, W = NB * P + R;
export const rc = (i) => i * P + R / 2; // road centre line
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const PAL = [[236, 216, 186], [204, 216, 226], [244, 200, 162], [190, 204, 172], [222, 190, 202], [172, 198, 224], [232, 228, 214], [212, 170, 142], [242, 230, 162], [180, 214, 204], [246, 178, 150]];

export function makeCity(seed = 7) {
  const r = rng(seed);
  const city = { buildings: [], doors: [], trees: [], grid: [], pizza: null };
  const addDoor = (b, side) => {
    const t = 0.25 + r() * 0.5;
    let d;
    if (side === 'n') d = { x: b.x + b.w * t, y: b.y - 7, nx: 0, ny: -1 };
    if (side === 's') d = { x: b.x + b.w * t, y: b.y + b.h + 7, nx: 0, ny: 1 };
    if (side === 'w') d = { x: b.x - 7, y: b.y + b.h * t, nx: -1, ny: 0 };
    if (side === 'e') d = { x: b.x + b.w + 7, y: b.y + b.h * t, nx: 1, ny: 0 };
    d.b = b; d.col = ['#d94f3d', '#2f7fbf', '#3a9a5b', '#e0a030', '#8a4fbf'][Math.floor(r() * 5)];
    city.doors.push(d);
  };
  for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
    const bx = i * P + R, by = j * P + R, bs = P - R;
    const ix = bx + SW, iy = by + SW, is = bs - 2 * SW;
    const cell = { i, j, b: [], t: [], park: false };
    city.grid[j * NB + i] = cell;
    if (i === 4 && j === 3) { // the pizzeria
      const b = { x: ix + 10, y: iy + 10, w: is - 20, h: is - 20, ht: 58, col: [226, 70, 56], kind: 'pizza', seed: 0.5 };
      city.buildings.push(b); cell.b.push(b);
      city.pizza = { b, dx: b.x + b.w / 2, dy: b.y + b.h + 7, x: b.x + b.w / 2, y: by + bs + 34 };
      continue;
    }
    if ((i + j * 3) % 7 === 2 && r() < 0.7) { // park with trees: drivable grass shortcut
      cell.park = true;
      for (let k = 0; k < 7; k++) {
        const t = { x: ix + 26 + r() * (is - 52), y: iy + 26 + r() * (is - 52), r: 11 + r() * 7 };
        if (cell.t.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 52)) continue;
        cell.t.push(t); city.trees.push(t);
      }
      continue;
    }
    const m = r(); let lots;
    if (m < 0.22) lots = [[0, 0, 1, 1]];
    else if (m < 0.55) { const s = 0.38 + r() * 0.24; lots = r() < 0.5 ? [[0, 0, s, 1], [s, 0, 1, 1]] : [[0, 0, 1, s], [0, s, 1, 1]]; }
    else { const sx = 0.38 + r() * 0.24, sy = 0.38 + r() * 0.24; lots = [[0, 0, sx, sy], [sx, 0, 1, sy], [0, sy, sx, 1], [sx, sy, 1, 1]]; }
    for (const [a0, b0, a1, b1] of lots) {
      const b = { x: ix + a0 * is, y: iy + b0 * is, w: (a1 - a0) * is, h: (b1 - b0) * is, ht: 34 + r() * r() * 170, col: PAL[Math.floor(r() * PAL.length)], seed: r() };
      city.buildings.push(b); cell.b.push(b);
      if (a0 === 0) addDoor(b, 'w'); if (a1 === 1) addDoor(b, 'e');
      if (b0 === 0) addDoor(b, 'n'); if (b1 === 1) addDoor(b, 's');
    }
  }
  return city;
}

export function cellAt(city, x, y) {
  const i = Math.floor((x - R) / P), j = Math.floor((y - R) / P);
  if (i < 0 || j < 0 || i >= NB || j >= NB) return null;
  return city.grid[j * NB + i];
}
export function solidsNear(city, x, y) {
  const i = Math.floor((x - R) / P), j = Math.floor((y - R) / P), out = [];
  for (let jj = j - 1; jj <= j + 1; jj++) for (let ii = i - 1; ii <= i + 1; ii++) {
    if (ii < 0 || jj < 0 || ii >= NB || jj >= NB) continue;
    out.push(city.grid[jj * NB + ii]);
  }
  return out;
}
export function onGrass(city, x, y) {
  const c = cellAt(city, x, y); if (!c || !c.park) return false;
  const lx = x - (c.i * P + R), ly = y - (c.j * P + R), e = P - R - SW;
  return lx > SW && ly > SW && lx < e && ly < e;
}
export function inBuilding(city, x, y, pad = 0) {
  const c = cellAt(city, x, y); if (!c) return null;
  for (const b of c.b) if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  return null;
}
