import {
  WORLD,
  DISTRICT_EDGE,
  GRID_X,
  GRID_Y,
  BLOCKS,
  DEPOT,
  VEHICLES,
  target,
  route,
  clamp,
} from "./engine.js";
export function createFallback(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let w = innerWidth,
    h = innerHeight,
    dpr = 1,
    zoom = 1,
    now = 0,
    s,
    currentInput = {};
  const cam = { x: 760, y: 760 };
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  let vignette, vignetteBitmap;
  function rr(x, y, width, height, r = 4) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
  }
  function road() {
    const halfWidth = w / (2 * zoom) + 120, halfHeight = h / (2 * zoom) + 120;
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
    ctx.strokeStyle = "#e0ba71";
    ctx.lineWidth = 3;
    ctx.strokeRect(DISTRICT_EDGE, DISTRICT_EDGE, WORLD.w - 2 * DISTRICT_EDGE, WORLD.h - 2 * DISTRICT_EDGE);
    ctx.fillStyle = "#ffe5b0";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    for (const x of GRID_X) {
      ctx.fillText("DISTRICT LIMIT", x, DISTRICT_EDGE - 7);
      ctx.fillText("DISTRICT LIMIT", x, WORLD.h - DISTRICT_EDGE + 15);
    }
    for (const y of GRID_Y) {
      for (const x of [DISTRICT_EDGE, WORLD.w - DISTRICT_EDGE]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(x === DISTRICT_EDGE ? -Math.PI / 2 : Math.PI / 2);
        ctx.fillText("DISTRICT LIMIT", 0, -7);
        ctx.restore();
      }
    }
    for (const x of GRID_X) {
      if (Math.abs(x - cam.x) > halfWidth) continue;
      for (const y of GRID_Y) {
        if (Math.abs(y - cam.y) > halfHeight) continue;
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
      len = v.length,
      width = v.width;
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
      if (
        currentInput.boost &&
        s.mode === "play" &&
        c.boost > 0 &&
        c.speed > 60
      ) {
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
        { x: t.x, y: t.y, kind: s.job.vehicle, angle: s.job.parkedHeading },
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
    if (vignetteBitmap) ctx.drawImage(vignetteBitmap, 0, 0, w, h);
    else { ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h); }
    if (!reduced) {
      ctx.strokeStyle = "#acdedb17";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let n = 0; n < 65; n++) {
        const x = (n * 173 + now * 48) % w,
          y = (n * 137 + now * 270) % h;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 12);
      }
      ctx.stroke();
    }
  }

  return {
    resize(width, height) {
      w = width;
      h = height;
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      zoom = w < 720 ? 0.73 : Math.min(1.02, w / 1350 + 0.12);
      // The screen-space fade changes on resize only. Limit its cached raster to 16 MiB.
      if (canvas.width * canvas.height <= 4194304 && canvas.ownerDocument) {
        vignetteBitmap ??= canvas.ownerDocument.createElement("canvas");
        vignetteBitmap.width = canvas.width;
        vignetteBitmap.height = canvas.height;
      } else if (vignetteBitmap) {
        vignetteBitmap.width = vignetteBitmap.height = 0;
        vignetteBitmap = null;
      }
      const cachedPaint = vignetteBitmap?.getContext("2d");
      if (!cachedPaint && vignetteBitmap) {
        vignetteBitmap.width = vignetteBitmap.height = 0;
        vignetteBitmap = null;
      }
      const paint = cachedPaint || ctx;
      paint.setTransform(dpr, 0, 0, dpr, 0, 0);
      vignette = paint.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.15,
        w / 2, h * 0.52, Math.max(w, h) * 0.7);
      vignette.addColorStop(0, "transparent");
      vignette.addColorStop(1, "#02131bc9");
      if (cachedPaint) { paint.fillStyle = vignette; paint.fillRect(0, 0, w, h); }
    },
    render(state, time, dt, controls = {}) {
      s = state;
      now = time;
      currentInput = controls;
      cam.x = s.car.x;
      cam.y = s.car.y;
      draw();
    },
  };
}
