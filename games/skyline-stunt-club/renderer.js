import * as THREE from "../_deck/three.module.js";
import { drivingFrameBudget } from "../_shared/city-art/driving-view.js";
import { upgradeVehicle } from "../_shared/city-art/vehicle.js";
import { roofs, bridges, ramps, beacons, courses, liveries } from "./engine.js";

// Original geometry and materials. Driving coordinates remain in engine.js.
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  const adjustFrameBudget = drivingFrameBudget(renderer);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9caeba");
  scene.fog = new THREE.FogExp2("#c3bdb4", 0.0028);
  const camera = new THREE.PerspectiveCamera(
    64,
    innerWidth / innerHeight,
    0.12,
    1400,
  );
  camera.position.set(9, 4.8, 17);
  const hemi = new THREE.HemisphereLight("#cfe6ff", "#56505b", 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffe1b9", 2.7);
  sun.position.set(-80, 72, -160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 310;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.1;
  scene.add(sun);
  const mat = (color, roughness = 0.6, metalness = 0.1, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const mesh = (geometry, material, x = 0, y = 0, z = 0, parent = scene) => {
    const o = new THREE.Mesh(geometry, material);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const cube = (w, h, d, m, x = 0, y = 0, z = 0, parent = scene) =>
    mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const cylinder = (r1, r2, h, m, x = 0, y = 0, z = 0, parent = scene) =>
    mesh(new THREE.CylinderGeometry(r1, r2, h, 14), m, x, y, z, parent);
  function texture(w, h, paint) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return t;
  }
  let seed = 6173;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const facade = texture(256, 512, (c, w, h) => {
    c.fillStyle = "#384a5b";
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16)
      for (let x = 0; x < w; x += 16) {
        const l = random();
        c.fillStyle =
          l > 0.91
            ? "#b4a48b"
            : l > 0.68
              ? "#64798b"
              : l > 0.3
                ? "#4c6276"
                : "#314555";
        c.fillRect(x + 2, y + 2, 12, 12);
        c.fillStyle = "rgba(190,213,228,.14)";
        c.fillRect(x + 3, y + 2, 10, 2);
      }
    c.fillStyle = "#273747";
    for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 2, h);
  });
  const glassBuilding = mat("#9eafba", 0.26, 0.55, {
    map: facade,
    envMapIntensity: 0.8,
  });
  const concrete = mat("#8f9396", 0.83, 0.03),
    metal = mat("#76858c", 0.38, 0.7),
    black = mat("#151c25", 0.55, 0.25),
    white = mat("#e9e8df", 0.44, 0.15);
  const amber = mat("#f6c244", 0.35, 0.25),
    mint = mat("#b4ff8a", 0.32, 0.1, {
      emissive: "#7bbd43",
      emissiveIntensity: 1.1,
    });
  const asphalt = texture(512, 512, (c, w, h) => {
    c.fillStyle = "#333a40";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 19000; i++) {
      const v = 40 + Math.floor(random() * 70);
      c.fillStyle = `rgba(${v},${v + 3},${v + 7},.32)`;
      c.fillRect(random() * w, random() * h, 1 + random(), 1 + random());
    }
    for (let i = 0; i < 8; i++) {
      c.strokeStyle = "#1f272d55";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(random() * w, random() * h);
      for (let j = 0; j < 4; j++) c.lineTo(random() * w, random() * h);
      c.stroke();
    }
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(4, 4);
  const roadMat = mat("#89949e", 0.66, 0.07, {
    map: asphalt,
    envMapIntensity: 0.35,
  });
  const loader = new THREE.TextureLoader();
  loader.load(
    "../_shared/city-art/wall-office.webp",
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 6);
      t.anisotropy = 8;
      glassBuilding.map = t;
      glassBuilding.needsUpdate = true;
    },
    undefined,
    () => {},
  );
  loader.load(
    "../_shared/city-art/asphalt.webp",
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(4, 4);
      t.anisotropy = 8;
      roadMat.map = t;
      roadMat.needsUpdate = true;
    },
    undefined,
    () => {},
  );
  loader.load(
    "../_shared/city-art/sunset.webp",
    (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromEquirectangular(t);
      scene.environment = environment.texture;
      scene.background = t;
      scene.backgroundBlurriness = 0.025;
      scene.backgroundIntensity = 0.85;
      scene.environmentIntensity = 0.95;
      scene.backgroundRotation.y = 2.15;
      scene.environmentRotation.y = 2.15;
      pmrem.dispose();
    },
    undefined,
    () => {},
  );
  const ground = cube(1100, 2, 1100, mat("#26363b", 0.86), 0, -76, 0);
  ground.castShadow = false;
  const street = mat("#172329", 0.9);
  for (let v = -500; v <= 500; v += 40) {
    cube(7, 0.06, 1000, street, v, -74.95, 0).castShadow = false;
    cube(1000, 0.06, 7, street, 0, -74.9, v).castShadow = false;
  }
  const cityPositions = [];
  for (let x = -360; x <= 360; x += 40)
    for (let z = -400; z <= 360; z += 40) {
      if (Math.abs(x) < 80 && Math.abs(z) < 80) continue;
      if (random() < 0.16) continue;
      const h = 24 + Math.pow(random(), 2) * 98;
      cityPositions.push({
        x: x + 9 * (random() - 0.5),
        z: z + 9 * (random() - 0.5),
        w: 15 + random() * 17,
        d: 15 + random() * 17,
        h,
      });
    }
  const stoneBuilding = mat("#d4cbc0", 0.78, 0.05, { map: facade }),
    balconyBuilding = mat("#b8c0c0", 0.6, 0.16, { map: facade });
  for (const [name, material] of [
    ["stone", stoneBuilding],
    ["balcony", balconyBuilding],
  ])
    loader.load(
      "../_shared/city-art/wall-" + name + ".webp",
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 6);
        t.anisotropy = 8;
        material.map = t;
        material.needsUpdate = true;
      },
      undefined,
      () => {},
    );
  const transform = new THREE.Object3D();
  [glassBuilding, stoneBuilding, balconyBuilding].forEach(
    (material, groupIndex) => {
      const subset = cityPositions.filter((_, i) => i % 3 === groupIndex),
        towers = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          material,
          subset.length,
        );
      subset.forEach((v, i) => {
        transform.position.set(v.x, -74 + v.h / 2, v.z);
        transform.scale.set(v.w, v.h, v.d);
        transform.updateMatrix();
        towers.setMatrixAt(i, transform.matrix);
        towers.setColorAt(
          i,
          new THREE.Color().setHSL(
            0.57 + random() * 0.06,
            0.04 + random() * 0.06,
            0.65 + random() * 0.3,
          ),
        );
      });
      towers.receiveShadow = true;
      scene.add(towers);
    },
  );
  cityPositions
    .filter((_, i) => i % 5 === 0)
    .forEach((v, i) => {
      const top = v.h - 74;
      const shape = i % 5;
      if (shape === 0) {
        cube(v.w * 0.8, 7, v.d * 0.8, glassBuilding, v.x, top + 3.5, v.z);
        cube(v.w * 0.54, 8, v.d * 0.54, glassBuilding, v.x, top + 11, v.z);
        cylinder(0.2, 0.2, 16, metal, v.x, top + 23, v.z);
      } else if (shape === 1) {
        const crown = mesh(
          new THREE.ConeGeometry(v.w * 0.68, 14, 4),
          metal,
          v.x,
          top + 7,
          v.z,
        );
        crown.rotation.y = Math.PI / 4;
      } else if (shape === 2) {
        mesh(
          new THREE.SphereGeometry(
            v.w * 0.46,
            20,
            10,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ),
          glassBuilding,
          v.x,
          top,
          v.z,
        );
      } else if (shape === 3) {
        cube(v.w * 0.8, 3, v.d * 0.7, concrete, v.x, top + 1.5, v.z);
        cube(v.w * 0.18, 9, v.d * 0.8, metal, v.x - v.w * 0.3, top + 5, v.z);
        cylinder(0.25, 0.1, 20, metal, v.x + v.w * 0.25, top + 10, v.z);
      } else {
        cylinder(v.w * 0.35, v.w * 0.4, 9, glassBuilding, v.x, top + 4.5, v.z);
        cylinder(v.w * 0.4, v.w * 0.4, 0.6, white, v.x, top + 9, v.z);
      }
    });
  // A few distinct skyline silhouettes, not a wall of identical blocks.
  for (const v of [
    [-115, -115, 99],
    [-160, -210, 134],
    [98, -190, 115],
    [144, -92, 78],
    [220, 70, 120],
  ]) {
    cube(25, v[2], 22, glassBuilding, v[0], -74 + v[2] / 2, v[1]);
    cube(17, 12, 15, glassBuilding, v[0], v[2] - 68, v[1]);
    cube(9, 9, 8, metal, v[0], v[2] - 58, v[1]);
    cylinder(0.45, 0.18, 17, metal, v[0], v[2] - 45, v[1]);
  }
  function label(text, w = 512, h = 128, bg = "#13252c", fg = "#ecf5e9") {
    return texture(w, h, (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = fg;
      c.font = `900 ${h * 0.53}px Arial`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, w / 2, h * 0.52, w * 0.94);
    });
  }
  function decal(x, z, w, d, t, y = 0.035, a = 0) {
    const o = mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({
        map: t,
        transparent: true,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      x,
      y,
      z,
    );
    o.rotation.set(-Math.PI / 2, 0, -a);
    o.castShadow = false;
    return o;
  }
  const chevron = texture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = "#d9f4b4";
    c.beginPath();
    c.moveTo(26, 154);
    c.lineTo(128, 60);
    c.lineTo(230, 154);
    c.lineTo(230, 206);
    c.lineTo(128, 112);
    c.lineTo(26, 206);
    c.fill();
  });
  const hazard = texture(256, 64, (c) => {
    c.fillStyle = "#f8c552";
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = "#263036";
    for (let x = -64; x < 320; x += 48) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 24, 0);
      c.lineTo(x + 88, 64);
      c.lineTo(x + 64, 64);
      c.fill();
    }
  });
  for (let i = 0; i < roofs.length; i++) {
    const r = roofs[i];
    cube(r.w, 60, r.d, glassBuilding, r.x, -30.3, r.z);
    cube(r.w + 0.25, 0.5, r.d + 0.25, concrete, r.x, -0.27, r.z);
    const top = mesh(
      new THREE.PlaneGeometry(r.w, r.d),
      roadMat,
      r.x,
      0.005,
      r.z,
    );
    top.rotation.x = -Math.PI / 2;
    top.castShadow = false;
    for (const side of [-1, 1]) {
      cube(0.16, 0.13, r.d, white, r.x + side * (r.w / 2 - 0.55), 0.07, r.z);
      cube(r.w, 0.13, 0.16, white, r.x, 0.07, r.z + side * (r.d / 2 - 0.55));
    }
    decal(
      r.x - 6,
      r.z + 3,
      8,
      3.2,
      label("0" + (i + 1), 256, 128, "#252e35", "#a0a9a9"),
    );
    for (let z = r.z - r.d / 2 + 3; z < r.z + r.d / 2 - 2; z += 5) {
      cube(2, 0.025, 0.08, white, r.x - r.w / 2 + 2, 0.028, z);
      cube(2, 0.025, 0.08, white, r.x + r.w / 2 - 2, 0.028, z);
    }
    for (const v of [
      [-1, -1],
      [1, 1],
    ]) {
      const x = r.x + v[0] * (r.w / 2 - 2.5),
        z = r.z + v[1] * (r.d / 2 - 2.7);
      cube(2.8, 0.5, 2.8, concrete, x, 0.25, z);
      cube(2.1, 1.1, 1.8, metal, x, 1.05, z);
      const fan = cylinder(0.65, 0.65, 0.06, black, x, 1.64, z);
      for (let a = 0; a < 5; a++) {
        const blade = cube(0.85, 0.035, 0.16, metal, x, 1.69, z);
        blade.rotation.y = (a * Math.PI) / 2.5;
      }
    }
    const puddle = mesh(
      new THREE.PlaneGeometry(3.8, 7),
      new THREE.MeshPhysicalMaterial({
        color: "#4c6068",
        roughness: 0.13,
        metalness: 0.7,
        transparent: true,
        opacity: 0.38,
      }),
      r.x - 11,
      0.023,
      r.z,
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = 0.25;
    puddle.castShadow = false;
  }
  for (const b of bridges) {
    cube(b.w, 0.45, b.d, metal, b.x, -0.2, b.z);
    const deck = mesh(
      new THREE.PlaneGeometry(b.w, b.d),
      roadMat,
      b.x,
      0.04,
      b.z,
    );
    deck.rotation.x = -Math.PI / 2;
    deck.castShadow = false;
    const alongZ = b.d > b.w;
    if (alongZ) {
      cube(0.14, 0.15, b.d, mint, b.x - b.w / 2 + 0.15, 0.12, b.z);
      cube(0.14, 0.15, b.d, mint, b.x + b.w / 2 - 0.15, 0.12, b.z);
    } else {
      cube(b.w, 0.15, 0.14, mint, b.x, 0.12, b.z - b.d / 2 + 0.15);
      cube(b.w, 0.15, 0.14, mint, b.x, 0.12, b.z + b.d / 2 - 0.15);
    }
  }
  const rampMat = mat("#b3b8b6", 0.45, 0.45);
  for (const r of ramps) {
    const group = new THREE.Group();
    group.position.set(r.x, 0, r.z);
    group.rotation.y = -r.dir;
    scene.add(group);
    const w = 5.1,
      depth = 6,
      height = 1.65;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -w / 2,
          0,
          depth / 2,
          w / 2,
          0,
          depth / 2,
          w / 2,
          height,
          -depth / 2,
          -w / 2,
          0,
          depth / 2,
          w / 2,
          height,
          -depth / 2,
          -w / 2,
          height,
          -depth / 2,
        ],
        3,
      ),
    );
    geom.computeVertexNormals();
    mesh(geom, rampMat, 0, 0, 0, group);
    for (const side of [-1, 1]) {
      const rail = cube(
        0.18,
        0.18,
        6.3,
        amber,
        side * (w / 2 - 0.1),
        height / 2 + 0.12,
        0,
        group,
      );
      rail.rotation.x = Math.atan(height / depth);
      cube(
        0.28,
        height,
        0.3,
        black,
        side * (w / 2 - 0.1),
        height / 2,
        -depth / 2,
        group,
      );
    }
    for (let z = 1.8; z > -2.5; z -= 1.65) {
      const arrow = mesh(
        new THREE.PlaneGeometry(3.6, 1.6),
        new THREE.MeshStandardMaterial({
          map: chevron,
          transparent: true,
          depthWrite: false,
          roughness: 0.6,
          polygonOffset: true,
          polygonOffsetFactor: -3,
        }),
        0,
        ((3 - z) / 6) * height + 0.035,
        z,
        group,
      );
      arrow.rotation.x = -Math.PI / 2 + Math.atan(height / depth);
    }
    const apron = mesh(
      new THREE.PlaneGeometry(5.1, 0.45),
      new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7 }),
      0,
      0.04,
      3.28,
      group,
    );
    apron.rotation.x = -Math.PI / 2;
  }
  for (let z = 4; z > -7; z -= 3.5) decal(9, z, 2.2, 2.2, chevron);
  // Sculptural jump gate: the actual introductory launch flies through it.
  const gate = new THREE.Group();
  gate.position.set(9, 4.4, -20);
  scene.add(gate);
  const ring = mesh(
    new THREE.TorusGeometry(4.2, 0.22, 12, 80),
    metal,
    0,
    0,
    0,
    gate,
  );
  const lightRing = mesh(
    new THREE.TorusGeometry(4.24, 0.065, 8, 80),
    mint,
    0,
    0,
    0.24,
    gate,
  );
  for (const side of [-1, 1]) {
    cube(0.55, 11, 0.65, metal, side * 4.65, -1.3, 0.35, gate);
    cube(1.1, 0.35, 1.1, concrete, side * 4.65, -6.5, 0.35, gate);
  }
  const signMat = new THREE.MeshStandardMaterial({
    map: label("NORTHLINE / 01", 1024, 128),
    roughness: 0.45,
  });
  const sign = mesh(new THREE.PlaneGeometry(12, 1.5), signMat, 9, 9.5, -20);
  for (const x of [3.9, 14.1]) cube(0.18, 1.6, 0.18, metal, x, 8.5, -20);
  const checkpointObjects = beacons.map((b, i) => {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    scene.add(g);
    const tor = mesh(
      new THREE.TorusGeometry(2.45, 0.06, 8, 48),
      mint,
      0,
      0.09,
      0,
      g,
    );
    tor.rotation.x = Math.PI / 2;
    const diamond = mesh(
      new THREE.OctahedronGeometry(0.32),
      mint,
      0,
      3.4,
      0,
      g,
    );
    const post = cylinder(0.025, 0.025, 3.1, metal, 0, 1.6, 0, g);
    post.castShadow = false;
    return { g, tor, diamond };
  });
  // An original mid-engine coupe: sculpted body, glazing, arches, aero and lamps.
  const car = new THREE.Group();
  scene.add(car);
  const paint = new THREE.MeshPhysicalMaterial({
    color: liveries[0].color,
    metalness: 0.68,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.4,
  });
  const rubber = mat("#11151b", 0.84, 0.03),
    carbon = mat("#1c242b", 0.42, 0.65),
    windowMat = new THREE.MeshPhysicalMaterial({
      color: "#142b3d",
      metalness: 0.25,
      roughness: 0.09,
      clearcoat: 1,
      envMapIntensity: 1.7,
    });
  function bodySection(sections, material) {
    const positions = [],
      indices = [];
    sections.forEach((v) => {
      const [z, w, y0, y1] = v;
      positions.push(-w, y0, z, w, y0, z, -w, y1, z, w, y1, z);
    });
    for (let j = 0; j < sections.length - 1; j++) {
      const a = j * 4,
        b = a + 4;
      for (const q of [
        [a, a + 1, b + 1, b],
        [a + 2, b + 2, b + 3, a + 3],
        [a, a + 4, a + 6, a + 2],
        [a + 1, a + 3, a + 7, a + 5],
      ])
        indices.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    indices.push(0, 2, 3, 0, 3, 1);
    const n = (sections.length - 1) * 4;
    indices.push(n, n + 1, n + 3, n, n + 3, n + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return mesh(g, material, 0, 0, 0, car);
  }
  bodySection(
    [
      [-2.12, 0.88, 0.32, 0.53],
      [-1.5, 1.03, 0.3, 0.72],
      [-0.65, 1.04, 0.32, 0.81],
      [0.65, 1.06, 0.32, 0.82],
      [1.5, 1.02, 0.35, 0.74],
      [2.05, 0.9, 0.38, 0.69],
    ],
    paint,
  );
  bodySection(
    [
      [-0.8, 0.77, 0.73, 0.79],
      [-0.27, 0.69, 0.77, 1.25],
      [0.72, 0.7, 0.78, 1.27],
      [1.19, 0.8, 0.77, 0.8],
    ],
    windowMat,
  );
  cube(1.35, 0.07, 1.02, paint, 0, 1.29, 0.25, car);
  cube(2.08, 0.12, 3.25, carbon, 0, 0.25, 0.05, car);
  cube(1.92, 0.12, 0.34, carbon, 0, 0.28, -2.02, car);
  for (const x of [-0.9, 0.9]) {
    cube(0.12, 0.15, 3.1, carbon, x, 0.27, 0.1, car);
    cube(0.1, 0.09, 1.1, paint, x * 0.77, 1.29, 0.22, car);
    const mirror = cube(0.28, 0.12, 0.28, paint, x * 1.15, 0.92, -0.45, car);
    cube(0.12, 0.04, 0.18, carbon, x, 0.84, -0.45, car);
  }
  // Engine louvres and two silver exhaust tips.
  for (let z = 1.22; z < 1.82; z += 0.13)
    cube(1.2, 0.035, 0.06, carbon, 0, 0.78, z, car);
  cube(1.85, 0.15, 0.24, carbon, 0, 0.52, 2.05, car);
  for (const x of [-0.67, 0.67]) {
    const pipe = cylinder(0.11, 0.11, 0.28, metal, x, 0.39, 2.13, car);
    pipe.rotation.x = Math.PI / 2;
    const hole = cylinder(0.075, 0.075, 0.29, black, x, 0.39, 2.15, car);
    hole.rotation.x = Math.PI / 2;
  }
  for (const x of [-0.73, 0.73]) {
    cube(0.1, 0.37, 0.12, carbon, x, 0.95, 1.72, car);
  }
  cube(2.18, 0.09, 0.43, carbon, 0, 1.17, 1.77, car);
  const headMat = mat("#e1f1ff", 0.18, 0.2, {
      emissive: "#daedff",
      emissiveIntensity: 2.3,
    }),
    tailMat = mat("#ff323e", 0.2, 0.3, {
      emissive: "#f32130",
      emissiveIntensity: 2,
    });
  for (const side of [-1, 1]) {
    const lamp = cube(
      0.6,
      0.055,
      0.05,
      headMat,
      side * 0.57,
      0.58,
      -2.085,
      car,
    );
    lamp.rotation.z = side * 0.12;
    cube(0.69, 0.07, 0.045, tailMat, side * 0.52, 0.66, 2.06, car);
    for (let i = 0; i < 3; i++)
      cube(
        0.07,
        0.18,
        0.04,
        tailMat,
        side * (0.29 + i * 0.18),
        0.58,
        2.07,
        car,
      );
  }
  cube(0.54, 0.18, 0.025, white, 0, 0.5, 2.09, car);
  const plate = mesh(
    new THREE.PlaneGeometry(0.5, 0.13),
    new THREE.MeshBasicMaterial({
      map: label("SSC 01", 256, 64, "#e7e8dc", "#1b2730"),
    }),
    0,
    0.51,
    2.11,
    car,
  );
  plate.rotation.y = 0;
  const wheels = [];
  for (const side of [-1, 1])
    for (const z of [-1.27, 1.32]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * 0.99, 0.39, z);
      car.add(wheel);
      const tire = mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.27, 28),
        rubber,
        0,
        0,
        0,
        wheel,
      );
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(
        new THREE.CylinderGeometry(0.285, 0.285, 0.285, 24),
        metal,
        0,
        0,
        0,
        wheel,
      );
      rim.rotation.z = Math.PI / 2;
      const hub = mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 0.3, 16),
        black,
        0,
        0,
        0,
        wheel,
      );
      hub.rotation.z = Math.PI / 2;
      for (let j = 0; j < 5; j++) {
        const spoke = cube(0.29, 0.055, 0.5, carbon, 0, 0, 0, wheel);
        spoke.rotation.x = (j * Math.PI) / 5;
      }
      wheels.push(wheel);
    }
  const stripeTex = texture(128, 256, (c) => {
    c.fillStyle = "#18232d";
    c.fillRect(43, 0, 14, 256);
    c.fillRect(71, 0, 14, 256);
  });
  const stripe = mesh(
    new THREE.PlaneGeometry(0.8, 1.08),
    new THREE.MeshStandardMaterial({
      map: stripeTex,
      transparent: true,
      roughness: 0.35,
    }),
    0,
    0.795,
    -1.16,
    car,
  );
  stripe.rotation.x = -Math.PI / 2;
  let vehicleRig = null;
  upgradeVehicle(car, {
    model: "coupe",
    length: 4.6,
    forward: "-z",
    paint,
  }).then((rig) => (vehicleRig = rig));
  const shadowTexture = texture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 9, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,.64)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const contactShadow = mesh(
    new THREE.PlaneGeometry(4.2, 6.3),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    }),
    9,
    0.045,
    7,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.castShadow = false;
  let camYaw = 0, lastLivery = -1;
  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();
  function render(s, dt, keys, running, paused) {
    const c = s.car;
    if (lastLivery !== s.livery) {
      paint.color.set(liveries[s.livery].color);
      lastLivery = s.livery;
    }
    car.position.set(c.x, Math.max(c.h, -18) + 0.03, c.z);
    car.rotation.y = -c.a;
    car.rotation.z = THREE.MathUtils.lerp(
      car.rotation.z,
      ((!c.air && (keys.has("d") || keys.has("arrowright"))
        ? -0.035
        : !c.air && (keys.has("a") || keys.has("arrowleft"))
          ? 0.035
          : 0) *
        Math.abs(c.speed)) /
        18,
      0.12,
    );
    car.rotation.x = THREE.MathUtils.lerp(
      car.rotation.x,
      c.air ? Math.max(-0.13, Math.min(0.15, -c.vy * 0.016)) : 0,
      0.12,
    );
    if (running && !paused) {
      wheels.forEach((w) => (w.rotation.x -= (c.speed * dt) / 0.4));
      if (vehicleRig) vehicleRig.spin((-c.speed * dt) / 0.4);
    }
    contactShadow.position.set(c.x, 0.055, c.z);
    contactShadow.rotation.z = -c.a;
    contactShadow.scale.setScalar(1 + Math.max(c.h, 0) * 0.025);
    contactShadow.material.opacity = Math.max(0.2, 1 - Math.max(c.h, 0) * 0.06);
    // Camera follows travel heading while the car spins independently in the air.
    const desiredYaw = c.air ? (c.launchA ?? c.a) : c.a;
    camYaw +=
      Math.atan2(Math.sin(desiredYaw - camYaw), Math.cos(desiredYaw - camYaw)) *
      (1 - Math.exp(-dt * 4.8));
    const dist = 7.4 + Math.min(Math.abs(c.speed) * 0.05, 1.1),
      height = 3.5 + Math.max(c.h, 0) * 0.7;
    const target = new THREE.Vector3(
      c.x - Math.sin(camYaw) * dist,
      height,
      c.z + Math.cos(camYaw) * dist,
    );
    camera.position.lerp(target, 1 - Math.exp(-dt * 7));
    camera.lookAt(
      c.x + Math.sin(camYaw) * 11,
      1.05 + Math.max(c.h, 0) * 0.38,
      c.z - Math.cos(camYaw) * 11,
    );
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      (camera.aspect < 1 ? 78 : 64) + Math.abs(c.speed) * 0.28,
      1 - Math.exp(-dt * 3),
    );
    camera.updateProjectionMatrix();
    checkpointObjects.forEach((v, i) => {
      const active =
        s.route &&
        !s.route.done &&
        courses[s.route.course].path[s.route.index] === i;
      v.diamond.position.y = 3.1 + Math.sin(s.time * 2 + i) * 0.2;
      v.diamond.rotation.y = s.time * 0.8;
      v.g.visible = active || !s.collected.has(i);
      v.tor.material = active ? amber : mint;
      v.diamond.material = active ? amber : mint;
    });
    adjustFrameBudget();
    renderer.render(scene, camera);
  }
  function dispose() {
    removeEventListener("resize", resize);
    renderer.dispose();
  }
  return { render, renderer, scene, camera, dispose };
}
