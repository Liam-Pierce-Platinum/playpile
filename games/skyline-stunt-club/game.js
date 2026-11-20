import {
  roofs,
  bridges,
  ramps,
  beacons,
  liveries,
  courses,
  createGame,
  advanceFrame,
  reset,
  startRoute,
  surface,
  toast,
} from "./engine.js";
import { graphicsChoice, mountDrivingView } from "../_shared/city-art/driving-view.js";
import { createFallback } from "./fallback.js";
const $ = (id) => document.getElementById(id),
  keys = new Set();
let canvas = $("world");
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("ssc.save.v1") || "{}");
} catch {}
const s = createGame(saved);
let running = false,
  paused = false,
  last = performance.now(),
  uiTime = 0,
  sound = false,
  audio,
  engine,
  volume;
let view;
await mountDrivingView(
  canvas,
  async () => (await import("./renderer.js")).createRenderer,
  createFallback,
  (next, surface) => {
    view = next;
    canvas = surface;
    $("graphicsChoice").replaceChildren(graphicsChoice(canvas));
    canvas.setAttribute("aria-label", canvas.dataset.engine
      ? "3D rooftop driving playground" : "Compatibility rooftop driving playground");
  },
);
function render(dt) {
  view.render(s, dt, keys, running, paused);
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
    if (e.type !== "reset") chime(e.type);
    save();
  }
  s.events = [];
}
function ui() {
  $("rep").textContent = s.rep.toLocaleString();
  $("best").textContent = s.best.toLocaleString();
  $("landings").textContent = s.landings;
  $("speed").textContent = Math.round(Math.abs(s.car.speed) * 3.6);
  $("boostFill").style.width = s.boost * 100 + "%";
  $("location").textContent = s.car.air
    ? "AIR TIME / " + s.car.airTime.toFixed(1) + "s"
    : surface(s.car.x, s.car.z)?.name || "OVER THE EDGE";
  const message = s.toastTime > 0 ? s.toast : "";
  if ($("toast").textContent !== message) $("toast").textContent = message;
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
  const elapsed = Math.max(0, (now - last) / 1000);
  last = Math.max(last, now);
  if (running && !paused) {
    advanceFrame(s, keys, elapsed);
    events();
  }
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
  render(Math.min(elapsed, 1));
  uiTime += elapsed;
  if (uiTime > 0.1) {
    ui();
    uiTime = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const keyboardHeld = new Set();
const touchPointers = new Map();
function releaseControls() {
  keyboardHeld.clear();
  touchPointers.clear();
  keys.clear();
  document.querySelectorAll(".mobile .held").forEach((b) => b.classList.remove("held"));
}
function setPause(value) {
  paused = value;
  last = performance.now();
  s.pendingSeconds = 0;
  releaseControls();
  $("pause").textContent = paused ? "RESUME" : "PAUSE";
  if (paused) toast(s, "PAUSED · PRESS P OR RESUME");
  else {
    canvas.focus({ preventScroll: true });
    toast(s, "BACK IN THE DRIVER’S SEAT");
  }
  ui();
}
$("start").onclick = () => {
  running = true;
  last = performance.now();
  $("menu").hidden = true;
  $("cockpit").inert = false;
  canvas.focus({ preventScroll: true });
  toast(s, matchMedia("(pointer: coarse)").matches
    ? "HOLD GO · FOLLOW THE MINT ARROWS"
    : "HOLD W / ↑ · FOLLOW THE MINT ARROWS");
};
$("start").disabled = false;
$("pause").onclick = () => {
  if (running) setPause(!paused);
};
$("challenge").onclick = () => {
  running = true;
  paused = false;
  last = performance.now();
  releaseControls();
  $("pause").textContent = "PAUSE";
  $("menu").hidden = true;
  startRoute(s, +$("course").value);
  canvas.focus({ preventScroll: true });
};
function showLiveries() {
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
        showLiveries();
        $("cars").querySelector(".selected")?.focus();
      };
      return b;
    }),
  );
}
let pausedBeforeGarage = false;
function garage() {
  pausedBeforeGarage = paused;
  setPause(true);
  showLiveries();
  $("garagePanel").showModal();
  $("cars").querySelector(".selected")?.focus();
}
$("garage").onclick = garage;
$("mobileGarage").onclick = garage;
$("recover").onclick = () => {
  if (running && !paused) reset(s);
  canvas.focus({ preventScroll: true });
};
$("course").onchange = ui;
$("garageClose").onclick = () => $("garagePanel").close();
$("garagePanel").onclose = () => {
  setPause(pausedBeforeGarage || document.hidden);
};
$("sound").onclick = () => {
  try {
    if (!sound && !audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      audio = new Context();
      engine = audio.createOscillator();
      volume = audio.createGain();
      engine.type = "triangle";
      volume.gain.value = 0;
      engine.connect(volume);
      volume.connect(audio.destination);
      engine.start();
    }
    sound = !sound;
    if (sound) audio.resume().catch(() => {
      sound = false;
      $("sound").textContent = "FX OFF";
    });
    $("sound").textContent = sound ? "FX ON" : "FX OFF";
  } catch {
    sound = false;
    $("sound").disabled = true;
    $("sound").textContent = "FX UNAVAILABLE";
  }
};
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!running || $("garagePanel").open || e.target instanceof HTMLSelectElement ||
      e.ctrlKey || e.metaKey || e.altKey) return;
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
    if (!paused && !["p","r"].includes(k)) {
      keyboardHeld.add(k);
      keys.add(k);
    }
  }
});
addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  keyboardHeld.delete(key);
  if (![...touchPointers.values()].includes(key)) keys.delete(key);
});
function pauseInactiveGame() {
  if ($("garagePanel").open) pausedBeforeGarage = true;
  if (running && !paused) setPause(true);
  else releaseControls();
}
addEventListener("blur", pauseInactiveGame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseInactiveGame();
});
for (const b of document.querySelectorAll("[data-key]")) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    if (running && !paused) {
      touchPointers.set(e.pointerId, b.dataset.key);
      keys.add(b.dataset.key);
      b.classList.add("held");
    }
  };
  const release = (e) => {
    touchPointers.delete(e.pointerId);
    if ([...touchPointers.values()].includes(b.dataset.key)) return;
    if (!keyboardHeld.has(b.dataset.key)) keys.delete(b.dataset.key);
    b.classList.remove("held");
  };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
}
