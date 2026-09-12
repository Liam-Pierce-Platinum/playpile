// =====================================================================
// HIGHRISE :: glb.js - LOAD A .glb IN THE BROWSER
// =====================================================================
//
// Liam sent a reference pack - a bench, a bin, an axe, an extinguisher
// and a fifteen-mesh office set - with the note *"these are good quality
// exactly how everything should look assets so use these"*.
//
// So they get USED, not just looked at. That needs a loader, and it
// deliberately is not three.js's GLTFLoader: that file is three thousand
// lines of a specification this project uses about four per cent of, and
// vendoring it would drag in Draco stubs, KHR extension plumbing and a
// material model this game does not render with. What is actually needed
// is: walk the node tree, read three accessors, decode the embedded
// images, and build Lambert materials.
//
// THE ONE THING THAT MATTERS MOST IS THE SAMPLER. Every texture in the
// reference pack is magFilter 9728 - GL_NEAREST. That single flag is
// most of what "PS1" means: the hardware could not filter texels, so a
// surface up close is CHUNKY rather than blurred, and the eye reads the
// chunkiness as the era before it reads the polygon count. Loading these
// with the default linear filter throws away the entire reason they look
// right.
import * as THREE from '../vendor/three.module.js';

const COMP = {
  5120: [Int8Array, 1], 5121: [Uint8Array, 1],
  5122: [Int16Array, 2], 5123: [Uint16Array, 2],
  5125: [Uint32Array, 4], 5126: [Float32Array, 4],
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** GL filter enums -> three.js constants */
function filterOf(v, fallback) {
  switch (v) {
    case 9728: return THREE.NearestFilter;
    case 9729: return THREE.LinearFilter;
    case 9984: return THREE.NearestMipmapNearestFilter;
    case 9985: return THREE.LinearMipmapNearestFilter;
    case 9986: return THREE.NearestMipmapLinearFilter;
    case 9987: return THREE.LinearMipmapLinearFilter;
    default: return fallback;
  }
}
const wrapOf = (v) => v === 33071 ? THREE.ClampToEdgeWrapping
                    : v === 33648 ? THREE.MirroredRepeatWrapping
                    : THREE.RepeatWrapping;

export async function loadGLB(url, opts = {}) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(url + ': not a glb');
  let p = 12, json = null, bin = null;
  while (p < buf.byteLength) {
    const len = dv.getUint32(p, true), type = dv.getUint32(p + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, p + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buf, p + 8, len);
    p += 8 + len + ((4 - (len % 4)) % 4);
  }

  // ---- accessors ------------------------------------------------------
  const acc = (i) => {
    if (i === undefined || i === null) return null;
    const a = json.accessors[i];
    const n = NCOMP[a.type], [Arr, sz] = COMP[a.componentType];
    const out = new Arr(a.count * n);
    if (a.bufferView === undefined) return out;
    const bv = json.bufferViews[a.bufferView];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    // A STRIDE IS NOT OPTIONAL. Interleaved buffers are common in exported
    // GLBs, and reading one as packed gives geometry that looks ALMOST
    // right - which is far worse to debug than geometry that looks wrong.
    const stride = bv.byteStride || n * sz;
    const src = new DataView(bin.buffer, bin.byteOffset);
    const get = {
      5120: (o) => src.getInt8(o), 5121: (o) => src.getUint8(o),
      5122: (o) => src.getInt16(o, true), 5123: (o) => src.getUint16(o, true),
      5125: (o) => src.getUint32(o, true), 5126: (o) => src.getFloat32(o, true),
    }[a.componentType];
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) out[k * n + c] = get(base + k * stride + c * sz);
    return out;
  };

  // ---- images ---------------------------------------------------------
  //
  // KEPT AT THE RESOLUTION THEIR AUTHOR SHIPPED.
  //
  // This used to crush every reference texture to 256 px, and the
  // reasoning was wrong. It went: Liam's first pack is 128s with nearest
  // filtering, that is the era, so bring the second batch down to match
  // or it will be the sharpest thing in the building.
  //
  // But the era is carried by NEAREST SAMPLING, flat shading and low
  // polygon counts - not by me throwing away somebody else's work. And
  // these are the assets Liam chose *because they looked good*: he said
  // *"these are good quality exactly how everything should look"*. The
  // office pack ships 1024s. Serving them at 256 threw away fifteen
  // sixteenths of the desk and three quarters of the trash can, which is
  // exactly the two things he came back and named:
  //
  //     Desk1Mtl       1024 x 1024  ->  256    1/16 of the pixels
  //     TableDrafting  1024 x 1024  ->  256
  //     Meshpart1Mtl   1024 x 1024  ->  256
  //     TrashCan1Mtl    512 x  512  ->  256    1/4
  //     Tower1Mtl       512 x  512  ->  256
  //
  // The cap stays only as a guard against a pathological sheet. These
  // load ONCE and every copy of the prop on every floor shares them, so
  // the cost is fixed no matter how many desks are on screen - unlike the
  // character sheets, which are one per man and stay at 256 for exactly
  // that reason.
  //
  // The smoothing below is still ON for the downsample itself when one
  // does happen: that is an average of the texels being thrown away,
  // which is what a mip is, and only the SAMPLING is nearest.
  // Point-sampling the downsample throws away the detail rather than
  // merging it, and the result is noise.
  const MAXTEX = opts.maxTex ?? 1024;
  const shrink = (img) => {
    const big = Math.max(img.width, img.height);
    if (big <= MAXTEX) return img;
    const k = MAXTEX / big;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  const images = await Promise.all((json.images || []).map(async (im) => {
    let blob;
    if (im.bufferView !== undefined) {
      const bv = json.bufferViews[im.bufferView];
      blob = new Blob([bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)],
                      { type: im.mimeType || 'image/png' });
    } else if (im.uri) {
      // `url` may now be relative to the page rather than root-absolute,
      // so it has to be resolved against the document before a texture
      // path inside the GLB is resolved against IT
      blob = await (await fetch(new URL(im.uri, new URL(url, location.href)).href)).blob();
    } else return null;
    return shrink(await createImageBitmap(blob));
  }));

  const texOf = (ref, srgb) => {
    if (!ref) return null;
    const t = json.textures[ref.index];
    const img = images[t.source];
    if (!img) return null;
    const tex = new THREE.Texture(img);
    const s = t.sampler !== undefined ? json.samplers[t.sampler] : {};
    // NEAREST BY DEFAULT, and by default on purpose: if a file forgets to
    // declare its sampler, the right guess for this project is the one the
    // whole reference pack uses.
    tex.magFilter = filterOf(s.magFilter, opts.forceNearest === false
      ? THREE.LinearFilter : THREE.NearestFilter);
    tex.minFilter = filterOf(s.minFilter, THREE.NearestMipmapLinearFilter);
    tex.wrapS = wrapOf(s.wrapS); tex.wrapT = wrapOf(s.wrapT);
    if (opts.forceNearest) { tex.magFilter = THREE.NearestFilter; }
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 1;                     // filtering it is the opposite of the point
    tex.needsUpdate = true;
    return tex;
  };

  // ---- materials ------------------------------------------------------
  //
  // Lambert, always. The game lights everything with a hemisphere and one
  // weak key (see main.js) and its whole look is baked value in the
  // texture - a physical material would light these assets in a way that
  // matches nothing else in the building.
  const materials = (json.materials || []).map((m) => {
    const pbr = m.pbrMetallicRoughness || {};
    const map = texOf(pbr.baseColorTexture, true);
    const col = pbr.baseColorFactor;
    const mat = new THREE.MeshLambertMaterial({
      map,
      color: col ? new THREE.Color(col[0], col[1], col[2]) : 0xffffff,
      transparent: m.alphaMode === 'BLEND',
      alphaTest: m.alphaMode === 'MASK' ? (m.alphaCutoff ?? 0.5) : 0,
      side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: m.alphaMode !== 'BLEND',
    });
    if (m.emissiveFactor && m.emissiveFactor.some((v) => v > 0.01))
      mat.emissive = new THREE.Color(...m.emissiveFactor);
    return mat;
  });
  const fallback = new THREE.MeshLambertMaterial({ color: 0x9a948a, side: THREE.DoubleSide });

  // ---- the node tree ---------------------------------------------------
  const root = new THREE.Group();
  const build = (ni) => {
    const nd = json.nodes[ni];
    const o = new THREE.Group();
    if (nd.matrix) o.applyMatrix4(new THREE.Matrix4().fromArray(nd.matrix));
    else {
      if (nd.translation) o.position.fromArray(nd.translation);
      if (nd.rotation) o.quaternion.fromArray(nd.rotation);
      if (nd.scale) o.scale.fromArray(nd.scale);
    }
    if (nd.mesh !== undefined) {
      for (const pr of json.meshes[nd.mesh].primitives) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(acc(pr.attributes.POSITION), 3));
        const nrm = acc(pr.attributes.NORMAL);
        if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        const uv = acc(pr.attributes.TEXCOORD_0);
        if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const idx = acc(pr.indices);
        if (idx) g.setIndex(new THREE.BufferAttribute(idx, 1));
        if (!nrm) g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, materials[pr.material] ?? fallback);
        o.add(mesh);
      }
    }
    for (const c of nd.children || []) o.add(build(c));
    return o;
  };
  const scene = json.scenes[json.scene || 0];
  for (const n of scene.nodes || []) root.add(build(n));

  // ---- name the parts, so a set can be taken apart ---------------------
  root.traverse((o) => { if (!o.name) o.name = ''; });
  (json.nodes || []).forEach(() => {});
  let i = 0;
  const names = [];
  const walk = (ni, parent) => {
    const nd = json.nodes[ni];
    names.push(nd.name || 'node' + ni);
    for (const c of nd.children || []) walk(c, ni);
  };
  for (const n of scene.nodes || []) walk(n, null);
  root.userData.names = names;
  root.userData.json = json;
  return root;
}

/**
 * Normalise a loaded set: put its feet on y=0, centre it on x/z, and
 * scale it so its tallest dimension is `size` metres. Downloaded assets
 * arrive in whatever units their author used - the reference bench is a
 * different scale from the reference axe - and a prop that is the wrong
 * size is worse than no prop.
 */
export function fit(obj, size, axis = 'y') {
  const box = new THREE.Box3().setFromObject(obj);
  const s = new THREE.Vector3(), c = new THREE.Vector3();
  box.getSize(s); box.getCenter(c);
  const along = axis === 'y' ? s.y : axis === 'x' ? s.x : s.z;
  const k = size / Math.max(1e-6, along);
  obj.scale.multiplyScalar(k);
  obj.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const g = new THREE.Group();
  g.add(obj);
  return g;
}
