// The neighbouring islands (each with a pier, a trader's shop and the
// trader standing outside it) and the keeper's own wooden sailboat.
import * as THREE from 'three';
import { mat, mesh, makeKeeper, makeTree, makeRock } from './props.js';
import { ISLANDS, DOCKS, VILLAGE_R, heightAt, roadAt, buildTerrain, buildFoliage } from './terrain.js';
import { segDist } from './util.js';
import { hullGeo, glowTex } from './boats.js';

export const ISLE_TRADERS = {
  pebble: {
    who: 'Old Mae', kind: 'Fish market', likes: 'fish', bonus: 2,
    wall: '#7fbbe0', roof: '#34507a', awning: ['#ffffff', '#34507a'],
    look: { coat: '#34507a', hat: '#f4efe6', brim: '#d9d2c4', pants: '#5a5f6b' },
    hello: ['Fish! Lovely fish! I pay double what those boats do.', 'Came all this way? Sit, sit. What have you caught?', 'The pie\'s fresh today, dear.'],
    goods: [
      { id: 'pie', name: 'Fish Pie', price: 12, desc: 'Eaten on the spot. Fills your belly right up (+60).' },
      { id: 'bait', name: 'Bait ×5', price: 8, desc: 'Fish bite twice as fast for your next 5 casts.' },
      { id: 'furn.wheel', name: 'Ship\'s Wheel', price: 40, desc: 'Wall decoration for your home.' },
      { id: 'furn.anchor', name: 'Old Anchor', price: 30, desc: 'A rusty anchor to stand in a corner.' },
    ],
  },
  drift: {
    who: 'Fennick', kind: 'Boatwright & carpenter', likes: 'wood', bonus: 2,
    wall: '#c4925f', roof: '#5b8c5a', awning: ['#f2c14e', '#5b8c5a'],
    look: { coat: '#8a5a3b', hat: '#5b8c5a', brim: '#4a7a4a', pants: '#3e3a3a' },
    hello: ['Wood! Now that\'s a proper currency.', 'How\'s she sailing? I could make her quicker.', 'Mind the sawdust.'],
    goods: [
      { id: 'bigsail', name: 'Big Sail', price: 80, once: true, desc: 'Your sailboat goes 40% faster.' },
      { id: 'furn.rocker', name: 'Rocking Chair', price: 35, desc: 'Creaks just right.' },
      { id: 'furn.gclock', name: 'Grandfather Clock', price: 60, desc: 'Tall, handsome, and tells the island time.' },
    ],
  },
  coral: {
    who: 'Miss Opal', kind: 'Curio collector', likes: 'shells', bonus: 2.5,
    wall: '#f2a0b3', roof: '#ff8a6b', awning: ['#ffffff', '#ff8a6b'],
    look: { coat: '#b9a6e0', hat: '#ff8a6b', brim: '#e0705a', pants: '#34507a' },
    hello: ['Shells! Oh, I simply must have them.', 'Clams too, darling. Pearls hide in clams.', 'Everything here is one of a kind. Well, nearly.'],
    goods: [
      { id: 'paint.gold', name: 'Gold paint', price: 20, desc: 'Only Opal has it. For walls, roof, door or trim.' },
      { id: 'paint.seafoam', name: 'Seafoam paint', price: 20, desc: 'Only Opal has it.' },
      { id: 'paint.plum', name: 'Plum paint', price: 20, desc: 'Only Opal has it.' },
      { id: 'furn.telescope', name: 'Brass Telescope', price: 50, desc: 'For spotting boats from your window.' },
      { id: 'furn.mirror', name: 'Shell Mirror', price: 30, desc: 'Wall mirror framed in shells.' },
    ],
  },
};

function gable(w, d, h, o, wallMat, roofMat) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - o, 0); s.lineTo(w / 2 + o, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d + 2 * o, bevelEnabled: false });
  g.translate(0, 0, -(d + 2 * o) / 2);
  return mesh(g, [wallMat, roofMat]);
}

