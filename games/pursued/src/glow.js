// Every light halo in the city (lamps, lanterns, headlights, tail lights) as one instanced,
// camera-facing, additive draw call.
import * as THREE from 'three';

export class Glows {
  constructor(scene, fog, max = 2048) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    g.instanceCount = 0;
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uFog: { value: fog.density } },
      vertexShader: /* glsl */`
        attribute vec3 aPos, aCol; attribute float aSize;
        varying vec2 vQ; varying vec3 vCol;
        uniform float uFog;
        void main(){
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float d = -mv.z;
          // pull the quad toward the camera a little so it is not cut by the lamp glass
          mv.xyz += normalize(-mv.xyz) * min(aSize*0.5, d*0.5);
          mv.xy += position.xy * aSize;
          vQ = position.xy;
          float fog = 1.0 - exp(-uFog*uFog*d*d);
          vCol = aCol * (1.0 - fog);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying vec3 vCol;
        void main(){
          float r2 = dot(vQ, vQ);
          if (r2 > 1.0) discard;
          float a = exp(-r2*9.0)*0.55 + exp(-r2*70.0)*1.6 + (1.0 - r2)*0.04;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }
  // returns an index; color is multiplied by intensity (HDR, so it blooms)
  add(pos, color, size, intensity = 1) {
    const i = this.n++;
    this.set(i, pos, color, size, intensity);
    this.geo.instanceCount = this.n;
    return i;
  }
  set(i, pos, color, size, intensity = 1) {
    if (pos) this.aPos.setXYZ(i, pos.x, pos.y, pos.z);
    if (color) { const c = color.isColor ? color : new THREE.Color(color); this.aCol.setXYZ(i, c.r * intensity, c.g * intensity, c.b * intensity); }
    if (size !== undefined && size !== null) this.aSize.setX(i, size);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}
