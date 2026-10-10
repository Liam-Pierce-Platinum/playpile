// Inside the keeper's home: a cut-away room (front wall removed so the
// camera can see in) that grows with the house, plus furniture the player
// makes from wood, shells, coins and fish and places on a grid.
import * as THREE from 'three';
import { mat, mesh } from './props.js';
import { PAINTS } from './cabin.js';
import { FISH, FISH_BY_ID } from './fishing.js';

// w x d footprint in metres (before rotation). wall: hangs on the back wall.
// flat: things can stand on it (rugs). use: what E does next to it.
export const FURNITURE = {
  bed: { name: 'Cosy Bed', cost: { wood: 8 }, w: 1.2, d: 2.1, blurb: 'Sleep here at night.', use: 'sleep' },
  rug: { name: 'Round Rug', cost: { shells: 4 }, w: 2.0, d: 2.0, flat: true, blurb: 'Soft underfoot. Furniture can stand on it.' },
  table: { name: 'Table', cost: { wood: 5 }, w: 1.4, d: 0.9, blurb: 'For suppers and maps.' },
  chair: { name: 'Chair', cost: { wood: 3 }, w: 0.6, d: 0.6, blurb: 'A simple wooden chair.' },
  stool: { name: 'Stool', cost: { wood: 2 }, w: 0.5, d: 0.5, blurb: 'Three legs, never wobbles.' },
  armchair: { name: 'Armchair', cost: { wood: 7, shells: 2 }, w: 1.1, d: 1.0, blurb: 'The comfiest seat on the island.' },
  shelf: { name: 'Bookshelf', cost: { wood: 6 }, w: 1.3, d: 0.45, blurb: 'Tide tables and fishing stories.' },
  wardrobe: { name: 'Wardrobe', cost: { wood: 8 }, w: 1.3, d: 0.65, blurb: 'Raincoats, mostly.' },
  chest: { name: 'Sea Chest', cost: { wood: 6 }, w: 1.0, d: 0.6, blurb: 'Brass corners. Smells of salt.' },
  stove: { name: 'Iron Stove', cost: { wood: 4, coins: 20 }, w: 0.9, d: 0.8, blurb: 'Cook fish without going outside.', use: 'cook' },
  lamp: { name: 'Floor Lamp', cost: { wood: 3, coins: 10 }, w: 0.5, d: 0.5, blurb: 'Glows warm at night.' },
  plant: { name: 'Potted Fern', cost: { shells: 3 }, w: 0.6, d: 0.6, blurb: 'A bit of green.' },
  tank: { name: 'Fish Tank', cost: { wood: 4, shells: 6 }, w: 1.2, d: 0.6, blurb: 'Little fish from your Fish Book swim inside.' },
  painting: { name: 'Seascape Painting', cost: { coins: 15 }, w: 1.3, d: 0.1, wall: true, blurb: 'Hangs on the back wall.' },
  trophy: { name: 'Fish Trophy', cost: { fish: 1 }, w: 1.0, d: 0.1, wall: true, blurb: 'Mounts your best catch on the wall. Uses one raw fish.' },
  clock: { name: 'Ship\'s Clock', cost: { coins: 20 }, w: 0.7, d: 0.1, wall: true, blurb: 'Tells the real island time.' },
  // only sold on the other islands
  wheel: { name: 'Ship\'s Wheel', shop: 'Pebble Isle', w: 1.1, d: 0.1, wall: true, blurb: 'A real wheel off a real ship.' },
  anchor: { name: 'Old Anchor', shop: 'Pebble Isle', w: 0.9, d: 0.6, blurb: 'Rusty and proud of it.' },
  rocker: { name: 'Rocking Chair', shop: 'Driftwood Cay', w: 0.8, d: 1.0, blurb: 'Creaks just right.' },
  gclock: { name: 'Grandfather Clock', shop: 'Driftwood Cay', w: 0.7, d: 0.5, blurb: 'Tall, handsome, always right.' },
  telescope: { name: 'Brass Telescope', shop: 'Coral Cove', w: 0.8, d: 0.8, blurb: 'For spotting boats.' },
  mirror: { name: 'Shell Mirror', shop: 'Coral Cove', w: 0.9, d: 0.1, wall: true, blurb: 'Framed in shells.' },
};

