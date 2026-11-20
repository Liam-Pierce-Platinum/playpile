import * as THREE from "../_deck/three.module.js";
import { drivingFrameBudget } from "../_shared/city-art/driving-view.js";
import { upgradeVehicle } from "../_shared/city-art/vehicle.js";
import {
  GRID_X,
  GRID_Y,
  WORLD,
  METRES_PER_UNIT,
  BLOCKS,
  VEHICLES,
  target,
  route,
} from "./engine.js";

// Original authored city and vehicle geometry. The simulation remains in engine.js;
// rendering converts its decimetres into metres without changing collision bounds.
const SCALE = METRES_PER_UNIT,
  Y = new THREE.Vector3(0, 1, 0);
const palettes = [
  "#a99788",
  "#8f9ba1",
  "#baa795",
  "#7b8c9c",
  "#9b817e",
  "#9caaa0",
];
const shopNames = [
  "MARIPOSA MOTEL",
  "PALM / RECORDS",
  "NOON NOODLE",
  "SUNSET AUTO",
  "LA LUNA CINEMA",
  "LOWLINE COFFEE",
  "NIGHT OWL MARKET",
  "ASHPORT RADIO",
  "PACIFIC LAUNDRY",
  "STUDIO 48",
  "NEON REPO",
  "ORCHID HOTEL",
];
const white = "#e8dfc7",
  mint = "#67f0cf",
  amber = "#ffc287";

function canvasTexture(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function facadeTexture(seed, emissive = false) {
  return canvasTexture(512, 1024, (c, w, h) => {
    c.fillStyle = emissive ? "#000" : palettes[seed % palettes.length];
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 128) {
      if (!emissive) {
        c.fillStyle = "#ffffff25";
        c.fillRect(0, y, w, 5);
        c.fillStyle = "#151b263b";
        c.fillRect(0, y + 123, w, 5);
      }
      for (let x = 0; x < w; x += 128) {
        const on = ((x / 128) * 3 + (y / 128) * 7 + seed * 5) % 7 < 3;
        c.fillStyle = emissive ? (on ? "#ffc98c" : "#000") : "#333d4b";
        c.fillRect(x + 25, y + 22, 72, 87);
        c.fillStyle = on
          ? emissive
            ? "#ffc686"
            : "#d9b586"
          : emissive
            ? "#000"
            : "#3c5365";
        c.fillRect(x + 29, y + 26, 64, 77);
        if (!emissive || on) {
          c.fillStyle = emissive ? "#000" : "#4e5358";
          c.fillRect(x + 59, y + 25, 4, 80);
          c.fillRect(x + 28, y + 63, 66, 4);
        }
        if (!emissive) {
          c.fillStyle = "#ffffff48";
          c.fillRect(x + 20, y + 108, 82, 6);
        }
      }
    }
  });
}
function shopTexture(name, seed) {
  return canvasTexture(1024, 256, (c) => {
    c.fillStyle = "#343936";
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = ["#d99f73", "#60b1ad", "#d1b27f", "#d28782"][seed % 4];
    c.fillRect(0, 10, 1024, 65);
    c.fillStyle = "#172326";
    c.font = "900 42px Arial";
    c.textAlign = "center";
    c.fillText(name, 512, 57);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = "#d3b58a";
      c.fillRect(19 + i * 167, 88, 145, 155);
      c.fillStyle = "#293d47";
      c.fillRect(25 + i * 167, 94, 133, 143);
      c.fillStyle = "#b9a87a";
      c.fillRect(26 + i * 167, 94, 132, 17);
      c.fillStyle = "#6f7973";
      c.fillRect(88 + i * 167, 94, 5, 143);
      c.fillStyle = "#b3a78b";
      c.fillRect(25 + i * 167, 209, 133, 2);
    }
    c.fillStyle = "#e6cb89";
    c.font = "15px monospace";
    c.fillText("OPEN LATE  •  ASHPORT, CA", 512, 170);
  });
}

