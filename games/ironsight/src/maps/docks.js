// MAP 3 - RUSTWATER DOCKS: an abandoned warehouse (tin walls bullets go through, storage racks,
// a mezzanine office with a catwalk) opening onto a container yard and a quay with a moored
// freighter. Dusk under heavy overcast, sodium lamps coming on.
import * as THREE from 'three';
import { sandbags, hesco, container, fence, M, ensure, stairs, pallets, car, vehicle } from './kit.js';
const E = Math.PI / 2;   // spawn yaw: facing west = E, east = -E

export default {
  id: 'docks', name: 'Rustwater Docks', desc: 'Dusk docks, three lanes: the container stacks north, the warehouse racks and catwalk centre, the open quay south.',
  bounds: { minX: -70, maxX: 70, minZ: -50, maxZ: 46 },
  env: {
    hdri: 'docklands_01', envI: 0.55, bg: 'gradient', gradient: [0x2a3442, 0x9a7a62, 0x302a26], exposure: 0.9,
    fog: { color: 0x6c625c, density: 0.011 },
    hemi: { sky: 0x8d97a8, ground: 0x3a3028, i: 0.45 },
    sun: { dir: [-0.7, 0.32, 0.45], color: 0xffb27a, intensity: 1.3, shadowSize: 60 },
    weather: 'dust', audio: 'warehouse', viewRange: 110, lightK: 1,
    indoor: [[-40, -30, 10, 5]],
    pools: { lamps: 6, shadows: 3, points: 8 },
  },
  async build(B) {
    const W = B.world, R = B.R, K = M(B);
    B.mat('apron', 'hangar_concrete_floor', { tile: 6 }); B.mat('floor', 'concrete_floor_02', { tile: 4 });
    B.mat('tin', 'rusty_corrugated_iron', { tile: 2.2 }); B.mat('tin2', 'corrugated_iron_02', { tile: 2.2 }); B.mat('plate', 'metal_plate', { tile: 1.5, metalness: 0.7 });
    B.mat('planks', 'worn_planks', { tile: 2 }); B.mat('conc', 'concrete_wall_006', { tile: 3 });
    ensure(B, 'water', () => new THREE.MeshPhysicalMaterial({ color: 0x0b1a1e, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.5, clearcoat: 1 }));
    ensure(B, 'rack', () => new THREE.MeshStandardMaterial({ color: 0x2b4c8a, roughness: 0.5, metalness: 0.6 }));
    ensure(B, 'rackBeam', () => new THREE.MeshStandardMaterial({ color: 0xd06a12, roughness: 0.5, metalness: 0.5 }));
    B.mat('hull', 'metal_plate', { tile: 3, color: new THREE.Color(0x8796a6), metalness: 0.2 });
    B.mat('deckhouse', 'metal_plate', { tile: 2.5, color: new THREE.Color(0xd8d6cf), metalness: 0.2 });
    ensure(B, 'hullRed', () => new THREE.MeshStandardMaterial({ color: 0x6a1a12, roughness: 0.7, metalness: 0.4 }));
    // ground: concrete apron, quay edge at z = 40, water below
    B.box(-100, -1, -60, 100, 0, 40, 'apron', { surf: 'concrete' });
    B.box(-100, -2.2, 40, 100, -1.8, 120, 'water', { surf: 'dirt', collide: false });
    W.add(-100, -6, 40, 100, -1.9, 120, 'dirt', { shoot: true, see: true });
    B.box(-100, -2, 40, 100, 0, 40.4, 'conc', { surf: 'concrete' });                 // quay wall face
    for (let x = -60; x <= 60; x += 10) { B.geo(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 14).translate(x, 0.3, 39.2), K.darkMetal); W.addCentered(x, 0, 39.2, 0.5, 0.6, 0.5, 'metal'); }
    W.add(-100, -1, 40.4, 100, 3, 41, 'concrete', { shoot: false, see: false });      // stop walking into the water
    // ---------------- warehouse
    const X0 = -40, X1 = 10, Z0 = -30, Z1 = 5, H = 11;
    B.box(X0, 0, Z0, X1, 0.02, Z1, 'floor', { surf: 'concrete', collide: false });
    B.wall(X0, Z1, X1, Z1, 0, H, 0.08, 'tin', { surf: 'sheet' }, [{ at: 7, w: 6, h: 5 }, { at: 35, w: 6, h: 5 }]);
    B.wall(X0, Z0, X1, Z0, 0, H, 0.08, 'tin', { surf: 'sheet' }, [{ at: 20, w: 1.4, h: 2.3 }]);
    B.wall(X0, Z0, X0, Z1, 0, H, 0.08, 'tin2', { surf: 'sheet' }, [{ at: 18, w: 1.4, h: 2.3 }]);
    B.wall(X1, Z0, X1, Z1, 0, H, 0.08, 'tin2', { surf: 'sheet' }, [{ at: 11, w: 1.4, h: 2.3 }, { at: 26, w: 4, h: 4.2 }]);
    B.box(X0 - 0.3, H, Z0 - 0.3, X1 + 0.3, H + 0.15, Z1 + 0.3, 'tin', { surf: 'sheet', bottom: true });
    for (let x = X0 + 5; x < X1; x += 10) { B.box(x - 0.15, 0, Z0, x + 0.15, H, Z0 + 0.3, 'plate', { surf: 'metal' }); B.box(x - 0.15, 0, Z1 - 0.3, x + 0.15, H, Z1, 'plate', { surf: 'metal' }); B.box(x - 0.1, H - 0.6, Z0, x + 0.1, H - 0.3, Z1, 'plate', { collide: false }); }
    // skylight strips + hanging lamps
    for (let x = X0 + 10; x < X1; x += 10) { B.glow(x - 0.8, H - 0.05, Z0 + 3, x + 0.8, H - 0.02, Z1 - 3, 0x9fb2c8, 0.6); B.point([x, 8.5, -12.5], 0xffd9a8, 22, 22, { priority: 1.5 }); B.glow(x - 0.3, 8.9, -12.8, x + 0.3, 9.0, -12.2, 0xfff0d0, 3); }
    // storage racks: uprights, beams and pallet loads (bullets pass through gaps, cargo stops them)
    const rack = (x, z0, z1) => {
      for (let z = z0; z <= z1; z += 2.7) for (const dx of [-0.55, 0.55]) B.box(x + dx - 0.05, 0, z - 0.05, x + dx + 0.05, 6.2, z + 0.05, 'rack', { surf: 'metal' });
      for (const y of [0.15, 2.2, 4.2]) { B.box(x - 0.6, y, z0, x + 0.6, y + 0.12, z1, 'rackBeam', { surf: 'metal', collide: y < 0.5 }); }
      for (let z = z0 + 1.35; z < z1; z += 2.7) for (const y of [0.27, 2.32, 4.32]) {
        if (R() < 0.2) continue;
        const h = R.range(0.8, 1.6);
        B.box(x - 0.52, y, z - 1.12, x + 0.52, y + 0.13, z + 1.12, 'palletWood', { surf: 'wood' });
        B.box(x - 0.5, y + 0.13, z - 1.1, x + 0.5, y + 0.13 + h, z + 1.1, R() < 0.55 ? 'pallet_load' : 'pallet_load2', { surf: R() < 0.5 ? 'wood' : 'plastic' });
      }
    };
    B.mat('pallet_load', cartonMaterial(false), { tile: 1.2 }); B.mat('pallet_load2', cartonMaterial(true), { tile: 1.2 });
    B.mat('palletWood', 'weathered_planks', { tile: 1, color: new THREE.Color(0xb09a80) });
    for (const x of [-33, -27, -21]) rack(x, -26, -6);
    // mezzanine office (NE corner) with catwalk along the north wall + stairs
    const my = 4.2;
    B.box(-12, my, -30, 9.9, my + 0.2, -24, 'plate', { surf: 'metal', bottom: true });      // catwalk/office floor
    for (const x of [-12, -6, 0, 6, 9.6]) B.box(x - 0.12, 0, -24.2, x + 0.12, my, -23.95, 'plate', { surf: 'metal' });
    B.box(-12, my + 0.2, -24.1, 9.9, my + 1.2, -24.0, K.steel, { surf: 'metal', shoot: false, see: false });   // railing
    B.box(0, my + 0.2, -30, 9.9, my + 3.2, -29.8, 'conc', { surf: 'drywall' });
    B.box(0, my + 0.2, -29.8, 0.15, my + 3.2, -24.3, 'conc', { surf: 'drywall' });
    B.box(0.15, my + 1.1, -24.25, 9.9, my + 3.2, -24.1, K.glassLit, { surf: 'glass', see: false });
    B.box(0.15, my + 0.2, -24.25, 9.9, my + 1.1, -24.1, 'conc', { surf: 'drywall' });
    B.box(0, my + 3.2, -30, 9.9, my + 3.35, -24.1, 'conc', { collide: false, bottom: true });
    B.point([5, my + 2.8, -27], 0xfff2dd, 6, 9);
    stairs(B, -12.6, -24.6, '-x', 1.1, 0, my, 'plate', 'metal');
    B.prop('metal_office_desk', 4, my + 0.2, -28, 0, 1, { surf: 'sheet' }); B.prop('drawer_cabinet', 8.5, my + 0.2, -29, 0, 1, { surf: 'sheet' });
    // floor clutter: crates, forklift, pallets, barrels
    for (const [x, z] of [[-12, -14], [-8, -18], [-4, -8], [2, -16], [-14, -4], [4, -4]]) B.prop(R() < 0.5 ? 'wooden_crate_01' : 'wooden_crate_02', x, 0, z, R() * 0.3, R.range(1.2, 1.7), { surf: 'wood' });
    for (const [x, z] of [[-6, -12], [0, -10], [-10, 0]]) pallets(B, x, z, 3);
    ensure(B, 'fork', () => new THREE.MeshStandardMaterial({ color: 0xd8a514, roughness: 0.5, metalness: 0.3 }));
    B.box(-16, 0.2, -16, -14.6, 1.6, -13.4, 'fork', { surf: 'sheet' }); B.box(-16, 1.6, -16, -14.6, 2.3, -14.6, K.darkMetal, { surf: 'metal' });
    B.box(-16.8, 0.05, -15.6, -16, 0.15, -13.8, K.steel, { surf: 'metal', collide: false });
    for (let i = 0; i < 6; i++) B.prop('barrel_03', 6 + (i % 3) * 0.75, 0, 0 + Math.floor(i / 3) * 0.75, R() * 6, 1, { surf: 'sheet' });
    B.prop('hand_truck', -2, 0, 2, 0.4, 1, { collider: null });
    B.prop('steel_frame_shelves_01', -38.5, 0, 0, Math.PI / 2, 1.2, { surf: 'metal' }); B.prop('steel_frame_shelves_01', -38.5, 0, -4, Math.PI / 2, 1.2, { surf: 'metal' });
    B.prop('propane_tank', -37, 0, -28, 0, 1, { surf: 'metal' }); B.prop('industrial_pastic_container', -30, 0, 2, 0.2, 1, { surf: 'plastic' });
    // ---------------- container yard
    const rows = [[18, -36, true], [18, -22, true], [18, -8, true], [32, -30, true], [32, -14, true], [48, -36, true], [48, -20, true], [48, -6, true], [62, -26, true], [62, -10, true]];
    for (const [x, z, ax] of rows) { container(B, x, 0, z, ax, true); if (R() < 0.55) container(B, x + R.range(-1, 1), 2.59, z, ax, R() < 0.7); }
    for (const [x, z] of [[24, 8], [40, 6], [56, 12], [-50, 14], [-56, -10]]) container(B, x, 0, z, false, false);
    // gantry crane over the yard
    for (const x of [26, 56]) for (const z of [-44, 2]) B.box(x - 0.6, 0, z - 0.6, x + 0.6, 18, z + 0.6, K.paintYellow, { surf: 'metal' });
    B.box(25.4, 18, -44.6, 26.6, 19.4, 2.6, K.paintYellow, { surf: 'metal' }); B.box(55.4, 18, -44.6, 56.6, 19.4, 2.6, K.paintYellow, { surf: 'metal' });
    B.box(25.4, 18.4, -22, 56.6, 19.6, -20, K.paintYellow, { surf: 'metal' });
    // quay: freighter alongside, mooring lines (visual), lamps
    freighter(B, K);
    for (let i = 0; i < 4; i++) container(B, -50 + i * 13, 6.4, 54, true, true);
    for (let x = -60; x <= 60; x += 20) { B.box(x - 0.1, 0, 36, x + 0.1, 9, 36.2, K.darkMetal, { surf: 'metal' }); B.lamp([x, 9, 35.4], [x, 0, 30], 0xffa850, 70, { priority: 1 }); B.glow(x - 0.25, 8.85, 35.2, x + 0.25, 9.0, 35.7, 0xffb060, 4); }
    for (let x = -55; x <= 25; x += 20) B.point([x, 4.5, 43], 0xffb070, 9, 13);   // quay floods washing the freighter's hull
    for (const [x, z] of [[-50, -40], [-20, -40], [10, -40], [40, -45]]) { B.box(x - 0.1, 0, z, x + 0.1, 9, z + 0.2, K.darkMetal, { surf: 'metal' }); B.lamp([x, 9, z + 0.6], [x, 0, z + 5], 0xffa850, 70); }
    vehicle(B, 'van', -24, 20, 0.1, 0x6e2a1a); vehicle(B, 'sedan', -10, 24, Math.PI / 2 + 0.2, 0x223344, { wrecked: true }); vehicle(B, 'plumber', 2, 12, -0.3);
    B.prop('ocean_buoy', 8, 0, 30, 0, 1, { surf: 'plastic' });
    for (const [x, z] of [[-30, 14], [-5, 32], [36, 26]]) pallets(B, x, z, 4, false);
    B.prop('concrete_road_barrier', -36, 0, 22, 0, 1, { surf: 'concrete' }); B.prop('concrete_road_barrier', 14, 0, 18, Math.PI / 2, 1, { surf: 'concrete' });
    // perimeter fence north and west
    fence(B, -70, -48, 70, -48, 3); fence(B, -68, -48, -68, 40, 3);
    for (let i = 0; i < 80; i++) B.stain(R.range(-68, 68), 0.003, R.range(-46, 38), R.range(1.5, 5), R() * 6, R.pick([0, 1, 3]), R.range(0.25, 0.6));
    for (let i = 0; i < 30; i++) B.stain(R.range(-39, 9), 0.023, R.range(-29, 4), R.range(1, 3), R() * 6, 0, R.range(0.3, 0.6));
    // ---------------- tactical layout: a container lane on the west half (north), hold points on the quay
    container(B, -48, 0, -40, true, true); container(B, -30, 0, -44, true, true); container(B, -36, 2.59, -44, true, false); container(B, -60, 0, -30, false, true);
    hesco(B, -22, 22, 3, true); hesco(B, 20, 24, 3, true); sandbags(B, -40, 26, -34, 26); sandbags(B, 34, 18, 40, 18); sandbags(B, -2, 34, 4, 34);
    pallets(B, -12, 16, 2); pallets(B, 12, 32, 2);
    W.add(-71, -1, -51, -70, 30, 46, 'concrete', { shoot: false, see: false }); W.add(70, -1, -51, 71, 30, 46, 'concrete', { shoot: false, see: false });
    W.add(-71, -1, -51, 71, 30, -50, 'concrete', { shoot: false, see: false });
    return {
      playerSpawns: [[-60, 0, 30, -Math.PI / 2 - 0.4], [-58, 0, 34, -Math.PI / 2]],
      spawns: { A: [[-64, 0, -42, -E], [-64, 0, -20, -E], [-62, 0, 2, -E], [-62, 0, 22, -E], [-60, 0, 34, -E]],
        B: [[66, 0, -35, E], [66, 0, -17, E], [64, 0, 2, E], [64, 0, 24, E], [62, 0, 34, E]],
        ffa: [[0, 0, -40, 0], [0, 0, 26, Math.PI], [-20, 0, -15, -E], [40, 0, -5, E]] },
      roam: [[-50, 0, -36], [-36, 0, -38], [-20, 0, -40], [0, 0, -38], [20, 0, -38], [40, 0, -36], [-24, 0, -14], [-10, 0, -20], [0, 0, -8], [-28, 0, 2], [25, 0, -15], [40, 0, -22], [48, 0, -6],
        [-40, 0, 20], [-20, 0, 30], [0, 0, 28], [20, 0, 30], [40, 0, 26], [-50, 0, 6], [54, 0, 6]],
      squads: [
        { pos: [-20, 0, -15], count: 3, patrol: [[-24, -28], [-24, -2], [-6, -14]], weapon: 'mp5' },
        { pos: [5, my + 0.25, -26], count: 1, patrol: [], weapon: 'm4' },
        { pos: [25, 0, -15], count: 3, patrol: [[25, -15], [40, -28], [40, 0]], weapon: 'ak' },
        { pos: [55, 0, -15], count: 2, patrol: [[55, -15], [55, -42], [66, -2]], weapon: 'm4' },
        { pos: [0, 0, 28], count: 2, patrol: [[-20, 30], [20, 30]], weapon: 'm4' },
        { pos: [-50, 0, 0], count: 2, patrol: [[-50, -40], [-50, 10]], weapon: 'ak' },
      ],
      waveSpawns: [[65, 0, -45], [65, 0, 30], [30, 0, -45], [-65, 0, -45], [0, 0, -45], [45, 0, 35]],
    };
  },
};

