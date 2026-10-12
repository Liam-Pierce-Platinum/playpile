// SUMO SLAM look: a glossy toy world. Pastel sky, a cloud sea far below, a
// floating clay ring with a straw edge, paper lanterns, and round shiny sumo
// blobs with squash-and-stretch. Everything on the ring sits inside `tilt`,
// a group that leans with the ring so the sim's flat XZ coordinates map
// straight onto it.
import * as THREE from 'three';
import { RING_R0 } from './sim.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function skyTexture() {
  return canvasTex(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5ec8ff');
    gr.addColorStop(0.45, '#a9e2ff');
    gr.addColorStop(0.72, '#ffd9ec');
    gr.addColorStop(1, '#ffe9c9');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function clayTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    const gr = g.createRadialGradient(cx, cy, 50, cx, cy, w / 2);
    gr.addColorStop(0, '#f0c98a'); gr.addColorStop(0.85, '#e3b06c'); gr.addColorStop(1, '#cf9656');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // soft raked-sand grain
    for (let i = 0; i < 9000; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * w * 0.5;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,210,0.18)' : 'rgba(170,120,70,0.10)';
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2);
    }
    // white rings and the two start lines
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, w * 0.455, 0, TAU); g.stroke();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(cx, cy, w * 0.2, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    const rr = (x, y, ww, hh) => { g.beginPath(); g.roundRect(x, y, ww, hh, 6); g.fill(); };
    rr(cx - 70, cy - 70, 140, 14); rr(cx - 70, cy + 56, 140, 14);
  });
}

function spriteTex(kind) {
  return canvasTex(128, 128, (g, w, h) => {
    const c = w / 2;
    if (kind === 'puff') {
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } else if (kind === 'star') {
      g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 22 : 58, a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
    } else if (kind === 'ring') {
      g.strokeStyle = '#fff'; g.lineWidth = 10;
      g.beginPath(); g.arc(c, c, 52, 0, TAU); g.stroke();
    } else if (kind === 'confetti') {
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(28, 44, 72, 40, 8); g.fill();
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, 56, 0, TAU); g.fill();
    }
  });
}

// Low-cost environment map so the glossy materials have something to reflect.
function makeEnv(renderer) {
  const es = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const cols = [];
  const top = new THREE.Color('#7fd0ff'), mid = new THREE.Color('#fff1f7'), bot = new THREE.Color('#ffd7a8');
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) });
  for (const [x, y, z, s] of [[20, 30, 10, 12], [-25, 20, -15, 8], [0, 15, -30, 10]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 8), lm); m.position.set(x, y, z); es.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0.03);
  pm.dispose();
  return rt.texture;
}

const HATS = { knot: 1, band: 1, crown: 1 };

