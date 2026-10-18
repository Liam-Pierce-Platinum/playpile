// FIRING RANGE: a long outdoor range for testing attachments. Shooting bench, lane markers and
// distance boards at 10/25/50/100/150/200/300 m, mannequin soldiers (real hitboxes: head = kill),
// steel plates that ring, and a berm. Bullet drop is easy to read against the boards.
import * as THREE from 'three';
import { M, ensure, sandbags, hesco } from './kit.js';

function sign(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#222'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 120);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export default {
  id: 'range', name: 'Firing Range', desc: 'Test attachments, zeroing and bullet drop out to 300 m.', range: true,
  bounds: { minX: -30, maxX: 30, minZ: -320, maxZ: 12 },
  env: {
    hdri: 'kloofendal_misty_morning', envI: 0.9, bg: 'hdri', bgHdri: 'kloofendal_misty_morning_2k', bgI: 0.6, exposure: 0.66,
    fog: { color: 0xbcc6cf, density: 0.0025 },
    hemi: { sky: 0xc8d8ec, ground: 0x6a5a40, i: 0.55 },
    sun: { dir: [0.5, 0.9, 0.3], color: 0xfff4e0, intensity: 3.0, shadowSize: 40 },
    audio: 'range', viewRange: 400, lightK: 1,
  },
  async build(B) {
    const W = B.world, R = B.R, K = M(B);
    B.mat('ground', 'dry_ground_01', { tile: 4 }); B.mat('gravel', 'concrete_pavement', { tile: 2 }); B.mat('wood', 'weathered_planks', { tile: 2 });
    ensure(B, 'berm', () => new THREE.MeshStandardMaterial({ color: 0x6a5638, roughness: 1 }));
    ensure(B, 'steelT', () => new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.4, metalness: 0.9 }));
    ensure(B, 'grass', () => new THREE.MeshStandardMaterial({ color: 0x5d6a3a, roughness: 1 }));
    B.box(-200, -1, -400, 200, 0, 200, 'ground', { surf: 'dirt' });
    B.box(-14, 0, -2, 14, 0.12, 10, 'gravel', { surf: 'concrete' });                 // firing line pad
    // covered firing line: roof on posts, benches
    for (const x of [-13.5, -7.5, -2.5, 2.5, 7.5, 13.5]) for (const z of [-1.6, 8]) B.box(x - 0.12, 0.12, z - 0.12, x + 0.12, 3.2, z + 0.12, 'wood', { surf: 'wood' });
    B.box(-14, 3.2, -2, 14, 3.35, 9, 'wood', { surf: 'wood', bottom: true });
    for (let i = -2; i <= 2; i++) { B.box(i * 5 - 1.2, 0.12, -1.6, i * 5 + 1.2, 0.95, -0.9, 'wood', { surf: 'wood' }); }
    sandbags(B, -12, -2.4, 12, -2.4, 0.45);
    // lane dividers and distance boards
    for (const d of [10, 25, 50, 100, 150, 200, 300]) {
      const z = -d;
      const t = sign(d + ' m');
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
      const key = 'sign' + d; B.mat(key, m, { tile: 1 });
      for (const x of [-16, 16]) { B.box(x - 0.06, 0, z - 0.06, x + 0.06, 1.6, z + 0.06, 'wood', { surf: 'wood' }); const g = new THREE.PlaneGeometry(1.6, 0.8); g.translate(x, 1.9, z + 0.07); B.geo(g, key); }
      B.box(-16, 0.002, z - 0.1, 16, 0.01, z + 0.1, 'grass', { collide: false });
    }
    // steel plates (ring when hit): small at range
    const plates = [];
    for (const [x, d, s] of [[-8, 25, 0.3], [-4, 50, 0.3], [4, 100, 0.45], [8, 150, 0.5], [-6, 200, 0.6], [6, 300, 0.8]]) {
      const z = -d;
      B.box(x - 0.04, 0, z - 0.04, x + 0.04, 1.2, z + 0.04, K.darkMetal, { surf: 'metal' });
      const b = B.box(x - s / 2, 1.2, z - 0.02, x + s / 2, 1.2 + s * 1.2, z + 0.02, 'steelT', { surf: 'metal' });
      b.tag = 'plate'; plates.push(b);
    }
    // berm at the end and on the sides
    B.box(-40, 0, -330, 40, 9, -315, 'berm', { surf: 'dirt' }); B.box(-34, 0, -315, -26, 4, 0, 'berm', { surf: 'dirt' }); B.box(26, 0, -315, 34, 4, 0, 'berm', { surf: 'dirt' });
    // cover course near the line: barricades and walls for practising lean / mantle / vault
    hesco(B, -9, -14, 2); B.box(4, 0, -16, 7, 1.0, -15.6, 'wood', { surf: 'wood' }); B.box(-15, 0, -20, -11, 2.2, -19.7, 'wood', { surf: 'wood' }); B.box(9, 0, -22, 10, 1.6, -21, 'wood', { surf: 'wood' });
    B.prop('concrete_road_barrier', -4, 0, -11, 0, 1, { surf: 'concrete' }); B.prop('wooden_crate_01', 6, 0, -9, 0.3, 1.4, { surf: 'wood' });
    for (let i = 0; i < 40; i++) B.stain(R.range(-25, 25), 0.003, R.range(-310, 0), R.range(2, 6), R() * 6, R.pick([0, 2]), R.range(0.1, 0.25));
    W.add(-31, -1, -321, -30, 30, 13, 'concrete', { shoot: false, see: false }); W.add(30, -1, -321, 31, 30, 13, 'concrete', { shoot: false, see: false });
    W.add(-31, -1, 12, 31, 30, 13, 'concrete', { shoot: false, see: false }); W.add(-31, -1, -321, 31, 30, -320, 'concrete', { shoot: false, see: false });
    return {
      playerSpawns: [[0, 0.12, 2, 0]],
      dummies: [[-2, -10], [2, -25], [-3, -50], [3, -100], [0, -150], [-2, -200], [2, -300], [9, -18], [-10, -30]],
      squads: [], waveSpawns: [], plates,
    };
  },
};