export function buildPier(scene, D) {
  const g = new THREE.Group();
  const ang = Math.atan2(D.dx, D.dz);
  for (let a = 0; a < D.len; a += 0.62) {
    const x = D.sx + D.dx * (a + 0.3), z = D.sz + D.dz * (a + 0.3);
    const p = mesh(new THREE.BoxGeometry(D.w, 0.14, 0.55), mat(['#b98458', '#a8764c', '#c4925f'][Math.floor(Math.random() * 3)]));
    p.position.set(x, D.y - 0.07, z); p.rotation.y = ang;
    g.add(p);
  }
  for (let a = 1.5; a < D.len; a += 3) {
    for (const s of [-1, 1]) {
      const x = D.sx + D.dx * a + -D.dz * s * (D.w / 2 - 0.1), z = D.sz + D.dz * a + D.dx * s * (D.w / 2 - 0.1);
      const bed = heightAt(x, z), h = D.y + 0.5 - bed;
      const pile = mesh(new THREE.CylinderGeometry(0.14, 0.16, h, 7), mat('#7a5236'));
      pile.position.set(x, bed + h / 2, z);
      g.add(pile);
    }
  }
  const lamps = [];
  for (const a of [1.5, D.len - 1]) {
    const x = D.sx + D.dx * a - D.px * (D.w / 2 - 0.12), z = D.sz + D.dz * a - D.pz * (D.w / 2 - 0.12);
    const pole = mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.8, 6), mat('#3e3a3a'));
    pole.position.set(x, D.y + 0.9, z);
    const lamp = mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), new THREE.MeshLambertMaterial({ color: '#ffe9a8', emissive: '#ffcf6a', emissiveIntensity: 0 }), false);
    lamp.position.y = 0.95; pole.add(lamp);
    g.add(pole); lamps.push(lamp);
  }
  const bol = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.5, 7), mat('#4a4a52'));
  bol.position.set(D.board.x, D.y + 0.25, D.board.z);
  g.add(bol);
  scene.add(g);
  return { lamps, bollard: { x: D.board.x, z: D.board.z, r: 0.25 } };
}

const PALETTES = {
  pebble: { walls: ['#f4efe6', '#7fbbe0', '#cfe3ee', '#f6e2b8', '#9edcc0'], roofs: ['#34507a', '#2b6a8f', '#5a5f6b', '#c4563f'], doors: ['#34507a', '#e0523f', '#f2c14e'] },
  drift: { walls: ['#c4925f', '#b07d4c', '#e2be8a', '#a8764c', '#f4efe6'], roofs: ['#5b8c5a', '#4a6a3a', '#7a4a2e', '#8a3f2e'], doors: ['#5b8c5a', '#7a4a2e', '#c4563f'] },
  coral: { walls: ['#f2a0b3', '#ffd28a', '#9edcc0', '#b9a6e0', '#fff1d0', '#ff9a7a'], roofs: ['#ff8a6b', '#2bb3a3', '#f2c14e', '#e0523f'], doors: ['#2bb3a3', '#ff8a6b', '#34507a'] },
};
const TALK = {
  pebble: ['The fish practically jump into the boats here.', 'Old Mae\'s pie is the best on the coast.', 'We ring the bell when the boats come home.', 'Mind the gulls. They steal sandwiches.', 'You sailed all this way? Brave keeper!'],
  drift: ['Fennick built half the boats on this sea.', 'The windmill grinds our flour. Spins like mad in a gale!', 'We trade timber for everything. Got any wood?', 'Climb the hill and you can see half the sea.', 'Mind the sawdust, it gets everywhere.'],
  coral: ['Miss Opal will pay a fortune for shells.', 'Swim? In this water? Every single day.', 'The fountain was carved from one huge coral rock.', 'Palms everywhere, and not one coconut. Typical.', 'Have you tried the clams? Opal buys those too.'],
};
const WEATHER_TALK = {
  rain: ['Lovely weather for ducks.', 'I\'m off home before I\'m soaked.'],
  storm: ['Get inside, a storm\'s rolling in!', 'Tie that boat up tight tonight.'],
  windy: ['Hold onto your hat!', 'The mill will be flying today.'],
};
const NAMES = ['Tilly', 'Gus', 'Marlo', 'Juniper', 'Bram', 'Odette', 'Pip', 'Nell', 'Rufus', 'Wren', 'Ottilie', 'Hamish', 'Ivy', 'Barnaby', 'Clem', 'Dot', 'Fergus', 'Hazel', 'Lars', 'Mabel', 'Ned', 'Poppy', 'Sid', 'Tamsin'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function house(P, w, d, floors, glowM) {
  const g = new THREE.Group();
  const wallM = mat(pick(P.walls)), roofM = mat(pick(P.roofs));
  const H = floors * 2.4;
  const base = mesh(new THREE.BoxGeometry(w + 0.25, 1.2, d + 0.25), mat('#9a948a')); base.position.y = -0.45; g.add(base);
  const walls = mesh(new THREE.BoxGeometry(w, H, d), wallM); walls.position.y = H / 2; g.add(walls);
  const roof = gable(w, d, 1.3 + w * 0.12, 0.35, wallM, roofM); roof.position.y = H; g.add(roof);
  const door = mesh(new THREE.BoxGeometry(0.85, 1.55, 0.1), mat(pick(P.doors))); door.position.set(w > 4 ? -w / 4 : 0, 0.78, d / 2 + 0.03); g.add(door);
  const step = mesh(new THREE.BoxGeometry(1.1, 0.15, 0.5), mat('#9a948a')); step.position.set(door.position.x, 0.07, d / 2 + 0.3); g.add(step);
  for (let f = 0; f < floors; f++) {
    const y = 1.4 + f * 2.4;
    const xs = f === 0 ? (w > 4 ? [w / 4] : []) : (w > 4 ? [-w / 4, w / 4] : [0]);
    for (const x of xs) {
      const fr = mesh(new THREE.BoxGeometry(0.85, 0.85, 0.08), mat('#f4efe6'), false); fr.position.set(x, y, d / 2 + 0.03); g.add(fr);
      const pane = mesh(new THREE.BoxGeometry(0.66, 0.66, 0.1), glowM, false); pane.position.copy(fr.position); g.add(pane);
    }
    for (const s of [-1, 1]) {
      const pane = mesh(new THREE.BoxGeometry(0.1, 0.66, 0.66), glowM, false); pane.position.set(s * (w / 2 + 0.02), y, 0); g.add(pane);
    }
  }
  if (Math.random() < 0.7) {
    const ch = mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), mat('#8f877e')); ch.position.set(w / 2 - 0.6, H + 1.0, -d / 4); g.add(ch);
  }
  if (Math.random() < 0.45) {
    const box = mesh(new THREE.BoxGeometry(1.0, 0.2, 0.3), mat('#a8764c'), false); box.position.set(door.position.x + 1.2, 0.95, d / 2 + 0.2); g.add(box);
    for (let k = 0; k < 4; k++) { const fl = mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(['#ff7aa8', '#ffd75e', '#ffffff', '#b9a6ff'][k]), false); fl.position.set(door.position.x + 0.85 + k * 0.23, 1.1, d / 2 + 0.2); g.add(fl); }
  }
  g.userData.door = new THREE.Vector3(door.position.x, 0, d / 2 + 1.1);
  return g;
}