class Blob {
  constructor(view, w) {
    this.id = w.id;
    const root = (this.root = new THREE.Group());
    const sq = (this.sq = new THREE.Group());
    root.add(sq);
    const col = new THREE.Color(w.color);
    this.baseColor = col.clone();
    this.mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0 });
    const skin = col.clone().offsetHSL(0, -0.05, -0.08);
    this.limbMat = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const V = view.geo;
    const body = new THREE.Mesh(V.sphere, this.mat);
    body.scale.set(1, 0.92, 1); body.position.y = 0.92; body.castShadow = true;
    sq.add(body);
    this.body = body;
    // belly highlight patch
    const belly = new THREE.Mesh(V.sphere, new THREE.MeshPhysicalMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.35), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
    belly.scale.set(0.5, 0.36, 0.28); belly.position.set(0, 0.66, 0.77);
    sq.add(belly);
    // mawashi belt + front knot
    const belt = new THREE.Mesh(V.belt, view.mats.belt);
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.52; belt.castShadow = true;
    sq.add(belt);
    const knot = new THREE.Mesh(V.small, view.mats.belt);
    knot.scale.set(0.2, 0.16, 0.12); knot.position.set(0, 0.5, 0.95);
    sq.add(knot);
    // face
    const face = (this.face = new THREE.Group());
    sq.add(face);
    this.pupils = [];
    this.brows = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(V.small, view.mats.eye);
      eye.scale.setScalar(0.17); eye.position.set(0.3 * s, 1.2, 0.8);
      face.add(eye);
      const pup = new THREE.Mesh(V.small, view.mats.pupil);
      pup.scale.setScalar(0.095); pup.position.set(0.3 * s, 1.2, 0.95);
      face.add(pup); this.pupils.push(pup);
      const brow = new THREE.Mesh(V.capsule, view.mats.hair);
      brow.rotation.z = Math.PI / 2; brow.position.set(0.3 * s, 1.43, 0.86); brow.scale.set(1, 1, 1);
      face.add(brow); this.brows.push(brow);
      const cheek = new THREE.Mesh(V.small, view.mats.cheek);
      cheek.scale.set(0.13, 0.08, 0.05); cheek.position.set(0.55 * s, 1.0, 0.78);
      face.add(cheek);
    }
    const mouth = (this.mouth = new THREE.Mesh(V.small, view.mats.pupil));
    mouth.scale.set(0.11, 0.045, 0.05); mouth.position.set(0, 1.0, 0.94);
    face.add(mouth);
    // hat / hair
    this.hatGroup = new THREE.Group();
    sq.add(this.hatGroup);
    this.setHat(view, w.hat);
    // arms on pivots (shoulders), feet
    this.arms = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(0.82 * s, 0.98, 0.05);
      const hand = new THREE.Mesh(V.sphere, this.limbMat);
      hand.scale.setScalar(0.3); hand.position.set(0.22 * s, -0.18, 0.12); hand.castShadow = true;
      piv.add(hand);
      sq.add(piv);
      this.arms.push(piv);
    }
    this.feet = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(V.sphere, this.limbMat);
      f.scale.set(0.3, 0.15, 0.38); f.position.set(0.45 * s, 0.1, 0.28);
      root.add(f); this.feet.push(f);
    }
    // power visuals
    this.spring = new THREE.Mesh(V.coil, view.mats.spring);
    this.spring.position.set(0, 1.95, -0.05); this.spring.scale.setScalar(0.55); this.spring.visible = false;
    sq.add(this.spring);
    // charge ring + aim arrow on the floor (not squashed)
    this.chargeRing = new THREE.Mesh(V.chargeRing, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    this.chargeRing.rotation.x = -Math.PI / 2; this.chargeRing.position.y = 0.04; this.chargeRing.visible = false;
    root.add(this.chargeRing);
    this.arrow = new THREE.Mesh(V.arrow, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.arrow.rotation.x = -Math.PI / 2; this.arrow.position.y = 0.05; this.arrow.visible = false;
    root.add(this.arrow);
    // marker over human players
    this.marker = null;
    if (w.human !== null) {
      this.marker = new THREE.Mesh(V.marker, new THREE.MeshPhysicalMaterial({ color: w.human === 0 ? '#ffffff' : '#ffe14d', emissive: w.human === 0 ? '#ffffff' : '#ffd000', emissiveIntensity: 0.35, roughness: 0.2, clearcoat: 1 }));
      this.marker.rotation.x = Math.PI;
      root.add(this.marker);
      // bright ground ring so you can always find yourself in a scrum
      this.youRing = new THREE.Mesh(V.youRing, new THREE.MeshBasicMaterial({ color: w.human === 0 ? '#ffe14d' : '#7fd6ff', transparent: true, opacity: 0.9, depthWrite: false }));
      this.youRing.rotation.x = -Math.PI / 2; this.youRing.position.y = 0.03; this.youRing.renderOrder = 2;
      root.add(this.youRing);
    }
    // spring state for squash
    this.s = 0; this.sv = 0; this.flash = 0; this.spin = 0; this.walk = 0; this.lean = 0; this.leanSide = 0;
    this.shock = 0;
  }
  setHat(view, hat) {
    const g = this.hatGroup, V = view.geo;
    g.clear();
    if (hat === 'crown') {
      const band = new THREE.Mesh(V.crown, view.mats.gold);
      band.position.y = 1.72; g.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const b = new THREE.Mesh(V.small, view.mats.gold);
        b.scale.setScalar(0.09); b.position.set(Math.cos(a) * 0.36, 1.98, Math.sin(a) * 0.36); g.add(b);
      }
      const gem = new THREE.Mesh(V.small, view.mats.gem);
      gem.scale.setScalar(0.08); gem.position.set(0, 1.82, 0.42); g.add(gem);
      return;
    }
    // topknot: a glossy black bun folded forward
    const base = new THREE.Mesh(V.sphere, view.mats.hair);
    // a hair cap hugging the crown and back of the head (its front edge hides inside the
    // body), so the bun reads as hair and not as a pot-lid handle
    base.scale.set(0.62, 0.36, 0.62); base.position.set(0, 1.5, -0.28); g.add(base);
    const bun = new THREE.Mesh(V.small, view.mats.hair);
    bun.scale.set(0.22, 0.08, 0.3); bun.position.set(0, 1.92, 0.08); bun.rotation.x = 0.18; g.add(bun);
    if (hat === 'band') {
      const band = new THREE.Mesh(V.headband, view.mats.band);
      band.rotation.x = Math.PI / 2; band.position.y = 1.45; g.add(band);
    }
  }
}

