// The rider: capsule-built figure with 2-bone IK legs/arms, a snowboard or a pair of skis + poles.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
export const OUTFITS = [
  { name: 'FIRE', jacket: 0xe8322a, pants: 0x1d2433, helmet: 0xf4f4f4, board: 0x1d2433, unlock: 0 },
  { name: 'TANGERINE', jacket: 0xff8a1f, pants: 0x283a5c, helmet: 0x283a5c, board: 0xff8a1f, unlock: 2 },
  { name: 'GLACIER', jacket: 0x1fc8c0, pants: 0x14323a, helmet: 0xffffff, board: 0x0f6f8f, unlock: 4 },
  { name: 'ULTRA', jacket: 0x8b4dff, pants: 0x1a1430, helmet: 0xffd400, board: 0xffd400, unlock: 6 },
  { name: 'GOLD RUSH', jacket: 0xffc400, pants: 0x161616, helmet: 0x161616, board: 0xe8322a, unlock: 9 },
  { name: 'NIGHTSHADE', jacket: 0x15161b, pants: 0x15161b, helmet: 0x39ff88, board: 0x39ff88, unlock: 12 },
];

function capsule(r, len, mat) { const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; }
function placeBone(m, a, b) { const d = new THREE.Vector3().subVectors(b, a); m.position.copy(a).addScaledVector(d, 0.5); if (d.lengthSq() > 1e-8) m.quaternion.setFromUnitVectors(UP, d.normalize()); }
// knee/elbow position for a 2-bone chain; bend = preferred direction of the joint
function ik(a, b, l1, l2, bend, out) {
  const d = new THREE.Vector3().subVectors(b, a); let dist = d.length();
  const max = l1 + l2 - 1e-3; if (dist > max) { d.setLength(max); b = a.clone().add(d); dist = max; }
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const dn = d.clone().normalize(); const side = bend.clone().addScaledVector(dn, -bend.dot(dn)).normalize();
  return out.copy(a).addScaledVector(dn, x).addScaledVector(side, h);
}
function boardGeo(len, wid, thick, tip) {
  const s = new THREE.Shape(), hl = len / 2 - wid / 2;
  s.moveTo(-wid / 2, -hl); s.lineTo(-wid / 2, hl); s.absarc(0, hl, wid / 2, Math.PI, 0, true); s.lineTo(wid / 2, -hl); s.absarc(0, -hl, wid / 2, 0, Math.PI, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 2, curveSegments: 10, steps: 1 });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), a = Math.abs(z) - (len / 2 - tip); if (a > 0) p.setY(i, p.getY(i) + a * a * 1.6); }
  g.computeVertexNormals(); return g;
}

