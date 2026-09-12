// =====================================================================
// HIGHRISE :: gizmo.js - THE HANDLES ON THE SELECTED OBJECT
// =====================================================================
//
// Liam: *"make it so I can delete items for movment rotation and scaling
// make it like unity with the arrows on the object and stuff"*.
//
// Nudging with the arrow keys works and is precise, and it is a terrible
// way to put a chair somewhere. What he is describing is direct
// manipulation: grab the thing and move it.
//
// So the selection gets handles, all three kinds visible at once rather
// than behind a mode switch - Unity hides two of them behind W/E/R and
// this editor has already spent W and E on flying. What that costs is a
// slightly busier gizmo; what it buys is never being in the wrong mode.
//
//   THREE ARROWS   drag to move along X, Y or Z
//   A FLAT RING    drag to turn about Y
//   A GREY CUBE    drag to scale uniformly
//
// The maths is the same for all three and it is worth stating once,
// because getting it wrong is what makes a gizmo feel like ice:
//
// A drag is not a mouse delta applied to an object. It is a POINT ON THE
// OBJECT'S AXIS that the pointer is over, and you move the object so that
// the point stays under the pointer. That means solving, every frame, for
// the closest approach between the axis line and the ray from the camera
// through the cursor. Do it that way and the handle stays welded to the
// pointer at any angle and any distance; do it with a delta and it drifts
// the moment you are not looking down a convenient axis.
import * as THREE from '../vendor/three.module.js';

const COL = { x: 0xe0503c, y: 0x62c24a, z: 0x3c78e0, ring: 0xe0c040, scale: 0xcfd3dc };
const HOT = 0xffffff;

/** an arrow: a shaft and a head, pointing down +axis, pickable as one */
function arrow(dir, colour) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: colour, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), mat);
  shaft.position.y = 0.31;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 8), mat);
  head.position.y = 0.70;
  // A FAT INVISIBLE SHAFT to actually click on. A 12 mm cylinder is the
  // right thickness to look at and far too thin to hit with a mouse; the
  // pick target is a 9 cm sleeve round it that never renders.
  const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.78, 5),
    new THREE.MeshBasicMaterial({ visible: false }));
  grab.position.y = 0.39;
  g.add(shaft, head, grab);
  if (dir === 'x') g.rotation.z = -Math.PI / 2;
  if (dir === 'z') g.rotation.x = Math.PI / 2;
  g.userData.handle = dir;
  g.userData.mat = mat;
  g.userData.base = colour;
  return g;
}

export class Gizmo {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.renderOrder = 999;
    this.root.visible = false;
    scene.add(this.root);

    this.handles = [];
    for (const d of ['x', 'y', 'z']) {
      const a = arrow(d, COL[d]);
      this.root.add(a);
      this.handles.push(a);
    }

