export const roofs = [
  { x: 0, z: 0, w: 38, d: 30, name: "CLUBHOUSE", color: "#425a6c" },
  {
    x: 0,
    z: -36,
    w: 34,
    d: 25,
    name: "NORTH / THE OBSERVATORY",
    color: "#5f6975",
  },
  { x: 0, z: 36, w: 40, d: 25, name: "SOUTH / SUNSET DECK", color: "#54636e" },
  { x: 42, z: 0, w: 28, d: 42, name: "EAST / THE GARDEN", color: "#4e6a6c" },
  { x: -42, z: 0, w: 28, d: 42, name: "WEST / SIGNAL HILL", color: "#616674" },
];
export const bridges = [
  { x: 0, z: -19.5, w: 5, d: 12 },
  { x: 0, z: 19.5, w: 5, d: 12 },
  { x: 23.5, z: 0, w: 12, d: 5 },
  { x: -23.5, z: 0, w: 12, d: 5 },
];
export const ramps = [
  { x: 9, z: -12, w: 5, d: 6, dir: 0 },
  { x: -9, z: 12, w: 5, d: 6, dir: Math.PI },
  { x: 16, z: -9, w: 6, d: 5, dir: Math.PI / 2 },
  { x: -16, z: 9, w: 6, d: 5, dir: -Math.PI / 2 },
  { x: 9, z: -27, w: 5, d: 6, dir: Math.PI },
  { x: -9, z: 27, w: 5, d: 6, dir: 0 },
  { x: 31, z: -9, w: 6, d: 5, dir: -Math.PI / 2 },
  { x: -31, z: 9, w: 6, d: 5, dir: Math.PI / 2 },
];
export const beacons = [
  { x: 9, z: -37 },
  { x: 42, z: -12 },
  { x: 45, z: 13 },
  { x: 8, z: 39 },
  { x: -12, z: 37 },
  { x: -43, z: 12 },
  { x: -42, z: -12 },
  { x: 0, z: 0 },
];
export const liveries = [
  { name: "MINT CONDITION", color: "#a8f5ca", cost: 0 },
  { name: "PEACH FIZZ", color: "#ffad8e", cost: 600 },
  { name: "ELECTRIC LILAC", color: "#c3aeff", cost: 1600 },
  { name: "GOLDEN HOUR", color: "#ffdf77", cost: 3500 },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const courses = [
  {
    name: "FIRST FLIGHT",
    seconds: 30,
    path: [0],
    description: "One jump. One beacon. Learn your launch.",
  },
  {
    name: "ROOFTOP TOUR",
    seconds: 100,
    path: [7, 1, 2, 7, 3, 4],
    description: "Six checkpoints. Pick ramps or the safe bridges.",
  },
  {
    name: "CLUB CIRCUIT",
    seconds: 150,
    path: [0, 7, 1, 2, 7, 3, 4, 7, 5, 6, 7],
    description: "All five rooftops. Eleven checkpoints. Find your line.",
  },
];
const safe = (n) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
export function createGame(saved = {}) {
  const rep = safe(saved?.rep);
  return {
    car: {
      x: 9,
      z: 7,
      h: 0,
      vy: 0,
      speed: 0,
      a: 0,
      air: false,
      airTime: 0,
      spin: 0,
      stunt: false,
    },
    rep,
    best: safe(saved?.best),
    landings: safe(saved?.landings),
    livery:
      Number.isInteger(saved?.livery) && liveries[saved.livery]?.cost <= rep
        ? saved.livery
        : 0,
    records: Object.fromEntries(
      Object.entries(saved?.records || {}).filter(
        ([k, v]) => courses[k] && Number.isFinite(v) && v > 0,
      ),
    ),
    boost: 1,
    combo: 0,
    comboTime: 0,
    time: 0,
    checkpoint: { x: 9, z: 7, a: 0 },
    cooldown: 0,
    toast: "",
    toastTime: 0,
    events: [],
    route: null,
    collected: new Set(
      (Array.isArray(saved?.collected) ? saved.collected : []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < 8,
      ),
    ),
    lastPad: -1,
    totalFalls: 0,
  };
}
export function toast(s, text) {
  s.toast = text;
  s.toastTime = 3;
}
export function reset(s) {
  Object.assign(s.car, {
    ...s.checkpoint,
    h: 0,
    vy: 0,
    speed: 0,
    air: false,
    airTime: 0,
    spin: 0,
    stunt: false,
  });
  s.cooldown = 1;
  s.combo = 0;
  s.comboTime = 0;
  s.events.push({ type: "reset" });
  toast(s, "BACK ON THE ROOF · KEEP GOING");
}
export function startRoute(s, course = 0) {
  const def = courses[course] || courses[0];
  s.checkpoint = { x: 9, z: 7, a: 0 };
  reset(s);
  s.boost = 1;
  s.route = {
    remaining: def.seconds,
    index: 0,
    done: false,
    course,
    elapsed: 0,
    success: false,
  };
  toast(s, def.name + " · FOLLOW THE GOLD BEACON");
}
export function surface(x, z) {
  return [...roofs, ...bridges].find(
    (r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2,
  );
}
export function tick(s, keys, dt) {
  dt = Math.min(dt, 0.04);
  s.time += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.toastTime = Math.max(0, s.toastTime - dt);
  s.comboTime = Math.max(0, s.comboTime - dt);
  if (!s.comboTime) s.combo = 0;
  const c = s.car;
  const up = keys.has("w") || keys.has("arrowup"),
    down = keys.has("s") || keys.has("arrowdown"),
    left = keys.has("a") || keys.has("arrowleft"),
    right = keys.has("d") || keys.has("arrowright"),
    brake = keys.has(" ");
  const turn = (right ? 1 : 0) - (left ? 1 : 0),
    boost = keys.has("shift") && s.boost > 0.02 && up && !c.air;
  s.boost = clamp(s.boost + (boost ? -0.3 : 0.12) * dt, 0, 1);
  if (!c.air) {
    c.speed += ((up ? (boost ? 20 : 12) : 0) - (down ? 14 : 0)) * dt;
    c.speed *= Math.pow(brake ? 0.08 : 0.7, dt);
    c.speed = clamp(c.speed, -7, boost ? 25 : 18);
    c.a +=
      turn *
      dt *
      (1.5 + Math.min(Math.abs(c.speed) / 14, 1) * 0.6) *
      (c.speed < -0.4 ? -1 : 1) *
      Math.min(Math.abs(c.speed) / 3, 1);
  } else {
    const spin = turn * dt * 3.8;
    c.a += spin;
    c.spin += spin;
    c.airTime += dt;
    c.vy -= 18 * dt;
    c.h += c.vy * dt;
  }
  const heading = c.air ? (c.launchA ?? c.a) : c.a;
  c.x += Math.sin(heading) * c.speed * dt;
  c.z -= Math.cos(heading) * c.speed * dt;
  if (!c.air && s.cooldown <= 0) {
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      if (
        Math.abs(c.x - r.x) < r.w * 0.5 &&
        Math.abs(c.z - r.z) < r.d * 0.5 &&
        Math.cos(c.a - r.dir) > 0.7 &&
        c.speed > 6
      ) {
        c.air = true;
        c.stunt = true;
        c.vy = 10 + Math.abs(c.speed) * 0.12;
        c.h = 0.1;
        c.airTime = 0;
        c.spin = 0;
        c.launchA = c.a;
        s.cooldown = 0.9;
        s.events.push({ type: "jump" });
        break;
      }
    }
  }
  if (c.air && c.h <= 0) {
    if (surface(c.x, c.z)) {
      c.h = 0;
      c.air = false;
      c.vy = 0;
      if (c.stunt && c.airTime > 0.4) {
        s.landings++;
        s.combo = s.comboTime > 0 ? s.combo + 1 : 1;
        s.comboTime = 12;
        const rotations =
          Math.floor((Math.abs(c.spin) / (Math.PI * 2)) * 2) / 2;
        const points = Math.round(
          (80 + c.airTime * 45 + rotations * 160) * Math.min(s.combo, 5),
        );
        s.rep += points;
        s.best = Math.max(s.best, points);
        const roof = roofs.find(
          (r) => Math.abs(c.x - r.x) < r.w / 2 && Math.abs(c.z - r.z) < r.d / 2,
        );
        if (roof)
          s.checkpoint = {
            x: clamp(c.x, roof.x - roof.w / 2 + 4, roof.x + roof.w / 2 - 4),
            z: clamp(c.z, roof.z - roof.d / 2 + 4, roof.z + roof.d / 2 - 4),
            a: c.a,
          };
        s.events.push({ type: "land", points, rotations });
        toast(
          s,
          (rotations ? "AIR SPIN " + rotations * 360 + "°" : "CLEAN LANDING") +
            "  +" +
            points +
            " REP",
        );
      }
      c.stunt = false;
      s.cooldown = 0.8;
      c.speed *= 0.83;
    } else if (c.h < -12) {
      s.totalFalls++;
      reset(s);
    }
  } else if (!c.air && !surface(c.x, c.z)) {
    c.air = true;
    c.stunt = false;
    c.vy = 0;
    c.h = -0.02;
    c.airTime = 0;
    c.spin = 0;
    c.launchA = c.a;
  }
  for (let i = 0; i < beacons.length; i++) {
    const b = beacons[i];
    if (Math.hypot(c.x - b.x, c.z - b.z) < 3 && c.h < 3 && c.h >= 0) {
      if (!s.collected.has(i)) {
        s.collected.add(i);
        s.rep += 50;
        toast(s, "ROOFTOP DISCOVERY  +50 REP");
        s.events.push({ type: "beacon" });
      }
      if (
        s.route &&
        !s.route.done &&
        courses[s.route.course].path[s.route.index] === i
      ) {
        const def = courses[s.route.course];
        s.route.index++;
        s.rep += 75;
        s.events.push({ type: "gate" });
        toast(
          s,
          "CHECKPOINT " + s.route.index + " / " + def.path.length + "  +75 REP",
        );
        if (s.route.index === def.path.length) {
          s.route.done = true;
          s.route.success = true;
          const bonus = Math.round(
            150 + def.path.length * 30 + s.route.remaining * 3,
          );
          s.rep += bonus;
          const time = Math.max(0.01, def.seconds - s.route.remaining);
          s.records[s.route.course] = Math.min(
            s.records[s.route.course] || Infinity,
            time,
          );
          s.events.push({ type: "finish" });
          toast(
            s,
            def.name +
              " COMPLETE · " +
              time.toFixed(2) +
              "s  +" +
              bonus +
              " REP",
          );
        }
      }
    }
  }
  if (s.route && !s.route.done) {
    s.route.remaining -= dt;
    s.route.elapsed += dt;
    if (s.route.remaining <= 0) {
      s.route.remaining = 0;
      s.route.done = true;
      toast(s, "TIME UP · TRY A FASTER LINE");
    }
  }
  return s;
}
