// ===================== HIGHWAY :: THE TRACK =====================
// An endless road. The centreline is generated ahead of the player in short
// steps and thrown away behind, so the road never ends and memory never grows.
//
// Everything in the game is positioned in TRACK SPACE - a distance `s` along
// the centreline and a lateral offset - and converted to world coordinates for
// drawing. That is what makes lanes, traffic spawning, overtaking and the
// "how far have I got" score all trivial.

export const LANE_W = 3.7;              // metres
const STEP = 14;                        // centreline spacing
const AHEAD = 1400;                     // how far to keep generated
const BEHIND = 320;                     // how far to keep behind the player

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Track {
  constructor(seed) {
    this.rng = mulberry(seed || (Math.random() * 1e9) | 0);
    this.reset();
  }

  reset() {
    this.pts = [];
    this.head = { x: 0, y: 0, dir: -Math.PI / 2, s: 0 };  // heading "north"
    this.curv = 0;
    this.curvTarget = 0;
    this.nextChange = 240;
    this.lanes = 5;
    this.fwd = this.lanes;              // ALL lanes run one way - no oncoming
    this.nextLaneChange = 900;
    this.base = 0;                      // s of pts[0]
    this.pts.push({ ...this.head, lanes: this.lanes, fwd: this.fwd });
    this.ensure(AHEAD);
  }

  // Extend the centreline until it reaches `sMax`.
  ensure(sMax) {
    const R = this.rng;
    while (this.head.s < sMax) {
      // Curvature is a smoothed random walk with occasional straights, so the
      // road reads as a real highway rather than a sine wave.
      if (this.head.s > this.nextChange) {
        const straight = R() < 0.30;
        this.curvTarget = straight ? 0 : (R() - 0.5) * 0.0125;
        this.nextChange = this.head.s + 180 + R() * 320;
      }
      if (this.head.s > this.nextLaneChange) {
        this.lanes = 4 + ((R() * 3) | 0);          // 4..6
        this.fwd = this.lanes;
        this.nextLaneChange = this.head.s + 700 + R() * 900;
      }
      this.curv += (this.curvTarget - this.curv) * 0.055;
      this.head.dir += this.curv * STEP;
      this.head.x += Math.cos(this.head.dir) * STEP;
      this.head.y += Math.sin(this.head.dir) * STEP;
      this.head.s += STEP;
      this.pts.push({
        x: this.head.x, y: this.head.y, dir: this.head.dir, s: this.head.s,
        lanes: this.lanes, fwd: this.fwd,
      });
    }
  }

  // Drop what is behind so the array does not grow forever.
  cull(sMin) {
    let drop = 0;
    while (drop < this.pts.length - 2 && this.pts[drop].s < sMin - BEHIND) drop++;
    if (drop > 0) { this.pts.splice(0, drop); this.base = this.pts[0].s; }
  }

  follow(s) { this.ensure(s + AHEAD); this.cull(s); }

  indexFor(s) {
    const i = Math.floor((s - this.pts[0].s) / STEP);
    return Math.max(0, Math.min(this.pts.length - 2, i));
  }

  // Centreline position and heading at distance s.
  at(s) {
    const i = this.indexFor(s);
    const a = this.pts[i], b = this.pts[i + 1];
    const t = Math.max(0, Math.min(1, (s - a.s) / STEP));
    let dd = b.dir - a.dir;
    while (dd > Math.PI) dd -= Math.PI * 2;
    while (dd < -Math.PI) dd += Math.PI * 2;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      dir: a.dir + dd * t,
      lanes: a.lanes, fwd: a.fwd,
    };
  }

  // World position of a point at distance s, offset sideways by `lat` metres.
  toWorld(s, lat) {
    const p = this.at(s);
    const nx = -Math.sin(p.dir), ny = Math.cos(p.dir);
    return { x: p.x + nx * lat, y: p.y + ny * lat, dir: p.dir };
  }

  // Lateral offset of the centre of a lane. Lane 0 is the leftmost of your
  // direction; lanes >= fwd are oncoming.
  laneLat(lane, lanes) {
    const n = lanes || this.lanes;
    return (lane - (n - 1) / 2) * LANE_W;
  }

  halfWidth(s) {
    const p = this.at(s);
    return p.lanes * LANE_W / 2;
  }

  // Where is this world point on the track? `hint` is the last known s, which
  // keeps this to a short local search instead of scanning the whole road.
  project(x, y, hint) {
    const start = this.indexFor(hint === undefined ? this.pts[0].s : hint);
    let bi = start, bd = Infinity;
    const lo = Math.max(0, start - 8), hi = Math.min(this.pts.length - 2, start + 24);
    for (let i = lo; i <= hi; i++) {
      const dx = x - this.pts[i].x, dy = y - this.pts[i].y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    const a = this.pts[bi], b = this.pts[bi + 1];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((x - a.x) * ex + (y - a.y) * ey) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + ex * t, py = a.y + ey * t;
    let dd = b.dir - a.dir;
    while (dd > Math.PI) dd -= Math.PI * 2;
    while (dd < -Math.PI) dd += Math.PI * 2;
    const dir = a.dir + dd * t;
    // signed lateral: positive to the right of the direction of travel
    const nx = -Math.sin(dir), ny = Math.cos(dir);
    const lat = (x - px) * nx + (y - py) * ny;
    return { s: a.s + STEP * t, lat, dir, lanes: a.lanes, fwd: a.fwd };
  }

  // Is this lateral offset still on the tarmac?
  onRoad(s, lat) {
    return Math.abs(lat) <= this.halfWidth(s) + 0.6;
  }
}