// moored freighter: plated hull with a raked bow, red boot-topping at the waterline, a white
// deckhouse with lit bridge windows, a funnel, bulwark rails and a painted name.
function freighter(B, K) {
  const X0 = -60, X1 = 30, Z0 = 46, Z1 = 62, top = 6;
  B.box(X0, -2, Z0, X1, top, Z1, 'hull', { surf: 'metal' });
  B.box(X0 - 0.02, -2.05, Z0 - 0.04, X1 + 0.02, 0.35, Z1 + 0.04, 'hullRed', { collide: false });          // boot-topping
  B.box(X0 - 0.02, top - 0.45, Z0 - 0.04, X1 + 0.02, top - 0.3, Z1 + 0.04, K.paintWhite || 'deckhouse', { collide: false }); // sheer stripe
  // raked bow (east) and transom stern (west)
  const bowShape = new THREE.Shape([new THREE.Vector2(0, -8), new THREE.Vector2(14, 0), new THREE.Vector2(0, 8)]);
  const bow = new THREE.ExtrudeGeometry(bowShape, { depth: 8.4, bevelEnabled: false });
  bow.rotateX(-Math.PI / 2).translate(X1, -2, (Z0 + Z1) / 2);
  B.geo(bow, 'hull');
  B.box(X0 - 3, 0.5, Z0 + 1, X0, top, Z1 - 1, 'hull', { collide: false });
  // bulwark rail along the deck edge
  for (let x = X0; x <= X1; x += 2.5) B.box(x - 0.04, top, Z0 + 0.05, x + 0.04, top + 1.1, Z0 + 0.13, K.darkMetal, { collide: false });
  B.box(X0, top + 1.05, Z0 + 0.04, X1, top + 1.12, Z0 + 0.14, K.darkMetal, { collide: false });
  // deckhouse aft with rows of lit windows, bridge wings, funnel and mast
  B.box(10, top, 48, 26, 18, 60, 'deckhouse', { surf: 'metal' });
  B.box(8, 15.6, 47, 28, 16, 61, 'deckhouse', { collide: false });                                         // bridge wing deck
  for (let lv = 0; lv < 3; lv++) for (let x = 11.2; x < 25; x += 1.8) {
    const y = top + 1.6 + lv * 3; const lit = ((x * 7 + lv * 3) % 5) < 3;
    if (lit) B.glow(x, y, 47.96, x + 0.9, y + 0.7, 47.98, 0xffd7a0, 1.6); else B.box(x, y, 47.95, x + 0.9, y + 0.7, 47.99, K.glassDark, { collide: false });
  }
  for (let x = 11; x < 25.5; x += 1.6) B.glow(x, 16.6, 47.96, x + 1.3, 17.6, 47.98, 0xc8e0ff, 0.9);      // bridge glazing
  B.box(15, 18, 52, 21, 25, 57, 'hullRed', { surf: 'metal' }); B.box(14.9, 24.2, 51.9, 21.1, 25, 57.1, K.darkMetal, { collide: false });
  B.box(-40.15, top, 53.85, -39.85, 22, 54.15, K.darkMetal, { collide: false }); B.box(-43, 18, 53.9, -37, 18.2, 54.1, K.darkMetal, { collide: false });
  B.point([-40, 22.3, 54], 0xff3020, 2, 5); B.glow(-40.12, 22.1, 53.88, -39.88, 22.35, 54.12, 0xff2010, 4);
  // painted name on the bow, hull draft marks
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 1024, 128); g.font = 'bold 96px Arial, sans-serif'; g.fillStyle = '#e8e4da'; g.textBaseline = 'middle'; g.fillText('RUSTWATER  MONROVIA', 10, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const name = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false }));
  name.position.set(16, 3.6, Z0 - 0.06); name.rotation.y = Math.PI; B.group.add(name);
  for (let y = 0.5; y < 4; y += 1) B.box(28, y - 2, Z0 - 0.05, 28.6, y - 1.9, Z0 - 0.03, 'deckhouse', { collide: false });
}

