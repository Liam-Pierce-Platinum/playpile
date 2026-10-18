// Watercolour look: every surface is a ShaderMaterial built on shared pigment noise,
// then a post pass adds paper grain, wobble, edge pooling and a warm vignette.
import * as THREE from '../vendor/three.module.js';

export const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;
export const PAPER = new THREE.Color(0xf6efe0);

// lit object paint: two-tone wash with a noisy terminator, pooled pigment edge, paper highlights
export function wash(color, shade, opts = {}) {
  const c = new THREE.Color(color);
  const s = shade !== undefined ? new THREE.Color(shade) : c.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x4a4a8a), 0.3);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uShade: { value: s }, uLight: { value: new THREE.Vector3(-0.4, 0.8, 0.45).normalize() }, uPaper: { value: PAPER }, uGrain: { value: opts.grain ?? 1.0 } },
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal);
        vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + `uniform vec3 uColor,uShade,uLight,uPaper; uniform float uGrain; varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main(){ vec3 n=normalize(vN); float d=dot(n,uLight)*0.5+0.5;
        float nz=fbm(vW.xy*2.1+vW.z*1.3);
        float t=smoothstep(0.38,0.62,d+(nz-0.5)*0.38);
        vec3 c=mix(uShade,uColor,t);
        float edge=1.0-abs(t-0.5)*2.0; c*=1.0-edge*0.16;
        c=mix(c,c*c*1.15,(fbm(vW.xy*9.0)-0.4)*0.5*uGrain);
        c=mix(c,uPaper,smoothstep(0.82,1.0,d+(nz-0.5)*0.25)*0.65);
        float rim=pow(1.0-max(dot(n,vV),0.0),2.5); c=mix(c,uPaper,rim*0.35);
        gl_FragColor=vec4(c,1.0); }`,
  });
}

