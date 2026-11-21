import {
  GRID,
  YGRID,
  WIDTH,
  HEIGHT,
  buildings,
  harborEdge,
  stops,
  clamp,
  routeTo,
} from "./model.js";
export function createCanvasFallback(canvas, g) {
  const ctx = canvas.getContext("2d");
  let width = innerWidth,
    height = innerHeight,
    dpr = 1,
    zoom = 1,
    cam = { x: g.car.x, y: g.car.y };
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
        rect(
          cx,
          cy,
          47,
          43,
          ["#c87c52", "#547c90", "#879c73"][(row + col) % 3],
        );
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
    const { left, right, top, bottom } = harborEdge;
    for (const x of [left, right]) line(x, top, x, bottom, "#ecbd75", 3);
    for (const y of [top, bottom]) line(left, y, right, y, "#ecbd75", 3);
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
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, "#07152255");
    shade.addColorStop(0.25, "#07152200");
    shade.addColorStop(0.8, "#07152200");
    shade.addColorStop(1, "#07152266");
    rect(0, 0, width, height, shade);
  }

  return {
    resize(w, h) {
      width = w;
      height = h;
      dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      zoom = w < 650 ? 0.64 : Math.min(1.08, w / 1200);
    },
    render() {
      cam.x = g.car.x;
      cam.y = g.car.y;
      draw();
    },
  };
}
