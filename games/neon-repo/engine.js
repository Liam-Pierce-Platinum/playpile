import { contact, orientedBody } from "../_shared/vehicle-contact.js";
export const GRID_X = [220, 760, 1300, 1840, 2380, 2920],
  GRID_Y = [220, 760, 1300, 1840, 2380];
export const WORLD = { w: 3180, h: 2640, road: 154 };
export const METRES_PER_UNIT = 0.1;
export const HANDOVER_RADIUS = 91;
// The painted district limit is a game boundary. Crossing it is not a crash.
export const DISTRICT_EDGE = 65;
export const DEPOT = { x: 760, y: 760 };
export const HANDOVERS = [
  { ...DEPOT, name: "Neon Repo depot" },
  { x: 2380, y: 2380, name: "Dock Nine handover" },
  { x: 1840, y: 760, name: "Market handover" },
];
export const VEHICLES = {
  scout: {
    name: "Dispatch coupe",
    length: 44, width: 19,
    color: "#5df3cd",
    max: 290,
    accel: 200,
    turn: 2.55,
    grip: 9,
    mass: 1,
  },
  comet: {
    name: "Comet GT",
    length: 44, width: 19,
    color: "#ffbf69",
    max: 370,
    accel: 248,
    turn: 2.35,
    grip: 6.8,
    mass: 1.1,
  },
  atlas: {
    name: "Atlas delivery van",
    length: 52, width: 20,
    color: "#c5adff",
    max: 235,
    accel: 145,
    turn: 2.1,
    grip: 8.4,
    mass: 1.6,
  },
  wren: {
    name: "Wren microcar",
    length: 38, width: 19,
    color: "#fb769f",
    max: 270,
    accel: 190,
    turn: 3.2,
    grip: 10,
    mass: 0.8,
  },
  thunder: {
    name: "Thunder V8",
    length: 44, width: 19,
    color: "#8cb9ff",
    max: 340,
    accel: 225,
    turn: 1.95,
    grip: 5.2,
    mass: 1.35,
  },
};
export const JOBS = [
  {
    name: "Last train home",
    client: "Mika · night-shift nurse",
    vehicle: "wren",
    x: 1300,
    y: 1840,
    pay: 420,
    time: 95,
    brief:
      "Mika left her car near the elevated line. Bring it home in one piece.",
    district: "LOWLINE",
  },
  {
    name: "Cold cargo",
    client: "Noon Noodle Co.",
    vehicle: "atlas",
    x: 2380,
    y: 1300,
    pay: 600,
    time: 105,
    brief:
      "A delivery van lost its driver, not its noodles. Heavy on the brakes.",
    district: "EAST MARKET",
  },
  {
    name: "Midnight special",
    client: "Orion Motor Club",
    vehicle: "comet",
    x: 2920,
    y: 220,
    pay: 760,
    time: 100,
    brief:
      "A borrowed GT is waiting outside the rooftop club. Feather that throttle.",
    district: "GLASS QUARTER",
  },
  {
    name: "Thunder after dark",
    client: "Aster Auto",
    vehicle: "thunder",
    x: 2920,
    y: 2380,
    pay: 920,
    time: 120,
    brief:
      "Long wheelbase, loose rear end. Take the corners wide and bring it back clean.",
    district: "DOCK NINE",
  },
  {
    name: "Small car, big city",
    client: "Jun · florist",
    vehicle: "wren",
    x: 760,
    y: 2380,
    pay: 560,
    time: 95,
    brief: "A tiny electric runabout needs a capable pair of hands.",
    district: "SOUTH GARDENS",
  },
  {
    name: "The long way round",
    client: "Harbor Film Unit",
    vehicle: "atlas",
    x: 1840,
    y: 220,
    pay: 680,
    time: 105,
    brief:
      "The film crew needs its equipment van for tomorrow. Recovery approved.",
    district: "GLASS QUARTER",
  },
];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function departureHeading(origin, destination) {
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : Math.PI;
  return dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
}
export function initialCareer(raw = {}) {
  if (!raw || typeof raw !== "object") raw = {};
  const records = {};
  for (let i = 0; i < JOBS.length; i++)
    for (let drop = 0; drop < HANDOVERS.length; drop++) {
      const key = i + ":" + drop,
        r = raw.records?.[key];
      if (r && Number.isFinite(r.bestTime) && r.bestTime > 0)
        records[key] = {
          bestTime: Math.min(36000, r.bestTime),
          bestCondition: clamp(Number(r.bestCondition) || 0, 0, 100),
          count: clamp(Math.floor(Number(r.count) || 0), 0, 1e6),
        };
    }
  return {
    records,
    cash: clamp(Number(raw.cash) || 0, 0, 1e8),
    jobs: clamp(Math.floor(Number(raw.jobs) || 0), 0, 1e6),
    rep: clamp(Number(raw.rep) || 0, 0, 1e8),
    best: clamp(Number(raw.best) || 0, 0, 1e8),
    upgrades: {
      tires: clamp(Math.floor(raw.upgrades?.tires) || 0, 0, 3),
      armor: clamp(Math.floor(raw.upgrades?.armor) || 0, 0, 3),
      boost: clamp(Math.floor(raw.upgrades?.boost) || 0, 0, 3),
    },
  };
}
export function buildings() {
  let out = [];
  for (let i = 0; i < GRID_X.length - 1; i++)
    for (let j = 0; j < GRID_Y.length - 1; j++) {
      const x = GRID_X[i] + 100,
        y = GRID_Y[j] + 100,
        w = GRID_X[i + 1] - x - 100,
        h = GRID_Y[j + 1] - y - 100;
      out.push({
        x,
        y,
        w,
        h,
        seed: i * 19 + j * 7,
        height: 24 + ((i + j) % 4) * 12,
        district: j > 2 ? 3 : i > 3 ? 2 : j === 0 ? 1 : 0,
      });
    }
  return out;
}
export const BLOCKS = buildings();
const walls = BLOCKS.map(b => ({
  x: b.x + b.w / 2, y: b.y + b.h / 2, halfLength: b.w / 2, halfWidth: b.h / 2,
  forward: { x: 1, y: 0 }, side: { x: 0, y: 1 },
}));

