// Save data (localStorage pd.graze) and missions. Every storage access is
// wrapped in try/catch: the game must run in private windows too.
export const SAVE_KEY = 'pd.graze';

const DEF = () => ({
  v: 1, sparks: 0, runs: 0,
  total: { grazes: 0, phases: 0, clears: 0 },
  run: { best: 0, bestDist: 0, bestTier: 0, top: [] }, // top: local top-5 [{ s: score, t: tier reached, d: day }]
  daily: {},
  levels: {},
  owned: { arrow: ['dart'], trail: ['ribbon'], death: ['shatter'] },
  eq: { arrow: 'dart', trail: 'ribbon', death: 'shatter' },
  missions: { active: [0, 1, 2], next: 3, cycle: 0, prog: {} },
  set: { music: 0.7, sfx: 0.85, shake: true },
  ghosts: {},
  hints: 0, // times the phase-ready explainer has shown
  tier3Seen: false, // the "start at tier 3" unlock toast has shown
});

export function loadSave() {
  const s = DEF();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k of Object.keys(s)) if (o[k] !== undefined) s[k] = (typeof s[k] === 'object' && !Array.isArray(s[k])) ? Object.assign(s[k], o[k]) : o[k];
    }
  } catch (e) { /* blocked or corrupt */ }
  return s;
}
export function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* blocked or full */ } }

// ghosts: y every 8 units, stored as base-36 deltas to stay small
export function packGhost(arr) { let prev = 0; return arr.map((v) => { const d = v - prev; prev = v; return d.toString(36); }).join(','); }
export function unpackGhost(str) { if (!str) return null; let prev = 0; try { return str.split(',').map((t) => (prev += parseInt(t, 36))); } catch (e) { return null; } }

// ---------------------------------------------------------------- missions
export const MISSIONS = [
  { id: 'g50', text: 'Graze 50 times in one run', goal: 50, stat: 'grazes', reward: 60 },
  { id: 'p3', text: 'Phase through 3 walls within 10 s', goal: 3, stat: 'phase10', reward: 80 },
  { id: 'm4', text: 'Reach a x4 multiplier', goal: 4, stat: 'maxMult', reward: 50 },
  { id: 's45', text: 'Survive 45 s in RUN', goal: 45, stat: 'runTime', reward: 60 },
  { id: 'b8', text: 'Graze 8 times within 5 s', goal: 8, stat: 'burst5', reward: 50 },
  { id: 'dl', text: "Finish today's Daily", goal: 1, stat: 'dailyFinish', reward: 100 },
  { id: 'gt300', text: 'Graze 300 times in total', goal: 300, stat: 'sumGrazes', reward: 100, sum: true },
  { id: 't3', text: 'Reach speed tier 3 in RUN', goal: 3, stat: 'tier', reward: 80 },
  { id: 'sc3k', text: 'Score 5,000 in one run', goal: 5000, stat: 'score', reward: 70 },
  { id: 'st3', text: 'Get 3 stars on any level', goal: 1, stat: 'threeStar', reward: 90 },
  { id: 'c30', text: 'Build a 30-graze combo', goal: 30, stat: 'maxCombo', reward: 90 },
  { id: 'np', text: 'Finish a level without phasing', goal: 1, stat: 'noPhaseFinish', reward: 60 },
  { id: 'pt6', text: 'Fly through 6 portals in one run', goal: 6, stat: 'portals', reward: 60 },
  { id: 'ph4', text: 'Phase 4 times in one run', goal: 4, stat: 'phases', reward: 90 },
  { id: 'lc3', text: 'Clear 3 world levels', goal: 3, stat: 'sumClears', reward: 100, sum: true },
];
export const missionText = (m, goal) => (m.goal <= 1 ? m.text : m.text.replace(/\d[\d,]*/, goal >= 1000 ? goal.toLocaleString('en-US') : String(goal)));
const scaleGoal = (m, cycle) => (m.goal <= 1 ? 1 : Math.round(m.goal * (1 + 0.5 * cycle)));

export function statOf(s, stat) {
  switch (stat) {
    case 'runTime': return s.mode === 'run' ? Math.floor(s.t - (s.startTier || 0) * 30) : 0;
    case 'tier': return s.mode === 'run' ? s.tier + 1 : 0;
    case 'dailyFinish': return s.mode === 'daily' && s.finished ? 1 : 0;
    case 'threeStar': return s.threeStar ? 1 : 0;
    case 'noPhaseFinish': return s.mode === 'level' && s.finished && !s.practice && s.phases === 0 ? 1 : 0;
    default: return s[stat] || 0;
  }
}

export function activeMissions(save) {
  const M = save.missions;
  return M.active.map((i) => {
    const m = MISSIONS[i % MISSIONS.length];
    const goal = scaleGoal(m, Math.floor(i / MISSIONS.length));
    const prog = Math.min(goal, M.prog[i] || 0);
    return { ...m, text: missionText(m, goal), idx: i, goal, prog, reward: m.reward + 20 * Math.floor(i / MISSIONS.length) };
  });
}

// s = attempt summary. end=true adds the "sum" missions. Returns completed missions.
export function checkMissions(save, s, end) {
  const M = save.missions, done = [];
  for (let slot = 0; slot < M.active.length; slot++) {
    const i = M.active[slot];
    const m = MISSIONS[i % MISSIONS.length];
    const goal = scaleGoal(m, Math.floor(i / MISSIONS.length));
    if (s.practice && !m.sum) continue;
    if (m.sum) {
      if (!end) continue;
      const add = m.stat === 'sumGrazes' ? s.grazes : m.stat === 'sumClears' ? (s.mode === 'level' && s.finished && !s.practice ? 1 : 0) : 0;
      M.prog[i] = (M.prog[i] || 0) + add;
    } else {
      M.prog[i] = Math.max(M.prog[i] || 0, statOf(s, m.stat));
    }
    if ((M.prog[i] || 0) >= goal) {
      const reward = m.reward + 20 * Math.floor(i / MISSIONS.length);
      done.push({ text: missionText(m, goal), reward });
      save.sparks += reward;
      delete M.prog[i];
      M.active[slot] = M.next++;
    }
  }
  return done;
}
