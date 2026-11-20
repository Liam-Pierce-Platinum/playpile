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
import { createCityRenderer } from "./renderer.js";
import { createFallback } from "./fallback.js";
const $ = (id) => document.getElementById(id),
  canvas = $("city"),
  keys = new Set(),
  held = new Set();
let view;
try {
  view = createCityRenderer(canvas);
} catch (error) {
  console.warn("3D is unavailable; using the compatible city renderer.", error);
  const replacement = canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  view = createFallback(replacement);
}
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
  view.resize(w, h);
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
  view.render(s, now, dt, controls);
  updateHUD();
  $("toast").hidden = s.mode !== "play" || !s.toast || s.toast.ttl <= 0;
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