function vehicleBody(car) {
  const model = VEHICLES[car.kind] || VEHICLES.scout;
  return orientedBody(car.x, car.y, car.angle, model.length / 2, model.width / 2);
}
export function makeState(career = {}) {
  return {
    career: initialCareer(career),
    car: {
      x: DEPOT.x,
      y: DEPOT.y,
      angle: 0,
      speed: 0,
      vx: 0,
      vy: 0,
      kind: "scout",
      health: 100,
      boost: 100,
    },
    mode: "board",
    job: null,
    stage: "pickup",
    clock: 0,
    elapsed: 0,
    collisions: 0,
    clean: 0,
    combo: 1,
    traffic: makeTraffic(),
    particles: [],
    skids: [],
    toast: null,
    cooldown: 0,
    shake: 0,
    completed: null,
    totalDistance: 0,
  };
}
function makeTraffic() {
  return Array.from({ length: 26 }, (_, i) => {
    const horizontal = i % 2 === 0,
      dir = i % 4 < 2 ? 1 : -1;
    return {
      x: horizontal
        ? 120 + ((i * 379) % 2880)
        : GRID_X[i % GRID_X.length] + dir * 31,
      y: horizontal
        ? GRID_Y[i % GRID_Y.length] + dir * 31
        : 120 + ((i * 431) % 2350),
      angle: horizontal
        ? dir > 0
          ? 0
          : Math.PI
        : dir > 0
          ? Math.PI / 2
          : -Math.PI / 2,
      speed: 65 + (i % 5) * 11,
      kind: ["scout", "wren", "thunder", "atlas"][i % 4],
      color: ["#487b8f", "#ab708a", "#b39b63", "#4c9091"][i % 4],
      horizontal,
      dir,
    };
  });
}
export function acceptJob(s, index) {
  if (s.mode !== "board" && s.mode !== "result") return false;
  const template = JOBS[((index % JOBS.length) + JOBS.length) % JOBS.length];
  s.job = {
    ...template,
    index: ((index % JOBS.length) + JOBS.length) % JOBS.length,
    drop: {
      ...HANDOVERS[
        s.career.jobs < 3 ? 0 : Math.floor(s.career.jobs / 3) % HANDOVERS.length
      ],
    },
    pay: template.pay + Math.floor(s.career.jobs / 6) * 60,
  };
  s.job.recordKey =
    s.job.index +
    ":" +
    (s.career.jobs < 3 ? 0 : Math.floor(s.career.jobs / 3) % HANDOVERS.length);
  s.job.parkedHeading = departureHeading(s.job, s.job.drop);
  s.mode = "play";
  s.stage = "pickup";
  s.clock = template.time;
  s.elapsed = 0;
  s.collisions = 0;
  s.clean = 0;
  s.cooldown = 0;
  s.shake = 0;
  s.skids.length = 0;
  s.car = {
    ...s.car,
    x: DEPOT.x,
    y: DEPOT.y,
    angle: departureHeading(DEPOT, s.job),
    speed: 0,
    vx: 0,
    vy: 0,
    kind: "scout",
    health: 100,
    boost: 100,
  };
  s.completed = null;
  s.totalDistance = 0;
  return true;
}
export function target(s) {
  return s.stage === "pickup" && s.job ? s.job : s.job?.drop || DEPOT;
}
export function canInteract(s) {
  return (
    s.mode === "play" &&
    dist(s.car, target(s)) < HANDOVER_RADIUS &&
    Math.max(Math.abs(s.car.speed), Math.hypot(s.car.vx, s.car.vy)) < 80
  );
}
export function interact(s) {
  if (!canInteract(s)) return null;
  if (s.stage === "pickup") {
    s.stage = "return";
    s.car.kind = s.job.vehicle;
    s.car.x = s.job.x;
    s.car.y = s.job.y;
    s.car.angle = s.job.parkedHeading;
    s.car.speed = 0;
    s.car.vx = 0;
    s.car.vy = 0;
    s.car.boost = 100;
    return "collected";
  }
  const quality = clamp(s.car.health / 100, 0, 1),
    timeBonus = Math.max(0, Math.round(s.clock * 2)),
    cleanBonus = s.collisions === 0 ? 180 : 0,
    pay =
      Math.round(s.job.pay * (0.5 + 0.5 * quality)) + timeBonus + cleanBonus,
    rep = Math.round(50 + quality * 50 + (s.collisions === 0 ? 30 : 0));
  s.career.cash += pay;
  s.career.rep += rep;
  s.career.jobs++;
  s.career.best = Math.max(s.career.best, pay);
  const previous = s.career.records[s.job.recordKey],
    personalBest = !previous || s.elapsed < previous.bestTime;
  s.career.records[s.job.recordKey] = {
    bestTime: Math.min(previous?.bestTime || Infinity, s.elapsed),
    bestCondition: Math.max(
      previous?.bestCondition || 0,
      Math.round(s.car.health),
    ),
    count: (previous?.count || 0) + 1,
  };
  s.completed = {
    personalBest,
    previousTime: previous?.bestTime || null,
    pay,
    rep,
    timeBonus,
    cleanBonus,
    condition: Math.round(s.car.health),
    time: Math.round(s.elapsed),
    name: s.job.name,
  };
  s.mode = "result";
  s.car.speed = 0;
  return "delivered";
}
export function upgrade(s, key) {
  const level = s.career.upgrades[key];
  if (level === undefined || level >= 3) return false;
  const cost = (level + 1) * 650;
  if (s.career.cash < cost) return false;
  s.career.cash -= cost;
  s.career.upgrades[key]++;
  return true;
}
export function nearestRoad(p) {
  let best = { x: GRID_X[0], y: clamp(p.y, 100, WORLD.h - 100) },
    d = Infinity;
  for (const x of GRID_X) {
    const q = { x, y: clamp(p.y, 100, WORLD.h - 100) },
      dd = dist(p, q);
    if (dd < d) {
      d = dd;
      best = q;
    }
  }
  for (const y of GRID_Y) {
    const q = { x: clamp(p.x, 100, WORLD.w - 100), y },
      dd = dist(p, q);
    if (dd < d) {
      d = dd;
      best = q;
    }
  }
  return best;
}
export function recover(s) {
  if (s.mode !== "play") return;
  const p = nearestRoad(s.car),
    vertical = GRID_X.includes(p.x);
  s.car.x = p.x;
  s.car.y = p.y;
  s.car.vx = 0;
  s.car.vy = 0;
  s.car.speed = 0;
  s.car.health = Math.max(5, s.car.health - 5);
  s.car.angle = vertical ? Math.PI / 2 : 0;
  s.cooldown = 1;
}
export function step(s, input, dt) {
  dt = clamp(dt, 0, 0.05);
  if (s.mode !== "play") return;
  s.elapsed += dt;
  s.clock -= dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.shake = Math.max(0, s.shake - dt * 10);
  const c = s.car,
    v = VEHICLES[c.kind],
    up = s.career.upgrades,
    throttle = clamp(input.throttle || 0, -1, 1),
    steer = clamp(input.steer || 0, -1, 1),
    boost = input.boost && c.boost > 0 && throttle > 0;
  const old = { x: c.x, y: c.y };
  c.speed += throttle * v.accel * dt * (boost ? 1.55 : 1);
  if (!throttle) c.speed *= Math.exp(-1.15 * dt);
  if (input.brake) c.speed *= Math.exp(-2.8 * dt);
  c.speed = clamp(c.speed, -v.max * 0.43, v.max * (boost ? 1.32 : 1));
  if (boost) c.boost = Math.max(0, c.boost - dt * (31 - up.boost * 4));
  else c.boost = Math.min(100, c.boost + dt * (9 + up.boost * 2));
  const turning =
    v.turn *
    (1 + up.tires * 0.07) *
    clamp(Math.abs(c.speed) / (c.kind === "atlas" ? 70 : 100), 0, 1) *
    (c.speed >= 0 ? 1 : -1);
  c.angle += steer * turning * dt * (input.brake ? 1.4 : 1);
  const grip = v.grip * (1 + up.tires * 0.11) * (input.brake ? 0.24 : 1),
    mix = 1 - Math.exp(-grip * dt);
  c.vx += (Math.cos(c.angle) * c.speed - c.vx) * mix;
  c.vy += (Math.sin(c.angle) * c.speed - c.vy) * mix;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  const body = vehicleBody(c);
  let impact = 0, source = "";
  function resolve(hit, vx, vy, traffic) {
    const { nx, ny, depth } = hit;
    body.x += nx * depth;
    body.y += ny * depth;
    // Only speed into this surface counts. Sliding alongside it keeps momentum.
    const closing = -((c.vx - vx) * nx + (c.vy - vy) * ny);
    if (closing <= 0) return;
    c.vx += nx * closing * 1.18;
    c.vy += ny * closing * 1.18;
    c.speed = c.vx * body.forward.x + c.vy * body.forward.y;
    if (closing > impact) {
      impact = closing;
      const longitudinal = nx * body.forward.x + ny * body.forward.y;
      source = !traffic ? "Wall" : longitudinal > 0.65 ? "Rear hit" :
        longitudinal < -0.65 ? "Front hit" : "Side hit";
    }
  }
  for (const t of s.traffic) {
    const vx = Math.cos(t.angle) * t.speed, vy = Math.sin(t.angle) * t.speed;
    const previousX = t.x, previousY = t.y;
    t.waiting = false;
    t.x += vx * dt;
    t.y += vy * dt;
    if (t.x < 0) t.x = WORLD.w;
    if (t.x > WORLD.w) t.x = 0;
    if (t.y < 0) t.y = WORLD.h;
    if (t.y > WORLD.h) t.y = 0;
    if (Math.abs(t.x - body.x) >= 60 || Math.abs(t.y - body.y) >= 60) continue;
    const hit = contact(body, vehicleBody(t));
    if (!hit) continue;
    // Traffic yields to a stopped driver, including at the dispatch spawn and handover.
    if (Math.hypot(c.vx, c.vy) < 5 && vx * hit.nx + vy * hit.ny > 0) {
      t.x = previousX;
      t.y = previousY;
      t.waiting = true;
    } else {
      resolve(hit, vx, vy, true);
    }
  }
  const extentX = Math.abs(body.forward.x) * body.halfLength + Math.abs(body.side.x) * body.halfWidth;
  const extentY = Math.abs(body.forward.y) * body.halfLength + Math.abs(body.side.y) * body.halfWidth;
  for (const wall of walls) {
    if (Math.abs(body.x - wall.x) >= wall.halfLength + extentX ||
        Math.abs(body.y - wall.y) >= wall.halfWidth + extentY) continue;
    const hit = contact(body, wall);
    if (hit) resolve(hit, 0, 0, false);
  }
  c.x = clamp(body.x, DISTRICT_EDGE + extentX, WORLD.w - DISTRICT_EDGE - extentX);
  c.y = clamp(body.y, DISTRICT_EDGE + extentY, WORLD.h - DISTRICT_EDGE - extentY);
  if (c.x !== body.x || c.y !== body.y) {
    if (c.x !== body.x && (body.x - c.x) * c.vx > 0) c.vx = 0;
    if (c.y !== body.y && (body.y - c.y) * c.vy > 0) c.vy = 0;
    c.speed = c.vx * body.forward.x + c.vy * body.forward.y;
    if (!s.toast || s.toast.ttl <= 0) s.toast = { text: "District limit · turn back", ttl: 1.5 };
  }
  if (s.cooldown <= 0 && impact > 45) {
    const damage = clamp(impact / 25, 2, 15) / (1 + up.armor * 0.3);
    c.health = Math.max(5, c.health - damage);
    s.collisions++;
    s.shake = clamp(impact / 25, 2, 12);
    s.cooldown = 0.65;
    s.toast = { text: source + " · Bodywork −" + Math.round(damage) + "%", ttl: 1.5 };
  }
  s.totalDistance += dist(c, old);
  if (input.brake && Math.abs(c.speed) > 75) {
    s.skids.push({ x: c.x, y: c.y, a: c.angle, ttl: 8 });
    if (s.skids.length > 160) s.skids.shift();
  }
  for (const skid of s.skids) skid.ttl -= dt;
  s.skids = s.skids.filter((p) => p.ttl > 0);
  if (s.toast) s.toast.ttl -= dt;
}

// Street-aligned GPS avoids directing a player through buildings.
export function route(s) {
  const to = target(s),
    p = nearestRoad(s.car),
    vertical = GRID_X.includes(p.x) &&
      (!GRID_Y.includes(p.y) || Math.abs(Math.sin(s.car.angle)) > Math.abs(Math.cos(s.car.angle)));
  const points = [
    { x: s.car.x, y: s.car.y },
    p,
    vertical ? { x: p.x, y: to.y } : { x: to.x, y: p.y },
    { x: to.x, y: to.y },
  ];
  return points.filter(
    (point, i) => i === 0 || dist(point, points[i - 1]) > 12,
  );
}
