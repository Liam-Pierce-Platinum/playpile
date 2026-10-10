// The keeper's home: four build stages and the paint/extras that dress it.
import * as THREE from 'three';
import { mat, mesh } from './props.js';
import { CABIN, heightAt } from './terrain.js';

export const PAINTS = {
  wood: { name: 'Natural Wood', hex: '#b9814f', free: true },
  white: { name: 'Seashell White', hex: '#f4efe6', free: true },
  red: { name: 'Barn Red', hex: '#c4563f', free: true },
  moss: { name: 'Moss Green', hex: '#6d9a5b', free: true },
  sky: { name: 'Sky Blue', hex: '#7fbbe0', price: 12 },
  sun: { name: 'Sunflower', hex: '#f2c14e', price: 12 },
  rose: { name: 'Rose', hex: '#f2a0b3', price: 12 },
  mint: { name: 'Mint', hex: '#9edcc0', price: 12 },
  lav: { name: 'Lavender', hex: '#b9a6e0', price: 12 },
  coral: { name: 'Coral', hex: '#ff8a6b', price: 12 },
  navy: { name: 'Navy', hex: '#34507a', price: 12 },
  slate: { name: 'Slate', hex: '#5a5f6b', price: 12 },
  gold: { name: 'Gold', hex: '#e8b84a', isle: 'Coral Cove' },
  seafoam: { name: 'Seafoam', hex: '#7fe0c8', isle: 'Coral Cove' },
  plum: { name: 'Plum', hex: '#8a4f7a', isle: 'Coral Cove' },
};

export const STAGES = [
  { name: 'Tent', wood: 0, coins: 0, blurb: 'A canvas tent. It leaks.' },
  { name: 'Shack', wood: 12, coins: 0, blurb: 'Four walls, a door and a roof. Unlocks paint.' },
  { name: 'Cabin', wood: 30, coins: 0, blurb: 'A proper log cabin with a chimney and windows.' },
  { name: 'Cottage', wood: 60, coins: 50, blurb: 'Two floors, a porch, and room for everything.' },
];

// Extras: built with wood/shells, or bought from Marigold then placed.
export const EXTRAS = {
  flowers: { name: 'Flower Boxes', cost: { wood: 4 }, min: 1, blurb: 'Boxes of flowers under the windows.' },
  path: { name: 'Shell Path', cost: { shells: 6 }, min: 0, blurb: 'Stepping stones edged with shells.' },
  bench: { name: 'Bench', cost: { wood: 5 }, min: 0, blurb: 'Somewhere to watch the boats.' },
  mailbox: { name: 'Mailbox', cost: { wood: 4 }, min: 0, blurb: 'Painted to match your door.' },
  garden: { name: 'Veggie Patch', cost: { wood: 6 }, min: 0, blurb: 'Neat rows of little sprouts.' },
  fence: { name: 'Picket Fence', cost: { wood: 10 }, min: 1, blurb: 'Painted in your trim colour.' },
  lantern: { name: 'Porch Lantern', shop: 25, min: 1, blurb: 'Glows at night. Sold by Marigold.' },
  flag: { name: 'Flagpole', shop: 18, min: 0, blurb: 'Flies your roof colour. Sold by Marigold.' },
  chime: { name: 'Wind Chime', shop: 15, min: 1, blurb: 'Tinkles in the breeze. Sold by Marigold.' },
  vane: { name: 'Weathervane', shop: 30, min: 2, blurb: 'A little copper fish on the roof. Sold by Marigold.' },
};

function gable(w, d, h, o, wallMat, roofMat) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - o, 0); s.lineTo(w / 2 + o, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d + 2 * o, bevelEnabled: false });
  g.translate(0, 0, -(d + 2 * o) / 2);
  return mesh(g, [wallMat, roofMat]);
}

