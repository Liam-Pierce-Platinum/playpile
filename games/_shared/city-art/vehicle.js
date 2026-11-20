import * as THREE from "../../_deck/three.module.js";
import { GLTFLoader } from "../../apex/vendor/jsm/loaders/GLTFLoader.js";

const sources = new Map();
const loader = new GLTFLoader();
let streetReflections;
const rotations = {
  "+z": 0,
  "+x": Math.PI / 2,
  "-z": Math.PI,
  "-x": -Math.PI / 2,
};

function finish(color, roughness, metalness, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  });
}

const finishes = {
  Windows: finish("#172635", 0.12, 0.57, { envMapIntensity: 1.6 }),
  Black: finish("#24272b", 0.88, 0.02),
  Grey: finish("#828a93", 0.31, 0.77),
  "Material.007": finish("#ccd1d3", 0.24, 0.76),
  Headlights: finish("#f4ead5", 0.22, 0.32, {
    emissive: "#ffe6bb",
    emissiveIntensity: 0.38,
  }),
  TailLights: finish("#9c1017", 0.22, 0.2, {
    emissive: "#ff1f13",
    emissiveIntensity: 0.34,
  }),
};

function reflectedStreet() {
  if (!streetReflections) {
    streetReflections = new THREE.TextureLoader().load(
      new URL("reflections.webp", import.meta.url).href,
    );
    streetReflections.mapping = THREE.EquirectangularReflectionMapping;
    streetReflections.colorSpace = THREE.SRGBColorSpace;
    finishes.Windows.envMap = streetReflections;
    finishes.Windows.needsUpdate = true;
  }
  return streetReflections;
}

function loadModel(name) {
  if (!sources.has(name)) {
    const url = new URL(name + ".glb", import.meta.url).href;
    const pending = loader.loadAsync(url).then((gltf) => gltf.scene);
    sources.set(name, pending);
    pending.catch(() => sources.delete(name));
  }
  return sources.get(name);
}

// Keep the playable procedural car in place during loading or on a network failure.
// Position and heading come from the existing game physics group.
export async function upgradeVehicle(
  group,
  { model, length, forward, paint, keep = [] },
) {
  const placeholders = group.children.filter((child) => !keep.includes(child));
  try {
    const car = (await loadModel(model)).clone(true);
    const coat = new THREE.MeshPhysicalMaterial({
      color: paint?.color || 0x306a7c,
      roughness: 0.27,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.13,
      envMap: reflectedStreet(),
      envMapIntensity: 0.95,
    });
    // Livery changes update the original game material in place.
    if (paint?.color) coat.color = paint.color;
    car.traverse((part) => {
      if (!part.isMesh) return;
      const material = part.material;
      part.material =
        material.name === "White" || material.name === "LightBlue"
          ? coat
          : finishes[material.name] || material;
      part.castShadow = true;
      part.receiveShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(car);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const wheels = [];
    // The source stores vertices relative to the vehicle origin, including the wheels.
    // Give each axle a local pivot without copying its mesh buffers for every traffic car.
    for (const child of [...car.children]) {
      if (!/wheel/i.test(child.name)) continue;
      const axle = new THREE.Group();
      new THREE.Box3().setFromObject(child).getCenter(axle.position);
      car.add(axle);
      axle.attach(child);
      wheels.push(axle);
    }
    car.position.set(-center.x, -bounds.min.y, -center.z);
    const mount = new THREE.Group();
    mount.name = "detailed-" + model;
    mount.add(car);
    mount.scale.setScalar(length / size.z);
    mount.rotation.y = rotations[forward] || 0;
    for (const child of placeholders) group.remove(child);
    group.add(mount);
    return {
      spin: (radians) => {
        for (const wheel of wheels) wheel.rotation.x += radians;
      },
    };
  } catch {
    return { spin() {} };
  }
}
