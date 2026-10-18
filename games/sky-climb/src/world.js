// Procedural junk tower: spiral path of climbable junk, a junk spine, filler catches, shards, the Bell.
import * as THREE from '../vendor/three.module.js';

export const shared = { uRim: { value: new THREE.Color(0xd8cfe6) }, uTime: { value: 0 } };
export const NOISE = `
float h3(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vnoise(p);p*=2.03;a*=.5;}return s;}
`;

export const ZONES = [
  { name: 'The Scrap Shore', haze: 0xd9cfd8, pal: [0x9b7b6a, 0x7d8794, 0xc8b9a0, 0x7f9e98], types: ['crate', 'tire', 'suitcase', 'beam', 'washer'] },
  { name: 'Pipe Gardens', haze: 0xcfd8d4, pal: [0x8a9a86, 0xa98468, 0x6f7d84, 0x9aa77f], types: ['pipe', 'crate', 'valve', 'beam', 'tire'] },
  { name: 'Laundry Winds', haze: 0xdcd6e4, pal: [0xd8cfc4, 0xb3a2b8, 0x93a7b9, 0xc49d98], types: ['washer', 'line', 'basket', 'suitcase', 'beam'] },
  { name: 'Paper Kite Reach', haze: 0xe6d9cf, pal: [0xe0d2b4, 0xc77f6d, 0x8ea7b0, 0xd9b77d], types: ['kite', 'teacup', 'beam', 'kite', 'crate'] },
  { name: 'The Drowned Library', haze: 0xc6c8dc, pal: [0x6e6680, 0x9b8a72, 0x5d7486, 0xb6a58c], types: ['books', 'table', 'piano', 'teacup', 'books'] },
  { name: 'Bell of Stillness', haze: 0xeee6e0, pal: [0xe8e2d6, 0xc9b98c, 0xa8b4c4, 0xd6cabb], types: ['column', 'slab', 'beam', 'column'] },
];
export const PER = 22;

const cache = new Map();
export function mat(hex, o = {}) {
  const key = hex + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0, emissive: o.em ?? 0, side: o.side ?? 0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uRim = shared.uRim;
    s.vertexShader = 'varying vec3 vWP;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vWP;\nuniform vec3 uRim;\n' + NOISE + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float nn=vnoise(vWP*1.6)*.55+vnoise(vWP*6.5)*.3+vnoise(vWP*23.)*.15;
        diffuseColor.rgb*=.8+.3*nn;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.86,.84,.97),smoothstep(.55,.2,nn));`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rim=pow(1.0-clamp(abs(dot(normalize(normal),normalize(vViewPosition))),0.,1.),2.5);
        gl_FragColor.rgb+=uRim*rim*.45;`);
  };
  cache.set(key, m);
  return m;
}
function M(geo, c, o) { const m = new THREE.Mesh(geo, mat(c, o)); m.castShadow = m.receiveShadow = true; return m; }
const box = (w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = M(new THREE.BoxGeometry(w, h, d), c, o); m.position.set(x, y, z); return m; };
const cyl = (rt, rb, h, c, seg = 20, o) => M(new THREE.CylinderGeometry(rt, rb, h, seg), c, o);
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

