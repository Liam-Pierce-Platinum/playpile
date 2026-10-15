// The ladder. Every arena is lopsided on purpose: the mirror copies you perfectly, so the
// only way to win is to find where the same move costs it more than it costs you.
// floor: solid floor spans (gaps are pits). blocks: [x, y, w, h, electric]. spikes: [x0, x1, y?, 'up'|'down'].
// conv: [x0, x1, speed]. ice/pads: [x0, x1]. lasers: [x, period, onFrames, phase]. elec: 'L'/'R' electrified edge walls.
import { FLOOR } from './sim.js';

export const STAGES = [
  {
    name: 'FIRST LIGHT', sx: 380, mods: [],
    spikes: [[830, 960]],
    hint: 'The MIRROR copies you, flipped. Walk LEFT - it walks RIGHT, into the spikes.',
  },
  {
    name: 'BACKSTOP', sx: 400, mods: ['light'], elec: 'R',
    blocks: [[300, FLOOR - 240, 40, 240]],
    hint: 'Back up to the pillar first, then close in and HEAVY (K). FEATHER: they fly into the electric wall.',
  },
  {
    name: 'UNDERTOW', sx: 380, mods: [],
    conv: [[0, 960, -110]],
    spikes: [[0, 70], [890, 960]],
    hint: 'The belt drags BOTH of you left. Walk right to hold - the mirror sprints left into you.',
  },
  {
    name: 'THE GAP', sx: 420, mods: ['slow'],
    floor: [[0, 250], [330, 600], [740, 960]],
    hint: 'Your pit is narrow, theirs is wide. Fight near the edges.',
  },
  {
    name: 'LASER GRID', sx: 360, mods: ['delay'], elec: 'LR',
    lasers: [[290, 150, 50, 0], [670, 150, 50, 75]],
    hint: 'The beams fire out of step. LAG: the mirror copies you late - hit and step away.',
  },
  {
    name: 'BLACK ICE', sx: 380, mods: ['heavy'],
    ice: [[480, 960]],
    spikes: [[0, 60], [900, 960]],
    hint: 'Their half is ice - knockback slides forever. HEAVY: they hit harder.',
  },
  {
    name: 'LOW CEILING', sx: 380, mods: ['fast'],
    blocks: [[0, 0, 300, FLOOR - 205], [540, 0, 420, FLOOR - 205]],
    spikes: [[0, 300, FLOOR - 205, 'down'], [540, 960, FLOOR - 205, 'down']],
    hint: 'Both ceilings bite. Only jump when THEY are under teeth and you are not. TURBO: they move faster.',
  },
  {
    name: 'MIRROR KING', sx: 400, mods: ['delay', 'armor'], hp: 130, elec: 'R',
    conv: [[420, 600, 130]],
    spikes: [[0, 50], [910, 960]],
    lasers: [[250, 170, 50, 0], [710, 170, 50, 85]],
    hint: 'No walls to hide behind. LAG + ARMOR: time the beams, ride the belt, pin them on the live wall.',
  },
];