function streetLamp(lampM) {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), mat('#3e3a3a')); pole.position.y = 1.3; g.add(pole);
  const head = mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34), lampM, false); head.position.y = 2.75; g.add(head);
  const cap = mesh(new THREE.ConeGeometry(0.3, 0.25, 4), mat('#3e3a3a'), false); cap.position.y = 3.07; cap.rotation.y = Math.PI / 4; g.add(cap);
  g.userData.head = head;
  return g;
}

function stall(colors) {
  const g = new THREE.Group();
  const table = mesh(new THREE.BoxGeometry(2.2, 0.85, 1.0), mat('#a8764c')); table.position.y = 0.43; g.add(table);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), mat('#7a5236')); p.position.set(sx * 1.05, 1.15, sz * 0.5); g.add(p); }
  for (let k = 0; k < 5; k++) { const st = mesh(new THREE.BoxGeometry(0.5, 0.06, 1.4), mat(colors[k % 2]), false); st.position.set(-1.0 + k * 0.5, 2.35, 0); g.add(st); }
  for (let k = 0; k < 4; k++) { const c = mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), mat(['#c08a52', '#ff9a7a', '#9fd0e8', '#f2c14e'][k]), false); c.position.set(-0.75 + k * 0.5, 1.0, 0); g.add(c); }
  return g;
}

