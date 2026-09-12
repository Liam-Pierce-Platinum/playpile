/* =====================================================================
   house.js — the place
   =====================================================================
   A grid, painted from a map. '#' is wall, '.' is floor, '+' is a doorway
   - walkable, but it still counts as a wall when the rooms are worked
   out, which is what makes each room a separate space that can be lit on
   its own.

   Rooms are found by flooding the floor without crossing doorways. Every
   switch belongs to the room it stands in, and a lit room is a room the
   things in the dark will not walk into. So the house does not get
   easier because you got better at it - it gets smaller.
   ===================================================================== */
import * as THREE from '../vendor/three.module.js';
import { ps1ify, paint, rng } from './real.js';

export const TILE = 4;

const MAP = [
  '##########################',
  '#........#.......#.......#',
  '#........#.......#.......#',
  '#...1....#...2...#...3...#',
  '#........#.......#.......#',
  '#........+.......+.......#',
  '#........#.......#.......#',
  '####+#######+#######+#####',
  '#........................#',
  '#....b........@.......b..#',
  '#........................#',
  '####+###########+#########',
  '#........#...............#',
  '#...4....#......5........#',
  '#........+...............#',
  '#....x...#....x......6...#',
  '#........#...............#',
  '##########################',
];

export const COLS = MAP[0].length, ROWS = MAP.length;

