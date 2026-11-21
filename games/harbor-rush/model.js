import { contact, orientedBody, projectedRadius } from "../_shared/vehicle-contact.js";
export const GRID = [260, 700, 1140, 1580, 2020],
  YGRID = [240, 680, 1120, 1560, 2000];
export const METERS_PER_UNIT = 0.1;
export const WIDTH = 2360,
  HEIGHT = 2240,
  ROAD = 144;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const nearest = (v, arr) =>
  arr.reduce((a, b) => (Math.abs(a - v) < Math.abs(b - v) ? a : b));
export const nodes = GRID.flatMap((x, i) =>
  YGRID.map((y, j) => ({ x, y, i, j })),
);
export const stops = [
  { x: 260, y: 2000, name: "Dispatch Yard", district: "South Docks" },
  { x: 700, y: 2000, name: "Ferry Terminal", district: "South Docks" },
  { x: 1580, y: 2000, name: "Container Nine", district: "South Docks" },
  { x: 2020, y: 1560, name: "Harbor Market", district: "Waterfront" },
  { x: 2020, y: 680, name: "Lighthouse Studio", district: "Waterfront" },
  { x: 1580, y: 240, name: "Skyline Records", district: "North Heights" },
  { x: 700, y: 240, name: "Observatory", district: "North Heights" },
  { x: 260, y: 680, name: "Old Town Bakery", district: "Old Town" },
  { x: 700, y: 1120, name: "Juniper Arcade", district: "Midtown" },
  { x: 1140, y: 1560, name: "Canal Workshop", district: "Midtown" },
  { x: 1140, y: 680, name: "Botanical Lab", district: "Midtown" },
  { x: 260, y: 1560, name: "Night Owl Coffee", district: "Old Town" },
];
export const buildings = [];
for (let i = 0; i < 4; i++)
  for (let j = 0; j < 4; j++) {
    const x = GRID[i] + 93,
      y = YGRID[j] + 93,
      w = 254,
      h = 254;
    if ((i === 1 && j === 1) || (i === 2 && j === 3)) continue;
    buildings.push({ x, y, w, h, kind: (i * 3 + j) % 5, seed: i * 7 + j });
  }
