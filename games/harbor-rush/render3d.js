import * as THREE from "../_deck/three.module.js";
import { drivingFrameBudget } from "../_shared/city-art/driving-view.js";
import { upgradeVehicle } from "../_shared/city-art/vehicle.js";
import {
  GRID,
  METERS_PER_UNIT,
  YGRID,
  WIDTH,
  HEIGHT,
  buildings,
  harborEdge,
  stops,
  routeTo,
} from "./model.js";

const S = METERS_PER_UNIT,
  V = THREE.Vector3;
export function createHarborRenderer(canvas, game) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  const adjustFrameBudget = drivingFrameBudget(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b6c8ce");
  scene.fog = new THREE.Fog("#b6c8ce", 130, 430);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1000);
  camera.position.set(26, 7, 218);
  const hemi = new THREE.HemisphereLight("#bfd8f1", "#79735b", 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffe1ae", 3.2);
  sun.position.set(-60, 100, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    "../_shared/city-art/coast.webp",
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = t;
      scene.environment = t;
      scene.environmentIntensity = 0.85;
      scene.backgroundRotation.y = 1.2;
      water.material.uniforms.skyMap.value = t;
      water.material.uniforms.skyReady.value = 1;
    },
    undefined,
    () => {},
  );
  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const concrete = mat("#a7a698"),
    curb = mat("#d5d0b8"),
    road = mat("#92989b", { roughness: 0.94 }),
    white = mat("#eee9d1"),
    yellow = mat("#d9b65d");
  const roadH = road.clone(),
    roadI = road.clone();
  texLoader.load(
    "../_shared/city-art/asphalt.webp",
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 38);
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      road.map = t;
      road.needsUpdate = true;
      for (const [material, rx, ry] of [
        [roadH, 38, 3],
        [roadI, 3, 3],
      ]) {
        const copy = t.clone();
        copy.repeat.set(rx, ry);
        copy.needsUpdate = true;
        material.map = copy;
        material.needsUpdate = true;
      }
    },
    undefined,
    () => {},
  );
  const unit = new THREE.BoxGeometry(1, 1, 1),
    beamUnit = new THREE.CylinderGeometry(1, 1, 1, 6);
  function box(x, y, z, w, h, d, m, parent = scene, shadow = true) {
    const o = new THREE.Mesh(unit, m);
    o.position.set(x, y, z);
    o.scale.set(w, h, d);
    o.castShadow = shadow;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function beam(a, b, r, m, parent = scene) {
    const delta = new V().subVectors(b, a),
      o = new THREE.Mesh(beamUnit, m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.scale.set(r, delta.length(), r);
    o.quaternion.setFromUnitVectors(new V(0, 1, 0), delta.normalize());
    o.castShadow = true;
    parent.add(o);
    return o;
  }
  function sign(text, bg = "#173a48", fg = "#f5efd9", w = 256, h = 64) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = fg;
    x.lineWidth = 3;
    x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = fg;
    x.font = "bold " + Math.round(h * 0.36) + "px Arial";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, w / 2, h / 2, w - 16);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  }
  // Broad water surrounds the compact, fully driveable port grid.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400, 70, 70).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        skyMap: { value: null },
        skyReady: { value: 0 },
      },
      vertexShader: `uniform float time;varying vec3 vPos;varying vec3 vNormal;void main(){vec3 p=position;p.y+=sin(p.x*.19+time*.7)*.12+cos(p.z*.25-time*.5)*.09;vNormal=normalize(vec3(-.023*cos(p.x*.19+time*.7),1.,.022*sin(p.z*.25-time*.5)));vPos=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vPos,1.);}`,
      fragmentShader: `uniform sampler2D skyMap;uniform float skyReady;uniform float time;varying vec3 vPos;varying vec3 vNormal;void main(){vec3 view=normalize(cameraPosition-vPos);vec3 n=normalize(vNormal+vec3(sin(vPos.z*2.7+time)*.025,0.,cos(vPos.x*3.1-time)*.025));float f=pow(1.-max(0.,dot(view,n)),3.);vec3 r=reflect(-view,n);vec2 uv=vec2(atan(r.z,r.x)*.15915494+.5,asin(clamp(r.y,-1.,1.))*.31830989+.5);vec3 sky=mix(vec3(.56,.72,.76),texture2D(skyMap,uv).rgb,skyReady);vec3 col=mix(vec3(.07,.27,.32),sky,.16+f*.38);float shine=pow(max(dot(reflect(normalize(vec3(.6,-1.,-.4)),n),view),0.),180.);col+=vec3(1.,.84,.53)*shine*.7;gl_FragColor=vec4(col,1.);}`,
    }),
  );
  water.position.set(115, -0.45, 110);
  scene.add(water);
  box(113, -1.4, 112, 200, 2, 201, concrete);
  box(113, -0.36, 112, 200, 0.12, 201, mat("#8a8a77"));
  // Cargo yards sit on substantial concrete piers rather than floating on the sea.
  box(8, -0.7, 188, 16, 1.6, 47, concrete);
  box(223, -0.7, 113, 21, 1.6, 188, concrete);
  box(100, -1.6, -57, 430, 2, 91, mat("#637d79"));
  // Road planes, raised sidewalks, and physically spaced painted lane dashes.
  const paint = [];
  const { left, right, top, bottom } = harborEdge;
  for (const x of [left, right]) box(x * S, 0.14, (top + bottom) * S / 2, 0.25, 0.02, (bottom - top) * S, yellow);
  for (const z of [top, bottom]) box((left + right) * S / 2, 0.14, z * S, (right - left) * S, 0.02, 0.25, yellow);
  for (const x of GRID) {
    box(x * S, -0.12, 112, 15.8, 0.35, 198.5, curb);
    box(x * S, 0.075, 112, 14, 0.06, 198.5, road);
    for (let z = 16; z < 211; z += 4.5)
      paint.push([x * S, 0.12, z, 0.13, 0.018, 2]);
  }
  for (const z of YGRID) {
    box(113.5, -0.12, z * S, 197, 0.35, 15.8, curb);
    box(113.5, 0.085, z * S, 197, 0.06, 14, roadH);
    for (let x = 16; x < 211; x += 4.5)
      paint.push([x, 0.13, z * S, 2, 0.018, 0.13]);
  }
  for (const x of GRID)
    for (const z of YGRID) {
      box(x * S, 0.14, z * S, 13.9, 0.012, 13.9, roadI, scene, false);
      for (let n = -4.5; n <= 4.5; n += 1.45) {
        paint.push([x * S - 5.9, 0.155, z * S + n, 0.95, 0.01, 0.55]);
        paint.push([x * S + 5.9, 0.155, z * S + n, 0.95, 0.01, 0.55]);
      }
    }
  const stripes = new THREE.InstancedMesh(unit, white, paint.length),
    matrix = new THREE.Matrix4();
  paint.forEach((p, i) => {
    matrix.compose(
      new V(p[0], p[1], p[2]),
      new THREE.Quaternion(),
      new V(p[3], p[4], p[5]),
    );
    stripes.setMatrixAt(i, matrix);
  });
  scene.add(stripes);
  // Original facade textures: mullions, recessed windows and warm occupied rooms.
  function facade(seed) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 512;
    const x = c.getContext("2d");
    x.fillStyle = ["#b4aa95", "#87979a", "#bbac96", "#929e9e", "#baaa91"][
      seed % 5
    ];
    x.fillRect(0, 0, 256, 512);
    for (let row = 0; row < 16; row++) {
      x.fillStyle = "#46545a";
      x.fillRect(0, row * 32, 256, 3);
      for (let col = 0; col < 8; col++) {
        const lit = (row * 7 + col * 3 + seed) % 11 === 0;
        x.fillStyle = lit ? "#e8c384" : "#304854";
        x.fillRect(col * 32 + 6, row * 32 + 7, 20, 21);
        x.fillStyle = lit ? "#f4dfac" : "#6b929b";
        x.fillRect(col * 32 + 7, row * 32 + 8, 18, 8);
        x.fillStyle = "#1d333c";
        x.fillRect(col * 32 + 15, row * 32 + 7, 2, 21);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return mat("#fff", { map: t, roughness: 0.68 });
  }
  const roof = mat("#70787a"),
    glass = mat("#3d6576", { metalness: 0.6, roughness: 0.22 }),
    cameraBlockers = [];
  function photoFacade(name, repeatY = 1) {
    const material = mat("#fff", { roughness: 0.78 });
    texLoader.load(
      "../_shared/city-art/wall-" + name + ".webp",
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, repeatY);
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        material.map = t;
        material.needsUpdate = true;
      },
      undefined,
      () => {},
    );
    return material;
  }
  for (const b of buildings) {
    const x = (b.x + b.w / 2) * S,
      z = (b.y + b.h / 2) * S,
      w = b.w * S,
      d = b.h * S;
    const warehouse = b.y > 1500;
    const h = warehouse ? 7.5 : 9 + (b.seed % 4) * 5 + (b.y < 700 ? 12 : 0);
    const wall = photoFacade(
      warehouse ? "loading" : ["office", "stone", "balcony"][b.seed % 3],
      warehouse ? 1 : h / 9,
    );
    cameraBlockers.push(
      new THREE.Box3(
        new V(x - w / 2 - 0.4, 0, z - d / 2 - 0.4),
        new V(x + w / 2 + 0.4, h + 0.5, z + d / 2 + 0.4),
      ),
    );
    box(x, 0.3, z, w + 1, 0.6, d + 1, curb);
    box(x, h / 2, z, w, h, d, [wall, wall, roof, roof, wall, wall]);
    box(x, h + 0.2, z, w + 0.4, 0.4, d + 0.4, roof);
    box(x - 5, h + 1.1, z + 4, 4, 1.8, 3, mat("#b0b7b1"));
    box(x + 6, h + 0.7, z - 5, 3, 1, 5, roof);
    if (!warehouse && (b.kind === 1 || b.kind === 3)) {
      const topH = 12 + b.kind * 4;
      box(x + 4, h + topH / 2, z + 2, w * 0.55, topH, d * 0.7, glass);
      for (let yy = h + 2; yy < h + topH; yy += 3)
        box(x + 4, yy, z + 2, w * 0.56, 0.12, d * 0.71, mat("#a2b5b9"));
    }
    const shop = sign(
      [
        "HARBOR WORKS",
        "NORTH & CO.",
        "NIGHT MARKET",
        "THE MERIDIAN",
        "SOUTH DOCKS",
      ][b.kind],
    );
    box(x, 3.4, b.y * S - 0.12, 16, 1.65, 0.15, shop);
    if (!warehouse)
      box(
        x,
        2.45,
        b.y * S - 0.16,
        w - 0.2,
        4.6,
        0.12,
        photoFacade(b.seed % 2 ? "diner" : "garage"),
      );
  }
  // A distant skyline gives every street a horizon without adding play obstacles.
  for (let i = 0; i < 22; i++) {
    const x = -60 + i * 16,
      z = -40 - (i % 4) * 15,
      h = 18 + ((i * 19) % 55),
      farWall = facade(i + 3);
    box(x, h / 2, z, 10 + (i % 3) * 3, h, 12, [
      farWall,
      farWall,
      roof,
      roof,
      farWall,
      farWall,
    ]);
    if (i % 3 === 0) box(x, h + 3, z, 6, 6, 7, glass);
    if (i % 5 === 0) beam(new V(x, h, z), new V(x, h + 12, z), 0.15, roof);
  }
  // Parks are open shortcuts; trees sit at their edges so they do not block paths.
  const bark = mat("#72533c"),
    leaves = mat("#447b61");
  function tree(x, z, scale = 1) {
    beam(
      new V(x, 0.3, z),
      new V(x + scale * 0.2, 5 * scale, z),
      0.22 * scale,
      bark,
    );
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4 * scale, 1),
      leaves,
    );
    crown.position.set(x, 5.7 * scale, z);
    crown.castShadow = true;
    scene.add(crown);
  }
  for (const p of [
    { x: 79.3, z: 77.3 },
    { x: 123.3, z: 165.3 },
  ]) {
    box(p.x + 12.7, 0.11, p.z + 12.7, 25.4, 0.09, 25.4, mat("#759368"));
    for (const a of [-Math.PI / 4, Math.PI / 4]) {
      const path = box(
        p.x + 12.7,
        0.17,
        p.z + 12.7,
        34,
        0.08,
        2.4,
        mat("#c3b89c"),
      );
      path.rotation.y = a;
    }
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.5, 0.8, 28),
      concrete,
    );
    fountain.position.set(p.x + 12.7, 0.4, p.z + 12.7);
    scene.add(fountain);
    for (let i = 0; i < 6; i++)
      tree(p.x + 2 + (i % 3) * 10.5, p.z + 2 + Math.floor(i / 3) * 21, 0.9);
  }
  // Street furniture: poles, warm luminaires, benches and loading signs.
  const steel = mat("#4c555a", { metalness: 0.65, roughness: 0.45 });
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 4; j++) {
      const x = GRID[i] * S + 8,
        z = YGRID[j] * S + 15;
      beam(new V(x, 0, z), new V(x, 6.5, z), 0.095, steel);
      beam(new V(x, 6.5, z), new V(x - 1.6, 6.5, z), 0.09, steel);
      box(
        x - 1.6,
        6.5,
        z,
        0.7,
        0.18,
        0.35,
        mat("#fff1c6", { emissive: "#ffce80", emissiveIntensity: 0.4 }),
      );
    }
  for (const stop of stops) {
    const x = stop.x * S - 8.5,
      z = stop.y * S + 4;
    beam(new V(x, 0, z), new V(x, 3, z), 0.08, steel);
    box(x, 2.7, z, 2.1, 0.9, 0.12, sign("LOADING", "#245c65"));
  }
  // Shipping containers, gantry cranes and passenger ferry are authored 3D landmarks.
  const rust = mat("#ce854c"),
    containerMats = ["#c56f44", "#3b7890", "#6d8c65"].map((c) => mat(c));
  function container(x, z, k) {
    const m = containerMats[k % 3];
    box(x, 1.4, z, 3, 2.8, 7, m);
    for (let n = -6; n <= 6; n++)
      for (const side of [-1, 1])
        box(x + side * 1.52, 1.4, z + n * 0.5, 0.06, 2.55, 0.065, m);
    for (const end of [-1, 1]) {
      box(x, 1.4, z + end * 3.52, 2.8, 2.6, 0.08, m);
      for (const offset of [-0.7, 0.7])
        box(x + offset, 1.4, z + end * 3.58, 0.06, 2.45, 0.06, steel);
    }
    box(x, 2.84, z, 3.05, 0.08, 7.05, m);
    box(
      x + 1.57,
      1.8,
      z,
      0.025,
      0.6,
      2.7,
      sign(
        k % 2 ? "NORTHSTAR" : "HARBOR FREIGHT",
        k % 2 ? "#325568" : "#81533e",
        "#dddcc9",
        256,
        64,
      ),
    );
  }
  for (let i = 0; i < 12; i++)
    container(3 + (i % 3) * 4.3, 173 + Math.floor(i / 3) * 9, i);
  for (let i = 0; i < 14; i++)
    container(220 + (i % 2) * 4, 27 + Math.floor(i / 2) * 21, i);
  function crane(x, z, rot = 0, scale = 1) {
    const group = new THREE.Group();
    group.scale.setScalar(scale);
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    scene.add(group);
    const gold = mat("#e0ae56");
    beam(new V(-3, 0, -3), new V(-2, 24, -2), 0.5, gold, group);
    beam(new V(3, 0, 3), new V(2, 24, 2), 0.5, gold, group);
    beam(new V(-3, 0, 3), new V(-2, 24, 2), 0.5, gold, group);
    beam(new V(3, 0, -3), new V(2, 24, -2), 0.5, gold, group);
    for (let y = 4; y < 24; y += 4) {
      beam(new V(-2, y, -2), new V(2, y + 4, -2), 0.18, gold, group);
      beam(new V(-2, y, 2), new V(2, y + 4, 2), 0.18, gold, group);
    }
    box(0, 24, 6, 5, 1.1, 28, gold, group);
    beam(new V(0, 30, 0), new V(0, 24, 20), 0.16, steel, group);
    beam(new V(0, 30, 0), new V(0, 24, -8), 0.16, steel, group);
    beam(new V(0, 24, 0), new V(0, 30, 0), 0.3, gold, group);
    beam(new V(0, 24, 18), new V(0, 5, 18), 0.06, steel, group);
    box(0, 5, 18, 2, 0.6, 1.1, steel, group);
    box(2, 22, 3, 3, 2.5, 3, glass, group);
  }
  crane(7, 176, -Math.PI / 2, 0.72);
  crane(224, 185, 0);
  crane(224, 105, 0);
  // Solid quay wall, bollards and gangway leave the road unobstructed.
  box(113, 0, 213, 200, 2.2, 1.2, concrete);
  box(26, 0.6, 217, 6, 0.65, 9, concrete);
  for (let x = 17; x < 210; x += 7) {
    box(x, 1.1, 213, 0.5, 0.55, 0.5, steel);
  }
  const ferry = new THREE.Group();
  ferry.position.set(57, 0, 223);
  scene.add(ferry);
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-14, -3.5);
  hullShape.lineTo(9, -3.5);
  hullShape.quadraticCurveTo(16, 0, 9, 3.5);
  hullShape.lineTo(-14, 3.5);
  hullShape.quadraticCurveTo(-16, 0, -14, -3.5);
  const hull = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 2,
      bevelEnabled: true,
      bevelSize: 0.35,
      bevelThickness: 0.3,
      bevelSegments: 2,
      steps: 1,
    }),
    mat("#e4e4d5"),
  );
  hull.rotation.x = -Math.PI / 2;
  hull.position.y = 0.2;
  ferry.add(hull);
  box(-2, 2.5, 0, 19, 2.8, 5, white, ferry);
  box(1, 4.4, 0, 12, 1.4, 4.6, white, ferry);
  box(4, 4.5, 0, 2, 1.1, 4.7, glass, ferry);
  for (let x = -10; x < 8; x += 2) {
    box(x, 3, -2.55, 1.25, 0.85, 0.05, glass, ferry);
    box(x, 3, 2.55, 1.25, 0.85, 0.05, glass, ferry);
  }
  box(-5, 4.7, 0, 2.5, 1.8, 2, rust, ferry);
  beam(new V(5, 5, 0), new V(5, 8, 0), 0.07, steel, ferry);
  const ferryName = sign("HARBOR LINE", "#e0dfca", "#253f4d");
  box(-1, 1.4, 3.8, 10, 1.3, 0.08, ferryName, ferry);
  // Detailed compact sports courier; traffic uses the same recognizable silhouette.
  function carMesh(color, hero = false, variant = "saloon") {
    const group = new THREE.Group();
    scene.add(group);
    const body = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.52,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
    });
    const dark = mat("#142129", { metalness: 0.3, roughness: 0.24 }),
      chrome = mat("#b2bfc4", { metalness: 0.85, roughness: 0.18 }),
      rubber = mat("#151b20");
    box(0, 0.65, 0, 4.35, 0.67, 1.92, body, group);
    box(1.32, 1.02, 0, 1.75, 0.2, 1.88, body, group);
    box(-1.65, 1.04, 0, 0.8, 0.2, 1.91, body, group);
    const shape = new THREE.Shape();
    shape.moveTo(-1.3, 1.04);
    shape.lineTo(-0.9, 1.75);
    shape.lineTo(0.43, 1.75);
    shape.lineTo(1.05, 1.04);
    shape.closePath();
    const cab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 1.67, bevelEnabled: false }),
      dark,
    );
    cab.position.z = -0.835;
    cab.castShadow = true;
    group.add(cab);
    box(-0.22, 1.79, 0, 1.35, 0.1, 1.7, body, group);
    for (const x of [-1.35, 1.35])
      for (const z of [-0.97, 0.97]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.39, 0.39, 0.29, 16),
          rubber,
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.42, z);
        wheel.castShadow = true;
        group.add(wheel);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.23, 0.23, 0.31, 8),
          chrome,
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.copy(wheel.position);
        group.add(rim);
      }
    box(-2.21, 0.65, 0, 0.08, 0.25, 1.72, dark, group);
    box(2.2, 0.62, 0, 0.08, 0.24, 1.66, dark, group);
    const rear = mat("#9f2332", {
        emissive: "#ff2839",
        emissiveIntensity: hero ? 0.8 : 0.25,
      }),
      front = mat("#fff0cb", { emissive: "#fff2c7", emissiveIntensity: 0.5 });
    for (const z of [-0.65, 0.65]) {
      box(-2.23, 0.94, z, 0.07, 0.16, 0.49, rear, group);
      box(2.23, 0.96, z, 0.07, 0.18, 0.46, front, group);
    }
    box(
      -2.26,
      0.67,
      0,
      0.05,
      0.18,
      0.45,
      sign(hero ? "HR 01" : "HBR", "#f7edcf", "#172b35", 128, 48),
      group,
    );
    box(-1.78, 1.17, 0, 0.13, 0.12, 2.03, dark, group);
    for (const z of [-1.02, 1.02])
      box(0.3, 1.3, z, 0.3, 0.17, 0.18, body, group);
    const keep = [];
    if (hero) {
      keep.push(box(-0.1, 1.87, 0, 0.8, 0.18, 0.55, mat("#d8af6a"), group));
      keep.push(box(-0.1, 1.97, 0, 0.03, 0.015, 0.55, dark, group));
    }
    upgradeVehicle(group, {
      model: variant,
      length: 4.55,
      forward: "+x",
      paint: body,
      keep,
    }).then((detail) => {
      group.userData.detail = detail;
      const mount = group.children.find(
        (child) => child.name === "detailed-" + variant,
      );
      if (hero && mount) {
        const roofHeight = new THREE.Box3()
          .setFromObject(mount)
          .getSize(new V()).y;
        keep[0].position.y = roofHeight + 0.09;
        keep[1].position.y = roofHeight + 0.19;
      }
    });
    return group;
  }
  const player = carMesh("#176f81", true),
    traffic = game.traffic.map((t, i) =>
      carMesh(t.color, false, i % 3 ? "saloon" : "coupe"),
    ),
    rival = carMesh("#b84965", false, "coupe");
  rival.visible = false;
  // Repeated static details share draw calls, including hundreds of cargo ribs.
  const batches = new Map();
  for (const item of [...scene.children]) {
    if (
      !item.isMesh ||
      Array.isArray(item.material) ||
      (item.geometry !== unit && item.geometry !== beamUnit)
    )
      continue;
    const key =
      item.geometry.id + ":" + item.material.id + ":" + item.castShadow;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(item);
  }
  for (const items of batches.values()) {
    if (items.length < 2) continue;
    const merged = new THREE.InstancedMesh(
      items[0].geometry,
      items[0].material,
      items.length,
    );
    merged.castShadow = items[0].castShadow;
    merged.receiveShadow = true;
    items.forEach((item, i) => {
      item.updateMatrix();
      merged.setMatrixAt(i, item.matrix);
      scene.remove(item);
    });
    scene.add(merged);
  }
  // Road-level objective markers and low route lights keep the vista unobscured.
  const targetRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.5, 0.09, 8, 64),
    new THREE.MeshBasicMaterial({ color: "#74efd3" }),
  );
  targetRing.rotation.x = Math.PI / 2;
  targetRing.position.y = 0.2;
  scene.add(targetRing);
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.3, 4),
    new THREE.MeshBasicMaterial({ color: "#74efd3" }),
  );
  marker.rotation.z = Math.PI;
  scene.add(marker);
  const routeGeo = new THREE.BufferGeometry(),
    routeMat = new THREE.LineDashedMaterial({
      color: "#77e9d2",
      dashSize: 1,
      gapSize: 1.3,
      transparent: true,
      opacity: 0.65,
    }),
    routeLine = new THREE.Line(routeGeo, routeMat);
  const pointCount = routeTo(game.car, game.car).length;
  const routePositions = new THREE.BufferAttribute(
    new Float32Array(pointCount * 3),
    3,
  ).setUsage(THREE.DynamicDrawUsage);
  const routeDistances = new THREE.BufferAttribute(
    new Float32Array(pointCount),
    1,
  ).setUsage(THREE.DynamicDrawUsage);
  routeGeo.setAttribute("position", routePositions);
  routeGeo.setAttribute("lineDistance", routeDistances);
  routeLine.frustumCulled = false;
  scene.add(routeLine);
  let angle = game.car.a,
    initialized = false,
    lastTime = 0,
    cameraSide = 1.15;
  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 650 ? 70 : 62;
    cameraSide = w < 650 ? 0 : 1.15;
    camera.updateProjectionMatrix();
  }
  function render(g, input, mode) {
    const now = performance.now(),
      dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    water.material.uniforms.time.value = now / 1000;
    ferry.position.y = Math.sin(now * 0.0008) * 0.07;
    player.position.set(g.car.x * S, 0, g.car.y * S);
    player.rotation.y = -g.car.a;
    player.rotation.z =
      (input.left ? -0.015 : input.right ? 0.015 : 0) *
      Math.min(1, Math.hypot(g.car.vx, g.car.vy) / 150);
    if (mode === "drive")
      player.userData.detail?.spin(
        (Math.hypot(g.car.vx, g.car.vy) * S * dt) / 0.34,
      );
    for (let i = 0; i < traffic.length; i++) {
      traffic[i].position.set(g.traffic[i].x * S, 0, g.traffic[i].y * S);
      traffic[i].rotation.y = -g.traffic[i].a;
      if (mode === "drive")
        traffic[i].userData.detail?.spin(
          ((g.traffic[i].speed || 90) * S * dt) / 0.34,
        );
    }
    rival.visible = !!g.rival;
    if (g.rival) {
      rival.position.set(g.rival.x * S, 0, g.rival.y * S);
      rival.rotation.y = -g.rival.a;
    }
    const delta = Math.atan2(
      Math.sin(g.car.a - angle),
      Math.cos(g.car.a - angle),
    );
    angle += delta * (1 - Math.exp(-5.5 * dt));
    const speed = Math.hypot(g.car.vx, g.car.vy),
      back = 11 + Math.min(3, speed * 0.007),
      dx = Math.cos(angle),
      dz = Math.sin(angle);
    const desired = new V(
        g.car.x * S - dx * back + dz * cameraSide,
        4.6 + Math.min(1, speed * 0.003),
        g.car.y * S - dz * back - dx * cameraSide,
      ),
      look = new V(g.car.x * S + dx * 10, 1.2, g.car.y * S + dz * 10);
    if (mode === "title") {
      desired.set(44 + Math.sin(now * 0.0001) * 5, 8.5, 222);
      look.set(35, 2, 197);
    }
    if (!initialized) {
      camera.position.copy(desired);
      initialized = true;
    } else camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
    if (mode !== "title") {
      const anchor = new V(player.position.x, 1.8, player.position.z),
        arm = camera.position.clone().sub(anchor),
        ray = new THREE.Ray(anchor, arm.clone().normalize()),
        hit = new V();
      let length = arm.length();
      for (const blocker of cameraBlockers)
        if (ray.intersectBox(blocker, hit))
          length = Math.min(
            length,
            Math.max(0.6, anchor.distanceTo(hit) - 0.6),
          );
      camera.position.copy(anchor).addScaledVector(ray.direction, length);
    }
    camera.lookAt(look);
    sun.target.position.set(player.position.x, 0, player.position.z);
    sun.position.set(player.position.x - 70, 110, player.position.z + 55);
    targetRing.visible = marker.visible = routeLine.visible = !!g.mission;
    if (g.mission) {
      const t = g.mission.stage === "pickup" ? g.mission.from : g.mission.to;
      targetRing.position.set(t.x * S, 0.23, t.y * S);
      const color = g.mission.stage === "pickup" ? "#75f3d0" : "#ffd28c";
      targetRing.material.color.set(color);
      marker.material.color.set(color);
      marker.position.set(t.x * S, 4 + Math.sin(now * 0.003) * 0.2, t.y * S);
      const path = routeTo(g.car, t);
      let distance = 0;
      path.forEach((p, i) => {
        if (i)
          distance += Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) * S;
        routePositions.setXYZ(i, p.x * S, 0.2, p.y * S);
        routeDistances.setX(i, distance);
      });
      routePositions.needsUpdate = true;
      routeDistances.needsUpdate = true;
    }
    adjustFrameBudget();
    renderer.render(scene, camera);
  }
  function dispose() {
    renderer.dispose();
  }
  return { resize, render, dispose };
}