export function buildHouse(scene) {
  const grid = [];
  const switches = [];
  const blankets = [];
  const spawns = [];
  let start = null;

  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const ch = MAP[r][c];
      row.push(ch === '#' ? 1 : 0);
      const p = [(c + 0.5) * TILE, (r + 0.5) * TILE];
      if (ch === '@') start = p;
      else if (ch === 'x') spawns.push(p);
      else if (ch === 'b') blankets.push({ x: p[0], z: p[1], taken: false });
      else if (ch >= '1' && ch <= '9') switches.push({ x: p[0], z: p[1], id: +ch, on: false, room: -1 });
    }
    grid.push(row);
  }

  /* ---- rooms: flood the floor, but never through a doorway ---------- */
  const room = [];
  for (let r = 0; r < ROWS; r++) room.push(new Array(COLS).fill(-1));
  const isDoor = (c, r) => MAP[r][c] === '+';
  let nRooms = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] || room[r][c] >= 0 || isDoor(c, r)) continue;
    const id = nRooms++;
    const q = [[c, r]];
    room[r][c] = id;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (grid[ny][nx] || room[ny][nx] >= 0 || isDoor(nx, ny)) continue;
        room[ny][nx] = id;
        q.push([nx, ny]);
      }
    }
  }
  /* a doorway belongs to whichever room is on either side; it takes the
     lower id so a lit room lights its own thresholds */
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!isDoor(c, r)) continue;
    let best = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = room[r + dy] ? room[r + dy][c + dx] : -1;
      if (id >= 0 && (best < 0 || id < best)) best = id;
    }
    room[r][c] = best;
  }
  for (const s of switches) s.room = room[(s.z / TILE) | 0][(s.x / TILE) | 0];

  /* ---- textures, all painted here ------------------------------------
     FOUR TIMES THE RESOLUTION AND A LOT MORE IN THEM.
     At 64x64 with nearest filtering a wall was four colours and a rail.
     At 256 with mipmaps and a bump map taken off the luminance, the same
     wall has plaster tooth, a paper with a real pattern, a skirting with
     a shadow line under it, and damp in the corners - and the torch beam
     crossing it shows all of that, which is the difference between a
     surface and a fill colour.                                        */
  const wallTex = paint(256, 256, (g) => {
    const R = rng(7);
    /* plaster: a base, then thousands of specks at two scales, so it has
       tooth at arm's length AND at the far end of a room */
    g.fillStyle = '#5a5348'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14000; i++) {
      const v = 0.7 + R() * 0.55;
      g.fillStyle = 'rgba(' + (92 * v | 0) + ',' + (85 * v | 0) + ',' + (74 * v | 0) + ',0.55)';
      g.fillRect((R() * 256) | 0, (R() * 256) | 0, 1, 1);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = 'rgba(40,36,30,' + (0.05 + R() * 0.12).toFixed(2) + ')';
      const s = 2 + R() * 7;
      g.fillRect((R() * 256) | 0, (R() * 256) | 0, s, s);
    }
    /* damp, up from the skirting and down from the ceiling */
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(34,31,26,' + (0.03 + R() * 0.09).toFixed(2) + ')';
      const w = 10 + R() * 40, h = 8 + R() * 46;
      g.fillRect((R() * 256) | 0, R() > 0.5 ? 256 - h : 0, w, h);
    }
    /* the dado rail, with a shadow under it */
    g.fillStyle = '#3d382f'; g.fillRect(0, 158, 256, 10);
    g.fillStyle = '#6a6153'; g.fillRect(0, 158, 256, 2);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 168, 256, 4);
    /* the paper below it: vertical stripes with a faded motif */
    g.fillStyle = '#4a4238'; g.fillRect(0, 172, 256, 84);
    for (let x = 4; x < 256; x += 26) {
      g.fillStyle = '#423a31'; g.fillRect(x, 172, 5, 84);
      g.fillStyle = 'rgba(120,108,88,.08)'; g.fillRect(x + 10, 172, 2, 84);
    }
    for (let y = 186; y < 250; y += 24) for (let x = 16; x < 256; x += 26) {
      g.fillStyle = 'rgba(122,110,88,.10)';
      g.beginPath(); g.ellipse(x, y, 5, 8, 0, 0, 6.3); g.fill();
    }
    /* skirting board */
    g.fillStyle = '#332e27'; g.fillRect(0, 244, 256, 12);
    g.fillStyle = '#453e34'; g.fillRect(0, 244, 256, 3);
  });
  wallTex.repeat.set(1, 1);

  const floorTex = paint(256, 256, (g) => {
    const R = rng(19);
    g.fillStyle = '#3a3128'; g.fillRect(0, 0, 256, 256);
    /* boards, each one its own shade, with a grain that runs along it */
    for (let y = 0; y < 256; y += 32) {
      const v = 0.85 + R() * 0.35;
      g.fillStyle = 'rgb(' + (68 * v | 0) + ',' + (58 * v | 0) + ',' + (46 * v | 0) + ')';
      g.fillRect(0, y, 256, 30);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = 'rgba(30,24,18,' + (0.05 + R() * 0.25).toFixed(2) + ')';
        g.fillRect((R() * 256) | 0, y + (R() * 30) | 0, 6 + R() * 30, 1);
      }
      /* the gap between boards, and the light on the near edge of it */
      g.fillStyle = 'rgba(12,10,8,.75)'; g.fillRect(0, y + 30, 256, 2);
      g.fillStyle = 'rgba(120,104,80,.10)'; g.fillRect(0, y, 256, 1);
      /* nail heads */
      for (let x = 14; x < 256; x += 64) {
        g.fillStyle = 'rgba(20,17,13,.6)';
        g.fillRect(x, y + 4, 2, 2); g.fillRect(x, y + 24, 2, 2);
      }
    }
    /* wear in a path, because people walked here */
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(96,84,64,' + (0.02 + R() * 0.05).toFixed(2) + ')';
      const s = 12 + R() * 50;
      g.beginPath(); g.ellipse((R() * 256) | 0, (R() * 256) | 0, s, s * 0.6, 0, 0, 6.3); g.fill();
    }
  });

  const ceilTex = paint(128, 128, (g) => {
    const R = rng(23);
    g.fillStyle = '#2b2721'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = 'rgba(62,56,47,' + (0.2 + R() * 0.4).toFixed(2) + ')';
      g.fillRect((R() * 128) | 0, (R() * 128) | 0, 1, 1);
    }
    /* artex swirls, the way a ceiling of this age actually is */
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = 'rgba(70,64,54,' + (0.05 + R() * 0.12).toFixed(2) + ')';
      g.lineWidth = 1 + R() * 2;
      g.beginPath();
      g.arc((R() * 128) | 0, (R() * 128) | 0, 4 + R() * 12, 0, 3 + R() * 3);
      g.stroke();
    }
  });


  const H = 8;
  const wallMat = ps1ify(new THREE.MeshLambertMaterial({ map: wallTex }));
  const floorMat = ps1ify(new THREE.MeshLambertMaterial({ map: floorTex }));
  const ceilMat = ps1ify(new THREE.MeshLambertMaterial({ map: ceilTex }));

  /* ---- geometry ------------------------------------------------------ */
  const wallGeo = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!grid[r][c]) continue;
    const box = new THREE.BoxGeometry(TILE, H, TILE);
    const uv = box.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.0, uv.getY(i) * 2.0);
    box.translate((c + 0.5) * TILE, H / 2, (r + 0.5) * TILE);
    wallGeo.push(box);
  }
  scene.add(new THREE.Mesh(mergeAll(wallGeo), wallMat));

  const fw = COLS * TILE, fh = ROWS * TILE;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(fw / 2, 0, fh / 2);
  floorTex.repeat.set(COLS, ROWS);
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(fw / 2, H, fh / 2);
  ceilTex.repeat.set(COLS * 2, ROWS * 2);
  scene.add(ceil);

  /* ---- what is in the rooms ------------------------------------------ */
  const propMat = ps1ify(new THREE.MeshLambertMaterial({ map: paint(32, 32, (g) => {
    const R = rng(31);
    g.fillStyle = '#4a3826'; g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = 'rgba(30,22,14,' + (0.2 + R() * 0.4).toFixed(2) + ')';
      g.fillRect((R() * 32) | 0, (R() * 32) | 0, 1, R() > 0.7 ? 3 : 1);
    }
  }) }));
  const props = [];
  const R = rng(101);
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
    if (grid[r][c] || isDoor(c, r)) continue;
    if (R() > 0.10) continue;
    /* against a wall, because furniture in the middle of a room reads as
       an obstacle course rather than as somebody's house */
    let against = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid[r + dy][c + dx]) against = true;
    if (!against) continue;
    const w = 1.4 + R() * 1.6, h = 1.2 + R() * 2.6, d = 1.0 + R() * 1.2;
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate((c + 0.5) * TILE, h / 2, (r + 0.5) * TILE);
    props.push(b);
  }
  if (props.length) scene.add(new THREE.Mesh(mergeAll(props), propMat));

  /* ---- the switches, on the wall they stand against ------------------ */
  const plateOff = ps1ify(new THREE.MeshLambertMaterial({ color: 0xb9b2a2 }));
  const plateOn = ps1ify(new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  for (const s of switches) {
    const c = (s.x / TILE) | 0, r = (s.z / TILE) | 0;
    let nx = 0, nz = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (grid[r + dy] && grid[r + dy][c + dx]) { nx = dx; nz = dy; }
    const m = new THREE.Mesh(new THREE.BoxGeometry(nx ? 0.2 : 1.1, 1.4, nz ? 0.2 : 1.1), plateOff);
    m.position.set(s.x + nx * (TILE / 2 - 0.1), 4.2, s.z + nz * (TILE / 2 - 0.1));
    scene.add(m);
    s.mesh = m;
    s.onMat = plateOn;
    s.offMat = plateOff;
    /* the bulb this switch is wired to */
    const lamp = new THREE.PointLight(0xffd9a0, 0, TILE * 10, 1.1);
    lamp.position.set(s.x, H - 1.2, s.z);
    scene.add(lamp);
    s.lamp = lamp;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.9, 6),
      ps1ify(new THREE.MeshLambertMaterial({ color: 0x6a5f4c })));
    shade.position.set(s.x, H - 0.5, s.z);
    scene.add(shade);
    s.shade = shade;
    s.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x3a3428 }));
    s.bulb.position.set(s.x, H - 1.2, s.z);
    scene.add(s.bulb);
  }

  return { grid, room, nRooms, switches, blankets, spawns, start, H,
    solid: (x, z) => {
      const c = (x / TILE) | 0, r = (z / TILE) | 0;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
      return grid[r][c] === 1;
    },
    roomAt: (x, z) => {
      const c = (x / TILE) | 0, r = (z / TILE) | 0;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
      return room[r][c];
    } };
}

/* three's BufferGeometryUtils is a separate module in the vendored build,
   and all this needs is position/normal/uv concatenated, so it does it
   itself rather than dragging the whole utility in. */
function mergeAll(list) {
  let vtx = 0, idx = 0;
  for (const gg of list) { vtx += gg.attributes.position.count; idx += gg.index ? gg.index.count : 0; }
  const pos = new Float32Array(vtx * 3), nor = new Float32Array(vtx * 3), uv = new Float32Array(vtx * 2);
  const ind = new Uint32Array(idx);
  let vo = 0, io = 0;
  for (const gg of list) {
    const p = gg.attributes.position, n = gg.attributes.normal, u = gg.attributes.uv;
    pos.set(p.array, vo * 3);
    nor.set(n.array, vo * 3);
    uv.set(u.array, vo * 2);
    const gi = gg.index.array;
    for (let i = 0; i < gi.length; i++) ind[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  return out;
}