function well(isFountain) {
  const g = new THREE.Group();
  const ring = mesh(new THREE.CylinderGeometry(isFountain ? 2.2 : 1.0, isFountain ? 2.3 : 1.05, 0.8, 14), mat(isFountain ? '#f2c1b0' : '#9a948a')); ring.position.y = 0.4; g.add(ring);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(isFountain ? 2.0 : 0.85, isFountain ? 2.0 : 0.85, 0.05, 14), new THREE.MeshLambertMaterial({ color: '#62d9cb', emissive: '#2bb3a3', emissiveIntensity: 0.3 })); water.position.y = 0.75; g.add(water);
  if (isFountain) {
    const pillar = mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.8, 8), mat('#ff9a7a')); pillar.position.y = 1.4; g.add(pillar);
    const bowl = mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.4, 10), mat('#f2c1b0')); bowl.position.y = 2.4; g.add(bowl);
    const top = mesh(new THREE.ConeGeometry(0.3, 0.8, 6), mat('#ffd28a')); top.position.y = 3.0; g.add(top);
    g.userData.spray = new THREE.Vector3(0, 2.6, 0);
  } else {
    for (const s of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.15, 1.8, 0.15), mat('#7a5236')); p.position.set(s * 0.9, 1.5, 0); g.add(p); }
    const roof = gable(2.2, 1.4, 0.7, 0.1, mat('#7a5236'), mat('#c4563f')); roof.position.y = 2.4; g.add(roof);
    const bucket = mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 7), mat('#8a5a3b'), false); bucket.position.set(0, 1.4, 0); g.add(bucket);
  }
  return g;
}

function bellTower() {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(3.2, 6.5, 3.2), mat('#c9c2b6')); base.position.y = 3.25; g.add(base);
  const belfry = mesh(new THREE.BoxGeometry(3.4, 0.3, 3.4), mat('#8f877e')); belfry.position.y = 6.6; g.add(belfry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), mat('#c9c2b6')); p.position.set(sx * 1.4, 7.8, sz * 1.4); g.add(p); }
  const bell = mesh(new THREE.CylinderGeometry(0.35, 0.65, 0.9, 10), mat('#d9a84a')); bell.position.y = 8.1; g.add(bell);
  const roof = mesh(new THREE.ConeGeometry(2.7, 2.4, 4), mat('#34507a')); roof.position.y = 10.1; roof.rotation.y = Math.PI / 4; g.add(roof);
  const door = mesh(new THREE.BoxGeometry(1.0, 1.8, 0.1), mat('#5b3a2a')); door.position.set(0, 0.9, 1.62); g.add(door);
  const clock = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 14), mat('#fbf6ec'), false); clock.rotation.x = Math.PI / 2; clock.position.set(0, 5.2, 1.62); g.add(clock);
  return g;
}

function windmill() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(1.4, 2.2, 7, 8), mat('#f4efe6')); body.position.y = 3.5; g.add(body);
  const cap = mesh(new THREE.ConeGeometry(1.8, 2.0, 8), mat('#7a4a2e')); cap.position.y = 8.0; g.add(cap);
  const door = mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), mat('#5b3a2a')); door.position.set(0, 0.8, 2.1); g.add(door);
  const hub = new THREE.Group(); hub.position.set(0, 6.6, 1.8); g.add(hub);
  const axle = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 6), mat('#3e3a3a')); axle.rotation.x = Math.PI / 2; hub.add(axle);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = (k / 4) * Math.PI * 2; hub.add(arm);
    const spar = mesh(new THREE.BoxGeometry(0.12, 5, 0.12), mat('#7a5236')); spar.position.y = 2.5; arm.add(spar);
    const sail = mesh(new THREE.BoxGeometry(1.0, 3.6, 0.05), mat('#efe2c4')); sail.position.set(0.55, 3.0, 0.05); arm.add(sail);
  }
  g.userData.blades = hub;
  return g;
}

function rowboat() {
  const g = new THREE.Group();
  const hull = mesh(hullGeo(2.8, 1.1, 0.45), mat(pick(['#e0523f', '#34507a', '#f2c14e', '#5b8c5a', '#f4efe6']))); hull.position.y = -0.3; g.add(hull);
  const seat = mesh(new THREE.BoxGeometry(0.9, 0.06, 0.25), mat('#a8764c'), false); seat.position.y = 0.1; g.add(seat);
  const oar = mesh(new THREE.BoxGeometry(0.05, 0.05, 2.0), mat('#c4925f'), false); oar.position.set(0.3, 0.2, 0); oar.rotation.y = 0.3; g.add(oar);
  return g;
}

