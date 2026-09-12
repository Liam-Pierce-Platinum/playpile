// =====================================================================
// HIGHRISE :: obj.js - a very small Wavefront OBJ reader
// =====================================================================
//
// Liam sent the suspicious car as an .obj, and this project had no way
// to read one: src/glb.js is a hand-rolled GLB parser and three's
// OBJLoader is not vendored. OBJ is a text format with six directives
// worth caring about, so reading it here is smaller than adding another
// vendored loader and it keeps the asset pipeline in one place.
//
//   v   x y z          a position
//   vt  u v            a texture coordinate
//   vn  x y z          a normal
//   f   a/b/c ...      a face, 1-BASED, and NEGATIVE indices count back
//                      from the end - Blender writes both
//   o   name           a new object: the wheels have to come out as
//                      their own meshes or they cannot be spun
//   usemtl name        which material, ignored beyond grouping
//
// THE TWO THINGS THAT ARE EASY TO GET WRONG:
//
//  1. FACES CAN HAVE MORE THAN THREE CORNERS. Blender exports quads by
//     default and this car is all quads, so a reader that assumes
//     triangles silently drops a third of every panel. They are fanned.
//  2. AN OBJ INDEX IS SHARED ACROSS ATTRIBUTES BUT A GL INDEX IS NOT.
//     `f 1/4/7` means position 1, uv 4, normal 7 - three different
//     numbers for one corner - so every distinct triple has to become
//     its own vertex. Keyed in a Map, which is also what de-duplicates
//     the shared ones.
import * as THREE from '../vendor/three.module.js';

const CACHE = new Map();

/**
 * Load an .obj as a Group of Meshes, one per `o` block.
 *
 * `opts.map` is a texture URL to put on everything - the .mtl here names
 * one material with a colour swatch per paint job, and choosing which
 * one is the caller's business.
 */
export function loadOBJ(url, opts = {}) {
  const key = url + '|' + (opts.map || '');
  // THE TEXTURE IS AWAITED, NOT FIRED OFF. A three.js Texture whose
  // image has not arrived samples BLACK, not white - so a mesh handed a
  // pending map renders as a silhouette and looks like a broken export.
  // (This is the second time that has cost an hour in this project; see
  // the arms sheet in fparms.js.)
  if (!CACHE.has(key)) CACHE.set(key, Promise.all([
    fetch(url).then((r) => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.text(); }),
    opts.map ? new THREE.TextureLoader().loadAsync(opts.map) : Promise.resolve(null),
  ]).then(([text, map]) => build(text, opts, map)));
  return CACHE.get(key).then((g) => g.clone(true));
}

function build(text, opts, map) {
  const pos = [], uv = [], nor = [];
  const groups = [];
  let cur = null;

  const start = (name) => {
    cur = { name: name || ('part' + groups.length), P: [], U: [], N: [], idx: [], seen: new Map() };
    groups.push(cur);
  };

  const corner = (tok) => {
    // "1/2/3", "1//3", "1/2", "1" - and any of them may be negative
    if (cur.seen.has(tok)) return cur.seen.get(tok);
    const p = tok.split('/');
    const gi = (v, list, n) => {
      if (v === undefined || v === '') return -1;
      let i = parseInt(v, 10);
      if (i < 0) i = list.length / n + i; else i -= 1;
      return i;
    };
    const pi = gi(p[0], pos, 3), ti = gi(p[1], uv, 2), ni = gi(p[2], nor, 3);
    const at = cur.P.length / 3;
    cur.P.push(pos[pi * 3] || 0, pos[pi * 3 + 1] || 0, pos[pi * 3 + 2] || 0);
    cur.U.push(ti >= 0 ? (uv[ti * 2] || 0) : 0, ti >= 0 ? (uv[ti * 2 + 1] || 0) : 0);
    if (ni >= 0) cur.N.push(nor[ni * 3] || 0, nor[ni * 3 + 1] || 0, nor[ni * 3 + 2] || 0);
    else cur.N.push(0, 0, 0);
    cur.seen.set(tok, at);
    return at;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.indexOf(' ');
    const k = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    if (k === 'v') { const n = rest.split(/\s+/).map(Number); pos.push(n[0], n[1], n[2]); }
    else if (k === 'vt') { const n = rest.split(/\s+/).map(Number); uv.push(n[0], n[1]); }
    else if (k === 'vn') { const n = rest.split(/\s+/).map(Number); nor.push(n[0], n[1], n[2]); }
    else if (k === 'o' || k === 'g') start(rest);
    else if (k === 'f') {
      if (!cur) start(null);
      const toks = rest.split(/\s+/).filter(Boolean);
      const c = toks.map(corner);
      // FAN THE POLYGON. Blender exports quads; three wants triangles.
      for (let i = 1; i + 1 < c.length; i++) cur.idx.push(c[0], c[i], c[i + 1]);
    }
  }

  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = true;                 // OBJ/MTL convention, unlike glTF
    // the same rule as everything else in this game - see STYLE.md R8
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestMipmapNearestFilter;
    map.anisotropy = 1;
  }
  const mat = new THREE.MeshLambertMaterial({
    map, color: map ? 0xffffff : (opts.color === undefined ? 0x8a8f96 : opts.color),
  });

  const root = new THREE.Group();
  for (const g of groups) {
    if (!g.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.U, 2));
    const hasN = g.N.some((v) => v !== 0);
    if (hasN) geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.N, 3));
    geo.setIndex(g.idx);
    if (!hasN) geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.name = g.name;
    root.add(m);
  }
  return root;
}
