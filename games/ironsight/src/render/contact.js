// Soft contact shadows (ambient occlusion blobs) so everything sits on the ground even where
// no shadow-casting light reaches. One instanced draw for all of them.
import * as THREE from 'three';

let tex = null;
function blobTexture() {
  if (tex) return tex;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
    const v = Math.max(0, 1 - r) ** 1.8 * 255, i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;   // alphaMap reads green
  }
  g.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(c);
  return tex;
}

export class ContactShadows {
  constructor(scene, max = 1024, opacity = 0.6) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity, depthWrite: false, fog: false }), max);
    this.mesh.count = 0; this.mesh.renderOrder = 2; this.mesh.frustumCulled = false;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3();
    scene.add(this.mesh);
  }
  add(x, y, z, sx, sz = sx, rot = 0) { const i = this.mesh.count++; this.set(i, x, y, z, sx, sz, rot); return i; }
  set(i, x, y, z, sx, sz = sx, rot = 0) {
    this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
    this.m.compose(this.p.set(x, y + 0.006, z), this.q, this.s.set(sx, 1, sz));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