// ground strip: aD = depth below surface (0 at grass edge). Grass band, soil washes, bottom bleeds into paper.
export function terrainMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uGrass: { value: new THREE.Color() }, uSoil: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uPaper: { value: PAPER } },
    vertexShader: `attribute float aD; attribute float aTop; varying float vD; varying float vTop; varying vec3 vW;
      void main(){ vD=aD; vTop=aTop; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + `uniform vec3 uGrass,uSoil,uDeep,uPaper; varying float vD; varying float vTop; varying vec3 vW;
      void main(){
        float n=fbm(vec2(vW.x*0.35, vD*0.8+vW.z*0.3));
        float n2=fbm(vec2(vW.x*1.7, vD*3.0));
        vec3 c;
        if(vTop>0.5){ // top face, seen at a grazing angle: lighter grass, stippled
          c=mix(uGrass, uPaper, 0.25+0.35*fbm(vW.xz*vec2(0.8,2.0)));
        } else {
          float g=0.42+(n-0.5)*0.5;
          float band=smoothstep(g, g-0.12, vD);
          vec3 soil=mix(uSoil,uDeep,smoothstep(0.5,5.0,vD+(n-0.5)*3.0));
          soil=mix(soil, soil*0.82, smoothstep(0.55,0.75,n2));
          c=mix(soil,uGrass,band);
          float rim=smoothstep(0.1,0.0,abs(vD-g)); c*=1.0-rim*0.22; // pooled pigment at the wash edge
          c*=1.0-smoothstep(0.06,0.0,vD)*0.25;
          float fade=smoothstep(4.0,9.5,vD+(n-0.5)*4.0); c=mix(c,uPaper,fade); // wash runs dry
        }
        c=mix(c,c*c*1.2,(n2-0.45)*0.35);
        gl_FragColor=vec4(c,1.0); }`,
  });
}

// distant hills: silhouette computed per world-x in the vertex shader so the strip can follow the camera
export function layerMat(seed, amp, freq) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uPaper: { value: PAPER }, uOff: { value: 0 }, uBase: { value: 0 }, uSeed: { value: seed }, uAmp: { value: amp }, uFreq: { value: freq } },
    transparent: true, depthWrite: false,
    vertexShader: NOISE + `attribute float aTop; uniform float uOff,uBase,uSeed,uAmp,uFreq; varying float vT; varying vec2 vP;
      void main(){ vec3 p=position; float wx=p.x+uOff;
        float h=uBase+uAmp*(fbm(vec2(wx*uFreq,uSeed))*1.6-0.3);
        if(aTop>0.5) p.y=h; vT=aTop; vP=vec2(wx,p.y-h);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p.x+uOff,p.y,p.z,1.0); }`,
    fragmentShader: NOISE + `uniform vec3 uColor,uPaper; uniform float uSeed; varying float vT; varying vec2 vP;
      void main(){ float d=-vP.y; float n=fbm(vP*0.06+uSeed);
        float a=1.0-smoothstep(4.0,28.0+n*20.0,d);
        vec3 c=mix(uColor,uColor*0.8,smoothstep(1.4,0.0,d)*0.6);
        c=mix(c,c*0.9,smoothstep(0.5,0.7,fbm(vP*0.15)));
        gl_FragColor=vec4(mix(uPaper,c,a*(0.75+0.25*n)),1.0); }`,
  });
}

export function skyMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uPaper: { value: PAPER }, uScroll: { value: 0 } },
    depthWrite: false,
    vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `uniform vec3 uTop,uLow,uPaper; uniform float uScroll; varying vec2 vU;
      void main(){ vec2 p=vec2(vU.x*3.0+uScroll, vU.y*1.4);
        float n=fbm(p*2.0);
        vec3 c=mix(uLow,uTop,smoothstep(0.2,1.0,vU.y+(n-0.5)*0.35));
        float cl=smoothstep(0.55,0.75,fbm(p*vec2(1.3,3.0)+vec2(0.0,4.0)))*smoothstep(0.35,0.7,vU.y);
        c=mix(c,uPaper,cl*0.85);
        c=mix(c,uPaper,smoothstep(0.5,0.0,vU.y)*0.5);
        gl_FragColor=vec4(c,1.0); }`,
  });
}

// post: paper grain + fibres, wobble displacement, colour-edge darkening, gentle bleed, vignette
export function postMat() {
  return new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uT: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader: NOISE + `uniform sampler2D tScene; uniform vec2 uRes; uniform float uT,uFlash; varying vec2 vU;
      vec3 S(vec2 u){ return texture2D(tScene,u).rgb; }
      void main(){
        vec2 px=1.0/uRes; vec2 sc=vU*uRes/600.0;
        float jitter=floor(uT*6.0);
        vec2 w=vec2(fbm(sc*4.0+jitter*0.13), fbm(sc*4.0+7.7+jitter*0.13))-0.5;
        vec2 u=vU+w*px*3.5;
        vec3 c=S(u);
        vec3 bl=(S(u+vec2(px.x*2.0,0.0))+S(u-vec2(px.x*2.0,0.0))+S(u+vec2(0.0,px.y*2.0))+S(u-vec2(0.0,px.y*2.0)))*0.25;
        vec3 diff=abs(c-bl); float e=clamp((diff.r+diff.g+diff.b)*2.2,0.0,1.0);
        c=mix(c,bl,0.35);                 // soft bleed
        c*=1.0-e*0.32;                    // pigment pools at colour boundaries
        float g=fbm(vU*uRes*0.22); float g2=fbm(vU*uRes*vec2(0.04,0.6));
        c*=0.93+0.1*g; c*=0.985+0.02*g2;  // paper tooth + fibres
        c=mix(c,c*c,(fbm(vU*uRes*0.05)-0.5)*0.25); // granulation blooms
        vec2 q=vU-0.5; c*=1.0-dot(q,q)*0.45; c=mix(c,vec3(0.96,0.9,0.78),dot(q,q)*0.25);
        c=mix(c,vec3(1.0,0.97,0.88),uFlash);
        gl_FragColor=vec4(c,1.0); }`,
    depthTest: false, depthWrite: false,
  });
}

// soft blob texture for dust/splash sprites
export function blobTexture(rgb) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 32 + (Math.random() - 0.5) * 22, y = 32 + (Math.random() - 0.5) * 22, r = 8 + Math.random() * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},0.25)`); gr.addColorStop(0.8, `rgba(${rgb},0.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); return t;
}
