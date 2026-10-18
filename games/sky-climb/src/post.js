// Screen pass: height-integrated volumetric haze from depth, sun shafts, soft grade, grain, vignette.
import * as THREE from '../vendor/three.module.js';

const FS = `
uniform sampler2D tCol, tDep; uniform mat4 invProj, camWorld; uniform vec3 camPos, sunDir, haze, sunC;
uniform vec2 sunUV, res; uniform float sunVis, time, dens, white, aspect;
varying vec2 vUv;
float rnd(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec4 tc=texture2D(tCol,vUv); vec3 col=tc.rgb; float d=texture2D(tDep,vUv).x;
  vec4 v=invProj*vec4(vUv*2.-1.,d*2.-1.,1.); v/=v.w; vec3 wp=(camWorld*v).xyz;
  vec3 ray=wp-camPos; float dist=length(ray); vec3 rd=ray/dist;
  float sky=1.-tc.a;
  float k=.009; float base=dens*exp(-k*(camPos.y+14.)); float dy=ray.y;
  float f=abs(k*dy)>.001?(1.-exp(-k*dy))/(k*dy):1.;
  float fog=1.-exp(-base*f*dist);
  fog=mix(fog,(1.-smoothstep(-.05,.35,rd.y))*.4,sky);
  float sa=pow(max(dot(rd,sunDir),0.),6.);
  vec3 fc=mix(haze,sunC*1.05,sa*.65);
  col=mix(col,fc,clamp(fog,0.,.9));
  // sun shafts through the haze (occlusion march toward the sun)
  vec2 dl=(vUv-sunUV)*(1./32.)*.9; vec2 uv=vUv-dl*rnd(vUv+fract(time)); float il=0., dc=1.;
  for(int i=0;i<32;i++){uv-=dl; vec2 q=clamp(uv,0.,1.); float s=1.-texture2D(tCol,q).a; vec2 o=(q-sunUV)*vec2(aspect,1.); il+=s*dc*exp(-dot(o,o)*3.); dc*=.955;}
  col+=sunC*il*(.022*sunVis);
  // grade: soft filmic, low saturation, lifted lavender shadows
  col=aces(col*.82);
  float l=dot(col,vec3(.299,.587,.114)); col=mix(vec3(l),col,.85);
  col=col*.95+vec3(.035,.03,.05)*(1.-l);
  col=pow(col,vec3(1./2.2));
  vec2 c=vUv-.5; col*=1.-dot(c,c)*.55;
  col+=(rnd(vUv*res+time)-.5)*.025;
  col=mix(col,vec3(.98,.97,.97),white);
  gl_FragColor=vec4(col,1.);
}`;

export class Post {
  constructor(r, SUN) {
    this.r = r; this.SUN = SUN;
    const s = r.getDrawingBufferSize(new THREE.Vector2());
    this.dt = new THREE.DepthTexture(s.x, s.y); this.dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, depthTexture: this.dt });
    this.u = {
      tCol: { value: this.rt.texture }, tDep: { value: this.dt }, invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
      camPos: { value: new THREE.Vector3() }, sunDir: { value: SUN }, haze: { value: new THREE.Color(0xd9cfd8) }, sunC: { value: new THREE.Color(0xffd6ae) },
      sunUV: { value: new THREE.Vector2() }, res: { value: new THREE.Vector2(s.x, s.y) }, sunVis: { value: 0 }, time: { value: 0 }, dens: { value: .0055 }, white: { value: 0 }, aspect: { value: s.x / s.y },
    };
    this.q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: this.u, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: FS }));
    this.q.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.q); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.tmp = new THREE.Vector3(); this.fw = new THREE.Vector3();
  }
  resize() { const s = this.r.getDrawingBufferSize(new THREE.Vector2()); this.rt.setSize(s.x, s.y); this.u.res.value.set(s.x, s.y); this.u.aspect.value = s.x / s.y; }
  render(scene, cam, t) {
    const r = this.r; r.setRenderTarget(this.rt); r.render(scene, cam); r.setRenderTarget(null);
    const u = this.u; u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); u.camPos.value.copy(cam.position); u.time.value = t;
    this.tmp.copy(cam.position).addScaledVector(this.SUN, 500).project(cam);
    u.sunUV.value.set(this.tmp.x * .5 + .5, this.tmp.y * .5 + .5);
    cam.getWorldDirection(this.fw); u.sunVis.value = Math.max(0, this.fw.dot(this.SUN)) ** 2 * (this.tmp.z < 1 ? 1 : 0);
    r.render(this.qs, this.qc);
  }
}
