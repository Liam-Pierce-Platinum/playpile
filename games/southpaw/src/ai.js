// The NPC brain. It writes the same intent the keyboard does, so it has no
// powers the player lacks: it has to SEE a punch start, wait out a reaction
// time, then pick a defence - and it can pick the wrong one.
//
// What makes each fighter feel like a person rather than a dice roll:
//   - REACTION TIME per fighter, so a rookie eats jabs he would block later
//   - a DEFENCE TABLE per punch kind; a low number is a hole you can find
//   - MEMORY: it counts what you throw, and the punch you repeat gets read
//     faster and defended more often. Mixing it up is how you beat a reader.
//   - RHYTHM: out-boxers step in, throw, step out; pressure fighters walk you
//     to the ropes; everyone circles off the ropes when they are pinned
//   - FATIGUE and DAMAGE change the plan: hurt fighters cover and retreat,
//     tired fighters hold their guard and stop throwing
//   - QUIRKS: dropping the hands after a combo, taunting, the telegraphed
//     haymaker with its wind-up, going wild when hurt

import { RING, emptyIntent } from './fight.js';
import { spec } from './data.js';

const LETTER = { J: ['straight', 'lead'], C: ['straight', 'rear'], H: ['hook', 'lead'], R: ['hook', 'rear'], L: ['upper', 'lead'], U: ['upper', 'rear'], O: ['over', 'rear'] };
export function parseSeq(s) {
  return s.trim().split(/\s+/).map((tok) => {
    const [kind, hand] = LETTER[tok[0]];
    return { kind, hand, target: tok.endsWith('.') ? 'body' : 'head' };
  });
}
const groupOf = (k) => (k === 'star' ? 'straight' : k);

// a plain, decent sparring partner - used for the stand-in "player" in tests
export const SPARRING = {
  react: 0.24, def: { straight: 0.5, hook: 0.45, upper: 0.4, over: 0.45, body: 0.4 }, guard: 0.45, aggro: 0.6, range: 34,
  counter: 0.4, bodyIQ: 0.35, learn: 0.3, heart: 0.6, combos: [['J', 3], ['J C', 3], ['J C H', 2], ['H. H', 1], ['U H', 1]], quirks: [],
};