export function buildIslands(scene) {
  const out = [];
  for (const I of ISLANDS) {
    const T = ISLE_TRADERS[I.id], P = PALETTES[I.id];
    const group = new THREE.Group();
    scene.add(group);
    const S = I.R * 1.75;
    group.add(buildTerrain(I.x, I.z, S, Math.round(S * 2 / 1.0)));
    const D = DOCKS.find((d) => d.id === I.id);
    const pier = buildPier(group, D);
    const glowM = new THREE.MeshLambertMaterial({ color: '#cfe8f0', emissive: '#ffc96a', emissiveIntensity: 0 });
    const lampM = new THREE.MeshLambertMaterial({ color: '#ffe9a8', emissive: '#ffcf6a', emissiveIntensity: 0 });
    const blockers = [pier.bollard];
    const solids = [];   // spots taken by buildings: x, z, r
    const ground = (x, z) => heightAt(x, z);
    const pl = I.plaza;
    const at = (a, r) => ({ x: pl.x + Math.cos(I.th + a) * r, z: pl.z + Math.sin(I.th + a) * r });
    const place = (obj, x, z, faceX, faceZ) => {
      obj.position.set(x, ground(x, z), z);
      obj.rotation.y = Math.atan2(faceX - x, faceZ - z);
      group.add(obj);
    };

    // the trader's shop on the plaza
    const shop = new THREE.Group();
    const sp = at(0.85, 12);
    const wallM = new THREE.MeshLambertMaterial({ color: T.wall, flatShading: true });
    const roofM = new THREE.MeshLambertMaterial({ color: T.roof, flatShading: true });
    const walls = mesh(new THREE.BoxGeometry(5, 3, 4), wallM); walls.position.y = 1.5; shop.add(walls);
    const sbase = mesh(new THREE.BoxGeometry(5.3, 1.2, 4.3), mat('#9a948a')); sbase.position.y = -0.45; shop.add(sbase);
    const roof = gable(5, 4, 1.8, 0.4, wallM, roofM); roof.position.y = 3; shop.add(roof);
    const door = mesh(new THREE.BoxGeometry(0.9, 1.7, 0.1), mat('#5b3a2a')); door.position.set(-1.3, 0.85, 2.02); shop.add(door);
    const win = mesh(new THREE.BoxGeometry(1.6, 0.9, 0.1), glowM, false); win.position.set(1.0, 1.6, 2.02); shop.add(win);
    for (let k = 0; k < 7; k++) {
      const st = mesh(new THREE.BoxGeometry(0.72, 0.06, 1.3), mat(T.awning[k % 2]), false);
      st.position.set(-2.2 + k * 0.72, 2.6, 2.6); st.rotation.x = 0.35;
      shop.add(st);
    }
    const counter = mesh(new THREE.BoxGeometry(2.4, 0.9, 0.7), mat('#a8764c')); counter.position.set(1.0, 0.45, 2.9); shop.add(counter);
    const wares = { pebble: ['#9fb8c8', '#ff9a7a', '#4f9a86'], drift: ['#c4925f', '#a8693c', '#e2be8a'], coral: ['#fbe3c6', '#ffb2a2', '#e8a7a0'] }[I.id];
    for (let k = 0; k < 5; k++) {
      const w = mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(wares[k % 3]), false);
      w.scale.set(I.id === 'drift' ? 1 : 1.8, 0.7, 0.8);
      w.position.set(0.2 + k * 0.38, 0.98, 2.9);
      shop.add(w);
    }
    const sign = mesh(new THREE.BoxGeometry(2.6, 0.6, 0.1), mat('#f6e2b8')); sign.position.set(0, 3.5, 2.25); shop.add(sign);
    place(shop, sp.x, sp.z, pl.x, pl.z);
    solids.push({ x: sp.x, z: sp.z, r: 4.2 });
    blockers.push({ x: sp.x, z: sp.z, r: 2.4 });
    for (const o of [-1.4, 1.4]) { const v = shop.localToWorld(new THREE.Vector3(o, 0, 0)); blockers.push({ x: v.x, z: v.z, r: 2.1 }); }
    { const v = shop.localToWorld(new THREE.Vector3(1.0, 0, 2.9)); blockers.push({ x: v.x, z: v.z, r: 0.9 }); }
    const npc = makeKeeper(T.look);
    const nw = shop.localToWorld(new THREE.Vector3(1.0, 0, 3.7));
    npc.position.set(nw.x, ground(nw.x, nw.z), nw.z);
    npc.rotation.y = shop.rotation.y;
    group.add(npc);

    // plaza centrepiece and the island's landmark
    const centre = well(I.id === 'coral');
    place(centre, pl.x, pl.z, pl.x, pl.z + 1);
    solids.push({ x: pl.x, z: pl.z, r: I.id === 'coral' ? 3.4 : 2 });
    blockers.push({ x: pl.x, z: pl.z, r: I.id === 'coral' ? 2.4 : 1.15 });
    let blades = null;
    if (I.id === 'pebble') {
      const tw = bellTower(); const tp = at(-0.85, 12.5);
      place(tw, tp.x, tp.z, pl.x, pl.z);
      solids.push({ x: tp.x, z: tp.z, r: 3.5 }); blockers.push({ x: tp.x, z: tp.z, r: 2.3 });
    } else if (I.id === 'drift') {
      const wm = windmill();
      const hx = I.hillC.x, hz = I.hillC.z;
      place(wm, hx, hz, pl.x, pl.z);
      wm.position.y -= 0.3;
      blades = wm.userData.blades;
      blockers.push({ x: hx, z: hz, r: 2.3 });
      solids.push({ x: hx, z: hz, r: 4 });
    }
    for (const a of [2.55, -2.55]) {
      const st = stall(T.awning); const p = at(a, 10);
      place(st, p.x, p.z, pl.x, pl.z);
      solids.push({ x: p.x, z: p.z, r: 2.6 }); blockers.push({ x: p.x, z: p.z, r: 1.3 });
    }

    // houses along the roads and round the plaza
    const houses = [];
    const free = (x, z, r) => {
      if (solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r)) return false;
      if (I.roads.some(([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) < r + 0.8)) return false;
      if (Math.hypot(x - pl.x, z - pl.z) < 7.5 + r) return false;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (ground(x + dx, z + dz) < 1.05) return false;
      return true;
    };
    const tryHouse = (x, z, fx, fz) => {
      const w = 3.6 + Math.random() * 1.6, d = 3.2 + Math.random() * 1.1, floors = Math.random() < 0.35 ? 2 : 1;
      const r = Math.max(w, d) / 2 + 0.6;
      if (!free(x, z, r)) return;
      const hs = house(P, w, d, floors, glowM);
      place(hs, x, z, fx, fz);
      solids.push({ x, z, r });
      for (const o of [-w / 4, w / 4]) { const v = hs.localToWorld(new THREE.Vector3(o, 0, 0)); blockers.push({ x: v.x, z: v.z, r: Math.max(w / 2, d) / 2 + 0.35 }); }
      houses.push({ mesh: hs, door: hs.localToWorld(hs.userData.door.clone()) });
    };
    for (const [ax, az, bx, bz] of I.roads) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let t = 10; t < len - 1; t += 7) for (const s of [-1, 1]) {
        const cx = ax + ux * t + -uz * s * 6.2, cz = az + uz * t + ux * s * 6.2;
        tryHouse(cx, cz, ax + ux * t, az + uz * t);
      }
    }
    for (const [n, r] of [[14, 17], [18, 23], [22, 29]]) for (let k = 0; k < n; k++) {
      const a = ((k + (r % 2) * 0.5) / n) * Math.PI * 2, p = at(a, r);
      tryHouse(p.x, p.z, pl.x, pl.z);
    }

    // street lamps
    const lamps = [...pier.lamps];
    for (const [ax, az, bx, bz] of I.roads) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let t = 9, s = 1; t < len; t += 9, s = -s) {
        const x = ax + ux * t + -uz * s * 2.3, z = az + uz * t + ux * s * 2.3;
        const lp = streetLamp(lampM);
        lp.position.set(x, ground(x, z), z);
        group.add(lp);
        lamps.push(lp.userData.head);
        blockers.push({ x, z, r: 0.2 });
      }
    }

    // rowboats in the harbour
    const floaters = [];
    for (const a of [5, 11, 16]) {
      if (a > D.len - 2) continue;
      const rb = rowboat();
      const x = D.sx + D.dx * a - D.px * (D.w / 2 + 1.0), z = D.sz + D.dz * a - D.pz * (D.w / 2 + 1.0);
      rb.position.set(x, 0, z);
      rb.rotation.y = Math.atan2(D.dx, D.dz) + (Math.random() - 0.5) * 0.3;
      group.add(rb);
      floaters.push(rb);
    }

    // trees outside the village, palms on Coral Cove's beaches
    const trees = [];
    let guard = 0;
    while (trees.length < 46 && guard++ < 3000) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * I.R * 0.85;
      const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
      const h = ground(x, z);
      if (h < (I.id === 'coral' ? 0.85 : 1.1)) continue;
      if (Math.hypot(x - pl.x, z - pl.z) < VILLAGE_R + 2) continue;
      if (solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 1)) continue;
      if (roadAt(x, z)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3)) continue;
      const kind = I.id === 'coral' ? (Math.random() < 0.75 ? 'palm' : 'round') : I.id === 'drift' ? (Math.random() < 0.75 ? 'pine' : 'round') : (Math.random() < 0.45 ? 'pine' : 'round');
      trees.push({ x, z, kind, scale: 0.9 + Math.random() * 0.45 });
    }
    const avoid = [...solids, ...trees.map((t) => ({ x: t.x, z: t.z, r: 0.9 }))];
    group.add(buildFoliage(avoid.map((s) => ({ x: s.x, z: s.z, r: s.r })), I.x, I.z, I.R * 1.7, 900, 260));
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = I.Rdir * (0.88 + Math.random() * 0.25);
      const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
      if (Math.hypot(x - D.sx, z - D.sz) < 8) continue;
      const rk = makeRock(0.7 + Math.random() * 0.9);
      rk.position.set(x, ground(x, z) + 0.15, z);
      group.add(rk);
    }

    // villagers
    const villagers = [];
    const plazaPts = [0, 1, 2, 3, 4].map(() => at(Math.random() * 6.28, 4 + Math.random() * 3));
    for (let k = 0; k < 9; k++) {
      const look = { coat: pick(['#e0523f', '#34507a', '#5b8c5a', '#b9a6e0', '#ff8a6b', '#2bb3a3', '#f2c14e', '#8a5a3b']), hat: pick(['#f4efe6', '#3e3a3a', '#e0523f', '#5b8c5a', '#34507a', '#f2a0b3']), pants: pick(['#3e3a3a', '#34507a', '#7a5236']), skin: pick(['#f6c9a2', '#e0a878', '#c68a5c', '#8d5a3b', '#f9d9bf']) };
      look.brim = look.hat;
      const m = makeKeeper(look);
      m.scale.setScalar(0.92 + Math.random() * 0.12);
      const home = houses.length ? pick(houses).door : plazaPts[0];
      const start = pick(plazaPts);
      m.position.set(start.x, ground(start.x, start.z), start.z);
      group.add(m);
      villagers.push({ mesh: m, name: pick(NAMES), home, x: start.x, z: start.z, path: [], wait: Math.random() * 3, walkT: 0, say: null, sayT: 0, inside: false });
    }
    out.push({ I, T, D, group, shop, npc, npcPos: { x: npc.position.x, z: npc.position.z }, lamps, glowM, lampM, trees, blockers, villagers, houses, plazaPts, floaters, blades, centre });
  }
  return out;
}

