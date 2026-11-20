import {
  WORLD,
  GRID_X,
  GRID_Y,
  BLOCKS,
  DEPOT,
  HANDOVERS,
  JOBS,
  VEHICLES,
  makeState,
  acceptJob,
  target,
  canInteract,
  interact,
  step,
  recover,
  upgrade,
  route,
  clamp,
  dist,
} from "./engine.js";
const $ = (id) => document.getElementById(id),
  canvas = $("city"),
  ctx = canvas.getContext("2d", { alpha: false }),
  keys = new Set(),
  held = new Set();
const SAVE = "playpile.neon-repo.career.v1";
let saved = {},
  saveOK = true;
try {
  saved = JSON.parse(localStorage.getItem(SAVE) || "{}");
} catch {
  saveOK = false;
}
const s = makeState(saved);
let w = innerWidth,
  h = innerHeight,
  dpr = 1,
  cam = { x: DEPOT.x + 300, y: DEPOT.y - 150 },
  zoom = 1,
  now = 0,
  last = 0,
  sound = true,
  ac,
  engineTone,
  engineGain,
  previousCollision = 0,
  previousMode = "board",
  idleFor = 0;
const coarse = matchMedia("(pointer:coarse)").matches,
  reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
function resize() {
  w = innerWidth;
  h = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  zoom = w < 720 ? 0.73 : Math.min(1.02, w / 1350 + 0.12);
}
addEventListener("resize", resize);
resize();
function save() {
  try {
    localStorage.setItem(SAVE, JSON.stringify(s.career));
    saveOK = true;
  } catch {
    saveOK = false;
  }
  $("savenote").textContent = saveOK
    ? "Your career saves on this device. No account needed."
    : "Storage is unavailable. Your career lasts until this tab closes.";
}
function audio() {
  if (!sound) return;
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    ac.resume();
    if (!engineTone) {
      engineTone = ac.createOscillator();
      engineGain = ac.createGain();
      engineTone.type = "sawtooth";
      engineGain.gain.value = 0;
      engineTone.connect(engineGain).connect(ac.destination);
      engineTone.start();
    }
  } catch {}
}
function tone(freq = 440, len = 0.12) {
  audio();
  if (!ac || !sound) return;
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 0.65, ac.currentTime + len);
  g.gain.setValueAtTime(0.055, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + len);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + len);
}
function notify(text, ttl = 3) {
  s.toast = { text, ttl };
}
function renderBoard() {
  const rank = [
    "ROOKIE OPERATOR",
    "TRUSTED DRIVER",
    "NIGHT SPECIALIST",
    "CITY FIXER",
    "ASHPORT LEGEND",
  ][Math.min(4, Math.floor(s.career.jobs / 5))];
  $("rank").textContent = rank;
  $("cash").textContent = "$" + s.career.cash.toLocaleString();
  $("careerline").textContent =
    `${s.career.jobs} RECOVERIES · ${s.career.rep} REP`;
  const start = s.career.jobs % JOBS.length;
  $("jobs").innerHTML = [0, 1, 2]
    .map((n) => {
      const i = (start + n) % JOBS.length,
        j = JOBS[i],
        v = VEHICLES[j.vehicle];
      const dropIndex =
          s.career.jobs < 3
            ? 0
            : Math.floor(s.career.jobs / 3) % HANDOVERS.length,
        record = s.career.records[i + ":" + dropIndex];
      return `<button class="job" data-job="${i}"><div class="art"><span class="district">${j.district}</span><div class="mini-car" style="--car:${v.color}"></div></div><div class="details"><h4>${j.name}</h4><p>${v.name}<br>${j.vehicle === "atlas" ? "HEAVY / STEADY" : j.vehicle === "comet" ? "FAST / PRECISE" : j.vehicle === "thunder" ? "POWERFUL / LOOSE" : "LIGHT / AGILE"}</p><div class="bottom"><span>$${j.pay + Math.floor(s.career.jobs / 6) * 60} + BONUSES</span><span>TAKE JOB ↗</span></div><small class="record">TO ${HANDOVERS[dropIndex].name.toUpperCase()}<br>${record ? "BEST " + Math.round(record.bestTime) + "s · " + record.bestCondition + "% CONDITION" : "SET YOUR FIRST CLEAN RUN"}</small></div></button>`;
    })
    .join("");
  for (const b of $("jobs").querySelectorAll("button"))
    b.onclick = () => begin(+b.dataset.job);
  save();
}
function begin(index) {
  audio();
  tone(510);
  acceptJob(s, index);
  showMode();
  notify("Dispatch: " + s.job.brief, 5);
  cam.x = s.car.x;
  cam.y = s.car.y;
  previousCollision = 0;
  idleFor = 0;
}
function showMode() {
  $("board").hidden = s.mode !== "board";
  $("hud").hidden = !["play", "pause"].includes(s.mode);
  $("result").hidden = s.mode !== "result";
  $("pausepanel").hidden = s.mode !== "pause";
  $("garagepanel").hidden = s.mode !== "garage";
  $("touch").hidden = !((coarse || w < 900 || h < 500) && s.mode === "play");
  $("pause").textContent = s.mode === "pause" ? "▶" : "Ⅱ";
  if (s.mode === "board") renderBoard();
  if (s.mode === "result") {
    const r = s.completed;
    $("receipt").innerHTML =
      `<div class="receipt-line"><span>${r.name}</span><span>${r.time}s</span></div><div class="receipt-line"><span>Vehicle condition</span><span>${r.condition}%</span></div><div class="receipt-line"><span>On-time bonus</span><span>$${r.timeBonus}</span></div><div class="receipt-line"><span>Clean return bonus</span><span>$${r.cleanBonus}</span></div><div class="receipt-line"><span>Destination</span><span>${s.job.drop.name}</span></div><div class="receipt-line"><span>${r.personalBest ? "NEW PERSONAL BEST" : "PERSONAL RECORD"}</span><span>${Math.round(s.career.records[s.job.recordKey].bestTime)}s</span></div><div class="receipt-line"><span>Reputation earned</span><span>+${r.rep} REP</span></div><div class="receipt-line total"><span>YOUR CUT</span><span>$${r.pay}</span></div>`;
    save();
  }
  if (s.mode === "garage") renderGarage();
  keys.clear();
  held.clear();
  document
    .querySelectorAll("#touch .held")
    .forEach((b) => b.classList.remove("held"));
}
function renderGarage() {
  const items = [
    ["tires", "GRIP KIT", "Sharper steering. Less sideways drama."],
    ["armor", "BODYWORK", "Reduce collision damage. Keep more of your fee."],
    ["boost", "NITRO SERVICE", "Longer boost and faster recharge."],
  ];
  $("upgrades").innerHTML = items
    .map(([key, name, desc]) => {
      const level = s.career.upgrades[key],
        cost = (level + 1) * 650;
      return `<div class="upgrade"><div><strong>${name} <span style="color:#67f0cf">${"▰".repeat(level)}${"▱".repeat(3 - level)}</span></strong><small>${desc}</small></div><button data-upgrade="${key}" ${level >= 3 || s.career.cash < cost ? "disabled" : ""}>${level >= 3 ? "MAXED" : "$" + cost}</button></div>`;
    })
    .join("");
  for (const b of $("upgrades").querySelectorAll("button"))
    b.onclick = () => {
      if (upgrade(s, b.dataset.upgrade)) {
        save();
        tone(710);
        renderGarage();
      }
    };
}
function action() {
  const result = interact(s);
  if (result === "collected") {
    tone(640, 0.2);
    notify(
      "Keys secured. " +
        VEHICLES[s.car.kind].name +
        " — return to " +
        s.job.drop.name +
        ".",
      4,
    );
  }
  if (result === "delivered") {
    tone(880, 0.35);
    showMode();
  }
}
function pause() {
  if (s.mode === "play") {
    s.mode = "pause";
    showMode();
  } else if (s.mode === "pause") {
    s.mode = "play";
    showMode();
  }
}
$("pause").onclick = pause;
$("resume").onclick = pause;
$("next").onclick = () => {
  s.mode = "board";
  showMode();
};
$("abandon").onclick = () => {
  s.mode = "board";
  showMode();
};
$("garage").onclick = () => {
  s.mode = "garage";
  showMode();
};
$("closegarage").onclick = () => {
  s.mode = "board";
  showMode();
};
$("interaction").onclick = action;
$("brand").onclick = (e) => {
  e.preventDefault();
  if (s.mode === "play") pause();
};
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = sound ? "FX ON" : "FX OFF";
  if (sound) audio();
  if (engineGain) engineGain.gain.value = 0;
};
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key))
    e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyE") action();
  if (e.code === "Escape" || e.code === "KeyP") pause();
  if (e.code === "KeyR" && s.mode === "play") {
    recover(s);
    notify("Back on the street. Bodywork −5%", 2);
  }
  if (e.code === "KeyM") $("sound").click();
  if (
    e.code === "Enter" &&
    s.mode === "board" &&
    !["BUTTON", "A"].includes(e.target.tagName)
  )
    begin(s.career.jobs % JOBS.length);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  held.clear();
  if (s.mode === "play") pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && s.mode === "play") pause();
});
for (const b of document.querySelectorAll("[data-key]")) {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    held.add(b.dataset.key);
    b.classList.add("held");
    audio();
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(name, () => {
      held.delete(b.dataset.key);
      b.classList.remove("held");
    });
}
function input() {
  let throttle =
      (keys.has("KeyW") || keys.has("ArrowUp") || held.has("forward") ? 1 : 0) -
      (keys.has("KeyS") || keys.has("ArrowDown") || held.has("reverse")
        ? 1
        : 0),
    steer =
      (keys.has("KeyD") || keys.has("ArrowRight") || held.has("right")
        ? 1
        : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") || held.has("left") ? 1 : 0),
    brake = keys.has("Space") || held.has("brake"),
    boost =
      keys.has("ShiftLeft") || keys.has("ShiftRight") || held.has("boost");
  try {
    const p = Array.from(navigator.getGamepads?.() || []).find(
      (p) => p?.connected,
    );
    if (p) {
      steer = steer || (Math.abs(p.axes[0]) > 0.15 ? p.axes[0] : 0);
      throttle =
        throttle || (p.buttons[7]?.value || 0) - (p.buttons[6]?.value || 0);
      brake ||= p.buttons[0]?.pressed;
      boost ||= p.buttons[1]?.pressed;
    }
  } catch {}
  return { throttle, steer, brake, boost };
}
function updateHUD() {
  $("touch").hidden = !((coarse || w < 900 || h < 500) && s.mode === "play");
  if (!s.job) return;
  const t = target(s),
    r = route(s);
  let d = 0;
  for (let i = 1; i < r.length; i++) d += dist(r[i - 1], r[i]);
  $("stage").textContent =
    s.stage === "pickup" ? "01 / FIND THE VEHICLE" : "02 / BRING IT HOME";
  $("mission").textContent = s.job.name;
  $("objective").textContent =
    s.stage === "pickup"
      ? `Collect the ${VEHICLES[s.job.vehicle].name}. Stop nearby and press E.`
      : "Return to " + s.job.drop.name + ". Slow down, then press E.";
  $("distance").textContent = `${Math.round(d / 10) * 10}m VIA GPS`;
  $("clock").textContent =
    s.clock > 0
      ? `${Math.ceil(s.clock)}s BONUS WINDOW`
      : "OVERTIME · KEEP DRIVING";
  $("clock").style.color = s.clock < 20 ? "#ffbc78" : "#67f0cf";
  $("condition").textContent = Math.round(s.car.health) + "%";
  $("healthbar").style.width = s.car.health + "%";
  $("boostbar").style.width = s.car.boost + "%";
  $("speed").textContent = String(
    Math.round(Math.abs(s.car.speed) * 0.35),
  ).padStart(3, "0");
  $("carname").textContent = VEHICLES[s.car.kind].name;
  const near = dist(s.car, t) < 110;
  $("interaction").hidden = !(s.mode === "play" && near);
  $("interaction").textContent =
    Math.abs(s.car.speed) > 80
      ? "SLOW DOWN TO HAND OVER"
      : s.stage === "pickup"
        ? "E / COLLECT VEHICLE"
        : "E / COMPLETE RECOVERY";
  $("interaction").disabled = !canInteract(s);
}
function rr(x, y, width, height, r = 4) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}
function road() {
  ctx.fillStyle = "#10272d";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.fillStyle = "#263c43";
  for (const x of GRID_X) ctx.fillRect(x - 93, 0, 186, WORLD.h);
  for (const y of GRID_Y) ctx.fillRect(0, y - 93, WORLD.w, 186);
  ctx.fillStyle = "#172c35";
  for (const x of GRID_X) ctx.fillRect(x - 77, 0, 154, WORLD.h);
  for (const y of GRID_Y) ctx.fillRect(0, y - 77, WORLD.w, 154);
  ctx.strokeStyle = "#9b936b40";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 24]);
  for (const x of GRID_X) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (const y of GRID_Y) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const x of GRID_X)
    for (const y of GRID_Y) {
      ctx.fillStyle = "#172c35";
      ctx.fillRect(x - 77, y - 77, 154, 154);
      ctx.fillStyle = "#b1c7be38";
      for (let n = -3; n <= 3; n++) {
        ctx.fillRect(x - 60 + n * 17, y - 98, 9, 28);
        ctx.fillRect(x - 60 + n * 17, y + 80, 9, 28);
        ctx.fillRect(x - 98, y - 60 + n * 17, 28, 9);
        ctx.fillRect(x + 80, y - 60 + n * 17, 28, 9);
      }
      ctx.fillStyle = Math.floor(now / 5 + x + y) % 2 ? "#70e3ac" : "#ff9c68";
      for (const [dx, dy] of [
        [-87, -87],
        [87, 87],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  for (const b of BLOCKS) {
    if (
      b.x + b.w < cam.x - w / (2 * zoom) - 120 ||
      b.x > cam.x + w / (2 * zoom) + 120 ||
      b.y + b.h < cam.y - h / (2 * zoom) - 120 ||
      b.y > cam.y + h / (2 * zoom) + 120
    )
      continue;
    ctx.fillStyle = "#2d4547";
    ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.fillStyle = "#0b172163";
    ctx.fillRect(b.x + 20, b.y + 24, b.w + 22, b.h + 18);
    const roof = ["#1c4146", "#273547", "#2c3944", "#173b3e"][b.district];
    ctx.fillStyle = "#10232f";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = roof;
    ctx.fillRect(b.x - b.height * 0.28, b.y - b.height * 0.4, b.w, b.h);
    ctx.strokeStyle = ["#4b808044", "#636d9b44", "#916f5544", "#4a876a44"][
      b.district
    ];
    ctx.lineWidth = 2;
    ctx.strokeRect(
      b.x - b.height * 0.28 + 4,
      b.y - b.height * 0.4 + 4,
      b.w - 8,
      b.h - 8,
    );
    const bx = b.x - b.height * 0.28,
      by = b.y - b.height * 0.4;
    ctx.fillStyle = "#112932";
    for (let k = 0; k < 4; k++)
      ctx.fillRect(bx + 35 + k * 70, by + 40 + (k % 2) * 80, 39, 24);
    ctx.fillStyle = "#9db2a924";
    for (let row = 0; row < 3; row++)
      for (let n = 0; n < 10; n++) {
        if ((n * 7 + row * 3 + b.seed) % 4 === 0) continue;
        ctx.fillRect(b.x + 12 + n * 31, b.y + b.h - 4 + row * 6, 15, 3);
      }
    if (b.seed % 3 === 0) {
      ctx.fillStyle = "#385850";
      ctx.fillRect(bx + 58, by + 70, 125, 180);
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = k % 2 ? "#3e7668" : "#2b5d55";
        ctx.beginPath();
        ctx.arc(bx + 78 + (k % 2) * 72, by + 94 + k * 30, 21, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const signs = [
      "NOON / NOODLES",
      "NIGHT MARKET",
      "ASTRA / CINEMA",
      "LOWLINE HOTEL",
      "ORION MOTORS",
      "24H / LAUNDRY",
      "B-SIDE RECORDS",
      "ASHPORT FM",
    ];
    if (b.seed % 2 === 0) {
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h + 10);
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = b.district % 2 ? "#ff9d97" : "#70eccf";
      ctx.shadowBlur = 8;
      ctx.fillStyle = b.district % 2 ? "#efa291" : "#73d5bf";
      ctx.fillText(signs[b.seed % signs.length], 0, 0);
      ctx.restore();
    }
    for (let n = 0; n < 5; n++) {
      const walk = (now * 10 + n * 57 + b.seed * 9) % (b.w - 10);
      ctx.fillStyle = ["#cfaa8a", "#b7c9c2", "#627dad", "#c58798"][n % 4];
      ctx.beginPath();
      ctx.arc(b.x + walk, b.y - 20 + (n % 2) * 4, 3.3, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#06151c";
      ctx.fillRect(b.x + walk - 1, b.y - 17 + (n % 2) * 4, 2, 4);
    }
  }
  ctx.save();
  ctx.fillStyle = "#8cb4b318";
  ctx.font = "900 44px Arial";
  ctx.textAlign = "center";
  for (const [label, x, y] of [
    ["LOWLINE", 1000, 1080],
    ["GLASS QUARTER", 1910, 310],
    ["EAST MARKET", 2700, 1630],
    ["SOUTH GARDENS", 1070, 2170],
  ])
    ctx.fillText(label, x, y);
  ctx.restore();
}
function glow(x, y, color, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function car(c, player = false, parked = false) {
  const kind = c.kind || "scout",
    v = VEHICLES[kind],
    len = kind === "atlas" ? 56 : 43,
    width = kind === "atlas" ? 27 : 23;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle || 0);
  if (!parked) {
    ctx.fillStyle = "#f7eadf08";
    ctx.beginPath();
    ctx.moveTo(len / 2, -8);
    ctx.lineTo(len / 2 + 120, -44);
    ctx.lineTo(len / 2 + 120, 44);
    ctx.lineTo(len / 2, 8);
    ctx.fill();
  }
  ctx.fillStyle = "#0007";
  rr(-len / 2 + 5, -width / 2 + 6, len, width, 7);
  ctx.fill();
  ctx.fillStyle = "#050d13";
  for (const x of [-len * 0.28, len * 0.27])
    for (const y of [-width / 2 - 1, width / 2 - 3])
      ctx.fillRect(x - 5, y, 11, 5);
  ctx.fillStyle = c.color || v.color;
  rr(-len / 2, -width / 2, len, width, 6);
  ctx.fill();
  ctx.fillStyle = "#d6efe62b";
  rr(-len / 2 + 3, -width / 2 + 2, len - 6, 3, 1);
  ctx.fill();
  ctx.fillStyle = "#103a4c";
  rr(-len / 2 + 12, -width / 2 + 3, 17, width - 6, 3);
  ctx.fill();
  ctx.fillStyle = "#6fa0b655";
  ctx.fillRect(4, -width / 2 + 4, 4, width - 8);
  ctx.fillStyle = kind === "atlas" ? "#e6e9df4a" : "#0002";
  ctx.fillRect(-len / 2 + 3, -width / 2 + 5, 8, width - 10);
  ctx.fillStyle = "#eaffde";
  ctx.fillRect(len / 2 - 2, -width / 2 + 3, 3, 5);
  ctx.fillRect(len / 2 - 2, width / 2 - 8, 3, 5);
  ctx.fillStyle = "#ff725d";
  ctx.fillRect(-len / 2 - 1, -width / 2 + 3, 3, 5);
  ctx.fillRect(-len / 2 - 1, width / 2 - 8, 3, 5);
  if (player) {
    ctx.strokeStyle = "#ffffff50";
    ctx.lineWidth = 1;
    rr(-len / 2 - 2, -width / 2 - 2, len + 4, width + 4, 7);
    ctx.stroke();
    if (input().boost && s.mode === "play" && c.boost > 0 && c.speed > 60) {
      ctx.fillStyle = "#7ef5d9bb";
      ctx.beginPath();
      ctx.moveTo(-len / 2, -5);
      ctx.lineTo(-len / 2 - 19 - Math.random() * 12, 0);
      ctx.lineTo(-len / 2, 5);
      ctx.fill();
    }
  }
  ctx.restore();
}
function drawTarget() {
  if (!s.job) return;
  const t = target(s),
    pickup = s.stage === "pickup",
    color = pickup ? "#ffbc78" : "#67f0cf";
  glow(t.x, t.y, pickup ? "#ffbc7820" : "#67f0cf20", 150);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 9]);
  ctx.beginPath();
  ctx.arc(t.x, t.y, 63 + (reduced ? 0 : Math.sin(now * 3) * 4), 0, 7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = color;
  ctx.fillText(pickup ? "RECOVERY VEHICLE" : "HANDOVER BAY", t.x, t.y - 82);
  ctx.restore();
  if (pickup)
    car(
      { x: t.x, y: t.y, kind: s.job.vehicle, angle: Math.PI / 2 },
      false,
      true,
    );
}
function drawGPS() {
  if (!s.job || !["play", "pause"].includes(s.mode)) return;
  const points = route(s);
  ctx.strokeStyle = s.stage === "pickup" ? "#ffbc7866" : "#67f0cf66";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([18, 13]);
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
}
function minimap() {
  if (!["play", "pause"].includes(s.mode)) return;
  const small = w < 720,
    mw = small ? 128 : 200,
    mh = (mw * WORLD.h) / WORLD.w,
    mx = small ? 16 : 28,
    my = h - (coarse || w < 900 || h < 570 ? 145 : 39) - mh,
    sc = mw / WORLD.w;
  ctx.save();
  ctx.translate(mx, my);
  ctx.fillStyle = "#071923e8";
  rr(-5, -5, mw + 10, mh + 10, 4);
  ctx.fill();
  ctx.strokeStyle = "#45626c";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.scale(sc, sc);
  ctx.strokeStyle = "#42606a";
  ctx.lineWidth = 24;
  for (const x of GRID_X) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (const y of GRID_Y) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }
  const points = route(s);
  ctx.strokeStyle = s.stage === "pickup" ? "#ffbc78" : "#67f0cf";
  ctx.lineWidth = 36;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  const t = target(s);
  ctx.fillStyle = s.stage === "pickup" ? "#ffbc78" : "#67f0cf";
  ctx.beginPath();
  ctx.arc(t.x, t.y, 60, 0, 7);
  ctx.fill();
  ctx.fillStyle = "#67f0cf";
  ctx.fillRect(DEPOT.x - 45, DEPOT.y - 45, 90, 90);
  ctx.translate(s.car.x, s.car.y);
  ctx.rotate(s.car.angle);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(85, 0);
  ctx.lineTo(-50, -48);
  ctx.lineTo(-25, 0);
  ctx.lineTo(-50, 48);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#061820";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const shake = reduced ? 0 : s.shake;
  ctx.translate(
    w / 2 + (Math.random() - 0.5) * shake,
    h / 2 + (Math.random() - 0.5) * shake,
  );
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x, -cam.y);
  road();
  ctx.strokeStyle = "#0005";
  ctx.lineWidth = 3;
  for (const p of s.skids) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.globalAlpha = Math.min(1, p.ttl / 3);
    ctx.beginPath();
    ctx.moveTo(-5, -10);
    ctx.lineTo(5, -10);
    ctx.moveTo(-5, 10);
    ctx.lineTo(5, 10);
    ctx.stroke();
    ctx.restore();
  }
  drawGPS();
  ctx.fillStyle = "#67f0cf18";
  ctx.fillRect(DEPOT.x - 70, DEPOT.y - 65, 140, 130);
  ctx.strokeStyle = "#67f0cf";
  ctx.lineWidth = 2;
  ctx.strokeRect(DEPOT.x - 65, DEPOT.y - 60, 130, 120);
  ctx.save();
  ctx.translate(DEPOT.x, DEPOT.y);
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#67f0cf";
  ctx.textAlign = "center";
  ctx.fillText("NEON / REPO", 0, 48);
  ctx.restore();
  for (const t of s.traffic)
    if (
      Math.abs(t.x - cam.x) < w / (2 * zoom) + 150 &&
      Math.abs(t.y - cam.y) < h / (2 * zoom) + 150
    )
      car(t);
  drawTarget();
  car(s.car, true);
  ctx.restore();
  const vig = ctx.createRadialGradient(
    w * 0.5,
    h * 0.52,
    Math.min(w, h) * 0.15,
    w * 0.5,
    h * 0.52,
    Math.max(w, h) * 0.7,
  );
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, "#02131bc9");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  if (!reduced) {
    ctx.strokeStyle = "#acdedb17";
    ctx.lineWidth = 0.6;
    for (let n = 0; n < 65; n++) {
      const x = (n * 173 + now * 48) % w,
        y = (n * 137 + now * 270) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 12);
      ctx.stroke();
    }
  }
  minimap();
}
function frame(ts) {
  const dt = Math.min((ts - last) / 1000 || 0.016, 0.5);
  last = ts;
  now = ts / 1000;
  const before = s.collisions;
  const controls = input();
  if (s.mode === "play") {
    idleFor =
      controls.throttle || controls.steer || controls.brake || controls.boost
        ? 0
        : idleFor + dt;
    if (idleFor > 90) {
      pause();
      notify("Paused while you were away.", 4);
      idleFor = 0;
    }
  }
  for (let remaining = dt; remaining > 0; remaining -= 0.025)
    step(s, controls, Math.min(0.025, remaining));
  if (s.collisions > before) tone(80, 0.18);
  if (s.mode === "play" || s.mode === "pause") {
    const ahead = s.car.speed * 0.22,
      tx = s.car.x + Math.cos(s.car.angle) * ahead,
      ty = s.car.y + Math.sin(s.car.angle) * ahead;
    cam.x += (tx - cam.x) * (1 - Math.exp(-4 * dt));
    cam.y += (ty - cam.y) * (1 - Math.exp(-4 * dt));
  } else if (s.mode === "board") {
    cam.x += (DEPOT.x + 400 + Math.sin(now * 0.08) * 110 - cam.x) * dt * 0.5;
    cam.y += (DEPOT.y - 160 + Math.cos(now * 0.1) * 80 - cam.y) * dt * 0.5;
  }
  cam.x = clamp(cam.x, w / (2 * zoom), WORLD.w - w / (2 * zoom));
  cam.y = clamp(cam.y, h / (2 * zoom), WORLD.h - h / (2 * zoom));
  draw();
  updateHUD();
  $("toast").hidden = !s.toast || s.toast.ttl <= 0;
  if (s.toast) $("toast").textContent = s.toast.text;
  if (engineGain) {
    const volume =
      sound && s.mode === "play" ? 0.009 + Math.abs(s.car.speed) * 0.000025 : 0;
    engineGain.gain.setTargetAtTime(volume, ac.currentTime, 0.06);
    engineTone.frequency.setTargetAtTime(
      35 + Math.abs(s.car.speed) * 0.22,
      ac.currentTime,
      0.1,
    );
  }
  requestAnimationFrame(frame);
}
renderBoard();
showMode();
requestAnimationFrame(frame);
