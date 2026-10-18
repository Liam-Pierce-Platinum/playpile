// MAP 5 - HIGHRISE 41: one floor of an office tower at dusk. Glass curtain walls on every side
// (bullets and eyes go through), the low sun raking long shadows across open-plan cubicles,
// glass-walled offices, a conference room, a server room, the lift core and a 56 m window
// corridor. The city skyline glows outside.
import * as THREE from 'three';
import { building, cubicles, M, ensure } from './kit.js';
const E = Math.PI / 2;   // spawn yaw: facing west = E, east = -E

export default {
  id: 'office', name: 'Highrise 41', desc: 'Office floor at dusk, close quarters: cubicle rows west, glass offices north, the lift core and server room centre, the conference room south.',
  bounds: { minX: -31, maxX: 31, minZ: -19, maxZ: 19 },
  env: {
    hdri: 'sunset_jhbcentral', envI: 0.5, bg: 'hdri', bgHdri: 'sunset_jhbcentral_2k', bgI: 0.9, envRot: 2.3, exposure: 0.95,
    fog: { color: 0x8a6a58, density: 0.0018 },
    hemi: { sky: 0xffd9b8, ground: 0x4a4038, i: 0.5 },
    sun: { dir: [-1, 0.16, 0.42], color: 0xffa060, intensity: 3.2, shadowSize: 42 },
    audio: 'office', viewRange: 70, lightK: 1,
    pools: { lamps: 0, shadows: 0, points: 4, rects: 6 },
  },
  async build(B) {
    const W = B.world, R = B.R, K = M(B);
    B.mat('carpet', 'dirty_carpet', { tile: 3 }); B.mat('tile', 'large_floor_tiles_02', { tile: 2 }); B.mat('plaster', 'white_plaster_02', { tile: 3 });
    B.mat('core', new THREE.MeshStandardMaterial({ color: 0xcdc9c0, roughness: 0.85 }), { tile: 1 }); B.mat('wood', 'laminate_floor_02', { tile: 2 });
    B.mat('partition', new THREE.MeshStandardMaterial({ color: 0x8f99a5, roughness: 0.97 }), { tile: 1 }); B.mat('desktop', 'laminate_floor_02', { tile: 1.4, color: new THREE.Color(0xd8ccb8) });
    B.mat('ceiling', ceilingTiles(), { tile: 1.2 });
    ensure(B, 'mullion', () => new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.4, metalness: 0.8 }));
    ensure(B, 'curtain', () => new THREE.MeshPhysicalMaterial({ color: 0x8a9aa6, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.2, depthWrite: false }));
    ensure(B, 'inner', () => new THREE.MeshPhysicalMaterial({ color: 0xc8d6dc, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }));
    ensure(B, 'rackMat', () => new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.45, metalness: 0.6 }));
    ensure(B, 'tableTop', () => new THREE.MeshPhysicalMaterial({ color: 0x3a2618, roughness: 0.3, clearcoat: 0.6 }));
    const X0 = -30, X1 = 30, Z0 = -18, Z1 = 18, CH = 3.2;
    // floor slab, ceiling
    B.box(X0 - 1, -0.6, Z0 - 1, X1 + 1, 0, Z1 + 1, 'carpet', { surf: 'concrete' });
    B.box(X0, CH, Z0, X1, CH + 0.4, Z1, 'ceiling', { surf: 'concrete', bottom: true, top: false });
    W.add(X0 - 1, CH, Z0 - 1, X1 + 1, CH + 3, Z1 + 1, 'concrete');
    // curtain wall: glass + mullions every 1.5 m, spandrel at the floor
    const cw = (ax, az, bx, bz) => {
      const horiz = Math.abs(bz - az) < 0.01; const len = horiz ? bx - ax : bz - az;
      if (horiz) B.box(ax, 0, az - 0.02, bx, CH, az + 0.02, 'curtain', { surf: 'glass', see: false });
      else B.box(ax - 0.02, 0, az, ax + 0.02, CH, bz, 'curtain', { surf: 'glass', see: false });
      for (let t = 0; t <= len + 0.01; t += 1.5) { if (horiz) B.box(ax + t - 0.04, 0, az - 0.08, ax + t + 0.04, CH, az + 0.08, 'mullion', { collide: false }); else B.box(ax - 0.08, 0, az + t - 0.04, ax + 0.08, CH, az + t + 0.04, 'mullion', { collide: false }); }
      if (horiz) B.box(ax, 0, az - 0.1, bx, 0.12, az + 0.1, 'mullion', { surf: 'metal' }); else B.box(ax - 0.1, 0, az, ax + 0.1, 0.12, bz, 'mullion', { surf: 'metal' });
    };
    cw(X0, Z0, X1, Z0); cw(X0, Z1, X1, Z1); cw(X0, Z0, X0, Z1); cw(X1, Z0, X1, Z1);
    // structural columns
    for (let x = -22; x <= 22; x += 11) for (const z of [-10, 10]) B.box(x - 0.35, 0, z - 0.35, x + 0.35, CH, z + 0.35, 'plaster', { surf: 'concrete' });
    // lift and stair core
    B.box(-6, 0, -4, 6, CH, 4, 'core', { surf: 'concrete' });
    for (const x of [-4, -1, 2]) B.box(x, 0.05, 4, x + 2, 2.4, 4.04, K.steel, { collide: false });
    B.glow(-0.4, 2.55, 4.04, 0.4, 2.75, 4.06, 0x30ff60, 2);
    // reception (south of core)
    B.box(-3, 0, 7, 3, 1.1, 8, 'wood', { surf: 'wood' }); B.box(-3, 1.1, 6.9, 3, 1.15, 8.1, 'tableTop', { collide: false });
    B.prop('Sofa_01', -9, 0, 15.5, Math.PI, 1, { surf: 'plastic' }); B.prop('potted_plant_01', -5, 0, 16.5, 0, 1, { surf: 'plastic' }); B.prop('potted_plant_01', 5, 0, 16.5, 0, 1, { surf: 'plastic' });
    // ---------------- west: open plan cubicles
    cubicles(B, -25, -13, 5, true); cubicles(B, -25, -5, 5, true); cubicles(B, -25, 5, 5, true); cubicles(B, -25, 13, 4, true);
    for (let i = 0; i < 10; i++) B.prop('SchoolChair_01', R.range(-26, -9), 0, R.pick([-12, -6, 6, 12]) + R.range(-0.4, 0.4), R() * 6, 1, { collider: null });
    for (let i = 0; i < 8; i++) B.prop('classic_laptop', -25 + Math.floor(R() * 5) * 1.8, 0.75, R.pick([-13.6, -4.4, 4.4, 13.6]), R() * 0.5, 1, { collider: null, contact: false });
    // ---------------- north-east: glass offices
    for (let i = 0; i < 4; i++) {
      const x0 = 8 + i * 5.4, x1 = x0 + 5.4;
      B.box(x0, 0, -9.05, x1, CH, -8.95, 'inner', { surf: 'glass', see: false });
      B.box(x0 - 0.05, 0, -18, x0 + 0.05, CH, -9, 'plaster', { surf: 'drywall' });
      B.box(x0 + 1.5, 0, -9.1, x0 + 2.5, 2.2, -8.9, 'inner', { collide: false });
      B.prop('metal_office_desk', x0 + 2.7, 0, -15.5, 0, 1, { surf: 'sheet' }); B.prop('modern_arm_chair_01', x0 + 2.7, 0, -13.8, Math.PI, 0.9, { collider: null });
      B.prop('drawer_cabinet', x0 + 0.6, 0, -17.3, 0, 1, { surf: 'sheet' });
    }
    // doors are gaps: rebuild the glass front with openings
    W.boxes = W.boxes.filter(b => !(b.surf === 'glass' && Math.abs(b.min.z + 9.05) < 0.01));
    for (let i = 0; i < 4; i++) { const x0 = 8 + i * 5.4; W.add(x0, 0, -9.05, x0 + 1.5, CH, -8.95, 'glass', { see: false }); W.add(x0 + 2.5, 0, -9.05, x0 + 5.4, CH, -8.95, 'glass', { see: false }); }
    B.box(29.6, 0, -18, 30, CH, -9, 'plaster', { surf: 'drywall' });
    // ---------------- south-east: conference room
    B.box(9, 0, 6.95, 25, CH, 7.05, 'inner', { surf: 'glass', see: false });
    B.box(8.95, 0, 7, 9.05, CH, 13, 'inner', { surf: 'glass', see: false });
    B.box(25, 0, 7, 25.1, CH, 18, 'plaster', { surf: 'drywall' });
    B.box(12, 0.72, 10, 22, 0.78, 14, 'tableTop', { surf: 'wood', nav: false }); B.box(12.5, 0, 11.5, 21.5, 0.72, 12.5, K.darkMetal, { surf: 'metal' });
    for (let i = 0; i < 6; i++) { B.prop('SchoolChair_01', 13 + i * 1.6, 0, 9.2, 0, 1, { collider: null }); B.prop('SchoolChair_01', 13 + i * 1.6, 0, 14.8, Math.PI, 1, { collider: null }); }
    B.box(24.9, 1.0, 9, 24.95, 2.5, 15, K.glassBlue, { collide: false });
    // ---------------- server room east of the core
    B.box(6, 0, -4, 6.1, CH, 4, 'plaster', { surf: 'drywall' });
    B.wall(6, -4, 14, -4, 0, CH, 0.15, 'plaster', { surf: 'drywall' }, [{ at: 6.5, w: 1.1, h: 2.2 }]);
    B.wall(6, 4, 14, 4, 0, CH, 0.15, 'plaster', { surf: 'drywall' });
    B.wall(14, -4, 14, 4, 0, CH, 0.15, 'plaster', { surf: 'drywall' }, [{ at: 4, w: 1.1, h: 2.2 }]);
    for (let i = 0; i < 4; i++) { B.box(7.2 + i * 1.6, 0, -2.6, 8.0 + i * 1.6, 2.1, 2.6, 'rackMat', { surf: 'metal' }); for (let k = 0; k < 8; k++) B.glow(7.15 + i * 1.6, 0.3 + k * 0.22, -2.4 + R() * 4.6, 7.17 + i * 1.6, 0.33 + k * 0.22, -2.3 + R() * 4.6, R() < 0.8 ? 0x30ff60 : 0xff8020, 2.5); }
    B.point([10, 2.8, 0], 0x88aaff, 4, 7);
    // ---------------- north-west break room
    B.wall(X0, -9, -24, -9, 0, CH, 0.15, 'plaster', { surf: 'drywall' });
    void 0;
    // ---------------- tactical layout: hold points in the open east end and both core corridors
    B.box(16, 0, -2.5, 19, 0.76, -0.7, 'desktop', { surf: 'wood' }); B.box(16, 0.76, -2.5, 16.06, 1.4, -0.7, 'partition', { surf: 'drywall' });
    B.box(20, 0, 1.5, 23, 0.76, 3.3, 'desktop', { surf: 'wood' }); B.box(22.94, 0.76, 1.5, 23, 1.4, 3.3, 'partition', { surf: 'drywall' });
    B.prop('drawer_cabinet', 26, 0, -2, E, 1, { surf: 'sheet' }); B.prop('drawer_cabinet', 18, 0, 5.5, 0, 1, { surf: 'sheet' });
    B.box(-1.2, 0, -7.4, 1.2, 1.25, -6.2, 'partition', { surf: 'sheet' });      // copier station, north corridor
    B.box(-12, 0, 5.2, -10.4, 1.1, 6.8, 'partition', { surf: 'sheet' });       // water cooler bay, south
    B.prop('Sofa_01', -2, 0, 11.5, 0, 1, { surf: 'plastic' });
    // ceiling light panels and rect lights
    for (let x = -26; x <= 26; x += 6.5) for (const z of [-14, -6, 6, 14]) { if (Math.abs(x) < 7 && Math.abs(z) < 5) continue; B.glow(x - 0.6, CH - 0.03, z - 0.3, x + 0.6, CH - 0.01, z + 0.3, 0xf4f6ff, 2.6); B.rect([x, CH - 0.05, z], [x, 0, z], 1.2, 0.6, 0xf2f4ff, 5.5); }
    // stains: coffee, scuffs, carpet wear along walkways
    for (let i = 0; i < 70; i++) B.stain(R.range(-29, 29), 0.003, R.range(-17, 17), R.range(0.5, 2.2), R() * 6, R.pick([0, 2, 3]), R.range(0.15, 0.35));
    for (let x = -28; x < 28; x += 1.6) B.stain(x, 0.003, -16.8 + R.range(-0.3, 0.3), 1.6, R() * 6, 2, 0.2);
    // ---------------- skyline outside (below and around the floor)
    const sky = [];
    for (let i = 0; i < 44; i++) {
      const a = R() * 6.28, r = R.range(90, 420), x = Math.cos(a) * r, z = Math.sin(a) * r, w = R.range(18, 45), d = R.range(18, 45), top = R.range(-70, 70);
      building(B, x - w / 2, z - d / 2, x + w / 2, z + d / 2, top, R() < 0.5 ? 'core' : 'plaster', { lit: 0.5, R, spacing: 4.5, groundH: 0, base: -150, collide: false, simple: true, minY: top - 60, parapet: false, kind: 2, faces: { n: 1, s: 1, e: 1, w: 1 } });
      sky.push([x, z]);
    }
    W.add(X0 - 1, -1, Z0 - 1, X0 - 0.1, CH, Z1 + 1, 'concrete', { shoot: false, see: false });
    W.add(X1 + 0.1, -1, Z0 - 1, X1 + 1, CH, Z1 + 1, 'concrete', { shoot: false, see: false });
    W.add(X0 - 1, -1, Z0 - 1, X1 + 1, CH, Z0 - 0.1, 'concrete', { shoot: false, see: false });
    W.add(X0 - 1, -1, Z1 + 0.1, X1 + 1, CH, Z1 + 1, 'concrete', { shoot: false, see: false });
    return {
      playerSpawns: [[-27, 0, 0, -Math.PI / 2], [-27, 0, 3, -Math.PI / 2]],
      spawns: { A: [[-28, 0, -15, -E], [-28, 0, -8, -E], [-28, 0, 0, -E], [-28, 0, 8, -E], [-28, 0, 15, -E]],
        B: [[28, 0, -6, E], [28, 0, -1, E], [28, 0, 4, E], [27.5, 0, 11, E], [27.5, 0, 16, E]],
        ffa: [[0, 0, -15, 0], [0, 0, 15, Math.PI], [12, 0, -14, 0], [-14, 0, 0, -E]] },
      roam: [[-18, 0, -10], [-18, 0, 1], [-18, 0, 10], [-8, 0, -7], [0, 0, -7], [8, 0, -7], [-8, 0, 6], [0, 0, 6], [8, 0, 6], [10, 0, 0], [20, 0, -6], [20, 0, 4], [15, 0, 12], [12, 0, -14], [22, 0, -14], [0, 0, 15], [27, 0, 12]],
      squads: [
        { pos: [-14, 0, 0], count: 2, patrol: [[-18, 0], [-8, 0], [-8, -9]], weapon: 'mp5' },
        { pos: [15, 0, -12], count: 2, patrol: [[11, -12], [27, -12], [20, -7]], weapon: 'm4' },
        { pos: [17, 0, 16], count: 2, patrol: [[11, 16], [22, 10]], weapon: 'ak' },
        { pos: [10, 0, 0], count: 1, patrol: [[10, -3.2], [10, 3.2]], weapon: 'mp5' },
        { pos: [20, 0, 3], count: 2, patrol: [[16, 4], [28, 4], [28, -6]], weapon: 'm4' },
        { pos: [0, 0, 12], count: 2, patrol: [[-6, 12], [6, 12], [0, 16]], weapon: 'mp5' },
      ],
      waveSpawns: [[28, 0, -16], [28, 0, 16], [20, 0, 0], [0, 0, 16], [0, 0, -16], [12, 0, -6]],
    };
  },
};

// suspended acoustic ceiling: 600 mm tiles in a grey T-bar grid, fissured mineral-fibre speckle
function ceilingTiles() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d9d7d1'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const v = 150 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v - 6},${0.25 + Math.random() * 0.35})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.2, 1 + Math.random() * 1.2); }
  g.fillStyle = '#8f9295'; for (const p of [0, 256]) { g.fillRect(p, 0, 7, 512); g.fillRect(0, p, 512, 7); }
  g.fillStyle = 'rgba(255,255,255,.35)'; for (const p of [7, 263]) { g.fillRect(p, 0, 2, 512); g.fillRect(0, p, 512, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, color: 0xffffff });
}
