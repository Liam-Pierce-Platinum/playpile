// =====================================================================
// DUNK :: kit.js - THE UNIFORM, PAINTED ONTO THE PLAYER
// =====================================================================
//
// Liam: *"so the cloth physics are off"*, and before that *"give them
// basketball shorts and jersey and texture it all very well"*.
//
// The cloth is gone. It was two verlet tubes hanging off the shoulders
// and the waist, and however tight I cut them they bunched: a 700-triangle
// body is 25 cm across the chest, cloth needs a couple of centimetres of
// clearance to move in, and at that ratio every fold is a quarter of the
// torso. It read as a bin bag. That is not a tuning problem, it is the
// wrong technique at this scale - which is why HIGHRISE paints its
// clothes onto the body's own UVs and why this does the same.
//
// WHAT THAT BUYS, other than not looking broken: the kit is exactly on
// the body, it costs nothing per frame, it deforms with the skinning for
// free, and the NUMBER can go where a number goes - on the back, and
// smaller on the front - because the unwrap is known and every island is
// a named rectangle.
//
// THE ISLANDS, from the bake: headFront headBack torsoFront torsoBack
// armR armL legR legL hipsFront hipsBack handR handL footR footL. The
// arms and legs are TUBES projected down the bone, so "a sleeveless
// jersey is the top nothing of the arm" and "shorts are the top 45% of
// the leg" are things you can write down directly.
import ASSET from './assets/refman.js';

const ISL = ASSET.islands;

/** the pixel box an island occupies, in canvas coordinates */
function box(name, S) {
  const I = ISL[name];
  if (!I) return { x: 0, y: 0, w: 0, h: 0 };
  const r = I.rect;
  return { x: r[0] * S, y: (1 - r[3]) * S, w: (r[2] - r[0]) * S, h: (r[3] - r[1]) * S };
}

/**
 * Draw inside one island, clipped to it, in FRACTIONS of that island.
 *
 * (0,0) is its top-left. For an arm or a leg, "top" is the shoulder or
 * the hip end, because the tube projection runs down the bone.
 */
function on(x, S, name, draw) {
  const b = box(name, S);
  if (!b.w) return;
  x.save();
  x.beginPath(); x.rect(b.x, b.y, b.w, b.h); x.clip();
  draw((fx, fy, fw, fh) => [b.x + fx * b.w, b.y + fy * b.h, fw * b.w, fh * b.h], b);
  x.restore();
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return 'rgb(' + c.join(',') + ')';
};

export const SKINS = ['#c99c72', '#a97b52', '#7d5433', '#5a3a24', '#dcb18c', '#8d6142'];
const HAIR = ['#1d1512', '#2b1f18', '#0f0d0c', '#3a2a1c', '#584032'];

/**
 * One player's sheet.
 *
 * 256 across, the same as HIGHRISE's - the head gets a quarter of it,
 * which is about what a character of this era actually had, and it keeps
 * ten of these in memory for nothing.
 */