// nearest point on any road to (x, z)
function onRoad(I, x, z) {
  let best = null, bd = 1e9;
  for (const [ax, az, bx, bz] of I.roads) {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = { x: px, z: pz }; }
  }
  return best;
}

// villagers stroll between doors, the plaza and the shop; they head home in the rain
export function updateVillagers(isle, dt, time, wx) {
  const I = isle.I;
  const wet = wx.rain > 0.45;
  for (const v of isle.villagers) {
    const ud = v.mesh.userData;
    if (v.sayT > 0) { v.sayT -= dt; ud.legs[0].rotation.x = ud.legs[1].rotation.x = 0; continue; }
    if (v.inside) {
      if (!wet) { v.inside = false; v.mesh.visible = true; v.wait = Math.random() * 2; }
      continue;
    }
    if (!v.path.length) {
      v.wait -= dt;
      ud.legs[0].rotation.x = ud.legs[1].rotation.x = 0;
      if (wet && Math.hypot(v.x - v.home.x, v.z - v.home.z) < 0.6) { v.inside = true; v.mesh.visible = false; continue; }
      if (v.wait > 0 && !wet) continue;
      const dest = wet ? v.home : Math.random() < 0.4 ? pick(isle.plazaPts) : Math.random() < 0.6 && isle.houses.length ? pick(isle.houses).door : { x: isle.npcPos.x + (Math.random() - 0.5) * 3, z: isle.npcPos.z + 1.5 };
      const a = onRoad(I, v.x, v.z), b = onRoad(I, dest.x, dest.z);
      v.path = [a, { x: I.plaza.x + (Math.random() - 0.5) * 6, z: I.plaza.z + (Math.random() - 0.5) * 6 }, b, dest];
      v.wait = 2 + Math.random() * 5;
    }
    const tgt = v.path[0];
    const dx = tgt.x - v.x, dz = tgt.z - v.z, d = Math.hypot(dx, dz);
    const sp = wet ? 2.4 : 1.3;
    if (d < 0.25) { v.path.shift(); continue; }
    const s = Math.min(d, sp * dt);
    v.x += (dx / d) * s; v.z += (dz / d) * s;
    v.walkT += dt * sp * 3;
    const face = Math.atan2(dx, dz);
    let df = face - v.mesh.rotation.y;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    v.mesh.rotation.y += df * Math.min(1, dt * 8);
    v.mesh.position.set(v.x, heightAt(v.x, v.z) + Math.abs(Math.sin(v.walkT)) * 0.05, v.z);
    ud.legs[0].rotation.x = Math.sin(v.walkT) * 0.6; ud.legs[1].rotation.x = -Math.sin(v.walkT) * 0.6;
    ud.arms[0].rotation.x = -Math.sin(v.walkT) * 0.4; ud.arms[1].rotation.x = Math.sin(v.walkT) * 0.4;
  }
}