function rngOf(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Each builder returns { g, t:'b'|'c', hx,hy,hz | r,hy, along } centred on the collider centre.
function build(type, R, pal, hard) {
  const g = new THREE.Group(); const pk = () => pal[(R() * pal.length) | 0]; const c1 = pk(), c2 = pk();
  const rr = (a, b) => a + (b - a) * R();
  switch (type) {
    case 'crate': { const w = rr(1.6, 2.4) * (1 - hard * .25), h = rr(1, 1.5), d = rr(1.5, 2.2) * (1 - hard * .2);
      g.add(box(w, h, d, c1)); const s = shade(c1, .7);
      g.add(box(w + .04, .14, d + .04, s, 0, h * .25)); g.add(box(w + .04, .14, d + .04, s, 0, -h * .25)); g.add(box(.14, h + .04, d + .04, s, w * .3)); g.add(box(.14, h + .04, d + .04, s, -w * .3));
      return { g, t: 'b', hx: w / 2, hy: h / 2, hz: d / 2 }; }
    case 'suitcase': { const w = rr(1.8, 2.4), h = .7, d = rr(1.2, 1.5);
      g.add(box(w, h, d, c1, 0, 0, 0, { rough: .6 })); g.add(box(w + .03, .08, d + .03, shade(c1, .6)));
      const hd = M(new THREE.TorusGeometry(.22, .05, 6, 12, Math.PI), 0x4a3f3a); hd.position.set(0, 0, d / 2 + .02); hd.position.y = 0; hd.rotation.set(0, 0, 0); hd.position.y = .1; g.add(hd);
      g.add(box(.12, h + .03, d + .03, 0x6b5a4c, w * .3)); g.add(box(.12, h + .03, d + .03, 0x6b5a4c, -w * .3));
      return { g, t: 'b', hx: w / 2, hy: h / 2, hz: d / 2 }; }
    case 'beam': case 'slab': { const slab = type === 'slab'; const w = slab ? rr(2.2, 3) : rr(3.4, 5), h = slab ? .45 : .35, d = slab ? rr(2, 2.8) : rr(.75, .55 + (1 - hard) * .5);
      g.add(box(w, h, d, slab ? c1 : 0x8c7766)); if (!slab) for (let i = -2; i <= 2; i++) g.add(box(.05, h + .02, d + .02, 0x5a4c42, i * w / 5.5));
      return { g, t: 'b', hx: w / 2, hy: h / 2, hz: d / 2 }; }
    case 'washer': { const s = rr(1.3, 1.6); g.add(box(s, s, s, c1, 0, 0, 0, { rough: .5 })); g.add(box(s * .98, .1, s * .98, shade(c1, .8), 0, s / 2));
      const p = cyl(s * .32, s * .32, .06, 0x55606b, 24, { rough: .2, metal: .3 }); p.rotation.x = Math.PI / 2; p.position.z = s / 2 + .02; g.add(p);
      const gl = cyl(s * .24, s * .24, .07, 0x9fb3c2, 24, { rough: .1 }); gl.rotation.x = Math.PI / 2; gl.position.z = s / 2 + .03; g.add(gl);
      return { g, t: 'b', hx: s / 2, hy: s / 2, hz: s / 2 }; }
    case 'tire': { const r = rr(1.1, 1.5), tb = .32; const t = M(new THREE.TorusGeometry(r - tb, tb, 10, 24), 0x3d3a3c, { rough: 1 }); t.rotation.x = Math.PI / 2; g.add(t);
      const d = cyl(r - tb, r - tb, tb * 1.4, 0x8d8a80, 20); g.add(d); return { g, t: 'c', r, hy: tb }; }
    case 'valve': { const r = rr(1, 1.3), h = .6; g.add(cyl(r, r, h, c1, 22, { metal: .4, rough: .5 }));
      const w = M(new THREE.TorusGeometry(r * .8, .08, 6, 22), 0xa05a48); w.rotation.x = Math.PI / 2; w.position.y = h / 2 - .02; g.add(w);
      const st = cyl(.12, .12, 6, 0x6f7d84, 8); st.position.y = -3.3; g.add(st);
      return { g, t: 'c', r, hy: h / 2 }; }
    case 'pipe': { const L = rr(3, 4.6), r = rr(.45, .6); const p = cyl(r, r, L, c1, 18, { metal: .5, rough: .45 }); p.rotation.z = Math.PI / 2; g.add(p);
      for (const s of [-1, 1]) { const f = cyl(r * 1.3, r * 1.3, .16, shade(c1, .7), 18, { metal: .5, rough: .5 }); f.rotation.z = Math.PI / 2; f.position.x = s * (L / 2 - .1); g.add(f); }
      return { g, t: 'b', hx: L / 2, hy: r, hz: r * .85 }; }
    case 'line': { const w = rr(3.6, 4.6), h = .3, d = .7; g.add(box(w, h, d, 0x9a8676));
      for (let i = 0; i < 4; i++) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(rr(.5, .8), rr(.8, 1.4)), mat(pk(), { side: 2 })); cl.castShadow = true; cl.position.set(-w / 2 + .6 + i * (w - 1.2) / 3, -.8, d / 2 + .05); cl.userData.flap = R() * 6; g.add(cl); }
      return { g, t: 'b', hx: w / 2, hy: h / 2, hz: d / 2 }; }
    case 'basket': { const r = rr(1.1, 1.4), h = .9; g.add(cyl(r, r * .85, h, 0xb59b78, 16)); const rim = M(new THREE.TorusGeometry(r, .07, 6, 20), 0x8d7458); rim.rotation.x = Math.PI / 2; rim.position.y = h / 2; g.add(rim);
      const cl = cyl(r * .92, r * .92, .1, pk(), 16); cl.position.y = h / 2 - .02; g.add(cl); return { g, t: 'c', r, hy: h / 2 }; }
    case 'kite': { const s = rr(2.2, 2.8) * (1 - hard * .15); const k = box(s, .14, s, c1, 0, 0, 0, { rough: .7 }); k.rotation.y = Math.PI / 4; g.add(k);
      const st = box(s * 1.38, .05, .07, 0x6b584a, 0, .09); g.add(st); const st2 = box(.07, .05, s * 1.38, 0x6b584a, 0, .09); g.add(st2);
      for (let i = 0; i < 5; i++) g.add(box(.25, .03, .12, pk(), s * .7 + i * .35, -.15 - i * .12)); return { g, t: 'b', hx: s * .6, hy: .07, hz: s * .6, along: s * .7 }; }
    case 'teacup': { const r = rr(1.2, 1.45), h = .9; g.add(cyl(r, r * .7, h, 0xe9e1d6, 26, { rough: .35 })); const tea = cyl(r * .93, r * .93, .05, 0x8a6a4e, 26, { rough: .1 }); tea.position.y = h / 2 - .02; g.add(tea);
      const sc = cyl(r * 1.35, r * 1.2, .12, 0xe2d8c8, 26, { rough: .35 }); sc.position.y = -h / 2; g.add(sc); const hd = M(new THREE.TorusGeometry(.32, .08, 8, 14), 0xe9e1d6); hd.position.set(r * .95, 0, 0); g.add(hd);
      const band = M(new THREE.TorusGeometry(r * .97, .04, 6, 26), c1); band.rotation.x = Math.PI / 2; band.position.y = h * .3; g.add(band); return { g, t: 'c', r, hy: h / 2 }; }
    case 'books': { const n = 3 + (R() * 3 | 0), bh = .3, w = rr(1.6, 2.1), d = rr(1.1, 1.4);
      for (let i = 0; i < n; i++) { const b = box(w * rr(.92, 1.05), bh, d * rr(.9, 1), pk(), 0, -n * bh / 2 + bh / 2 + i * bh); b.rotation.y = rr(-.08, .08); g.add(b); g.add(box(w * .9, bh * .8, .02, 0xe8dfcf, 0, b.position.y, d * .45 + .01)); }
      return { g, t: 'b', hx: w / 2, hy: n * bh / 2, hz: d / 2 }; }
    case 'table': { const w = rr(2.2, 2.8), d = rr(1.4, 1.8); g.add(box(w, .16, d, 0x7a5f4c, 0, 0, 0, { rough: .6 }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(.12, 1.1, .12, 0x6a5040, sx * (w / 2 - .15), -.63, sz * (d / 2 - .15)));
      return { g, t: 'b', hx: w / 2, hy: .08, hz: d / 2 }; }
    case 'piano': { const w = rr(2.4, 2.8), h = 1, d = 1.3; g.add(box(w, h, d, 0x2f2b33, 0, 0, 0, { rough: .3 })); g.add(box(w * .9, .1, .35, 0xe8e2d6, 0, h * .15, d / 2 + .15));
      for (let i = 0; i < 14; i++) if (i % 7 !== 2 && i % 7 !== 6) g.add(box(.05, .06, .2, 0x1d1a20, -w * .42 + i * w * .065, h * .15 + .07, d / 2 + .08));
      return { g, t: 'b', hx: w / 2, hy: h / 2, hz: d / 2 }; }
    case 'column': default: { const r = rr(1, 1.35), h = 1.2; g.add(cyl(r * .9, r * .95, h, c1, 16)); const cap = box(r * 2.1, .2, r * 2.1, shade(c1, .9), 0, h / 2 - .1); g.add(cap);
      return { g, t: 'b', hx: r * 1.05, hy: h / 2, hz: r * 1.05 }; }
  }
}

