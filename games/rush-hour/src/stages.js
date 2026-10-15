// Ten stages laid end to end on ONE connected road. len = metres of road in the stage, time = seconds
// added to the clock at the stage's checkpoint (and the par for that stage's stars).
// lanes = same-direction lanes, onc = oncoming lanes on the left of the yellow line (0 = divided highway:
// a median wall with the opposing carriageway behind it). density = cars per 100 m per lane,
// lc = lane-change rate, cut = chance a car cuts in ahead, brake = sudden-brake rate, works = roadwork zones.
// turns = weights for [sweeper, bend, S-curve, chicane, hairpin switchback], tight = radius multiplier,
// str = [min, max] straight between corners. Later stages: tighter, faster, more often.
export const STAGES = [
  { name: 'Morning Commute', tag: 'Learn the weave', theme: 'suburb', tod: 'day', lanes: 3, onc: 0, len: 2600, time: 52,
    density: 0.66, truck: 0.08, lc: 0.03, cut: 0.0, brake: 0.0, speed: [22, 30], works: 0,
    turns: [4, 3, 1, 0, 0], tight: 1.0, str: [150, 280] },
  { name: 'Downtown Rush', tag: 'Four lanes, everyone late', theme: 'city', tod: 'day', lanes: 4, onc: 0, len: 3000, time: 77,
    density: 0.72, truck: 0.1, lc: 0.07, cut: 0.15, brake: 0.015, speed: [19, 28], works: 0,
    turns: [2, 3, 2, 1, 0], tight: 0.95, str: [120, 240] },
  { name: 'Freight Line', tag: 'Trucks. So many trucks.', theme: 'industrial', tod: 'day', lanes: 3, onc: 0, len: 3200, time: 81,
    density: 0.66, truck: 0.45, lc: 0.06, cut: 0.2, brake: 0.02, speed: [20, 27], works: 0,
    turns: [3, 3, 2, 0, 0], tight: 0.92, str: [130, 250] },
  { name: 'Cone Zone', tag: 'Lanes close. Merge or bounce.', theme: 'suburb', tod: 'day', lanes: 4, onc: 0, len: 3400, time: 88,
    density: 0.66, truck: 0.15, lc: 0.06, cut: 0.2, brake: 0.02, speed: [19, 27], works: 4,
    turns: [2, 3, 2, 1, 0], tight: 0.9, str: [140, 240] },
  { name: 'Sunset Two-Way', tag: 'Oncoming traffic. Judge it.', theme: 'country', tod: 'sunset', lanes: 2, onc: 2, len: 3400, time: 69,
    density: 0.66, oncDensity: 0.35, truck: 0.2, lc: 0.05, cut: 0.2, brake: 0.02, speed: [21, 28], works: 0,
    turns: [1, 3, 3, 1, 1], tight: 0.85, str: [100, 200] },
  { name: 'Neon Night', tag: 'Read the lights', theme: 'city', tod: 'night', lanes: 4, onc: 0, len: 3800, time: 93,
    density: 0.74, truck: 0.12, lc: 0.1, cut: 0.25, brake: 0.03, speed: [20, 29], works: 0,
    turns: [1, 3, 2, 3, 0], tight: 0.8, str: [90, 180] },
  { name: 'Storm Front', tag: 'Wet road, less grip', theme: 'industrial', tod: 'storm', rain: true, lanes: 3, onc: 0, len: 3800, time: 94,
    density: 0.7, truck: 0.35, lc: 0.07, cut: 0.22, brake: 0.03, speed: [18, 26], works: 2, grip: 0.72,
    turns: [3, 3, 2, 1, 0], tight: 0.8, str: [100, 200] },
  { name: 'Midnight Works', tag: 'Cones in the dark', theme: 'city', tod: 'night', lanes: 4, onc: 0, len: 4200, time: 112,
    density: 0.74, truck: 0.18, lc: 0.09, cut: 0.25, brake: 0.035, speed: [19, 28], works: 6,
    turns: [1, 3, 2, 3, 1], tight: 0.75, str: [100, 180] },
  { name: 'Canyon Overtake', tag: 'One lane each way. Switchbacks.', theme: 'canyon', tod: 'sunset', lanes: 1, onc: 1, len: 3600, time: 110,
    density: 0.6, oncDensity: 0.4, truck: 0.25, lc: 0, cut: 0, brake: 0.01, speed: [20, 25], works: 0,
    turns: [0, 3, 3, 1, 4], tight: 0.7, str: [70, 140] },
  { name: 'Gridlock Gauntlet', tag: 'Everything, at once', theme: 'city', tod: 'night', rain: true, lanes: 4, onc: 2, len: 4800, time: 112,
    density: 0.82, oncDensity: 0.35, truck: 0.2, lc: 0.1, cut: 0.28, brake: 0.04, speed: [19, 28], works: 4, grip: 0.76,
    turns: [1, 3, 3, 3, 2], tight: 0.65, str: [70, 150] },
];

// Stars from seconds left on that stage's own clock as you cross its checkpoint.
export function starsFor(st, left) {
  if (left < 0) return 0;
  if (left >= st.time * 0.2) return 3;
  if (left >= st.time * 0.09) return 2;
  return 1;
}