export function villagerLine(isle, wxName) {
  const pool = [...TALK[isle.I.id]];
  if (WEATHER_TALK[wxName]) pool.push(...WEATHER_TALK[wxName], ...WEATHER_TALK[wxName]);
  return pick(pool);
}

// The keeper's own little sailboat.
export function makeSailboat() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const hull = mesh(hullGeo(4.2, 1.7, 0.75), mat('#b98458')); hull.position.y = -0.5; rig.add(hull);
  const rim = mesh(hullGeo(4.2, 1.7, 0.12), mat('#7a5236'), false); rim.scale.set(1.04, 1, 1.02); rim.position.y = 0.2; rig.add(rim);
  const deck = mesh(hullGeo(3.8, 1.4, 0.05), mat('#d9b07a'), false); deck.position.y = 0.18; rig.add(deck);
  for (const z of [-0.9, 0.5]) { const seat = mesh(new THREE.BoxGeometry(1.4, 0.1, 0.4), mat('#a8764c')); seat.position.set(0, 0.42, z); rig.add(seat); }
  const mast = mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.0, 6), mat('#7a5236')); mast.position.set(0, 2.2, 0.7); rig.add(mast);
  const boom = mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 5), mat('#7a5236')); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.85, -0.45);
  const sailPivot = new THREE.Group(); sailPivot.position.set(0, 0, 0.7); rig.add(sailPivot);
  boom.position.set(0, 0.85, -1.15); sailPivot.add(boom);
  // a curved triangular sail: rows from the foot (u=0) to the head (u=1), bellied out sideways
  const pos = [], idx = [], N = 6, M = 6;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    const u = i / N, v = j / M;
    const y = 0.9 + u * 3.1, z = -2.3 * v * (1 - u);
    const x = 0.55 * Math.sin(Math.PI * v) * (1 - u * 0.8);
    pos.push(x, y, z);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setIndex(idx);
  sg.computeVertexNormals();
  const sail = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: '#fbf3e2', side: THREE.DoubleSide }));
  sail.castShadow = true;
  sailPivot.add(sail);
  const stripe = mesh(new THREE.BoxGeometry(0.03, 0.3, 1.4), mat('#e0523f'), false); stripe.position.set(0, 1.6, -0.75); sailPivot.add(stripe);
  const flag = mesh(new THREE.ConeGeometry(0.1, 0.5, 3), mat('#e0523f'), false); flag.rotation.z = Math.PI / 2; flag.position.set(0.25, 4.15, 0.7); rig.add(flag);
  const lanternMat = new THREE.MeshLambertMaterial({ color: '#fff0c0', emissive: '#ffb84a', emissiveIntensity: 0 });
  const lantern = mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), lanternMat, false); lantern.position.set(0, 0.62, -1.75); rig.add(lantern);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffcf7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.scale.setScalar(2.4); glow.position.copy(lantern.position); rig.add(glow);
  g.userData = { rig, sailPivot, sail, lanternMat, glow };
  return g;
}
