// 30 challenges + the Sudden Death generator.
// ball: [x, z] (z = metres from the goal line), wall: defenders, keeper: skill 0..1 or null,
// targets: rings on the goal plane {x, y, r, pts}, wind: [wx, wz] m/s^2 acceleration,
// wallMove: {amp, speed}, keeperMove: sway amplitude, balls: kicks, stars: score thresholds.
const T = (x, y, r = 0.55, pts = 150) => ({ x, y, r, pts });
const TL = T(-2.95, 1.9), TR = T(2.95, 1.9), BL = T(-2.95, 0.45), BR = T(2.95, 0.45);

export const LEVELS = [
  // ---- 1-5: learn the flick
  { name: 'First Touch', tip: 'Swipe up from the ball to shoot', ball: [0, 18], balls: 3, stars: [100, 200, 300] },
  { name: 'Pick Your Spot', tip: 'Hit the rings for bonus points', ball: [0, 20], targets: [TL, TR], balls: 3, stars: [100, 400, 650] },
  { name: 'Low And Hard', tip: 'A faster swipe hits it harder', ball: [-4, 19], targets: [BL, BR], balls: 3, stars: [100, 400, 650] },
  { name: 'Meet The Keeper', tip: 'Aim for the corners - away from his hands', ball: [0, 20], keeper: 0.0, balls: 3, stars: [100, 250, 400] },
  { name: 'Bend It', tip: 'Curve your swipe to curl the ball', ball: [0, 21], keeper: 0.1, targets: [T(-2.9, 1.2, 0.6, 150), T(2.9, 1.2, 0.6, 150)], balls: 3, stars: [100, 400, 700] },
  // ---- 6-10: the wall
  { name: 'The Wall', tip: 'Curl it round the wall, or dip it over', ball: [0, 22], wall: 3, balls: 3, stars: [100, 250, 400] },
  { name: 'Over The Top', tip: 'A softer flick lifts it over the wall', ball: [0, 20], wall: 4, keeper: 0.15, balls: 3, stars: [100, 250, 450] },
  { name: 'Left Channel', tip: 'Bend it into the far corner', ball: [-7, 22], wall: 3, keeper: 0.2, targets: [T(2.9, 1.7, 0.6, 150)], balls: 3, stars: [100, 300, 550] },
  { name: 'Right Channel', ball: [7, 22], wall: 3, keeper: 0.25, targets: [T(-2.9, 1.7, 0.6, 150)], balls: 3, stars: [100, 300, 550] },
  { name: 'Five Man Wall', ball: [0, 24], wall: 5, keeper: 0.3, targets: [TL, TR], balls: 3, stars: [100, 300, 600] },
  // ---- 11-15: angles and targets
  { name: 'Tight Angle', tip: 'Wide position - bend it back in', ball: [-14, 16], wall: 2, keeper: 0.3, balls: 3, stars: [100, 250, 450] },
  { name: 'Postage Stamp', ball: [5, 24], wall: 4, keeper: 0.3, targets: [T(-3.05, 2.0, 0.45, 250)], balls: 3, stars: [100, 350, 650] },
  { name: 'Bullseye', ball: [0, 26], wall: 4, keeper: 0.3, targets: [T(0, 2.05, 0.4, 200), T(-2.9, 0.4, 0.5, 150), T(2.9, 0.4, 0.5, 150)], balls: 3, stars: [100, 350, 650] },
  { name: 'Long Range', tip: 'Far out - give it a fast flick', ball: [-3, 30], wall: 4, keeper: 0.35, balls: 3, stars: [100, 300, 500] },
  { name: 'Corner Store', ball: [9, 20], wall: 3, keeper: 0.4, targets: [TL, TR, BL, BR], balls: 4, stars: [100, 450, 850] },
  // ---- 16-20: wind
  { name: 'Breeze', tip: 'Wind pushes the ball - aim into it', ball: [0, 22], wall: 4, keeper: 0.35, wind: [1.4, 0], balls: 3, stars: [100, 250, 450] },
  { name: 'Crosswind', ball: [-6, 23], wall: 4, keeper: 0.4, wind: [-2.0, 0], targets: [T(2.9, 1.8, 0.6, 150)], balls: 3, stars: [100, 300, 550] },
  { name: 'Headwind', tip: 'Into the wind - hit it harder', ball: [0, 26], wall: 4, keeper: 0.4, wind: [0, 2.6], balls: 3, stars: [100, 300, 450] },
  { name: 'Gusts', ball: [6, 24], wall: 4, keeper: 0.45, wind: [2.2, 1.0], targets: [TL], balls: 3, stars: [100, 300, 550] },
  { name: 'Storm Front', ball: [-2, 27], wall: 5, keeper: 0.45, wind: [-2.6, 0.8], targets: [TL, TR], balls: 3, stars: [100, 300, 600] },
  // ---- 21-25: moving walls
  { name: 'Shuffle', tip: 'The wall moves - time your shot', ball: [0, 22], wall: 4, wallMove: { amp: 2.0, speed: 1.4 }, keeper: 0.45, balls: 3, stars: [100, 300, 500] },
  { name: 'Sliding Door', ball: [-5, 23], wall: 5, wallMove: { amp: 2.4, speed: 1.8 }, keeper: 0.5, targets: [T(2.9, 1.0, 0.55, 150)], balls: 3, stars: [100, 300, 550] },
  { name: 'Keeper Dance', ball: [0, 24], wall: 3, keeper: 0.55, keeperMove: 1.2, targets: [TL, TR], balls: 3, stars: [100, 350, 650] },
  { name: 'Rush Hour', ball: [7, 25], wall: 5, wallMove: { amp: 2.0, speed: 2.4 }, keeper: 0.55, wind: [1.2, 0], balls: 3, stars: [100, 300, 500] },
  { name: 'Wall Of Fame', ball: [0, 26], wall: 6, wallMove: { amp: 1.6, speed: 1.2 }, keeper: 0.6, targets: [TL, TR, T(0, 2.05, 0.4, 250)], balls: 4, stars: [100, 450, 850] },
  // ---- 26-30: finals
  { name: 'Quarter Final', ball: [-9, 25], wall: 4, keeper: 0.65, wind: [1.5, 0.5], targets: [TR], balls: 3, stars: [100, 300, 550] },
  { name: 'Semi Final', ball: [4, 28], wall: 5, wallMove: { amp: 1.8, speed: 1.6 }, keeper: 0.7, targets: [T(-3.05, 2.0, 0.45, 250)], balls: 3, stars: [100, 300, 600] },
  { name: 'Thirty Yards', ball: [0, 30], wall: 5, keeper: 0.75, wind: [0, 1.6], balls: 3, stars: [100, 300, 500] },
  { name: 'Hurricane', ball: [-4, 26], wall: 5, keeper: 0.8, wind: [3.0, 0.6], targets: [TL, TR], balls: 3, stars: [100, 300, 600] },
  { name: 'The Final', tip: 'Everything at once. Win it.', ball: [3, 29], wall: 6, wallMove: { amp: 2.0, speed: 1.9 }, keeper: 0.9, keeperMove: 0.6, wind: [-2.2, 1.0], targets: [TL, TR, T(0, 2.05, 0.4, 250)], balls: 5, stars: [100, 450, 900] },
];

