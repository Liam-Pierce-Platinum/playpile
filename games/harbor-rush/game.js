import { graphicsChoice, mountDrivingView } from "../_shared/city-art/driving-view.js";
import { createCanvasFallback } from "./fallback.js";
import {
  GRID,
  METERS_PER_UNIT,
  YGRID,
  WIDTH,
  HEIGHT,
  buildings,
  stops,
  clamp,
  distance,
  createGame,
  makeContract,
  buyUpgrade,
  upgradeCost,
  recover,
  spawnTraffic,
  advance,
  routeTo,
} from "./model.js";
const $ = (id) => document.getElementById(id),
  canvas = $("city"),
  input = {};
const STORE = "playpile.harbor-rush.v1";
let saved;
try {
  saved = JSON.parse(localStorage.getItem(STORE));
} catch {}
const g = createGame(saved);
spawnTraffic(g);
let view;
await mountDrivingView(
  canvas,
  async () => {
    const { createHarborRenderer } = await import("./render3d.js");
    return (surface) => createHarborRenderer(surface, g);
  },
  (surface) => createCanvasFallback(surface, g),
  (next, surface) => {
    view = next;
    document.querySelector("#menu .graphics-choice")?.replaceWith(graphicsChoice(surface));
  },
);
let mode = "title",
  width = innerWidth,
  height = innerHeight,
  dpr = 1,
  zoom = 1,
  cam = { x: 980, y: 1600 },
  last = 0,
  lastToast = null,
  toastUntil = 0,
  audio = null,
  sound = false,
  engine = null,
  lastSaved = 0;
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(g.save));
  } catch {}
}
function resize() {
  width = innerWidth;
  height = innerHeight;
  dpr = Math.min(2, devicePixelRatio || 1);
  view.resize(width, height);
  zoom = width < 650 ? 0.64 : Math.min(1.08, width / 1200);
}
addEventListener("resize", resize);
resize();
function beep(freq = 440, duration = 0.1) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(),
      v = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, audio.currentTime);
    v.gain.setValueAtTime(0.05, audio.currentTime);
    v.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    o.connect(v).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + duration);
  } catch {
    sound = false;
  }
}
function soundToggle() {
  sound = !sound;
  beep(660);
  $("soundButton").textContent = sound ? "FX on" : "FX off";
}
function clearInput() {
  pressedKeys.clear();
  activePointers.clear();
  for (const key of Object.keys(input)) input[key] = false;
  document.querySelectorAll(".held").forEach((b) => b.classList.remove("held"));
}
function setMode(next) {
  mode = next;
  g.stepRemainder = 0;
  clearInput();
  $("overlay").hidden = next === "drive";
  $("hud").hidden = next === "title";
  $("hud").inert = next !== "drive";
  $("city").inert = next !== "drive";
  $("overlay").inert = next === "drive";
  $("overlay").setAttribute("aria-label", {
    title: "Harbor Rush", pause: "Shift paused", jobs: "Harbor dispatch", garage: "Fleet workshop",
  }[next] || "Harbor Rush");
  queueMicrotask(() => {
    if (mode !== next) return;
    const target = next === "drive" ? $("city") : $("menu").querySelector("button:not(:disabled)");
    target?.focus({ preventScroll: true });
  });
}
function showTitle() {
  setMode("title");
  g.mission = null;
  g.rival = null;
  $("menu").innerHTML =
    `<div class="tag">OPEN CITY / ARCADE COURIER</div><h1>HARBOR<span>RUSH.</span></h1><p>One city. Your route.<br>Run packages along coastal streets, cut through the parks, and turn a little courier car into a harbor legend.</p><div class="buttons"><button class="primary" id="start">Start a shift</button><button id="roam">Just drive</button></div><p class="keys">WASD / ARROWS drive · SPACE handbrake · SHIFT boost<br>Brake into corners. Slow inside a delivery circle to load or unload.<br>Touch controls appear on phones and tablets.</p><div class="statline"><div><strong>${g.save.deliveries}</strong><small>LIFETIME DELIVERIES</small></div><div><strong>$${g.save.credits}</strong><small>GARAGE BALANCE</small></div></div>`;
  $("menu").append(graphicsChoice($("city")));
  $("start").onclick = () => {
    beginShift(true);
  };
  $("roam").onclick = () => {
    beginShift(false);
  };
}
function beginShift(withDelivery) {
  g.shiftEarned = 0;
  g.shiftDeliveries = 0;
  g.mission = null;
  g.rival = null;
  g.toast = null;
  $("toast").classList.remove("show");
  if (withDelivery) makeContract(g);
  startDrive();
}
function startDrive() {
  setMode("drive");
  cam.x = g.car.x;
  cam.y = g.car.y;
  last = performance.now();
  beep(520);
}
function showPause() {
  setMode("pause");
  persist();
  $("menu").innerHTML =
    `<div class="eyebrow">TAKE A BREATHER</div><h2>City on hold.</h2><p>Your route will be here when you get back.</p><div class="statline"><div><strong>${g.shiftDeliveries}</strong><small>THIS SHIFT</small></div><div><strong>$${g.shiftEarned}</strong><small>EARNED</small></div><div><strong>${(g.save.distance * METERS_PER_UNIT / 1000).toFixed(1)}</strong><small>KM DRIVEN</small></div></div><div class="buttons"><button class="primary" id="resume">Keep driving</button><button id="resetCar">Return to the road</button><button id="quit">End shift</button></div><p class="keys">WASD / ARROWS accelerate, brake, reverse and steer.<br>SPACE loosens the rear wheels. SHIFT uses rechargeable boost.<br>B opens dispatch, G opens the garage. No timers run while paused.</p>`;
  $("resume").onclick = startDrive;
  $("resetCar").onclick = () => {
    recover(g);
    startDrive();
  };
  $("quit").onclick = showTitle;
}
function showJobs() {
  setMode("jobs");
  $("menu").innerHTML =
    `<div class="eyebrow">HARBOR DISPATCH</div><h2>Choose your next run.</h2><p>Only the pickup and destination matter. Every street and park shortcut is yours to use.</p><div class="cards">${[
      [
        "standard",
        "City delivery",
        "A relaxed local run. Clean driving earns a bigger tip.",
        "STEADY",
      ],
      [
        "fragile",
        "Handle with care",
        "Delicate cargo. Take smooth corners and avoid bumps.",
        "BONUS PAY",
      ],
      [
        "rival",
        "Rival rush",
        "A rival courier follows your route. Find your own way through.",
        "HIGH PAY",
      ],
    ]
      .map(
        ([type, title, desc, label]) =>
          `<div class="card"><small>${label}</small><h3>${title}</h3><p>${desc}</p><button data-job="${type}" ${g.mission ? "disabled" : ""}>Accept run</button></div>`,
      )
      .join(
        "",
      )}</div><p class="keys">${g.mission ? "Finish your current delivery first, or leave it at dispatch below." : "Late delivery? You still get paid. Being on time is a bonus."}</p><div class="buttons"><button class="primary" id="back">Back to the city</button>${g.mission ? '<button id="abandon">Return current package</button>' : ""}</div>`;
  document.querySelectorAll("[data-job]").forEach(
    (b) =>
      (b.onclick = () => {
        makeContract(g, b.dataset.job);
        startDrive();
      }),
  );
  $("back").onclick = startDrive;
  if ($("abandon"))
    $("abandon").onclick = () => {
      g.mission = null;
      g.rival = null;
      showJobs();
    };
}
function showGarage() {
  setMode("garage");
  persist();
  $("menu").innerHTML =
    `<div class="eyebrow">FLEET WORKSHOP / $${g.save.credits}</div><h2>Make it yours.</h2><p>Permanent upgrades, bought with delivery earnings. Your car is serviced wherever you park.</p><div class="cards">${[
      [
        "engine",
        "Street motor",
        "More top speed. Feel the difference on the waterfront.",
      ],
      [
        "grip",
        "Road tires",
        "Tighter grip. Save the big slides for the handbrake.",
      ],
      [
        "armor",
        "Cargo cradle",
        "Softer landings and better package protection.",
      ],
    ]
      .map(
        ([kind, title, desc]) =>
          `<div class="card"><small>LEVEL ${g.save[kind]} / 3</small><h3>${title}</h3><p>${desc}</p><div class="upgradeLevel">${[1, 2, 3].map((n) => `<i class="${g.save[kind] >= n ? "on" : ""}"></i>`).join("")}</div><button data-upgrade="${kind}" ${g.save.credits < upgradeCost(g.save[kind]) ? "disabled" : ""}>${g.save[kind] === 3 ? "Fully tuned" : "Upgrade · $" + upgradeCost(g.save[kind])}</button></div>`,
      )
      .join(
        "",
      )}</div><div class="buttons"><button class="primary" id="back">Back to the city</button></div><p class="keys">Progress saves on this browser. Free roam is always available.<br>Courier rank: ${["Rookie driver", "Local favorite", "Harbor regular", "City legend"][Math.min(3, Math.floor(g.save.deliveries / 5))]} · ${g.save.deliveries} deliveries</p>`;
  document.querySelectorAll("[data-upgrade]").forEach(
    (b) =>
      (b.onclick = () => {
        if (buyUpgrade(g, b.dataset.upgrade)) {
          persist();
          beep(780, 0.15);
          showGarage();
        }
      }),
  );
  $("back").onclick = startDrive;
}
$("pauseButton").onclick = showPause;
$("jobsButton").onclick = showJobs;
$("garageButton").onclick = showGarage;
$("soundButton").onclick = soundToggle;
const bindings = {
  ArrowUp: "throttle",
  KeyW: "throttle",
  ArrowDown: "brake",
  KeyS: "brake",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "drift",
  ShiftLeft: "boost",
  ShiftRight: "boost",
};
const pressedKeys = new Set(), activePointers = new Map();
function syncInput() {
  for (const key of Object.values(bindings)) input[key] = false;
  for (const code of pressedKeys) input[bindings[code]] = true;
  for (const key of activePointers.values()) input[key] = true;
  for (const button of document.querySelectorAll("[data-input]"))
    button.classList.toggle("held", Array.from(activePointers.values()).includes(button.dataset.input));
}
addEventListener("keydown", (e) => {
  if (e.code === "Tab" && mode !== "drive") {
    const buttons = Array.from($("menu").querySelectorAll("button:not(:disabled), a[href], input, select, textarea, [tabindex='0']"))
      .filter((element) => element.getClientRects().length > 0);
    const first = buttons[0], last = buttons.at(-1);
    if (first && (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  const interactive = e.target instanceof Element &&
    (e.target.closest("button, a, input, select, textarea") || e.target.isContentEditable);
  if (bindings[e.code] && mode === "drive" && !(interactive && e.code === "Space")) {
    e.preventDefault();
    pressedKeys.add(e.code);
    syncInput();
  }
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    if (mode === "drive") showPause();
    else if (mode !== "title") startDrive();
  }
  if (mode === "drive") {
    if (e.code === "KeyB") showJobs();
    if (e.code === "KeyG") showGarage();
    if (e.code === "KeyR") {
      recover(g);
      beep(300);
    }
    if (e.code === "KeyM") soundToggle();
    if (e.code === "KeyE") beep(220, 0.18);
  } else if (mode === "title" && e.code === "Enter" && !interactive) {
    beginShift(true);
  }
});
addEventListener("keyup", (e) => {
  if (bindings[e.code]) {
    pressedKeys.delete(e.code);
    syncInput();
  }
});
addEventListener("blur", () => {
  clearInput();
  if (mode === "drive") showPause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "drive") showPause();
});
for (const b of document.querySelectorAll("[data-input]")) {
  const key = b.dataset.input;
  b.onpointerdown = (e) => {
    if (mode !== "drive" || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, key);
    syncInput();
  };
  const release = (e) => {
    activePointers.delete(e.pointerId);
    syncInput();
  };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
}
addEventListener("pagehide", persist);
function draw() {
  view.render(g, input, mode);
}
function updateHud() {
  const c = g.car,
    m = g.mission;
  $("speedValue").textContent = Math.round(Math.hypot(c.vx, c.vy) * METERS_PER_UNIT * 3.6);
  $("boostFill").style.width = c.boost + "%";
  $("bank").textContent = "$" + g.shiftEarned;
  $("district").textContent =
    c.x > 1770
      ? "WATERFRONT"
      : c.y < 500
        ? "NORTH HEIGHTS"
        : c.y > 1750
          ? "SOUTH DOCKS"
          : c.x < 550
            ? "OLD TOWN"
            : "MIDTOWN";
  if (m) {
    const t = m.stage === "pickup" ? m.from : m.to;
    $("phase").textContent =
      (m.type === "rival"
        ? "RIVAL RUN"
        : m.type === "fragile"
          ? "FRAGILE CARGO"
          : "CITY DELIVERY") +
      " / " +
      (g.shiftDeliveries + 1).toString().padStart(2, "0");
    $("objective").textContent =
      (m.stage === "pickup" ? "Pick up: " : "Deliver: ") + t.name;
    $("instructions").textContent =
      distance(c, t) < 85
        ? "Slow down and hold in the circle."
        : m.stage === "pickup"
          ? "Cyan route to pickup. Choose any street."
          : m.type === "rival"
            ? "Pink rival behind you. Keep your route moving."
            : "Gold route to delivery. Brake before corners.";
    $("distance").textContent = Math.round(distance(c, t) * METERS_PER_UNIT) + " m";
    $("condition").textContent = "PACKAGE " + Math.round(m.cargo) + "%";
    $("cargo").style.width = m.cargo + "%";
    $("cargo").style.background = m.cargo < 35 ? "#f68e79" : "#63edcc";
  } else {
    $("phase").textContent = "OFF THE CLOCK";
    $("objective").textContent = "The city is yours.";
    $("instructions").textContent =
      "Discover 12 landmarks for $35 each, or open Jobs for a delivery.";
    $("condition").textContent = g.save.deliveries + " DELIVERIES";
    $("distance").textContent = "FREE ROAM";
    $("cargo").style.width = "100%";
  }
  if (g.toast && g.toast.id !== lastToast) {
    lastToast = g.toast.id;
    $("toast").textContent = g.toast.text;
    $("toast").classList.add("show");
    toastUntil = performance.now() + 4200;
    if (g.toast.kind === "delivery" || g.toast.kind === "discovery") {
      persist();
      beep(880, 0.25);
    } else beep(440, 0.1);
  }
  if (performance.now() > toastUntil) $("toast").classList.remove("show");
}
function frame(now) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000 || 0.016));
  last = now;
  if (mode === "drive") {
    advance(g, input, dt);
    const ahead = width < 650 ? 0.25 : 0.5;
    const tx = g.car.x + g.car.vx * ahead,
      ty = g.car.y + g.car.vy * ahead;
    cam.x += (tx - cam.x) * (1 - Math.exp(-5 * dt));
    cam.y += (ty - cam.y) * (1 - Math.exp(-5 * dt));
    updateHud();
    if (now - lastSaved > 15000) {
      persist();
      lastSaved = now;
    }
  } else if (mode === "title") {
    g.time += dt;
    cam.x = 950 + Math.sin(now * 0.00008) * 550;
    cam.y = 1550 + Math.cos(now * 0.00006) * 240;
  }
  draw();
  requestAnimationFrame(frame);
}
showTitle();
requestAnimationFrame(frame);
