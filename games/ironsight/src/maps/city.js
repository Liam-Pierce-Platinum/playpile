// MAP 1 - WET STREETS: a rainy night city intersection. Long main street (sniper line, 120 m),
// cross street, a corner deli you can clear room by room, dead-end alleys, a parking lot behind a
// chain-link fence and a construction site. Rain City wet asphalt with puddle reflections.
import * as THREE from 'three';
import { sandbags, hesco, stairs, building, fireEscape, car, vehicle, dumpster, newsBox, trashCan, trashBags, fence, M, ensure, pallets } from './kit.js';
const E = Math.PI / 2;   // spawn yaw: facing west = E, east = -E
import { makeWet } from '../render/wet.js';

// glowing neon sign: tube text drawn on a canvas, emissive, facing -x (axis 'x') or -z (axis 'z')
function neonSign(B, text, x, y, z, w, h, axis, color) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext('2d'); const col = '#' + new THREE.Color(color).getHexString();
  g.fillStyle = '#050505'; g.fillRect(0, 0, c.width, c.height);
  g.font = `bold ${Math.round(c.height * 0.62)}px Arial Narrow, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 30; g.lineWidth = 6; g.strokeStyle = col; g.strokeText(text, c.width / 2, c.height / 2);
  g.shadowBlur = 8; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.2, 2.2, 2.2) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z); if (axis === 'x') mesh.rotation.y = -Math.PI / 2; else if (axis === '+z') mesh.rotation.y = 0; else mesh.rotation.y = Math.PI;
  B.group.add(mesh); B.lightSources.push({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), strength: 0.8 });
}

export default {
  id: 'city', name: 'Wet Streets', desc: 'Rainy night intersection, three lanes: the parking lot and a cut-through deli north, the main street, the construction site (climb the slab) south.',
  bounds: { minX: -62, maxX: 62, minZ: -44, maxZ: 44 },
  env: {
    hdri: 'street_night', envI: 0.35, bg: 'night', exposure: 1.05,
    fog: { color: 0x07090c, density: 0.016 },
    hemi: { sky: 0x2a3446, ground: 0x120d0a, i: 0.32 },
    sun: { dir: [0.3, 1, 0.2], color: 0x6f86a8, intensity: 0.12, shadowSize: 50 },
    weather: 'rain', indoor: [[12, -22, 30, -10.2]], audio: 'urban', viewRange: 75, lightK: 0.8, wet: true,
    pools: { lamps: 8, shadows: 4, points: 6 },
  },
  async build(B) {
    const W = B.world, R = B.R, K = M(B);
    const asphalt = B.mat('asphalt', 'asphalt_02', { tile: 5 });
    const walk = B.mat('walk', 'concrete_pavement', { tile: 2.5 });
    makeWet(asphalt, { puddle: 0.585, gutter: true }); makeWet(walk, { puddle: 0.64 });
    B.mat('brick', 'red_brick', { tile: 2.5 }); B.mat('brick2', 'brick_wall_10', { tile: 2.5 }); B.mat('brick3', 'red_bricks_04', { tile: 2.5 });
    B.mat('conc', 'concrete_wall_006', { tile: 3 }); B.mat('plaster', 'plastered_wall_04', { tile: 3 }); B.mat('tiles', 'rectangular_facade_tiles', { tile: 2.5 });
    B.mat('floor', 'concrete_floor_worn_001', { tile: 3 });
    ensure(B, 'shopGlass', () => new THREE.MeshPhysicalMaterial({ color: 0x9ab0b8, roughness: 0.04, transparent: true, opacity: 0.18, depthWrite: false, envMapIntensity: 1.5 }));
    for (const k of ['brick', 'brick2', 'brick3', 'conc', 'plaster', 'tiles']) makeWet(B.mats.get(k).material, { puddle: 2, wet: 0.6, grime: true });
    // ground: asphalt everywhere, raised sidewalks along the streets and around the blocks
    B.box(-130, -1, -60, 130, 0, 60, 'asphalt', { surf: 'asphalt' });
    const curb = 0.15;
    const walks = [[-130, -10, 130, -6], [-130, 6, 130, 10], [-10, -60, -6, -10], [6, -60, 10, -10], [-10, 10, -6, 60], [6, 10, 10, 60]];
    for (const [x0, z0, x1, z1] of walks) B.box(x0, 0, z0, x1, curb, z1, 'walk', { surf: 'concrete' });
    // block interiors are raised to sidewalk level too (lots, alleys, construction site)
    B.box(10, 0, -44, 62, curb, -10, 'walk', { surf: 'concrete' }); B.box(10, 0, 10, 62, curb, 44, 'walk', { surf: 'concrete' });
    B.box(-62, 0, 10, -10, curb, 44, 'walk', { surf: 'concrete' });
    // ---------------- NE: deli (enterable) + alley + tall block
    const sh = { x0: 12, x1: 30, z0: -24, z1: -10.2 };
    B.box(10, curb, -44, 32, 30, sh.z0 - 0.3, 'brick', { surf: 'brick' });            // back part of the building
    // west + east walls with side doors (z -13.2..-11.8): the north lane cuts through the shop
    for (const [x0, x1] of [[10, 12], [30, 32]]) { B.box(x0, curb, sh.z0 - 0.3, x1, 30, -13.2, 'brick', { surf: 'brick' }); B.box(x0, curb, -11.8, x1, 30, -10, 'brick', { surf: 'brick' }); B.box(x0, 2.4, -13.2, x1, 30, -11.8, 'brick', { surf: 'brick' }); }
    B.box(12, 4.6, sh.z0 - 0.3, 30, 30, -10, 'brick', { surf: 'brick' });             // upper floors
    building(B, 10, -44, 32, -10, 30, 'brick', { faces: { s: 0, e: 1, w: 1, n: 0 }, groundH: 6, lit: 0.25, R, ledgeKey: 'conc', solid: false });
    // upper floor windows on the street face (above the shop)
    for (let f = 0; f < 7; f++) for (let i = 0; i < 6; i++) { const y = 6.2 + f * 3.4, x = 13.5 + i * 3; const lit = R() < 0.3; B.box(x - 0.65, y, -10.03, x + 0.65, y + 1.8, -10, lit ? K.glassLit : K.glassDark, { collide: false }); B.box(x - 0.77, y - 0.12, -10.14, x + 0.77, y - 0.02, -10, 'conc', { collide: false }); }
    // shop front: glass (penetrable), door opening, sign
    B.box(12, curb, -10.25, 14.5, 4.6, -10.1, 'conc', { surf: 'concrete' });
    B.box(14.5, curb, -10.2, 19.5, 0.9, -10.1, 'conc', { surf: 'concrete' });
    B.box(14.5, 0.9, -10.18, 19.5, 3.4, -10.12, 'shopGlass', { surf: 'glass', see: false });
    B.box(21, curb, -10.2, 28, 0.9, -10.1, 'conc', { surf: 'concrete' });
    B.box(21, 0.9, -10.18, 28, 3.4, -10.12, 'shopGlass', { surf: 'glass', see: false });
    B.box(14.5, 3.4, -10.25, 30, 4.6, -10.1, 'conc', { surf: 'concrete' });
    B.box(28, curb, -10.25, 30, 3.4, -10.1, 'conc', { surf: 'concrete' });
    // (door gap between x 19.5 and 21)
    B.box(14, 3.6, -10.1, 28.5, 4.4, -9.8, K.paintRed, { collide: false });
    neonSign(B, 'DELI · GROCERY · 24H', 21.25, 4.0, -9.78, 12, 0.6, '+z', 0xffe6b0);
    B.point([20, 3.2, -11.5], 0xffd9a0, 18, 14, { priority: 2 });
    // interior: floor, counter, shelves, back room
    B.box(sh.x0, curb, sh.z0, sh.x1, curb + 0.02, sh.z1, 'floor', { surf: 'concrete' });
    B.box(13, curb, -15, 18, 1.1, -14, K.darkMetal, { surf: 'sheet' });                 // counter
    for (let i = 0; i < 3; i++) B.box(20 + i * 3, curb, -19, 21, 2.0, -14, K.steel, { surf: 'sheet' });   // aisles
    B.box(sh.x0, curb, -20.5, 19, 4.6, -20.3, 'plaster', { surf: 'drywall' });           // back room wall
    B.box(21, curb, -20.5, sh.x1, 4.6, -20.3, 'plaster', { surf: 'drywall' });
    B.point([16, 3.8, -16], 0xfff0d8, 10, 10); B.point([24, 3.8, -22], 0xfff0d8, 6, 8);
    B.box(12, 4.4, -24, 30, 4.6, -10.3, 'plaster', { collide: false, top: false, bottom: true });
    pallets(B, 25, -22.5, 2); B.prop('cardboard_box_01', 13.5, curb, -23, 0.3, 1.8);
    // alley between the deli block and the east block
    building(B, 36, -44, 62, -10, 22, 'brick2', { faces: { s: 1, e: 0, w: 1, n: 0 }, lit: 0.3, R, ledgeKey: 'conc' });
    fireEscape(B, 'x', 36, -22, 4, 5, 3.4, -1);
    dumpster(B, 34, -16, Math.PI / 2); dumpster(B, 34, -30, Math.PI / 2, K.paintBlue); trashBags(B, 33.3, -20, 4); trashBags(B, 34.5, -36, 3);
    B.box(32, curb, -44, 36, 6, -42, 'brick2', { surf: 'brick' });   // alley dead end
    // ---------------- NW: parking lot behind a fence + tall block
    building(B, -62, -44, -40, -10, 26, 'tiles', { faces: { s: 1, e: 1, w: 0, n: 0 }, lit: 0.35, R, ledgeKey: 'conc', surf: 'concrete', kind: 2 });
    B.box(-40, 0, -44, -10, 0.02, -10, 'asphalt', { surf: 'asphalt', collide: false });
    fence(B, -40, -10.6, -27, -10.6); fence(B, -21, -10.6, -10.5, -10.6); fence(B, -10.5, -44, -10.5, -31); fence(B, -10.5, -25, -10.5, -10.6);   // gap: the lot opens onto the north street
    B.box(-40, 0, -44, -10, 8, -43, 'brick3', { surf: 'brick' });
    const lotCars = [[-36, -16, 0, 0x5a1a14], [-36, -24, 0, 0x2b3b48], [-30, -32, Math.PI / 2, 0x777a7d], [-20, -34, Math.PI / 2, 0x13161a], [-15, -20, 0, 0x30301e], [-25, -16, Math.PI / 2, 0xa6a8aa]];
    lotCars.forEach(([x, z, r, c], i) => vehicle(B, i % 3 === 2 ? 'van' : 'sedan', x, z, r, c));
    B.prop('covered_car', -30, 0, -22, 0, 1, { surf: 'sheet' });
    B.box(-14, 0, -42, -11, 2.6, -38, 'conc', { surf: 'concrete' });  // attendant kiosk
    B.box(-14.02, 1.1, -41.5, -13.98, 2.1, -38.5, K.glassLit, { surf: 'glass', collide: false });
    // ---------------- SE: fire escape block, alley, loading dock
    building(B, 10, 10, 28, 44, 20, 'brick3', { faces: { n: 1, e: 1, w: 1, s: 0 }, lit: 0.3, R, ledgeKey: 'conc' });
    fireEscape(B, 'z', 10, 19, 4, 4, 3.4, -1);
    building(B, 32, 18, 62, 44, 16, 'conc', { faces: { n: 1, w: 1, e: 0, s: 0 }, lit: 0.2, R, surf: 'concrete' });
    B.box(32, curb, 10, 62, 1.25, 14, 'conc', { surf: 'concrete' });   // loading dock platform
    B.box(32, curb, 14, 62, 5.5, 18, 'conc', { surf: 'concrete' });
    for (let i = 0; i < 3; i++) B.box(36 + i * 8, 1.25, 13.9, 41 + i * 8, 4.8, 14.0, K.darkMetal, { collide: false });   // roller doors
    dumpster(B, 30, 24, Math.PI / 2); trashBags(B, 30.5, 30, 3); trashCan(B, 29.2, 16);
    B.prop('exterior_aircon_unit', 29, curb, 36, Math.PI / 2, 1.2, { surf: 'sheet' });
    // ---------------- SW: tall block + construction site
    building(B, -62, 10, -32, 44, 24, 'plaster', { faces: { n: 1, e: 1, w: 0, s: 0 }, lit: 0.3, R, ledgeKey: 'conc', surf: 'concrete' });
    fence(B, -32, 10.6, -24, 10.6); fence(B, -18, 10.6, -10.6, 10.6);
    // half built concrete frame: columns, a low slab, rebar walls
    for (const [x, z] of [[-28, 16], [-20, 16], [-12.5, 16], [-28, 26], [-20, 26], [-12.5, 26], [-28, 36], [-20, 36]]) B.box(x - 0.35, curb, z - 0.35, x + 0.35, 7, z + 0.35, 'conc', { surf: 'concrete' });
    B.box(-29, 3.4, 15, -11.5, 3.7, 27, 'conc', { surf: 'concrete' });                // first floor slab (cover from above)
    B.box(-26, curb, 20, -22, 1.3, 20.4, 'conc', { surf: 'concrete' }); B.box(-17, curb, 30, -12, 1.0, 30.4, 'conc', { surf: 'concrete' });
    pallets(B, -16, 22, 3); pallets(B, -24, 32, 2); pallets(B, -14, 38, 4, false);
    B.prop('concrete_road_barrier', -22, curb, 12.5, 0, 1, { surf: 'concrete' }); B.prop('concrete_road_barrier', -14, curb, 33, Math.PI / 2, 1, { surf: 'concrete' });
    dumpster(B, -27, 40, 0, K.paintYellow);
    B.box(-32, curb, 42, -10, 6, 44, 'brick', { surf: 'brick' });
    // ---------------- street: parked cars, abandoned cars, checkpoint, furniture
    const colors = [0x1a2a40, 0x5a1a14, 0x2b2b2e, 0xb0b2b4, 0x1d3b26, 0x8a7a54, 0x0d0d0f, 0x3d4a5a];
    // parked between the street lamps (a car right under a 60 cd lamp blows out to white in the wet-night grade)
    const parkN = [[-48, -4.8], [-32, -4.8], [-16, -4.8], [16, -4.8], [32, -4.8], [48, -4.8]], parkS = [[-56, 4.8], [-40, 4.8], [-24, 4.8], [24, 4.8], [40, 4.8], [56, 4.8]];
    [...parkN, ...parkS].forEach(([x, z], i) => { const k = R(); vehicle(B, k < 0.18 ? 'taxi' : k < 0.32 ? 'van' : k < 0.38 ? 'plumber' : 'sedan', x + R.range(-1, 1), z, z < 0 ? Math.PI / 2 : -Math.PI / 2, R.pick(colors)); });
    vehicle(B, 'sedan', -6, -1.5, 0.15, 0x101214, { wrecked: true }); vehicle(B, 'taxi', 26, 1.6, -Math.PI / 2 + 0.25);   // a taxi left in the road
    // police checkpoint in the intersection
    for (const [x, z, r] of [[-3, 3.5, 0], [3, -3.5, 0], [8, 0, Math.PI / 2], [-8.5, 1, Math.PI / 2]]) B.prop('concrete_road_barrier', x, 0, z, r, 1, { surf: 'concrete' });
    // newspaper boxes, hydrants, trash cans, lamps along both sidewalks
    const npc = [K.paintBlue, K.paintRed, K.paintYellow, K.paintGreen];
    for (const [x, z, r] of [[-11, -7, 0], [-12, -7, 0], [11.5, 7, Math.PI], [12.5, 7, Math.PI], [-11, 7.2, Math.PI], [40, -7.2, 0], [-30, 7.2, Math.PI]]) newsBox(B, x, z, r, R.pick(npc));
    for (const [x, z] of [[-14, 9.3], [14, -9.3], [-45, -9.3], [47, 9.3]]) B.prop('fire_hydrant', x, curb, z, 0, 1, { surf: 'metal' });
    for (const [x, z] of [[-8, -12], [8, 12], [-26, 9.4], [24, -9.4], [50, -9.4], [-50, 9.4]]) trashCan(B, x, z);
    for (const [x, z] of [[-20, 9.2], [33, 9.3], [-8.6, 20], [8.8, -30]]) trashBags(B, x, z, 3);
    for (let x = -56; x <= 56; x += 16) for (const side of [-1, 1]) {
      const z = side * 9.45, xx = x + (side > 0 ? 8 : 0);
      if (Math.abs(xx) < 12) continue;
      B.prop('street_lamp_01', xx, curb, z, side > 0 ? Math.PI : 0, 1, { collider: [0.3, 5, 0.3], surf: 'metal', contact: false });
      B.lamp([xx, 6.2, z - side * 1.6], [xx, 0, z - side * 3.4], 0xffc890, 60, { priority: 1 });
    }
    // traffic signals
    for (const [x, z] of [[-9.5, -9.5], [9.5, 9.5]]) { B.box(x - 0.08, curb, z - 0.08, x + 0.08, 5.5, z + 0.08, K.darkMetal, { surf: 'metal' }); B.box(x - 0.2, 4.6, z - 0.2, x + 0.2, 5.6, z + 0.2, K.darkMetal, { collide: false }); B.glow(x - 0.12, 5.25, z + 0.2, x + 0.12, 5.45, z + 0.22, 0xff2010, 3); B.point([x, 5.3, z + 0.8], 0xff3020, 3, 6); }
    // neon on the SE block corner
    neonSign(B, 'HOTEL', 9.92, 6.2, 14, 4, 1.1, 'x', 0x5ab0ff); B.point([11, 6, 14], 0x4aa0ff, 10, 10);
    neonSign(B, 'BAR', 9.92, 5.2, -15.5, 3, 1.1, 'x', 0xff3a8a); B.point([9, 5.2, -15.5], 0xff4a90, 8, 10);
    // grime: oil stains in lanes, wet patches, gum and soot on sidewalks, scattered paper
    for (let i = 0; i < 70; i++) B.stain(R.range(-60, 60), 0.002, R.range(-5.5, 5.5), R.range(1.5, 4), R() * 6, R() < 0.7 ? 0 : 1, R.range(0.35, 0.7));
    for (let i = 0; i < 90; i++) { const s = R() < 0.5 ? -1 : 1; B.stain(R.range(-60, 60), curb + 0.002, s * R.range(6.3, 9.8), R.range(0.6, 2.2), R() * 6, R.pick([0, 2, 3]), R.range(0.3, 0.6)); }
    for (let i = 0; i < 25; i++) B.stain(R.range(-9.8, -6.2) * (R() < 0.5 ? 1 : -1), curb + 0.002, R.range(-40, 40), R.range(0.6, 2), R() * 6, 2, 0.5);
    for (let i = 0; i < 30; i++) B.stain(R.range(-38, -11), 0.022, R.range(-42, -12), R.range(1, 3), R() * 6, 0, 0.55);
    // manhole covers
    ensure(B, 'manhole', () => new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.45, metalness: 0.8 }));
    for (const [x, z] of [[-30, 2], [18, -2.5], [2, 22], [44, 1]]) B.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24).translate(x, 0.01, z), 'manhole');
    // the street keeps going past the barricades (backdrop) - visible, not reachable
    for (const sx of [-1, 1]) {
      building(B, sx > 0 ? 66 : -130, -40, sx > 0 ? 130 : -66, -10, 28, 'brick2', { faces: { s: 1, n: 0, e: 0, w: 0 }, lit: 0.35, R });
      building(B, sx > 0 ? 66 : -130, 10, sx > 0 ? 130 : -66, 40, 22, 'brick', { faces: { n: 1, s: 0, e: 0, w: 0 }, lit: 0.35, R });
      const bx = sx * 61; for (let z = -5; z <= 5; z += 2.6) B.prop('concrete_road_barrier', bx, 0, z, Math.PI / 2, 1, { surf: 'concrete' });
      vehicle(B, 'sedan', sx * 64.5, 2.5, 0.1, 0x0a0a0c);
      for (let x = 68; x < 128; x += 16) B.lamp([sx * x, 6.2, -7.8], [sx * x, 0, -6], 0xffc890, 60);
    }
    // ---------------- tactical layout: break the 120 m street sightline, hold points at each lane mouth,
    // a stair up the construction slab (overlooks the intersection and the south street)
    hesco(B, -30, -1.2, 2, true); vehicle(B, 'van', 30, -1.4, 0.35, 0x3a3f44, { wrecked: true }); hesco(B, 44, 1.4, 2, true);
    sandbags(B, -46, -3.2, -46, 3.2); sandbags(B, 47, -3.2, 47, 3.2);
    sandbags(B, -8, -16, -3, -16); sandbags(B, 3, 17, 8, 17);           // north / south street mouths
    pallets(B, -2, -26, 3); pallets(B, 2, 30, 3); B.prop('concrete_road_barrier', 0, 0, -34, 0, 1, { surf: 'concrete' }); B.prop('concrete_road_barrier', -1, 0, 38, 0, 1, { surf: 'concrete' });
    stairs(B, -20, 33.2, '-z', 1.4, curb, 3.7, 'conc');
    B.box(-27, 3.7, 15.0, -22, 4.55, 15.4, 'conc', { surf: 'concrete' }); B.box(-18, 3.7, 15.0, -12, 4.55, 15.4, 'conc', { surf: 'concrete' });
    pallets(B, 26, -38, 2); pallets(B, -30, -40, 2);
    // invisible boundary
    W.add(-63, -1, -45, -62, 30, 45, 'concrete', { shoot: false, see: false }); W.add(62, -1, -45, 63, 30, 45, 'concrete', { shoot: false, see: false });
    W.add(-63, -1, -45, 63, 30, -44, 'concrete', { shoot: false, see: false }); W.add(-63, -1, 44, 63, 30, 45, 'concrete', { shoot: false, see: false });
    // reflections: road and sidewalk planes
    B.reflect = { road: [[-130, 130, -6, 6], [-6, 6, -60, -6], [-6, 6, 6, 60]], walk: walks.map(([x0, z0, x1, z1]) => [x0, x1, z0, z1]) };
    return {
      playerSpawns: [[-55, 0.2, 0, -Math.PI / 2], [-52, 0.2, 7.5, -Math.PI / 2]],
      // TDM: Ghost west, Viper east (FFA uses both); roam = the three lanes
      spawns: { A: [[-56, 0.2, -3, -E], [-56, 0.2, 3, -E], [-52, 0.2, -8, -E], [-52, 0.2, 8, -E], [-36, 0.2, -40, -E], [-28, 0.2, 40, -E]],
        B: [[56, 0.2, -3, E], [56, 0.2, 3, E], [52, 0.2, -8, E], [52, 0.2, 8, E], [34, 0.2, -40, E], [30, 0.2, 40, E]],
        ffa: [[0, 0.2, -40, 0], [0, 0.2, 40, Math.PI], [-20, 0.2, -30, 0], [45, 1.4, 12, E]] },
      roam: [[-40, 0, 0], [-20, 0, -4], [0, 0, 0], [20, 0, 4], [40, 0, 0], [-30, 0, -28], [-15, 0, -36], [-8, 0, -28], [0, 0, -20], [20, 0.2, -12], [26, 0.2, -16], [34, 0.2, -18], [34, 0.2, -32],
        [-22, 0.2, 22], [-14, 0.2, 34], [-26, 0.2, 38], [0, 0.2, 24], [8, 0.2, 36], [30, 0.2, 24], [40, 0.2, 12]],
      squads: [
        { pos: [0, 0, 0], count: 3, patrol: [[0, 0], [-4, 6], [4, -6]], weapon: 'm4' },
        { pos: [22, 0.2, -16], count: 2, patrol: [[22, -16], [25, -22], [17, -12]], weapon: 'mp5' },
        { pos: [34, 0.2, -24], count: 2, patrol: [[34, -24], [34, -14], [40, -8]] },
        { pos: [-22, 0.2, 24], count: 3, patrol: [[-22, 24], [-15, 34], [-25, 14]], weapon: 'ak' },
        { pos: [-26, 0, -26], count: 2, patrol: [[-26, -26], [-18, -18], [-34, -30]] },
        { pos: [50, 0.2, 2], count: 2, patrol: [[50, 2], [44, 8], [56, -6]], weapon: 'm4' },
      ],
      waveSpawns: [[55, 0, 0], [34, 0.2, -40], [-25, 0, -40], [-20, 0.2, 40], [30, 0.2, 40], [0, 0.2, -40], [0, 0.2, 40]],
    };
  },
};