export function buildWorld(scene, SUN) {
  const R = rngOf(20261015);
  const cols = [], movers = [], solids = [], path = [], shards = [], flaps = [], zoneY = [];
  const root = new THREE.Group(); scene.add(root);
  const addCol = (b, x, y, z, yaw, extra = {}) => {
    b.g.position.set(x, y, z); b.g.rotation.y = yaw; root.add(b.g); solids.push(b.g);
    const c = { t: b.t, x, y, z, hx: b.hx, hy: b.hy, hz: b.hz, r: b.r, co: Math.cos(yaw), si: Math.sin(yaw), obj: b.g, dy: 0, ...extra };
    cols.push(c); b.g.traverse(o => { if (o.userData.flap !== undefined) flaps.push(o); });
    return c;
  };
  // start island
  const isl = new THREE.Group();
  const top = cyl(12, 9, 2, 0xa89a8a, 40); isl.add(top);
  const under = M(new THREE.ConeGeometry(9, 14, 24), 0x8a7c74); under.position.y = -8; under.rotation.x = Math.PI; isl.add(under);
  for (let i = 0; i < 18; i++) { const a = R() * 6.28, d = 6 + R() * 5.2, s = .4 + R() * .9; const b = box(s, s * .7, s, ZONES[0].pal[i % 4], Math.cos(a) * d, 1 + s * .35, Math.sin(a) * d); b.rotation.set(R() * .4, R() * 3, R() * .4); isl.add(b); }
  addCol({ g: isl, t: 'c', r: 12, hy: 1 }, 0, -1, 0, 0);

  const N = ZONES.length * PER;
  let ang = 0.6, prevAlong = 2.5, y = 0, prevBob = false;
  let rad = 12;
  for (let i = 0; i < N; i++) {
    const zi = Math.floor(i / PER), Z = ZONES[zi], hard = i / N;
    const type = Z.types[(R() * Z.types.length) | 0];
    const b = build(type, R, Z.pal, hard);
    const bob = zi >= 3 && type !== 'beam' && R() < .2;
    let rise = (i === 0 ? .8 : .35 + R() * 1.15);
    if (R() < .08 && i > 4) rise = -.4;
    if (bob || prevBob) rise = Math.min(rise, .9);
    const gap = 0.9 + R() * (1.0 + hard * 1.5) - (rise > 1.1 ? .5 : 0);
    const along = b.along ?? (b.t === 'c' ? b.r : b.hx);
    rad = 11.5 + Math.sin(i * .23) * 2.5 + (R() - .5) * .6;
    ang += (prevAlong + gap + along) / rad;
    const topY = y + rise; const cy = topY - b.hy;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const yaw = -ang - Math.PI / 2 + (b.t === 'c' ? 0 : 0);
    const c = addCol(b, x, cy, z, yaw + (type === 'beam' || type === 'pipe' || type === 'line' ? 0 : (R() - .5) * .3), { path: i, zone: zi });
    if (bob) { c.baseY = cy; c.amp = .6; c.bs = .9 + R() * .5; c.ph = R() * 6; movers.push(c); }
    path.push(c); if (i % PER === 0) zoneY.push(topY - .5);
    prevAlong = along; y = topY; prevBob = bob;
    // shards
    if (i % 3 === 1 && R() < .8) { const off = R() < .35 ? 1.6 : 0; shards.push({ id: shards.length, pos: new THREE.Vector3(x + Math.cos(ang) * off, topY + 1.2, z + Math.sin(ang) * off) }); }
    // filler catchers outward & below
    if (R() < .5 && i > 2) {
      const fz = ZONES[zi]; const ft = ['crate', 'tire', 'suitcase', 'basket'][(R() * 4) | 0];
      const fb = build(ft, R, fz.pal, 0); const fr = rad + 3.4 + R() * 2; const fa = ang + (R() - .5) * .3;
      addCol(fb, Math.cos(fa) * fr, topY - 1.8 - R() * 2 - fb.hy, Math.sin(fa) * fr, R() * 6);
    }
  }
  const topY = y;
  // spine: stacked giant junk at the centre
  for (let sy = 0; sy < topY - 2; sy += 4.2) {
    const zi = Math.min(ZONES.length - 1, Math.floor(sy / topY * ZONES.length)); const s = 3.4 + R() * 2;
    const g = new THREE.Group(); const cc = ZONES[zi].pal[(R() * 4) | 0];
    g.add(box(s, 3.4 + R(), s * (.8 + R() * .3), shade(cc, .8)));
    g.add(box(s * 1.04, .3, s * .5, shade(cc, .6), 0, 1.2 * (R() - .5)));
    const yaw = R() * 6.28; addCol({ g, t: 'b', hx: s / 2, hy: 1.9, hz: s * .45 }, (R() - .5) * 1.4, sy + 2.2, (R() - .5) * 1.4, yaw);
    g.rotation.z = (R() - .5) * .12;
  }
  // the Bell at the top
  const bellBase = build('slab', R, ZONES[5].pal, 0); bellBase.hx = 3.2; bellBase.hz = 3.2; bellBase.g.clear(); bellBase.g.add(box(6.4, .6, 6.4, 0xd8cfc0)); bellBase.hy = .3;
  ang += (prevAlong + 1.6 + 3.2) / rad;
  const bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad, by = topY + .8;
  const bc = addCol(bellBase, bx, by - .3, bz, -ang, { path: N, zone: 5 }); path.push(bc);
  const arch = new THREE.Group(); arch.position.set(bx, by, bz); arch.rotation.y = -ang; root.add(arch);
  for (const s of [-1, 1]) { const p = cyl(.35, .45, 6, 0xe2d9cc, 14); p.position.set(s * 2.4, 3, 0); arch.add(p); }
  arch.add(box(6, .5, .9, 0xd2c6b4, 0, 6.1, 0));
  const prof = []; for (let k = 0; k <= 16; k++) { const t = k / 16; prof.push(new THREE.Vector2(.25 + 1.2 * Math.pow(t, 1.7) + (t > .9 ? (t - .9) * 3 : 0), 2.4 - t * 2.4)); }
  const bell = M(new THREE.LatheGeometry(prof, 32), 0xcfb27a, { metal: .7, rough: .35, em: 0x3a2a10 }); bell.geometry.computeVertexNormals(); bell.material.side = 2; bell.position.y = 3.4; arch.add(bell);
  const bellPos = new THREE.Vector3(bx, by + 1.2, bz);
  // shard meshes
  const sg = new THREE.OctahedronGeometry(.28, 0); const smat = new THREE.MeshStandardMaterial({ color: 0xffe9c2, emissive: 0xffc98a, emissiveIntensity: 1.6, roughness: .2 });
  for (const s of shards) { s.mesh = new THREE.Mesh(sg, smat); s.mesh.position.copy(s.pos); root.add(s.mesh); }
  // dangling cables
  const lp = []; for (const c of path) { const n = 1 + (R() * 2 | 0); for (let k = 0; k < n; k++) { const ox = (R() - .5) * 1.5, oz = (R() - .5) * 1.5, bot = c.y - c.hy; lp.push(c.x + ox, bot, c.z + oz, c.x + ox + (R() - .5), bot - 3 - R() * 7, c.z + oz + (R() - .5)); } }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5d5560, transparent: true, opacity: .55 })));
  // orbiting debris
  const DN = 110; const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0x8f8790), DN); deb.castShadow = true;
  const debD = []; for (let i = 0; i < DN; i++) debD.push({ r: 18 + R() * 30, a: R() * 6.28, y: -8 + R() * (topY + 30), s: .2 + R() * .9, sp: (.02 + R() * .05) * (R() < .5 ? 1 : -1), rx: R() * 6, ry: R() * 6 });
  root.add(deb);
  return { cols, movers, solids, path, shards, flaps, zoneY, topY, bellPos, bell, deb, debD, start: new THREE.Vector3(Math.cos(.15) * 9.5, 0, Math.sin(.15) * 9.5) };
}

