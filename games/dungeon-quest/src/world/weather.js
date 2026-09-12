// WEATHER.
//
// A box of falling flakes that travels with the camera and wraps around it, so
// a few hundred points cover the whole level. Drawn as square, unlit, unfogged
// pixels -- on a frozen mountain the snow should read as part of the picture,
// not as a soft modern particle system.
import * as THREE from 'three';

export class Snowfall {
  /**
   * @param opts.count   how many flakes
   * @param opts.box     half-extent of the volume that follows the camera
   * @param opts.fall    metres per second downward
   * @param opts.drift   sideways wander
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.count = opts.count ?? 900;
    this.box = opts.box ?? 44;
    this.fall = opts.fall ?? 3.4;
    this.drift = opts.drift ?? 1.1;
    this.t = 0;

    const pos = new Float32Array(this.count * 3);
    this.phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * this.box;
      pos[i * 3 + 1] = Math.random() * this.box * 1.5;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * this.box;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // never cull it: the points move every frame and the bounds are meaningless
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: opts.color ?? '#eef6ff',
      size: opts.size ?? 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: opts.opacity ?? 0.9,
      depthWrite: false,
      fog: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  update(dt, camera) {
    this.t += dt;
    const a = this.points.geometry.attributes.position;
    const arr = a.array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const B = this.box, H = B * 1.5;

    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      arr[j + 1] -= this.fall * dt;
      arr[j] += Math.sin(this.t * 0.8 + this.phase[i]) * this.drift * dt;
      arr[j + 2] += Math.cos(this.t * 0.6 + this.phase[i]) * this.drift * dt * 0.6;

      // wrap the volume around the camera rather than respawning at an edge:
      // walking in any direction keeps you in the middle of the weather
      if (arr[j] - cx > B) arr[j] -= B * 2; else if (arr[j] - cx < -B) arr[j] += B * 2;
      if (arr[j + 2] - cz > B) arr[j + 2] -= B * 2;
      else if (arr[j + 2] - cz < -B) arr[j + 2] += B * 2;
      if (arr[j + 1] - cy < -B * 0.6) arr[j + 1] += H;
      else if (arr[j + 1] - cy > H) arr[j + 1] -= H;
    }
    a.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
