// Loading helpers: PBR texture sets, glTF, HDR, with a shared progress bar (adapted from Rain City).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const manager = new THREE.LoadingManager();
// Loading screen progress: the load is a list of steps, each owning a slice [lo, hi] of the bar.
// Inside a step the slice fills with the files the LoadingManager finished since that step began.
// The bar never moves backwards.
const bar = () => document.querySelector('#bar i');
const msg = () => document.getElementById('loadmsg');
const LP = { loaded: 0, total: 0, l0: 0, lo: 0, hi: 0, shown: 0, step: '', on: false };
function paintLoad() {
  if (!LP.on) return;
  const n = LP.total - LP.l0, d = LP.loaded - LP.l0;
  const f = n > 0 ? Math.min(1, d / n) : 0;
  LP.shown = Math.min(1, Math.max(LP.shown, LP.lo + (LP.hi - LP.lo) * f));
  const b = bar(), m = msg(), p = document.getElementById('loadpct');
  if (b) b.style.width = (LP.shown * 100).toFixed(1) + '%';
  if (p) p.textContent = Math.floor(LP.shown * 100) + '%';
  if (m) m.textContent = LP.step + (n > 0 && d < n ? '  ·  ' + d + ' / ' + n + ' files' : '');
}
manager.onProgress = (url, done, total) => { LP.loaded = done; LP.total = total; paintLoad(); };
export function loadStep(step, lo, hi) { LP.step = step; LP.lo = lo; LP.hi = hi; LP.l0 = LP.loaded; paintLoad(); }

const texLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
const draco = new DRACOLoader(manager);
draco.setDecoderPath('vendor/three/examples/jsm/libs/draco/gltf/');
gltfLoader.setDRACOLoader(draco);
const hdrLoader = new HDRLoader(manager);
const texCache = new Map(), gltfCache = new Map(), hdrCache = new Map();
let maxAniso = 8;
export function setAnisotropy(a) { maxAniso = a; }

export function tex(url, { srgb = false, repeat = null } = {}) {
  const key = url + (srgb ? ':s' : '');
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  if (repeat) { t = t.clone(); t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; }
  return t;
}

// A Poly Haven texture set as a MeshStandardMaterial. Geometry UVs are in metres / texSize.
const pbrCache = new Map();
export function pbr(name, opts = {}) {
  const key = name + JSON.stringify(opts, (k, v) => (v && v.isColor) ? v.getHexString() : v);
  if (pbrCache.has(key)) return pbrCache.get(key);
  const base = 'tex/' + name + '/';
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
  pbrCache.set(key, m);
  return m;
}

export function clearMaterialCache() { pbrCache.clear(); }

export function gltf(url) {
  if (!gltfCache.has(url)) gltfCache.set(url, new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej)));
  return gltfCache.get(url);
}
export async function tryGltf(url) { try { return await gltf(url); } catch (e) { console.warn('[assets] missing', url); return null; } }

export function hdr(url) {
  if (!hdrCache.has(url)) hdrCache.set(url, new Promise((res, rej) => hdrLoader.load(url, res, undefined, rej)));
  return hdrCache.get(url);
}

export async function fetchJSON(url) {
  try { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
}

// Deterministic RNG so maps are the same every load.
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

// on: show the full-screen loading screen with a title line (e.g. "Deploying · Wet Streets"); off: fill
// the bar to 100% and fade out. The tip rotation and the art live in index.html so they run from frame one.
let loadHide = 0;
export function setLoading(on, text) {
  const l = document.getElementById('load');
  if (!l) return;
  clearTimeout(loadHide);
  if (on) {
    l.style.display = 'flex'; l.style.opacity = 1; l.classList.remove('err');
    const t = document.getElementById('loadtitle'); if (t && text) t.textContent = text;
    LP.on = true; LP.shown = 0; loadStep('Preparing', 0, 0.02);
  } else {
    LP.lo = LP.hi = 1; LP.step = 'Ready'; paintLoad(); LP.on = false;
    l.style.opacity = 0; loadHide = setTimeout(() => { l.style.display = 'none'; }, 600);
  }
}
// a failed load: keep the screen up, say what broke, offer the way back (the button is data-act="loadBack")
export function loadError(text) {
  const l = document.getElementById('load'); if (!l) return;
  clearTimeout(loadHide); LP.on = false;
  l.style.display = 'flex'; l.style.opacity = 1; l.classList.add('err');
  const m = msg(); if (m) m.textContent = text;
}
