import {
  roofs,
  bridges,
  ramps,
  beacons,
  liveries,
  courses,
  createGame,
  tick,
  reset,
  startRoute,
  surface,
  toast,
} from "./engine.js";
const $ = (id) => document.getElementById(id),
  canvas = $("world"),
  ctx = canvas.getContext("2d"),
  keys = new Set();
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("ssc.save.v1") || "{}");
} catch {}
const s = createGame(saved);
let running = false,
  paused = false,
  cam = { x: 8, z: 1 },
  W = innerWidth,
  H = innerHeight,
  scale = 12,
  last = performance.now(),
  uiTime = 0,
  sound = false,
  audio,
  engine,
  volume,
  particles = [],
  skids = [],
  shake = 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const p = (x, z, h = 0) => ({
  x: W * 0.5 + (x - cam.x - z + cam.z) * scale * 0.8,
  y: H * 0.56 + (x - cam.x + z - cam.z) * scale * 0.43 - h * scale,
});
function resize() {
  W = innerWidth;
  H = innerHeight;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * d);
  canvas.height = Math.round(H * d);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(d, 0, 0, d, 0, 0);
  scale = Math.max(6.3, Math.min(14, W / 82, H / 47));
}
addEventListener("resize", resize);
resize();
function poly(points, fill, stroke, width = 1) {
  ctx.beginPath();
  points.forEach((a, i) => (i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
function plane(x, z, w, d, h, color, line) {
  poly(
    [
      p(x - w / 2, z - d / 2, h),
      p(x + w / 2, z - d / 2, h),
      p(x + w / 2, z + d / 2, h),
      p(x - w / 2, z + d / 2, h),
    ],
    color,
    line,
  );
}
function line(a, b, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function box(
  x,
  z,
  w,
  d,
  h,
  top = "#546b75",
  left = "#2c3b4c",
  right = "#354959",
  base = 0,
) {
  const a = p(x - w / 2, z - d / 2, base + h),
    b = p(x + w / 2, z - d / 2, base + h),
    c = p(x + w / 2, z + d / 2, base + h),
    d1 = p(x - w / 2, z + d / 2, base + h),
    a0 = p(x - w / 2, z + d / 2, base),
    b0 = p(x + w / 2, z + d / 2, base),
    c0 = p(x + w / 2, z - d / 2, base);
  poly([b, c, b0, c0], right);
  poly([c, d1, a0, b0], left);
  poly([a, b, c, d1], top);
}
function roof(r, i) {
  box(r.x, r.z, r.w, r.d, 22, r.color, "#243746", "#304453", -22);
  plane(r.x, r.z, r.w - 0.35, r.d - 0.35, 0.025, "rgba(0,0,0,0)", "#8ca0a3");
  for (let x = r.x - r.w / 2 + 3; x < r.x + r.w / 2; x += 4)
    line(
      p(x, r.z + r.d / 2, -3),
      p(x, r.z + r.d / 2, -19),
      "rgba(255,205,163,.13)",
      1,
    );
  for (let z = r.z - r.d / 2 + 3; z < r.z + r.d / 2; z += 4)
    line(
      p(r.x + r.w / 2, z, -3),
      p(r.x + r.w / 2, z, -19),
      "rgba(255,205,163,.12)",
      1,
    );
  for (let x = r.x - r.w / 2 + 4; x < r.x + r.w / 2; x += 6)
    line(
      p(x, r.z - r.d / 2 + 1, 0.04),
      p(x, r.z + r.d / 2 - 1, 0.04),
      "rgba(235,234,219,.07)",
    );
  const at = p(r.x, r.z + 0.5, 0.06);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(-0.49);
  ctx.fillStyle = "rgba(235,234,220,.15)";
  ctx.font = "900 " + Math.max(13, scale * 2.2) + "px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    ["01 / CLUB", "02 / NORTH", "03 / SOUTH", "04 / EAST", "05 / WEST"][i],
    0,
    0,
  );
  ctx.restore();
}
function arrow(x, z, a, color = "#b3f5ce", size = 1, h = 0.06) {
  const f = { x: Math.sin(a), z: -Math.cos(a) },
    r = { x: Math.cos(a), z: Math.sin(a) };
  poly(
    [
      p(x + f.x * size, z + f.z * size, h),
      p(
        x - f.x * size + r.x * 0.8 * size,
        z - f.z * size + r.z * 0.8 * size,
        h,
      ),
      p(x - f.x * 0.5 * size, z - f.z * 0.5 * size, h),
      p(
        x - f.x * size - r.x * 0.8 * size,
        z - f.z * size - r.z * 0.8 * size,
        h,
      ),
    ],
    color,
  );
}
function ramp(r) {
  const f = { x: Math.sin(r.dir), z: -Math.cos(r.dir) },
    rt = { x: Math.cos(r.dir), z: Math.sin(r.dir) },
    len = 6,
    w = 5;
  const point = (d, l, h) =>
    p(r.x + f.x * d + rt.x * l, r.z + f.z * d + rt.z * l, h);
  poly(
    [
      point(-len / 2, -w / 2, 0),
      point(-len / 2, w / 2, 0),
      point(len / 2, w / 2, 1.1),
      point(len / 2, -w / 2, 1.1),
    ],
    "#90d8bb",
    "#e2f7cc",
    1,
  );
  poly(
    [
      point(-len / 2, w / 2, 0),
      point(len / 2, w / 2, 1.1),
      point(len / 2, w / 2, 0),
    ],
    "#3a8d78",
  );
  for (let i = -2; i <= 1; i += 1.3)
    arrow(
      r.x + f.x * i,
      r.z + f.z * i,
      r.dir,
      "#22514f",
      0.8,
      (i + 3) / 6 + 0.04,
    );
}
function decor() {
  for (const [x, z] of [
    [-14, -10],
    [-14, 10],
    [14, 9],
    [-12, -43],
    [11, -43],
    [-12, 44],
    [13, 44],
    [51, -15],
    [51, 15],
    [-51, -15],
    [-51, 15],
  ]) {
    box(x, z, 2.8, 2.8, 0.55, "#c5ac95", "#665c58", "#7a7064");
    const t = p(x, z, 1.4);
    ctx.fillStyle = "#214c4e";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, scale * 1.4, scale * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#47796b";
    ctx.beginPath();
    ctx.ellipse(
      t.x - scale * 0.35,
      t.y - scale * 0.45,
      scale,
      scale * 0.8,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  box(-7, -42, 6, 3, 1.3, "#abc0ba", "#5b7276", "#718a89");
  const dish = p(-7, -42, 3);
  ctx.fillStyle = "#efc7ac";
  ctx.beginPath();
  ctx.ellipse(dish.x, dish.y, scale * 1.8, scale * 0.7, -0.5, 0, Math.PI * 2);
  ctx.fill();
}
function drawBeacon(b, i) {
  const active =
      s.route &&
      !s.route.done &&
      courses[s.route.course].path[s.route.index] === i,
    done = s.collected.has(i);
  const q = p(b.x, b.z, 0.1);
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.scale(1, 0.52);
  ctx.strokeStyle = active ? "#ffe692" : done ? "#678f84" : "#c7e4d6";
  ctx.lineWidth = active ? 3 : 1.5;
  ctx.setLineDash(done ? [3, 4] : []);
  ctx.beginPath();
  ctx.arc(0, 0, scale * 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const h = 2.4 + Math.sin(s.time * 2 + i) * 0.25,
    at = p(b.x, b.z, h);
  if (active) {
    const grad = ctx.createLinearGradient(q.x, q.y, at.x, at.y - 30);
    grad.addColorStop(0, "rgba(255,227,145,.04)");
    grad.addColorStop(1, "rgba(255,227,145,.3)");
    poly(
      [
        p(b.x - 1.5, b.z, 0),
        p(b.x + 1.5, b.z, 0),
        p(b.x + 1.5, b.z, 7),
        p(b.x - 1.5, b.z, 7),
      ],
      grad,
    );
  }
  ctx.fillStyle = active ? "#ffe399" : done ? "#78958b" : "#b9f8d5";
  ctx.beginPath();
  ctx.moveTo(at.x, at.y - 9);
  ctx.lineTo(at.x + 7, at.y);
  ctx.lineTo(at.x, at.y + 9);
  ctx.lineTo(at.x - 7, at.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#203c47";
  ctx.textAlign = "center";
  ctx.font = "bold 9px Arial";
  ctx.fillText(i + 1, at.x, at.y + 3);
}
function car() {
  const c = s.car,
    col = liveries[s.livery].color;
  const trans = (x, z, h) =>
    p(
      c.x + 1.35 * (x * Math.cos(c.a) - z * Math.sin(c.a)),
      c.z + 1.35 * (x * Math.sin(c.a) + z * Math.cos(c.a)),
      c.h + h * 1.35,
    );
  const sh = p(c.x, c.z, 0);
  ctx.save();
  ctx.translate(sh.x, sh.y);
  ctx.scale(1, 0.5);
  ctx.fillStyle = "rgba(15,28,38," + (c.air ? 0.17 : 0.4) + ")";
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    scale * (1.7 + c.h * 0.03),
    scale * (1.6 + c.h * 0.03),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
  for (const x of [-0.82, 0.82])
    for (const z of [-0.85, 0.85])
      poly(
        [
          trans(x - 0.18, z - 0.35, 0.1),
          trans(x + 0.18, z - 0.35, 0.1),
          trans(x + 0.18, z + 0.35, 0.1),
          trans(x - 0.18, z + 0.35, 0.1),
        ],
        "#172a35",
      );
  const pts = [
    [-0.72, -1.35],
    [0.72, -1.35],
    [0.72, 1.3],
    [-0.72, 1.3],
  ];
  poly(
    pts.map((q) => trans(...q, 0.25)),
    "#316f65",
    "#1b393c",
  );
  poly(
    pts.map((q) => trans(...q, 0.65)),
    col,
    "#f7f1d2",
    1,
  );
  poly(
    [
      trans(-0.61, -0.52, 0.68),
      trans(0.61, -0.52, 0.68),
      trans(0.55, 0.65, 0.68),
      trans(-0.55, 0.65, 0.68),
    ],
    "#294651",
  );
  poly(
    [
      trans(-0.5, -0.2, 0.85),
      trans(0.5, -0.2, 0.85),
      trans(0.5, 0.45, 0.85),
      trans(-0.5, 0.45, 0.85),
    ],
    col,
  );
  line(trans(-0.25, -1.3, 0.69), trans(-0.25, -0.55, 0.69), "#fcf7d3", 3);
  line(trans(0.25, -1.3, 0.69), trans(0.25, -0.55, 0.69), "#fcf7d3", 3);
  for (const x of [-0.5, 0.5]) {
    line(
      trans(x - 0.13, -1.37, 0.55),
      trans(x + 0.13, -1.37, 0.55),
      "#fff5cc",
      3,
    );
    line(
      trans(x - 0.13, 1.32, 0.55),
      trans(x + 0.13, 1.32, 0.55),
      "#fd9e84",
      3,
    );
  }
  if (keys.has("shift") && keys.has("w") && s.boost > 0.02 && !c.air) {
    const a = trans(0, 1.8, 0.3);
    ctx.fillStyle = "#ffe39c";
    ctx.beginPath();
    ctx.ellipse(
      a.x,
      a.y,
      scale * 0.45,
      scale * (0.3 + Math.random() * 0.25),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
function background() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#8498a5");
  g.addColorStop(0.38, "#e4aaa0");
  g.addColorStop(0.7, "#d5a397");
  g.addColorStop(1, "#697780");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const sx = W * 0.72,
    sy = H * 0.26;
  const halo = ctx.createRadialGradient(sx, sy, 20, sx, sy, H * 0.34);
  halo.addColorStop(0, "rgba(255,225,174,.55)");
  halo.addColorStop(1, "rgba(255,225,174,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffe0b1";
  ctx.beginPath();
  ctx.arc(sx, sy, H * 0.084, 0, Math.PI * 2);
  ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = ["#9d9294", "#82868d", "#627582"][layer];
    for (let i = 0; i < 28; i++) {
      const wi = 30 + ((i * 29) % 71),
        x = ((i * 83 - cam.x * layer * 0.8) % (W + 150)) - 80,
        h = 30 + ((i * 43 + layer * 59) % 130),
        y = H * (0.6 + layer * 0.13);
      ctx.fillRect(x, y - h, wi, h + H * 0.4);
      if (i % 4 === 0) ctx.fillRect(x + wi * 0.4, y - h - 24, wi * 0.1, 24);
    }
  }
}
function miniMap() {
  const size = H < 450 ? 72 : W < 650 ? 104 : 136,
    x = W - size - 18,
    y = H - size - 76;
  ctx.fillStyle = "rgba(25,47,57,.72)";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "rgba(218,235,220,.24)";
  ctx.strokeRect(x, y, size, size);
  const f = size / 122,
    q = (xx, zz) => ({ x: x + size / 2 + xx * f, y: y + size / 2 + zz * f });
  for (const r of [...roofs, ...bridges]) {
    ctx.fillStyle = "#67877f";
    ctx.fillRect(
      q(r.x - r.w / 2, r.z - r.d / 2).x,
      q(r.x - r.w / 2, r.z - r.d / 2).y,
      r.w * f,
      r.d * f,
    );
  }
  beacons.forEach((b, i) => {
    ctx.fillStyle =
      s.route &&
      !s.route.done &&
      courses[s.route.course].path[s.route.index] === i
        ? "#ffe38f"
        : "#bdd7b9";
    ctx.beginPath();
    ctx.arc(
      q(b.x, b.z).x,
      q(b.x, b.z).y,
      s.route &&
        !s.route.done &&
        courses[s.route.course].path[s.route.index] === i
        ? 4
        : 2,
      0,
      7,
    );
    ctx.fill();
  });
  const c = q(s.car.x, s.car.z);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(s.car.a);
  poly(
    [
      { x: 0, y: -6 },
      { x: 4, y: 4 },
      { x: 0, y: 2 },
      { x: -4, y: 4 },
    ],
    "#fff3dd",
  );
  ctx.restore();
  ctx.fillStyle = "#e4edda";
  ctx.font = "9px Arial";
  ctx.textAlign = "left";
  ctx.fillText("THE FIVE ROOFTOPS", x + 6, y + size + 13);
}
function render(dt) {
  background();
  ctx.save();
  if (shake > 0 && !reduced) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.88;
  }
  for (const r of [...roofs].sort((a, b) => a.x + a.z - b.x - b.z))
    roof(r, roofs.indexOf(r));
  for (const b of bridges) {
    plane(b.x, b.z, b.w, b.d, 0.1, "#b6a995", "#e2cfac");
    for (let i = -2; i <= 2; i++)
      line(
        p(b.x - b.w / 2, b.z + (b.d * i) / 5, 0.13),
        p(b.x + b.w / 2, b.z + (b.d * i) / 5, 0.13),
        "#777b75",
        1,
      );
  }
  for (const r of ramps) ramp(r);
  for (let z = 4; z > -8; z -= 3) arrow(9, z, 0, "rgba(195,251,214,.68)", 0.85);
  decor();
  for (const v of skids) {
    line(p(v.x, v.z, 0.05), p(v.x2, v.z2, 0.05), "rgba(21,38,47,.25)", 2);
  }
  beacons.forEach(drawBeacon);
  car();
  particles = particles.filter((a) => a.life > 0);
  for (const a of particles) {
    a.life -= dt;
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    a.h += a.vh * dt;
    a.vh -= 12 * dt;
    const q = p(a.x, a.z, Math.max(0.1, a.h));
    ctx.globalAlpha = Math.max(0, a.life);
    ctx.fillStyle = a.col;
    ctx.fillRect(q.x, q.y, 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  miniMap();
}
function save() {
  try {
    localStorage.setItem(
      "ssc.save.v1",
      JSON.stringify({
        rep: s.rep,
        best: s.best,
        landings: s.landings,
        livery: s.livery,
        records: s.records,
        collected: [...s.collected],
      }),
    );
  } catch {}
}
function chime(type) {
  if (!sound || !audio) return;
  const o = audio.createOscillator(),
    g = audio.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(type === "jump" ? 260 : 520, audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(
    type === "jump" ? 580 : 1040,
    audio.currentTime + 0.18,
  );
  g.gain.setValueAtTime(0.055, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
  o.connect(g);
  g.connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + 0.35);
}
function events() {
  for (const e of s.events) {
    if (e.type === "land") {
      shake = 5;
      for (let i = 0; i < 20; i++)
        particles.push({
          x: s.car.x,
          z: s.car.z,
          h: 0.2,
          vx: (Math.random() - 0.5) * 8,
          vz: (Math.random() - 0.5) * 8,
          vh: Math.random() * 4,
          life: 0.5 + Math.random() * 0.5,
          col: i % 2 ? "#fff0cb" : "#b9f8cf",
        });
    }
    if (e.type !== "reset") chime(e.type);
    save();
  }
  s.events = [];
}
function ui() {
  $("rep").textContent = s.rep.toLocaleString();
  $("best").textContent = s.best.toLocaleString();
  $("landings").textContent = s.landings;
  $("speed").textContent = Math.round(Math.abs(s.car.speed) * 5);
  $("boostFill").style.width = s.boost * 100 + "%";
  $("location").textContent = s.car.air
    ? "AIR TIME / " + s.car.airTime.toFixed(1) + "s"
    : surface(s.car.x, s.car.z)?.name || "OVER THE EDGE";
  $("toast").textContent = s.toastTime > 0 ? s.toast : "";
  $("combo").textContent =
    s.combo > 1
      ? "×" + Math.min(s.combo, 5) + " COMBO · " + s.comboTime.toFixed(1) + "s"
      : "";
  const pick = +$("course").value,
    def = courses[pick];
  $("record").textContent =
    "PERSONAL BEST " +
    (s.records[pick] ? s.records[pick].toFixed(2) + "s" : "—");
  $("challenge").textContent =
    (s.route?.course === pick ? "RETRY " : "START ") + def.name;
  if (s.route) {
    const active = courses[s.route.course];
    $("routeLabel").textContent = s.route.done
      ? "RUN ENDED / FREE ROAM"
      : active.name + " / " + Math.ceil(s.route.remaining) + "s";
    $("objective").textContent = s.route.done
      ? s.route.success
        ? "COURSE COMPLETE"
        : "One more run?"
      : "CHECKPOINT " + (s.route.index + 1) + " OF " + active.path.length;
    $("routeInfo").textContent = s.route.done
      ? "Pick a course or keep exploring."
      : "Follow the gold beacon. Bridges are the safe line.";
  } else {
    $("routeInfo").textContent = def.description;
  }
}
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 1),
    dt = Math.min(elapsed, 0.04);
  last = now;
  if (running && !paused) {
    const old = { x: s.car.x, z: s.car.z };
    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      tick(s, keys, step);
      remaining -= step;
    }
    if (keys.has(" ") && Math.abs(s.car.speed) > 6 && !s.car.air) {
      skids.push({ x: old.x, z: old.z, x2: s.car.x, z2: s.car.z });
      if (skids.length > 130) skids.shift();
    }
    events();
  }
  const targetX =
      s.car.x + Math.sin(s.car.a) * Math.min(Math.abs(s.car.speed) * 0.14, 2),
    targetZ =
      s.car.z - Math.cos(s.car.a) * Math.min(Math.abs(s.car.speed) * 0.14, 2);
  cam.x += (targetX - cam.x) * (1 - Math.exp(-dt * 4));
  cam.z += (targetZ - cam.z) * (1 - Math.exp(-dt * 4));
  if (engine && volume) {
    engine.frequency.setTargetAtTime(
      45 + Math.abs(s.car.speed) * 5,
      audio.currentTime,
      0.1,
    );
    volume.gain.setTargetAtTime(
      sound && running && !paused ? 0.014 : 0,
      audio.currentTime,
      0.1,
    );
  }
  render(dt);
  uiTime += dt;
  if (uiTime > 0.1) {
    ui();
    uiTime = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function setPause(value) {
  paused = value;
  keys.clear();
  $("pause").textContent = paused ? "RESUME" : "PAUSE";
  if (paused) toast(s, "PAUSED · PRESS P OR RESUME");
  else toast(s, "BACK IN THE DRIVER’S SEAT");
  ui();
}
$("start").onclick = () => {
  running = true;
  $("menu").hidden = true;
  canvas.focus();
  toast(s, "HOLD W / ↑ · FOLLOW THE MINT ARROWS");
};
$("start").disabled = false;
$("pause").onclick = () => {
  if (running) setPause(!paused);
};
$("challenge").onclick = () => {
  running = true;
  paused = false;
  $("pause").textContent = "PAUSE";
  $("menu").hidden = true;
  startRoute(s, +$("course").value);
  canvas.focus();
};
function garage() {
  setPause(true);
  $("garagePanel").hidden = false;
  $("cars").replaceChildren(
    ...liveries.map((v, i) => {
      const b = document.createElement("button");
      b.className = "car-option" + (s.livery === i ? " selected" : "");
      b.style.setProperty("--car", v.color);
      b.innerHTML =
        '<span class="car-swatch">◆</span><b>' +
        v.name +
        "</b><small>" +
        (s.rep >= v.cost
          ? s.livery === i
            ? "EQUIPPED"
            : "EQUIP LIVERY"
          : v.cost.toLocaleString() + " REP TO UNLOCK") +
        "</small>";
      b.disabled = s.rep < v.cost;
      b.onclick = () => {
        s.livery = i;
        save();
        garage();
      };
      return b;
    }),
  );
}
$("garage").onclick = garage;
$("mobileGarage").onclick = garage;
$("recover").onclick = () => {
  if (running && !paused) reset(s);
  canvas.focus();
};
$("course").onchange = ui;
$("garageClose").onclick = () => {
  $("garagePanel").hidden = true;
  setPause(false);
  canvas.focus();
};
$("sound").onclick = () => {
  sound = !sound;
  if (sound && !audio) {
    audio = new AudioContext();
    engine = audio.createOscillator();
    volume = audio.createGain();
    engine.type = "triangle";
    volume.gain.value = 0;
    engine.connect(volume);
    volume.connect(audio.destination);
    engine.start();
  }
  if (audio) audio.resume();
  $("sound").textContent = sound ? "FX ON" : "FX OFF";
};
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!$("garagePanel").hidden) {
    if (k === "escape") $("garageClose").click();
    if (
      [
        "p",
        "r",
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        " ",
        "shift",
      ].includes(k)
    )
      e.preventDefault();
    return;
  }
  if (
    [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      " ",
      "shift",
      "r",
      "p",
    ].includes(k)
  ) {
    if (e.target instanceof HTMLButtonElement && [" ", "enter"].includes(k))
      return;
    e.preventDefault();
    if (k === "p" && !e.repeat && running) setPause(!paused);
    if (k === "r" && !e.repeat && running && !paused) reset(s);
    if (!paused && running) keys.add(k);
  }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => {
  keys.clear();
  document.querySelectorAll(".held").forEach((b) => b.classList.remove("held"));
});
document.addEventListener("visibilitychange", () => {
  keys.clear();
  if (document.hidden && running) setPause(true);
});
for (const b of document.querySelectorAll("[data-key]")) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    if (running && !paused) {
      keys.add(b.dataset.key);
      b.classList.add("held");
    }
  };
  const release = () => {
    keys.delete(b.dataset.key);
    b.classList.remove("held");
  };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
}
