// ===================== NIGHT SHIFT :: RENDERER =====================
// Same pixel-art top-down look as before, rebuilt for a city.
//
// The camera no longer rotates. On a highway that was right - the road always
// ran up the screen and curves swept past. In a city it is exactly wrong: the
// grid is the thing you navigate by, and a grid that spins is unreadable. North
// is up, always, and you learn the streets.
//
// Buildings keep the lean trick: drawn offset away from the middle of the
// screen in proportion to their height, with the side walls filled in between
// footprint and roof. That is what makes a street feel like a canyon instead of
// a set of grey rectangles.

import { carSprite, wheelPositions, drawWheel } from './carart.js';
import { clamp } from './physics.js';
import { interiorOf, TILE, WATER, PARKS } from './city.js';

const TARGET_H = 330;

export class CityRenderer {
  constructor(canvas, city) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.marks = [];
    this.particles = [];
    this.cam = { x: 0, y: 0, zoom: 5.0, shake: 0 };
    this.t = 0;
    // 0 = midnight, 0.5 = midday. Starts just before dawn, because that is
    // when this sort of thing happens.
    this.tod = 0.18;
    this.rt = document.createElement('canvas');
    this.rctx = this.rt.getContext('2d');
    this.bl = document.createElement('canvas');
    this.blctx = this.bl.getContext('2d');
    this.makeAsphalt();
    this.resize();
  }

  makeAsphalt() {
    const N = 128;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N);
    const d = img.data;
    for (let i = 0; i < N * N; i++) {
      const px = i % N, py = (i / N) | 0;
      const n = h1(px * 3.1 + py * 7.7) * 0.55
              + h1(((px / 4) | 0) * 11.3 + ((py / 4) | 0) * 5.9) * 0.45;
      const v = 54 + n * 26;
      d[i * 4] = v; d[i * 4 + 1] = v + 3; d[i * 4 + 2] = v + 9; d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this.asphaltTile = c;
  }

  resize() {
    const dw = Math.max(320, innerWidth), dh = Math.max(240, innerHeight);
    this.pix = Math.max(2, Math.round(dh / TARGET_H));
    this.vw = Math.ceil(dw / this.pix);
    this.vh = Math.ceil(dh / this.pix);
    this.cv.width = this.vw * this.pix;
    this.cv.height = this.vh * this.pix;
    this.rt.width = this.vw; this.rt.height = this.vh;
    this.bl.width = Math.max(1, this.vw >> 1);
    this.bl.height = Math.max(1, this.vh >> 1);
    this.asphalt = this.rctx.createPattern(this.asphaltTile, 'repeat');
    this.ctx.imageSmoothingEnabled = false;
  }

  follow(target, dt, speed, onFoot) {
    const k = 1 - Math.pow(0.0016, dt);
    // lead the camera in the direction of travel so you see where you are going
    const lead = onFoot ? 2.5 : Math.min(24, speed * 0.62);
    const lx = target.x + Math.cos(target.h) * lead;
    const ly = target.y + Math.sin(target.h) * lead;
    this.cam.x += (lx - this.cam.x) * k;
    this.cam.y += (ly - this.cam.y) * k;
    // on foot you are pulled right in; in a car it opens out with speed
    // A highway needed one lane of context. A city needs a BLOCK: the avenues
    // are 240 m apart, so at the old zoom a single building filled half the
    // screen and you could not see the junction you were about to arrive at.
    // Closer. Wide enough to read the block you are in and the junction you
    // are arriving at, and no wider - at the old framing the city was legible
    // but nothing in it felt near you.
    const want = onFoot ? 10.5 : 5.4 - Math.min(2.0, speed * 0.028);
    this.cam.zoom += (want - this.cam.zoom) * Math.min(1, dt * 2.2);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 3.2);
  }

  ext(sx, sy, h) {
    const d = Math.hypot(sx, sy) || 1;
    const viewR = Math.max(this.vw, this.vh) * 0.5;
    const f = Math.min(1, d / (viewR * 0.40));
    return (Math.min(h, 110) * 0.16 * f) / d;
  }

  lean(wx, wy, h) {
    const sx = wx - this.cam.x, sy = wy - this.cam.y;
    const e = this.ext(sx, sy, h);
    return [wx + sx * e, wy + sy * e];
  }

  // How much daylight there is, 0..1.
  get daylight() {
    const a = Math.cos((this.tod - 0.5) * Math.PI * 2);
    return Math.max(0, Math.min(1, (a + 0.25) / 1.05));
  }

  draw(scene) {
    const ctx = this.rctx;
    if (scene.tod !== undefined) this.tod = scene.tod;
    const { dt } = scene;
    this.t += dt;
    const z = this.cam.zoom;
    const ox = this.vw / 2 + (Math.random() - 0.5) * this.cam.shake * 6;
    const oy = this.vh / 2 + (Math.random() - 0.5) * this.cam.shake * 6;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const L = this.daylight;
    // night is blue-black, day is a flat overcast grey - a city at noon has
    // no shadows worth drawing at this scale
    ctx.fillStyle = mixHex(0x0e1218, 0x3d434c, L);
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.setTransform(z, 0, 0, z, Math.round(ox), Math.round(oy));
    ctx.translate(-this.cam.x, -this.cam.y);

    const B = this.blctx;
    B.setTransform(1, 0, 0, 1, 0, 0);
    B.globalCompositeOperation = 'source-over';
    B.clearRect(0, 0, this.bl.width, this.bl.height);
    B.setTransform(z * 0.5, 0, 0, z * 0.5, Math.round(ox) * 0.5, Math.round(oy) * 0.5);
    B.translate(-this.cam.x, -this.cam.y);
    B.globalCompositeOperation = 'lighter';

    if (scene.interior) this.drawInterior(ctx, scene);
    else this.drawStreets(ctx, scene);

    this.lights(ctx, scene, false);
    this.lights(B, scene, true);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const nite = 1 - this.daylight;
    ctx.globalAlpha = 0.26 * (0.25 + 0.75 * nite);
    ctx.drawImage(this.bl, 0, 0, this.vw, this.vh);
    ctx.globalAlpha = 0.16 * (0.25 + 0.75 * nite);
    const sp = this.vw * 0.045;
    ctx.drawImage(this.bl, -sp, -sp * 0.6, this.vw + sp * 2, this.vh + sp * 1.2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.post(ctx, scene);

    const d = this.ctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.imageSmoothingEnabled = false;
    d.clearRect(0, 0, this.cv.width, this.cv.height);
    d.drawImage(this.rt, 0, 0, this.vw, this.vh, 0, 0, this.cv.width, this.cv.height);
  }

  // ---------------- streets ----------------
  drawStreets(ctx, scene) {
    const C = this.city;
    const R = (Math.max(this.vw, this.vh) / this.cam.zoom) * 0.75 + 60;
    const roads = new Set();
    const c0 = Math.floor((this.cam.x - R) / TILE), c1 = Math.floor((this.cam.x + R) / TILE);
    const d0 = Math.floor((this.cam.y - R) / TILE), d1 = Math.floor((this.cam.y + R) / TILE);
    for (let cx = c0; cx <= c1; cx++)
      for (let cy = d0; cy <= d1; cy++)
        for (const rr of (C.cells.get(cx + ',' + cy) || [])) roads.add(rr);

    // WATER and PARKS go down before anything else. They are the reason the
    // map reads as New York rather than as a grid: the rivers cut the boroughs
    // apart, and Central Park is a green hole in the densest thing on the map.
    for (const w of WATER) {
      ctx.fillStyle = '#0d1a26';
      poly(ctx, w.poly);
      ctx.strokeStyle = 'rgba(90,140,180,0.20)';
      ctx.lineWidth = 1.4; poly(ctx, w.poly, true);
    }
    for (const k of PARKS) {
      ctx.fillStyle = '#1b2a1e';
      poly(ctx, k.poly);
      const B = bounds(k.poly);
      for (let x = B.x0; x < B.x1; x += 26) {
        for (let y = B.y0; y < B.y1; y += 26) {
          const s = h1(x * 0.7 + y * 1.3);
          if (s < 0.45) continue;
          const tx = x + s * 20, ty = y + h1(x + y) * 20;
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.beginPath(); ctx.arc(tx, ty, 3.4, 0, 7); ctx.fill();
          const lp = this.lean(tx, ty, 9);
          ctx.fillStyle = s > 0.72 ? '#27412c' : '#223826';
          ctx.beginPath(); ctx.arc(lp[0], lp[1], 3.8, 0, 7); ctx.fill();
        }
      }
    }

    // tarmac
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const r of roads) {
      ctx.strokeStyle = '#2a2f37';
      ctx.lineWidth = r.w + 5.5;
      line(ctx, r);
    }
    for (const r of roads) {
      ctx.strokeStyle = '#41474f';
      ctx.lineWidth = r.w;
      line(ctx, r);
    }
    // aggregate over the lot, clipped to nothing in particular - the verges are
    // dark enough that the overspill reads as pavement grain
    if (this.asphalt) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      const S = 0.055;
      ctx.scale(S, S);
      ctx.fillStyle = this.asphalt;
      ctx.fillRect((this.cam.x - R) / S, (this.cam.y - R) / S, (R * 2) / S, (R * 2) / S);
      ctx.restore();
    }
    // centre lines, dashed on streets and solid yellow on the avenues
    for (const r of roads) {
      if (r.kind === 'street') {
        ctx.save();
        ctx.strokeStyle = 'rgba(226,232,242,0.34)';
        ctx.lineWidth = 0.24;
        ctx.setLineDash([3.2, 5.4]);
        line(ctx, r);
        ctx.restore();
      } else {
        const big = r.kind === 'artery' || r.kind === 'bridge';
        ctx.strokeStyle = big ? 'rgba(240,206,96,0.68)' : 'rgba(232,194,86,0.55)';
        ctx.lineWidth = big ? 0.34 : 0.26;
        line(ctx, r);
        if (big) {
          ctx.strokeStyle = 'rgba(240,206,96,0.40)';
          ctx.lineWidth = 0.22;
          const nx = -r.uy * 0.9, ny = r.ux * 0.9;
          ctx.beginPath();
          ctx.moveTo(r.x0 + nx, r.y0 + ny); ctx.lineTo(r.x1 + nx, r.y1 + ny); ctx.stroke();
        }
      }
    }

    // THE JOB. Until this is done there is no crime, no scene and no
    // description - so it has to be the most obvious thing on the screen.
    if (scene.job && !scene.job.done) {
      const j = scene.job;
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, 9);
      g.addColorStop(0, 'rgba(255,45,111,' + (0.30 * pulse) + ')');
      g.addColorStop(1, 'rgba(255,45,111,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(j.x, j.y, 9, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,45,111,' + (0.5 + 0.4 * pulse) + ')';
      ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.arc(j.x, j.y, 6.5, 0, 7); ctx.stroke();
      if (j.progress > 0) {
        ctx.strokeStyle = '#ffcf4a';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(j.x, j.y, 6.5, -Math.PI / 2, -Math.PI / 2 + j.progress * Math.PI * 2);
        ctx.stroke();
      }
    }
    this.drawMarks(ctx);
    this.drawParticles(ctx, false);

    // buildings, back to front so the lean stacks correctly
    const bl = scene.buildings;
    for (const b of bl) this.building(ctx, b);

    // kerbside furniture: bins, hydrants, lamp posts. Cheap, and it is what
    // stops every street corner looking like every other street corner.
    this.streetFurniture(ctx, roads);

    for (const c of scene.cars) this.shadow(ctx, c);
    for (const p of scene.people) this.person(ctx, p, '#6e7a8c');
    for (const of2 of scene.officers) {
      if (of2.inside) continue;              // they are in a building, not on the pavement
      of2.gunLen = 0.5;
      this.person(ctx, of2, '#2a3550', true);
    }
    for (const c of scene.cars) this.car(ctx, c);
    if (scene.onFoot) {
      scene.ped.gunLen = scene.gunLen || 0.5;
      this.person(ctx, scene.ped, '#d8dee8', false, true);
    }
    this.drawShots(ctx, scene);
    this.drawParticles(ctx, true);
    this.labels(ctx, scene);
  }

  // Names on the real buildings. You navigate a city by landmarks, and a
  // top-down pixel tower is not recognisable without one.
  labels(ctx, scene) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '700 7px Rajdhani, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const b of scene.buildings) {
      if (!b.landmark || !b._label) continue;
      const t = b._label;
      const wx = (t[0][0] + t[2][0]) / 2, wy = (t[0][1] + t[2][1]) / 2;
      const sx = (wx - this.cam.x) * this.cam.zoom + this.vw / 2;
      const sy = (wy - this.cam.y) * this.cam.zoom + this.vh / 2;
      if (sx < -40 || sx > this.vw + 40 || sy < -20 || sy > this.vh + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(b.name).width;
      ctx.fillRect(sx - w / 2 - 3, sy - 11, w + 6, 10);
      ctx.fillStyle = 'rgba(226,236,250,0.92)';
      ctx.fillText(b.name, sx, sy - 3);
    }
    ctx.restore();
  }

  building(ctx, b) {
    if (b.landmark) return this.landmark(ctx, b);
    return this.plainBuilding(ctx, b);
  }

  // Real buildings, drawn as themselves. Each shape is the plan view of the
  // thing it is: a wedge is a wedge, a setback tower steps in as it climbs,
  // a pencil tower is a pencil.
  landmark(ctx, b) {
    const cs = Math.cos(b.ang), sn = Math.sin(b.ang);
    const corner = (u, v) => [b.x + cs * u - sn * v, b.y + sn * u + cs * v];
    const shell = (fw, fd) => {
      const hu = fw / 2, hv = fd / 2;
      return [corner(-hu, -hv), corner(hu, -hv), corner(hu, hv), corner(-hu, hv)];
    };

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    quad(ctx, shell(b.w, b.d));

    // how many times the plan steps in on the way up, and by how much
    const S = b.shape;
    let tiers;
    if (S === 'setback')      tiers = [[1.00, 0.00], [0.72, 0.42], [0.46, 0.72], [0.24, 0.92]];
    else if (S === 'taper')   tiers = [[1.00, 0.00], [0.78, 0.45], [0.52, 0.80], [0.30, 1.00]];
    else if (S === 'gothic')  tiers = [[1.00, 0.00], [0.80, 0.60], [0.44, 0.86], [0.14, 1.00]];
    else if (S === 'pencil')  tiers = [[1.00, 0.00], [0.92, 0.85], [0.86, 1.00]];
    else if (S === 'slab')    tiers = [[1.00, 0.00], [0.98, 1.00]];
    else if (S === 'diagrid') tiers = [[1.00, 0.00], [0.84, 0.55], [0.70, 1.00]];
    else if (S === 'wedge')   tiers = [[1.00, 0.00], [0.94, 1.00]];
    else if (S === 'drum')    tiers = [[1.00, 0.00], [0.90, 1.00]];
    else if (S === 'hall')    tiers = [[1.00, 0.00], [0.96, 1.00]];
    else if (S === 'statue')  tiers = [[1.00, 0.00], [0.34, 0.30], [0.20, 1.00]];
    else                      tiers = [[1.00, 0.00], [0.85, 1.00]];

    const lit = true;
    for (let t = 0; t < tiers.length - 1; t++) {
      const [w0, k0] = tiers[t], [w1, k1] = tiers[t + 1];
      const lo = shell(b.w * w0, b.d * w0).map(q => this.lean(q[0], q[1], b.h * k0));
      const hi = shell(b.w * w1, b.d * w1).map(q => this.lean(q[0], q[1], b.h * k1));
      for (let e = 0; e < 4; e++) {
        const f = (e + 1) % 4;
        const out = (lo[e][0] + lo[f][0]) / 2 - this.cam.x;
        const sh = out > 0 ? 0.34 : 0.20;
        ctx.fillStyle = "rgb(" + ((36 + sh * 92) | 0) + "," + ((43 + sh * 96) | 0) +
                        "," + ((54 + sh * 108) | 0) + ")";
        quad(ctx, [lo[e], lo[f], hi[f], hi[e]]);
        // windows on the tall faces only; a stadium does not have them
        if (b.floors > 6) {
          const rows = Math.max(2, Math.min(30, Math.round((k1 - k0) * b.floors)));
          const cols = Math.max(2, Math.min(10,
            Math.floor(Math.hypot(lo[f][0] - lo[e][0], lo[f][1] - lo[e][1]) / 2.6)));
          for (let ry = 0; ry < rows; ry++) {
            const a0 = (ry + 0.22) / rows, a1 = (ry + 0.72) / rows;
            for (let cx = 0; cx < cols; cx++) {
              const u0 = (cx + 0.26) / cols, u1 = (cx + 0.76) / cols;
              const on = lit && h1(b.seed + t * 71 + e * 13 + ry * 7 + cx * 3) > 0.5;
              ctx.fillStyle = on ? "rgba(255,226,168,0.85)" : "rgba(10,14,20,0.55)";
              quad(ctx, [mix(lo, hi, e, f, u0, a0), mix(lo, hi, e, f, u1, a0),
                         mix(lo, hi, e, f, u1, a1), mix(lo, hi, e, f, u0, a1)]);
            }
          }
        }
      }
    }
    const cap = tiers[tiers.length - 1];
    const top = shell(b.w * cap[0], b.d * cap[0]).map(q => this.lean(q[0], q[1], b.h * cap[1]));
    ctx.fillStyle = '#525b6b';
    quad(ctx, top);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.26;
    quad(ctx, top, true);

    // aircraft warning on anything that needs one
    if (b.h > 150) {
      const bx = (top[0][0] + top[2][0]) / 2, by = (top[0][1] + top[2][1]) / 2;
      const on = Math.sin(this.t * 2.6 + b.seed) > 0;
      ctx.fillStyle = on ? 'rgba(255,60,60,0.95)' : 'rgba(110,26,26,0.55)';
      ctx.fillRect(bx - 0.5, by - 0.5, 1.0, 1.0);
    }
    this.doorOn(ctx, b);
    b._label = top;
  }

  doorOn(ctx, b) {
    const d = b.door;
    const wdt = b.garage ? b.mouth : 2.6;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(Math.atan2(d.ny, d.nx));
    ctx.fillStyle = b.garage ? '#14181f' : '#20262f';
    ctx.fillRect(-0.5, -wdt / 2, 1.2, wdt);
    ctx.fillStyle = b.shop ? 'rgba(120,255,190,0.75)'
      : b.garage ? 'rgba(255,190,70,0.55)' : 'rgba(255,214,150,0.42)';
    ctx.fillRect(0.4, -wdt / 2, 0.35, wdt);
    if (b.shop) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(1.2, 0, 0, 1.2, 0, 5.5);
      g.addColorStop(0, 'rgba(90,255,190,0.22)');
      g.addColorStop(1, 'rgba(90,255,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(1.2, 0, 5.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  plainBuilding(ctx, b) {
    const cs = Math.cos(b.ang), sn = Math.sin(b.ang);
    const hu = b.w / 2, hv = b.d / 2;
    const corner = (u, v) => [b.x + cs * u - sn * v, b.y + sn * u + cs * v];
    const base = [corner(-hu, -hv), corner(hu, -hv), corner(hu, hv), corner(-hu, hv)];
    const top = base.map(([x, y]) => this.lean(x, y, b.h));

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    quad(ctx, base);

    const lit = h1(b.seed) > 0.35;
    for (let e = 0; e < 4; e++) {
      const f = (e + 1) % 4;
      const ex = base[f][0] - base[e][0], ey = base[f][1] - base[e][1];
      const outward = (base[e][0] + base[f][0]) / 2 - this.cam.x;
      const shade = ey * 0 + (outward > 0 ? 0.30 : 0.18);
      ctx.fillStyle = `rgb(${(34 + shade * 88) | 0},${(40 + shade * 92) | 0},${(50 + shade * 102) | 0})`;
      quad(ctx, [base[e], base[f], top[f], top[e]]);

      const rows = Math.max(2, Math.min(26, Math.floor(b.h / 3.6)));
      const cols = Math.max(2, Math.min(12, Math.floor(Math.hypot(ex, ey) / 3.0)));
      for (let ry = 1; ry < rows; ry++) {
        const t0 = ry / rows, t1 = t0 + 0.42 / rows;
        for (let cx = 0; cx < cols; cx++) {
          const u0 = (cx + 0.26) / cols, u1 = (cx + 0.76) / cols;
          const on = lit && h1(b.seed + e * 13 + ry * 7 + cx * 3) > 0.55;
          ctx.fillStyle = on ? 'rgba(255,224,162,0.80)' : 'rgba(12,16,22,0.55)';
          quad(ctx, [
            mix(base, top, e, f, u0, t0), mix(base, top, e, f, u1, t0),
            mix(base, top, e, f, u1, t1), mix(base, top, e, f, u0, t1),
          ]);
        }
      }
    }
    ctx.fillStyle = b.garage ? '#4a5160' : '#4b5563';
    quad(ctx, top);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.25;
    quad(ctx, top, true);
    if (b.h > 70) {
      const bx = (top[0][0] + top[2][0]) / 2, by = (top[0][1] + top[2][1]) / 2;
      ctx.fillStyle = Math.sin(this.t * 3 + b.seed) > 0
        ? 'rgba(255,70,70,0.95)' : 'rgba(110,26,26,0.6)';
      ctx.fillRect(bx - 0.4, by - 0.4, 0.8, 0.8);
    }

    // THE DOOR. Every building has one and every one of them opens, so it has
    // to be visible from the street without being read as a car. A shop glows.
    this.doorOn(ctx, b);
  }

  streetFurniture(ctx, roads) {
    for (const r of roads) {
      const n = Math.floor(r.len / 34);
      for (let i = 0; i <= n; i++) {
        const t = i / Math.max(1, n);
        const x = r.x0 + r.dx * t, y = r.y0 + r.dy * t;
        const nx = -r.uy, ny = r.ux;
        const side = i % 2 ? 1 : -1;
        const ox = x + nx * side * (r.w / 2 + 2.1);
        const oy = y + ny * side * (r.w / 2 + 2.1);
        const seed = Math.round(ox * 0.7 + oy * 1.3);
        if (h1(seed) < 0.42) {
          const [lx, ly] = this.lean(ox, oy, 8);
          ctx.strokeStyle = '#454c56'; ctx.lineWidth = 0.3;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.fillStyle = '#fff2dc';
          ctx.fillRect(lx - 0.4, ly - 0.3, 0.8, 0.6);
        } else if (h1(seed * 3) < 0.30) {
          // STREET TREES. Every New York pavement has them and they are most of
          // what a street looks like from above - a row of dark canopies with
          // the light coming through between them.
          const th = 5.5 + h1(seed * 7) * 3.5;
          ctx.fillStyle = 'rgba(0,0,0,0.38)';
          ctx.beginPath(); ctx.arc(ox, oy, 1.5, 0, 7); ctx.fill();
          ctx.strokeStyle = '#3a3128'; ctx.lineWidth = 0.26;
          const tp = this.lean(ox, oy, th);
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
          const cr = 1.7 + h1(seed * 11) * 0.9;
          ctx.fillStyle = h1(seed * 13) > 0.5 ? '#25412b' : '#2c4a32';
          ctx.beginPath(); ctx.arc(tp[0], tp[1], cr, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(140,190,140,0.10)';
          ctx.beginPath(); ctx.arc(tp[0] - cr * 0.3, tp[1] - cr * 0.3, cr * 0.5, 0, 7); ctx.fill();
        } else if (h1(seed * 5) < 0.22) {
          // hydrant, bin, or a stack of bags on the kerb
          const k = h1(seed * 17);
          if (k < 0.34) {
            ctx.fillStyle = '#8c3a2e';
            ctx.fillRect(ox - 0.22, oy - 0.22, 0.44, 0.44);
          } else if (k < 0.7) {
            ctx.fillStyle = '#2c3239';
            ctx.fillRect(ox - 0.5, oy - 0.5, 1.0, 1.0);
          } else {
            ctx.fillStyle = '#1c2028';
            ctx.beginPath(); ctx.ellipse(ox, oy, 0.8, 0.55, h1(seed) * 3, 0, 7); ctx.fill();
          }
        }
      }
    }
  }

  // ---------------- interiors ----------------
  // ---------------- interiors ----------------
  // This was still drawing the old single-floor shape - it read it.walls, which
  // no longer exists now that walls live per floor, so it threw on every frame
  // the moment you stepped through a door. The game did not crash, it just
  // stopped drawing, which looks exactly like a freeze.
  drawInterior(ctx, scene) {
    const bl = scene.interior;
    const it = interiorOf(bl);
    const f = scene.floor || 0;
    const plan = it.plan[f];
    if (!plan) return;

    const cs = Math.cos(bl.ang), sn = Math.sin(bl.ang);
    const toW = (u, v) => [bl.x + cs * u - sn * v, bl.y + sn * u + cs * v];

    // floor slab
    ctx.save();
    ctx.translate(bl.x, bl.y); ctx.rotate(bl.ang);
    ctx.fillStyle = '#232832';
    ctx.fillRect(-it.W / 2, -it.D / 2, it.W, it.D);
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let u = -it.W / 2; u < it.W / 2; u += 2.4)
      for (let v = -it.D / 2; v < it.D / 2; v += 2.4)
        if ((((u / 2.4) | 0) + ((v / 2.4) | 0)) % 2 === 0) ctx.fillRect(u, v, 2.4, 2.4);
    ctx.restore();

    // rooms, tinted so you can tell a room from a corridor at a glance
    for (const r of plan.rooms) {
      const a = toW(r.x0, r.y0), b2 = toW(r.x1, r.y0);
      const c2 = toW(r.x1, r.y1), d2 = toW(r.x0, r.y1);
      ctx.fillStyle = r.barricade > 0 ? 'rgba(255,207,74,0.10)' : 'rgba(255,255,255,0.025)';
      quad(ctx, [a, b2, c2, d2]);
    }

    // walls, with enough height to read as walls
    for (const w of plan.walls) {
      const a = toW(w.x0, w.y0), b2 = toW(w.x1, w.y1);
      const a2 = this.lean(a[0], a[1], 3.2);
      const b3 = this.lean(b2[0], b2[1], 3.2);
      ctx.fillStyle = '#39404c';
      quad(ctx, [a, b2, b3, a2]);
      ctx.strokeStyle = '#59616f'; ctx.lineWidth = 0.20;
      ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b3[0], b3[1]); ctx.stroke();
    }

    // a barricaded door: the thing you spent 2.4 seconds on, drawn so you can
    // see it is actually there
    for (const r of plan.rooms) {
      if (r.barricade <= 0) continue;
      const d = r.door;
      const a = toW(d.ax === 'x' ? d.x : d.x - 1.3, d.ax === 'x' ? d.y - 1.3 : d.y);
      const b2 = toW(d.ax === 'x' ? d.x : d.x + 1.3, d.ax === 'x' ? d.y + 1.3 : d.y);
      const a2 = this.lean(a[0], a[1], 2.0), b3 = this.lean(b2[0], b2[1], 2.0);
      ctx.fillStyle = '#7a5a26';
      quad(ctx, [a, b2, b3, a2]);
      ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 0.22;
      ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b3[0], b3[1]); ctx.stroke();
    }

    // the stairs. Every one of them, because on a floor with somebody coming up
    // one you need to know where the other is.
    for (const st of (plan.stairs || [plan.stair])) {
      const p0 = toW(st.x, st.y);
      ctx.save();
      ctx.translate(p0[0], p0[1]); ctx.rotate(bl.ang);
      ctx.fillStyle = '#2c3340';
      ctx.fillRect(-st.r, -st.r, st.r * 2, st.r * 2);
      ctx.fillStyle = 'rgba(180,200,230,0.20)';
      for (let k = -st.r + 0.3; k < st.r - 0.2; k += 0.55) {
        ctx.fillRect(k, -st.r + 0.3, 0.34, st.r * 2 - 0.6);
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], 4.4);
      g.addColorStop(0, 'rgba(150,190,255,0.22)');
      g.addColorStop(1, 'rgba(150,190,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p0[0], p0[1], 4.4, 0, 7); ctx.fill();
      ctx.restore();
    }

    // the ways out, but only on the ground floor - upstairs there are none, and
    // marking doors that do not exist would be a lie
    if (f === 0) {
      for (const [q, col] of [[it.entry, '#3ad6a0'], [it.back, '#ffcf4a']]) {
        const e = toW(q.x, q.y);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(e[0], e[1], 0, e[0], e[1], 3.6);
        g.addColorStop(0, hexA(col, 0.42));
        g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e[0], e[1], 3.6, 0, 7); ctx.fill();
        ctx.restore();
      }
    }

    // ---- fittings ----
    for (const pr of (plan.props || [])) {
      const a = toW(pr.x - pr.w / 2, pr.y - pr.d / 2);
      const b2 = toW(pr.x + pr.w / 2, pr.y - pr.d / 2);
      const c2 = toW(pr.x + pr.w / 2, pr.y + pr.d / 2);
      const d2 = toW(pr.x - pr.w / 2, pr.y + pr.d / 2);
      const hgt = pr.t === 'shelf' ? 1.9 : pr.t === 'chiller' ? 2.1 : 1.0;
      const top = [a, b2, c2, d2].map(q => this.lean(q[0], q[1], hgt));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      quad(ctx, [a, b2, c2, d2]);
      for (let e = 0; e < 4; e++) {
        const f2 = (e + 1) % 4;
        ctx.fillStyle = '#39404c';
        quad(ctx, [[a, b2, c2, d2][e], [a, b2, c2, d2][f2], top[f2], top[e]]);
      }
      ctx.fillStyle = pr.t === 'washer' ? '#5a6472'
        : pr.t === 'chiller' ? '#3d5a66'
        : pr.t === 'counter' ? '#4a4034' : '#4b5260';
      quad(ctx, top);
      if (pr.t === 'washer') {
        // the door of each machine, which is the whole visual of the place
        const cx = (top[0][0] + top[2][0]) / 2, cy = (top[0][1] + top[2][1]) / 2;
        ctx.fillStyle = 'rgba(150,190,220,0.45)';
        ctx.beginPath(); ctx.arc(cx, cy, 0.42, 0, 7); ctx.fill();
      }
      if (pr.t === 'chiller') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = (top[0][0] + top[2][0]) / 2, cy = (top[0][1] + top[2][1]) / 2;
        const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 4);
        g3.addColorStop(0, 'rgba(140,220,255,0.18)');
        g3.addColorStop(1, 'rgba(140,220,255,0)');
        ctx.fillStyle = g3;
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
        ctx.restore();
      }
    }

    // the counter, if this is a shop
    if (bl.shop && f === 0) {
      const ct = toW(0, -it.D / 2 + 3.2);
      const a = toW(-3.0, -it.D / 2 + 2.4), b2 = toW(3.0, -it.D / 2 + 2.4);
      const a2 = this.lean(a[0], a[1], 1.1), b3 = this.lean(b2[0], b2[1], 1.1);
      ctx.fillStyle = '#4a4034';
      quad(ctx, [a, b2, b3, a2]);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(ct[0], ct[1], 0, ct[0], ct[1], 5.5);
      g2.addColorStop(0, 'rgba(120,255,190,0.20)');
      g2.addColorStop(1, 'rgba(120,255,190,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(ct[0], ct[1], 5.5, 0, 7); ctx.fill();
      ctx.restore();
    }

    this.drawParticles(ctx, false);
    for (const of2 of scene.officers) {
      if (of2.inside !== bl || of2.floor !== f) continue;
      of2.gunLen = 0.5;
      this.person(ctx, of2, '#2a3550', true);
    }
    scene.ped.gunLen = scene.gunLen || 0.5;
    this.person(ctx, scene.ped, '#d8dee8', false, true);
    this.drawShots(ctx, scene);
    this.drawParticles(ctx, true);
  }

  // Rounds in flight, drawn as short tracers rather than dots - at 190 m/s a
  // dot is invisible between frames, and you have to be able to see where the
  // fire is coming from.
  drawShots(ctx, scene) {
    if (!scene.bullets) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of scene.bullets) {
      const k = Math.max(0.15, b.life / 0.75);
      ctx.strokeStyle = b.mine
        ? "rgba(255,232,170," + (0.85 * k) + ")"
        : "rgba(255,150,150," + (0.85 * k) + ")";
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.020, b.y - b.vy * 0.020);
      ctx.stroke();
    }
    ctx.restore();
    if (scene.casings) {
      ctx.fillStyle = 'rgba(200,170,90,0.8)';
      for (const s of scene.casings) ctx.fillRect(s.x - 0.06, s.y - 0.06, 0.12, 0.12);
    }
  }

  // ---------------- actors ----------------
  shadow(ctx, c) {
    ctx.save();
    ctx.translate(c.x + 0.3, c.y + 0.4);
    ctx.rotate(c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, c.spec.len * 0.48, c.spec.wid * 0.5, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  car(ctx, c) {
    const spec = c.spec;
    const spr = carSprite(spec);
    const [bx, by] = this.lean(c.x, c.y, 1.3);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(c.h);
    for (const p of wheelPositions(spec)) {
      drawWheel(ctx, spec, p.x, p.y, p.front ? c.steer : 0, c.wheelSpin, null);
    }
    ctx.drawImage(spr.canvas,
      -spec.len / 2 - spr.ox / spr.ppm, -spr.oy / spr.ppm,
      spr.w / spr.ppm, spr.h / spr.ppm);
    if (c.braking) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,50,0.9)';
      ctx.fillRect(-spec.len * 0.48, -spec.wid * 0.40, 0.6, spec.wid * 0.80);
      ctx.restore();
    }
    ctx.restore();
  }

  // A person: a body, a head, and legs that swing. At this size that is all it
  // takes to read as a human rather than a token.
  person(ctx, p, col, cop, isPlayer) {
    if (p.down) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h || 0);
      ctx.fillStyle = 'rgba(60,10,20,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, 1.5, 1.0, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#252c3a';
      ctx.beginPath(); ctx.ellipse(0, 0, 0.85, 0.36, 0, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }
    const [bx, by] = this.lean(p.x, p.y, 1.8);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(p.x + 0.15, p.y + 0.2, 0.5, 0.36, 0, 0, 7); ctx.fill();
    ctx.translate(bx, by);
    ctx.rotate(p.h || 0);
    const sw = Math.sin((p.step || 0) * 3.2) * 0.26 * Math.min(1, (p.speed || 0) / 2.5);
    ctx.fillStyle = '#1a1e26';
    ctx.fillRect(-0.15, -0.34 + sw, 0.42, 0.20);
    ctx.fillRect(-0.15, 0.14 - sw, 0.42, 0.20);
    // BUILD and CLOTHING, drawn - because they are the two things the police
    // will be asking people about, and a description of something you cannot
    // see on screen is not a description.
    const bw = p.build === undefined ? 1 : p.build;
    ctx.fillStyle = p.coat || col;
    ctx.beginPath(); ctx.ellipse(0, 0, 0.42 * bw, 0.30 * bw, 0, 0, 7); ctx.fill();
    if (p.bag) {
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(-0.30, 0.16 * bw, 0.30, 0.24);
    }
    if (cop) {
      ctx.fillStyle = '#dbe3ef';
      ctx.fillRect(-0.1, -0.30, 0.24, 0.60);
    }
    ctx.fillStyle = isPlayer ? '#f0e2c6' : (p.skin || '#c9b79c');
    ctx.beginPath(); ctx.arc(0.10, 0, 0.20 * bw, 0, 7); ctx.fill();
    // hair, or a mask, which is the point of wearing one
    ctx.fillStyle = p.masked ? '#14161c' : (p.hair || '#2a2018');
    ctx.beginPath(); ctx.arc(0.04, 0, 0.17 * bw, 0, 7); ctx.fill();
    // THE WEAPON, held out front. At this size it is three pixels, but three
    // pixels is the difference between a pedestrian and somebody armed - and
    // that is a distinction you need to make at a glance.
    if (p.gunLen) {
      ctx.fillStyle = '#1c2029';
      ctx.fillRect(0.22, -0.09, p.gunLen, 0.18);
      ctx.fillStyle = '#3a424f';
      ctx.fillRect(0.22, -0.05, p.gunLen * 0.55, 0.10);
    }
    ctx.restore();
  }

  // ---------------- lights ----------------
  lights(ctx, scene, bloom) {
    ctx.save();
    for (const c of scene.cars) {
      const fx = Math.cos(c.h), fy = Math.sin(c.h);
      if (!bloom && c.speed > -1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(c.x, c.y); ctx.rotate(c.h);
        const reach = 14 + Math.min(20, Math.abs(c.speed) * 0.5);
        const hc = c.copCar ? '#dff0ff' : '#fff0d4';
        const g = ctx.createLinearGradient(0, 0, reach, 0);
        g.addColorStop(0, hexA(hc, 0.18));
        g.addColorStop(1, hexA(hc, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(c.spec.len * 0.4, -c.spec.wid * 0.42);
        ctx.lineTo(reach, -reach * 0.34);
        ctx.lineTo(reach, reach * 0.34);
        ctx.lineTo(c.spec.len * 0.4, c.spec.wid * 0.42);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (c.braking && Math.abs(c.speed) > 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const bx = c.x - fx * c.spec.len * 0.5, by = c.y - fy * c.spec.len * 0.5;
        const gb = ctx.createRadialGradient(bx, by, 0, bx, by, 3.6);
        gb.addColorStop(0, 'rgba(255,40,50,0.5)');
        gb.addColorStop(1, 'rgba(255,20,40,0)');
        ctx.fillStyle = gb;
        ctx.beginPath(); ctx.arc(bx, by, 3.6, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (c.copCar) {
        const ph = Math.sin(this.t * 9) > 0;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const wash = ph ? 'rgba(255,32,64,' : 'rgba(48,96,255,';
        const gw = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 9);
        gw.addColorStop(0, wash + '0.22)');
        gw.addColorStop(1, wash + '0)');
        ctx.fillStyle = gw;
        ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, 7); ctx.fill();
        ctx.restore();
        const nx = -fy, ny = fx;
        for (const [dx, dy, on] of [[nx, ny, ph], [-nx, -ny, !ph]]) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const col = on ? '#ff2040' : '#3060ff';
          const g2 = ctx.createRadialGradient(c.x + dx, c.y + dy, 0, c.x + dx, c.y + dy, 5.5);
          g2.addColorStop(0, hexA(col, on ? 0.7 : 0.18));
          g2.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(c.x + dx, c.y + dy, 5.5, 0, 7); ctx.fill();
          ctx.restore();
        }
      }
    }
    // torches on the officers who are out on foot, sweeping as they run
    for (const f of scene.officers) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y);
      ctx.rotate((f.h || 0) + Math.sin(this.t * 2.2 + f.x) * 0.28);
      const g = ctx.createLinearGradient(0, 0, 15, 0);
      g.addColorStop(0, 'rgba(220,238,255,0.20)');
      g.addColorStop(1, 'rgba(200,225,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0.4, -0.3); ctx.lineTo(15, -4.6); ctx.lineTo(15, 4.6); ctx.lineTo(0.4, 0.3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  post(ctx, scene) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const kph = scene.speedKph || 0;
    const f = clamp((kph - 60) / 150, 0, 1);
    const dmg = scene.damage || 0;
    const inner = Math.min(this.vw, this.vh) * (0.42 - f * 0.12);
    const vg = ctx.createRadialGradient(
      this.vw / 2, this.vh / 2, inner,
      this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    // the frame closes in harder at night, and barely at all at noon
    const dark = (0.36 + f * 0.20) * (0.35 + 0.65 * (1 - this.daylight));
    vg.addColorStop(1, "rgba(" + ((dmg * 70) | 0) + ",0," + ((dmg * 12) | 0) +
                       "," + dark + ")");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.vw, this.vh);

    // out of sight: the picture cools right down. It is the clearest possible
    // signal that you are no longer being looked at.
    if (scene.hiddenGlow > 0) {
      ctx.fillStyle = `rgba(20,60,90,${0.10 * scene.hiddenGlow})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    if (scene.hurt > 0) {
      ctx.fillStyle = "rgba(150,10,30," + (0.34 * (scene.hurt / 0.55)) + ")";
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    if (dmg > 0.7) {
      const k = (dmg - 0.7) / 0.3;
      ctx.fillStyle = `rgba(180,20,50,${(0.05 + 0.09 * k) * (0.6 + 0.4 * Math.sin(this.t * 5))})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
  }

  // ---------------- bits ----------------
  addMark(x0, y0, x1, y1, w, a) {
    this.marks.push({ x0, y0, x1, y1, w, a, life: 5 });
    if (this.marks.length > 900) this.marks.splice(0, 300);
  }
  drawMarks(ctx) {
    ctx.lineCap = 'round';
    for (const m of this.marks) {
      ctx.strokeStyle = `rgba(18,20,24,${m.a * Math.min(1, m.life / 5)})`;
      ctx.lineWidth = m.w;
      ctx.beginPath(); ctx.moveTo(m.x0, m.y0); ctx.lineTo(m.x1, m.y1); ctx.stroke();
    }
  }
  addParticle(p) {
    this.particles.push(p);
    if (this.particles.length > 600) this.particles.splice(0, 200);
  }
  stepParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * (p.drag || 1.4);
      p.vy *= 1 - dt * (p.drag || 1.4);
      p.r += (p.grow || 3) * dt;
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].life -= dt;
      if (this.marks[i].life <= 0) this.marks.splice(i, 1);
    }
  }
  drawParticles(ctx, front) {
    for (const p of this.particles) {
      if (!!p.front !== front) continue;
      ctx.save();
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, p.life / p.life0) * (p.alpha || 0.5);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      ctx.restore();
    }
  }
}

function poly(ctx, pts, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  stroke ? ctx.stroke() : ctx.fill();
}
function bounds(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of pts) {
    if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
    if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
  }
  return { x0, y0, x1, y1 };
}
function line(ctx, r) {
  ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x1, r.y1); ctx.stroke();
}
function quad(ctx, pts, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  stroke ? ctx.stroke() : ctx.fill();
}
function mix(base, top, e, f, u, t) {
  const b = [base[e][0] + (base[f][0] - base[e][0]) * u,
             base[e][1] + (base[f][1] - base[e][1]) * u];
  const a = [top[e][0] + (top[f][0] - top[e][0]) * u,
             top[e][1] + (top[f][1] - top[e][1]) * u];
  return [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t];
}
// Blend two packed hex colours. Used for the sky, which is the one thing on
// screen that has to change smoothly across twenty minutes.
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return "rgb(" + ((ar + (br - ar) * t) | 0) + "," +
                  ((ag + (bg - ag) * t) | 0) + "," +
                  ((ab + (bb - ab) * t) | 0) + ")";
}

function h1(n) {
  const h = Math.sin(n * 127.1) * 43758.5453;
  return h - Math.floor(h);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
