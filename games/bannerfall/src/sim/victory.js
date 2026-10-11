// BANNERFALL :: sim/victory.js - win and lose rules, stages, objectives, stars and rewards (DESIGN.md 4.3).
//   defend  hold until the timer ends or break them; lose if they hold your flag 30 s or you rout
//   attack  capture their flag (hold it uncontested) or break them; lose when the timer ends
//   field   whoever holds the hill when the horns sound wins; breaking the other army wins at once
import { C } from '../data/constants.js';
import { brokenFraction, startRout } from './morale.js';
import { spawnReserves } from './ai.js';

export const RANKS = [100, 250, 500];
export const rankFor = (xp) => (xp >= RANKS[2] ? 3 : xp >= RANKS[1] ? 2 : xp >= RANKS[0] ? 1 : 0);

export function holdNeed(world) {
  const st = world.def.stages && world.def.stages[world.stage];
  return (st && st.hold) || C.FLAG_HOLD_LOSE;
}

export function updateFlag(world, dt) {
  const def = world.def;
  // Ashwood: did any Varkhal horse get across?
  if (def.stars && def.stars.riverZ && !world.flag.horseCrossed && world.tick % 10 === 0) {
    for (const so of world.soldiers) if (so.alive && so.sq.team === 1 && so.sq.def.tags.includes('cavalry') && so.z < def.stars.riverZ - 8) { world.flag.horseCrossed = true; break; }
  }
  if (!world.flagActive) return;
  const F = def.zones.flag;
  let mine = 0, theirs = 0;
  for (const so of world.soldiers) {
    if (!so.alive || so.sq.state === 'routing' || so.sq.def.engine) continue;
    if ((so.x - F.pos[0]) ** 2 + (so.z - F.pos[1]) ** 2 > F.r * F.r) continue;
    if (so.sq.team === 0) mine++; else theirs++;
  }
  const fl = world.flag;
  fl.mine = mine; fl.theirs = theirs;
  if (world.mode === 'defend') {
    if (theirs > 0) fl.touched = true;
    if (theirs > 0 && mine === 0) fl.hold += dt;
    else fl.hold = Math.max(0, fl.hold - dt * (mine > 0 ? 2 : 0.5));
  } else if (world.mode === 'attack') {
    if (mine > 0 && theirs === 0) fl.hold += dt;
    else fl.hold = Math.max(0, fl.hold - dt * (theirs > 0 ? 2 : 0.5));
  } else {
    // field: a tug of war, +10 = ours, -10 = theirs
    if (mine > 0 && theirs === 0) fl.hold = Math.min(10, fl.hold + dt);
    else if (theirs > 0 && mine === 0) fl.hold = Math.max(-10, fl.hold - dt);
    if (fl.hold >= 10 && fl.owner !== 0) { fl.owner = 0; world.events.push({ type: 'toast', team: 0, text: 'Our banner flies on ' + F.name + '!' }); world.events.push({ type: 'flagOwner', owner: 0 }); }
    if (fl.hold <= -10 && fl.owner !== 1) { fl.owner = 1; world.events.push({ type: 'toast', team: 1, text: 'Varkhal has taken ' + F.name + '!' }); world.events.push({ type: 'flagOwner', owner: 1 }); }
  }
}

// Wolfden wagons: stand by one with nobody of theirs near for 8 s to seize it
export function updateObjectives(world, dt) {
  for (const o of world.objectives) {
    if (o.taken) continue;
    let a = 0, b = 0;
    for (const so of world.soldiers) {
      if (!so.alive || so.sq.state === 'routing') continue;
      if ((so.x - o.pos[0]) ** 2 + (so.z - o.pos[1]) ** 2 > o.r * o.r) continue;
      if (so.sq.team === 0) a++; else b++;
    }
    if (a > 0 && b === 0) o.hold += dt; else o.hold = Math.max(0, o.hold - dt);
    if (o.hold >= 8) {
      o.taken = true;
      const n = world.objectives.filter((q) => q.taken).length;
      world.events.push({ type: 'toast', team: 0, text: `Wagon seized! (${n} of ${world.objectives.length})` });
      world.events.push({ type: 'objective', pos: o.pos });
    }
  }
}

function standing(world, team) {
  let n = 0;
  for (const s of world.squads.values()) if (s.team === team && s.deployed && s.alive > 0 && s.state !== 'routing' && s.state !== 'gone' && !s.def.engine) n++;
  return n;
}

