// =====================================================================
// HOOPS :: kit.js - THE BODY, THE BALL AND THE NET
// =====================================================================
//
// The pieces both modes are built out of. STAND STILL (game.js) has one
// of each; HALF COURT (half.js) has ten people, one ball and the same
// net, so they live here rather than in either mode.
import { THREE, mat, box, paint, rnd } from '../_deck/deck3d.js';

/**
 * A LOW-POLY PERSON, at any scale, with joints that actually turn.
 *
 * Everything is measured in units of `scale * 2`, so a scale of 0.5
 * gives a body 2.4 units tall with its hips at 1.22 - which is what the
 * shooter and the crowd have always been. Returns the group plus the
 * joints a pose needs: hips, a chest, two arms (shoulder + elbow) and two
 * legs (hip + knee).
 *
 * THE CHEST IS A JOINT OF ITS OWN, and it was added for the half court's
 * animations. Everything above the waist - the torso, the head and both
 * arms - hangs off it, and the legs hang off the hips, so turning the
 * chest leans him forward into a run or back out of a shot WITHOUT
 * dragging his feet round with it. Before that there was nothing between
 * the hips and the head, so a lean was simply not a thing the body could
 * do, and every pose had to be said with the arms alone.
 */
export function person(scale, shirtCol, skinCol) {
  const g = new THREE.Group();
  const S = scale * 2;
  const shirt = mat(shirtCol);
  const shorts = mat(new THREE.Color(shirtCol).offsetHSL(0, 0, -0.18));
  const skin = mat(skinCol);

  const hips = new THREE.Group(); g.add(hips);
  const chest = new THREE.Group(); hips.add(chest);
  const torso = box(0.62 * S, 0.9 * S, 0.34 * S, shirt);
  torso.position.y = 0.45 * S;
  chest.add(torso);
  const head = box(0.34 * S, 0.36 * S, 0.34 * S, skin);
  head.position.y = 1.10 * S;
  chest.add(head);
  const hair = box(0.36 * S, 0.10 * S, 0.36 * S, mat(new THREE.Color(0x2a1d16)));
  hair.position.y = 1.27 * S;
  chest.add(hair);

  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.40 * S, 0.86 * S, 0);
    const upper = box(0.18 * S, 0.62 * S, 0.18 * S, skin);
    upper.position.y = -0.31 * S;
    pivot.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.62 * S;
    const lower = box(0.16 * S, 0.56 * S, 0.16 * S, skin);
    lower.position.y = -0.28 * S;
    fore.add(lower);
    pivot.add(fore);
    chest.add(pivot);
    arms.push({ pivot, fore, side: s });
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.18 * S, 0, 0);
    const thigh = box(0.24 * S, 0.6 * S, 0.24 * S, shorts);
    thigh.position.y = -0.3 * S;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.6 * S;
    const shin = box(0.20 * S, 0.6 * S, 0.20 * S, skin);
    shin.position.y = -0.3 * S;
    knee.add(shin);
    const shoe = box(0.24 * S, 0.14 * S, 0.4 * S, mat('#1d2430'));
    shoe.position.set(0, -0.62 * S, 0.08 * S);
    knee.add(shoe);
    pivot.add(knee);
    hips.add(pivot);
    legs.push({ pivot, knee, side: s });
  }
  hips.position.y = 1.22 * S;
  return { g, hips, chest, arms, legs, scale, height: 2.4 * scale * 2 / 2 };
}

/** the ball's skin: leather, seams, and the two side arcs */
export function ballTexture() {
  return paint(64, 64, (g) => {
    g.fillStyle = '#e07a2c'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.10) + ')';
      g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
    }
    g.strokeStyle = '#20140c'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
    g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke();
    g.beginPath(); g.arc(0, 32, 26, -1.1, 1.1); g.stroke();
    g.beginPath(); g.arc(64, 32, 26, Math.PI - 1.1, Math.PI + 1.1); g.stroke();
  });
}