// Sudden Death: one miss and it's over. Each goal moves the ball and turns up the heat.
export function suddenDeathSetup(n, seed) {
  let a = (seed * 9301 + n * 49297 + 233280) >>> 0;
  const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const dist = Math.min(32, 18 + n * 0.9 + r() * 4);
  const side = (r() * 2 - 1) * Math.min(12, 2 + n * 0.7);
  const s = {
    name: 'Sudden Death', ball: [Math.round(side * 10) / 10, Math.round(dist * 10) / 10],
    wall: n < 1 ? 0 : Math.min(6, 2 + Math.floor(n / 3)),
    keeper: Math.min(0.85, 0.1 + n * 0.05),
    targets: [],
  };
  if (n >= 5) s.wind = [Math.round((r() * 2 - 1) * Math.min(3, (n - 4) * 0.35) * 10) / 10, Math.round(r() * Math.min(1.2, (n - 4) * 0.15) * 10) / 10];
  if (n >= 8 && r() < 0.6) s.wallMove = { amp: 1.2 + r() * 1.2, speed: 1 + r() * 1.4 };
  if (n >= 3 && r() < 0.35) s.keeperMove = 0.4 + r() * 0.8;
  // one bonus ring each kick
  const spots = [[-2.95, 1.9], [2.95, 1.9], [-2.95, 0.45], [2.95, 0.45], [0, 2.05]];
  const sp = spots[Math.floor(r() * spots.length)];
  s.targets.push({ x: sp[0], y: sp[1], r: sp[0] === 0 ? 0.4 : 0.55, pts: sp[0] === 0 ? 200 : 150 });
  return s;
}
