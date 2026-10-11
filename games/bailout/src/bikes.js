// The six bikes (genuinely different physics) and the cosmetic helmets/suits.
// Units: px, seconds, y-down. Chassis-local coordinates: +x forward, +y down,
// origin at the chassis centre of mass.

const base = {
  mass: 2.0, inertia: 1500, wheelMass: 0.45,
  k: 300, damp: 18, sRest: 4, sMin: -12, sMax: 7,
  torque: 52000, vmax: 780, rev: 240, brake: 70000,
  airAcc: 44, airMax: 11.5, airDamp: 1.4, groundLean: 4,
  grip: 1.2, react: 0.2,
  thrust: 0, pedal: false,
  hull: [{ x: 0, y: 12, r: 7 }, { x: -26, y: 4, r: 6 }, { x: 24, y: 0, r: 6 }],
  rider: { seat: [-10, -17], peg: [-2, 6], bar: [21, -27], crouch: 0 },
};

export const BIKES = [
  Object.assign({}, base, {
    id: 'dirt', name: 'Dirt Bike', price: 0, style: 'dirt', color: '#e8433a', color2: '#ffd23f',
    desc: 'Balanced all-rounder. Grippy, quick to flip, lands soft.',
    wheels: [{ x: -33, y: 21, r: 17, drive: true, axis: [0, 1] }, { x: 35, y: 21, r: 17, drive: false, axis: [0.4, 0.92] }],
    stats: { speed: 3, flip: 3, grip: 3, stable: 3 },
  }),
  Object.assign({}, base, {
    id: 'chopper', name: 'Chopper', price: 250, style: 'chopper', color: '#2b2b3d', color2: '#ff8a1f',
    desc: 'Long and heavy. Hard to tip over, slow to flip, cruises fast.',
    mass: 2.6, inertia: 3400, torque: 64000, vmax: 820, airAcc: 26, airMax: 7.6, airDamp: 2.2, k: 340, damp: 24, grip: 1.25, react: 0.18,
    wheels: [{ x: -44, y: 20, r: 18, drive: true, axis: [0, 1] }, { x: 50, y: 20, r: 18, drive: false, axis: [0.62, 0.78] }],
    hull: [{ x: 0, y: 12, r: 7 }, { x: -34, y: 2, r: 6 }, { x: 30, y: -2, r: 6 }],
    rider: { seat: [-16, -12], peg: [8, 4], bar: [18, -34], crouch: -0.3 },
    stats: { speed: 4, flip: 1, grip: 4, stable: 5 },
  }),
  Object.assign({}, base, {
    id: 'mini', name: 'Mini-Moto', price: 450, style: 'mini', color: '#36c46a', color2: '#ffffff',
    desc: 'Tiny and twitchy. Flips like a coin, but top speed is low.',
    mass: 1.5, inertia: 760, wheelMass: 0.35, torque: 36000, vmax: 700, airAcc: 62, airMax: 15.5, airDamp: 1.0, k: 230, damp: 13, grip: 1.15, react: 0.45,
    wheels: [{ x: -25, y: 17, r: 13, drive: true, axis: [0, 1] }, { x: 26, y: 17, r: 13, drive: false, axis: [0.35, 0.94] }],
    hull: [{ x: 0, y: 9, r: 6 }, { x: -20, y: 3, r: 5 }, { x: 18, y: 0, r: 5 }],
    rider: { seat: [-8, -13], peg: [-2, 5], bar: [16, -22], crouch: 0.2 },
    stats: { speed: 2, flip: 5, grip: 3, stable: 1 },
  }),
  Object.assign({}, base, {
    id: 'bmx', name: 'BMX', price: 700, style: 'bmx', color: '#2d7fe0', color2: '#ffd23f', pedal: true,
    desc: 'No engine. Pedal hard, then ride gravity. Very light, very flippy.',
    mass: 1.2, inertia: 700, wheelMass: 0.3, torque: 30000, vmax: 470, airAcc: 50, airMax: 13.5, airDamp: 1.0, k: 260, damp: 12, sMin: -7, sMax: 4, grip: 1.1, react: 0.15,
    wheels: [{ x: -30, y: 18, r: 16, drive: true, axis: [0, 1] }, { x: 31, y: 18, r: 16, drive: false, axis: [0.3, 0.95] }],
    hull: [{ x: 0, y: 6, r: 6 }, { x: -22, y: 6, r: 5 }, { x: 22, y: -2, r: 5 }],
    rider: { seat: [-8, -14], peg: [0, 6], bar: [20, -26], crouch: 0.3 },
    stats: { speed: 1, flip: 4, grip: 2, stable: 2 },
  }),
  Object.assign({}, base, {
    id: 'quad', name: 'Quad', price: 1000, style: 'quad', color: '#ffb31f', color2: '#1b1b2a',
    desc: 'Four fat wheels and all-wheel drive. Sticks to anything, flips like a fridge.',
    mass: 3.2, inertia: 4200, wheelMass: 0.6, torque: 82000, vmax: 750, airAcc: 15, airMax: 5.6, airDamp: 2.6, k: 420, damp: 30, grip: 1.6, react: 0.1, groundLean: 2,
    wheels: [{ x: -32, y: 20, r: 20, drive: true, axis: [0, 1] }, { x: 34, y: 20, r: 20, drive: true, axis: [0, 1] }],
    hull: [{ x: 0, y: 10, r: 8 }, { x: -36, y: 0, r: 7 }, { x: 36, y: -2, r: 7 }],
    rider: { seat: [-10, -18], peg: [0, 4], bar: [18, -28], crouch: 0 },
    stats: { speed: 3, flip: 1, grip: 5, stable: 5 },
  }),
  Object.assign({}, base, {
    id: 'rocket', name: 'Rocket Bike', price: -1, style: 'rocket', color: '#b04ae8', color2: '#2ef2ff',
    desc: 'Gold every level to unlock. Gas also fires a rocket. Absurdly fast.',
    torque: 60000, vmax: 1000, thrust: 800, airAcc: 46, airMax: 12.5,
    wheels: [{ x: -34, y: 21, r: 16, drive: true, axis: [0, 1] }, { x: 36, y: 21, r: 16, drive: false, axis: [0.45, 0.89] }],
    stats: { speed: 5, flip: 4, grip: 3, stable: 3 },
  }),
];
export const BIKE = Object.fromEntries(BIKES.map((b) => [b.id, b]));

