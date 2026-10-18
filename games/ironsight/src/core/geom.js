// Geometry merge that tolerates mixed inputs: indexed / non-indexed, missing uvs, extra attributes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function normGeo(g) {
  let o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
  o.morphAttributes = {};
  return o;
}
export function safeMerge(list) {
  const g = mergeGeometries(list.map(normGeo), false);
  if (!g) throw new Error('safeMerge failed');
  return g;
}