export function kitSheet(o) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');

  // DEFAULTED, not assumed. A missing hairIndex used to index HAIR with
  // NaN, which returns undefined, which blew up in shade() three hundred
  // lines later with no clue as to why.
  const skin = SKINS[(o.skinIndex | 0) % SKINS.length];
  const hair = HAIR[(o.hairIndex | 0) % HAIR.length];
  const main = o.main;            // the team's shirt
  const trim = o.trim;            // the flash on the collar, the hem, the seams
  const num = String(o.number);

  // ---- everything starts as skin --------------------------------------
  x.fillStyle = skin;
  x.fillRect(0, 0, S, S);

  // ---- the jersey: both torso islands ---------------------------------
  for (const isl of ['torsoFront', 'torsoBack']) {
    const front = isl === 'torsoFront';
    on(x, S, isl, (f) => {
      // the vest itself. It stops just below the collar bone and runs
      // past the waist, and the ARMHOLES are cut out of the sides -
      // which is the detail that makes a basketball jersey a basketball
      // jersey rather than a t-shirt.
      x.fillStyle = main;
      x.fillRect(...f(0.06, 0.16, 0.88, 0.84));
      // shading down both flanks, so the torso reads as round
      const [gx, gy, gw, gh] = f(0.06, 0.16, 0.88, 0.84);
      const grad = x.createLinearGradient(gx, 0, gx + gw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,.34)');
      grad.addColorStop(0.28, 'rgba(255,255,255,.08)');
      grad.addColorStop(0.5, 'rgba(255,255,255,.03)');
      grad.addColorStop(0.72, 'rgba(255,255,255,.08)');
      grad.addColorStop(1, 'rgba(0,0,0,.34)');
      x.fillStyle = grad;
      x.fillRect(gx, gy, gw, gh);

      // the armholes, cut back to skin
      x.fillStyle = skin;
      x.beginPath();
      const [ax, ay, aw, ah] = f(0.02, 0.14, 0.2, 0.34);
      x.ellipse(ax + aw, ay + ah * 0.5, aw * 0.95, ah * 0.6, 0, 0, 7);
      x.fill();
      x.beginPath();
      const [bx2, by2, bw2, bh2] = f(0.78, 0.14, 0.2, 0.34);
      x.ellipse(bx2, by2 + bh2 * 0.5, bw2 * 0.95, bh2 * 0.6, 0, 0, 7);
      x.fill();

      // trim round the collar and the armholes, and a band at the hem
      x.strokeStyle = trim;
      x.lineWidth = Math.max(2, S * 0.012);
      x.beginPath();
      x.ellipse(ax + aw, ay + ah * 0.5, aw * 0.95, ah * 0.6, 0, 0, 7);
      x.stroke();
      x.beginPath();
      x.ellipse(bx2, by2 + bh2 * 0.5, bw2 * 0.95, bh2 * 0.6, 0, 0, 7);
      x.stroke();
      x.fillStyle = trim;
      x.fillRect(...f(0.06, 0.16, 0.88, 0.035));      // shoulder band
      x.fillRect(...f(0.06, 0.93, 0.88, 0.045));       // hem
      x.fillStyle = 'rgba(255,255,255,.6)';
      x.fillRect(...f(0.06, 0.196, 0.88, 0.012));

      // ---- the number --------------------------------------------------
      // Big on the back, smaller on the chest, which is how a vest is
      // actually printed.
      const [tx, ty, tw, th] = f(0.5, front ? 0.42 : 0.5, 1, 1);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const size = (front ? 0.26 : 0.42) * th;
      x.font = 'bold ' + size + 'px system-ui, sans-serif';
      x.lineWidth = Math.max(2, size * 0.1);
      x.strokeStyle = shade(main, 0.5);
      x.strokeText(num, tx, ty);
      x.fillStyle = '#ffffff';
      x.fillText(num, tx, ty);
      x.strokeStyle = trim;
      x.lineWidth = Math.max(1.5, size * 0.055);
      x.strokeText(num, tx, ty);

      // and the team's short name above it on the front
      if (front) {
        x.font = 'bold ' + (0.1 * th) + 'px system-ui, sans-serif';
        x.fillStyle = trim;
        const [nx, ny] = f(0.5, 0.29, 1, 1);
        x.fillText(o.short || '', nx, ny);
      }
    });
  }

  // ---- the shorts: the hips, and the top of each leg -------------------
  for (const isl of ['hipsFront', 'hipsBack']) {
    on(x, S, isl, (f) => {
      x.fillStyle = main;
      x.fillRect(...f(0, 0, 1, 1));
      const [gx, gy, gw, gh] = f(0, 0, 1, 1);
      const grad = x.createLinearGradient(gx, 0, gx + gw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,.32)');
      grad.addColorStop(0.3, 'rgba(255,255,255,.07)');
      grad.addColorStop(0.7, 'rgba(255,255,255,.07)');
      grad.addColorStop(1, 'rgba(0,0,0,.32)');
      x.fillStyle = grad; x.fillRect(gx, gy, gw, gh);
      // the waistband
      x.fillStyle = shade(main, 0.72);
      x.fillRect(...f(0, 0, 1, 0.14));
      x.fillStyle = trim;
      x.fillRect(...f(0, 0.12, 1, 0.035));
      // the side seams
      x.fillStyle = trim;
      x.fillRect(...f(0, 0.14, 0.05, 0.86));
      x.fillRect(...f(0.95, 0.14, 0.05, 0.86));
    });
  }

  // SHORTS RUN DOWN THE THIGH. The leg island is a tube from hip to
  // ankle, so the top 46% of it is above the knee - a basketball short
  // ends just there, with a piped seam down the outside and a hem band.
  for (const isl of ['legR', 'legL']) {
    on(x, S, isl, (f) => {
      x.fillStyle = main;
      x.fillRect(...f(0, 0, 1, 0.46));
      const [gx, gy, gw, gh] = f(0, 0, 1, 0.46);
      const grad = x.createLinearGradient(gx, 0, gx + gw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,.3)');
      grad.addColorStop(0.5, 'rgba(255,255,255,.06)');
      grad.addColorStop(1, 'rgba(0,0,0,.3)');
      x.fillStyle = grad; x.fillRect(gx, gy, gw, gh);
      x.fillStyle = trim;
      x.fillRect(...f(0, 0.42, 1, 0.035));           // the hem band
      x.fillRect(...f(0.46, 0, 0.05, 0.46));          // the outside seam
      // a knee brace on one leg, because kit detail is what sells a kit
      if (o.brace && isl === 'legR') {
        x.fillStyle = '#1b1f26';
        x.fillRect(...f(0, 0.5, 1, 0.1));
      }
      // socks: the bottom sixth of the leg
      x.fillStyle = '#f2f2f0';
      x.fillRect(...f(0, 0.84, 1, 0.16));
      x.fillStyle = trim;
      x.fillRect(...f(0, 0.84, 1, 0.02));
    });
  }

  // ---- the arms: bare, with a shoulder shadow and a wristband ---------
  for (const isl of ['armR', 'armL']) {
    on(x, S, isl, (f) => {
      const [gx, gy, gw, gh] = f(0, 0, 1, 1);
      const grad = x.createLinearGradient(gx, 0, gx + gw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,.28)');
      grad.addColorStop(0.5, 'rgba(255,255,255,.05)');
      grad.addColorStop(1, 'rgba(0,0,0,.28)');
      x.fillStyle = grad; x.fillRect(gx, gy, gw, gh);
      // the jersey's armhole trim wraps a little onto the shoulder
      x.fillStyle = trim;
      x.fillRect(...f(0, 0, 1, 0.04));
      if (o.sleeve) {                                  // a compression sleeve
        x.fillStyle = '#1b1f26';
        x.fillRect(...f(0, 0.06, 1, 0.5));
      }
      x.fillStyle = o.band || trim;                    // wristband
      x.fillRect(...f(0, 0.88, 1, 0.08));
    });
  }

  // ---- shoes ----------------------------------------------------------
  for (const isl of ['footR', 'footL']) {
    on(x, S, isl, (f) => {
      x.fillStyle = '#f4f4f2';
      x.fillRect(...f(0, 0, 1, 1));
      x.fillStyle = trim;
      x.fillRect(...f(0, 0.62, 1, 0.38));
      x.fillStyle = shade('#f4f4f2', 0.86);
      x.fillRect(...f(0, 0.56, 1, 0.06));
      x.strokeStyle = 'rgba(0,0,0,.35)';
      x.lineWidth = Math.max(1, S * 0.004);
      for (let i = 0; i < 4; i++) {
        const [lx, ly, lw] = f(0.24, 0.14 + i * 0.1, 0.52, 0);
        x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx + lw, ly); x.stroke();
      }
    });
  }

  // ---- hands ----------------------------------------------------------
  for (const isl of ['handR', 'handL']) {
    on(x, S, isl, (f) => {
      x.fillStyle = shade(skin, 0.94);
      x.fillRect(...f(0, 0, 1, 1));
      x.strokeStyle = 'rgba(0,0,0,.22)';
      x.lineWidth = Math.max(1, S * 0.003);
      for (let i = 1; i < 4; i++) {
        const [lx, ly, , lh] = f(0.2 + i * 0.2, 0.45, 0, 0.5);
        x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx, ly + lh); x.stroke();
      }
    });
  }

  // ---- the face and the hair ------------------------------------------
  // The head islands are planar projections of the whole head, so the
  // face lives in the middle of the front one and the hair covers the top
  // of BOTH - a cap-shaped blob on the front island only leaves a bald
  // patch at the back, which is exactly what it looks like.
  on(x, S, 'headFront', (f) => {
    // brow shadow
    x.fillStyle = 'rgba(0,0,0,.12)';
    x.fillRect(...f(0.18, 0.3, 0.64, 0.06));
    // eyes
    for (const ex of [0.34, 0.62]) {
      x.fillStyle = '#f6f2e8';
      x.fillRect(...f(ex, 0.38, 0.1, 0.05));
      x.fillStyle = '#22201c';
      x.fillRect(...f(ex + 0.03, 0.385, 0.045, 0.04));
    }
    // brows, nose shadow, mouth
    x.fillStyle = shade(hair, 1);
    x.fillRect(...f(0.32, 0.345, 0.14, 0.022));
    x.fillRect(...f(0.56, 0.345, 0.14, 0.022));
    x.fillStyle = 'rgba(0,0,0,.16)';
    x.fillRect(...f(0.47, 0.42, 0.05, 0.1));
    x.fillStyle = shade(skin, 0.7);
    x.fillRect(...f(0.4, 0.58, 0.2, 0.03));
  });
  for (const isl of ['headFront', 'headBack']) {
    on(x, S, isl, (f) => {
      x.fillStyle = hair;
      x.fillRect(...f(0, 0, 1, isl === 'headFront' ? 0.27 : 0.42));
      // a hairline that is not a straight cut
      x.beginPath();
      const [hx, hy, hw] = f(0, isl === 'headFront' ? 0.27 : 0.42, 1, 0);
      x.moveTo(hx, hy);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        x.lineTo(hx + hw * t, hy + Math.sin(t * Math.PI) * (isl === 'headFront' ? 6 : 3));
      }
      x.lineTo(hx + hw, hy - 20); x.lineTo(hx, hy - 20);
      x.closePath(); x.fill();
    });
  }

  return c;
}