export const HELMETS = [
  { id: 'classic', name: 'Classic', c1: '#e8433a', c2: '#ffffff', pat: 'stripe', price: 0 },
  { id: 'flames', name: 'Hot Rod', c1: '#2b2b3d', c2: '#ff8a1f', pat: 'flames', price: 150 },
  { id: 'shark', name: 'Shark', c1: '#8fa6bd', c2: '#ffffff', pat: 'teeth', price: 250 },
  { id: 'star', name: 'Stunt Star', c1: '#2d5bd8', c2: '#ffd23f', pat: 'star', price: 350 },
  { id: 'checker', name: 'Finish Line', c1: '#ffffff', c2: '#1b1b2a', pat: 'checker', price: 450 },
  { id: 'chrome', name: 'Chrome Dome', c1: '#dfe6ef', c2: '#8a98ab', pat: 'chrome', price: 700 },
  { id: 'gold', name: 'Solid Gold', c1: '#ffc629', c2: '#fff0a0', pat: 'chrome', price: 1200 },
];
export const SUITS = [
  { id: 'rookie', name: 'Rookie', c1: '#2d7fe0', c2: '#ffd23f', price: 0 },
  { id: 'daredevil', name: 'Daredevil', c1: '#f4f1ea', c2: '#e8433a', price: 150 },
  { id: 'toxic', name: 'Toxic', c1: '#7ee04a', c2: '#2b2b3d', price: 250 },
  { id: 'ninja', name: 'Night Rider', c1: '#34344a', c2: '#ff3dbb', price: 350 },
  { id: 'tiger', name: 'Tiger', c1: '#ff8a1f', c2: '#2b2b3d', price: 450 },
  { id: 'royal', name: 'Royal', c1: '#7a3fd0', c2: '#ffc629', price: 700 },
];
export const HELMET = Object.fromEntries(HELMETS.map((h) => [h.id, h]));
export const SUIT = Object.fromEntries(SUITS.map((s) => [s.id, s]));

// Rider skeleton in chassis-local space. lean: -1 (back) .. +1 (forward).
// Returns joint positions; head is the big helmet centre.
export function riderPose(spec, lean, out = {}) {
  const r = spec.rider;
  const [sx, sy] = r.seat, [px, py] = r.peg, [bx, by] = r.bar;
  const L = lean + r.crouch;
  const pel = [sx + L * 3, sy - 4];
  const neck = [pel[0] + 10 + L * 11, pel[1] - 25 + Math.abs(L) * 4 + (L > 0 ? L * 3 : 0)];
  const head = [neck[0] + 4 + L * 4, neck[1] - 14];
  const foot = [px, py];
  // knee pushed forward and up between hip and foot
  const knee = [(pel[0] + foot[0]) / 2 + 11, (pel[1] + foot[1]) / 2 - 6];
  const hand = [bx, by];
  const elbow = [(neck[0] + hand[0]) / 2 + 1, (neck[1] + hand[1]) / 2 + 7 + L * 2];
  out.head = head; out.neck = neck; out.pel = pel; out.knee = knee; out.foot = foot; out.hand = hand; out.elbow = elbow;
  return out;
}
export const HEAD_R = 15;