export const harborEdge = { left: 150, right: 2120, top: 130, bottom: 2120 };
const walls = buildings.map(b => orientedBody(b.x + b.w / 2, b.y + b.h / 2, 0, b.w / 2, b.h / 2));
const carBody = c => orientedBody(c.x, c.y, c.a, 22.75, 10.5);
export function initialSave() {
  return {
    credits: 0,
    deliveries: 0,
    best: 0,
    distance: 0,
    engine: 0,
    grip: 0,
    armor: 0,
    stamps: 0,
  };
}
export function sanitizeSave(s) {
  const o = initialSave();
  for (const k of Object.keys(o))
    o[k] = Number.isFinite(s?.[k])
      ? clamp(
          Math.floor(s[k]),
          0,
          ["engine", "grip", "armor"].includes(k)
            ? 3
            : k === "stamps"
              ? 4095
              : 1e8,
        )
      : 0;
  return o;
}
export function createGame(save = initialSave()) {
  return {
    save: sanitizeSave(save),
    car: { x: 260, y: 2070, a: -Math.PI / 2, vx: 0, vy: 0, boost: 100, hit: 0 },
    mission: null,
    particles: [],
    skids: [],
    traffic: [],
    rival: null,
    time: 0,
    stepRemainder: 0,
    shiftEarned: 0,
    shiftDeliveries: 0,
    toast: null,
  };
}
export function makeContract(g, type = "standard") {
  const n = g.save.deliveries;
  let from =
    stops[
      (n * 3 + (type === "rival" ? 2 : type === "fragile" ? 5 : 0)) %
        stops.length
    ];
  if (n === 0 && type === "standard") from = stops[0];
  const index = stops.indexOf(from),
    to = stops[(index + (n === 0 ? 1 : 4 + (n % 4))) % stops.length];
  const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  g.mission = {
    type,
    from,
    to,
    stage: "pickup",
    cargo: 100,
    elapsed: 0,
    hold: 0,
    par: 35 + length / 95,
    reward: Math.round(
      110 +
        length * 0.09 +
        (type === "rival" ? 90 : type === "fragile" ? 65 : 0),
    ),
  };
  g.rival = null;
  return g.mission;
}
export function upgradeCost(level) {
  return [220, 440, 760][level] ?? Infinity;
}
export function buyUpgrade(g, kind) {
  if (!["engine", "grip", "armor"].includes(kind)) return false;
  const cost = upgradeCost(g.save[kind]);
  if (g.save.credits < cost) return false;
  g.save.credits -= cost;
  g.save[kind]++;
  return true;
}
function emit(g, text, kind = "info") {
  g.toast = { text, kind, id: g.time + Math.random() };
}
export function recover(g) {
  const c = g.car;
  c.x = nearest(c.x, GRID);
  c.y = nearest(c.y, YGRID);
  c.vx = c.vy = 0;
  c.a = -Math.PI / 2;
  c.hit = 0;
  emit(g, "Back on the road · no charge");
}
function impact(g, speed) {
  const c = g.car;
  if (c.hit > 0 || speed < 35) return;
  c.hit = 0.65;
  if (g.mission?.stage === "delivery")
    g.mission.cargo = clamp(
      g.mission.cargo -
        (speed * (g.mission.type === "fragile" ? 0.18 : 0.1)) /
          (1 + g.save.armor * 0.35),
      0,
      100,
    );
  for (let i = 0; i < 8; i++)
    g.particles.push({
      x: c.x,
      y: c.y,
      vx: Math.cos(i) * 60,
      vy: Math.sin(i) * 60,
      life: 0.4,
      color: "#f5bd76",
    });
}
function resolveContact(g, hit, otherVx, otherVy, damageFactor) {
  const c = g.car;
  c.x += hit.nx * hit.depth;
  c.y += hit.ny * hit.depth;
  const closing = -((c.vx - otherVx) * hit.nx + (c.vy - otherVy) * hit.ny);
  if (closing <= 0) return;
  c.vx += hit.nx * closing * 1.2;
  c.vy += hit.ny * closing * 1.2;
  impact(g, closing * damageFactor);
}
function collision(g) {
  const c = g.car;
  const body = carBody(c);
  const extentX = projectedRadius(body, { x: 1, y: 0 });
  const extentY = projectedRadius(body, { x: 0, y: 1 });
  for (const wall of walls) {
    if (Math.abs(c.x - wall.x) >= extentX + wall.halfLength || Math.abs(c.y - wall.y) >= extentY + wall.halfWidth) continue;
    body.x = c.x;
    body.y = c.y;
    const hit = contact(body, wall);
    if (hit) resolveContact(g, hit, 0, 0, 1);
  }
  // The painted port limit stops outward travel without damaging a delivery.
  const x = clamp(c.x, harborEdge.left + extentX, harborEdge.right - extentX);
  const y = clamp(c.y, harborEdge.top + extentY, harborEdge.bottom - extentY);
  if ((c.x - x) * c.vx > 0) c.vx = 0;
  if ((c.y - y) * c.vy > 0) c.vy = 0;
  c.x = x;
  c.y = y;
}
export function spawnTraffic(g) {
  g.traffic = [];
  for (let i = 0; i < 20; i++) {
    const ix = i % 4,
      iy = Math.floor(i / 4) % 4;
    const loop = [
      { x: GRID[ix] + 23, y: YGRID[iy] + 23 },
      { x: GRID[ix + 1] - 23, y: YGRID[iy] + 23 },
      { x: GRID[ix + 1] - 23, y: YGRID[iy + 1] - 23 },
      { x: GRID[ix] + 23, y: YGRID[iy + 1] - 23 },
    ];
    g.traffic.push({
      x: loop[i % 4].x,
      y: loop[i % 4].y,
      loop,
      target: (i + 1) % 4,
      speed: 45 + (i % 4) * 8,
      a: 0,
      color: ["#db996d", "#6599a3", "#ab85ab", "#8fa67c"][i % 4],
    });
  }
}
function updateTraffic(g, dt) {
  for (const t of g.traffic) {
    let node = t.loop[t.target],
      dx = node.x - t.x,
      dy = node.y - t.y,
      d = Math.hypot(dx, dy);
    if (d < 7) {
      t.target = (t.target + 1) % 4;
      node = t.loop[t.target];
      dx = node.x - t.x;
      dy = node.y - t.y;
      d = Math.hypot(dx, dy);
    }
    t.a = Math.atan2(dy, dx);
    t.x += (dx / Math.max(1, d)) * t.speed * dt;
    t.y += (dy / Math.max(1, d)) * t.speed * dt;
    const c = g.car;
    if (Math.abs(t.x - c.x) >= 52 || Math.abs(t.y - c.y) >= 52) continue;
    const hit = contact(carBody(c), carBody(t));
    if (hit) resolveContact(g, hit, Math.cos(t.a) * t.speed, Math.sin(t.a) * t.speed, 0.5);
  }
}
function updateRival(g, dt) {
  const r = g.rival;
  if (!r) return;
  let d = distance(r, r.target);
  if (d < 6) {
    r.x = r.target.x;
    r.y = r.target.y;
    const opts = nodes.filter(
      (n) => Math.abs(n.x - r.x) + Math.abs(n.y - r.y) === 440,
    );
    opts.sort((a, b) => distance(a, g.car) - distance(b, g.car));
    r.target = opts[0] || r.target;
  }
  const dx = r.target.x - r.x,
    dy = r.target.y - r.y;
  d = Math.hypot(dx, dy);
  r.a = Math.atan2(dy, dx);
  const step = Math.min(d, Math.min(210, 150 + g.save.deliveries * 2) * dt);
  if (d) {
    r.x += (dx / d) * step;
    r.y += (dy / d) * step;
  }
  r.cooldown = Math.max(0, r.cooldown - dt);
  if (r.cooldown <= 0 && distance(r, g.car) < 52 && contact(carBody(g.car), carBody(r))) {
    r.cooldown = 5;
    if (g.mission?.stage === "delivery") {
      g.mission.cargo = Math.max(0, g.mission.cargo - 8);
      emit(g, "Rival contact · cargo −8%");
    }
  }
}
export function step(g, input, dt) {
  dt = clamp(dt, 0, 0.04);
  g.time += dt;
  const c = g.car;
  const throttle = input.throttle ? 1 : 0,
    brake = input.brake ? 1 : 0,
    steer = (input.right ? 1 : 0) - (input.left ? 1 : 0),
    oldX = c.x,
    oldY = c.y;
  let forward = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a),
    lateral = -c.vx * Math.sin(c.a) + c.vy * Math.cos(c.a);
  const boosting = input.boost && throttle && c.boost > 1 && forward > 20;
  c.boost = clamp(c.boost + (boosting ? -32 : 11) * dt, 0, 100);
  const accel = throttle * 230 - brake * (forward > 10 ? 410 : 170);
  forward += accel * dt;
  forward *= Math.exp(-(throttle || brake ? 0.35 : 1.15) * dt);
  forward = clamp(
    forward,
    -105,
    270 + g.save.engine * 24 + (boosting ? 125 : 0),
  );
  if (boosting) forward += 150 * dt;
  const turn =
    steer *
    2.5 *
    clamp(Math.abs(forward) / 110, 0, 1) *
    (forward < 0 ? -1 : 1) *
    dt *
    (input.drift ? 1.35 : 1);
  c.a += turn;
  lateral -= forward * Math.sin(turn);
  lateral *= Math.exp(-(input.drift ? 1.3 : 7 + g.save.grip * 1.7) * dt);
  c.vx = Math.cos(c.a) * forward - Math.sin(c.a) * lateral;
  c.vy = Math.sin(c.a) * forward + Math.cos(c.a) * lateral;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.hit = Math.max(0, c.hit - dt);
  if (input.drift && Math.abs(forward) > 80) {
    g.skids.push({ x: c.x, y: c.y, a: c.a, life: 8 });
    if (g.skids.length > 450) g.skids.shift();
  }
  if (boosting)
    g.particles.push({
      x: c.x - Math.cos(c.a) * 24,
      y: c.y - Math.sin(c.a) * 24,
      vx: -Math.cos(c.a) * 60,
      vy: -Math.sin(c.a) * 60,
      life: 0.25,
      color: "#7afce7",
    });
  for (const p of g.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
  for (const s of g.skids) s.life -= dt;
  g.skids = g.skids.filter((s) => s.life > 0);
  updateTraffic(g, dt);
  collision(g);
  g.save.distance += distance({ x: oldX, y: oldY }, c);
  updateRival(g, dt);
  for (let i = 0; i < stops.length; i++) {
    if (!(g.save.stamps & (1 << i)) && distance(c, stops[i]) < 58) {
      g.save.stamps |= 1 << i;
      g.save.credits += 35;
      g.shiftEarned += 35;
      emit(g, "Discovered " + stops[i].name + " · +$35", "discovery");
    }
  }
  const m = g.mission;
  if (!m) return;
  m.elapsed += dt;
  const target = m.stage === "pickup" ? m.from : m.to;
  if (distance(c, target) < 48 && Math.hypot(c.vx, c.vy) < 50) m.hold += dt;
  else m.hold = 0;
  if (m.hold >= 0.75) {
    m.hold = 0;
    if (m.stage === "pickup") {
      m.stage = "delivery";
      m.elapsed = 0;
      emit(g, "Package loaded · next stop: " + m.to.name);
      if (m.type === "rival") {
        const start = nodes.reduce((a, b) =>
          Math.abs(distance(b, c) - 500) < Math.abs(distance(a, c) - 500)
            ? b
            : a,
        );
        g.rival = { ...start, target: { ...start }, a: 0, cooldown: 2 };
      }
    } else {
      const clean = Math.round(m.cargo * 0.5),
        timely = m.elapsed <= m.par ? 45 : 0,
        pay =
          Math.round(m.reward * (0.45 + (0.55 * m.cargo) / 100)) +
          clean +
          timely;
      g.save.credits += pay;
      g.save.deliveries++;
      g.shiftDeliveries++;
      g.shiftEarned += pay;
      g.save.best = Math.max(g.save.best, pay);
      g.mission = null;
      g.rival = null;
      emit(
        g,
        "Delivered! +$" + pay + (timely ? " · on-time bonus" : ""),
        "delivery",
      );
    }
  }
}
// Render cadence must not change acceleration, package loading or delivery time.
// The app pauses on blur/visibility changes and resets its clock on resume.
export function advance(g, input, elapsed) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return;
  const tick = 1 / 60;
  g.stepRemainder += Math.min(elapsed, 0.25);
  while (g.stepRemainder + 1e-9 >= tick) {
    step(g, input, tick);
    g.stepRemainder = Math.max(0, g.stepRemainder - tick);
  }
}
export function routeTo(car, target) {
  const nx = nearest(car.x, GRID),
    ny = nearest(car.y, YGRID);
  const start =
    Math.abs(car.x - nx) < Math.abs(car.y - ny)
      ? { x: nx, y: car.y }
      : { x: car.x, y: ny };
  return [
    { x: car.x, y: car.y },
    start,
    { x: nx, y: ny },
    { x: target.x, y: ny },
    { x: target.x, y: target.y },
  ];
}