export function makeRider() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const M = {
    jacket: new THREE.MeshStandardMaterial({ roughness: 0.6 }), pants: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    helmet: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }), board: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.5 }), skin: new THREE.MeshStandardMaterial({ color: 0xe0ac86, roughness: 0.7 }),
    lens: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x7a2a00, roughness: 0.1, metalness: 0.8 }), pole: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 }),
  };
  const torso = capsule(0.17, 0.56, M.jacket), pelvis = capsule(0.15, 0.32, M.pants); pelvis.rotation.z = Math.PI / 2;
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), M.skin); face.position.set(0, -0.01, 0.015);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.helmet); helm.position.y = 0.02; helm.castShadow = true;
  const gog = capsule(0.045, 0.24, M.lens); gog.rotation.z = Math.PI / 2; gog.position.set(0, 0.01, 0.11);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 6, 20), M.dark); strap.position.y = 0.01;
  head.add(face, helm, gog, strap);
  const thighs = [capsule(0.085, 0.48, M.pants), capsule(0.085, 0.48, M.pants)], shins = [capsule(0.075, 0.48, M.pants), capsule(0.075, 0.48, M.pants)];
  const boots = [capsule(0.075, 0.26, M.dark), capsule(0.075, 0.26, M.dark)]; boots.forEach((b) => (b.rotation.x = Math.PI / 2));
  const uarms = [capsule(0.065, 0.32, M.jacket), capsule(0.065, 0.32, M.jacket)], farms = [capsule(0.058, 0.3, M.jacket), capsule(0.058, 0.3, M.jacket)];
  const gloves = [new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), M.dark), new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), M.dark)];
  body.add(torso, pelvis, head, ...thighs, ...shins, ...boots, ...uarms, ...farms, ...gloves);
  // gear
  const board = new THREE.Group();
  const bm = new THREE.Mesh(boardGeo(1.55, 0.29, 0.025, 0.2), M.board); bm.rotation.y = Math.PI / 2; bm.castShadow = true; board.add(bm);
  for (const s of [-1, 1]) { const bd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.25), M.dark); bd.position.set(s * 0.26, 0.05, 0); board.add(bd); }
  const skis = new THREE.Group(), poles = [];
  for (const s of [-1, 1]) { const sk = new THREE.Mesh(boardGeo(1.75, 0.085, 0.02, 0.22), M.board); sk.position.set(s * 0.14, 0, 0.12); sk.castShadow = true; skis.add(sk); }
  for (let i = 0; i < 2; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.15, 5), M.pole); p.castShadow = true; poles.push(p); body.add(p); }
  body.add(board, skis);

  const R = { root, body, gear: 'board', outfit: 0 };
  R.setOutfit = (i) => { const o = OUTFITS[i] || OUTFITS[0]; R.outfit = i; M.jacket.color.set(o.jacket); M.pants.color.set(o.pants); M.helmet.color.set(o.helmet); M.board.color.set(o.board); };
  R.setGear = (g) => { R.gear = g; board.visible = g === 'board'; skis.visible = g !== 'board'; poles.forEach((p) => (p.visible = g !== 'board')); body.rotation.y = g === 'board' ? Math.PI / 2 : 0; };
  R.setOutfit(0); R.setGear('board');

  const v = () => new THREE.Vector3();
  const hip = v(), chest = v(), tmp = v(), knee = v(), foot = v(), sh = v(), hand = v(), elbow = v();
  // st: { crouch 0..1, grab 0..1, grabKind, flail 0..1, t, airborne }
  R.pose = (st) => {
    const isB = R.gear === 'board', c = clamp(st.crouch, 0, 1), g = clamp(st.grab, 0, 1), fl = st.flail || 0;
    const tuck = Math.max(c, g * 0.8);
    const lift = g * 0.42 + (st.airborne ? 0.05 : 0);
    const hh = 0.97 - 0.36 * tuck;
    board.position.y = lift; skis.position.y = lift;
    const fw = isB ? 0.25 : 0.14, lean = isB ? 0 : 0.08 + 0.18 * c;
    hip.set(0, hh, isB ? 0 : -0.05 - 0.1 * c);
    chest.set(0, hh + 0.52 - 0.08 * tuck, hip.z + lean + 0.1 * tuck + Math.sin(st.t * 9) * 0.05 * fl);
    placeBone(torso, hip, chest);
    pelvis.position.copy(hip);
    head.position.set(chest.x, chest.y + 0.26, chest.z + 0.04);
    head.rotation.set(0.1 * tuck, isB ? -1.25 : 0, 0);
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      // legs
      tmp.set(sg * 0.1, hh, hip.z);
      foot.set(sg * fw, 0.09 + lift, isB ? 0 : 0.02);
      ik(tmp, foot, 0.46, 0.46, new THREE.Vector3(isB ? sg * 0.25 : sg * 0.08, 0, 1), knee);
      placeBone(thighs[s], tmp, knee); placeBone(shins[s], knee, foot);
      boots[s].position.set(foot.x, foot.y - 0.02, foot.z + 0.06); boots[s].rotation.set(Math.PI / 2, 0, 0);
      // arms
      sh.set(sg * 0.21, chest.y - 0.04, chest.z);
      if (fl > 0) hand.set(sg * (0.55 + 0.1 * Math.sin(st.t * 13 + s)), chest.y + 0.3 * Math.sin(st.t * 11 + s * 2), chest.z + 0.3 * Math.cos(st.t * 10 + s));
      else if (g > 0.05 && ((st.grabKind % 2) === s)) {
        const gz = [0.0, 0.0, 0.55, -0.55][st.grabKind % 4];
        hand.set(isB ? lerp(sg * 0.45, sg * 0.05 + (st.grabKind > 1 ? (st.grabKind === 2 ? 0.6 : -0.6) : 0), g) : lerp(sg * 0.35, sg * 0.15, g), lerp(hh + 0.15, lift + 0.12, g), isB ? lerp(0.15, st.grabKind % 2 ? 0.12 : -0.12, g) : lerp(0.3, gz * 0.6 + 0.1, g));
      } else if (isB) hand.set(sg * (0.5 - 0.15 * c), hh + 0.18 + 0.12 * (st.airborne ? 1 : 0), 0.12 + (s ? 0.15 : -0.05));
      else hand.set(sg * 0.32, hh + 0.08 + 0.1 * (st.airborne ? 1 : 0), chest.z + 0.32);
      ik(sh, hand, 0.32, 0.3, new THREE.Vector3(sg * 0.3, -0.6, -0.5), elbow);
      placeBone(uarms[s], sh, elbow); placeBone(farms[s], elbow, hand); gloves[s].position.copy(hand);
      if (!isB) { const tipP = hand.clone().add(new THREE.Vector3(sg * 0.04, -1.05, -0.38 + (st.airborne ? -0.2 : 0))); placeBone(poles[s], hand, tipP); }
    }
  };
  R.pose({ crouch: 0, grab: 0, grabKind: 0, t: 0 });
  return R;
}