export function makeAI(profile, rng, dodgeLv = 0) {
  const P = (profile && profile.ai) || SPARRING;
  const m = {
    think: 0, combo: [], comboSpecial: false, react: null, seen: -1, seenOppWhiff: -1,
    memory: { straight: 0, hook: 0, upper: 0, over: 0, body: 0 },
    zOff: 0, zT: 1 + rng() * 2, engage: 0, holdGuard: 0, guardLow: false, guardHabit: false,
    specialT: P.special ? P.special.every * (0.4 + rng() * 0.4) : 1e9,
    tauntCd: 8, readShown: false, bob: rng() * 6, stepT: 0, stepDir: 0,
    // where you have been hitting him lately, and how
    tgt: { head: 0, body: 0 }, streak: 0, streakTgt: 'head', lastStart: -9, gap: 0.6,
    cover: 0, coverLow: false, coverShown: '', antic: 0, anticLow: false, anticFor: -1,
    blocked: 0, oppHighT: 0, oppLowT: 0, waitT: 0
  };
  const dodgey = Math.min(0.85, 0.25 + dodgeLv * 0.07);

  function pickCombo() {
    let tot = 0;
    for (const c of P.combos) tot += c[1];
    let r = rng() * tot;
    for (const c of P.combos) { r -= c[1]; if (r <= 0) return parseSeq(c[0]); }
    return parseSeq(P.combos[0][0]);
  }

  function update(fight, me, opp, dt) {
    const I = emptyIntent();
    if (fight.phase !== 'fight') { m.combo.length = 0; m.react = null; m.holdGuard = 0; return I; }

    for (const k in m.memory) m.memory[k] *= Math.pow(0.975, dt);
    m.tgt.head *= Math.pow(0.6, dt); m.tgt.body *= Math.pow(0.6, dt);
    m.cover = Math.max(0, m.cover - dt); m.antic = Math.max(0, m.antic - dt);
    if (fight.time - m.lastStart > 1.4) { m.streak = 0; m.coverShown = ''; }
    // how long YOU have been sitting behind a guard
    m.oppHighT = opp.guard === 1 ? m.oppHighT + dt : 0;
    m.oppLowT = opp.guard === 2 ? m.oppLowT + dt : 0;
    m.holdGuard = Math.max(0, m.holdGuard - dt);
    m.engage = Math.max(0, m.engage - dt);
    m.specialT -= dt; m.tauntCd -= dt; m.zT -= dt; m.think -= dt; m.stepT -= dt;

    const dx = opp.x - me.x, adx = Math.abs(dx), dz = opp.z - me.z;
    const hurt = me.hp < me.st.hpMax * 0.3;
    const tired = me.stam < me.st.stamMax * 0.22;
    const wild = me.wild;
    const swarm = me.quirks.includes('swarms');
    const busy = me.state !== 'idle';

    // ---------------------------------------------------- reading punches
    if (opp.act && opp.act.id !== m.seen && opp.state === 'punch') {
      m.seen = opp.act.id;
      const key = opp.act.target === 'body' ? 'body' : groupOf(opp.act.kind);
      const reaches = adx < opp.act.reach + 16 && Math.abs(dz) < 15;
      const learned = m.memory[key] * P.learn;
      if (reaches) {
        let p = (P.def[key] || 0.3) + Math.min(0.3, learned * 0.05);
        if (wild) p *= 0.3;
        if (tired) p *= 0.75;
        if (me.state === 'stagger') p = 0;
        const delay = P.react * (0.75 + rng() * 0.55) - Math.min(0.1, learned * 0.018);
        m.react = { due: delay, p, key, kind: opp.act.kind, target: opp.act.target, id: opp.act.id };
      }
      m.memory[key] += 1;
      const tg = opp.act.target;
      m.tgt[tg] += 1;
      if (tg === m.streakTgt) m.streak++; else { m.streak = 1; m.streakTgt = tg; }
      const now = fight.time, g = now - m.lastStart;
      if (g < 1.5) m.gap = m.gap * 0.6 + g * 0.4;
      m.lastStart = now;
      // keep covering the spot you keep hitting
      const thresh = Math.max(2, Math.round(3.6 - P.learn * 2));
      if (m.streak >= thresh && reaches && !wild) {
        m.cover = 0.6 + P.learn * 0.5; m.coverLow = tg === 'body';
        const msg = m.coverLow ? 'GUARDING THE BODY' : 'GUARDING THE HEAD';
        if (m.coverShown !== msg) { m.coverShown = msg; fight.events.push({ type: 'text', side: me.side, text: msg, col: 'cool' }); }
      }
      if (P.learn >= 0.7 && !m.readShown && m.memory[key] > 4.5) {
        m.readShown = true;
        fight.events.push({ type: 'text', side: me.side, text: 'HE IS READING YOU', col: 'bad' });
      }
    }
    if (m.react) {
      m.react.due -= dt;
      if (m.react.due <= 0) {
        const R = m.react; m.react = null;
        const coming = opp.act && opp.act.id === R.id && opp.act.t < opp.act.start;
        if (coming && me.state === 'idle' && rng() < R.p) defend(R, I);
      }
    }

    // ------------------------------------------- block, then fire back
    if (me.stats.blocked > m.blocked) {
      m.blocked = me.stats.blocked;
      const late = opp.act && opp.act.t > opp.act.start + opp.act.active;
      // but never into a fast mash: wait for a gap in the rhythm to fire back
      const gapOk = m.gap > 0.3 || opp.stam < 15 || fight.time - m.lastStart > 0.25;
      if (!busy && gapOk && adx < 40 && Math.abs(dz) < 10 && rng() < 0.3 + P.counter * 0.5) {
        m.combo = parseSeq(late ? (rng() < 0.5 ? 'C' : 'H') : 'J'); m.engage = 0.5; m.cover = Math.min(m.cover, 0.1);
      }
    }

    // ---------------------------------------------- timing the next shot
    // You have a rhythm. He feels it, and puts the guard where he thinks the
    // NEXT one is going - usually the spot you keep hitting, but a clever
    // fighter who has been covering that spot for a while expects you to go
    // for the open one instead, and guesses there.
    const since = fight.time - m.lastStart;
    const due = m.gap - P.react * 0.8;
    if (m.streak >= 2 && adx < 52 && Math.abs(dz) < 14 && since > due - 0.08 && since < m.gap + 0.25 && m.anticFor !== m.lastStart) {
      m.anticFor = m.lastStart;
      if (rng() < 0.35 + P.learn * 0.5) {
        const expectSwitch = m.cover > 0 && m.streak >= 4 && rng() < P.learn * 0.45;
        const tg = expectSwitch ? (m.streakTgt === 'head' ? 'body' : 'head') : m.streakTgt;
        m.antic = 0.35; m.anticLow = tg === 'body';
      }
    }

    // --------------------------------------------------- counter-punching
    const oppWhiffed = opp.act && (opp.act.hit === 'miss' || opp.act.hit === 'dodge') && opp.act.id !== m.seenOppWhiff;
    if (oppWhiffed) {
      m.seenOppWhiff = opp.act.id;
      if (!busy && adx < 44 && Math.abs(dz) < 10 && rng() < P.counter) {
        m.combo = adx < 26 ? parseSeq(rng() < 0.5 ? 'U' : 'R') : parseSeq(rng() < 0.6 ? 'C' : 'J C');
        m.engage = 0.6;
      }
    }

    // ----------------------------------------------------------- thinking
    if (m.think <= 0) {
      m.think = 0.14 + rng() * 0.16;
      m.guardHabit = adx < 52 && rng() < P.guard * (hurt ? 1.5 : 1) * (tired ? 1.3 : 1);
      let canAttack = !m.combo.length && !busy && !(hurt && !wild && !swarm && rng() < 0.6);
      // you are sitting behind a guard: he WAITS a beat, reading it, then
      // decides to go round it. Smarter body punchers decide sooner.
      // being mashed: shell up behind the guard and wait for the rhythm to
      // break. Throwing into a fast flurry just eats the next one.
      const flurry = m.streak >= 3 && m.gap < 0.32 && fight.time - m.lastStart < 0.3 && adx < 46;
      if (flurry && !wild) { canAttack = false; m.cover = Math.max(m.cover, 0.4); }
      const read = 0.35 + (1 - P.bodyIQ) * 0.5;
      let goLow = false, goHigh = false;
      if (opp.guard === 1) { if (m.oppHighT < read) canAttack = false; else goLow = rng() < 0.45 + P.bodyIQ * 0.5; }
      if (opp.guard === 2) { if (m.oppLowT < read * 0.8) canAttack = false; else goHigh = true; }
      const aggro = P.aggro * (tired ? 0.35 : 1) * (wild ? 1.7 : 1) * (opp.state === 'stagger' ? 2 : 1);
      if (canAttack && rng() < aggro * 0.55) {
        if (m.specialT <= 0 && P.special && !tired) {
          const s = parseSeq(P.special.seq);
          s[0].tell = P.special.tell; s[0].special = P.special.name;
          for (const p of s) p.power = P.special.power;
          m.combo = s; m.comboSpecial = true;
          m.specialT = P.special.every * (0.8 + rng() * 0.5);
        } else {
          m.combo = pickCombo(); m.comboSpecial = false;
          // go round the guard he has been watching
          if (goLow) { m.combo[0].target = 'body'; if (m.combo[1] && rng() < 0.5) m.combo[1].target = 'body'; }
          if (goHigh) for (const p of m.combo) p.target = 'head';
        }
        m.engage = 1.2;
      }
      if (me.quirks.includes('taunts') && !busy && m.tauntCd <= 0 && me.hp - opp.hp > 22 && adx > 30 && rng() < 0.35) {
        I.taunt = true; m.tauntCd = 7 + rng() * 4;
      }
    }

    // ------------------------------------------------------ throw the combo
    if (m.combo.length) {
      if (me.state === 'hit' || me.state === 'stagger') m.combo.length = 0;
      else {
        const first = m.combo[0];
        const r = spec(first.kind, first.hand).reach + me.st.reach;
        const inRange = adx < r + 8 && Math.abs(dz) < 9;
        const ready = me.state === 'idle' || (me.state === 'punch' && me.act && me.act.t >= me.act.start && !me.queue.length);
        if (ready && (inRange || me.state === 'punch')) {
          I.punches.push(m.combo.shift());
          if (!m.combo.length && m.comboSpecial && me.quirks.includes('dropsGuard')) me.open = 0.9;
        } else if (!inRange && m.engage <= 0) m.combo.length = 0;
      }
    }

    // ------------------------------------------------------------ footwork
    let want = P.range;
    if (m.engage > 0 && m.combo.length) {
      const f = m.combo[0];
      want = Math.max(16, spec(f.kind, f.hand).reach + me.st.reach - 6);
    } else if (hurt && !wild && !swarm) want = P.range + 26;
    else if (tired) want = P.range + 14;
    if (me.quirks.includes('hatesInside') && adx < 28) want = P.range + 10;

    // in-and-out rhythm: little steps around the preferred distance
    if (m.stepT <= 0) { m.stepT = 0.35 + rng() * 0.5; m.stepDir = rng() < 0.5 ? -1 : 1; }
    const jitter = m.engage > 0 ? 0 : m.stepDir * 7;
    const err = adx - (want + jitter);
    let mx = 0;
    if (Math.abs(err) > 3) mx = Math.max(-1, Math.min(1, err / 14)) * Math.sign(dx);

    // pinned on the ropes behind you? pivot out along z instead of backing up
    const behind = me.x - Math.sign(dx) * 14;
    const pinned = behind < RING.x0 + 2 || behind > RING.x1 - 2;

    // step off the line now and then (circlers do it a lot), then come back
    if (m.zT <= 0) {
      const circles = me.quirks.includes('circles') ? 1 : 0.35;
      m.zOff = rng() < circles * 0.6 && !m.engage ? (rng() < 0.5 ? -1 : 1) * (12 + rng() * 10) : 0;
      m.zT = 0.8 + rng() * 1.6;
    }
    let tz = opp.z + (m.engage > 0 || swarm ? 0 : m.zOff);
    if (pinned && m.streak >= 2 && adx < 34 && !m.combo.length) { tz = me.z < (RING.z0 + RING.z1) / 2 ? RING.z1 - 4 : RING.z0 + 4; mx = 0; }
    else if (pinned && mx * Math.sign(dx) < 0) { tz = me.z < (RING.z0 + RING.z1) / 2 ? RING.z1 - 8 : RING.z0 + 8; mx *= 0.3; }
    // pressure fighters cut the ring off: stand where he wants to go
    if (swarm && adx > 30) tz = opp.z + Math.sign(opp.vz) * 8;
    tz = Math.max(RING.z0 + 2, Math.min(RING.z1 - 2, tz));
    const ez = tz - me.z;
    let mz = Math.abs(ez) > 2 ? Math.max(-1, Math.min(1, ez / 10)) : 0;

    if (me.state === 'stagger') { mx *= 0.4; mz *= 0.4; }
    I.mx = mx; I.mz = mz;
    // drop the level for body shots, the same as the player does
    I.crouch = (m.combo.length && m.combo[0].target === 'body') || (me.act && me.act.target === 'body' && me.state === 'punch');

    // ------------------------------------------------------------- guard
    const near = adx < 56 && Math.abs(dz) < 16;
    if (m.holdGuard > 0) { I.guard = true; I.low = m.guardLow; }
    else if (m.antic > 0 && near && !m.combo.length) { I.guard = true; I.low = m.anticLow; }
    else if (m.cover > 0 && near && !m.combo.length) { I.guard = true; I.low = m.coverLow; }
    else if ((m.guardHabit || hurt) && !m.combo.length && !wild) { I.guard = true; I.low = false; }
    return I;
  }

  function defend(R, I) {
    m.guardLow = false;
    if (R.target === 'body') { m.holdGuard = 0.45; m.guardLow = true; I.guard = true; I.low = true; return; }
    const d = rng() < dodgey;
    switch (R.kind) {
      case 'straight': case 'star':
        if (d) { if (rng() < 0.5) I.slip = true; else I.duck = true; } else { m.holdGuard = 0.4; I.guard = true; }
        break;
      case 'hook':
        if (d) I.duck = true; else { m.holdGuard = 0.45; I.guard = true; }
        break;
      case 'upper': case 'over':
        if (d || rng() < 0.4) I.slip = true; else { m.holdGuard = 0.45; I.guard = true; }
        break;
    }
  }

  return { update, mem: m };
}