export const FLOORS = {
  oak: { name: 'Oak', a: '#c4925f', b: '#b07d4c' },
  pine: { name: 'Pine', a: '#e2be8a', b: '#d4ab74' },
  walnut: { name: 'Walnut', a: '#7a5236', b: '#6a452c' },
  check: { name: 'Checker', a: '#f4efe6', b: '#5a5f6b' },
};

// room size per house stage (tent, shack, cabin, cottage)
export const ROOMS = [[4, 3.4], [5, 4.4], [7, 5.4], [9, 6.6]];
const WALL_H = 3, WALL_Y = 1.65;

export function footprint(item) {
  const F = FURNITURE[item.id];
  const odd = item.r % 2 === 1;
  return { w: odd ? F.d : F.w, d: odd ? F.w : F.d };
}

function makeFurniture(id, S) {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, opts) => { const m = mesh(geo, opts ? new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }) : mat(color)); m.position.set(x, y, z); g.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
  const wood = '#a8764c', dark = '#7a5236';
  const legs = (w, d, h, color = dark, r = 0.05) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(C(r, r, h, 6), color, sx * (w / 2 - r * 1.5), h / 2, sz * (d / 2 - r * 1.5));
  };
  switch (id) {
    case 'bed':
      add(B(1.2, 0.3, 2.1), wood, 0, 0.25, 0);
      add(B(1.1, 0.16, 1.95), '#fbf6ec', 0, 0.48, 0.02);
      add(B(1.14, 0.1, 1.25), '#ff8a6b', 0, 0.58, 0.38);
      add(B(1.16, 0.04, 0.22), '#fbf6ec', 0, 0.64, -0.22);
      add(B(0.75, 0.16, 0.38), '#ffffff', 0, 0.64, -0.72);
      add(B(1.24, 1.0, 0.12), dark, 0, 0.5, -1.02);
      add(B(1.24, 0.5, 0.1), dark, 0, 0.25, 1.02);
      break;
    case 'rug': {
      const r = add(C(1.0, 1.0, 0.03, 20), '#2bb3a3', 0, 0.015, 0); r.castShadow = false;
      const r2 = add(C(0.72, 0.72, 0.035, 20), '#f6e2b8', 0, 0.018, 0); r2.castShadow = false;
      const r3 = add(C(0.4, 0.4, 0.04, 20), '#ff8a6b', 0, 0.02, 0); r3.castShadow = false;
      break;
    }
    case 'table':
      add(B(1.4, 0.09, 0.9), wood, 0, 0.76, 0);
      legs(1.3, 0.8, 0.72, dark, 0.05);
      add(C(0.08, 0.06, 0.18, 7), '#f4efe6', 0.3, 0.9, 0.1);
      add(C(0.14, 0.14, 0.02, 10), '#f4efe6', -0.25, 0.81, 0);
      break;
    case 'chair':
      add(B(0.5, 0.07, 0.5), wood, 0, 0.46, 0);
      legs(0.46, 0.46, 0.44, dark, 0.035);
      add(B(0.5, 0.55, 0.06), wood, 0, 0.78, -0.22);
      break;
    case 'stool':
      add(C(0.25, 0.25, 0.07, 10), wood, 0, 0.48, 0);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; add(C(0.03, 0.03, 0.46, 5), dark, Math.cos(a) * 0.16, 0.23, Math.sin(a) * 0.16); }
      break;
    case 'armchair':
      add(B(1.05, 0.42, 0.95), '#f2c14e', 0, 0.21, 0);
      add(B(1.05, 0.8, 0.22), '#f2c14e', 0, 0.62, -0.37);
      add(B(0.2, 0.32, 0.85), '#e0a93a', -0.43, 0.56, 0.02); add(B(0.2, 0.32, 0.85), '#e0a93a', 0.43, 0.56, 0.02);
      add(B(0.66, 0.12, 0.66), '#fff3d0', 0, 0.47, 0.08);
      add(B(0.36, 0.3, 0.12), '#ff8a6b', 0.1, 0.65, -0.22).rotation.z = 0.2;
      break;
    case 'shelf': {
      add(B(1.3, 1.9, 0.08), dark, 0, 0.95, -0.18);
      add(B(0.08, 1.9, 0.45), wood, -0.61, 0.95, 0); add(B(0.08, 1.9, 0.45), wood, 0.61, 0.95, 0);
      const cols = ['#e0523f', '#34507a', '#f2c14e', '#6d9a5b', '#b9a6e0', '#ff8a6b'];
      for (let s = 0; s < 4; s++) {
        add(B(1.2, 0.05, 0.42), wood, 0, 0.08 + s * 0.6, 0);
        if (s === 3) continue;
        let x = -0.5;
        for (let k = 0; k < 6 && x < 0.5; k++) {
          const bw = 0.08 + ((k * 7 + s * 3) % 4) * 0.025, bh = 0.32 + ((k + s) % 3) * 0.06;
          add(B(bw, bh, 0.3), cols[(k + s * 2) % cols.length], x + bw / 2, 0.1 + s * 0.6 + bh / 2, 0.02);
          x += bw + 0.02;
        }
      }
      break;
    }
    case 'wardrobe':
      add(B(1.3, 2.0, 0.65), wood, 0, 1.0, 0);
      add(B(0.02, 1.8, 0.02), dark, 0, 1.0, 0.33);
      add(B(1.36, 0.1, 0.7), dark, 0, 2.03, 0);
      add(C(0.04, 0.04, 0.04, 6), '#f2c14e', -0.1, 1.05, 0.34).rotation.x = Math.PI / 2;
      add(C(0.04, 0.04, 0.04, 6), '#f2c14e', 0.1, 1.05, 0.34).rotation.x = Math.PI / 2;
      for (const sx of [-0.55, 0.55]) add(B(0.1, 0.08, 0.1), dark, sx, 0.04, 0.22);
      break;
    case 'chest':
      add(B(1.0, 0.45, 0.6), '#8a5a3b', 0, 0.23, 0);
      add(B(1.04, 0.16, 0.64), '#7a4a2e', 0, 0.52, 0);
      for (const sx of [-0.35, 0.35]) add(B(0.08, 0.62, 0.66), '#d9a84a', sx, 0.31, 0);
      add(B(0.14, 0.14, 0.04), '#d9a84a', 0, 0.42, 0.31);
      break;
    case 'stove': {
      add(B(0.85, 0.75, 0.75), '#3e3a3a', 0, 0.42, 0);
      legs(0.8, 0.7, 0.1, '#2b2828', 0.05);
      const glow = add(B(0.4, 0.25, 0.05), '#ff8a3c', 0, 0.36, 0.38, { emissive: '#ff6a1a', emissiveIntensity: 1.2 });
      glow.userData.glow = true;
      add(C(0.1, 0.1, 1.6, 8), '#3e3a3a', 0.2, 1.6, -0.2);
      add(C(0.16, 0.16, 0.05, 10), '#2b2828', -0.15, 0.81, 0.1);
      break;
    }
    case 'lamp': {
      add(C(0.2, 0.22, 0.05, 10), dark, 0, 0.03, 0);
      add(C(0.03, 0.03, 1.4, 6), dark, 0, 0.72, 0);
      const shade = add(new THREE.ConeGeometry(0.32, 0.38, 10, 1, true), '#fff1c9', 0, 1.5, 0, { emissive: '#ffcf7a', emissiveIntensity: 0.2, side: THREE.DoubleSide });
      shade.userData.shade = true;
      const pl = new THREE.PointLight('#ffc77a', 0, 7, 1.4); pl.position.y = 1.35; g.add(pl);
      g.userData.light = pl;
      break;
    }
    case 'plant':
      add(C(0.22, 0.17, 0.35, 8), '#c96a46', 0, 0.18, 0);
      add(C(0.2, 0.2, 0.03, 8), '#5a3a2a', 0, 0.35, 0);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const l = add(new THREE.ConeGeometry(0.09, 0.7, 4), k % 2 ? '#5aae55' : '#4b9e62', Math.cos(a) * 0.1, 0.65, Math.sin(a) * 0.1);
        l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      break;
    case 'tank': {
      add(B(1.2, 0.6, 0.6), wood, 0, 0.3, 0);
      const glass = add(B(1.1, 0.6, 0.5), '#9fe0f0', 0, 0.9, 0, { transparent: true, opacity: 0.35 });
      glass.castShadow = false;
      add(B(1.04, 0.08, 0.44), '#e8d6b0', 0, 0.64, 0);
      add(new THREE.ConeGeometry(0.06, 0.3, 4), '#5aae55', -0.35, 0.8, 0);
      add(new THREE.ConeGeometry(0.05, 0.22, 4), '#4b9e62', -0.28, 0.76, 0.1);
      const caught = FISH.filter((f) => S.caught[f.id]);
      const swimmers = [];
      for (let k = 0; k < 3; k++) {
        const f = caught.length ? caught[k % caught.length] : FISH[k];
        const fm = add(new THREE.IcosahedronGeometry(0.05, 0), f.color, 0, 0.9, 0);
        fm.scale.set(1.8, 0.9, 0.6); fm.castShadow = false;
        swimmers.push(fm);
      }
      g.userData.swimmers = swimmers;
      break;
    }
    case 'painting': {
      add(B(1.3, 0.9, 0.06), '#c98a3c', 0, 0, 0);
      add(B(1.14, 0.42, 0.07), '#9fd0e8', 0, 0.12, 0.01);
      add(B(1.14, 0.3, 0.07), '#2b8fc8', 0, -0.23, 0.01);
      add(C(0.1, 0.1, 0.08, 10), '#ffd75e', 0.3, 0.2, 0.02).rotation.x = Math.PI / 2;
      add(new THREE.ConeGeometry(0.12, 0.3, 3), '#fbf3e2', -0.25, -0.02, 0.05);
      break;
    }
    case 'trophy': {
      add(B(1.0, 0.5, 0.06), '#8a5a3b', 0, 0, 0);
      const best = FISH.filter((f) => S.caught[f.id]).sort((a, b) => b.price - a.price)[0] || FISH[0];
      const fish = add(new THREE.IcosahedronGeometry(0.16, 0), best.color, -0.05, 0, 0.08);
      fish.scale.set(2.6, 1, 0.5);
      const tail = add(new THREE.ConeGeometry(0.13, 0.22, 3), best.color, 0.4, 0, 0.08);
      tail.rotation.z = Math.PI / 2;
      add(B(0.3, 0.06, 0.07), '#d9a84a', 0, -0.2, 0.04);
      break;
    }
    case 'wheel': {
      const rim = add(new THREE.TorusGeometry(0.38, 0.05, 6, 16), '#8a5a3b', 0, 0, 0.04);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const sp = add(B(0.05, 1.0, 0.05), '#a8764c', 0, 0, 0.04); sp.rotation.z = a;
        const hd = add(C(0.04, 0.05, 0.16, 6), '#7a5236', Math.sin(a) * 0.52, Math.cos(a) * 0.52, 0.04); hd.rotation.z = -a;
      }
      add(C(0.1, 0.1, 0.1, 8), '#d9a84a', 0, 0, 0.06).rotation.x = Math.PI / 2;
      rim.castShadow = false;
      break;
    }
    case 'anchor': {
      add(B(0.12, 1.1, 0.12), '#6a6e78', 0, 0.75, 0);
      add(new THREE.TorusGeometry(0.16, 0.04, 6, 12), '#6a6e78', 0, 1.42, 0);
      add(B(0.7, 0.1, 0.1), '#6a6e78', 0, 1.15, 0);
      const arc = add(new THREE.TorusGeometry(0.4, 0.07, 6, 12, Math.PI), '#6a6e78', 0, 0.45, 0); arc.rotation.z = Math.PI;
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.09, 0.22, 4), '#6a6e78', s * 0.4, 0.55, 0);
      add(C(0.35, 0.4, 0.12, 10), '#8a7f74', 0, 0.06, 0);
      break;
    }
    case 'rocker': {
      for (const s of [-1, 1]) {
        const rk = add(new THREE.TorusGeometry(0.6, 0.04, 4, 12, Math.PI / 2.2), dark, s * 0.32, 0.62, 0);
        rk.rotation.set(0, Math.PI / 2, Math.PI + Math.PI / 4.4 - Math.PI / 2);
      }
      add(B(0.7, 0.07, 0.6), wood, 0, 0.45, 0);
      add(B(0.7, 0.8, 0.07), wood, 0, 0.85, -0.3).rotation.x = -0.15;
      for (const s of [-1, 1]) add(B(0.06, 0.4, 0.06), dark, s * 0.32, 0.25, 0.2);
      add(B(0.5, 0.1, 0.45), '#b9a6e0', 0, 0.52, 0.02);
      break;
    }
    case 'gclock': {
      add(B(0.6, 2.0, 0.42), '#7a4a2e', 0, 1.0, 0);
      add(B(0.66, 0.15, 0.48), '#5a3a22', 0, 2.05, 0);
      add(C(0.22, 0.22, 0.05, 14), '#fbf6ec', 0, 1.65, 0.21).rotation.x = Math.PI / 2;
      add(B(0.36, 0.8, 0.03), '#3a2a1a', 0, 0.85, 0.21);
      const pend = add(C(0.08, 0.08, 0.03, 10), '#d9a84a', 0, 0.6, 0.23); pend.rotation.x = Math.PI / 2;
      g.userData.pendulum = pend;
      break;
    }
    case 'telescope': {
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const l = add(C(0.025, 0.025, 1.0, 5), dark, Math.cos(a) * 0.22, 0.48, Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); }
      const tube = add(C(0.07, 0.11, 1.0, 10), '#d9a84a', 0, 1.05, 0); tube.rotation.x = 1.15;
      add(C(0.12, 0.12, 0.08, 10), '#b87333', 0, 1.25, -0.42).rotation.x = 1.15;
      break;
    }
    case 'mirror': {
      add(C(0.42, 0.42, 0.05, 16), '#c9e8f0', 0, 0, 0.03).rotation.x = Math.PI / 2;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const sh = add(new THREE.ConeGeometry(0.07, 0.18, 5), k % 2 ? '#fbe3c6' : '#ffb2a2', Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.05);
        sh.rotation.z = a - Math.PI / 2;
      }
      break;
    }
    case 'clock': {
      add(C(0.33, 0.33, 0.08, 16), '#b87333', 0, 0, 0).rotation.x = Math.PI / 2;
      add(C(0.27, 0.27, 0.09, 16), '#fbf6ec', 0, 0, 0.01).rotation.x = Math.PI / 2;
      const hh = add(B(0.03, 0.16, 0.02), '#3e3a3a', 0, 0, 0.07); hh.geometry.translate(0, 0.07, 0);
      const mh = add(B(0.02, 0.22, 0.02), '#3e3a3a', 0, 0, 0.075); mh.geometry.translate(0, 0.1, 0);
      g.userData.hands = [hh, mh];
      break;
    }
  }
  return g;
}

