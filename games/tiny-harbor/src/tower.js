// Inside the lighthouse: a round keeper's room, cut away at the front, with
// a spiral stair up to the lamp, a sea-chart table, a logbook desk and a cot.
import * as THREE from 'three';
import { mat, mesh } from './props.js';
import { ISLANDS, LH } from './terrain.js';

export const TOWER_R = 3.6;

function chartTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 360;
  const x = c.getContext('2d');
  x.fillStyle = '#efe0bd'; x.fillRect(0, 0, 512, 360);
  x.strokeStyle = 'rgba(80,60,40,.25)'; x.lineWidth = 1;
  for (let i = 0; i < 512; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 360); x.stroke(); }
  for (let j = 0; j < 360; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(512, j); x.stroke(); }
  // world (-150..150 x, -110..170 z) onto the chart
  const px = (wx) => 256 + wx * 0.7, pz = (wz) => 165 + wz * 0.58;
  const blob = (wx, wz, r, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(px(wx), pz(wz), Math.max(5, r * 0.7), Math.max(5, r * 0.58), 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#6a5040'; x.lineWidth = 2; x.stroke(); };
  blob(0, 0, 24, '#9ccf86');
  blob(LH.x, LH.z, 4, '#b8b2a8');
  x.font = 'bold 18px Fredoka, sans-serif'; x.fillStyle = '#4a3528'; x.textAlign = 'center';
  x.fillText('HOME', px(0), pz(0) + 6);
  for (const I of ISLANDS) {
    blob(I.x, I.z, I.R, '#bcd99a');
    x.fillStyle = '#4a3528'; x.fillText(I.name, px(I.x), pz(I.z) - I.R * 0.58 - 6);
    x.setLineDash([6, 6]); x.strokeStyle = '#c4463a'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(px(0), pz(0)); x.lineTo(px(I.x), pz(I.z)); x.stroke(); x.setLineDash([]);
  }
  // compass rose
  x.translate(470, 60); x.fillStyle = '#c4463a';
  x.beginPath(); x.moveTo(0, -30); x.lineTo(8, 0); x.lineTo(0, 30); x.lineTo(-8, 0); x.closePath(); x.fill();
  x.fillStyle = '#4a3528'; x.fillText('N', 0, -36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tower {
  constructor() {
    const R = TOWER_R;
    this.R = R;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2230');
    this.hemi = new THREE.HemisphereLight('#fff4e0', '#6a5040', 1.4);
    this.sun = new THREE.DirectionalLight('#fff1d8', 1.4);
    this.sun.position.set(3, 8, -2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 25;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    this.lamp = new THREE.PointLight('#ffc77a', 6, 10, 1.2);
    this.lamp.position.set(0, 2.6, 0.4);
    this.scene.add(this.hemi, this.sun, this.lamp);
    const g = new THREE.Group();
    this.scene.add(g);

    const floor = mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.4, 0.4, 24), mat('#a8a29a'), false);
    floor.position.y = -0.2; floor.receiveShadow = true; g.add(floor);
    for (let k = 0; k < 6; k++) {
      const ring = mesh(new THREE.CylinderGeometry(0.6 + k * 0.55, 0.6 + k * 0.55, 0.02, 24, 1, true), mat('#8f8a82'), false);
      ring.position.y = 0.005; g.add(ring);
    }
    const rug = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.03, 18), mat('#c4463a'), false); rug.position.set(0, 0.02, 0.5); g.add(rug);
    const rug2 = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.035, 18), mat('#f6e2b8'), false); rug2.position.set(0, 0.025, 0.5); g.add(rug2);
    // curved back wall, white with a red band, open at the front
    const wallM = new THREE.MeshLambertMaterial({ color: '#f7f3ea', side: THREE.DoubleSide, flatShading: true });
    const wall = mesh(new THREE.CylinderGeometry(R + 0.1, R + 0.1, 3.4, 24, 1, true, Math.PI * 0.32, Math.PI * 1.36), wallM);
    wall.position.y = 1.7; g.add(wall);
    const band = mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.5, 24, 1, true, Math.PI * 0.32, Math.PI * 1.36), new THREE.MeshLambertMaterial({ color: '#e0523f', side: THREE.DoubleSide }), false);
    band.position.y = 0.6; g.add(band);
    // a round window in the back
    const winM = new THREE.MeshLambertMaterial({ color: '#bfe6f5', emissive: '#bfe6f5', emissiveIntensity: 0.6 });
    const win = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14), winM, false);
    win.rotation.x = Math.PI / 2; win.position.set(0, 2.0, -R + 0.05); g.add(win);
    const winF = mesh(new THREE.TorusGeometry(0.48, 0.07, 6, 16), mat('#3e3a3a'), false); winF.position.set(0, 2.0, -R + 0.08); g.add(winF);
    this.winM = winM;

    // spiral stair hugging the wall, from front-right round to the back
    this.blockers = [];
    const steps = 15, a0 = Math.PI * 0.42, a1 = Math.PI * 1.15;
    for (let k = 0; k < steps; k++) {
      const a = a0 + (a1 - a0) * (k / (steps - 1));
      const step = mesh(new THREE.BoxGeometry(1.15, 0.12, 0.55), mat(k % 2 ? '#a8764c' : '#b98458'));
      const rr = R - 0.65;
      step.position.set(Math.sin(a) * rr, 0.2 + k * 0.22, Math.cos(a) * rr);
      step.rotation.y = a + Math.PI / 2;
      g.add(step);
      const post = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), mat('#3e3a3a'), false);
      post.position.set(Math.sin(a) * (rr - 0.55), 0.65 + k * 0.22, Math.cos(a) * (rr - 0.55));
      g.add(post);
      if (k > 0) this.blockers.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, r: 0.55 });
    }
    this.stairFoot = { x: Math.sin(a0) * (R - 1.6), z: Math.cos(a0) * (R - 1.6) };
    const hatch = mesh(new THREE.BoxGeometry(1.2, 0.08, 1.2), mat('#7a5236'), false);
    hatch.position.set(Math.sin(a1) * (R - 0.8), 3.45, Math.cos(a1) * (R - 0.8)); g.add(hatch);

    // chart table with the sea chart on it
    const ct = new THREE.Group();
    const top = mesh(new THREE.BoxGeometry(1.6, 0.08, 1.1), mat('#8a5a3b')); top.position.y = 0.85; ct.add(top);
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.45, 0.45]) { const l = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.82, 6), mat('#6a452c')); l.position.set(sx, 0.41, sz); ct.add(l); }
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.0), new THREE.MeshLambertMaterial({ map: chartTexture() }));
    chart.rotation.x = -Math.PI / 2; chart.position.y = 0.9; ct.add(chart);
    const compass = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), mat('#d9a84a'), false); compass.position.set(0.55, 0.92, 0.35); ct.add(compass);
    ct.position.set(-0.6, 0, -0.6); ct.rotation.y = 0.2;
    g.add(ct);
    this.chartPos = { x: -0.6, z: -0.6 };
    this.blockers.push({ x: -0.6, z: -0.6, r: 0.85 });

    // logbook desk with a candle
    const desk = new THREE.Group();
    const dtop = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.6), mat('#7a4a2e')); dtop.position.y = 0.8; desk.add(dtop);
    const dbody = mesh(new THREE.BoxGeometry(1.1, 0.75, 0.5), mat('#8a5a3b')); dbody.position.y = 0.38; desk.add(dbody);
    const book = mesh(new THREE.BoxGeometry(0.45, 0.06, 0.32), mat('#34507a'), false); book.position.set(-0.2, 0.87, 0); book.rotation.y = 0.2; desk.add(book);
    const pages = mesh(new THREE.BoxGeometry(0.4, 0.065, 0.28), mat('#fbf6ec'), false); pages.position.set(-0.2, 0.875, 0.01); pages.rotation.y = 0.2; desk.add(pages);
    const candle = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6), mat('#fbf6ec'), false); candle.position.set(0.35, 0.92, 0); desk.add(candle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), new THREE.MeshBasicMaterial({ color: '#ffcf6a' })); flame.position.set(0.35, 1.04, 0); desk.add(flame);
    desk.position.set(-2.4, 0, -1.3); desk.rotation.y = 1.1;
    g.add(desk);
    this.deskPos = { x: -2.4, z: -1.3 };
    this.blockers.push({ x: -2.4, z: -1.3, r: 0.7 });

    // cot, barrels, rope, oil cans
    const cot = new THREE.Group();
    const frame = mesh(new THREE.BoxGeometry(0.9, 0.35, 1.9), mat('#7a5236')); frame.position.y = 0.25; cot.add(frame);
    const mattress = mesh(new THREE.BoxGeometry(0.82, 0.12, 1.8), mat('#e6dccb'), false); mattress.position.y = 0.48; cot.add(mattress);
    const blanket = mesh(new THREE.BoxGeometry(0.86, 0.08, 1.0), mat('#34507a'), false); blanket.position.set(0, 0.56, 0.35); cot.add(blanket);
    cot.position.set(-2.5, 0, 0.95);
    g.add(cot);
    this.blockers.push({ x: -2.5, z: 0.45, r: 0.55 }, { x: -2.5, z: 1.45, r: 0.55 });
    for (const [x, z] of [[1.6, -1.5], [1.0, -2.1]]) {
      const b = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 9), mat('#8a5a3b')); b.position.set(x, 0.37, z); g.add(b);
      const hoop = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 9), mat('#3e3a3a'), false); hoop.position.set(x, 0.55, z); g.add(hoop);
      this.blockers.push({ x, z, r: 0.35 });
    }
    const rope = mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 12), mat('#d9c39a'), false); rope.rotation.x = Math.PI / 2; rope.position.set(1.2, 0.08, -0.5); g.add(rope);
    const lampHang = mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), new THREE.MeshLambertMaterial({ color: '#fff0c0', emissive: '#ffb84a', emissiveIntensity: 1.2 }), false);
    lampHang.position.copy(this.lamp.position); g.add(lampHang);
    const chain = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4), mat('#3e3a3a'), false); chain.position.set(0, 3.15, 0.4); g.add(chain);
    const mat2 = mesh(new THREE.BoxGeometry(1.2, 0.03, 0.6), mat('#c9a26a'), false); mat2.position.set(0, 0.02, R - 0.35); g.add(mat2);
  }

  update(night) {
    this.hemi.intensity = 1.4 - night * 0.6;
    this.sun.intensity = 1.4 * (1 - night) + 0.2;
    this.lamp.intensity = 4 + night * 5;
    this.winM.color.set(night > 0.5 ? '#24386a' : '#bfe6f5');
    this.winM.emissive.set(night > 0.5 ? '#24386a' : '#bfe6f5');
  }
}
