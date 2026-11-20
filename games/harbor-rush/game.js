import {
  GRID,
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
  step,
  routeTo,
} from "./model.js";
const $ = (id) => document.getElementById(id),
  canvas = $("city"),
  ctx = canvas.getContext("2d"),
  input = {};
const STORE = "playpile.harbor-rush.v1";
let saved;
try {
  saved = JSON.parse(localStorage.getItem(STORE));
} catch {}
const g = createGame(saved);
spawnTraffic(g);
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
  canvas.width = width * dpr;
  canvas.height = height * dpr;
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
  for (const key of Object.keys(input)) input[key] = false;
  document.querySelectorAll(".held").forEach((b) => b.classList.remove("held"));
}
function setMode(next) {
  mode = next;
  clearInput();
  $("overlay").hidden = next === "drive";
  $("hud").hidden = next === "title";
}
function showTitle() {
  setMode("title");
  $("menu").innerHTML =
    `<div class="tag">OPEN CITY / ARCADE COURIER</div><h1>HARBOR<span>RUSH.</span></h1><p>One city. Your route.<br>Run packages through neon streets, cut through the parks, and turn a little courier car into a harbor legend.</p><div class="buttons"><button class="primary" id="start">Start a shift</button><button id="roam">Just drive</button></div><p class="keys">WASD / ARROWS drive · SPACE handbrake · SHIFT boost<br>Brake into corners. Slow inside a delivery circle to load or unload.<br>Touch controls appear on phones and tablets.</p><div class="statline"><div><strong>${g.save.deliveries}</strong><small>LIFETIME DELIVERIES</small></div><div><strong>$${g.save.credits}</strong><small>GARAGE BALANCE</small></div></div>`;
  $("start").onclick = () => {
    makeContract(g);
    startDrive();
  };
  $("roam").onclick = () => {
    g.mission = null;
    startDrive();
  };
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
    `<div class="eyebrow">TAKE A BREATHER</div><h2>City on hold.</h2><p>Your route will be here when you get back.</p><div class="statline"><div><strong>${g.shiftDeliveries}</strong><small>THIS SHIFT</small></div><div><strong>$${g.shiftEarned}</strong><small>EARNED</small></div><div><strong>${(g.save.distance / 1000).toFixed(1)}</strong><small>KM DRIVEN</small></div></div><div class="buttons"><button class="primary" id="resume">Keep driving</button><button id="resetCar">Return to the road</button><button id="quit">End shift</button></div><p class="keys">WASD / ARROWS accelerate, brake, reverse and steer.<br>SPACE loosens the rear wheels. SHIFT uses rechargeable boost.<br>B opens dispatch, G opens the garage. No timers run while paused.</p>`;
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
addEventListener("keydown", (e) => {
  if (bindings[e.code]) {
    e.preventDefault();
    if (mode === "drive") input[bindings[e.code]] = true;
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
  } else if (mode === "title" && e.code === "Enter") {
    makeContract(g);
    startDrive();
  }
});
addEventListener("keyup", (e) => {
  if (bindings[e.code]) input[bindings[e.code]] = false;
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
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    input[key] = true;
    b.classList.add("held");
  };
  const release = () => {
    input[key] = false;
    b.classList.remove("held");
  };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
}
addEventListener("pagehide", persist);
function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function line(x, y, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function drawWorld() {
  rect(0, 0, WIDTH, HEIGHT, "#122831");
  // The first spawn is a working passenger quay, with water, ships and cranes
  // outside the drivable boundary so the landmark never hides a driving line.
  rect(0, 2130, WIDTH, 110, "#0b4259");
  for (let x = 0; x < WIDTH; x += 65) {
    const bob = Math.sin(g.time * 0.7 + x) * 3;
    line(x, 2160 + bob, x + 32, 2160 + bob, "#2b7386", 2);
    line(x + 20, 2215 - bob, x + 60, 2215 - bob, "#1e6076", 2);
  }
  rect(145, 2118, 1940, 12, "#a3b4a2");
  for (let x = 160; x < 2080; x += 50) {
    rect(x, 2117, 18, 4, "#f3bf72");
    circle(x, 2123, 3, "#e3d0a0");
  }
  rect(210, 2129, 105, 90, "#426072");
  rect(220, 2135, 85, 75, "#5e7780");
  for (let y = 2144; y < 2210; y += 16) line(221, y, 302, y, "#789095", 2);
  const shipBob = Math.sin(g.time) * 1.5;
  ctx.save();
  ctx.translate(570, 2180 + shipBob);
  ctx.fillStyle = "#072b3a";
  ctx.beginPath();
  ctx.ellipse(0, 10, 157, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d4e4de";
  ctx.beginPath();
  ctx.moveTo(-140, -30);
  ctx.lineTo(95, -30);
  ctx.lineTo(150, 0);
  ctx.lineTo(95, 30);
  ctx.lineTo(-140, 30);
  ctx.quadraticCurveTo(-155, 0, -140, -30);
  ctx.fill();
  rect(-130, -26, 205, 52, "#9ebfc0");
  rect(-92, -20, 135, 40, "#f2ebd6");
  rect(35, -18, 40, 36, "#eae5cf");
  rect(52, -13, 21, 26, "#315b71");
  for (let x = -82; x < 32; x += 21) {
    rect(x, -23, 13, 6, "#29586a");
    rect(x, 17, 13, 6, "#29586a");
  }
  rect(-18, -10, 22, 20, "#edb067");
  rect(-116, -9, 16, 18, "#f1be72");
  ctx.fillStyle = "#335362";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("HARBOR LINE", -30, 4);
  ctx.restore();
  // Color-coded container stacks and a silhouetted dock crane on the west quay.
  rect(15, 1740, 123, 378, "#2b414a");
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 2; col++) {
      const cx = 24 + col * 56,
        cy = 1760 + row * 58;
      rect(cx + 3, cy + 5, 47, 43, "#10222c");
      rect(cx, cy, 47, 43, ["#c87c52", "#547c90", "#879c73"][(row + col) % 3]);
      for (let rib = 7; rib < 45; rib += 9)
        line(cx + rib, cy + 4, cx + rib, cy + 39, "#ffffff26", 2);
    }
  rect(45, 2020, 70, 57, "#213946");
  rect(62, 2028, 37, 35, "#d9ad64");
  line(80, 2045, 80, 1945, "#efbd67", 10);
  line(80, 1945, 145, 1980, "#efbd67", 8);
  line(80, 1945, 30, 1980, "#efbd67", 6);
  line(145, 1980, 145, 2030, "#b9cecf", 2);
  line(61, 2028, 80, 1945, "#b38a50", 3);
  line(99, 2028, 80, 1945, "#b38a50", 3);
  circle(145, 2033, 5, "#f5cf8a");
  ctx.fillStyle = "#adc5cc";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText("SOUTH DOCKS / PASSENGER QUAY", 850, 2171);
  ctx.fillStyle = "#5d90a3";
  ctx.font = "11px Arial";
  ctx.fillText("HARBOR LINE   ·   DEPARTURES 24 / 7", 850, 2192);
  rect(2118, 0, 242, HEIGHT, "#0b3a4c");
  for (let y = 0; y < HEIGHT; y += 36) {
    const drift = Math.sin(g.time * 0.6 + y) * 13;
    line(2135 + drift, y, 2350 + drift, y, "#17546a", 2);
  }
  rect(2120, 0, 8, HEIGHT, "#72a0a0");
  for (let j = 0; j < 7; j++) {
    rect(2130, 290 + j * 245, 180, 65, "#263a43");
    for (let n = 0; n < 4; n++)
      rect(
        2145 + n * 38,
        302 + j * 245,
        27,
        35,
        ["#d7865d", "#527e8a", "#718f70"][(j + n) % 3],
      );
  }
  for (const x of GRID) {
    rect(x - 79, 130, 158, 1985, "#536467");
    rect(x - 70, 130, 140, 1985, "#253442");
  }
  for (const y of YGRID) {
    rect(150, y - 79, 1970, 158, "#536467");
    rect(150, y - 70, 1970, 140, "#253442");
  }
  ctx.setLineDash([22, 22]);
  for (const x of GRID) line(x, 145, x, 2108, "#91a3a04d", 2);
  for (const y of YGRID) line(155, y, 2118, y, "#91a3a04d", 2);
  ctx.setLineDash([]);
  for (const x of GRID)
    for (const y of YGRID) {
      rect(x - 69, y - 69, 138, 138, "#253442");
      for (let i = -45; i <= 45; i += 15) {
        rect(x - 63, y + i, 9, 7, "#9fb6b568");
        rect(x + 54, y + i, 9, 7, "#9fb6b568");
      }
      circle(x - 77, y - 77, 4, "#fcce8f");
      circle(x + 77, y + 77, 4, "#fcce8f");
    }
  for (const park of [
    { x: 793, y: 773 },
    { x: 1233, y: 1653 },
  ]) {
    rect(park.x, park.y, 254, 254, "#214d48");
    line(park.x, park.y + 254, park.x + 254, park.y, "#a2ae89", 22);
    line(park.x, park.y, park.x + 254, park.y + 254, "#a2ae89", 22);
    circle(park.x + 127, park.y + 127, 32, "#4197a1");
    circle(park.x + 127, park.y + 127, 25, "#7cc5ca");
    for (let k = 0; k < 6; k++) {
      const tx = park.x + 30 + (k % 3) * 95,
        ty = park.y + 35 + Math.floor(k / 3) * 180;
      circle(tx + 3, ty + 5, 17, "#17362c");
      circle(tx, ty, 15, "#527d54");
    }
    ctx.fillStyle = "#d1e5d1";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("GREENWAY", park.x + 127, park.y + 150);
  }
  const colors = ["#345365", "#3d5f65", "#4d4c65", "#535a64", "#445c58"];
  for (const b of buildings) {
    rect(b.x + 14, b.y + 20, b.w, b.h, "#08192265");
    rect(b.x, b.y, b.w, b.h, colors[b.kind]);
    rect(b.x + 8, b.y + 8, b.w - 16, b.h - 16, "#243b49");
    rect(
      b.x + 10,
      b.y + b.h - 13,
      b.w - 20,
      5,
      ["#7be9cc", "#efad6c", "#cbb1e5"][b.seed % 3],
    );
    for (let w = 19; w < b.w - 20; w += 37) {
      rect(b.x + w, b.y + 17, 21, 10, "#86a8af");
      rect(b.x + w, b.y + b.h - 31, 21, 8, "#d9b984");
    }
    rect(b.x + 35, b.y + 50, 66, 46, "#3e5560");
    rect(b.x + 40, b.y + 55, 55, 36, "#243b49");
    circle(b.x + 180, b.y + 145, 23, "#1d303e");
    circle(b.x + 180, b.y + 145, 16, "#415865");
    ctx.fillStyle = "#80969f";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      [
        "STORAGE 04",
        "HARBOR STUDIOS",
        "NIGHT MARKET",
        "NORTH HOTEL",
        "CITY WORKS",
      ][b.kind],
      b.x + b.w / 2,
      b.y + 112,
    );
  }
  // Waterfront rails and warehouse-edge lighting make boundaries legible.
  for (let y = 145; y < 2120; y += 44) {
    circle(2118, y, 3, "#b2e5d6");
    line(2120, y, 2120, y + 28, "#a6c3bf", 3);
  }
  for (const s of stops) {
    circle(s.x, s.y, 8, "#1e6b68");
    ctx.fillStyle = "#92aeb5";
    ctx.font = "9px Arial";
    ctx.textAlign = "center";
    ctx.fillText(s.name.toUpperCase(), s.x, s.y - 35);
  }
}
function drawCar(c, player = false) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.a);
  if (player) {
    const halo = ctx.createRadialGradient(0, 0, 10, 0, 0, 60);
    halo.addColorStop(0, "#62efcc22");
    halo.addColorStop(1, "#62efcc00");
    circle(0, 0, 60, halo);
    ctx.fillStyle = "#f6df9d16";
    ctx.beginPath();
    ctx.moveTo(18, -10);
    ctx.lineTo(110, -35);
    ctx.lineTo(110, 35);
    ctx.lineTo(18, 10);
    ctx.fill();
  }
  rect(-22, -13, 45, 29, "#05101866");
  rect(-17, -14, 12, 4, "#0a1620");
  rect(7, -14, 12, 4, "#0a1620");
  rect(-17, 10, 12, 4, "#0a1620");
  rect(7, 10, 12, 4, "#0a1620");
  rect(
    -23,
    -11,
    45,
    22,
    player ? (c.hit > 0 ? "#fff3bd" : "#69e2c4") : c.color || "#e498b6",
  );
  rect(-11, -9, 20, 18, player ? "#a4ffdc" : "#bdc9c9");
  rect(5, -8, 7, 16, "#183947");
  rect(-13, -8, 6, 16, "#22444d");
  rect(18, -9, 4, 5, "#ffefd1");
  rect(18, 4, 4, 5, "#ffefd1");
  rect(-23, -9, 3, 4, "#ef805c");
  rect(-23, 5, 3, 4, "#ef805c");
  if (player) {
    rect(-4, -2, 5, 4, "#d57e50");
  }
  ctx.restore();
}
function drawRoute() {
  const m = g.mission;
  if (!m) return;
  const target = m.stage === "pickup" ? m.from : m.to,
    points = routeTo(g.car, target),
    color = m.stage === "pickup" ? "#69e2c4" : "#f9bb72";
  ctx.strokeStyle = color + "62";
  ctx.lineWidth = 6;
  ctx.setLineDash([10, 16]);
  ctx.lineDashOffset = -g.time * 14;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  circle(target.x, target.y, 48, color + "18");
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 46 + Math.sin(g.time * 3) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(
    target.x,
    target.y,
    42,
    -Math.PI / 2,
    -Math.PI / 2 + (Math.PI * 2 * m.hold) / 0.75,
  );
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    m.stage === "pickup" ? "PICK UP" : "DELIVER",
    target.x,
    target.y - 60,
  );
}
function drawMap() {
  const size = width < 650 ? 100 : 172,
    x = width - size - 26,
    y =
      height -
      size -
      (width < 650 || matchMedia("(pointer:coarse)").matches ? 122 : 36),
    scale = size / 2300;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#071b29e8";
  ctx.beginPath();
  ctx.roundRect(-10, -10, size + 20, size + 20, 10);
  ctx.fill();
  ctx.strokeStyle = "#45616d";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.scale(scale, scale);
  for (const n of GRID) line(n, 130, n, 2110, "#49616c", 21);
  for (const n of YGRID) line(155, n, 2110, n, "#49616c", 21);
  rect(2130, 0, 170, 2240, "#23667b");
  if (g.mission) {
    const s = g.mission.stage === "pickup" ? g.mission.from : g.mission.to;
    circle(s.x, s.y, 55, "#f3ba77");
  }
  if (g.rival) circle(g.rival.x, g.rival.y, 40, "#e893b2");
  circle(g.car.x, g.car.y, 52, "#80ffe2");
  ctx.restore();
}
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rect(0, 0, width, height, "#0c2635");
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(
    -clamp(cam.x, width / (2 * zoom), WIDTH - width / (2 * zoom)),
    -clamp(cam.y, height / (2 * zoom), HEIGHT - height / (2 * zoom)),
  );
  drawWorld();
  for (const s of g.skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    rect(
      -9,
      -13,
      14,
      3,
      "#0c1727" +
        Math.floor(Math.min(1, s.life / 3) * 140)
          .toString(16)
          .padStart(2, "0"),
    );
    rect(-9, 10, 14, 3, "#0c172780");
    ctx.restore();
  }
  drawRoute();
  for (const t of g.traffic) drawCar(t);
  if (g.rival) drawCar({ ...g.rival, color: "#ed88b6" });
  drawCar(g.car, true);
  for (const p of g.particles)
    circle(p.x, p.y, Math.max(1, p.life * 6), p.color);
  ctx.restore();
  if (mode !== "title") drawMap();
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "#07152255");
  shade.addColorStop(0.25, "#07152200");
  shade.addColorStop(0.8, "#07152200");
  shade.addColorStop(1, "#07152266");
  rect(0, 0, width, height, shade);
}
function updateHud() {
  const c = g.car,
    m = g.mission;
  $("speedValue").textContent = Math.round(Math.hypot(c.vx, c.vy) * 0.42);
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
    $("distance").textContent = Math.round(distance(c, t)) + " m";
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
  const dt = Math.min(0.04, (now - last) / 1000 || 0.016);
  last = now;
  if (mode === "drive") {
    step(g, input, dt);
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
