// BANNERFALL :: render/overlays.js - build ghosts (trench ribbon, wall pieces, tower), formation
// drag ghosts, ink order arrows, and the wave-incoming marker.
import * as THREE from '../../vendor/three.module.js';

export function createOverlays(scene, heightAt) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- trench ghost: a ribbon draped on the ground
  const tMat = new THREE.MeshBasicMaterial({ color: 0x8a5a2e, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 });
  const tBad = new THREE.MeshBasicMaterial({ color: 0xd23a2a, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 });
  let ribbon = null, ribbonBad = null;
  function ribbonGeo(pts, w) {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * w, nz = (dx / L) * w;
      const ya = heightAt(a[0], a[1]) + 0.12, yb = heightAt(b[0], b[1]) + 0.12;
      pos.push(a[0] + nx, ya, a[1] + nz, a[0] - nx, ya, a[1] - nz, b[0] + nx, yb, b[1] + nz);
      pos.push(a[0] - nx, ya, a[1] - nz, b[0] - nx, yb, b[1] - nz, b[0] + nx, yb, b[1] + nz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  function showTrench(pv) {
    clearTrench();
    if (!pv || !pv.pts) return;
    const g = new THREE.Group();
    for (const run of pv.runs) g.add(new THREE.Mesh(ribbonGeo(run, 1.8), pv.afford ? tMat : tBad));
    // red crosses where it cannot go
    const crossPts = [];
    for (let i = 0; i < pv.bad.length; i += 2) {
      const p = pv.bad[i], y = heightAt(p[0], p[1]) + 0.15;
      crossPts.push(p[0] - 0.6, y, p[1] - 0.6, p[0] + 0.6, y, p[1] + 0.6, p[0] - 0.6, y, p[1] + 0.6, p[0] + 0.6, y, p[1] - 0.6);
    }
    if (crossPts.length) {
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(crossPts, 3));
      g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xff3020, toneMapped: false, depthTest: false })));
    }
    ribbon = g;
    group.add(g);
  }
  function clearTrench() { if (ribbon) { group.remove(ribbon); ribbon.traverse((o) => o.geometry && o.geometry.dispose()); ribbon = null; } }

  // ---- wall / gate / tower ghosts
  const okMat = new THREE.MeshBasicMaterial({ color: 0x9fe08a, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const badMat = new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  let ghosts = null;
  function showSegs(pv, height = 3.5, thick = 0.7, size = 4.4) {
    clearSegs();
    if (!pv) return;
    ghosts = new THREE.Group();
    if (pv.segs) for (const s of pv.segs) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, height, Math.max(0.5, thick)), s.ok && pv.afford ? okMat : badMat);
      const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2;
      m.position.set(mx, heightAt(mx, mz) + height / 2, mz);
      m.rotation.y = Math.atan2(-dz, dx);
      ghosts.add(m);
    }
    if (pv.pos) {
      const sz = Math.max(3, size || 4.4), hh = Math.max(4, Math.min(20, pv.height || 9));
      const m = new THREE.Mesh(new THREE.BoxGeometry(sz, hh, sz), pv.ok && pv.afford ? okMat : badMat);
      m.position.set(pv.pos[0], heightAt(pv.pos[0], pv.pos[1]) + hh / 2, pv.pos[1]);
      if (pv.rot !== undefined) m.rotation.y = pv.rot;
      ghosts.add(m);
    }
    group.add(ghosts);
  }
  function clearSegs() { if (ghosts) { group.remove(ghosts); ghosts.traverse((o) => o.geometry && o.geometry.dispose()); ghosts = null; } }

  // ---- formation ghost: little discs where each man will stand + a facing arrow
  const discGeo = new THREE.CircleGeometry(0.38, 12); discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
  const discs = new THREE.InstancedMesh(discGeo, discMat, 600); discs.count = 0; discs.frustumCulled = false; discs.renderOrder = 4;
  group.add(discs);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const arrowShape = new THREE.Shape(); arrowShape.moveTo(-0.5, 0); arrowShape.lineTo(0.5, 0); arrowShape.lineTo(0.5, 1.6); arrowShape.lineTo(1.3, 1.6); arrowShape.lineTo(0, 3.2); arrowShape.lineTo(-1.3, 1.6); arrowShape.lineTo(-0.5, 1.6); arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape); arrowGeo.rotateX(Math.PI / 2);
  const facingArrows = [];
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(arrowGeo, arrowMat); m.visible = false; m.renderOrder = 4; group.add(m); facingArrows.push(m); }
  const m4 = new THREE.Matrix4();
  function showFormation(list) {
    let n = 0;
    facingArrows.forEach((a) => (a.visible = false));
    if (list) list.forEach((f, i) => {
      for (const p of f.slots) { if (n < 600) { m4.makeTranslation(p[0], heightAt(p[0], p[1]) + 0.08, p[1]); discs.setMatrixAt(n++, m4); } }
      const a = facingArrows[i];
      if (a) { a.visible = true; a.position.set(f.centre[0] + Math.sin(f.facing) * 2.5, heightAt(f.centre[0], f.centre[1]) + 0.1, f.centre[1] + Math.cos(f.facing) * 2.5); a.rotation.y = f.facing; }
    });
    discs.count = n; discs.instanceMatrix.needsUpdate = true;
  }

  // ---- ink order lines that fade
  const orders = [];
  function orderLine(from, to, kind) {
    const pts = [];
    const N = 24;
    const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let i = 0; i <= N; i++) {
      const k = i / N, x = from[0] + (to[0] - from[0]) * k, z = from[1] + (to[1] - from[1]) * k;
      pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.4 + Math.sin(k * Math.PI) * Math.min(6, L * 0.08), z));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const col = kind === 'attack' ? 0xff6a4a : kind === 'attackMove' ? 0xffb050 : 0xfff0c0;
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: col, dashSize: 1.2, gapSize: 0.7, transparent: true, depthTest: false, toneMapped: false }));
    line.computeLineDistances(); line.renderOrder = 8;
    group.add(line);
    // a ring at the destination
    const r = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, toneMapped: false }));
    r.position.set(to[0], heightAt(to[0], to[1]) + 0.15, to[1]); r.renderOrder = 8;
    group.add(r);
    orders.push({ line, r, t: 0 });
  }

  // ---- wave incoming marker: a red pennant arrow at the map edge
  const markers = [];
  function waveMarker(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), new THREE.MeshBasicMaterial({ color: 0x2a2326 }));
    pole.position.y = 7;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: 0xc8302a, side: THREE.DoubleSide, toneMapped: false }));
    flag.position.set(2.5, 12, 0);
    g.add(pole, flag);
    g.position.set(x, heightAt(x, z), z);
    group.add(g);
    markers.push({ g, t: 0, flag });
  }

  function update(dt, t, cam) {
    for (let i = orders.length - 1; i >= 0; i--) {
      const o = orders[i]; o.t += dt;
      const a = 1 - o.t / 1.6;
      if (a <= 0) { group.remove(o.line, o.r); o.line.geometry.dispose(); o.r.geometry.dispose(); orders.splice(i, 1); continue; }
      o.line.material.opacity = a; o.r.material.opacity = a; o.r.scale.setScalar(1 + o.t * 0.4);
    }
    for (let i = markers.length - 1; i >= 0; i--) {
      const m = markers[i]; m.t += dt;
      m.flag.rotation.y = Math.sin(t * 3) * 0.3;
      if (m.t > 12) { group.remove(m.g); markers.splice(i, 1); }
    }
  }

  return { showTrench, clearTrench, showSegs, clearSegs, showFormation, orderLine, waveMarker, update };
}