function advanceStage(world) {
  const def = world.def;
  world.stage++;
  const st = def.stages[world.stage];
  world.events.push({ type: 'stage', n: world.stage, text: st.text });
  world.events.push({ type: 'toast', team: 0, text: 'The town gate is down! ' + st.text + '!', horn: true });
  if (st.flag && def.zones[st.flag]) { def.zones = { ...def.zones, flag: def.zones[st.flag] }; world.flagActive = true; world.flag.hold = 0; world.flag.touched = false; }
  if (st.time) world.timeEnd = world.t + st.time;
  spawnReserves(world);
}

export function checkVictory(world) {
  if (world.result) return world.result;
  const def = world.def;
  let winner = null, reason = '';
  const t = world.t;
  const broken0 = brokenFraction(world, 0) >= C.ARMY_BREAK && t > 5;
  const broken1 = brokenFraction(world, 1) >= C.ARMY_BREAK && t > 5 && standing(world, 1) < 4;
  if (world.mode === 'defend') {
    if (world.flag.hold >= C.FLAG_HOLD_LOSE) { winner = 1; reason = 'Varkhal holds ' + def.zones.flag.name + '.'; }
    else if (broken0) { winner = 1; reason = 'Your army has broken.'; }
    else if (t >= world.timeEnd) { winner = 0; reason = 'You held ' + def.zones.flag.name + ' until Varkhal gave up.'; }
    else {
      const allSpawned = world.ai.spawned.every(Boolean);
      if ((allSpawned && standing(world, 1) === 0) || world.ai.retreat) {
        if (!world.ai.breakT) world.ai.breakT = t;
        if (t - world.ai.breakT > 3) { winner = 0; reason = world.ai.retreat ? 'Varkhal sounds the retreat. ' + capital(def.zones.flag.name) + ' is safe.' : 'The raiders are broken.'; }
      }
    }
  } else if (world.mode === 'attack') {
    const stages = def.stages;
    if (stages && world.stage < stages.length - 1) {
      const key = stages[world.stage].key;
      const gate = key && [...world.structures.values()].find((s) => s.tag === key);
      if ((gate && !gate.alive) || broken1) advanceStage(world);
    }
    const king = [...world.squads.values()].find((s) => s.type === 'king');
    if (broken0) { winner = 1; reason = 'Your army has broken.'; }
    else if (world.flagActive && world.flag.hold >= holdNeed(world)) { winner = 0; reason = 'Your banner flies over ' + def.zones.flag.name + '.'; }
    else if (king && king.deployed && (king.alive <= 0 || king.state === 'routing' || king.state === 'gone')) { winner = 0; reason = king.alive <= 0 ? 'King Oswin is slain. The crown is yours.' : 'King Oswin yields his sword. The crown is yours.'; }
    else if ((broken1 || world.ai.retreat) && !(stages && world.stage < stages.length - 1)) {
      if (!world.ai.breakT) world.ai.breakT = t;
      if (t - world.ai.breakT > 3) { winner = 0; reason = 'Varkhal\'s garrison breaks and flees. ' + capital(def.zones.flag.name) + ' is yours.'; }
    } else if (t >= world.timeEnd) { winner = 1; reason = 'Time ran out before the assault broke through.'; }
  } else {
    if (broken0) { winner = 1; reason = 'Your army has broken.'; }
    else if (broken1 || world.ai.retreat) {
      if (!world.ai.breakT) world.ai.breakT = t;
      if (t - world.ai.breakT > 3) { winner = 0; reason = 'Varkhal breaks and runs from ' + def.zones.flag.name + '.'; }
    } else if (t >= world.timeEnd) {
      const fl = world.flag;
      const ours = fl.owner === 0 || (fl.owner !== 1 && fl.mine > fl.theirs);
      winner = ours ? 0 : 1;
      reason = ours ? 'The horns sound with your banner on ' + def.zones.flag.name + '.' : 'The horns sound with Varkhal on ' + def.zones.flag.name + '.';
    }
  }
  if (winner === null) return null;
  return finish(world, winner, reason);
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function objectiveMet(world, won, lossPct) {
  const def = world.def, S = def.stars || {};
  const sq0 = [...world.squads.values()].filter((s) => s.team === 0);
  const sq1 = [...world.squads.values()].filter((s) => s.team === 1);
  switch (S.objective) {
    case 'noEnemyInFlag': return !world.flag.touched;
    case 'healersAlive': { const h = sq0.filter((s) => s.type === 'healer' && s.home); return h.length > 0 && h.every((s) => s.alive > 0 && s.state !== 'gone'); }
    case 'noHorseSouth': return !world.flag.horseCrossed;
    case 'lowLoss': return lossPct < (S.lossPct || 30);
    case 'gateHeld': { const g = [...world.structures.values()].find((s) => s.tag === 'abbeyGate'); return !!g && g.alive; }
    case 'holdHill': return world.flag.owner === 0;
    case 'noTowersLost': return ![...world.structures.values()].some((s) => s.team === 0 && s.kind === 'tower' && !s.alive);
    case 'breachFast': return !!world.firstBreachT && world.firstBreachT <= (S.breachT || 360);
    case 'wagons': return world.objectives.length > 0 && world.objectives.every((o) => o.taken);
    case 'killKnights': { const k = sq1.filter((s) => s.type === 'knight'); return k.length > 0 && k.every((s) => s.alive <= 0 || s.state === 'gone'); }
    case 'killMangonels': { const k = sq1.filter((s) => s.type === 'mangonel'); return k.length > 0 && k.every((s) => s.alive <= 0); }
    case 'kingCaptured': { const k = sq1.find((s) => s.type === 'king'); return won && !!k && !world.kingSlain; }
  }
  return won;
}

export function finish(world, winner, reason) {
  const def = world.def;
  let men = 0, lost = 0, surv = 0;
  const squads = [], fallen = [];
  let mvp = null;
  for (const s of world.squads.values()) {
    if (s.team !== 0 || s.type === 'commander') continue;
    const fled = s.soldiers.filter((so) => so.fled).length;
    const endMen = Math.max(0, s.alive) + fled;
    if (s.deployed || s.lost || fled) { men += s.startMen; lost += s.lost; surv += endMen; }
    if (winner === 0 && endMen > 0) s.xp += 20;
    const vetNew = Math.max(s.vet, rankFor(s.xp));
    squads.push({ id: s.id, uid: s.uid, type: s.type, name: s.name, men: endMen, startMen: s.startMen, max: s.menMax, vet: s.vet, vetNew, xp: Math.round(s.xp), xp0: Math.round(s.xp0), kills: s.kills, healed: Math.round(s.healed), fought: s.deployed || s.lost > 0, bought: !!s.bought, gift: !!s.gift });
    if (endMen <= 0 && (s.deployed || s.lost)) fallen.push(s.name);
    if (!mvp || s.kills > mvp.kills) mvp = { name: s.name, kills: s.kills, type: s.type };
  }
  let enemyMen = 0, enemyLost = 0;
  for (const s of world.squads.values()) if (s.team === 1) { enemyMen += s.startMen || s.menMax; enemyLost += s.lost; }
  const lossPct = men ? (lost / men) * 100 : 0;
  const won = winner === 0;
  const stars = [won, won && lossPct < (def.stars ? def.stars.maxLossPct : 40), won && objectiveMet(world, won, lossPct)];
  const nStars = stars.filter(Boolean).length;
  const base = won ? def.reward : 0, starGold = won ? (nStars - 1) * 300 : 0, survGold = surv * (won ? 2 : 1);
  const bonus = won && def.bonusGold ? def.bonusGold : 0;
  const reward = base + starGold + survGold + bonus;
  world.result = {
    winner, reason, stars, nStars, reward, time: world.t, battleId: def.id, mode: world.mode,
    gold: { victory: base, stars: starGold, survivors: survGold, bonus },
    stats: { men, lost, surv, lossPct: Math.round(lossPct), enemyMen, enemyLost, healed: Math.round(world.teams[0].healed), shots: world.projSeq },
    squads, fallen, mvp: mvp && mvp.kills > 0 ? mvp : null,
    promotions: squads.filter((s) => s.vetNew > s.vet && s.men > 0).map((s) => ({ name: s.name, rank: s.vetNew })),
  };
  world.phase = 'over';
  world.events.push({ type: 'over', winner });
  // the loser runs
  world.quiet = true;
  for (const s of world.squads.values()) if (s.team !== winner && s.deployed && s.alive > 0) startRout(world, s);
  return world.result;
}
