// MAP 2 - DUST COMPOUND: a walled desert compound at noon. Mud-brick houses with rooms, a roof you
// can climb to, a guard tower, a courtyard market, a breach in the east wall, and open ground
// outside with wrecks, rocks and a HESCO overwatch ridge for long sightlines.
import * as THREE from 'three';
import { car, vehicle, sandbags, hesco, M, ensure, stairs, pallets } from './kit.js';
const E = Math.PI / 2;   // spawn yaw: facing west = E, east = -E

export default {
  id: 'desert', name: 'Dust Compound', desc: 'Walled compound at noon. Houses, rooftops, a guard tower and open desert sightlines.',
  bounds: { minX: -60, maxX: 60, minZ: -44, maxZ: 64 },
  env: {
    hdri: 'goegap', envI: 0.9, bg: 'hdri', bgHdri: 'goegap_2k', bgI: 1.5, exposure: 0.62,
    fog: { color: 0xc9b89a, density: 0.0045 },
    hemi: { sky: 0xbcd2ee, ground: 0x8a6e4a, i: 0.55 },
    sun: { dir: [0.35, 1, 0.22], color: 0xfff1dc, intensity: 3.4, shadowSize: 55 },
    weather: 'dust', audio: 'desert', viewRange: 150, lightK: 1.2,
  },
  async build(B) {
    const W = B.world, R = B.R, K = M(B);
    B.mat('ground', 'dry_ground_01', { tile: 4 }); B.mat('sand', 'aerial_sand', { tile: 6 });
    B.mat('mud', 'sandstone_brick_wall_01', { tile: 2.5 }); B.mat('plaster', 'clay_plaster', { tile: 3 }); B.mat('yplaster', 'yellow_plaster', { tile: 3 });
    ensure(B, 'tarp', () => new THREE.MeshStandardMaterial({ color: 0x7a3a22, roughness: 0.95, side: THREE.DoubleSide }));
    ensure(B, 'tarp2', () => new THREE.MeshStandardMaterial({ color: 0x2f4d6a, roughness: 0.95, side: THREE.DoubleSide }));
    ensure(B, 'wood', () => new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85 }));
    B.box(-200, -1, -200, 200, 0, 200, 'ground', { surf: 'dirt' });
    // sand drifts against walls (low, walkable) and dune berms outside
    for (let i = 0; i < 26; i++) { const x = R.range(-75, 75), z = R.range(-75, 75); if (Math.abs(x) < 34 && Math.abs(z) < 30) continue; const w = R.range(4, 12), d = R.range(3, 8); B.box(x - w / 2, 0, z - d / 2, x + w / 2, R.range(0.15, 0.4), z + d / 2, 'sand', { surf: 'sand' }); }
    // ---------------- compound wall with gates and a breach
    const H = 3.2, T = 0.6, X0 = -30, X1 = 30, Z0 = -25, Z1 = 25;
    B.wall(X0, Z1, X1, Z1, 0, H, T, 'mud', { surf: 'brick' }, [{ at: 30, w: 6, h: H }]);                 // south, main gate
    B.wall(X0, Z0, X1, Z0, 0, H, T, 'mud', { surf: 'brick' }, [{ at: 44, w: 2.5, h: 2.4 }, { at: 30, w: 5, h: H }]);   // north: small door + a gate (centre lane)
    B.wall(X0, Z0, X0, Z1, 0, H, T, 'mud', { surf: 'brick' }, [{ at: 23, w: 4, h: H }]);                // west gate
    B.wall(X1, Z0, X1, Z1, 0, H, T, 'mud', { surf: 'brick' }, [{ at: 31, w: 3.5, h: H }]);              // east breach
    for (let i = 0; i < 8; i++) B.box(X1 + R.range(-1, 2), 0, 4 + R.range(0, 4), X1 + R.range(0.5, 3), R.range(0.3, 0.9), 6 + R.range(0, 4), 'mud', { surf: 'brick' }); // rubble
    // wall top coping
    for (const [a, b, c, d] of [[X0 - 0.4, Z0 - 0.4, X1 + 0.4, Z0 + 0.4], [X0 - 0.4, Z1 - 0.4, X1 + 0.4, Z1 + 0.4]]) B.box(a, H, b, c, H + 0.12, d, 'plaster', { collide: false });
    // ---------------- main house (roof access by outside stairs)
    const house = (x0, z0, x1, z1, h, key, doors, wins, inner) => {
      const ops = (len) => [];
      B.wall(x0, z0, x1, z0, 0, h, 0.4, key, { surf: 'brick' }, doors.n || []);
      B.wall(x0, z1, x1, z1, 0, h, 0.4, key, { surf: 'brick' }, doors.s || []);
      B.wall(x0, z0, x0, z1, 0, h, 0.4, key, { surf: 'brick' }, doors.w || []);
      B.wall(x1, z0, x1, z1, 0, h, 0.4, key, { surf: 'brick' }, doors.e || []);
      B.box(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.25, z1 + 0.2, 'plaster', { surf: 'concrete', bottom: true });   // roof slab
      // parapet
      B.box(x0 - 0.2, h + 0.25, z0 - 0.2, x1 + 0.2, h + 1.0, z0 + 0.1, key, { surf: 'brick' }); B.box(x0 - 0.2, h + 0.25, z1 - 0.1, x1 + 0.2, h + 1.0, z1 + 0.2, key, { surf: 'brick' });
      B.box(x0 - 0.2, h + 0.25, z0, x0 + 0.1, h + 1.0, z1, key, { surf: 'brick' }); B.box(x1 - 0.1, h + 0.25, z0, x1 + 0.2, h + 1.0, z1, key, { surf: 'brick' });
      if (inner) inner();
      B.box(x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, 0.03, z1 - 0.2, 'plaster', { surf: 'concrete', collide: false });
    };
    const win = (at) => ({ at, w: 1.1, h: 1.0, y: 1.1 });
    house(-22, -18, -6, -4, 3.4, 'plaster', { s: [{ at: 4, w: 1.2, h: 2.2 }, win(10)], n: [win(5), win(12)], e: [{ at: 7, w: 1.2, h: 2.2 }], w: [win(4), win(10)] }, null, () => {
      B.wall(-14, -18, -14, -4, 0, 3.4, 0.25, 'plaster', { surf: 'brick' }, [{ at: 9, w: 1.1, h: 2.2 }]);
      B.wall(-22, -11, -14, -11, 0, 3.4, 0.25, 'plaster', { surf: 'brick' }, [{ at: 3, w: 1.1, h: 2.2 }]);
    });
    // parapet gap above the stairs + stairs up the west side
    stairs(B, -24.5, -5, '-z', 1.4, 0, 3.4, 'mud');
    B.box(-25.2, 0, -11.6, -22.2, 3.4, -10.3, 'mud', { surf: 'brick' });   // landing at the parapet
    // second house
    house(6, -19, 20, -8, 3.2, 'yplaster', { s: [{ at: 3, w: 1.2, h: 2.2 }, win(9)], w: [win(5)], e: [{ at: 4, w: 1.2, h: 2.2 }], n: [win(4), win(10)] }, null, () => {
      B.wall(13, -19, 13, -8, 0, 3.2, 0.25, 'yplaster', { surf: 'brick' }, [{ at: 6, w: 1.1, h: 2.2 }]);
    });
    // small house by the west gate
    house(-27, 6, -17, 14, 3.0, 'mud', { e: [{ at: 4, w: 1.2, h: 2.2 }], s: [win(5)], n: [win(5)] });
    // storage sheds (corrugated) with open fronts
    B.mat('tin', 'rusty_corrugated_iron', { tile: 2 });
    B.box(10, 0, 6, 22, 2.8, 6.15, 'tin', { surf: 'sheet' }); B.box(10, 0, 6, 10.15, 2.8, 14, 'tin', { surf: 'sheet' }); B.box(21.85, 0, 6, 22, 2.8, 14, 'tin', { surf: 'sheet' });
    B.box(9.8, 2.8, 5.8, 22.2, 2.9, 14.4, 'tin', { surf: 'sheet', bottom: true });
    pallets(B, 12, 8, 2); B.prop('wooden_military_crate', 15, 0, 8, 0.2, 1, { surf: 'wood' }); B.prop('old_military_crate', 19, 0, 9, -0.3, 1, { surf: 'wood' });
    for (let i = 0; i < 5; i++) B.prop('Barrel_01', 20.5 - (i % 2) * 0.7, 0, 11 + i * 0.6, R() * 6, 1, { surf: 'sheet' });
    // guard tower in the NE corner
    const tx = 25.5, tz = -20.5;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) B.box(tx + dx - 0.12, 0, tz + dz - 0.12, tx + dx + 0.12, 6, tz + dz + 0.12, 'wood', { surf: 'wood' });
    B.box(tx - 1.7, 5.0, tz - 1.7, tx + 1.7, 5.2, tz + 1.7, 'wood', { surf: 'wood', bottom: true });
    for (const s of [[-1.7, -1.7, 1.7, -1.6], [-1.7, 1.6, 1.7, 1.7], [1.6, -1.7, 1.7, 1.7]]) B.box(tx + s[0], 5.2, tz + s[1], tx + s[2], 6.2, tz + s[3], 'wood', { surf: 'wood' });
        B.box(tx - 1.9, 7.6, tz - 1.9, tx + 1.9, 7.7, tz + 1.9, 'tarp', { collide: false, bottom: true });
    stairs(B, tx - 1.7 - 7.84, tz, '+x', 1.0, 0, 5.0, 'wood', 'wood');
    // courtyard: well, market stalls, technical, sandbag positions at the gate
    B.geo(new THREE.CylinderGeometry(1.0, 1.1, 0.9, 20).translate(-2, 0.45, 8), 'mud'); W.addCentered(-2, 0, 8, 2.0, 0.9, 2.0, 'brick');
    for (const [x, z, tk] of [[-8, 16, 'tarp'], [-3, 18, 'tarp2'], [3, 16, 'tarp']]) {
      for (const [dx, dz] of [[-1.2, -0.9], [1.2, -0.9], [-1.2, 0.9], [1.2, 0.9]]) B.box(x + dx - 0.05, 0, z + dz - 0.05, x + dx + 0.05, 2.3, z + dz + 0.05, 'wood', { surf: 'wood' });
      B.box(x - 1.4, 2.3, z - 1.1, x + 1.4, 2.34, z + 1.1, tk, { collide: false, bottom: true });
      B.box(x - 1.1, 0, z - 0.4, x + 1.1, 0.85, z + 0.4, 'wood', { surf: 'wood' });
      B.prop('plastic_crate_01', x + 0.6, 0.85, z, R() * 6, 1, { collider: null });
    }
    vehicle(B, 'van', 8, 18, 0.15, 0xd8d4c8); vehicle(B, 'sedan', 22, -2, 0, 0x2a2622, { wrecked: true });
    sandbags(B, -6, 21.5, -1.5, 21.5); sandbags(B, 3.5, 21.5, 8, 21.5); sandbags(B, -6, 19, -6, 21.5);
    hesco(B, -28, -22, 3); hesco(B, 16, 22, 3);
    for (const [x, z] of [[-10, 2], [4, 0], [14, -4], [-18, -1]]) B.prop('wooden_military_crate', x, 0, z, R() * 3, 1, { surf: 'wood' });
    for (const [x, z] of [[-12, 4], [5.5, 1], [-16, 18]]) B.prop('metal_jerrycan', x, 0, z, R() * 6, 1, { collider: null });
    for (const [x, z] of [[0, -12], [-4, -20], [24, 15]]) B.prop('Barrel_01', x, 0, z, R() * 6, 1, { surf: 'sheet' });
    B.prop('old_tyre', 20, 0, 18, 0, 1, { collider: null }); B.prop('old_tyre', -6, 0, -2, 1, 1, { collider: null });
    // ---------------- outside: road with wrecks, rocks, dead trees, ruined hut, HESCO ridge
    for (const [x, z, r] of [[2, 40, 0.4], [-6, 58, Math.PI / 2], [12, 70, 0.1]]) vehicle(B, r > 1 ? 'van' : 'sedan', x, z, r, 0x2a2622, { wrecked: true });
    for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = R.range(38, 75); const x = Math.cos(a) * r, z = Math.sin(a) * r; B.prop('namaqualand_boulder_02', x, 0, z, R() * 6, R.range(0.8, 1.8), { surf: 'concrete' }); }
    for (let i = 0; i < 8; i++) { const a = R() * 6.28, r = R.range(36, 70); B.prop('dead_tree_trunk', Math.cos(a) * r, 0, Math.sin(a) * r, R() * 6, R.range(0.8, 1.3), { surf: 'wood' }); }
    // ruined hut west
    B.wall(-58, 4, -50, 4, 0, 2.6, 0.5, 'mud', { surf: 'brick' }, [{ at: 4, w: 1.4, h: 2.2 }]); B.wall(-58, 4, -58, 12, 0, 1.9, 0.5, 'mud', { surf: 'brick' }); B.wall(-58, 12, -53, 12, 0, 1.2, 0.5, 'mud', { surf: 'brick' });
    // HESCO overwatch ridge north
    B.box(-30, 0, -66, 30, 1.6, -58, 'sand', { surf: 'sand' });
    stairs(B, 0, -55, '-z', 6, 0, 1.6, 'sand', 'sand');
    hesco(B, -24, -60, 6); hesco(B, 8, -60, 6); sandbags(B, -6, -59.5, 4, -59.5, 0.9);
    for (let i = 0; i < 60; i++) B.stain(R.range(-70, 70), 0.003, R.range(-70, 70), R.range(2, 7), R() * 6, R.pick([0, 2]), R.range(0.12, 0.3));
    for (let i = 0; i < 30; i++) B.stain(R.range(-28, 28), 0.033, R.range(-23, 23), R.range(1, 3), R() * 6, R.pick([1, 2]), R.range(0.15, 0.35));
    // ---------------- approach: dirt track from the player spawn to the south gate, a roadblock checkpoint,
    // power line, tyre stacks and a second ruin east (cover all the way in, no 50 m of open flat)
    for (let i = 0; i < 70; i++) B.stain(R.pick([-1.1, 1.1]) + R.range(-0.4, 0.4), 0.004, R.range(28, 79), R.range(0.8, 1.8), R() * 6, R.pick([0, 2]), R.range(0.2, 0.4));
    // checkpoint: staggered barriers, booth, sandbag nest, generator + lamp
    for (const [x, z, r] of [[-4.5, 50, 0], [-1.2, 52.5, 0], [2.4, 50, 0], [5.6, 52.5, 0], [-7.6, 52.5, 0], [8.8, 50, 0]]) B.prop('concrete_road_barrier', x, 0, z, r, 1, { surf: 'concrete' });
    const bx = 11, bz = 47;
    B.wall(bx - 1.6, bz - 1.4, bx + 1.6, bz - 1.4, 0, 2.5, 0.15, 'yplaster', { surf: 'brick' }, [{ at: 1.6, w: 1.4, h: 0.9, y: 1.1 }]);
    B.wall(bx - 1.6, bz + 1.4, bx + 1.6, bz + 1.4, 0, 2.5, 0.15, 'yplaster', { surf: 'brick' }, [{ at: 1.6, w: 1.4, h: 0.9, y: 1.1 }]);
    B.wall(bx + 1.6, bz - 1.4, bx + 1.6, bz + 1.4, 0, 2.5, 0.15, 'yplaster', { surf: 'brick' });
    B.wall(bx - 1.6, bz - 1.4, bx - 1.6, bz + 1.4, 0, 2.5, 0.15, 'yplaster', { surf: 'brick' }, [{ at: 1.4, w: 0.9, h: 2.1 }]);
    B.box(bx - 1.9, 2.5, bz - 1.7, bx + 1.9, 2.62, bz + 1.7, 'tin', { surf: 'sheet', bottom: true });
    sandbags(B, -11, 46, -11, 50, 1.0); sandbags(B, -11, 46, -7.5, 46, 1.0);
    B.prop('portable_generator', 14, 0, 45, 0.4, 1, { surf: 'sheet' }); B.prop('propane_tank', 14.2, 0, 49.5, 0, 1, { surf: 'sheet' });
    B.prop('barrel_stove', -9, 0, 48, 0, 1, { surf: 'sheet' }); B.prop('wooden_crate_01', -9.5, 0, 44.8, 0.3, 1, { surf: 'wood' });
    B.box(12.85, 0, 50.9, 13.0, 4.6, 51.05, 'wood', { surf: 'wood' }); B.box(12.2, 4.5, 50.9, 13.0, 4.6, 51.05, 'wood', { collide: false });
    B.point([12.4, 4.4, 51], 0xffc888, 6, 14);
    // power line along the track
    for (let z = 76; z > 26; z -= 12) {
      B.box(-6.1, 0, z - 0.1, -5.9, 8, z + 0.1, 'wood', { surf: 'wood' }); B.box(-7, 7.4, z - 0.06, -5, 7.52, z + 0.06, 'wood', { collide: false });
      if (z > 30) for (const ox of [-6.8, -5.2]) B.box(ox - 0.012, 7.25, z - 12, ox + 0.012, 7.29, z, 'plasticBlack', { collide: false });
    }
    // tyre stacks and a burnt-out car by the track
    for (const [x, z] of [[-14, 62], [16, 60], [-18, 38], [20, 36]]) for (let k = 0; k < 3; k++) B.prop('old_tyre', x + (k % 2) * 0.2, k * 0.24, z, k, 1, { collider: k ? null : 'auto', surf: 'plastic' });
    vehicle(B, 'sedan', -16, 46, 1.2, 0x2a2622, { wrecked: true });
    B.prop('covered_car', 22, 0, 52, 0.4, 1, { surf: 'sheet' });
    // east ruin: two broken rooms, a collapsed roof slab, crates
    B.wall(46, -16, 58, -16, 0, 3.0, 0.5, 'plaster', { surf: 'brick' }, [{ at: 3, w: 1.2, h: 2.2 }, { at: 8, w: 1.1, h: 1.0, y: 1.1 }]);
    B.wall(46, -16, 46, -4, 0, 2.2, 0.5, 'plaster', { surf: 'brick' }, [{ at: 6, w: 1.4, h: 2.0 }]);
    B.wall(58, -16, 58, -8, 0, 3.0, 0.5, 'plaster', { surf: 'brick' });
    B.wall(46, -4, 52, -4, 0, 1.4, 0.5, 'plaster', { surf: 'brick' });
    B.wall(52, -16, 52, -9, 0, 3.0, 0.3, 'plaster', { surf: 'brick' }, [{ at: 3, w: 1.1, h: 2.2 }]);
    B.box(52.2, 0, -15.6, 57.8, 0.6, -9, 'mud', { surf: 'brick' });
    for (const [x, z] of [[48, -13], [55, -6], [49, -7]]) B.prop('old_military_crate', x, 0, z, R() * 3, 1, { surf: 'wood' });
    // boundary
    // ---------------- tactical layout: the north approach gets hold points, both flanks outside the walls
    // get cover so the compound (centre lane) is not the only way through
    hesco(B, -12, -33, 3, true); hesco(B, 10, -33, 3, true); sandbags(B, -3, -38, 3, -38); vehicle(B, 'van', -26, -36, 0.4, 0x8a7a5a, { wrecked: true });
    sandbags(B, -40, -12, -40, -6); hesco(B, -42, 8, 2, false); sandbags(B, -38, 26, -34, 26); hesco(B, -44, 40, 2, true);
    sandbags(B, 40, -14, 40, -8); hesco(B, 38, 14, 2, false); sandbags(B, 36, 32, 42, 32); hesco(B, 44, 44, 2, true);
    // arena edge: the fight stays around the compound
    W.add(-61, -1, -45, -60, 30, 65, 'concrete', { shoot: false, see: false }); W.add(60, -1, -45, 61, 30, 65, 'concrete', { shoot: false, see: false });
    W.add(-61, -1, -45, 61, 30, -44, 'concrete', { shoot: false, see: false }); W.add(-61, -1, 64, 61, 30, 65, 'concrete', { shoot: false, see: false });
    W.add(-81, -1, -81, -80, 30, 81, 'concrete', { shoot: false, see: false }); W.add(80, -1, -81, 81, 30, 81, 'concrete', { shoot: false, see: false });
    W.add(-81, -1, -81, 81, 30, -80, 'concrete', { shoot: false, see: false }); W.add(-81, -1, 80, 81, 30, 81, 'concrete', { shoot: false, see: false });
    return {
      playerSpawns: [[0, 0, 58, 0], [-10, 0, 58, 0]],
      spawns: { A: [[-20, 0, 58, 0], [-8, 0, 60, 0], [4, 0, 58, 0], [16, 0, 60, 0], [28, 0, 56, 0]],
        B: [[-20, 0, -40, Math.PI], [-8, 0, -41, Math.PI], [4, 0, -40, Math.PI], [16, 0, -41, Math.PI], [28, 0, -40, Math.PI]],
        ffa: [[-52, 0, 10, -E], [52, 0, 0, E], [-50, 0, -30, -E], [50, 0, 40, E]] },
      roam: [[0, 0, 40], [-14, 0, 46], [14, 0, 44], [0, 0, 10], [-2, 0, -2], [10, 0, 6], [-16, 0, 14], [18, 0, 16], [-18, 0, -8], [13, 0, -13], [0, 0, -30], [-14, 0, -36], [14, 0, -36],
        [-40, 0, -20], [-42, 0, 0], [-40, 0, 20], [-40, 0, 40], [40, 0, -20], [42, 0, 0], [40, 0, 22], [40, 0, 40]],
      squads: [
        { pos: [0, 0, 10], count: 3, patrol: [[0, 10], [-8, 0], [10, 2]], weapon: 'ak' },
        { pos: [-14, 0, -10], count: 2, patrol: [[-18, -14], [-10, -8]], weapon: 'ak' },
        { pos: [13, 0, -13], count: 2, patrol: [[9, -15], [17, -11]], weapon: 'mp5' },
        { pos: [25.5, 5.2, -20.5], count: 1, patrol: [], weapon: 'm4' },
        { pos: [-18, 3.65, -12], count: 1, patrol: [], weapon: 'm4' },
        { pos: [0, 1.6, -62], count: 2, patrol: [[-12, -62], [12, -62]], weapon: 'm4' },
        { pos: [-54, 0, 8], count: 2, patrol: [[-54, 8], [-45, 20]], weapon: 'ak' },
        { pos: [2, 0, 46], count: 2, patrol: [[-4, 46], [9, 44]], weapon: 'ak' },
        { pos: [52, 0, -12], count: 2, patrol: [[49, -10], [55, -4]], weapon: 'mp5' },
      ],
      waveSpawns: [[-70, 0, -70], [70, 0, -70], [70, 0, 30], [-70, 0, 30], [0, 0, -70], [40, 0, -40]],
    };
  },
};