// sky dome, cloud sea, cloud puffs
export function buildSky(scene, SUN, topY) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDir: { value: SUN }, zen: { value: new THREE.Color(0x8e9fb8) }, hor: { value: new THREE.Color(0xe2d4d8) }, sunC: { value: new THREE.Color(0xffd9b0) }, t: shared.uTime },
    vertexShader: 'varying vec3 vD; void main(){vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww;}',
    fragmentShader: NOISE + `varying vec3 vD; uniform vec3 sunDir,zen,hor,sunC; uniform float t;
      void main(){vec3 d=normalize(vD); float h=d.y;
        vec3 c=mix(hor,zen,pow(clamp(h,0.,1.),.6)); c=mix(c,hor*.92,clamp(-h*4.,0.,1.));
        float s=max(dot(d,sunDir),0.); c+=sunC*(pow(s,900.)*4.+pow(s,14.)*.35+pow(s,3.)*.12);
        vec2 p=d.xz/(max(h,.04)+.12); float n=fbm(vec3(p*1.1+vec2(t*.006,0.),t*.003));
        float cl=smoothstep(.48,.85,n)*smoothstep(.0,.25,h);
        c=mix(c,mix(vec3(.95,.92,.94),sunC*1.1,s*.5),cl*.6);
        gl_FragColor=vec4(c,0.);}`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShaderMaterial({
    uniforms: { t: shared.uTime, sunDir: { value: SUN }, a: { value: new THREE.Color(0x9a97b2) }, b: { value: new THREE.Color(0xf3ebe8) } },
    vertexShader: 'varying vec3 vW; void main(){vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: NOISE + `varying vec3 vW; uniform float t; uniform vec3 a,b,sunDir;
      void main(){vec3 p=vec3(vW.xz*.012,t*.02); float n=fbm(p+vec3(t*.01,0.,0.)); float n2=fbm(p*3.+n);
        vec3 c=mix(a,b,smoothstep(.25,.75,n*.7+n2*.4)); c+=vec3(1.,.85,.7)*pow(n2,3.)*.25;
        gl_FragColor=vec4(c,1.);}`,
  }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -14; scene.add(sea);
  const CN = 260; const R = rngOf(7);
  const cm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { cA: { value: new THREE.Color(0xf4ece9) }, cB: { value: new THREE.Color(0xa9a5c2) }, t: shared.uTime },
    vertexShader: `varying vec2 vUv; varying float vS, vF;
      void main(){vec3 ce=(modelMatrix*instanceMatrix*vec4(0,0,0,1)).xyz; float s=length(instanceMatrix[0].xyz);
        vec3 r=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]), u=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vec3 w=ce+(r*position.x+u*position.y)*s; vUv=uv; vS=float(gl_InstanceID);
        vec4 mv=viewMatrix*vec4(w,1.); vF=smoothstep(4.,30.,-mv.z); gl_Position=projectionMatrix*mv;}`,
    fragmentShader: NOISE + `varying vec2 vUv; varying float vS, vF; uniform vec3 cA,cB; uniform float t;
      void main(){vec2 p=vUv-.5; float n=fbm(vec3(p*2.6+vS*3.1,t*.03+vS)); float r=length(p)*2.+(n-.5)*.9;
        float a=smoothstep(1.,.25,r)*.6*vF; if(a<.01) discard; gl_FragColor=vec4(mix(cB,cA,smoothstep(.1,.9,vUv.y+n*.3)),a);}`,
  });
  const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), cm, CN); clouds.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < CN; i++) { const a = R() * 6.28, d = 28 + R() * 220, s = 18 + R() * 50; m4.makeScale(s, s, s); m4.setPosition(Math.cos(a) * d, -16 + Math.pow(R(), 1.6) * (topY + 40), Math.sin(a) * d); clouds.setMatrixAt(i, m4); }
  scene.add(clouds);
  return { sky, sea, clouds };
}
