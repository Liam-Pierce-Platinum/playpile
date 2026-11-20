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
import { createRenderer } from "./renderer.js";
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
try {
  if (new URLSearchParams(location.search).get("graphics") === "canvas")
    throw new Error("Low-power view selected");
  view = createRenderer(canvas);
  canvas.setAttribute("aria-label", "3D rooftop driving playground");
} catch (error) {
  console.info("Using compatibility renderer:", error.message);
  const replacement = canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  canvas = replacement;
  view = createFallback(canvas);
  canvas.setAttribute("aria-label", "Compatibility rooftop driving playground");
}
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
    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      tick(s, keys, step);
      remaining -= step;
    }
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
  render(elapsed);
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
