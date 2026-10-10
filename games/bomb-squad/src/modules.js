// Module engine: the rules-only side of each module (no drawing). Both the game and
// tools/solver.mjs drive modules through act() and tick(), so what the solver proves is
// what the player actually gets.
import * as RU from './rules.js';
import { rng, ri, pick } from './rng.js';

export function createModule(m, widgets) {
  const f = RU.facts(widgets);
  const d = m.data;
  const M = { type: m.type, data: d, solved: false, needy: m.type === 'vent', anim: {} };
  switch (m.type) {
    case 'wires': M.cut = d.colors.map(() => false); M.answer = RU.wireAnswer(d.colors, f); break;
    case 'button': M.act = RU.buttonAct(d, f); M.digit = RU.STRIP_DIGIT[d.strip]; M.down = false; M.held = 0; break;
    case 'switches': M.state = d.start.slice(); M.target = RU.switchTarget(d.colors, f); break;
    case 'keypad': M.order = RU.keypadOrder(d.syms); M.lit = [false, false, false, false]; M.step = 0; break;
    case 'simon': M.table = RU.simonTable(f); M.stage = 0; M.input = 0; break;
    case 'maze': M.pos = d.start; M.open = RU.MAZES[d.maze].open; break;
    case 'code': M.pos = d.start.slice(); M.word = RU.formable(d.wheels)[0]; break;
    case 'vent': M.R = rng(d.seed); M.active = false; M.wait = 9; M.left = 0; M.color = 'red'; M.blink = false; break;
  }
  return M;
}

// What the code wheel currently spells.
export const codeShown = (M) => M.pos.map((p, i) => M.data.wheels[i][p]).join('');

// a = { t: 'cut'|'down'|'up'|'flip'|'set'|'press'|'move'|'spin'|'submit'|'valve', ... }
// ctx = { digit } (the clock's last digit, for the button)
// returns 'none' | 'ok' | 'strike' | 'solved'
export function act(M, a, ctx = {}) {
  if (M.solved) return 'none';
  switch (M.type) {
    case 'wires': {
      if (a.t !== 'cut' || M.cut[a.i]) return 'none';
      M.cut[a.i] = true;
      if (a.i === M.answer) { M.solved = true; return 'solved'; }
      return 'strike';
    }
    case 'button': {
      if (a.t === 'down') { if (M.down) return 'none'; M.down = true; M.held = 0; return 'ok'; }
      if (a.t === 'up') {
        if (!M.down) return 'none';
        M.down = false;
        const wasTap = M.held < RU.TAP_MAX;
        M.held = 0;
        if (wasTap) { if (M.act === 'tap') { M.solved = true; return 'solved'; } return 'strike'; }
        if (M.act === 'hold' && ctx.digit === M.digit) { M.solved = true; return 'solved'; }
        return 'strike';
      }
      return 'none';
    }
    case 'switches': {
      if (a.t === 'flip') { M.state[a.i] = !M.state[a.i]; return 'ok'; }
      if (a.t === 'set') {
        if (M.state.every((s, i) => s === M.target[i])) { M.solved = true; return 'solved'; }
        return 'strike';
      }
      return 'none';
    }
    case 'keypad': {
      if (a.t !== 'press' || M.lit[a.i]) return 'none';
      if (M.order[M.step] === a.i) {
        M.lit[a.i] = true; M.step++;
        if (M.step === 4) { M.solved = true; return 'solved'; }
        return 'ok';
      }
      return 'strike';
    }
    case 'simon': {
      if (a.t !== 'press') return 'none';
      const want = M.table[M.data.seq[M.input]];
      if (a.color !== want) { M.input = 0; return 'strike'; }
      M.input++;
      if (M.input > M.stage) {
        M.stage++; M.input = 0;
        if (M.stage >= M.data.seq.length) { M.solved = true; return 'solved'; }
        return 'stage';
      }
      return 'ok';
    }
    case 'maze': {
      if (a.t !== 'move') return 'none';
      const [dx, dy, bit] = RU.DIRS[a.dir];
      const x = M.pos % 5 + dx, y = ((M.pos / 5) | 0) + dy;
      if (x < 0 || y < 0 || x > 4 || y > 4) return 'none'; // the screen edge just stops you
      if (!(M.open[M.pos] & bit)) return 'strike';
      M.pos = y * 5 + x;
      if (M.pos === M.data.goal) { M.solved = true; return 'solved'; }
      return 'ok';
    }
    case 'code': {
      if (a.t === 'spin') { M.pos[a.i] = (M.pos[a.i] + a.d + 5) % 5; return 'ok'; }
      if (a.t === 'submit') { if (codeShown(M) === M.word) { M.solved = true; return 'solved'; } return 'strike'; }
      return 'none';
    }
    case 'vent': {
      if (a.t !== 'valve') return 'none';
      if (!M.active) return 'none';
      if (a.i === RU.ventAnswer(M.color, M.blink)) { M.active = false; M.wait = 10 + M.R() * 8; return 'ok'; }
      return 'strike';
    }
  }
  return 'none';
}

// Time passing. Returns 'strike' when the needy module runs out, 'start' when it begins.
export function tick(M, dt) {
  if (M.type === 'button' && M.down) M.held += dt;
  if (M.type === 'vent') {
    if (!M.active) {
      M.wait -= dt;
      if (M.wait <= 0) { M.active = true; M.left = RU.VENT_TIME; M.color = pick(M.R, RU.VENT_COLORS); M.blink = M.R() < 0.45; return 'start'; }
    } else {
      M.left -= dt;
      if (M.left <= 0) { M.active = false; M.wait = 10 + M.R() * 8; return 'strike'; }
    }
  }
  return 'none';
}
