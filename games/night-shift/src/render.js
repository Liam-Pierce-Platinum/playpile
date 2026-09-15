// ===================== HIGHWAY :: RENDERER =====================
// Pixel art: the world is drawn into a ~460x270 buffer and blitted to the
// screen with smoothing off, so every pixel is a real chunky pixel.
//
// The camera ROTATES to the direction of the road, so the highway always runs
// straight up the screen and curves sweep past the sides. On an endless road a
// fixed world-up camera is unreadable - the road just wanders out of frame.
// The player sits low in the frame so most of the screen is the traffic you
// are about to be threading.

import { carSprite, wheelPositions, drawWheel } from './carart.js';
import { LANE_W } from './track.js';
import { clamp } from './physics.js';

const TARGET_H = 330;
const LOOK_DOWN = 0.29;          // player sits this far below centre, 0..0.5

export class Renderer {
  constructor(canvas, track) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.track = track;
    this.marks = [];
    this.particles = [];
    this.cam = { x: 0, y: 0, ang: 0, zoom: 7.2, shake: 0 };
    this.t = 0;
    this.rt = document.createElement('canvas');
    this.rctx = this.rt.getContext('2d');
    // half-res buffer that every glow is also drawn into, then smeared back
    // over the frame - a real bloom rather than a stack of soft circles
    this.bl = document.createElement('canvas');
    this.blctx = this.bl.getContext('2d');
    this.makeAsphalt();
    this.resize();
  }

  // ---- the road surface ----
  // Flat grey tarmac is what made the whole thing read as a prototype. This is
  // a 128px tile of real aggregate: dark base, speckled stone, a few lighter
  // patches of old repair. Tiled in WORLD space through a canvas pattern, so it
  // slides under the car properly and gives the speed something to bite on.
  makeAsphalt() {
    const N = 128;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N);
    const d = img.data;
    for (let i = 0; i < N * N; i++) {
      const px = i % N, py = (i / N) | 0;
      // clumped grain: two octaves of value noise, so it reads as stone not TV
      const n = hash1(px * 3.1 + py * 7.7) * 0.55
              + hash1(((px / 4) | 0) * 11.3 + ((py / 4) | 0) * 5.9) * 0.45;
      const v = 58 + n * 26;
      d[i * 4] = v; d[i * 4 + 1] = v + 3; d[i * 4 + 2] = v + 9; d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a couple of old patch repairs, slightly darker and softer
    for (let k = 0; k < 3; k++) {
      x.globalAlpha = 0.18;
      x.fillStyle = k % 2 ? '#2f343d' : '#4a5058';
      x.beginPath();
      x.ellipse(hash1(k * 5) * N, hash1(k * 9) * N,
                14 + hash1(k * 3) * 26, 10 + hash1(k * 7) * 18,
                hash1(k) * 3, 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
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
    this.asphalt = this.rctx.createPattern(this.asphaltTile, "repeat");
    this.ctx.imageSmoothingEnabled = false;
  }

  follow(player, dt, roadDir) {
    const k = 1 - Math.pow(0.0009, dt);
    this.cam.x += (player.x - this.cam.x) * k;
    this.cam.y += (player.y - this.cam.y) * k;
    // ease the camera angle onto the road direction
    let d = roadDir - this.cam.ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.cam.ang += d * Math.min(1, dt * 3.4);
    // pull back as you go faster so there is more road to read
    const want = 8.4 - Math.min(2.9, player.speed * 0.040);
    this.cam.zoom += (want - this.cam.zoom) * Math.min(1, dt * 2.0);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 3.2);
  }

  // How far a thing `h` tall leans away from the middle of the screen. Same
  // trick as the lamp posts: it is what makes anything read as standing up.
  ext(sx, sy, h) {
    const d = Math.hypot(sx, sy) || 1;
    const viewR = Math.max(this.vw, this.vh) * 0.5;
    const f = Math.min(1, d / (viewR * 0.42));
    return (Math.min(h, 60) * 0.40 * f) / d;
  }

  draw(scene) {
    const ctx = this.rctx;
    const { player, cars, dt } = scene;
    this.t += dt;
    const z = this.cam.zoom;

    // world -> screen: rotate so the road heading points up the screen
    const A = -this.cam.ang - Math.PI / 2;
    const cosA = Math.cos(A), sinA = Math.sin(A);
    const ox = this.vw / 2 + (Math.random() - 0.5) * this.cam.shake * 6;
    const oy = this.vh * (0.5 + LOOK_DOWN) + (Math.random() - 0.5) * this.cam.shake * 6;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = scene.ground || '#1a2028';
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.setTransform(z * cosA, z * sinA, -z * sinA, z * cosA,
      Math.round(ox), Math.round(oy));
    ctx.translate(-this.cam.x, -this.cam.y);

    // the bloom buffer runs the same world transform at half resolution, so
    // anything drawn into it lands exactly where it does on the main frame
    const B = this.blctx;
    B.setTransform(1, 0, 0, 1, 0, 0);
    B.globalCompositeOperation = 'source-over';
    B.clearRect(0, 0, this.bl.width, this.bl.height);
    B.setTransform(z * cosA * 0.5, z * sinA * 0.5, -z * sinA * 0.5, z * cosA * 0.5,
      Math.round(ox) * 0.5, Math.round(oy) * 0.5);
    B.translate(-this.cam.x, -this.cam.y);
    B.globalCompositeOperation = 'lighter';

    this.toScreen = (wx, wy) => {
      const dx = wx - this.cam.x, dy = wy - this.cam.y;
      return [dx * cosA - dy * sinA, dx * sinA + dy * cosA];
    };

    const sAt = scene.playerS;
    this.drawRoad(ctx, sAt);
    this.drawMarks(ctx);
    if (scene.blocks) this.drawBlocks(ctx, scene.blocks, sAt);
    this.drawScenery(ctx, sAt, false);

    for (const c of cars) this.drawShadow(ctx, c);
    this.drawParticles(ctx, false);
    for (const c of cars) this.drawCar(ctx, c);
    this.drawParticles(ctx, true);
    this.drawScenery(ctx, sAt, true);

    this.lightPass(ctx, scene, z);

    // BLOOM. Everything additive was also drawn into the half-res buffer;
    // smearing it back over the frame twice - once tight, once wide - is what
    // makes headlights and light bars actually glow instead of being pale
    // circles sitting on top of the picture.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.26;
    ctx.drawImage(this.bl, 0, 0, this.vw, this.vh);
    ctx.globalAlpha = 0.16;
    const sp = this.vw * 0.045;
    ctx.drawImage(this.bl, -sp, -sp * 0.6, this.vw + sp * 2, this.vh + sp * 1.2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.speedPass(ctx, scene);

    const d = this.ctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.imageSmoothingEnabled = false;
    d.clearRect(0, 0, this.cv.width, this.cv.height);
    d.drawImage(this.rt, 0, 0, this.vw, this.vh, 0, 0, this.cv.width, this.cv.height);
  }

  // ---- speed, and the state of the car ----
  // The vignette tightens with speed and goes red as the car falls apart, and
  // streaks rake in from the edges once you are genuinely moving. Together
  // they do most of the work of making 200 km/h FEEL like 200 km/h - the road
  // texture alone reads as fast, but nothing tells you how close to the edge
  // you are.
  speedPass(ctx, scene) {
    const kph = scene.player ? scene.player.kph : 0;
    const f = clamp((kph - 105) / 135, 0, 1);
    const dmg = scene.damage || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (f > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(210,228,255,${0.03 + f * 0.055})`;
      ctx.lineWidth = 1;
      const cx = this.vw / 2, cy = this.vh * (0.5 + LOOK_DOWN);
      for (let i = 0; i < 26; i++) {
        const a = hash1(i * 12.9 + Math.floor(this.t * 22) * 0.37) * Math.PI * 2;
        const r0 = this.vh * (0.62 + hash1(i * 3.3) * 0.26);
        const len = this.vh * (0.05 + f * 0.16) * (0.5 + hash1(i * 7.1));
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
      ctx.restore();
    }

    const inner = Math.min(this.vw, this.vh) * (0.40 - f * 0.13);
    const vg = ctx.createRadialGradient(
      this.vw / 2, this.vh * 0.58, inner,
      this.vw / 2, this.vh * 0.58, Math.max(this.vw, this.vh) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(${(dmg * 70) | 0},0,${(dmg * 12) | 0},${0.34 + f * 0.22})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.vw, this.vh);

    // a red pulse across the whole frame when the car is nearly finished
    if (dmg > 0.7) {
      const k = (dmg - 0.7) / 0.3;
      ctx.fillStyle = `rgba(180,20,50,${(0.05 + 0.09 * k) * (0.6 + 0.4 * Math.sin(this.t * 5))})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
  }

  // ---------------- the road ----------------
  bandPath(ctx, pts, off) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const nx = -Math.sin(p.dir), ny = Math.cos(p.dir);
      const x = p.x + nx * off, y = p.y + ny * off;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  // The carriageway as a closed path, so it can be used as a clip region.
  roadClip(pts, halfW) {
    const path = new Path2D();
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const nx = -Math.sin(q.dir), ny = Math.cos(q.dir);
      const x = q.x + nx * -halfW, y = q.y + ny * -halfW;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const q = pts[i];
      const nx = -Math.sin(q.dir), ny = Math.cos(q.dir);
      path.lineTo(q.x + nx * halfW, q.y + ny * halfW);
    }
    path.closePath();
    return path;
  }

  drawRoad(ctx, playerS) {
    const T = this.track;
    const from = playerS - 140, to = playerS + 620;
    const pts = [];
    for (let s = from; s <= to; s += 14) pts.push(T.at(s));
    if (pts.length < 2) return;
    const p0 = pts[Math.min(pts.length - 1, 12)];
    const lanes = p0.lanes, fwd = p0.fwd;
    const halfW = lanes * LANE_W / 2;

    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

    // verge / shoulder
    ctx.strokeStyle = '#2b3038';
    ctx.lineWidth = halfW * 2 + 9;
    this.bandPath(ctx, pts, 0); ctx.stroke();
    // asphalt: flat base, then the aggregate pattern clipped to the road
    ctx.strokeStyle = '#3f454f';
    ctx.lineWidth = halfW * 2;
    this.bandPath(ctx, pts, 0); ctx.stroke();
    if (this.asphalt) {
      ctx.save();
      this.bandPath(ctx, pts, 0);
      ctx.lineWidth = halfW * 2; ctx.strokeStyle = '#000';
      ctx.clip(this.roadClip(pts, halfW));
      ctx.globalAlpha = 0.55;
      // the tile is in pixels; scale it down to a believable stone size
      const S = 0.055;
      ctx.scale(S, S);
      ctx.fillStyle = this.asphalt;
      ctx.fillRect((this.cam.x - 400) / S, (this.cam.y - 400) / S, 800 / S, 800 / S);
      ctx.restore();
    }
    // worn wheel tracks
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = '#4c535e';
    ctx.lineWidth = LANE_W * 0.30;
    for (let l = 0; l < lanes; l++) {
      const lat = T.laneLat(l, lanes);
      this.bandPath(ctx, pts, lat - LANE_W * 0.24); ctx.stroke();
      this.bandPath(ctx, pts, lat + LANE_W * 0.24); ctx.stroke();
    }
    ctx.restore();

    // lane dashes, each one a quad pinned to a fixed distance along the road
    const DASH = 5.5, GAP = 8.5, PITCH = DASH + GAP;
    const dashFrom = Math.floor((playerS - 60) / PITCH) * PITCH;
    ctx.fillStyle = 'rgba(232,238,248,0.62)';
    for (let s = dashFrom; s < playerS + 620; s += PITCH) {
      const a = T.at(s), b = T.at(s + DASH);
      const anx = -Math.sin(a.dir), any = Math.cos(a.dir);
      const bnx = -Math.sin(b.dir), bny = Math.cos(b.dir);
      for (let l = 1; l < lanes; l++) {
        const lat = T.laneLat(l - 0.5, lanes);
        const ax = a.x + anx * lat, ay = a.y + any * lat;
        const bx = b.x + bnx * lat, by = b.y + bny * lat;
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len * 0.22, py = dx / len * 0.22;
        ctx.beginPath();
        ctx.moveTo(ax + px, ay + py); ctx.lineTo(bx + px, by + py);
        ctx.lineTo(bx - px, by - py); ctx.lineTo(ax - px, ay - py);
        ctx.closePath(); ctx.fill();
      }
    }

    // solid yellow down the left edge, the way a one-way carriageway is marked
    ctx.strokeStyle = '#e8c256';
    ctx.lineWidth = 0.34;
    this.bandPath(ctx, pts, -halfW + 1.3); ctx.stroke();
    // edge lines
    ctx.strokeStyle = 'rgba(238,242,250,0.55)';
    ctx.lineWidth = 0.44;
    this.bandPath(ctx, pts, -halfW + 0.7); ctx.stroke();
    this.bandPath(ctx, pts, halfW - 0.7); ctx.stroke();

    // cat's eyes. Small, bright, evenly spaced - they are what your eye locks
    // onto to judge how fast you are actually going.
    const studFrom = Math.floor((playerS - 60) / 16) * 16;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = studFrom; s < playerS + 620; s += 16) {
      const q = T.at(s);
      const nx = -Math.sin(q.dir), ny = Math.cos(q.dir);
      for (let l = 1; l < lanes; l++) {
        const lat = T.laneLat(l - 0.5, lanes);
        const x = q.x + nx * lat, y = q.y + ny * lat;
        const fade = 1 - Math.min(1, (s - playerS) / 420);
        ctx.fillStyle = 'rgba(226,236,255,' + (0.30 + fade * 0.45).toFixed(2) + ')';
        ctx.fillRect(x - 0.16, y - 0.16, 0.32, 0.32);
      }
    }
    ctx.restore();
  }

  // ---------------- roadblocks ----------------
  // Cones and burning flares laid out ahead of the cars, so the block reads as
  // a wall of light long before you can make out the cars themselves - and so
  // the gap in it is obvious enough to aim for at 200 km/h.
  drawBlocks(ctx, blocks, playerS) {
    const T = this.track;
    for (const b of blocks) {
      if (b.s < playerS - 60 || b.s > playerS + 700) continue;
      const p = T.at(b.s);
      const latA = T.laneLat(b.from, p.lanes);
      const latB = T.laneLat(b.to, p.lanes);
      const lo = Math.min(latA, latB) - LANE_W * 0.5;
      const hi = Math.max(latA, latB) + LANE_W * 0.5;

      // A taper of cones running back from the closed lanes, angled so it reads
      // as "move over" rather than "stop" - you are meant to thread past it.
      const openLeft = lo > -T.halfWidth(b.s) + LANE_W;   // which side is open?
      for (let i = 0; i < 14; i++) {
        const k = i / 13;
        const back = b.s - 6 - k * 52;
        // the taper walks from the edge of the block out to the open side
        const edge = openLeft ? lo : hi;
        const push = openLeft ? -k * LANE_W * 0.9 : k * LANE_W * 0.9;
        const w = T.toWorld(back, edge + push);
        ctx.fillStyle = '#e2521c';
        ctx.beginPath(); ctx.arc(w.x, w.y, 0.34, 0, 7); ctx.fill();
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(w.x - 0.32, w.y - 0.09, 0.64, 0.18);
        if (i % 3 === 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const fl = 0.7 + Math.sin(this.t * 11 + i) * 0.25;
          const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, 3.4);
          g.addColorStop(0, `rgba(255,150,60,${0.55 * fl})`);
          g.addColorStop(1, 'rgba(255,90,20,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(w.x, w.y, 3.4, 0, 7); ctx.fill();
          ctx.restore();
        }
      }
      // hatched paint over the closed lanes, so the shut section reads at range
      ctx.save();
      ctx.globalAlpha = 0.30;
      for (let d = 0; d < 26; d += 3.2) {
        const w0 = T.toWorld(b.s - 34 + d, lo);
        const w1 = T.toWorld(b.s - 34 + d + 2.2, hi);
        ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(w0.x, w0.y); ctx.lineTo(w1.x, w1.y); ctx.stroke();
      }
      ctx.restore();
      // and an arrow on the tarmac pointing at the road that is still open
      const aimLat = openLeft ? lo - LANE_W * 1.3 : hi + LANE_W * 1.3;
      const g0 = T.toWorld(b.s - 30, clamp(aimLat, -T.halfWidth(b.s) + 2, T.halfWidth(b.s) - 2));
      ctx.save();
      ctx.translate(g0.x, g0.y); ctx.rotate(p.dir);
      ctx.fillStyle = `rgba(255,214,90,${0.35 + 0.3 * Math.sin(this.t * 6)})`;
      ctx.beginPath();
      ctx.moveTo(3.2, 0); ctx.lineTo(-1.2, -1.7); ctx.lineTo(-1.2, 1.7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---------------- roadside ----------------
  drawScenery(ctx, playerS, tall) {
    const T = this.track;
    const step = 18;
    const from = Math.floor((playerS - 100) / step) * step;
    for (let s = from; s < playerS + 620; s += step) {
      const p = T.at(s);
      const half = p.lanes * LANE_W / 2;
      const key = Math.round(s / step);
      const r = hash1(key);
      for (const side of [-1, 1]) {
        const lat = side * (half + 4.5);
        const w = T.toWorld(s, lat);
        const [sx, sy] = this.toScreen(w.x, w.y);
        if (!tall) {
          // armco: a continuous beam with a post every other step
          const nxt = T.toWorld(s + step, side * (T.at(s + step).lanes * LANE_W / 2 + 4.5));
          ctx.strokeStyle = '#7d8592';
          ctx.lineWidth = 0.42;
          ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(nxt.x, nxt.y); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 0.18;
          ctx.beginPath();
          ctx.moveTo(w.x, w.y + 0.30); ctx.lineTo(nxt.x, nxt.y + 0.30); ctx.stroke();
          if (key % 2 === 0) {
            ctx.fillStyle = '#4a525e';
            ctx.fillRect(w.x - 0.22, w.y - 0.22, 0.44, 0.44);
          }
          continue;
        }
        // lamp mast every other post, leaning away like a real pole
        if ((key + (side > 0 ? 1 : 0)) % 2 === 0) {
          const [bx, by] = this.lean(w.x, w.y, 9);
          // the mast, then a short arm reaching out over the carriageway
          ctx.strokeStyle = '#4a525e'; ctx.lineWidth = 0.4;
          ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(bx, by); ctx.stroke();
          ctx.lineWidth = 0.3;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.lineTo(bx - Math.sin(p.dir) * side * -2.4, by + Math.cos(p.dir) * side * -2.4);
          ctx.stroke();
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, 2.6);
          g.addColorStop(0, 'rgba(255,228,175,0.8)');
          g.addColorStop(1, 'rgba(255,200,130,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, 7); ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#fff2dc';
          ctx.fillRect(bx - 0.55, by - 0.4, 1.1, 0.8);
        }
        // ---- roadside buildings, actually extruded ----
        // A roof quad offset from a footprint quad is not a building - it is two
        // squares. The thing that makes it stand up is the WALLS between them,
        // so every footprint edge gets a filled side face, shaded by which way
        // it points, with a window grid running up it.
        if (r > 0.55) {
          const h = 8 + hash1(key * 7 + side) * 26;
          const bw = 6 + hash1(key * 3 + side) * 9;
          const bl = 8 + hash1(key * 11 + side) * 12;
          const far = T.toWorld(s, lat + side * (7 + bw * 0.5));
          const cs = Math.cos(p.dir), sn = Math.sin(p.dir);
          // footprint corners in world space
          const corner = (u, v) => [
            far.x + cs * u * bl / 2 - sn * v * bw / 2,
            far.y + sn * u * bl / 2 + cs * v * bw / 2,
          ];
          const base = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
          const top = base.map(([wx, wy]) => this.lean(wx, wy, h));

          ctx.fillStyle = 'rgba(0,0,0,0.42)';       // contact shadow
          this.quad(ctx, base);
          const lit = hash1(key * 5 + side) > 0.45;
          for (let e = 0; e < 4; e++) {
            const f = (e + 1) % 4;
            const ex = base[f][0] - base[e][0], ey = base[f][1] - base[e][1];
            // outward normal of this face, in screen space, decides the shade
            const A = -this.cam.ang - Math.PI / 2;
            const nsx = (ey * Math.cos(A) - -ex * Math.sin(A));
            const shadeK = nsx > 0 ? 0.34 : 0.18;
            ctx.fillStyle = `rgba(${(38 + shadeK * 90) | 0},${(45 + shadeK * 95) | 0},${(56 + shadeK * 105) | 0},1)`;
            this.quad(ctx, [base[e], base[f], top[f], top[e]]);
            // windows: rows up the face, columns across it
            const rows = Math.max(2, Math.floor(h / 3.4));
            const cols = Math.max(2, Math.floor(Math.hypot(ex, ey) / 2.6));
            for (let ry = 1; ry < rows; ry++) {
              const t0 = ry / rows, t1 = t0 + 0.42 / rows;
              for (let cx = 0; cx < cols; cx++) {
                const u0 = (cx + 0.28) / cols, u1 = (cx + 0.78) / cols;
                const on = lit && hash1(key * 97 + e * 13 + ry * 7 + cx) > 0.52;
                ctx.fillStyle = on ? 'rgba(255,226,166,0.85)' : 'rgba(14,18,25,0.55)';
                this.quad(ctx, [
                  this.mixQ(base, top, e, f, u0, t0), this.mixQ(base, top, e, f, u1, t0),
                  this.mixQ(base, top, e, f, u1, t1), this.mixQ(base, top, e, f, u0, t1),
                ]);
              }
            }
          }
          ctx.fillStyle = '#4b5563';
          this.quad(ctx, top);
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.28;
          this.quad(ctx, top, true);
          // roof clutter so the tops are not flat grey
          if (hash1(key * 23 + side) > 0.5) {
            const c0 = top[0], c2 = top[2];
            ctx.fillStyle = '#39424f';
            ctx.fillRect((c0[0] + c2[0]) / 2 - 1.4, (c0[1] + c2[1]) / 2 - 1.0, 2.8, 2.0);
          }
          if (h > 26) {                                // aircraft warning light
            const c0 = top[0], c2 = top[2];
            const bx = (c0[0] + c2[0]) / 2, by = (c0[1] + c2[1]) / 2;
            ctx.fillStyle = Math.sin(this.t * 3 + key) > 0
              ? 'rgba(255,70,70,0.95)' : 'rgba(120,30,30,0.6)';
            ctx.fillRect(bx - 0.35, by - 0.35, 0.7, 0.7);
          }
        }
      }
    }
    if (tall) this.drawFurniture(ctx, playerS);
  }

  // Screen-space lean, returned in world coordinates - the one place that
  // conversion happens, so lamp posts, buildings and signs all agree.
  lean(wx, wy, h) {
    const [sx, sy] = this.toScreen(wx, wy);
    const es = this.ext(sx, sy, h);
    const A = -this.cam.ang - Math.PI / 2;
    const lx = sx * es, ly = sy * es;
    return [wx + (lx * Math.cos(-A) - ly * Math.sin(-A)),
            wy + (lx * Math.sin(-A) + ly * Math.cos(-A))];
  }

  quad(ctx, pts, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    stroke ? ctx.stroke() : ctx.fill();
  }

  // A point on face e->f at u across, t up.
  mixQ(base, top, e, f, u, t) {
    const b = [base[e][0] + (base[f][0] - base[e][0]) * u,
               base[e][1] + (base[f][1] - base[e][1]) * u];
    const a = [top[e][0] + (top[f][0] - top[e][0]) * u,
               top[e][1] + (top[f][1] - top[e][1]) * u];
    return [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t];
  }

  // ---- signs, gantries and the rest of the furniture ----
  drawFurniture(ctx, playerS) {
    const T = this.track;
    const step = 160;
    const from = Math.floor((playerS - 60) / step) * step;
    for (let s = from; s < playerS + 620; s += step) {
      const p = T.at(s);
      const half = p.lanes * LANE_W / 2;
      const key = Math.round(s / step);
      const kind = hash1(key * 31);
      // Overhead furniture is drawn above the cars, so a sign gantry sitting
      // over your head hides the one thing you need to see. Fade it out as it
      // passes over you - it still reads as overhead, it just stops blinding
      // you at the exact moment you are threading a gap under it.
      const d = s - playerS;
      const fade = d > 70 ? 1 : Math.max(0.14, (d + 30) / 100);
      ctx.save();
      ctx.globalAlpha = fade;
      if (kind < 0.45) {
        // overhead gantry: two legs and a sign board spanning the carriageway
        const l = T.toWorld(s, -(half + 3)), rgt = T.toWorld(s, half + 3);
        const lt = this.lean(l.x, l.y, 7.5), rt = this.lean(rgt.x, rgt.y, 7.5);
        ctx.strokeStyle = '#525b68'; ctx.lineWidth = 0.45;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(lt[0], lt[1]);
        ctx.moveTo(rgt.x, rgt.y); ctx.lineTo(rt[0], rt[1]); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.save(); ctx.beginPath();
        ctx.moveTo(l.x, l.y); ctx.lineTo(rgt.x, rgt.y);
        ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
        ctx.restore();
        // the board itself
        const bx = (lt[0] + rt[0]) / 2, by = (lt[1] + rt[1]) / 2;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(p.dir);
        const bw2 = Math.hypot(rt[0] - lt[0], rt[1] - lt[1]) / 2;
        ctx.fillStyle = '#14532d';
        ctx.fillRect(-1.6, -bw2 * 0.72, 3.2, bw2 * 1.44);
        ctx.strokeStyle = '#e7ece7'; ctx.lineWidth = 0.16;
        ctx.strokeRect(-1.3, -bw2 * 0.64, 2.6, bw2 * 1.28);
        ctx.fillStyle = 'rgba(231,236,231,0.75)';
        for (let i = -1; i <= 1; i++) ctx.fillRect(-0.5, i * bw2 * 0.34 - 1.1, 0.9, 2.2);
        ctx.restore();
      } else if (kind < 0.72) {
        // a big roadside billboard on one side
        const side = hash1(key * 17) > 0.5 ? 1 : -1;
        const w = T.toWorld(s, side * (half + 11));
        const tp = this.lean(w.x, w.y, 12);
        ctx.strokeStyle = '#4a525e'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
        ctx.save(); ctx.translate(tp[0], tp[1]); ctx.rotate(p.dir);
        const hue = (hash1(key * 41) * 360) | 0;
        ctx.fillStyle = `hsl(${hue},58%,42%)`;
        ctx.fillRect(-1.2, -5, 2.4, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-0.7, -3.6, 1.4, 2.4);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-0.7, 0.2, 1.4, 1.0);
        ctx.fillRect(-0.7, 1.9, 1.4, 1.0);
        ctx.restore();
      } else {
        // trees / scrub bank
        for (let i = 0; i < 5; i++) {
          const side = i % 2 ? 1 : -1;
          const w = T.toWorld(s + i * 9, side * (half + 8 + hash1(key * 7 + i) * 5));
          const tp = this.lean(w.x, w.y, 5 + hash1(key + i) * 3);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.arc(w.x, w.y, 1.5, 0, 7); ctx.fill();
          ctx.fillStyle = i % 3 ? '#24402c' : '#2c4a30';
          ctx.beginPath(); ctx.arc(tp[0], tp[1], 1.8, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // ---------------- cars ----------------
  drawShadow(ctx, c) {
    ctx.save();
    ctx.translate(c.x + 0.3, c.y + 0.4);
    ctx.rotate(c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, c.spec.len * 0.48, c.spec.wid * 0.5, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  drawCar(ctx, c) {
    const spec = c.spec;
    const spr = carSprite(spec);
    const [sx, sy] = this.toScreen(c.x, c.y);
    const es = this.ext(sx, sy, 1.3);
    const A = -this.cam.ang - Math.PI / 2;
    const lx = sx * es, ly = sy * es;
    const bx = c.x + (lx * Math.cos(-A) - ly * Math.sin(-A));
    const by = c.y + (lx * Math.sin(-A) + ly * Math.cos(-A));

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
    // INDICATORS. Traffic signals before it pulls across, and reading those is
    // how you plan a line instead of reacting to one.
    if (c.blink && Math.sin(this.t * 9) > -0.15) {
      const sy = c.blink * spec.wid * 0.40;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,168,30,0.95)';
      ctx.fillRect(spec.len * 0.38, sy - 0.16, 0.34, 0.32);
      ctx.fillRect(-spec.len * 0.48, sy - 0.16, 0.34, 0.32);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------- effects ----------------
  addMark(x0, y0, x1, y1, w, a) {
    this.marks.push({ x0, y0, x1, y1, w, a, life: 5 });
    if (this.marks.length > 1200) this.marks.splice(0, 300);
  }
  drawMarks(ctx) {
    ctx.lineCap = 'round';
    for (const m of this.marks) {
      ctx.strokeStyle = `rgba(12,12,14,${0.5 * m.a})`;
      ctx.lineWidth = m.w;
      ctx.beginPath(); ctx.moveTo(m.x0, m.y0); ctx.lineTo(m.x1, m.y1); ctx.stroke();
    }
  }
  addParticle(p) {
    this.particles.push(p);
    if (this.particles.length > 700) this.particles.splice(0, 200);
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
      const a = Math.max(0, p.life / p.life0) * (p.alpha || 0.5);
      ctx.save();
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  // ---------------- lighting ----------------
  lightPass(ctx, scene, z) {
    // Every light is drawn twice: once onto the frame, once into the half-res
    // bloom buffer, which is then smeared back over the top. Same world
    // transform on both, so they line up exactly.
    this.drawLights(ctx, scene, false);
    this.drawLights(this.blctx, scene, true);
  }

  drawLights(ctx, scene, bloom) {
    ctx.save();
    for (const c of scene.cars) {
      const fx = Math.cos(c.h), fy = Math.sin(c.h);
      if (!bloom) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(c.x, c.y); ctx.rotate(c.h);
      const reach = 18 + Math.min(24, c.speed * 0.55);
      const hc = c.copCar ? '#dff0ff' : '#fff0d4';
      const g = ctx.createLinearGradient(0, 0, reach, 0);
      g.addColorStop(0, hexA(hc, 0.20));
      g.addColorStop(1, hexA(hc, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c.spec.len * 0.4, -c.spec.wid * 0.42);
      ctx.lineTo(reach, -reach * 0.30);
      ctx.lineTo(reach, reach * 0.30);
      ctx.lineTo(c.spec.len * 0.4, c.spec.wid * 0.42);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      }

      // brake lights pooling on the road behind
      if (c.braking && c.speed > 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const bx = c.x - fx * c.spec.len * 0.5, by = c.y - fy * c.spec.len * 0.5;
        const gb = ctx.createRadialGradient(bx, by, 0, bx, by, 4.2);
        gb.addColorStop(0, 'rgba(255,40,50,0.55)');
        gb.addColorStop(1, 'rgba(255,20,40,0)');
        ctx.fillStyle = gb;
        ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, 7); ctx.fill();
        ctx.restore();
      }

      if (c.copCar) {
        const ph = Math.sin(this.t * 9) > 0;
        // the bar throws colour across the tarmac around the car, which is
        // what actually tells you one is on you without looking for the car
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const wash = ph ? 'rgba(255,32,64,' : 'rgba(48,96,255,';
        const gw = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 9);
        gw.addColorStop(0, wash + '0.20)');
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
          g2.addColorStop(0, hexA(col, on ? 0.70 : 0.18));
          g2.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(c.x + dx, c.y + dy, 5.5, 0, 7); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }
}

function hash1(n) {
  const h = Math.sin(n * 127.1) * 43758.5453;
  return h - Math.floor(h);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