    // ---- the turn ring ----------------------------------------------
    const ringMat = new THREE.MeshBasicMaterial({ color: COL.ring, depthTest: false,
                                                  side: THREE.DoubleSide });
    const ring = new THREE.Group();
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.008, 4, 40), ringMat);
    const grabR = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 4, 24),
      new THREE.MeshBasicMaterial({ visible: false }));
    ring.add(r1, grabR);
    ring.rotation.x = Math.PI / 2;
    ring.userData.handle = 'ry';
    ring.userData.mat = ringMat;
    ring.userData.base = COL.ring;
    this.root.add(ring);
    this.handles.push(ring);

    // ---- A SCALE HANDLE PER AXIS ------------------------------------
    //
    // Liam: *"let me create and shape my walls not just a scale but size
    // so width height and length scaling like unity"*.
    //
    // Unity's convention, because it is the one he means: the ARROW on an
    // axis moves along it, and a CUBE further out on the same axis
    // stretches that axis alone. Same colours as the arrows, so there is
    // nothing new to learn - the red one is still x.
    for (const d of ['x', 'y', 'z']) {
      const m = new THREE.MeshBasicMaterial({ color: COL[d], depthTest: false });
      const h = new THREE.Group();
      h.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), m));
      h.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.17),
        new THREE.MeshBasicMaterial({ visible: false })));
      h.position.set(d === 'x' ? 0.86 : 0, d === 'y' ? 0.86 : 0, d === 'z' ? 0.86 : 0);
      h.userData.handle = 's' + d;
      h.userData.mat = m;
      h.userData.base = COL[d];
      this.root.add(h);
      this.handles.push(h);
    }

    // ---- the uniform scale cube -------------------------------------
    const sMat = new THREE.MeshBasicMaterial({ color: COL.scale, depthTest: false });
    const cube = new THREE.Group();
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), sMat);
    const grabC = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ visible: false }));
    cube.add(c1, grabC);
    cube.position.set(0.42, 0.42, 0.42);
    cube.userData.handle = 'scale';
    cube.userData.mat = sMat;
    cube.userData.base = COL.scale;
    this.root.add(cube);
    this.handles.push(cube);

    this.drag = null;
    this.hover = null;
  }

  /** sit on the object, at a size that stays readable at any distance */
  update(target, cam) {
    if (!target) { this.root.visible = false; return; }
    this.root.visible = true;
    // THE CENTRE OF THE THING, not its origin. A prop's origin is on the
    // floor between its feet, and a gizmo down there is half buried.
    const b = new THREE.Box3().setFromObject(target);
    const c = b.getCenter(new THREE.Vector3());
    this.root.position.copy(c);
    // CONSTANT SIZE ON SCREEN. A gizmo that shrinks with distance is one
    // you cannot grab across a room.
    const d = cam.position.distanceTo(c);
    this.root.scale.setScalar(Math.max(0.35, d * 0.16));
  }

  /** the handle under the cursor, if any */
  pick(ray) {
    const hit = ray.intersectObject(this.root, true);
    if (!hit.length) return null;
    let o = hit[0].object;
    while (o && !o.userData.handle) o = o.parent;
    return o ? o.userData.handle : null;
  }

  paint(name) {
    if (this.hover === name) return;
    this.hover = name;
    for (const h of this.handles)
      h.userData.mat.color.setHex(h.userData.handle === name ? HOT : h.userData.base);
  }

  // -------------------------------------------------------------------
  /**
   * Where a ray comes closest to the axis line through `origin`.
   *
   * Standard closest-approach of two lines. `t` is the distance ALONG the
   * axis from the origin, and it is the only number a translate drag
   * needs - the perpendicular part is exactly the bit you want to ignore.
   */
  static along(origin, axis, ray) {
    const w0 = new THREE.Vector3().subVectors(origin, ray.ray.origin);
    const u = axis, v = ray.ray.direction;
    const a = u.dot(u), b = u.dot(v), c = v.dot(v);
    const d = u.dot(w0), e = v.dot(w0);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-6) return null;      // looking straight down it
    return (b * e - c * d) / den * -1;
  }

  /** the point where the ray meets the horizontal plane through `y` */
  static onPlane(y, ray) {
    const dy = ray.ray.direction.y;
    if (Math.abs(dy) < 1e-5) return null;
    const t = (y - ray.ray.origin.y) / dy;
    if (t < 0) return null;
    return ray.ray.at(t, new THREE.Vector3());
  }

  begin(name, target, ray) {
    const p = target.position;
    const centre = this.root.position.clone();
    const g = {
      name, target,
      p0: p.clone(),
      ry0: target.rotation.y,
      s0: target.scale.x,
      sv0: target.scale.clone(),
      centre,
    };
    if (name === 'x' || name === 'y' || name === 'z') {
      const axis = new THREE.Vector3(name === 'x' ? 1 : 0, name === 'y' ? 1 : 0, name === 'z' ? 1 : 0);
      g.axis = axis;
      g.t0 = Gizmo.along(centre, axis, ray) ?? 0;
    } else if (name === 'ry') {
      const hit = Gizmo.onPlane(centre.y, ray);
      g.a0 = hit ? Math.atan2(hit.x - centre.x, hit.z - centre.z) : 0;
    } else if (name === 'scale') {
      const hit = Gizmo.onPlane(centre.y, ray);
      g.d0 = hit ? Math.max(0.15, hit.distanceTo(centre)) : 1;
    } else if (name === 'sx' || name === 'sy' || name === 'sz') {
      // The SAME closest-approach solve the move arrows use. A scale
      // handle dragged by a mouse delta drifts off the axis within a
      // second or two; solving the ray against the axis line every frame
      // means the cube stays under the cursor however far you swing it.
      const d = name[1];
      const axis = new THREE.Vector3(d === 'x' ? 1 : 0, d === 'y' ? 1 : 0, d === 'z' ? 1 : 0);
      g.axis = axis;
      g.d = d;
      const t = Gizmo.along(centre, axis, ray);
      // never zero: dragging from the centre would divide by it
      g.t0 = (t === null || Math.abs(t) < 0.12) ? 0.12 : t;
    }
    this.drag = g;
    return g;
  }

  /** returns true if the object moved */
  move(ray, snap) {
    const g = this.drag;
    if (!g) return false;
    const o = g.target;
    if (g.name === 'x' || g.name === 'y' || g.name === 'z') {
      const t = Gizmo.along(g.centre, g.axis, ray);
      if (t === null) return false;
      let d = t - g.t0;
      if (snap) d = Math.round(d / snap) * snap;
      o.position.copy(g.p0).addScaledVector(g.axis, d);
    } else if (g.name === 'ry') {
      const hit = Gizmo.onPlane(g.centre.y, ray);
      if (!hit) return false;
      let a = Math.atan2(hit.x - g.centre.x, hit.z - g.centre.z) - g.a0;
      if (snap) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      o.rotation.y = g.ry0 - a;
    } else if (g.name === 'scale') {
      const hit = Gizmo.onPlane(g.centre.y, ray);
      if (!hit) return false;
      const k = Math.max(0.1, Math.min(12, g.s0 * (hit.distanceTo(g.centre) / g.d0)));
      o.scale.setScalar(k);
    } else if (g.name === 'sx' || g.name === 'sy' || g.name === 'sz') {
      const t = Gizmo.along(g.centre, g.axis, ray);
      if (t === null) return false;
      let k = (t / g.t0) * g.sv0[g.d];
      // A RATIO, snapped in RATIO. Snapping the multiplier to 0.05 gives
      // round numbers you can hit twice - 1.00, 1.50, 2.00 - which is
      // what makes a row of walls the same size as each other.
      if (snap) k = Math.round(k / 0.05) * 0.05;
      o.scale[g.d] = Math.max(0.02, Math.min(24, k));
    }
    return true;
  }

  end() { const g = this.drag; this.drag = null; return g; }
}
