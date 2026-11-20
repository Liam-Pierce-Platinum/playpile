import {
  roofs,
  bridges,
  beacons,
  liveries,
  courses,
  createGame,
  advanceFrame,
  reset,
  startRoute,
  surface,
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
const bearings = ["Ahead", "Ahead right", "Right", "Back right", "Behind", "Back left", "Left", "Ahead left"];
function ui() {
  $("speed").textContent = Math.round(Math.abs(s.car.speed) * 3.6);
  $("boostFill").style.width = s.boost * 100 + "%";
  const active = s.route && !s.route.done;
  $("courseStatus").hidden = !active;
  if (active) {
    const course = courses[s.route.course];
    const target = beacons[course.path[s.route.index]];
    const dx = target.x - s.car.x, dz = target.z - s.car.z;
    const heading = Math.atan2(dx, -dz) - s.car.a;
    const octant = (Math.round(heading / (Math.PI / 4)) % 8 + 8) % 8;
    $("objective").textContent = "Checkpoint " + (s.route.index + 1) + " / " + course.path.length;
    $("routeLabel").textContent = bearings[octant] + " · " + Math.round(Math.hypot(dx, dz)) + " m · " + Math.ceil(s.route.remaining) + "s";
  }
  const message = s.toastTime > 0 ? s.toast : s.combo > 1 ? "×" + Math.min(s.combo, 5) + " combo" : "";
  $("toast").hidden = !!active || !message;
  if ($("toast").textContent !== message) $("toast").textContent = message;
}
function menuInfo() {
  const pick = Number($("course").value);
  $("routeInfo").textContent = courses[pick].description;
  $("record").textContent = "Personal best " + (s.records[pick] ? s.records[pick].toFixed(2) + "s" : "—");
  $("challenge").textContent = s.route?.course === pick ? "Retry course" : "Start course";
  $("rep").textContent = s.rep.toLocaleString();
  $("best").textContent = s.best.toLocaleString();
  $("landings").textContent = s.landings;
  $("location").textContent = s.car.air ? "Airborne" : surface(s.car.x, s.car.z)?.name || "Over the edge";
}
function drawMap() {
  const mc = $("miniMap").getContext("2d");
  if (!mc) return;
  mc.clearRect(0, 0, 240, 240);
  mc.fillStyle = "rgba(9,17,24,.68)";
  mc.fillRect(0, 0, 240, 240);
  mc.save();
  mc.translate(120, 120);
  const f = 1.85;
  for (const r of [...roofs, ...bridges]) {
    mc.fillStyle = "#6d7d82";
    mc.fillRect((r.x - r.w / 2) * f, (r.z - r.d / 2) * f, r.w * f, r.d * f);
  }
  beacons.forEach((b, i) => {
    const active =
      s.route &&
      !s.route.done &&
      courses[s.route.course].path[s.route.index] === i;
    mc.fillStyle = active
      ? "#ffcf5a"
      : s.collected.has(i)
        ? "#758f82"
        : "#c4d4be";
    mc.beginPath();
    mc.arc(b.x * f, b.z * f, active ? 6 : 3, 0, Math.PI * 2);
    mc.fill();
  });
  mc.translate(s.car.x * f, s.car.z * f);
  mc.rotate(s.car.a);
  mc.fillStyle = "#fff4d1";
  mc.beginPath();
  mc.moveTo(0, -8);
  mc.lineTo(5, 6);
  mc.lineTo(0, 3);
  mc.lineTo(-5, 6);
  mc.fill();
  mc.restore();
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
  $("cockpit").inert = value;
  if (value) {
    menuInfo();
    drawMap();
    if (!$("pausePanel").open) $("pausePanel").showModal();
    $("resume").focus({ preventScroll: true });
  } else {
    if ($("pausePanel").open) $("pausePanel").close();
    canvas.focus({ preventScroll: true });
  }
  ui();
}
function start(chooseCourse) {
  running = true;
  $("menu").hidden = true;
  setPause(chooseCourse);
  if (chooseCourse) $("course").focus({ preventScroll: true });
}
$("start").onclick = () => start(false);
$("chooseCourse").onclick = () => start(true);
$("start").disabled = $("chooseCourse").disabled = false;
$("pause").onclick = () => setPause(true);
$("resume").onclick = () => setPause(false);
$("pausePanel").oncancel = e => {
  e.preventDefault();
  if (!document.hidden) setPause(false);
};
$("challenge").onclick = () => {
  startRoute(s, Number($("course").value));
  setPause(false);
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
$("garage").onclick = () => {
  showLiveries();
  $("garagePanel").showModal();
  $("cars").querySelector(".selected")?.focus();
};
$("recover").onclick = () => {
  reset(s);
  setPause(false);
};
$("course").onchange = menuInfo;
$("garageClose").onclick = () => $("garagePanel").close();
$("garagePanel").onclose = () => {
  if ($("pausePanel").open) $("garage").focus({ preventScroll: true });
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
      $("sound").textContent = "Sound off";
      $("sound").setAttribute("aria-pressed", "false");
    });
    $("sound").textContent = sound ? "Sound on" : "Sound off";
    $("sound").setAttribute("aria-pressed", String(sound));
  } catch {
    sound = false;
    $("sound").disabled = true;
    $("sound").setAttribute("aria-pressed", "false");
    $("sound").textContent = "Sound unavailable";
  }
};
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!running || $("garagePanel").open || e.target instanceof HTMLSelectElement ||
      e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "p" && !e.repeat) {
    e.preventDefault();
    setPause(!paused);
    return;
  }
  if (paused) return;
  if (k === "escape" && !e.repeat) {
    e.preventDefault();
    setPause(true);
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
    ].includes(k)
  ) {
    if (e.target instanceof HTMLButtonElement && [" ", "enter"].includes(k))
      return;
    e.preventDefault();
    if (k === "r" && !e.repeat) reset(s);
    if (k !== "r") {
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
