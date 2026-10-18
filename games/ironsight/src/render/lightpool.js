// Forward rendering pays for every light on every pixel, and changing the light count recompiles
// shaders. So the city has hundreds of "virtual" lights but only a fixed pool of real ones,
// handed each frame to the virtual lights that matter most to the camera.
import * as THREE from 'three';

export class LightPool {
  // make(): creates one real light; apply(real, virtual, weight) copies the virtual light onto it
  constructor(scene, size, make, apply) {
    this.real = Array.from({ length: size }, () => { const l = make(); scene.add(l); if (l.target) scene.add(l.target); return l; });
    this.apply = apply;
    this.virtual = [];
    this._fwd = new THREE.Vector3();
  }
  add(v) { this.virtual.push(v); return v; }
  update(camera) {
    const fwd = camera.getWorldDirection(this._fwd), cp = camera.position;
    for (const v of this.virtual) {
      const dx = v.pos.x - cp.x, dz = v.pos.z - cp.z, dy = v.pos.y - cp.y;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const ahead = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      // lights behind the camera still matter if they are close (they light what we see)
      v._score = d * (ahead > -0.1 ? 1 : 1 + Math.min(3, d / 8)) / (v.priority || 1);
    }
    const ranked = this.virtual.slice().sort((a, b) => a._score - b._score);
    const n = this.real.length;
    for (let i = 0; i < n; i++) {
      const r = this.real[i], v = ranked[i];
      if (!v) { r.intensity = 0; continue; }
      // fade the last few slots so lights handed over at the edge of the pool do not pop
      const w = THREE.MathUtils.clamp((n - i) / 3, 0, 1);
      this.apply(r, v, w);
    }
  }
}
