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
  METRES_PER_UNIT,
  HANDOVER_RADIUS,
} from "./engine.js";
import { graphicsChoice, mountDrivingView } from "../_shared/city-art/driving-view.js";
import { createFallback } from "./fallback.js";
const $ = (id) => document.getElementById(id),
  canvas = $("city"),
  keys = new Set(),
  touchPointers = new Map(),
  held = new Set();
let view;
await mountDrivingView(
  canvas,
  async () => (await import("./renderer.js")).createCityRenderer,
  createFallback,
  (next, surface) => {
    view = next;
    const slot = $("graphicsChoice");
    slot.replaceChildren(graphicsChoice(surface));
  },
);
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
const touchDevice = matchMedia("(any-pointer: coarse)").matches || navigator.maxTouchPoints > 0;
let padButtons = [], usingPad = false;
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
  const recoveries = s.career.jobs === 1 ? "RECOVERY" : "RECOVERIES";
  $("careerline").textContent = `${s.career.jobs} ${recoveries} · ${s.career.rep} REP`;
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
  s.toast = null;
  cam.x = s.car.x;
  cam.y = s.car.y;
  previousCollision = 0;
  idleFor = 0;
}
function showMode() {
  $("board").hidden = s.mode !== "board";
  $("hud").hidden = s.mode !== "play";
  $("hud").inert = s.mode !== "play";
  $("result").hidden = s.mode !== "result";
  $("pausepanel").hidden = s.mode !== "pause";
  $("garagepanel").hidden = s.mode !== "garage";
  $("touch").hidden = !((touchDevice || w < 900 || h < 500) && s.mode === "play");
  $("routeDetails").hidden = true;
  $("mapToggle").setAttribute("aria-expanded", "false");
  if (s.mode === "board") renderBoard();
  if (s.mode === "result") {
    const r = s.completed;
    $("receipt").innerHTML =
      `<div class="receipt-line"><span>${r.name}</span><span>${r.time}s</span></div><div class="receipt-line"><span>Vehicle condition</span><span>${r.condition}%</span></div><div class="receipt-line"><span>On-time bonus</span><span>$${r.timeBonus}</span></div><div class="receipt-line"><span>Clean return bonus</span><span>$${r.cleanBonus}</span></div><div class="receipt-line"><span>Destination</span><span>${s.job.drop.name}</span></div><div class="receipt-line"><span>${r.personalBest ? "NEW PERSONAL BEST" : "PERSONAL RECORD"}</span><span>${Math.round(s.career.records[s.job.recordKey].bestTime)}s</span></div><div class="receipt-line"><span>Reputation earned</span><span>+${r.rep} REP</span></div><div class="receipt-line total"><span>YOUR CUT</span><span>$${r.pay}</span></div>`;
    save();
  }
  if (s.mode === "garage") renderGarage();
  const focusTarget = {
    play: $("city"), pause: $("resume"), result: $("next"),
    board: $("jobs").querySelector("button"), garage: $("closegarage"),
  }[s.mode];
  focusTarget?.focus({ preventScroll: true });
  keys.clear();
  touchPointers.clear();
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
    notify("Vehicle collected", 2);
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
function drawRouteMap() {
  const map = $("radar"), ctx = map.getContext("2d");
  if (!ctx) return;
  const padding = 9;
  const scale = Math.min((map.width - padding * 2) / WORLD.w, (map.height - padding * 2) / WORLD.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b1e26";
  ctx.fillRect(0, 0, map.width, map.height);
  ctx.translate((map.width - WORLD.w * scale) / 2, (map.height - WORLD.h * scale) / 2);
  ctx.scale(scale, scale);
  ctx.beginPath();
  for (const x of GRID_X) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); }
  for (const y of GRID_Y) { ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); }
  ctx.strokeStyle = "#476068";
  ctx.lineWidth = 38;
  ctx.stroke();
  const color = s.stage === "pickup" ? "#ffbc78" : "#67f0cf";
  ctx.beginPath();
  route(s).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.stroke();
  const end = target(s);
  ctx.beginPath();
  ctx.arc(end.x, end.y, 63, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.translate(s.car.x, s.car.y);
  ctx.rotate(s.car.angle);
  ctx.beginPath();
  ctx.moveTo(85, 0); ctx.lineTo(-52, -54); ctx.lineTo(-28, 0); ctx.lineTo(-52, 54); ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
}
$("mapToggle").onclick = () => {
  const open = $("routeDetails").hidden;
  $("routeDetails").hidden = !open;
  $("mapToggle").setAttribute("aria-expanded", String(open));
  if (open) drawRouteMap();
};
function returnToRoad() {
  if (s.mode === "pause") pause();
  recover(s);
  notify("Back on the street. Bodywork −5%", 2);
}
$("unstick").onclick = returnToRoad;
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
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = sound ? "Sound on" : "Sound off";
  $("sound").setAttribute("aria-pressed", String(sound));
  if (sound) audio();
  if (engineGain) engineGain.gain.value = 0;
};
addEventListener("keydown", (e) => {
  usingPad = false;
  if (s.mode === "pause" && e.key === "Tab") {
    const first = $("resume"), last = $("abandon");
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  if (e.code === "Space" && e.target instanceof HTMLButtonElement) return;
  if (s.mode === "play" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key))
    e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyE") action();
  if (e.code === "Escape" || e.code === "KeyP") pause();
  if (e.code === "KeyR" && s.mode === "play") returnToRoad();
  if (e.code === "KeyM") $("sound").click();
  if (
    e.code === "Enter" &&
    s.mode === "board" &&
    !["BUTTON", "A"].includes(e.target.tagName)
  )
    begin(s.career.jobs % JOBS.length);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", () => { usingPad = false; }, true);
addEventListener("blur", () => {
  keys.clear();
  touchPointers.clear();
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
    touchPointers.set(e.pointerId, b.dataset.key);
    held.add(b.dataset.key);
    b.classList.add("held");
    audio();
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(name, (e) => {
      touchPointers.delete(e.pointerId);
      if ([...touchPointers.values()].includes(b.dataset.key)) return;
      held.delete(b.dataset.key);
      b.classList.remove("held");
    });
}
function padActions(pad) {
  const buttons = pad.buttons.map(b => b.pressed);
  const previous = padButtons;
  padButtons = buttons;
  const pressed = i => buttons[i] && !previous[i];
  if (buttons.some(Boolean) || Math.abs(pad.axes[0] || 0) > 0.15) usingPad = true;
  if (!buttons.some((down, i) => down && !previous[i])) return;
  if (pressed(9) && (s.mode === "play" || s.mode === "pause")) pause();
  else if (s.mode === "play") {
    if (pressed(2)) action();
  } else {
    const panel = { board: "board", result: "result", pause: "pausepanel", garage: "garagepanel" }[s.mode];
    const choices = panel ? Array.from($(panel).querySelectorAll("button:enabled")) : [];
    const index = choices.indexOf(document.activeElement);
    const direction = pressed(12) || pressed(14) ? -1 : pressed(13) || pressed(15) ? 1 : 0;
    if (direction && choices.length) {
      const next = index < 0 ? (direction < 0 ? choices.length - 1 : 0) :
        (index + direction + choices.length) % choices.length;
      choices[next].focus();
    } else if (pressed(0)) choices[Math.max(0, index)]?.click();
    else if (pressed(1)) {
      if (s.mode === "pause") pause();
      if (s.mode === "garage") $("closegarage").click();
      if (s.mode === "result") $("next").click();
    }
  }
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
      padActions(p);
      steer = steer || (Math.abs(p.axes[0]) > 0.15 ? p.axes[0] : 0);
      throttle =
        throttle || (p.buttons[7]?.value || 0) - (p.buttons[6]?.value || 0);
      brake ||= p.buttons[0]?.pressed;
      boost ||= p.buttons[1]?.pressed;
    } else if (padButtons.length) {
      padButtons = [];
      usingPad = false;
    }
  } catch {}
  return { throttle, steer, brake, boost };
}
function setHudText(id, text) {
  const element = $(id);
  if (element.textContent !== text) element.textContent = text;
}
function updateHUD() {
  $("touch").hidden = !((touchDevice || w < 900 || h < 500) && s.mode === "play");
  if (!s.job) return;
  const t = target(s),
    r = route(s);
  let d = 0;
  for (let i = 1; i < r.length; i++) d += dist(r[i - 1], r[i]);
  const instruction = s.stage === "pickup" ? `Pick up ${VEHICLES[s.job.vehicle].name}` : `Deliver to ${s.job.drop.name}`;
  if ($("hud").dataset.stage !== s.stage) $("hud").dataset.stage = s.stage;
  setHudText("objective", instruction);
  setHudText("distance", `${Math.round(d * METRES_PER_UNIT)} m`);
  setHudText("speed", String(Math.round(Math.abs(s.car.speed) * METRES_PER_UNIT * 3.6)));
  if (s.mode === "pause") {
    setHudText("mission", s.job.name);
    setHudText("clock", s.clock > 0 ? `${Math.ceil(s.clock)}s bonus remaining` : "Overtime");
    setHudText("mapObjective", instruction);
    setHudText("condition", Math.round(s.car.health) + "%");
    setHudText("boostLevel", Math.round(s.car.boost) + "%");
    setHudText("carname", VEHICLES[s.car.kind].name);
    setHudText("controlsHint", usingPad ? "Steer with the left stick. RT drives, LT reverses, A brakes, B boosts and X collects or delivers."
      : touchDevice ? "Steer with the arrows. Hold GO to drive, REV to reverse and DRIFT to brake. Slow at the marker, then tap to collect or deliver."
      : "Drive with WASD or the arrow keys. Space brakes, Shift boosts and E collects or delivers at the marker.");
  }
  const near = dist(s.car, t) < HANDOVER_RADIUS;
  $("interaction").hidden = !(s.mode === "play" && near);
  const ready = canInteract(s);
  const prefix = usingPad ? "X / " : touchDevice ? "" : "E / ";
  setHudText("interaction",
    !ready
      ? "SLOW DOWN"
      : s.stage === "pickup"
        ? prefix + "COLLECT VEHICLE"
        : prefix + "COMPLETE RECOVERY");
  $("interaction").disabled = !ready;
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
  if (s.toast) setHudText("toast", s.toast.text);
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