export class Cabin {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.set(CABIN.x, heightAt(CABIN.x, CABIN.z), CABIN.z);
    this.root.rotation.y = 0.35;
    scene.add(this.root);
    this.mats = {
      walls: new THREE.MeshLambertMaterial({ flatShading: true }),
      roof: new THREE.MeshLambertMaterial({ flatShading: true }),
      door: new THREE.MeshLambertMaterial({ flatShading: true }),
      trim: new THREE.MeshLambertMaterial({ flatShading: true }),
      glow: new THREE.MeshLambertMaterial({ color: '#cfe8f0', emissive: '#ffc96a', emissiveIntensity: 0 }),
    };
    this.house = null;
    this.extras = new THREE.Group();
    this.root.add(this.extras);
    this.lanternLight = null;
    this.flag = null;
    this.smoke = null;
  }

  // world position of the front door (where the player talks to the house)
  doorWorld() {
    const v = new THREE.Vector3(0, 0, this.depth / 2 + 1.0);
    return this.root.localToWorld(v);
  }

  build(s) {
    const m = this.mats;
    m.walls.color.set(PAINTS[s.paint.walls].hex);
    m.roof.color.set(PAINTS[s.paint.roof].hex);
    m.door.color.set(PAINTS[s.paint.door].hex);
    m.trim.color.set(PAINTS[s.paint.trim].hex);
    if (this.house) this.root.remove(this.house);
    this.root.remove(this.extras);
    this.extras = new THREE.Group();
    this.root.add(this.extras);
    const h = new THREE.Group();
    this.house = h;
    this.root.add(h);
    this.windows = [];
    const stage = s.stage;
    let w, d, wallH;
    const win = (x, y, z, ry = 0) => {
      const f = mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), m.trim); f.position.set(x, y, z); f.rotation.y = ry;
      const pane = mesh(new THREE.BoxGeometry(0.62, 0.62, 0.12), m.glow, false); f.add(pane);
      const bar = mesh(new THREE.BoxGeometry(0.06, 0.62, 0.14), m.trim, false); f.add(bar);
      const bar2 = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.14), m.trim, false); f.add(bar2);
      h.add(f);
      this.windows.push(f);
      return f;
    };
    const door = (z, y0 = 0) => {
      const dd = mesh(new THREE.BoxGeometry(0.85, 1.55, 0.12), m.door); dd.position.set(0, y0 + 0.78, z); h.add(dd);
      const frame = mesh(new THREE.BoxGeometry(1.0, 1.68, 0.08), m.trim); frame.position.set(0, y0 + 0.82, z - 0.03); h.add(frame);
      const knob = mesh(new THREE.IcosahedronGeometry(0.05, 0), mat('#f2c14e'), false); knob.position.set(0.28, y0 + 0.75, z + 0.08); h.add(knob);
    };
    if (stage === 0) {
      w = 2.6; d = 2.8; wallH = 0;
      const canvas = gable(2.6, 2.8, 1.9, 0, mat('#efe2c4'), mat('#e6d3ac'));
      h.add(canvas);
      const flap = mesh(new THREE.BoxGeometry(0.9, 1.1, 0.05), mat('#d9c39a')); flap.position.set(0, 0.55, 1.42); h.add(flap);
      const stripe = mesh(new THREE.BoxGeometry(0.2, 0.02, 2.9), mat('#e0523f')); stripe.position.y = 1.88; h.add(stripe);
      const roll = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 8), mat('#5b8c5a')); roll.rotation.z = Math.PI / 2; roll.position.set(1.6, 0.22, 1.2); h.add(roll);
    } else if (stage === 1) {
      w = 3.2; d = 3.0; wallH = 2.2;
      const walls = mesh(new THREE.BoxGeometry(w, wallH, d), m.walls); walls.position.y = wallH / 2; h.add(walls);
      for (let y = 0.4; y < wallH; y += 0.45) {
        const plank = mesh(new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04), mat('#000000', { transparent: true, opacity: 0.12 }), false);
        plank.position.y = y; h.add(plank);
      }
      const roof = mesh(new THREE.BoxGeometry(w + 0.7, 0.18, d + 0.7), m.roof); roof.position.y = wallH + 0.35; roof.rotation.x = -0.22; h.add(roof);
      const back = mesh(new THREE.BoxGeometry(w, 0.7, 0.1), m.walls); back.position.set(0, wallH + 0.3, -d / 2 + 0.05); h.add(back);
      door(d / 2 + 0.03);
      win(1.0, 1.3, d / 2 + 0.03);
      const step = mesh(new THREE.BoxGeometry(1.1, 0.15, 0.5), mat('#9a968f')); step.position.set(0, 0.07, d / 2 + 0.3); h.add(step);
    } else if (stage === 2) {
      w = 5.0; d = 4.0; wallH = 2.6;
      const walls = mesh(new THREE.BoxGeometry(w, wallH, d), m.walls); walls.position.y = wallH / 2; h.add(walls);
      for (let y = 0.22; y < wallH; y += 0.32) { // log courses + log ends at the corners
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const end = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 7), mat('#d9b07a'), false);
          end.rotation.x = Math.PI / 2; end.position.set(sx * (w / 2 + 0.05), y, sz * (d / 2 - 0.05)); h.add(end);
        }
        const groove = mesh(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), mat('#000000', { transparent: true, opacity: 0.14 }), false);
        groove.position.y = y + 0.16; h.add(groove);
      }
      const roof = gable(w, d, 1.7, 0.4, m.walls, m.roof); roof.position.y = wallH; h.add(roof);
      const chim = mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), mat('#9a8f86')); chim.position.set(-1.4, wallH + 1.2, -0.6); h.add(chim);
      const chimTop = mesh(new THREE.BoxGeometry(0.72, 0.15, 0.72), mat('#7a7068')); chimTop.position.y = 0.8; chim.add(chimTop);
      this.chimney = new THREE.Vector3(-1.4, wallH + 2.1, -0.6);
      door(d / 2 + 0.03);
      win(-1.5, 1.4, d / 2 + 0.03); win(1.5, 1.4, d / 2 + 0.03);
      win(w / 2 + 0.03, 1.4, 0, Math.PI / 2); win(-w / 2 - 0.03, 1.4, 0, Math.PI / 2);
      const porch = mesh(new THREE.BoxGeometry(2.2, 0.2, 1.0), mat('#a8764c')); porch.position.set(0, 0.1, d / 2 + 0.5); h.add(porch);
    } else {
      w = 6.0; d = 5.0; wallH = 3.3;
      const walls = mesh(new THREE.BoxGeometry(w, wallH, d), m.walls); walls.position.y = wallH / 2; h.add(walls);
      const sill = mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), m.trim, false); sill.position.y = 1.75; h.add(sill);
      const base = mesh(new THREE.BoxGeometry(w + 0.12, 0.4, d + 0.12), mat('#9a968f')); base.position.y = 0.2; h.add(base);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const c = mesh(new THREE.BoxGeometry(0.16, wallH, 0.16), m.trim); c.position.set(sx * w / 2, wallH / 2, sz * d / 2); h.add(c);
      }
      const roof = gable(w, d, 2.4, 0.45, m.walls, m.roof); roof.position.y = wallH; h.add(roof);
      // dormer
      const dorm = mesh(new THREE.BoxGeometry(1.4, 1.1, 1.2), m.walls); dorm.position.set(0, wallH + 0.9, d / 2 - 0.5); h.add(dorm);
      const dRoof = gable(1.4, 1.2, 0.6, 0.15, m.walls, m.roof); dRoof.position.set(0, wallH + 1.45, d / 2 - 0.5); h.add(dRoof);
      win(0, wallH + 0.9, d / 2 + 0.12);
      const chim = mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), mat('#b06a52')); chim.position.set(-1.9, wallH + 1.6, -0.9); h.add(chim);
      const chimTop = mesh(new THREE.BoxGeometry(0.82, 0.15, 0.82), mat('#7a7068')); chimTop.position.y = 1.1; chim.add(chimTop);
      this.chimney = new THREE.Vector3(-1.9, wallH + 2.8, -0.9);
      door(d / 2 + 0.03, 0.2);
      win(-1.8, 1.2, d / 2 + 0.03); win(1.8, 1.2, d / 2 + 0.03);
      win(-1.8, 2.6, d / 2 + 0.03); win(1.8, 2.6, d / 2 + 0.03);
      win(w / 2 + 0.03, 1.3, 0, Math.PI / 2); win(-w / 2 - 0.03, 1.3, 0, Math.PI / 2);
      // porch with posts and a little roof
      const deck = mesh(new THREE.BoxGeometry(w, 0.22, 1.7), mat('#a8764c')); deck.position.set(0, 0.11, d / 2 + 0.85); h.add(deck);
      for (const x of [-w / 2 + 0.2, -1, 1, w / 2 - 0.2]) {
        const post = mesh(new THREE.BoxGeometry(0.16, 2.0, 0.16), m.trim); post.position.set(x, 1.1, d / 2 + 1.55); h.add(post);
      }
      const pRoof = mesh(new THREE.BoxGeometry(w + 0.3, 0.14, 1.9), m.roof); pRoof.position.set(0, 2.2, d / 2 + 0.9); pRoof.rotation.x = 0.18; h.add(pRoof);
    }
    if (stage < 2) this.chimney = null;
    this.width = w; this.depth = d; this.wallH = wallH;
    h.scale.setScalar(1);

    // ---- extras
    const ex = this.extras, show = s.shown || {};
    const front = d / 2 + (stage === 3 ? 1.7 : 1.0);
    this.lanternLight = null; this.flag = null; this.chime = null; this.vane = null;
    if (show.flowers && stage >= 1) {
      for (const f of this.windows) {
        if (f.position.y > 2.0 && stage < 3) continue;
        const bx = mesh(new THREE.BoxGeometry(0.9, 0.22, 0.28), m.trim);
        bx.position.copy(f.position); bx.rotation.y = f.rotation.y;
        bx.translateY(-0.52); bx.translateZ(0.16);
        const cols = ['#ff7aa8', '#ffd75e', '#ffffff', '#b9a6ff'];
        for (let k = 0; k < 4; k++) {
          const fl = mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(cols[k]), false);
          fl.position.set(-0.3 + k * 0.2, 0.17, 0);
          bx.add(fl);
        }
        const leaf = mesh(new THREE.BoxGeometry(0.85, 0.08, 0.22), mat('#5aae55'), false); leaf.position.y = 0.12; bx.add(leaf);
        ex.add(bx);
      }
    }
    if (show.path) {
      for (let k = 0; k < 5; k++) {
        const st = mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.1, 7), mat('#c9c2b6'), false);
        st.position.set((k % 2 ? 0.2 : -0.2), 0.04, front + 0.6 + k * 1.0);
        ex.add(st);
        for (const sx of [-1, 1]) {
          const sh = mesh(new THREE.ConeGeometry(0.07, 0.18, 5), mat('#fbe3c6'), false);
          sh.rotation.z = Math.PI / 2; sh.position.set(st.position.x + sx * 0.75, 0.05, st.position.z);
          ex.add(sh);
        }
      }
    }
    if (show.bench) {
      const b = new THREE.Group();
      const seat = mesh(new THREE.BoxGeometry(1.6, 0.1, 0.45), m.trim); seat.position.y = 0.45; b.add(seat);
      const backr = mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), m.trim); backr.position.set(0, 0.75, -0.2); b.add(backr);
      for (const sx of [-0.65, 0.65]) { const l = mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), mat('#7a5236')); l.position.set(sx, 0.22, 0); b.add(l); }
      b.position.set(w / 2 + 1.4, 0, front - 0.6); b.rotation.y = -0.5;
      ex.add(b);
    }
    if (show.mailbox) {
      const mb = new THREE.Group();
      const post = mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), mat('#7a5236')); post.position.y = 0.5; mb.add(post);
      const bx = mesh(new THREE.BoxGeometry(0.32, 0.3, 0.55), m.door); bx.position.y = 1.1; mb.add(bx);
      const flagm = mesh(new THREE.BoxGeometry(0.03, 0.22, 0.12), mat('#e0523f'), false); flagm.position.set(0.18, 1.2, 0.1); mb.add(flagm);
      mb.position.set(-1.8, 0, front + 3.2);
      ex.add(mb);
    }
    if (show.garden) {
      const gd = new THREE.Group();
      const soil = mesh(new THREE.BoxGeometry(2.4, 0.2, 1.6), mat('#7a5236')); soil.position.y = 0.1; gd.add(soil);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const sp = mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat(r === 1 ? '#ff9a3c' : '#5aae55'), false);
        sp.position.set(-0.9 + c * 0.6, 0.35, -0.5 + r * 0.5); gd.add(sp);
      }
      gd.position.set(-w / 2 - 2.0, 0, 0.6);
      ex.add(gd);
    }
    if (show.fence && stage >= 1) {
      const fw = w + 5, fz = front + 3.8;
      for (let x = -fw / 2; x <= fw / 2 + 0.01; x += 0.45) {
        if (Math.abs(x) < 0.8) continue;
        const pk = mesh(new THREE.BoxGeometry(0.12, 0.75, 0.06), m.trim); pk.position.set(x, 0.38, fz); ex.add(pk);
        const tip = mesh(new THREE.ConeGeometry(0.085, 0.12, 4), m.trim, false); tip.position.set(x, 0.81, fz); tip.rotation.y = Math.PI / 4; ex.add(tip);
      }
      for (const y of [0.25, 0.55]) for (const sx of [-1, 1]) {
        const rail = mesh(new THREE.BoxGeometry(fw / 2 - 0.8, 0.07, 0.05), m.trim, false);
        rail.position.set(sx * (fw / 4 + 0.4), y, fz - 0.05); ex.add(rail);
      }
    }
    if (show.lantern && stage >= 1) {
      const ln = new THREE.Group();
      const arm = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), mat('#3e3a3a'), false); arm.position.z = 0.2; ln.add(arm);
      const cage = mesh(new THREE.BoxGeometry(0.24, 0.32, 0.24), new THREE.MeshLambertMaterial({ color: '#fff0c0', emissive: '#ffc04a', emissiveIntensity: 0 }), false);
      cage.position.set(0, -0.2, 0.4); ln.add(cage);
      ln.position.set(0.75, Math.min(wallH, 2.0) + (stage === 3 ? 0.2 : 0), d / 2);
      ex.add(ln);
      this.lanternMesh = cage;
      const pl = new THREE.PointLight('#ffc77a', 0, 9, 1.5);
      pl.position.set(0.75, Math.min(wallH, 2.0) - 0.3, d / 2 + 0.6);
      ex.add(pl);
      this.lanternLight = pl;
    }
    if (show.flag) {
      const fp = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.2, 6), mat('#f4efe6')); pole.position.y = 2.1; fp.add(pole);
      const ball = mesh(new THREE.IcosahedronGeometry(0.08, 0), mat('#f2c14e'), false); ball.position.y = 4.25; fp.add(ball);
      const fl = mesh(new THREE.PlaneGeometry(1.1, 0.7, 6, 1), new THREE.MeshLambertMaterial({ color: PAINTS[s.paint.roof].hex, side: THREE.DoubleSide }), false);
      fl.geometry.translate(0.55, 0, 0);
      fl.position.set(0.04, 3.75, 0); fp.add(fl);
      fp.position.set(w / 2 + 1.6, 0, -d / 2 + 0.5);
      ex.add(fp);
      this.flag = fl;
      this.flagBase = fl.geometry.attributes.position.array.slice();
    }
    if (show.chime && stage >= 1) {
      const ch = new THREE.Group();
      const top = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8), m.trim, false); ch.add(top);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const tube = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3 + k * 0.05, 5), mat('#c8d4dc'), false);
        tube.position.set(Math.cos(a) * 0.11, -0.25 - k * 0.025, Math.sin(a) * 0.11);
        ch.add(tube);
      }
      ch.position.set(-0.9, Math.min(wallH, 2.0) + 0.1, d / 2 + 0.35);
      ex.add(ch);
      this.chime = ch;
    }
    if (show.vane && stage >= 2) {
      const vn = new THREE.Group();
      const rod = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), mat('#b87333'), false); rod.position.y = 0.4; vn.add(rod);
      const fish = mesh(new THREE.IcosahedronGeometry(0.15, 0), mat('#c98a3c'), false); fish.scale.set(2.6, 0.7, 0.3); fish.position.y = 0.8; vn.add(fish);
      const tail = mesh(new THREE.ConeGeometry(0.12, 0.2, 3), mat('#c98a3c'), false); tail.rotation.z = Math.PI / 2; tail.position.set(-0.45, 0.8, 0); vn.add(tail);
      vn.position.set(0.8, wallH + (stage === 3 ? 2.35 : 1.65), 0);
      ex.add(vn);
      this.vane = vn;
    }
    this.root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  }

  // footprint for player collision, in world space (centre + radius list)
  blockers() {
    const out = [];
    const r = Math.max(this.width, this.depth) / 2;
    const n = this.width > 4 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3(n === 1 ? 0 : (k - 1) * (this.width / 3), 0, 0);
      this.root.localToWorld(v);
      out.push({ x: v.x, z: v.z, r: n === 1 ? r * 0.95 : Math.max(this.width / 3, this.depth / 2) * 0.92 });
    }
    return out;
  }

  update(t, night) {
    this.mats.glow.emissiveIntensity = night * 1.2;
    if (this.lanternLight) {
      this.lanternLight.intensity = night * 6;
      this.lanternMesh.material.emissiveIntensity = night * 1.5;
    }
    if (this.flag) {
      const p = this.flag.geometry.attributes.position, b = this.flagBase;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];
        p.setZ(i, Math.sin(x * 4 - t * 6) * 0.12 * x);
      }
      p.needsUpdate = true;
    }
    if (this.chime) this.chime.rotation.z = Math.sin(t * 2.3) * 0.08;
    if (this.vane) this.vane.rotation.y = Math.sin(t * 0.3) * 0.6 + 0.4;
  }
}
