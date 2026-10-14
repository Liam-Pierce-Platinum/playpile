// Loading helpers (from Rain City): PBR texture sets, glTF, HDR, with a shared progress bar.
// All URLs are relative so the game works from any static sub-path.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const manager = new THREE.LoadingManager();
manager.onProgress = (url, done, total) => {
  const bar = document.querySelector('#loadbar i');
  if (bar) bar.style.width = (100 * done / total).toFixed(1) + '%';
};

const texLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
const hdrLoader = new HDRLoader(manager);
const cache = new Map();
let maxAniso = 8;
export function setAnisotropy(a) { maxAniso = Math.min(8, a); }

export function tex(url, { srgb = false } = {}) {
  const key = url + (srgb ? ':s' : '');
  let t = cache.get(key);
  if (!t) {
    t = texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

// A Poly Haven texture set as a MeshStandardMaterial. UVs are expected in metres / size.
export function pbr(name, opts = {}) {
  const base = 'assets/tex/' + name + '/';
  const m = new THREE.MeshStandardMaterial({
    map: tex(base + 'diff.jpg', { srgb: true }),
    normalMap: tex(base + 'nor.jpg'),
    roughnessMap: tex(base + 'rough.jpg'),
    aoMap: tex(base + 'ao.jpg'),
    aoMapIntensity: 0.8,
    roughness: 1,
    metalness: 0,
    ...opts,
  });
  m.name = name;
  return m;
}

export function gltf(url) {
  return new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
}
export function hdr(url) {
  return new Promise((res, rej) => hdrLoader.load(url, res, undefined, rej));
}

// Deterministic RNG so the neighbourhood is the same every load.
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  return f;
}