// stacked cartons (brown corrugated board, seams, tape, printed marks); wrapped = shrink-wrapped load
function cartonMaterial(wrapped) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const R = (() => { let a = wrapped ? 7 : 3; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const x = col * 171, y = row * 128, sh = 0.9 + R() * 0.18;
    g.fillStyle = `rgb(${176 * sh | 0},${138 * sh | 0},${92 * sh | 0})`; g.fillRect(x, y, 171, 128);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,60,30,${R() * 0.08})`; g.fillRect(x + R() * 171, y + R() * 128, 1 + R() * 18, 1); }
    g.fillStyle = 'rgba(200,170,120,.85)'; g.fillRect(x + 72, y, 26, 128);                       // tape
    if (R() < 0.6) { g.fillStyle = 'rgba(40,30,25,.55)'; g.font = 'bold 15px Arial'; g.fillText(R() < 0.5 ? 'FRAGILE' : 'THIS SIDE UP', x + 10, y + 100); g.fillRect(x + 10, y + 108, 50, 3); }
    g.strokeStyle = 'rgba(60,40,20,.75)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, 168, 125);
  }
  if (wrapped) {
    g.fillStyle = 'rgba(225,228,232,.32)'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) { const y = R() * 512; const gr = g.createLinearGradient(0, y, 0, y + 6); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, y, 512, 6); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, roughness: wrapped ? 0.35 : 0.9 });
}