export class View {
  constructor(canvas) {
    const COARSE = matchMedia('(pointer: coarse)').matches;
    this.coarse = COARSE;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.95;
    const sc = (this.scene = new THREE.Scene());
    sc.background = skyTexture();
    sc.fog = new THREE.Fog('#a8e0ff', 70, 190);
    sc.environment = makeEnv(r);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);
    const hemi = new THREE.HemisphereLight('#dff4ff', '#e0a890', 0.75);
    sc.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff1dc', 2.1));
    sun.position.set(-8, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
    const sc2 = sun.shadow.camera; sc2.left = -14; sc2.right = 14; sc2.top = 14; sc2.bottom = -14; sc2.near = 5; sc2.far = 60;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5;
    sc.add(sun, sun.target);

    this.geo = {
      sphere: new THREE.SphereGeometry(1, 36, 24),
      small: new THREE.SphereGeometry(1, 16, 12),
      belt: new THREE.TorusGeometry(0.9, 0.15, 16, 56),
      headband: new THREE.TorusGeometry(0.81, 0.075, 12, 56),
      crown: new THREE.CylinderGeometry(0.42, 0.38, 0.32, 40, 1, true),
      capsule: new THREE.CapsuleGeometry(0.045, 0.2, 6, 12),
      marker: new THREE.ConeGeometry(0.28, 0.5, 24),
      chargeRing: new THREE.RingGeometry(1.25, 1.45, 64, 1, 0, TAU),
      youRing: new THREE.RingGeometry(1.08, 1.3, 48, 1, 0, TAU),
      arrow: (() => {
        const s = new THREE.Shape();
        s.moveTo(-0.28, 0); s.lineTo(0.28, 0); s.lineTo(0.28, 1.3); s.lineTo(0.62, 1.3); s.lineTo(0, 2.2); s.lineTo(-0.62, 1.3); s.lineTo(-0.28, 1.3); s.closePath();
        const g = new THREE.ShapeGeometry(s); g.rotateZ(0); return g;
      })(),
      coil: (() => {
        const pts = [];
        for (let i = 0; i <= 120; i++) { const t = i / 120; pts.push(new THREE.Vector3(Math.cos(t * TAU * 4) * 0.45, t * 0.9, Math.sin(t * TAU * 4) * 0.45)); }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.07, 10, false);
      })(),
    };
    this.mats = {
      belt: new THREE.MeshPhysicalMaterial({ color: '#2b2f5e', roughness: 0.45, clearcoat: 0.6 }),
      eye: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1 }),
      pupil: new THREE.MeshPhysicalMaterial({ color: '#15151f', roughness: 0.1, clearcoat: 1 }),
      hair: new THREE.MeshPhysicalMaterial({ color: '#18161f', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
      cheek: new THREE.MeshPhysicalMaterial({ color: '#ff8fb0', roughness: 0.5, transparent: true, opacity: 0.85 }),
      gold: new THREE.MeshPhysicalMaterial({ color: '#ffc531', metalness: 1, roughness: 0.22, clearcoat: 1, side: THREE.DoubleSide }),
      gem: new THREE.MeshPhysicalMaterial({ color: '#ff2f6a', roughness: 0.05, clearcoat: 1 }),
      band: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4 }),
      spring: new THREE.MeshPhysicalMaterial({ color: '#38e07b', metalness: 0.3, roughness: 0.2, clearcoat: 1 }),
    };
    this.tex = { puff: spriteTex('puff'), star: spriteTex('star'), ring: spriteTex('ring'), confetti: spriteTex('confetti'), dot: spriteTex('dot') };

    this.tilt = new THREE.Group();
    sc.add(this.tilt);
    this.buildRing();
    this.buildWorld();
    this.blobs = [];
    this.itemMeshes = new Map();
    this.parts = [];
    this.chunks = [];
    this.camPos = new THREE.Vector3(0, 22, 18);
    this.camLook = new THREE.Vector3();
    this.shakeAmt = 0;
    this.time = 0;
    this.lastR = RING_R0;
    this.crumbleAcc = 0;
    this.v3 = new THREE.Vector3();
  }

  buildRing() {
    const g = (this.ringG = new THREE.Group());
    this.tilt.add(g);
    const clay = new THREE.MeshPhysicalMaterial({ map: clayTexture(), roughness: 0.75, clearcoat: 0.15 });
    const lacquer = new THREE.MeshPhysicalMaterial({ color: '#c8323c', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 96, 1), [lacquer, clay, lacquer]);
    top.position.y = -0.25; top.receiveShadow = true;
    g.add(top);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.12, 96, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffd166', metalness: 0.9, roughness: 0.25 }));
    trim.position.y = -0.52; g.add(trim);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 0.55, 1.6, 96, 1), new THREE.MeshPhysicalMaterial({ color: '#8e5bd6', roughness: 0.35, clearcoat: 0.8 }));
    base.position.y = -1.38; g.add(base);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 64, 1), new THREE.MeshPhysicalMaterial({ color: '#6c4bb8', roughness: 0.5, clearcoat: 0.4 }));
    rock.rotation.x = Math.PI; rock.position.y = -2.18 - 2.2; rock.scale.y = 4.4; g.add(rock);
    this.ringParts = [top, trim, base, rock];
    this.tawaraMat = new THREE.MeshPhysicalMaterial({ color: '#e7cf86', roughness: 0.55, clearcoat: 0.3 });
    this.tawara = new THREE.Mesh(new THREE.TorusGeometry(RING_R0 - 0.18, 0.2, 14, 120), this.tawaraMat);
    this.tawara.rotation.x = Math.PI / 2; this.tawara.position.y = 0.05; this.tawara.castShadow = true; this.tawara.receiveShadow = true;
    this.tilt.add(this.tawara);
    this.tawaraR = RING_R0;
    this.danger = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0, depthWrite: false }));
    this.danger.rotation.x = -Math.PI / 2; this.danger.position.y = 0.012;
    this.tilt.add(this.danger);
    this.setRing(RING_R0);
  }

  setRing(R) {
    const s = Math.max(0.001, R);
    this.ringG.scale.set(s, 1, s);
    this.ringG.visible = R > 0.05;
    if (Math.abs(this.tawaraR - R) > 0.03) {
      this.tawara.geometry.dispose();
      this.tawara.geometry = new THREE.TorusGeometry(Math.max(0.05, R - 0.18), 0.2, 14, 120);
      this.tawaraR = R;
    }
    this.tawara.visible = R > 0.4;
    this.danger.scale.set(s, s, 1);
  }

  buildWorld() {
    // cloud sea below
    const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#eaf6ff', emissiveIntensity: 0.4 });
    const cg = this.geo.sphere;
    this.clouds = new THREE.Group();
    // a sea of puffy clouds well below the ring; fog fades it into the horizon
    const puffs = [];
    for (let i = 0; i < 70; i++) {
      const a = rand(0, TAU), d = 14 + Math.sqrt(Math.random()) * 110;
      const cx = Math.cos(a) * d, cy = rand(-46, -38), cz = Math.sin(a) * d;
      const n = 3 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) { const s = rand(4, 8); puffs.push([cx + rand(-8, 8), cy + rand(-1, 2), cz + rand(-6, 6), s * 1.3, s * 0.6, s]); }
    }
    const cloudGeo = new THREE.SphereGeometry(1, 20, 12);
    const inst = new THREE.InstancedMesh(cloudGeo, cm, puffs.length);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
    puffs.forEach((p, i) => { mm.compose(pp.set(p[0], p[1], p[2]), qq, ss.set(p[3], p[4], p[5])); inst.setMatrixAt(i, mm); });
    inst.frustumCulled = false;
    this.clouds.add(inst);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(260, 48), new THREE.MeshBasicMaterial({ color: '#9cdcff' }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -44;
    this.clouds.add(sea);
    this.scene.add(this.clouds);
    // floating paper lanterns: red body, gold caps
    this.lanterns = [];
    const lm = new THREE.MeshPhysicalMaterial({ color: '#ff3d3d', emissive: '#ff5a2a', emissiveIntensity: 0.55, roughness: 0.45, clearcoat: 0.5 });
    const capM = new THREE.MeshPhysicalMaterial({ color: '#2a1d3a', roughness: 0.3, clearcoat: 1 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.4;
      const g = new THREE.Group();
      const body = new THREE.Mesh(cg, lm); body.scale.set(0.85, 1.05, 0.85); g.add(body);
      for (const y of [1.0, -1.0]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 24), capM); c.position.y = y; g.add(c); }
      const tas = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.7, 12), capM); tas.position.y = -1.45; g.add(tas);
      const d = 15.5 + (i % 2) * 3;
      g.position.set(Math.cos(a) * d, -1 + (i % 3) * 1.4, Math.sin(a) * d);
      g.userData.b = rand(0, TAU);
      this.scene.add(g);
      this.lanterns.push(g);
    }
  }

  setMatch(sim) {
    for (const b of this.blobs) this.tilt.remove(b.root);
    this.blobs = sim.ws.map((w) => { const b = new Blob(this, w); this.tilt.add(b.root); return b; });
    for (const m of this.itemMeshes.values()) this.tilt.remove(m);
    this.itemMeshes.clear();
  }

  makeItem(kind) {
    const g = new THREE.Group();
    const col = kind === 'giant' ? '#ffb020' : kind === 'heavy' ? '#8aa0c8' : '#38e07b';
    const bubble = new THREE.Mesh(this.geo.sphere, new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: 0.32, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    bubble.scale.setScalar(0.75);
    g.add(bubble);
    const inner = new THREE.Group();
    g.add(inner);
    if (kind === 'giant') {
      const m = new THREE.MeshPhysicalMaterial({ color: '#ffc531', metalness: 0.6, roughness: 0.2, clearcoat: 1 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 20), m); shaft.position.y = -0.12; inner.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.36, 28), m); head.position.y = 0.26; inner.add(head);
    } else if (kind === 'heavy') {
      const m = new THREE.MeshPhysicalMaterial({ color: '#3b4252', metalness: 0.9, roughness: 0.25 });
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.4, 28), m); w.position.y = -0.1; inner.add(w);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 10, 28), m); h.position.y = 0.2; inner.add(h);
    } else {
      const c = new THREE.Mesh(this.geo.coil, this.mats.spring); c.scale.setScalar(0.55); c.position.y = -0.25; inner.add(c);
    }
    const glow = new THREE.Mesh(this.geo.chargeRing, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.scale.setScalar(0.6);
    g.add(glow);
    g.userData = { inner, glow, bubble };
    return g;
  }

  // ---------- particles ----------
  spawn(o) {
    let p = this.parts.find((q) => !q.alive);
    if (!p) {
      if (this.parts.length > 260) return;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      p = { sp, alive: false };
      this.tilt.add(sp);
      this.parts.push(p);
    }
    const m = p.sp.material;
    m.map = this.tex[o.tex || 'puff']; m.color.set(o.color || '#ffffff'); m.opacity = 1; m.rotation = o.rot || 0; m.needsUpdate = true;
    p.sp.position.set(o.x, o.y, o.z);
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.g = o.g || 0;
    p.life = 0; p.max = o.life || 0.6; p.s0 = o.s0 ?? 0.5; p.s1 = o.s1 ?? 1.2; p.spin = o.spin || 0; p.drag = o.drag ?? 2;
    p.fade = o.fade ?? 1;
    p.alive = true; p.sp.visible = true;
    p.sp.scale.setScalar(p.s0);
  }

  burst(kind, x, y, z, power = 1, color) {
    if (kind === 'hit') {
      const n = Math.round(5 + 8 * power);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(3, 9) * (0.5 + power);
        this.spawn({ tex: 'star', color: i % 3 ? '#fff6a8' : '#ffffff', x, y: y + rand(0.6, 1.6), z, vx: Math.cos(a) * sp, vy: rand(2, 7), vz: Math.sin(a) * sp, g: -14, life: rand(0.35, 0.6), s0: rand(0.35, 0.6), s1: 0.1, spin: rand(-12, 12), drag: 3 });
      }
      this.spawn({ tex: 'ring', color: '#ffffff', x, y: y + 1, z, life: 0.28, s0: 0.6, s1: 3.5 + 3 * power });
      for (let i = 0; i < 4; i++) this.spawn({ tex: 'puff', color: '#fff3e6', x: x + rand(-0.4, 0.4), y: 0.4, z: z + rand(-0.4, 0.4), vx: rand(-2, 2), vy: rand(0.5, 2), vz: rand(-2, 2), life: 0.5, s0: 0.6, s1: 1.9 });
    } else if (kind === 'dust') {
      for (let i = 0; i < 4 + power * 6; i++) {
        this.spawn({ tex: 'puff', color: '#f5e2c4', x: x + rand(-0.5, 0.5), y: 0.25, z: z + rand(-0.5, 0.5), vx: rand(-2, 2), vy: rand(0.4, 1.8), vz: rand(-2, 2), life: rand(0.35, 0.6), s0: 0.5, s1: 1.5 + power });
      }
    } else if (kind === 'shock') {
      this.spawn({ tex: 'ring', color: '#9dffbf', x, y: 0.15, z, life: 0.45, s0: 1, s1: 11 });
      this.spawn({ tex: 'ring', color: '#ffffff', x, y: 0.3, z, life: 0.35, s0: 1, s1: 8 });
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        this.spawn({ tex: 'puff', color: '#f5e2c4', x: x + Math.cos(a), y: 0.3, z: z + Math.sin(a), vx: Math.cos(a) * 9, vy: rand(0.5, 2), vz: Math.sin(a) * 9, life: 0.55, s0: 0.7, s1: 1.8, drag: 4 });
      }
    } else if (kind === 'confetti') {
      const cols = ['#ff4d6d', '#ffd23f', '#3ec1ff', '#55e07f', '#b16cff', '#ffffff'];
      for (let i = 0; i < 70; i++) {
        this.spawn({ tex: 'confetti', color: cols[i % cols.length], x: x + rand(-1, 1), y: y + 2, z: z + rand(-1, 1), vx: rand(-7, 7), vy: rand(6, 14), vz: rand(-7, 7), g: -12, life: rand(1.2, 2), s0: 0.32, s1: 0.32, spin: rand(-10, 10), drag: 1.6, rot: rand(0, TAU), fade: 0.2 });
      }
    } else if (kind === 'pickup') {
      for (let i = 0; i < 16; i++) {
        const a = rand(0, TAU);
        this.spawn({ tex: 'dot', color, x, y: y + 1, z, vx: Math.cos(a) * 6, vy: rand(1, 6), vz: Math.sin(a) * 6, g: -6, life: 0.6, s0: 0.3, s1: 0.05, drag: 2 });
      }
      this.spawn({ tex: 'ring', color, x, y: y + 1, z, life: 0.4, s0: 0.5, s1: 5 });
    } else if (kind === 'splash') {
      for (let i = 0; i < 14; i++) {
        this.spawn({ tex: 'puff', color: '#ffffff', x: x + rand(-1, 1), y, z: z + rand(-1, 1), vx: rand(-3, 3), vy: rand(2, 6), vz: rand(-3, 3), g: -4, life: 0.9, s0: 1, s1: 3.5 });
      }
    } else if (kind === 'charge') {
      const a = rand(0, TAU);
      this.spawn({ tex: 'dot', color: color || '#ffffff', x: x + Math.cos(a) * 1.6, y: rand(0.2, 1.2), z: z + Math.sin(a) * 1.6, vx: -Math.cos(a) * 5, vy: 0.5, vz: -Math.sin(a) * 5, life: 0.3, s0: 0.22, s1: 0.05, drag: 0 });
    }
  }

  spawnChunk(R) {
    let c = this.chunks.find((q) => !q.alive);
    if (!c) {
      if (this.chunks.length > 50) return;
      const m = new THREE.Mesh(this.geo.sphere, new THREE.MeshPhysicalMaterial({ color: '#e5bf86', roughness: 0.7 }));
      m.castShadow = false;
      c = { m, alive: false };
      this.tilt.add(m);
      this.chunks.push(c);
    }
    const a = rand(0, TAU);
    c.m.position.set(Math.cos(a) * (R + 0.15), -0.2, Math.sin(a) * (R + 0.15));
    c.m.scale.set(rand(0.25, 0.5), rand(0.2, 0.35), rand(0.25, 0.5));
    c.m.material.color.set(Math.random() < 0.6 ? '#e5bf86' : '#c8323c');
    c.vx = Math.cos(a) * rand(0.5, 2); c.vz = Math.sin(a) * rand(0.5, 2); c.vy = rand(0, 2);
    c.rx = rand(-6, 6); c.ry = rand(-6, 6); c.life = 0;
    c.alive = true; c.m.visible = true;
  }

  // ---------- per-frame ----------
  update(sim, dt, rdt) {
    this.time += rdt;
    const T = this.time;
    // ring
    this.tilt.rotation.x = sim.tiltX;
    this.tilt.rotation.z = sim.tiltZ;
    const R = sim.R;
    if (R < this.lastR) {
      this.crumbleAcc += (this.lastR - R) * 14;
      while (this.crumbleAcc > 1) { this.crumbleAcc -= 1; this.spawnChunk(R); }
    }
    this.lastR = R;
    this.setRing(R);
    const shrinking = sim.phase === 'fight' && sim.t > 6;
    const dm = this.danger.material;
    dm.opacity = shrinking ? 0.18 + 0.14 * Math.sin(T * (sim.t > 48 ? 14 : 5)) : Math.max(0, dm.opacity - rdt);
    this.tawaraMat.emissive.set(sim.t > 48 && sim.phase === 'fight' ? '#ff2040' : '#000000');
    this.tawaraMat.emissiveIntensity = 0.3 + 0.3 * Math.sin(T * 14);

    for (const l of this.lanterns) {
      l.userData.b += rdt;
      l.position.y += Math.sin(l.userData.b * 1.3) * 0.004;
      l.rotation.y += rdt * 0.2;
    }
    this.clouds.rotation.y += rdt * 0.01;

    // blobs
    for (const b of this.blobs) this.updateBlob(b, sim.ws[b.id], sim, dt, rdt);

    // items
    const seen = new Set();
    for (const it of sim.items) {
      seen.add(it.id);
      let m = this.itemMeshes.get(it.id);
      if (!m) { m = this.makeItem(it.kind); this.itemMeshes.set(it.id, m); this.tilt.add(m); }
      m.position.set(it.x, 1.0 + it.drop * it.drop * 14 + Math.sin(T * 3 + it.id) * 0.15, it.z);
      m.userData.inner.rotation.y += rdt * 2.4;
      const gs = m.userData.glow;
      gs.position.y = 0.04 - m.position.y;
      gs.scale.setScalar(0.55 + 0.08 * Math.sin(T * 6));
      const blink = it.t > 11 ? (Math.sin(T * 20) > 0 ? 1 : 0.3) : 1;
      m.userData.bubble.material.opacity = 0.32 * blink;
    }
    for (const [id, m] of this.itemMeshes) if (!seen.has(id)) { this.tilt.remove(m); this.itemMeshes.delete(id); }

    // particles
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life += rdt;
      const k = p.life / p.max;
      if (k >= 1) { p.alive = false; p.sp.visible = false; continue; }
      const dr = Math.exp(-p.drag * rdt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * rdt;
      p.sp.position.x += p.vx * rdt; p.sp.position.y += p.vy * rdt; p.sp.position.z += p.vz * rdt;
      p.sp.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
      p.sp.material.rotation += p.spin * rdt;
      p.sp.material.opacity = k < p.fade ? 1 - Math.max(0, (k - (1 - p.fade)) / p.fade) : 1 - k;
    }
    for (const c of this.chunks) {
      if (!c.alive) continue;
      c.life += rdt; c.vy -= 18 * rdt;
      c.m.position.x += c.vx * rdt; c.m.position.y += c.vy * rdt; c.m.position.z += c.vz * rdt;
      c.m.rotation.x += c.rx * rdt; c.m.rotation.y += c.ry * rdt;
      if (c.life > 2.2) { c.alive = false; c.m.visible = false; }
    }

    this.updateCamera(sim, rdt);
  }

  updateBlob(b, w, sim, dt, rdt) {
    const root = b.root;
    root.visible = w.alive || w.y > -40;
    if (!w.alive && w.y < -30) { root.visible = false; return; }
    root.position.set(w.x, w.y, w.z);
    // facing
    let d = w.face - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y += d * Math.min(1, rdt * 18);
    const speed = Math.hypot(w.vx, w.vz);
    // squash spring
    let target = 0;
    if (w.charging) target = -0.2 * w.charge - 0.05;
    if (w.y > 0.05) target = Math.max(-0.1, Math.min(0.25, w.vy * 0.03));
    // semi-implicit spring, substepped so long frames never blow it up
    let left = Math.min(rdt, 0.25);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120); left -= h;
      b.sv += ((target - b.s) * 220 - b.sv * 13) * h;
      b.s += b.sv * h;
    }
    if (b.s < -0.45) { b.s = -0.45; b.sv = Math.max(0, b.sv); }
    if (b.s > 0.5) { b.s = 0.5; b.sv = Math.min(0, b.sv); }
    const sY = 1 + b.s, sXZ = 1 - b.s * 0.55;
    const jitter = w.charging ? (Math.random() - 0.5) * 0.06 * w.charge : 0;
    b.sq.scale.set(sXZ + jitter, sY, sXZ - jitter);
    // lean into motion; teeter wobble at the edge
    const fwd = (w.vx * Math.sin(w.face) + w.vz * Math.cos(w.face));
    const lean = Math.max(-0.35, Math.min(0.35, fwd * 0.03 + (w.dashT > 0 ? 0.25 : 0)));
    b.lean += (lean - b.lean) * Math.min(1, rdt * 10);
    const wob = w.teeter > 0.05 && !w.falling ? Math.sin(sim.t * 22) * 0.18 * w.teeter : 0;
    b.sq.rotation.x = b.lean;
    b.sq.rotation.z = wob;
    const scale = w.r;
    root.scale.setScalar(scale);
    // falling spin
    if (w.falling) { b.spin += rdt * 7; b.sq.rotation.x = b.spin; }
    else b.spin = 0;
    // walk cycle
    b.walk += rdt * Math.min(16, speed * 2.4);
    const step = Math.sin(b.walk);
    b.feet[0].position.z = 0.28 + step * 0.18 * Math.min(1, speed / 5);
    b.feet[1].position.z = 0.28 - step * 0.18 * Math.min(1, speed / 5);
    b.feet[0].position.y = 0.1 + Math.max(0, step) * 0.12 * Math.min(1, speed / 5);
    b.feet[1].position.y = 0.1 + Math.max(0, -step) * 0.12 * Math.min(1, speed / 5);
    b.root.position.y += Math.abs(Math.sin(b.walk)) * 0.06 * Math.min(1, speed / 5);
    // arms
    const [L, Rr] = b.arms;
    if (w.falling || w.teeter > 0.35) {
      const f = sim.t * (w.falling ? 18 : 24);
      L.rotation.set(Math.sin(f) * 1.4, 0, 1.6 + Math.cos(f) * 0.6);
      Rr.rotation.set(-Math.sin(f) * 1.4, 0, -1.6 - Math.cos(f) * 0.6);
    } else if (w.dashT > 0 || w.air > 0) {
      L.rotation.set(-1.5, 0, 0.2); Rr.rotation.set(-1.5, 0, -0.2);
    } else if (w.charging) {
      L.rotation.set(0.8, 0, 0.5); Rr.rotation.set(0.8, 0, -0.5);
    } else if (sim.phase === 'end' && sim.roundWinner === w.id) {
      const f = sim.endT * 14;
      L.rotation.set(0, 0, 2.4 + Math.sin(f) * 0.3); Rr.rotation.set(0, 0, -2.4 - Math.sin(f) * 0.3);
    } else {
      const sw = Math.sin(b.walk) * 0.7 * Math.min(1, speed / 5);
      L.rotation.set(sw, 0, 0.15 + Math.sin(this.time * 2 + b.id) * 0.05);
      Rr.rotation.set(-sw, 0, -0.15 - Math.sin(this.time * 2 + b.id) * 0.05);
    }
    // face
    const angry = w.charging || w.dashT > 0;
    b.brows[0].rotation.z = Math.PI / 2 + (angry ? -0.5 : 0.1);
    b.brows[1].rotation.z = Math.PI / 2 + (angry ? 0.5 : -0.1);
    const scared = w.falling || w.teeter > 0.4 || w.stun > 0.1;
    b.mouth.scale.set(scared ? 0.1 : angry ? 0.13 : 0.11, scared ? 0.12 : angry ? 0.03 : 0.045, 0.05);
    for (const p of b.pupils) p.scale.setScalar(scared ? 0.06 : 0.095);
    // hit flash
    b.flash = Math.max(0, b.flash - rdt * 6);
    b.mat.emissive.setRGB(b.flash, b.flash, b.flash);
    // power visuals
    b.spring.visible = w.power === 'spring';
    if (b.spring.visible) b.spring.scale.set(0.55, 0.55 + Math.sin(this.time * 12) * 0.12, 0.55);
    const heavy = w.power === 'heavy';
    b.mat.metalness = heavy ? 0.85 : 0;
    b.mat.roughness = heavy ? 0.22 : 0.28;
    b.mat.color.copy(b.baseColor);
    if (heavy) b.mat.color.lerp(new THREE.Color('#9aa4b8'), 0.55);
    if (w.powerT > 0 && w.powerT < 1.6 && w.power !== 'spring' && Math.sin(this.time * 30) > 0) b.mat.emissive.setRGB(0.25, 0.25, 0.25);
    // charge ring + arrow
    const showAim = w.charging && !w.falling;
    b.chargeRing.visible = showAim;
    b.arrow.visible = showAim;
    if (showAim) {
      const s = 0.8 + 0.6 * w.charge;
      b.chargeRing.scale.setScalar(s);
      b.chargeRing.material.color.set(w.charge >= 1 ? '#ffe14d' : '#ffffff');
      // arrow along input direction (local frame: root faces w.face, arrow points +z)
      const il = Math.hypot(w.input.x, w.input.z);
      const aimA = il > 0.2 ? Math.atan2(w.input.x, w.input.z) : w.face;
      b.arrow.rotation.z = -(aimA - root.rotation.y) + Math.PI;
      b.arrow.rotation.z = aimA - root.rotation.y + Math.PI;
      b.arrow.position.set(0, 0.05, 0);
      b.arrow.scale.set(1, 0.9 + 1.4 * w.charge, 1);
      b.arrow.material.opacity = 0.55 + 0.4 * w.charge;
      b.arrow.material.color.set(w.charge >= 1 ? '#ffe14d' : '#ffffff');
      if (Math.random() < 0.35 + w.charge * 0.5) this.burst('charge', w.x, 0, w.z, 1, w.charge >= 1 ? '#ffe14d' : '#ffffff');
    }
    if (b.marker) {
      b.marker.visible = !w.falling;
      b.marker.position.y = 2.65 + Math.sin(this.time * 5) * 0.12;
      b.marker.rotation.y += rdt * 3;
    }
    if (b.youRing) {
      b.youRing.visible = !w.falling && w.y < 0.6 && !w.charging;
      b.youRing.material.opacity = 0.7 + 0.25 * Math.sin(this.time * 6);
    }
  }

  updateCamera(sim, rdt) {
    const cam = this.camera;
    const asp = cam.aspect;
    const alive = sim.ws.filter((w) => w.alive && !w.falling);
    let cx = 0, cz = 0;
    for (const w of alive) { cx += w.x; cz += w.z; }
    if (alive.length) { cx /= alive.length; cz /= alive.length; }
    // frame the action, not the whole ring: zoom in while the blobs are bunched
    // up, out when they spread or the ring is small. The ring is always mostly in view.
    const portrait = asp < 0.8;
    const tx = cx * 0.45, tz = cz * 0.45;
    let spread = 0;
    for (const w of alive) spread = Math.max(spread, Math.hypot(w.x - tx, w.z - tz) + w.r);
    const ringFit = sim.R + 2.2;
    const Rv = Math.max(6, Math.min(ringFit, Math.max(spread + 2.6, ringFit * (portrait ? 0.9 : 0.68))));
    const pitch = portrait ? 0.92 : 0.74; // ~42 degrees down (steeper on tall phones)
    const vHalf = (cam.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * asp);
    let dist = Math.max(Rv / Math.tan(hHalf), (Rv * Math.sin(pitch) * 1.25 + 1.5) / Math.tan(vHalf)) * 0.93;
    const ty = portrait ? -1.2 : 0;
    const want = this.v3.set(tx, ty + Math.sin(pitch) * dist, tz + Math.cos(pitch) * dist);
    const k = Math.min(1, rdt * 2.2);
    this.camPos.lerp(want, k);
    this.camLook.x += (tx - this.camLook.x) * k; this.camLook.y += (ty - this.camLook.y) * k; this.camLook.z += (tz - this.camLook.z) * k;
    cam.position.copy(this.camPos);
    this.shakeAmt = Math.max(0, this.shakeAmt - rdt * 2.2);
    const s = this.shakeAmt * this.shakeAmt * 1.4;
    if (s > 0) cam.position.add(this.v3.set(rand(-s, s), rand(-s, s), rand(-s, s)));
    cam.lookAt(this.camLook);
    this.sun.position.set(this.camLook.x - 8, 24, this.camLook.z + 10);
    this.sun.target.position.copy(this.camLook);
  }

  snapCamera(sim) { this.camPos.set(0, 30, 20); this.updateCamera(sim, 10); }

  shake(a) { this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a)); }

  flash(id, a = 1) { const b = this.blobs[id]; if (b) { b.flash = a; b.sv -= 6 * a; } }
  pop(id, a = 1) { const b = this.blobs[id]; if (b) b.sv += a; }

  // screen position of a point above a blob (or a ring-space point)
  screenOf(x, y, z, out) {
    const v = this.v3.set(x, y, z);
    this.tilt.updateMatrixWorld();
    v.applyMatrix4(this.tilt.matrixWorld).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w; out.y = (-v.y * 0.5 + 0.5) * this.h; out.z = v.z;
    return out;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 44 : 36;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