export class Interior {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2230');
    this.hemi = new THREE.HemisphereLight('#fff4e0', '#6a5040', 1.5);
    this.sun = new THREE.DirectionalLight('#fff1d8', 1.8);
    this.sun.position.set(-3, 8, -2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 0.5; sc.far = 25;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    this.fill = new THREE.PointLight('#ffd9a0', 6, 14, 1.2);
    this.fill.position.set(0, 2.6, 1.5);
    this.scene.add(this.hemi, this.sun, this.fill);
    this.room = new THREE.Group();
    this.scene.add(this.room);
    this.items = [];          // { data, mesh }
    this.ghost = null;
    this.windowMats = [];
  }

  dims(S) { const [w, d] = ROOMS[S.stage]; return { w, d }; }

  build(S) {
    this.scene.remove(this.room);
    this.room = new THREE.Group();
    this.scene.add(this.room);
    const { w, d } = this.dims(S);
    this.w = w; this.d = d;
    const fl = FLOORS[S.floor] || FLOORS.oak;
    const wallC = S.stage === 0 ? '#efe2c4' : (PAINTS[S.wallpaper] || PAINTS.white).hex;
    // floor planks (or checker tiles)
    if (S.floor === 'check') {
      for (let x = -w / 2; x < w / 2 - 0.01; x += 0.5) for (let z = -d / 2; z < d / 2 - 0.01; z += 0.5) {
        const t = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), mat(((Math.round((x + w) * 2) + Math.round((z + d) * 2)) % 2) ? fl.a : fl.b), false);
        t.position.set(x + 0.25, -0.05, z + 0.25); this.room.add(t);
      }
    } else {
      let k = 0;
      for (let x = -w / 2; x < w / 2 - 0.01; x += 0.42, k++) {
        const p = mesh(new THREE.BoxGeometry(0.4, 0.1, d), mat(k % 2 ? fl.a : fl.b), false);
        p.position.set(x + 0.21, -0.05, 0); this.room.add(p);
      }
    }
    const base = mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), mat('#5a4030'), false);
    base.position.y = -0.31; this.room.add(base);
    // three walls; the front one is cut away for the camera
    const wallMat = new THREE.MeshLambertMaterial({ color: wallC, flatShading: true });
    const wainMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(wallC).multiplyScalar(0.78), flatShading: true });
    const back = mesh(new THREE.BoxGeometry(w + 0.4, WALL_H, 0.2), wallMat); back.position.set(0, WALL_H / 2, -d / 2 - 0.1); this.room.add(back);
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.BoxGeometry(0.2, WALL_H, d + 0.2), wallMat); side.position.set(s * (w / 2 + 0.1), WALL_H / 2, -0.1); this.room.add(side);
      const wn = mesh(new THREE.BoxGeometry(0.04, 0.9, d), wainMat, false); wn.position.set(s * (w / 2 - 0.0), 0.45, 0); this.room.add(wn);
      const cap = mesh(new THREE.BoxGeometry(0.24, 0.08, d + 0.24), mat('#7a5236'), false); cap.position.set(s * (w / 2 + 0.1), WALL_H + 0.04, -0.1); this.room.add(cap);
    }
    const bwn = mesh(new THREE.BoxGeometry(w, 0.9, 0.04), wainMat, false); bwn.position.set(0, 0.45, -d / 2 + 0.01); this.room.add(bwn);
    const rail = mesh(new THREE.BoxGeometry(w, 0.06, 0.06), mat('#7a5236'), false); rail.position.set(0, 0.92, -d / 2 + 0.03); this.room.add(rail);
    const bcap = mesh(new THREE.BoxGeometry(w + 0.44, 0.08, 0.24), mat('#7a5236'), false); bcap.position.set(0, WALL_H + 0.04, -d / 2 - 0.1); this.room.add(bcap);
    // windows on the side walls (the back wall is for pictures)
    this.windowMats = [];
    for (const s of [-1, 1]) {
      const fr = mesh(new THREE.BoxGeometry(0.1, 1.1, 1.1), mat('#f4efe6'), false); fr.position.set(s * (w / 2 - 0.02), 1.75, -d / 4); this.room.add(fr);
      const pm = new THREE.MeshLambertMaterial({ color: '#bfe6f5', emissive: '#bfe6f5', emissiveIntensity: 0.6 });
      const pane = mesh(new THREE.BoxGeometry(0.12, 0.9, 0.9), pm, false); pane.position.copy(fr.position); this.room.add(pane);
      const bar = mesh(new THREE.BoxGeometry(0.14, 0.9, 0.05), mat('#f4efe6'), false); bar.position.copy(fr.position); this.room.add(bar);
      const bar2 = mesh(new THREE.BoxGeometry(0.14, 0.05, 0.9), mat('#f4efe6'), false); bar2.position.copy(fr.position); this.room.add(bar2);
      for (const cz of [-0.62, 0.62]) {
        const cur = mesh(new THREE.BoxGeometry(0.06, 1.3, 0.3), mat('#ff8a6b'), false);
        cur.position.set(s * (w / 2 - 0.08), 1.7, -d / 4 + cz); this.room.add(cur);
      }
      this.windowMats.push(pm);
    }
    // doormat marks the way out
    const matm = mesh(new THREE.BoxGeometry(1.2, 0.03, 0.6), mat('#c9a26a'), false); matm.position.set(0, 0.015, d / 2 - 0.35); this.room.add(matm);
    const stripe = mesh(new THREE.BoxGeometry(1.0, 0.035, 0.08), mat('#8a5a3b'), false); stripe.position.set(0, 0.02, d / 2 - 0.35); this.room.add(stripe);

    // furniture
    this.items = [];
    for (const it of S.room) {
      if (!this.fits(it, null, true)) continue;
      this.addItem(it, S);
    }
  }

  addItem(data, S) {
    const m = makeFurniture(data.id, S);
    this.place(m, data);
    this.room.add(m);
    this.items.push({ data, mesh: m });
  }
  place(m, data) {
    const F = FURNITURE[data.id];
    if (F.wall) { m.position.set(data.x, WALL_Y, -this.d / 2 + 0.06); m.rotation.y = 0; }
    else { m.position.set(data.x, 0, data.z); m.rotation.y = -data.r * Math.PI / 2; }
  }
  removeItem(entry) {
    this.room.remove(entry.mesh);
    this.items.splice(this.items.indexOf(entry), 1);
  }

  // is this spot inside the room and clear of other furniture?
  fits(data, ignore, loose) {
    const F = FURNITURE[data.id];
    const fp = footprint(data);
    const pad = loose ? -0.01 : 0;
    if (F.wall) {
      if (Math.abs(data.x) + fp.w / 2 > this.w / 2 - 0.05 + 0.01) return false;
      return !this.items.some((o) => o !== ignore && FURNITURE[o.data.id].wall && Math.abs(o.data.x - data.x) < (footprint(o.data).w + fp.w) / 2 - 0.02);
    }
    if (Math.abs(data.x) + fp.w / 2 > this.w / 2 + 0.01) return false;
    if (data.z - fp.d / 2 < -this.d / 2 - 0.01 || data.z + fp.d / 2 > this.d / 2 - 0.7 + 0.01) return false;
    if (F.flat) return !this.items.some((o) => o !== ignore && FURNITURE[o.data.id].flat && overlap(o.data, data, pad));
    return !this.items.some((o) => o !== ignore && !FURNITURE[o.data.id].flat && !FURNITURE[o.data.id].wall && overlap(o.data, data, pad));
  }

  // solid footprints for walking around
  solids() {
    return this.items.filter((o) => { const F = FURNITURE[o.data.id]; return !F.flat && !F.wall; })
      .map((o) => { const fp = footprint(o.data); return { x: o.data.x, z: o.data.z, w: fp.w, d: fp.d, entry: o }; });
  }

  // ghost preview while placing
  setGhost(id, S) {
    this.clearGhost();
    if (!id) return;
    const g = makeFurniture(id, S);
    const ok = new THREE.MeshBasicMaterial({ color: '#7ff0c8', transparent: true, opacity: 0.55, depthWrite: false });
    const bad = new THREE.MeshBasicMaterial({ color: '#ff6a5a', transparent: true, opacity: 0.55, depthWrite: false });
    g.traverse((o) => { if (o.isMesh) { o.material = ok; o.castShadow = false; } if (o.isLight) o.intensity = 0; });
    g.userData.ok = ok; g.userData.bad = bad;
    this.ghost = g;
    this.room.add(g);
  }
  updateGhost(data, valid) {
    if (!this.ghost) return;
    this.place(this.ghost, data);
    this.ghost.position.y += 0.03 + Math.sin(performance.now() / 180) * 0.03;
    const m = valid ? this.ghost.userData.ok : this.ghost.userData.bad;
    this.ghost.traverse((o) => { if (o.isMesh) o.material = m; });
  }
  clearGhost() { if (this.ghost) { this.room.remove(this.ghost); this.ghost = null; } }

  update(time, night, dayT) {
    this.hemi.intensity = 1.5 - night * 0.6;
    this.sun.intensity = 1.8 * (1 - night) + 0.25;
    this.sun.color.set(night > 0.5 ? '#8fa6e0' : '#fff1d8');
    this.fill.intensity = 4 + night * 6;
    for (const m of this.windowMats) {
      m.color.set(night > 0.5 ? '#24386a' : '#bfe6f5');
      m.emissive.set(night > 0.5 ? '#24386a' : '#bfe6f5');
    }
    for (const it of this.items) {
      const u = it.mesh.userData;
      if (u.light) {
        u.light.intensity = night * 7;
        it.mesh.traverse((o) => { if (o.userData.shade) o.material.emissiveIntensity = 0.2 + night * 1.4; });
      }
      if (u.swimmers) u.swimmers.forEach((f, k) => {
        const a = time * (0.6 + k * 0.25) + k * 2;
        f.position.set(Math.sin(a) * 0.4, 0.8 + k * 0.1 + Math.sin(a * 2) * 0.03, Math.cos(a * 1.3) * 0.12);
        f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
      });
      if (u.pendulum) u.pendulum.position.x = Math.sin(time * 3) * 0.1;
      if (u.hands) {
        const hours = dayT * 24;
        u.hands[0].rotation.z = -(hours % 12) / 12 * Math.PI * 2;
        u.hands[1].rotation.z = -(hours % 1) * Math.PI * 2;
      }
    }
  }
}

function overlap(a, b, pad) {
  const fa = footprint(a), fb = footprint(b);
  return Math.abs(a.x - b.x) < (fa.w + fb.w) / 2 + pad && Math.abs(a.z - b.z) < (fa.d + fb.d) / 2 + pad;
}

export { FISH_BY_ID };