// The body is a loft, with a sloping bonnet, sculpted shoulders and tapered tail.
// Local +X is forward, matching the original driving simulation.
function loft(sections, material) {
  const positions = [],
    indices = [];
  for (const [x, low, high, width, topWidth] of sections)
    positions.push(
      x,
      low,
      -width,
      x,
      low,
      width,
      x,
      high,
      topWidth,
      x,
      high,
      -topWidth,
    );
  for (let n = 0; n < sections.length - 1; n++)
    for (let j = 0; j < 4; j++) {
      const a = n * 4 + j,
        b = n * 4 + ((j + 1) % 4),
        d = (n + 1) * 4 + j,
        e = (n + 1) * 4 + ((j + 1) % 4);
      indices.push(a, b, e, a, e, d);
    }
  indices.push(0, 3, 2, 0, 2, 1);
  const k = (sections.length - 1) * 4;
  indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  for (let n = 0; n < indices.length; n += 3) {
    const first = indices[n];
    indices[n] = indices[n + 2];
    indices[n + 2] = first;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

export function createCityRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const adjustFrameBudget = drivingFrameBudget(renderer);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#627c9b");
  scene.fog = new THREE.FogExp2("#8192a7", 0.0036);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.12, 650);
  const hemi = new THREE.HemisphereLight("#a7c5f4", "#70615f", 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffd4af", 1.15);
  sun.position.set(-80, 100, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -45,
    right: 45,
    top: 45,
    bottom: -45,
    near: 1,
    far: 180,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight("#809ee7", 0.7);
  fill.position.set(50, 25, -120);
  scene.add(fill);
  const loader = new THREE.TextureLoader();
  loader.load("../_shared/city-art/dusk.webp", (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
    scene.backgroundIntensity = 0.9;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(t).texture;
    scene.environmentIntensity = 0.8;
    pmrem.dispose();
  });
  const box = new THREE.BoxGeometry(1, 1, 1),
    plane = new THREE.PlaneGeometry(1, 1),
    cylinder = new THREE.CylinderGeometry(1, 1, 1, 8),
    sphere = new THREE.SphereGeometry(1, 8, 6);
  const batches = new Map(),
    matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3(),
    position = new THREE.Vector3();
  const material = (color, roughness = 0.65, metalness = 0, emissive) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...(emissive ? { emissive: color, emissiveIntensity: emissive } : {}),
    });
  const concrete = material("#a69e8c"),
    curb = material("#d6c8ac"),
    roof = material("#53616d"),
    trim = material("#c1b9a8"),
    black = material("#20262b"),
    pole = material("#465154", 0.4, 0.75),
    leaf = material("#52694a"),
    trunk = material("#9f8170");
  const lamp = material("#ffdda2", 0.3, 0.3, 3),
    mark = material("#e2d7b8"),
    yellow = material("#c3a766"),
    red = material("#c26250");
  function batch(g, m, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
    const key = g.uuid + m.uuid;
    let b = batches.get(key);
    if (!b) {
      b = { g, m, matrices: [] };
      batches.set(key, b);
    }
    position.set(x, y, z);
    quaternion.setFromEuler(new THREE.Euler(rx, ry, rz));
    scale.set(sx, sy, sz);
    matrix.compose(position, quaternion, scale);
    b.matrices.push(matrix.clone());
  }
  const groundMat = material("#68717d", 0.56, 0.36);
  groundMat.normalScale = new THREE.Vector2(0.32, 0.32);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.w * SCALE + 300, WORLD.h * SCALE + 300),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD.w * 0.05, -0.04, WORLD.h * 0.05);
  ground.receiveShadow = true;
  scene.add(ground);
  loader.load("../_shared/city-art/asphalt.webp", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(110, 95);
    t.anisotropy = 8;
    groundMat.map = t;
    groundMat.needsUpdate = true;
  });
  for (const [name, key] of [
    ["asphalt-normal", "normalMap"],
    ["asphalt-rough", "roughnessMap"],
  ])
    loader.load(`../_shared/city-art/${name}.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(110, 95);
      t.anisotropy = 8;
      groundMat[key] = t;
      groundMat.needsUpdate = true;
    });
  // Painted lines leave real open intersections, and crossings meet every sidewalk.
  for (const x of GRID_X)
    for (let z = 4; z < WORLD.h * SCALE; z += 5)
      if (!GRID_Y.some((y) => Math.abs(y * SCALE - z) < 10)) {
        batch(box, yellow, x * SCALE - 0.12, 0.012, z, 0.08, 0.02, 2.8);
        batch(box, yellow, x * SCALE + 0.12, 0.012, z, 0.08, 0.02, 2.8);
        for (const dx of [-4, 4])
          batch(box, mark, x * SCALE + dx, 0.012, z, 0.09, 0.02, 1.4);
      }
  for (const z of GRID_Y)
    for (let x = 4; x < WORLD.w * SCALE; x += 5)
      if (!GRID_X.some((y) => Math.abs(y * SCALE - x) < 10)) {
        batch(box, yellow, x, 0.014, z * SCALE - 0.12, 2.8, 0.02, 0.08);
        batch(box, yellow, x, 0.014, z * SCALE + 0.12, 2.8, 0.02, 0.08);
        for (const dz of [-4, 4])
          batch(box, mark, x, 0.014, z * SCALE + dz, 1.4, 0.02, 0.09);
      }
  for (const x of GRID_X)
    for (const z of GRID_Y)
      for (let n = -5; n <= 5; n++) {
        for (const a of [-1, 1]) {
          batch(
            box,
            mark,
            x * SCALE + n * 0.95,
            0.016,
            z * SCALE + a * 8.4,
            0.6,
            0.025,
            2.2,
          );
          batch(
            box,
            mark,
            x * SCALE + a * 8.4,
            0.016,
            z * SCALE + n * 0.95,
            2.2,
            0.025,
            0.6,
          );
        }
      }
  const facades = palettes.map(
    (_, i) =>
      new THREE.MeshStandardMaterial({
        map: facadeTexture(i),
        emissiveMap: facadeTexture(i, true),
        emissive: "#ffc88f",
        emissiveIntensity: 0.55,
        roughness: 0.65,
      }),
  );
  const shops = shopNames.map(
    (name, i) =>
      new THREE.MeshStandardMaterial({
        map: shopTexture(name, i),
        emissive: "#ffd7a3",
        emissiveIntensity: 0.14,
        roughness: 0.5,
      }),
  );
  const reflectionFade = canvasTexture(8, 128, (c, w, h) => {
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#000");
    gradient.addColorStop(1, "#fff");
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);
  });
  const reflections = shops.map(
    (m) =>
      new THREE.MeshBasicMaterial({
        map: m.map,
        alphaMap: reflectionFade,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
  );
  // Locally supplied facade photographs add stone, glass, signage and interior
  // detail. Geometry above and below them still supplies real depth/parallax.
  for (const [i, m] of facades.entries())
    loader.load(
      `../_shared/city-art/wall-${["office", "stone", "balcony"][i % 3]}.webp`,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.y = (8 + i * 2.4) / 9.6;
        m.map = t;
        m.emissiveMap = null;
        m.emissiveIntensity = 0.012;
        m.needsUpdate = true;
      },
    );
  for (const [i, m] of shops.entries())
    loader.load(
      `../_shared/city-art/wall-${["diner", "garage", "loading", "diner"][i % 4]}.webp`,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        m.map = t;
        m.emissiveMap = t;
        m.emissiveIntensity = 0.32;
        m.needsUpdate = true;
        reflections[i].map = t;
        reflections[i].needsUpdate = true;
      },
    );
  const glowTex = canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#ffe7b4");
    g.addColorStop(0.25, "#ffc78a88");
    g.addColorStop(1, "#ffc78a00");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  function streetLamp(x, z, rot = 0) {
    batch(cylinder, pole, x, 3.25, z, 0.065, 6.5, 0.065);
    batch(
      box,
      pole,
      x + Math.cos(rot) * 0.65,
      6.5,
      z + Math.sin(rot) * 0.65,
      1.5,
      0.08,
      0.08,
      -rot,
    );
    batch(
      box,
      lamp,
      x + Math.cos(rot) * 1.28,
      6.46,
      z + Math.sin(rot) * 1.28,
      0.5,
      0.08,
      0.26,
      -rot,
    );
    batch(
      plane,
      glowMat,
      x + Math.cos(rot) * 1.2,
      0.026,
      z + Math.sin(rot) * 1.2,
      8,
      12,
      1,
      rot,
      -Math.PI / 2,
    );
  }
  const frond = new THREE.BufferGeometry(),
    frondPoints = [],
    frondIndex = [];
  for (let n = 0; n <= 10; n++) {
    const f = n / 10,
      x = f * 3.6,
      y = Math.sin(f * Math.PI) * 0.6 - f * f * 1.15,
      width = Math.sin(f * Math.PI) * 0.42;
    frondPoints.push(x, y, -width, x, y + 0.08, 0, x, y, width);
    if (n < 10) {
      const k = n * 3;
      frondIndex.push(
        k,
        k + 3,
        k + 1,
        k + 1,
        k + 3,
        k + 4,
        k + 1,
        k + 4,
        k + 2,
        k + 2,
        k + 4,
        k + 5,
      );
    }
  }
  frond.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(frondPoints, 3),
  );
  frond.setIndex(frondIndex);
  frond.computeVertexNormals();
  leaf.side = THREE.DoubleSide;
  function palm(x, z, seed) {
    const height = 7 + (seed % 4);
    batch(cylinder, trunk, x, height / 2, z, 0.13, height, 0.13, 0, 0, 0.025);
    batch(sphere, leaf, x, height + 0.1, z, 0.4, 0.45, 0.4);
    for (let n = 0; n < 9; n++) {
      const a = (n * Math.PI * 2) / 9 + seed;
      batch(
        frond,
        leaf,
        x,
        height,
        z,
        1 + (n % 3) * 0.1,
        1,
        1,
        -a,
        0,
        (n % 2) * 0.13,
      );
    }
  }
  for (const b of BLOCKS) {
    const bx = b.x * SCALE,
      bz = b.y * SCALE,
      bw = b.w * SCALE,
      bh = b.h * SCALE;
    batch(
      box,
      concrete,
      bx + bw / 2,
      0.1,
      bz + bh / 2,
      bw + 3.2,
      0.25,
      bh + 3.2,
    );
    batch(box, curb, bx + bw / 2, 0.15, bz - 1.6, bw + 3.4, 0.3, 0.16);
    batch(box, curb, bx + bw / 2, 0.15, bz + bh + 1.6, bw + 3.4, 0.3, 0.16);
    batch(box, curb, bx - 1.6, 0.15, bz + bh / 2, 0.16, 0.3, bh + 3.4);
    batch(box, curb, bx + bw + 1.6, 0.15, bz + bh / 2, 0.16, 0.3, bh + 3.4);
    for (let ix = 0; ix < 2; ix++)
      for (let iz = 0; iz < 2; iz++) {
        const seed = b.seed + ix * 13 + iz * 7,
          ht = 8 + (seed % 6) * 2.4,
          xx = bx + ((ix + 0.5) * bw) / 2,
          zz = bz + ((iz + 0.5) * bh) / 2,
          ww = bw / 2 - 0.12,
          dd = bh / 2 - 0.12;
        batch(box, facades[seed % 6], xx, ht / 2 + 3, zz, ww, ht, dd);
        batch(box, roof, xx, ht + 3.2, zz, ww + 0.25, 0.4, dd + 0.25);
        batch(box, trim, xx, 3, zz, ww + 0.35, 0.22, dd + 0.35);
        batch(box, roof, xx + 2, ht + 3.9, zz + 2, 2.7, 1.1, 1.7);
        batch(box, trim, xx - 3, ht + 3.65, zz - 2, 2, 0.6, 2);
        const sm = shops[seed % shops.length];
        batch(box, sm, xx, 1.5, zz, ww, 3, dd);
        batch(
          plane,
          reflections[seed % shops.length],
          xx,
          0.032,
          zz + (iz ? 1 : -1) * (dd / 2 + 4.3),
          ww,
          5.1,
          1,
          iz ? 0 : Math.PI,
          -Math.PI / 2,
        );
        for (const side of [-1, 1]) {
          batch(
            box,
            trim,
            xx,
            2.8,
            zz + side * (dd / 2 + 0.3),
            ww + 0.3,
            0.2,
            0.8,
          );
          batch(
            box,
            trim,
            xx + side * (ww / 2 + 0.3),
            2.8,
            zz,
            0.8,
            0.2,
            dd + 0.3,
          );
        }
        // Vertical pilasters, projecting lintels, ground-floor awnings.
        for (const dx of [-ww / 2, ww / 2])
          for (const dz of [-dd / 2, dd / 2])
            batch(box, trim, xx + dx, ht / 2 + 3, zz + dz, 0.22, ht, 0.22);
        const awning = material(
          ["#795d51", "#335b62", "#727c61", "#805c65"][seed % 4],
        );
        batch(
          box,
          awning,
          xx,
          2.35,
          zz + (iz ? 1 : -1) * (dd / 2 + 0.6),
          ww * 0.8,
          0.12,
          1.1,
          0,
          (iz ? 1 : -1) * 0.12,
        );
      }
    for (const f of [0.18, 0.7]) {
      streetLamp(bx + bw * f, bz - 2.6, -Math.PI / 2);
      streetLamp(bx + bw * f, bz + bh + 2.6, Math.PI / 2);
      streetLamp(bx - 2.6, bz + bh * f, Math.PI);
      streetLamp(bx + bw + 2.6, bz + bh * f, 0);
    }
    palm(bx + 3, bz - 2.2, b.seed);
    palm(bx + bw - 3, bz + bh + 2.2, b.seed + 2);
    // Benches, hydrants, bins and traffic signal housings anchor the street scale.
    for (const offset of [6, 23]) {
      batch(box, roof, bx + offset, 0.65, bz - 2.4, 1.6, 0.15, 0.5);
      batch(box, roof, bx + offset, 0.95, bz - 2.6, 1.6, 0.6, 0.1);
      batch(box, black, bx + offset - 0.6, 0.32, bz - 2.4, 0.1, 0.6, 0.4);
      batch(box, black, bx + offset + 0.6, 0.32, bz - 2.4, 0.1, 0.6, 0.4);
    }
    batch(cylinder, red, bx - 2.1, 0.45, bz + 4, 0.17, 0.9, 0.17);
    batch(box, roof, bx + bw + 2, 0.5, bz + 5, 0.55, 1, 0.55);
  }
  // A distinctive depot corner is visible in the first driving view.
  const depotSign = canvasTexture(1024, 128, (c, w, h) => {
    c.fillStyle = "#102735";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = mint;
    c.lineWidth = 4;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = mint;
    c.font = "900 74px Arial";
    c.textAlign = "center";
    c.fillText("NEON / REPO", w / 2, 88);
  });
  const signMat = new THREE.MeshStandardMaterial({
    map: depotSign,
    emissiveMap: depotSign,
    emissive: "#71ffda",
    emissiveIntensity: 2,
  });
  batch(box, signMat, 96, 4.1, 66.25, 13, 1.65, 0.24);
  const pinkGlow = material("#ef7b9e", 0.3, 0, 2);
  batch(box, pinkGlow, 96, 3.12, 66.45, 14, 0.055, 0.2);
  batch(box, pinkGlow, 96, 5.05, 66.45, 14, 0.055, 0.2);
  // Downtown skyline: stepped crowns sit outside the playable road network.
  for (let n = 0; n < 25; n++) {
    const x = -80 + n * 20,
      ht = 30 + ((n * 19) % 49),
      z = -32 - (n % 3) * 20;
    batch(box, facades[n % 6], x, ht / 2, z, 13 + (n % 3) * 4, ht, 14);
    batch(box, roof, x, ht + 1.5, z, 10, 3, 11);
  }
  for (const b of batches.values()) {
    const im = new THREE.InstancedMesh(b.g, b.m, b.matrices.length);
    b.matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = !b.m.transparent;
    im.receiveShadow = !b.m.transparent;
    im.computeBoundingSphere();
    scene.add(im);
  }

  const glass = material("#344d68", 0.07, 0.65),
    rubber = material("#161b21", 0.94),
    chrome = material("#adb9bb", 0.2, 0.9),
    dark = material("#252d32", 0.5, 0.5),
    headlight = material("#e5efff", 0.2, 0.3, 3),
    tail = material("#ff4939", 0.3, 0.2, 2.7);
  const shadowTex = canvasTexture(128, 64, (c, w, h) => {
    c.scale(w, h);
    const g = c.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
    g.addColorStop(0, "#000b");
    g.addColorStop(0.45, "#0009");
    g.addColorStop(1, "#0000");
    c.fillStyle = g;
    c.fillRect(0, 0, 1, 1);
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const cars = new Map(),
    playerFleet = new Map(),
    parkedFleet = new Map();
  function createCar(kind, color) {
    const g = new THREE.Group(),
      v = VEHICLES[kind] || VEHICLES.scout;
    const paint = material(color || v.color, 0.2, 0.65),
      long = kind === "atlas" ? 1.18 : kind === "wren" ? 0.86 : 1,
      width = kind === "atlas" ? 1.05 : 1;
    const body = loft(
      [
        [-2.18, 0.44, 0.85, 0.74, 0.72],
        [-1.75, 0.38, 1.02, 0.91, 0.86],
        [0.9, 0.38, 1, 0.91, 0.82],
        [1.9, 0.47, 0.84, 0.84, 0.76],
        [2.18, 0.55, 0.74, 0.7, 0.68],
      ],
      paint,
    );
    g.add(body);
    const cabin =
      kind === "atlas"
        ? [
            [-1.8, 0.9, 2, 0.79, 0.74],
            [0.65, 0.9, 2, 0.79, 0.74],
            [1.2, 0.9, 1.05, 0.79, 0.75],
          ]
        : kind === "wren"
          ? [
              [-1.5, 0.93, 1.65, 0.77, 0.64],
              [0.45, 0.93, 1.62, 0.77, 0.63],
              [1.02, 0.93, 1.03, 0.77, 0.74],
            ]
          : [
              [-1.4, 0.93, 1.03, 0.77, 0.72],
              [-0.73, 0.93, 1.52, 0.77, 0.63],
              [0.35, 0.93, 1.48, 0.76, 0.62],
              [1.03, 0.93, 1.01, 0.76, 0.72],
            ];
    g.add(loft(cabin, glass));
    function piece(geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.set(rx, ry, 0);
      g.add(m);
      return m;
    }
    const roofX = kind === "atlas" ? -0.6 : kind === "wren" ? -0.55 : -0.18,
      roofY = kind === "atlas" ? 2.02 : kind === "wren" ? 1.66 : 1.54;
    piece(
      box,
      paint,
      roofX,
      roofY,
      0,
      kind === "atlas" ? 2.45 : 1.2,
      0.08,
      1.29,
    );
    for (const side of [-1, 1]) {
      piece(box, paint, -0.25, 1.2, side * 0.765, 0.07, 0.54, 0.06);
      piece(box, paint, 0.65, 1.05, side * 0.88, 0.07, 0.3, 0.07);
      piece(box, chrome, -0.1, 0.92, side * 0.912, 2.5, 0.035, 0.025);
      piece(box, chrome, -0.58, 1, side * 0.87, 0.22, 0.035, 0.045);
      piece(box, paint, 0.64, 1.07, side * 1.02, 0.31, 0.15, 0.21);
      for (const x of [-1.4, 1.38]) {
        piece(
          cylinder,
          rubber,
          x,
          0.43,
          side * 0.88,
          0.43,
          0.28,
          0.43,
          Math.PI / 2,
        );
        piece(
          cylinder,
          chrome,
          x,
          0.43,
          side * 1.025,
          0.26,
          0.025,
          0.26,
          Math.PI / 2,
        );
        piece(
          cylinder,
          dark,
          x,
          0.43,
          side * 1.04,
          0.12,
          0.03,
          0.12,
          Math.PI / 2,
        );
      }
      piece(box, headlight, 2.07, 0.75, side * 0.51, 0.07, 0.14, 0.39);
      piece(box, tail, -2.16, 0.76, side * 0.52, 0.06, 0.16, 0.35);
    }
    piece(box, dark, 2.17, 0.6, 0, 0.06, 0.16, 0.62);
    piece(box, chrome, 2.2, 0.46, 0, 0.08, 0.07, 1.3);
    piece(box, dark, -2.15, 0.45, 0, 0.1, 0.12, 1.35);
    piece(box, whiteMat, -2.21, 0.67, 0, 0.035, 0.17, 0.33);
    if (kind === "thunder") {
      piece(box, dark, 0.95, 1.015, 0, 1.7, 0.015, 0.22);
      piece(box, dark, -1.86, 1.12, 0, 0.35, 0.07, 1.65);
    }
    if (kind === "atlas") piece(box, paint, -1.82, 1.4, 0, 0.08, 0.8, 1.6);
    const shadow = piece(
        plane,
        shadowMat,
        0,
        0.024,
        0,
        5.4,
        3.6,
        1,
        -Math.PI / 2,
      ),
      beam = piece(plane, glowMat, 5, 0.037, 0, 10, 4.5, 1, -Math.PI / 2);
    g.scale.set(long, 1, width);
    if (kind !== "atlas" && kind !== "wren")
      upgradeVehicle(g, {
        model: kind === "scout" || kind === "comet" ? "coupe" : "saloon",
        length: 4.4,
        forward: "+x",
        paint,
        keep: [shadow, beam],
      }).then((animation) => {
        g.userData.wheels = animation;
      });
    scene.add(g);
    return g;
  }
  const whiteMat = material("#d9d1bd");
  let player,
    playerKind = "",
    parked,
    parkedKind = "";
  const targetMat = new THREE.MeshBasicMaterial({
    color: amber,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 5.7, 64), targetMat);
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 1.1, 4),
    targetMat,
  );
  marker.rotation.z = Math.PI;
  scene.add(marker);
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);
  const gpsMat = new THREE.MeshBasicMaterial({
    color: amber,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  let routeKey = "",
    routeClock = 0;
  const minimap = document.createElement("canvas");
  minimap.id = "radar";
  minimap.width = 360;
  minimap.height = 280;
  minimap.setAttribute("aria-label", "Street map and route");
  document.body.appendChild(minimap);
  const mapctx = minimap.getContext("2d");
  const desired = new THREE.Vector3(),
    look = new THREE.Vector3(),
    follow = new THREE.Vector3();
  let initialized = false,
    lastMode = "",
    lastPos = new THREE.Vector3(),
    cameraAngle = 0;
  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function render(s, time, dt) {
    const c = s.car,
      px = c.x * SCALE,
      pz = c.y * SCALE;
    sun.position.set(px - 45, 70, pz + 30);
    sun.target.position.set(px, 0, pz);
    if (playerKind !== c.kind) {
      if (player) player.visible = false;
      if (!playerFleet.has(c.kind)) playerFleet.set(c.kind, createCar(c.kind));
      player = playerFleet.get(c.kind);
      player.visible = true;
      playerKind = c.kind;
    }
    player.position.set(px, 0.02, pz);
    player.rotation.y = -c.angle;
    player.rotation.z = Math.max(-0.04, Math.min(0.04, c.speed * 0.0001));
    player.userData.wheels?.spin((c.speed * SCALE * dt) / 0.34);
    s.traffic.forEach((t, i) => {
      if (!cars.has(i))
        cars.set(
          i,
          createCar(["scout", "wren", "thunder", "atlas"][i % 4], t.color),
        );
      const mesh = cars.get(i);
      mesh.position.set(t.x * SCALE, 0, t.y * SCALE);
      mesh.rotation.y = -t.angle;
      mesh.visible = Math.hypot(t.x - c.x, t.y - c.y) < 1400;
      mesh.userData.wheels?.spin((t.speed * SCALE * dt) / 0.34);
    });
    if (s.job && s.stage === "pickup") {
      if (parkedKind !== s.job.vehicle) {
        if (parked) parked.visible = false;
        if (!parkedFleet.has(s.job.vehicle))
          parkedFleet.set(s.job.vehicle, createCar(s.job.vehicle));
        parked = parkedFleet.get(s.job.vehicle);
        parkedKind = s.job.vehicle;
      }
      parked.visible = true;
      parked.position.set(s.job.x * SCALE, 0, s.job.y * SCALE);
      parked.rotation.y = -s.job.parkedHeading;
    } else if (parked) parked.visible = false;
    const t = target(s);
    ring.visible = marker.visible = !!s.job;
    ring.position.set(t.x * SCALE, 0.045, t.y * SCALE);
    marker.position.set(
      t.x * SCALE,
      4 + Math.sin(time * 2) * 0.25,
      t.y * SCALE,
    );
    marker.rotation.y = time * 0.4;
    const color = s.stage === "pickup" ? amber : mint;
    targetMat.color.set(color);
    gpsMat.color.set(color);
    routeClock += dt;
    if (routeClock > 0.35 || lastMode !== s.mode) {
      routeClock = 0;
      const pts = route(s),
        key = pts
          .map((p) => `${Math.round(p.x / 20)},${Math.round(p.y / 20)}`)
          .join("|");
      if (key !== routeKey) {
        routeKey = key;
        const arrowVertices = [];
        while (routeGroup.children.length) {
          const mesh = routeGroup.children[0];
          routeGroup.remove(mesh);
          mesh.geometry.dispose();
        }
        for (let n = 1; n < pts.length; n++) {
          const a = pts[n - 1],
            b = pts[n],
            len = Math.hypot(b.x - a.x, b.y - a.y) * SCALE;
          if (len < 0.1) continue;
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(len, 0.2),
            gpsMat,
          );
          mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.y - a.y, b.x - a.x));
          mesh.position.set((a.x + b.x) * 0.05, 0.03, (a.y + b.y) * 0.05);
          routeGroup.add(mesh);
          const dx = ((b.x - a.x) * SCALE) / len,
            dz = ((b.y - a.y) * SCALE) / len;
          for (let d = 5; d < len; d += 10) {
            const x = a.x * SCALE + dx * d,
              z = a.y * SCALE + dz * d;
            arrowVertices.push(
              x + dx * 0.9,
              0.041,
              z + dz * 0.9,
              x - dx * 0.55 + dz * 0.5,
              0.041,
              z - dz * 0.55 - dx * 0.5,
              x - dx * 0.55 - dz * 0.5,
              0.041,
              z - dz * 0.55 + dx * 0.5,
            );
          }
        }
        if (arrowVertices.length) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(arrowVertices, 3),
          );
          const arrows = new THREE.Mesh(geometry, gpsMat);
          arrows.material.side = THREE.DoubleSide;
          arrows.material.toneMapped = false;
          routeGroup.add(arrows);
        }
      }
    }
    routeGroup.visible = s.mode === "play" || s.mode === "pause";
    const active = s.mode !== "board" && s.mode !== "garage",
      snap =
        !initialized ||
        (lastMode === "board" && s.mode === "play") ||
        lastPos.distanceToSquared(new THREE.Vector3(px, 0, pz)) > 900;
    if (snap) cameraAngle = c.angle;
    let da = Math.atan2(
      Math.sin(c.angle - cameraAngle),
      Math.cos(c.angle - cameraAngle),
    );
    cameraAngle += da * (1 - Math.exp(-7 * dt));
    const behind = 9.2 + Math.min(2, Math.abs(c.speed) * 0.006),
      height = c.kind === "atlas" ? 4.1 : 3.4;
    if (active) {
      desired.set(
        px - Math.cos(cameraAngle) * behind,
        height,
        pz - Math.sin(cameraAngle) * behind,
      );
      look.set(
        px + Math.cos(cameraAngle) * 8,
        1.1,
        pz + Math.sin(cameraAngle) * 8,
      );
    } else {
      desired.set(px - 10, 4.4, pz + 8);
      look.set(px + 11, 2.2, pz);
    }
    // Keep the chase camera out of solid blocks when turning close to a corner.
    for (const b of BLOCKS) {
      const x = b.x * SCALE,
        z = b.y * SCALE;
      if (
        desired.x > x - 0.6 &&
        desired.x < x + b.w * SCALE + 0.6 &&
        desired.z > z - 0.6 &&
        desired.z < z + b.h * SCALE + 0.6
      ) {
        desired.lerp(new THREE.Vector3(px, 5, pz), 0.65);
        break;
      }
    }
    camera.position.lerp(desired, snap ? 1 : 1 - Math.exp(-9 * dt));
    follow.lerp(look, snap ? 1 : 1 - Math.exp(-12 * dt));
    camera.lookAt(follow);
    initialized = true;
    lastPos.set(px, 0, pz);
    lastMode = s.mode;
    adjustFrameBudget();
    renderer.render(scene, camera);
    minimap.hidden = !active;
    mapctx.fillStyle = "#101f2be8";
    mapctx.fillRect(0, 0, 360, 280);
    mapctx.save();
    mapctx.translate(180, 140);
    const sc = 0.075;
    mapctx.scale(sc, sc);
    mapctx.translate(-c.x, -c.y);
    mapctx.lineWidth = 65;
    mapctx.strokeStyle = "#42505b";
    mapctx.beginPath();
    for (const x of GRID_X) {
      mapctx.moveTo(x, 0);
      mapctx.lineTo(x, WORLD.h);
    }
    for (const z of GRID_Y) {
      mapctx.moveTo(0, z);
      mapctx.lineTo(WORLD.w, z);
    }
    mapctx.stroke();
    mapctx.strokeStyle = color;
    mapctx.lineWidth = 21;
    mapctx.beginPath();
    route(s).forEach((p, i) =>
      i ? mapctx.lineTo(p.x, p.y) : mapctx.moveTo(p.x, p.y),
    );
    mapctx.stroke();
    mapctx.fillStyle = color;
    mapctx.beginPath();
    mapctx.arc(t.x, t.y, 50, 0, Math.PI * 2);
    mapctx.fill();
    mapctx.translate(c.x, c.y);
    mapctx.rotate(c.angle);
    mapctx.fillStyle = "#fff";
    mapctx.beginPath();
    mapctx.moveTo(70, 0);
    mapctx.lineTo(-50, -42);
    mapctx.lineTo(-25, 0);
    mapctx.lineTo(-50, 42);
    mapctx.closePath();
    mapctx.fill();
    mapctx.restore();
  }
  function dispose() {
    minimap.remove();
    renderer.dispose();
  }
  return { resize, render, dispose };
}