/** floorboards */
export function boardTexture(repX = 8, repY = 3) {
  const t = paint(64, 64, (g) => {
    g.fillStyle = '#b5793f'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.08) + ')';
      g.fillRect(Math.random() * 64, Math.random() * 64, 6, 1);
    }
    g.fillStyle = 'rgba(255,235,200,.10)';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

/**
 * THE NET, as a verlet cloth: twelve strands of five beads, pinned to
 * the rim and otherwise free, with distance constraints to the bead
 * above and to their neighbours round the ring.
 *
 * The ball pushes the beads out of its way as it goes through, which is
 * the shot's own replay - you can see from the net whether it went in
 * clean or scraped the rim.
 *
 * `step(dt, ballLocal, ballR)` takes the ball in the RIM'S OWN SPACE, or
 * null when there is no ball near it.
 */
export function makeNet(rimR, strands = 12, rows = 5) {
  const pts = [], links = [];
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < strands; s++) {
      const a = s / strands * Math.PI * 2;
      const rad = rimR * (1 - r * 0.11);
      const p = new THREE.Vector3(Math.cos(a) * rad, -r * 0.24, Math.sin(a) * rad);
      pts.push({ p, old: p.clone(), pinned: r === 0 });
    }
  }
  const idx = (r, s) => r * strands + ((s + strands) % strands);
  for (let r = 0; r < rows; r++) for (let s = 0; s < strands; s++) {
    if (r > 0) links.push([idx(r - 1, s), idx(r, s), pts[idx(r - 1, s)].p.distanceTo(pts[idx(r, s)].p)]);
    links.push([idx(r, s), idx(r, s + 1), pts[idx(r, s)].p.distanceTo(pts[idx(r, s + 1)].p)]);
  }
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(strands * (rows - 1) * 2 * 3 + strands * rows * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xf4f1e8, transparent: true, opacity: 0.9 }));

  function step(dt, ballLocal, ballR = 0.42) {
    const damp = 0.985;
    for (const n of pts) {
      if (n.pinned) continue;
      const vx = (n.p.x - n.old.x) * damp, vy = (n.p.y - n.old.y) * damp, vz = (n.p.z - n.old.z) * damp;
      n.old.copy(n.p);
      n.p.x += vx; n.p.y += vy - 9 * dt * dt * 60; n.p.z += vz;
    }
    if (ballLocal) {
      for (const n of pts) {
        if (n.pinned) continue;
        const d = n.p.distanceTo(ballLocal);
        if (d < ballR + 0.05 && d > 0.0001) {
          n.p.addScaledVector(n.p.clone().sub(ballLocal).normalize(), ballR + 0.05 - d);
        }
      }
    }
    for (let k = 0; k < 3; k++) {
      for (const [i, j, rest] of links) {
        const a = pts[i], c = pts[j];
        const d = a.p.distanceTo(c.p);
        if (d < 0.0001) continue;
        const diff = (d - rest) / d * 0.5;
        const dx = (c.p.x - a.p.x) * diff, dy = (c.p.y - a.p.y) * diff, dz = (c.p.z - a.p.z) * diff;
        if (!a.pinned) { a.p.x += dx; a.p.y += dy; a.p.z += dz; }
        if (!c.pinned) { c.p.x -= dx; c.p.y -= dy; c.p.z -= dz; }
      }
    }
    let k = 0;
    const put = (v) => { arr[k++] = v.x; arr[k++] = v.y; arr[k++] = v.z; };
    for (let r = 0; r < rows; r++) for (let s = 0; s < strands; s++) {
      if (r > 0) { put(pts[idx(r - 1, s)].p); put(pts[idx(r, s)].p); }
      put(pts[idx(r, s)].p); put(pts[idx(r, s + 1)].p);
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { mesh, step, pts };
}

/** a jersey colour pair for a team, and a skin tone that is not one tone */
export function kitColours(teamHue, i) {
  return {
    shirt: new THREE.Color().setHSL(teamHue, 0.55, 0.42 + (i % 3) * 0.05),
    skin: new THREE.Color().setHSL(rnd(0.05, 0.11), 0.38, rnd(0.34, 0.68)),
  };
}
