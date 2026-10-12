// Batter, pitcher, ball, aim circle. Smooth glossy shapes (capsules + spheres).
import * as THREE from '../vendor/three.module.js';
import { ZONE, SWING_LAG } from './physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function gloss(color, rough = 0.35, metal = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

// A limb that stretches between two points (unit capsule along Y, scaled)
function limb(radius, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 1, 6, 12), mat);
  m.userData.r = radius;
  return m;
}
function placeLimb(m, a, b) {
  tmpV.subVectors(b, a);
  const len = tmpV.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, tmpV.normalize());
  m.scale.set(1, Math.max(0.01, len - m.userData.r * 0) / 1, 1);
  // capsule length is 1 + 2r; keep the ends at the joints
  m.scale.y = Math.max(0.05, len / (1 + 2 * m.userData.r) * 1.0);
}

function shadowBlob(tex, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

export function buildActors(scene, glowTex) {
  const uni = gloss(0xf2f4fa, 0.45), pin = gloss(0x1d3fa8, 0.4), skin = gloss(0xc68a62, 0.5), helm = gloss(0x1b3a9a, 0.15, 0.2);
  const dark = gloss(0x1b1d26, 0.5);
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();

  // ---------------- batter ----------------
  const batter = new THREE.Group();
  batter.position.set(-0.78, 0, 0.05);
  scene.add(batter);
  const bodyG = new THREE.Group(); batter.add(bodyG);       // twists with the swing
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14), uni); torso.position.set(0, 1.2, 0); torso.scale.set(1.05, 1, 0.8); bodyG.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16), pin); belt.position.set(0, 0.95, 0); belt.scale.z = 0.8; bodyG.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), skin); head.position.set(0, 1.66, 0); bodyG.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), helm); helmet.position.set(0, 1.68, 0); bodyG.add(helmet);
  const flap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), helm); flap.position.set(0.0, 1.63, 0.12); flap.scale.set(1, 1, 0.4); bodyG.add(flap); // ear flap facing the catcher
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 20, 1, false, 0, Math.PI), helm); brim.position.set(0.06, 1.66, 0); brim.rotation.y = -Math.PI / 2; bodyG.add(brim);
  const legL = limb(0.085, uni), legR = limb(0.085, uni), shinL = limb(0.07, uni), shinR = limb(0.07, uni);
  const shoeL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 8), dark), shoeR = shoeL.clone();
  shoeL.rotation.z = Math.PI / 2; shoeR.rotation.z = Math.PI / 2;
  batter.add(legL, legR, shinL, shinR, shoeL, shoeR);
  const armL = limb(0.06, uni), armR = limb(0.06, uni), foreL = limb(0.05, skin), foreR = limb(0.05, skin);
  batter.add(armL, armR, foreL, foreR);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), dark); batter.add(glove);
  // bat: pivot at the hands; barrel along local +x
  const batPivot = new THREE.Group(); batter.add(batPivot);
  const batTilt = new THREE.Group(); batPivot.add(batTilt);
  const batMat = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.25, metalness: 0.05 });
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.016, 0.86, 16), batMat);
  bat.rotation.z = -Math.PI / 2; bat.position.x = 0.38; batTilt.add(bat);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), batMat); knob.position.x = -0.06; batTilt.add(knob);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), batMat); cap.position.x = 0.81; batTilt.add(cap);
  const bShadow = shadowBlob(shadowTex, 1.6); bShadow.position.set(-0.78, 0.02, 0.05); scene.add(bShadow);

  const swing = { t: -1, aimX: 0, aimY: 0.8, dir: 1 };
  const J = {
    hipL: new THREE.Vector3(), hipR: new THREE.Vector3(), kneeL: new THREE.Vector3(), kneeR: new THREE.Vector3(),
    footL: new THREE.Vector3(), footR: new THREE.Vector3(), shL: new THREE.Vector3(), shR: new THREE.Vector3(),
    elL: new THREE.Vector3(), elR: new THREE.Vector3(), hands: new THREE.Vector3(),
  };
  const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const lerp = (a, b, k) => a + (b - a) * k;

  // swing phase: k in [0, 1+] - 0 = cocked, SWING_LAG/0.36 = contact, 1 = finished
  function poseBatter(time, idle) {
    // local frame: batter faces +x (toward the plate). Pitcher is at -z.
    let s = swing.t < 0 ? 0 : swing.t;
    const DUR = 0.36, kc = SWING_LAG / DUR;
    let ph = s / DUR;                  // 0..1
    const breathe = Math.sin(time * 2.2) * 0.012;
    // yaw of the bat (see README): -100 cocked, 0 at contact, +165 follow-through
    let yaw, tilt, twist, stride;
    const ax = swing.aimX - batter.position.x, ay = swing.aimY;
    if (swing.t < 0) {
      // waggle while waiting
      yaw = -105 + Math.sin(time * 3.1) * 6 * idle;
      tilt = 52 + Math.sin(time * 2.3) * 4 * idle;
      twist = -0.25; stride = 0;
    } else if (ph < kc) {
      const k = ease(ph / kc);
      yaw = lerp(-105, 0, k * k); tilt = lerp(52, -8 + (0.8 - ay) * 20, k); twist = lerp(-0.25, 0.35, k); stride = Math.min(1, ph / kc * 1.5);
    } else {
      const k = ease(Math.min(1, (ph - kc) / (1 - kc)));
      yaw = lerp(0, 168, k); tilt = lerp(-8 + (0.8 - ay) * 20, 40, k); twist = lerp(0.35, 1.2, k); stride = 1;
    }
    bodyG.rotation.y = -twist * 0.7;
    bodyG.position.y = breathe - stride * 0.05;
    torso.rotation.x = 0.12; torso.rotation.z = -0.15;
    // legs: wide stance, front foot (toward pitcher, -z) strides
    J.hipL.set(0.0, 0.92, -0.12); J.hipR.set(0.0, 0.92, 0.12);
    J.footL.set(0.05, 0.06, -0.42 - stride * 0.18); J.footR.set(-0.02, 0.06, 0.38);
    J.kneeL.set(0.16, 0.5, -0.3 - stride * 0.1); J.kneeR.set(0.14, 0.48, 0.28);
    for (const k of ['hipL', 'hipR']) J[k].y += bodyG.position.y;
    placeLimb(legL, J.hipL, J.kneeL); placeLimb(shinL, J.kneeL, J.footL);
    placeLimb(legR, J.hipR, J.kneeR); placeLimb(shinR, J.kneeR, J.footR);
    shoeL.position.set(J.footL.x + 0.06, 0.05, J.footL.z); shoeR.position.set(J.footR.x + 0.06, 0.05, J.footR.z);
    // hands: cocked by the back shoulder; at contact out front at the aim height
    const cock = new THREE.Vector3(0.05, 1.38 + breathe, 0.22);
    const hit = new THREE.Vector3(Math.max(0.1, ax - 0.64), Math.min(1.25, Math.max(0.55, ay + 0.06)), -0.05);
    const fin = new THREE.Vector3(-0.1, 1.45, -0.25);
    if (swing.t < 0) J.hands.copy(cock);
    else if (ph < kc) J.hands.lerpVectors(cock, hit, ease(ph / kc));
    else J.hands.lerpVectors(hit, fin, ease((ph - kc) / (1 - kc)));
    // shoulders turn with the body
    const c = Math.cos(-twist * 0.7), sn = Math.sin(-twist * 0.7);
    const rot = (x, y, z, out) => out.set(x * c + z * sn, y + bodyG.position.y, -x * sn + z * c);
    rot(0.0, 1.42, -0.2, J.shL); rot(0.0, 1.42, 0.2, J.shR);
    // elbows: halfway, pushed down and out
    J.elL.lerpVectors(J.shL, J.hands, 0.5).add(tmpV2.set(0.08, -0.12, -0.06));
    J.elR.lerpVectors(J.shR, J.hands, 0.5).add(tmpV2.set(0.02, -0.16, 0.1));
    placeLimb(armL, J.shL, J.elL); placeLimb(foreL, J.elL, J.hands);
    placeLimb(armR, J.shR, J.elR); placeLimb(foreR, J.elR, J.hands);
    glove.position.copy(J.hands);
    batPivot.position.copy(J.hands);
    batPivot.rotation.y = yaw * Math.PI / 180;
    batTilt.rotation.z = tilt * Math.PI / 180;
  }

  // ---------------- pitcher ----------------
  const pitcher = new THREE.Group();
  pitcher.position.set(0, 0.38, -18.4);
  scene.add(pitcher);
  const pUni = gloss(0x2a3350, 0.45), pCap = gloss(0xc0202e, 0.3);   // away uniform: dark, so the white ball reads against it
  const pt = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.45, 6, 14), pUni); pt.position.y = 1.2; pt.scale.z = 0.8; pitcher.add(pt);
  const ph = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), skin); ph.position.y = 1.67; pitcher.add(ph);
  const pc = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), pCap); pc.position.y = 1.7; pitcher.add(pc);
  const pbrim = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, 0, Math.PI), pCap); pbrim.position.set(0, 1.7, 0.08); pbrim.rotation.y = Math.PI / 2; pitcher.add(pbrim);
  const pLegL = limb(0.085, pUni), pLegR = limb(0.085, pUni), pArmR = limb(0.055, pUni), pArmL = limb(0.055, pUni), pForeR = limb(0.05, skin), pForeL = limb(0.05, skin);
  const pGlove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), gloss(0x6b3a1e, 0.5));
  pitcher.add(pLegL, pLegR, pArmR, pArmL, pForeR, pForeL, pGlove);
  const pShadow = shadowBlob(shadowTex, 1.8); pShadow.position.set(0, 0.4, -18.4); scene.add(pShadow);
  const P = { hipL: new THREE.Vector3(), hipR: new THREE.Vector3(), fL: new THREE.Vector3(), fR: new THREE.Vector3(), sR: new THREE.Vector3(), sL: new THREE.Vector3(), eR: new THREE.Vector3(), hR: new THREE.Vector3(), eL: new THREE.Vector3(), hL: new THREE.Vector3() };
  // u: 0..1 windup, 1 = release, >1 follow-through. Pitcher is right-handed, ball hand at x<0 from the catcher view
  function posePitcher(u, time) {
    const kick = u < 0 ? 0 : Math.sin(Math.min(1, u / 0.7) * Math.PI) * (u < 0.7 ? 1 : 0);
    const lean = u < 0.7 ? 0 : Math.min(1, (u - 0.7) / 0.5);
    pt.rotation.x = lean * 0.35; pt.position.z = lean * 0.12;
    ph.position.z = pc.position.z = lean * 0.25; pbrim.position.z = 0.08 + lean * 0.25;
    ph.position.y = 1.67 - lean * 0.06; pc.position.y = 1.7 - lean * 0.06; pbrim.position.y = 1.7 - lean * 0.06;
    P.hipL.set(0.12, 0.92, 0); P.hipR.set(-0.12, 0.92, 0);
    P.fR.set(-0.14, 0.04, -0.05);
    P.fL.set(0.14 + kick * 0.05, 0.04 + kick * 0.7, kick * 0.15 + lean * 0.75);
    placeLimb(pLegL, P.hipL, P.fL); placeLimb(pLegR, P.hipR, P.fR);
    P.sR.set(-0.24, 1.42, lean * 0.1); P.sL.set(0.24, 1.42, lean * 0.1);
    // throwing arm angle: hangs down -> goes back and up -> whips over the top -> down across
    let ang;
    if (u < 0) ang = -0.15 + Math.sin(time * 1.5) * 0.03;
    else if (u < 0.75) ang = -0.15 - (u / 0.75) * 2.6;          // swings back (behind, toward -z)
    else if (u < 1) ang = -2.75 - ((u - 0.75) / 0.25) * 1.33;   // over the top and forward
    else ang = -4.08 - Math.min(1, (u - 1) / 0.3) * 1.6;
    const L = 0.62;
    P.hR.set(-0.3, 1.42 - Math.cos(ang) * L, Math.sin(ang) * L);
    P.eR.lerpVectors(P.sR, P.hR, 0.5).x -= 0.08;
    placeLimb(pArmR, P.sR, P.eR); placeLimb(pForeR, P.eR, P.hR);
    P.hL.set(0.22 - kick * 0.1, 1.15 + kick * 0.15, 0.25 + lean * 0.1);
    if (u < 0) P.hL.set(0.05, 1.2, 0.25);
    P.eL.lerpVectors(P.sL, P.hL, 0.5).x += 0.1;
    placeLimb(pArmL, P.sL, P.eL); placeLimb(pForeL, P.eL, P.hL);
    pGlove.position.copy(P.hL);
    return pitcher.localToWorld(tmpV2.copy(P.hR));
  }

  // ---------------- ball ----------------
  const ballTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#d0262e'; g.lineWidth = 5;
    for (const o of [0, 128]) { g.beginPath(); for (let x = 0; x <= 128; x += 2) { const y = 64 + Math.sin((x / 128) * Math.PI * 2) * 34 * (o ? -1 : 1); x ? g.lineTo(x + o, y) : g.moveTo(x + o, y); } g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ballMat = new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, emissive: 0x333333 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 14), ballMat);
  ball.visible = false; scene.add(ball);
  const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  ballGlow.scale.set(0.35, 0.35, 1); ball.add(ballGlow);
  const ballShadow = shadowBlob(shadowTex, 0.3); ballShadow.visible = false; scene.add(ballShadow);

  // ---------------- aim circle + zone ----------------
  const reticle = new THREE.Group(); reticle.renderOrder = 10;
  const rMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.135, 0.155, 48), rMat); ring.renderOrder = 10;
  const ringFill = new THREE.Mesh(new THREE.CircleGeometry(0.135, 48), new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.13, depthTest: false, depthWrite: false })); ringFill.renderOrder = 9;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), rMat); dot.renderOrder = 10;
  reticle.add(ringFill, ring, dot);
  reticle.position.set(0, 0.8, 0.02);
  scene.add(reticle);
  const zoneMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthTest: false });
  const zg = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(ZONE.x0, ZONE.y0, 0), new THREE.Vector3(ZONE.x1, ZONE.y0, 0), new THREE.Vector3(ZONE.x1, ZONE.y1, 0), new THREE.Vector3(ZONE.x0, ZONE.y1, 0), new THREE.Vector3(ZONE.x0, ZONE.y0, 0)]);
  const zone = new THREE.Line(zg, zoneMat); zone.renderOrder = 8; scene.add(zone);
  const assist = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.06, 24), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.0, depthTest: false }));
  assist.renderOrder = 9; scene.add(assist);

  return {
    batter, swing, poseBatter, posePitcher, pitcher, ball, ballMat, ballGlow, ballShadow,
    reticle, ring, ringFill, rMat, zone, zoneMat, assist,
  };
}
