// =====================================================================
// QUICKDRAW - keep your hand on the holster, and be faster than him
// =====================================================================
//
// Liam: *"better graphics for quickdraw and make it so the player and gun
// is customizable with a shop and so the mouse has to stay in a holster
// until draw and then they have to aim pull the mouse out of the holster
// area the gun follows the mouse and then click to shoot and then add in
// health and real damaging so if leg is hit leg can't be used if arms are
// both hit no more arms etc etc headshot is instant kill"*, and *"add in
// two player for quickdraw"*.
//
// THE HOLSTER IS THE WHOLE GAME NOW. It was a reaction test - the screen
// said DRAW and you clicked - and a reaction test has no hands in it. Now
// your hand has to BE somewhere: the pointer sits in the holster box at
// your hip through the wait. On DRAW you pull it out, and from that
// moment the arm and the gun follow it, so the shot is aimed. Being first
// is no longer enough; being first AND on target is the game, and those
// two pull against each other exactly the way they should.
//
// A FIGHT IS A SEQUENCE OF VOLLEYS, NOT ONE SHOT.
//
// Liam: *"if you draw slower then the NPC ... you just lose. it shouldn't
// be that way. it should just be you keep going next round, return mouse
// to holster and then hold and shoot again until someone dies"*.
//
// He is right, and the old rule was the worst kind of unfair: being a
// tenth of a second slower than a man whose reaction time was a constant
// killed you outright, and there was nothing you could do with the
// knowledge. So one exchange is now a VOLLEY - hands down, wait, the
// word, one shot each - and then hands go back down and you do it again.
// Nobody dies of being slow. They die of the wounds, which accumulate,
// which is what makes the limb damage matter: a man with one arm and one
// knee is still in the fight, and he is a man you can beat.
//
// A FALSE START IS A RE-DO, AND THREE OF THEM COSTS YOU YOUR GUN.
//
// Liam: *"if you pull the gun out early just redo it - pull it out too
// fast three times in one round then the player doesn't get their gun
// next round, it will be free shot for the opponent"*.
//
// Which is exactly the right price. A twitch costs you the volley you
// were about to have and nothing else. Three twitches in one fight is
// not a twitch, it is guessing, and the price of guessing is standing
// there with an empty hand while he takes his time over you.
//
// BUT YOU CANNOT STAND THERE WEARING IT.
//
// Liam: *"make it so the player can't sit forever after getting shot,
// they need to actually shoot 0.25 seconds after the enemy bullet hits
// them or they lose"*.
//
// So being hit starts a clock: a quarter of a second to get your own
// shot away, drawn as a bar under your feet. Answer it and the wound is
// just a wound and the fight goes on. Let it run out and it puts you
// down. This is what keeps the volleys honest - without it, losing an
// exchange costs nothing and the right play is to wait for him to empty
// his gun. It only runs if you still have a shot to take: a man who has
// already fired this volley, or who is serving a no-gun penalty, has
// nothing to answer with and is not asked to.
//
// AND YOUR HAND STAYS ON YOUR OWN SIDE.
//
// Liam: *"make it so the player has to keep the mouse on their half of
// the screen when shooting"*.
//
// Which is how a draw actually works - you do not reach across the
// street to put the barrel on a man. The pointer is your HAND, not a
// crosshair on his chest: the shot goes out along the line from your gun
// through your hand and carries on, so a hand held an inch further out
// from your hip swings the muzzle across him. That makes aiming an angle
// rather than a click, it makes a fast shot genuinely harder to place,
// and it is enforced - cross the halfway line and the shot does not go.
//
// AND HE IS A PERSON, NOT A STOPWATCH. The opponent's reaction time is
// rolled fresh every volley around his own average, and he makes the
// mistakes a person makes: the gun catches in the leather, he jumps the
// word himself (and pays for it the same way you do), or he pulls the
// shot wide. The worse the man, the more of all three.
//
// DAMAGE IS PER LIMB, and each limb does something different, so a fight
// can be won on points rather than on one clean shot:
//   HEAD    instant. There is no such thing as a survivable headshot.
//   TORSO   45 of 100. Two is fatal.
//   ARM     25, and that arm is finished. Hit the gun arm and he has to
//           swap hands - slower, and the aim wanders. Take BOTH arms and
//           he cannot shoot at all, which is a win without a kill.
//   LEG     20, and he drops to one knee: lower, harder to hit in the
//           head, and his own aim sways.
//
// THE SHOP is paid for out of the fight. A round is worth money, a fast
// round is worth more, a headshot is worth more again, and everything in
// it is either a real stat (three guns, which trade draw speed against
// damage and spread) or a real silhouette change (hats and coats), so
// that what you spend on is visible to the other man.
//
// TWO PLAYERS share the screen: the left man is the mouse, the right man
// is the arrow keys with ENTER to fire, and both have to hold their own
// holster until the word. It is the same game on both sides.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'quickdraw', w: 900, h: 520, bg: '#2a1512' });

// ---------------------------------------------------------------------
// what you can buy
// ---------------------------------------------------------------------
const GUNS = [
  { id: 'colt',   name: 'ARMY COLT',  cost: 0,   dmg: 1.00, draw: 1.00, spread: 0.9,
    note: 'what everyone starts with' },
  { id: 'snub',   name: 'SNUB .38',   cost: 120, dmg: 0.80, draw: 0.72, spread: 1.5,
    note: 'clears the leather fast, wanders' },
  { id: 'buffalo',name: 'BUFFALO',    cost: 260, dmg: 1.55, draw: 1.35, spread: 0.5,
    note: 'slow out, and it only takes one' },
  { id: 'silver', name: 'SILVER PAIR',cost: 420, dmg: 1.15, draw: 0.88, spread: 0.7,
    note: 'no weaknesses, and it shows' },
];
const HATS = [
  { id: 'none',    name: 'NO HAT',      cost: 0 },
  { id: 'stetson', name: 'STETSON',     cost: 60 },
  { id: 'bowler',  name: 'BOWLER',      cost: 90 },
  { id: 'sombrero',name: 'WIDE BRIM',   cost: 150 },
];
const COATS = [
  { id: 'dust',  name: 'DUSTER',   cost: 0,   col: '#8d7051', dark: '#6a523a' },
  { id: 'black', name: 'BLACK',    cost: 70,  col: '#33343e', dark: '#222329' },
  { id: 'red',   name: 'SCARLET',  cost: 110, col: '#9c3a35', dark: '#742722' },
  { id: 'blue',  name: 'INDIGO',   cost: 160, col: '#3b4a78', dark: '#2a3557' },
];

const FOES = [
  { name: 'THE KID',      ms: 620, aim: 0.35 },
  { name: 'DUSTY',        ms: 560, aim: 0.40 },
  { name: 'MAE',          ms: 505, aim: 0.46 },
  { name: 'THE PREACHER', ms: 455, aim: 0.52 },
  { name: 'BILLY',        ms: 410, aim: 0.58 },
  { name: 'CORTEZ',       ms: 370, aim: 0.64 },
  { name: 'THE MARSHAL',  ms: 335, aim: 0.70 },
  { name: 'SILVER',       ms: 305, aim: 0.76 },
  { name: 'THE WIDOW',    ms: 280, aim: 0.82 },
  { name: 'NOBODY',       ms: 250, aim: 0.90 },
];

// ---------------------------------------------------------------------
// saved things
// ---------------------------------------------------------------------
const SAVE = 'pd.quickdraw.';
const load = (k, d) => { try { const v = localStorage.getItem(SAVE + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(SAVE + k, JSON.stringify(v)); } catch (e) {} };

let cash = load('cash', 0);
let owned = load('owned', ['colt', 'none', 'dust']);
let kit = load('kit', { gun: 'colt', hat: 'none', coat: 'dust' });
const gunOf = (id) => GUNS.find((g) => g.id === id) || GUNS[0];
const coatOf = (id) => COATS.find((c) => c.id === id) || COATS[0];

// ---------------------------------------------------------------------
// the fighters
// ---------------------------------------------------------------------
const GROUND = 430;

function newFighter(side, look, stats) {
  return {
    side,                         // -1 left, +1 right
    x: side < 0 ? 190 : D.W - 190,
    look,                         // { hat, coat, skin }
    stats,                        // { dmg, draw, spread, aim, ms }
    hp: 100, alive: true,
    arms: { gun: true, off: true },
    legs: { l: true, r: true },
    kneeling: false,
    drawn: false, drawnAt: 0, fired: false, reload: 0, shots: 0, lastShot: 0,
    // the volley: one shot each, then hands back on the holsters
    falseStarts: 0,        // this FIGHT, not this volley
    penalty: false,        // earned a gunless volley, not served yet
    noGun: false,          // serving it right now
    volleyMs: 400,         // his reaction to this particular word
    wobble: 0, willMiss: false, drawEarlyAt: 0, fumbled: false,
    returnBy: 0,           // hit, and this is when the answer is due
    aimX: 0, aimY: 0,             // where the barrel is pointed
    recoil: 0, sway: 0, flinch: 0,
    hits: [],
  };
}

/** the boxes a bullet can hit, in screen space */
function parts(f) {
  const k = f.kneeling ? 30 : 0;
  const x = f.x;
  return [
    { id: 'head',  x: x - 15, y: GROUND - 128 + k, w: 30, h: 30 },
    { id: 'torso', x: x - 21, y: GROUND - 98 + k,  w: 42, h: 52 },
    { id: 'armGun',x: x + (f.side < 0 ? 16 : -30), y: GROUND - 92 + k, w: 14, h: 40 },
    { id: 'armOff',x: x + (f.side < 0 ? -30 : 16), y: GROUND - 92 + k, w: 14, h: 40 },
    { id: 'legs',  x: x - 19, y: GROUND - 46 + k,  w: 38, h: 46 - k },
  ];
}

/** apply a hit, and say what it did */
function wound(f, part, dmg) {
  if (part === 'head') { f.hp = 0; f.alive = false; return 'HEAD'; }
  if (part === 'torso') { f.hp -= 45 * dmg; }
  else if (part === 'armGun') { f.hp -= 25 * dmg; f.arms.gun = false; }
  else if (part === 'armOff') { f.hp -= 25 * dmg; f.arms.off = false; }
  else if (part === 'legs') { f.hp -= 20 * dmg; f.kneeling = true; f.legs.l = false; }
  f.flinch = 0.35;
  if (f.hp <= 0) { f.hp = 0; f.alive = false; }
  // both arms gone is a loss even at full health - he cannot hold a gun
  if (!f.arms.gun && !f.arms.off) f.alive = false;
  return part === 'armGun' || part === 'armOff' ? 'ARM'
       : part === 'legs' ? 'LEG' : 'BODY';
}

// ---------------------------------------------------------------------
// state
// ---------------------------------------------------------------------
let screen = 'title';            // title | shop | duel | result
let twoPlayer = false;
let me, foe, round, phase, waitFor, t0, msg, msgT, banner, bannerT, earned, shots, flashT;
let volley = 0, lullT = 0, headBonus = false;
const FALSE_LIMIT = 3;          // twitches per fight before it costs you
const VOLLEY_MAX = 2.4;         // seconds after the word before it is over
const ANSWER = 0.25;            // seconds to return fire once you are hit
let p2 = { x: 0, y: 0 };         // the right-hand player's crosshair

function holster(f) {
  // the box your hand has to stay in until the word
  return f.side < 0
    ? { x: f.x - 6, y: GROUND - 68, w: 74, h: 54 }
    : { x: f.x - 68, y: GROUND - 68, w: 74, h: 54 };
}

function startDuel(two) {
  twoPlayer = two;
  round = 0; earned = 0;
  screen = 'duel';
  newRound();
}

function newRound() {
  const g = gunOf(kit.gun);
  me = newFighter(-1, { hat: kit.hat, coat: kit.coat, skin: '#e8b98c' },
                  { dmg: g.dmg, draw: g.draw, spread: g.spread });
  if (twoPlayer) {
    foe = newFighter(1, { hat: 'stetson', coat: 'black', skin: '#c98f66' },
                     { dmg: 1, draw: 1, spread: 1 });
    foe.name = 'RIGHT';
    me.name = 'LEFT';
    p2 = { x: foe.x - 30, y: GROUND - 44 };
  } else {
    const F = FOES[Math.min(round, FOES.length - 1)];
    foe = newFighter(1, { hat: pick(['stetson', 'bowler', 'sombrero']),
                          coat: pick(['black', 'red', 'dust', 'blue']), skin: '#c98f66' },
                     { dmg: 1, draw: 1, spread: 1, ms: F.ms, aim: F.aim });
    foe.name = F.name;
    me.name = 'YOU';
  }
  volley = 0;
  headBonus = false;
  shots = [];
  newVolley();
}

/**
 * One volley: hands down, wait, the word, a shot each.
 *
 * SETTLE FIRST, THEN THE WAIT. The wait cannot start counting until the
 * hand is actually on the holster, and at the start of a fight it never
 * is - the pointer is wherever it was when you clicked PLAY, which is
 * the middle of the screen. The first version went straight to the wait
 * and so every fight began with an instant false start against a player
 * who had not done anything.
 *
 * @param redo true when a twitch aborted the last one, so it does not
 *             count as a volley and no penalty is served
 */
function newVolley(redo) {
  if (!redo) volley++;
  // A PENALTY IS SERVED BY WHATEVER VOLLEY COMES NEXT, re-done or not:
  // the third twitch is answered by the very next word, which is the
  // only reading of "no gun next" that a player would recognise.
  for (const f of [me, foe]) { f.noGun = f.penalty; f.penalty = false; }
  for (const f of [me, foe]) {
    f.drawn = false; f.drawnAt = 0; f.fired = false; f.reload = 0;
    f.returnBy = 0;
  }
  phase = 'settle';
  waitFor = rnd(1.4, 4.0);
  t0 = D.t;
  flashT = 0;
  rollFoe();
}

/**
 * HOW HUMAN HE IS THIS TIME.
 *
 * Liam: *"[the NPC] should [make] mistakes by the way and have human
 * reaction time"*.
 *
 * The old opponent fired at exactly his rated milliseconds after the
 * word, every single time, and the best of them was rated at 250ms -
 * which is the population average for a human, delivered with a
 * precision no human has. That is the thing that felt cheap: not that he
 * was fast, but that he was never off.
 *
 * So his number is rolled fresh for every word, around his average, and
 * three mistakes are rolled with it. All three are scaled by how bad he
 * is, so THE KID fumbles and sprays and jumps the gun, and NOBODY almost
 * never does - which is what a ladder of ten men should feel like.
 */
function rollFoe() {
  if (twoPlayer) return;
  const err = 1 - (foe.stats.aim || 0.5);       // 0.1 for the best, 0.65 for the worst
  foe.volleyMs = (foe.stats.ms || 450) * rnd(0.84, 1.32);
  foe.wobble = rnd(-1, 1) * err * 26;
  foe.willMiss = Math.random() < err * 0.42;
  foe.fumbled = Math.random() < err * 0.34;
  if (foe.fumbled) foe.volleyMs += rnd(150, 430);
  // he can jump the word too, and it costs him what it costs you
  foe.drawEarlyAt = Math.random() < err * 0.17 ? waitFor * rnd(0.35, 0.9) : 0;
}

/** he can only shoot if he has an arm to shoot with */
const canFight = (f) => f.alive && (f.arms.gun || f.arms.off);

/**
 * A twitch.
 *
 * It costs the volley and nothing else, twice. The third one in a fight
 * costs the next volley's gun, and then the count starts again.
 */
function falseStart(f) {
  f.falseStarts++;
  const who = f === me ? (twoPlayer ? 'LEFT' : 'YOU') : (twoPlayer ? 'RIGHT' : 'HE');
  D.noise(0.26, 0.06, 250);
  if (f.falseStarts >= FALSE_LIMIT) {
    f.falseStarts = 0;
    f.penalty = true;
    msg = who + ' DREW EARLY THREE TIMES  -  NO GUN NEXT';
    D.beep(140, 0.3, 'square', 0.06, -80);
  } else {
    msg = who + ' DREW EARLY  -  AGAIN  (' + f.falseStarts + ' of ' + FALSE_LIMIT + ')';
  }
  msgT = 2;
  newVolley(true);
}

// ---------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------
function step(dt, g) {
  if (screen === 'title') { drawTown(g); title(g); return; }
  if (screen === 'shop') { drawTown(g); shop(g); return; }

  const taps = D.tapped();

  // P2's crosshair
  if (twoPlayer) {
    const sp = 420 * dt;
    if (D.held('ArrowLeft')) p2.x -= sp;
    if (D.held('ArrowRight')) p2.x += sp;
    if (D.held('ArrowUp')) p2.y -= sp;
    if (D.held('ArrowDown')) p2.y += sp;
    p2.x = clamp(p2.x, D.W / 2, D.W - 20); p2.y = clamp(p2.y, 20, D.H - 20);
  }

  const myPtr = { x: D.mouse.x, y: D.mouse.y };
  const foePtr = twoPlayer ? p2 : null;

  // ?shot is a posed photograph of a fight, not a fight
  if (D.shot) { drawTown(g); drawDuel(g, myPtr, foePtr); return; }

  if (phase === 'settle') {
    // nothing counts until every hand is on its own holster
    const ready = inBox(myPtr, holster(me)) && (!twoPlayer || inBox(foePtr, holster(foe)));
    if (ready) { phase = 'ready'; t0 = D.t; D.beep(220, 0.06, 'sine', 0.04); }
  } else if (phase === 'ready') {
    // LEAVING THE HOLSTER EARLY IS A FALSE START - and a false start is a
    // re-do, not a death. A man with no gun is allowed to move his hand;
    // there is nothing in it to pull.
    const outMe = !me.noGun && canFight(me) && !inBox(myPtr, holster(me));
    const outFoe = twoPlayer
      ? (!foe.noGun && canFight(foe) && !inBox(foePtr, holster(foe)))
      : (foe.drawEarlyAt > 0 && D.t - t0 > foe.drawEarlyAt);
    if (outMe || outFoe) {
      falseStart(outMe ? me : foe);
    } else if (D.t - t0 > waitFor) {
      phase = 'draw'; t0 = D.t; flashT = 0.14;
      D.beep(900, 0.09, 'square', 0.06);
    }
  } else if (phase === 'draw') {
    const el = (D.t - t0) * 1000;          // milliseconds since the word

    // ---- ANSWER IT ---------------------------------------------------
    // A quarter of a second from the moment his bullet lands. Firing
    // clears it (fireAt does that); running out of it does not wound
    // you, it finishes you.
    for (const f of [me, foe]) {
      if (!f.returnBy || !f.alive) continue;
      if (D.t <= f.returnBy) continue;
      f.returnBy = 0;
      f.alive = false;
      msg = (f === me ? (twoPlayer ? 'LEFT' : 'YOU') : (twoPlayer ? 'RIGHT' : 'HE'))
          + ' NEVER ANSWERED';
      msgT = 1.6;
      D.noise(0.4, 0.08, 210);
    }

    // ---- you ---------------------------------------------------------
    handle(me, myPtr, dt, taps > 0);

    // ---- him ---------------------------------------------------------
    if (twoPlayer) {
      handle(foe, foePtr, dt, firedP2());
    } else if (canFight(foe) && !foe.fired && !foe.noGun) {
      // ONE CLOCK, AND IT IS THE ONE ROLLED FOR THIS WORD. His hand
      // starts moving a little over half way through his reaction and
      // the shot goes at the end of it - see rollFoe() for where the
      // number came from and what can go wrong with it.
      if (!foe.drawn && el > foe.volleyMs * 0.55) { foe.drawn = true; foe.drawnAt = D.t; }
      if (foe.drawn && el > foe.volleyMs) {
        // he aims at a part, better opponents at better parts
        const r = Math.random();
        const part = r < foe.stats.aim * 0.35 ? 'head'
                   : r < foe.stats.aim * 0.95 ? 'torso'
                   : pick(['armGun', 'armOff', 'legs', 'torso']);
        const box = parts(me).find((q) => q.id === part) || parts(me)[1];
        let ax = box.x + box.w / 2 + foe.wobble;
        let ay = box.y + box.h / 2;
        // and sometimes he simply pulls it wide, which is the mistake a
        // player can actually SEE him make
        if (foe.willMiss) { ax += (Math.random() < 0.5 ? -1 : 1) * rnd(46, 96); ay -= rnd(0, 44); }
        fireAt(foe, me, ax, ay);
      }
    }

    // ---- IS THE VOLLEY DONE? -----------------------------------------
    // Everybody who could shoot has, or the word has been up long enough
    // that whoever has not is not going to. Either way: hands back down.
    const spent = [me, foe].every((f) => !canFight(f) || f.noGun || f.fired)
                && !me.returnBy && !foe.returnBy;
    if (spent || D.t - t0 > VOLLEY_MAX) { phase = 'lull'; lullT = 0.9; }
  } else if (phase === 'lull') {
    // A BEAT TO SEE WHAT HAPPENED, then either the fight is over or you
    // put your hand back on the holster and do it again.
    lullT -= dt;
    if (lullT <= 0) {
      const iCan = canFight(me), heCan = canFight(foe);
      if (iCan && heCan) newVolley();
      else {
        phase = 'over';
        if (!heCan && iCan) { msg = twoPlayer ? 'LEFT WINS' : 'YOU WIN'; finish(true); }
        else if (!iCan && heCan) { msg = twoPlayer ? 'RIGHT WINS' : 'HE PUT YOU DOWN'; finish(false); }
        else { msg = 'BOTH DOWN'; finish(false); }
      }
    }
  } else if (phase === 'over') {
    if (taps) {
      if (!twoPlayer && me.alive) {
        round++;
        if (round >= FOES.length) { screen = 'result'; home.finish(earned, { rounds: round }); }
        else newRound();
      } else if (twoPlayer) newRound();
      else { screen = 'result'; home.finish(earned, { rounds: round }); }
    }
  }

  for (const s of shots) s.life -= dt;
  shots = shots.filter((s) => s.life > 0);
  for (const f of [me, foe]) {
    f.recoil = Math.max(0, f.recoil - dt * 5);
    f.flinch = Math.max(0, f.flinch - dt);
    f.sway += dt;
  }
  flashT = Math.max(0, flashT - dt);
  if (msgT > 0) msgT -= dt;

  drawTown(g);
  drawDuel(g, myPtr, foePtr);

  if (screen === 'result') {
    D.card(round >= FOES.length ? 'THAT IS ALL TEN' : 'THE RUN IS OVER',
           ['$' + cash + ' in your pocket',
            round >= FOES.length ? 'the street is yours' : 'spend it and come back'],
           'click for the town');
    // `taps`, NOT another D.tapped(). The counter was drained at the top
    // of this function, so asking again always returns nothing and this
    // screen could never be dismissed.
    if (taps) { screen = 'title'; round = 0; }
    return;
  }
}

let p2Fired = false;
addEventListener('keydown', (e) => {
  if ((e.code === 'Enter' || e.code === 'ShiftRight' || e.code === 'Slash') && !e.repeat) p2Fired = true;
});
function firedP2() { const v = p2Fired; p2Fired = false; return v; }

/** the halfway line: your hand belongs on your own side of it */
const HALF = () => D.W / 2;
const ownSide = (f, ptr) => (f.side < 0 ? ptr.x <= HALF() : ptr.x >= HALF());

/** one human fighter: pull out of the holster, aim, fire */
function handle(f, ptr, dt, fired) {
  // NO GUN means no gun: he stands there and wears it, which is the
  // whole point of the penalty.
  if (!canFight(f) || f.fired || f.noGun) return;
  const h = holster(f);
  if (!f.drawn) {
    if (!inBox(ptr, h)) { f.drawn = true; f.drawnAt = D.t; D.beep(560, 0.05, 'square', 0.04); }
    return;
  }
  // THE GUN FOLLOWS THE HAND once it is clear of the leather, and the
  // hand cannot cross the halfway line - see the note at the top of the
  // file. The muzzle is clamped to this side of it so the arm still
  // tracks sensibly when the cursor wanders over; the SHOT is refused
  // outright, because a rule you cannot break is a rule nobody learns.
  f.aimX = f.side < 0 ? Math.min(ptr.x, HALF()) : Math.max(ptr.x, HALF());
  f.aimY = ptr.y;
  const ready = (D.t - f.drawnAt) > 0.10 * f.stats.draw;
  if (!fired || !ready) return;
  if (!ownSide(f, ptr)) {
    msg = 'KEEP YOUR HAND ON YOUR OWN SIDE';
    msgT = 0.9;
    D.beep(150, 0.06, 'square', 0.04);
    return;
  }
  fireAt(f, f === me ? foe : me, f.aimX, f.aimY);
}

const inBox = (p, b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

/** a shot: from the gun, through the point aimed at, into whatever it meets */
function fireAt(from, target, ax, ay) {
  from.fired = true;                      // one shot a volley, each
  from.returnBy = 0;                      // and it answers anything owed
  from.shots = (from.shots || 0) + 1;
  from.lastShot = D.t * 1000;
  // how long until this gun is back: the slower it is out of the leather
  // the slower it comes back round, which is what the BUFFALO trades
  from.reload = 0.55 * (from.stats.draw || 1);
  from.recoil = 1;
  const gx = gunPos(from).x, gy = gunPos(from).y;
  // spread: a wobbly gun moves the point of impact, more at distance
  const sp = (from.stats.spread || 1) * (from.kneeling ? 16 : 9)
           * (from.arms.gun ? 1 : 2.2);          // shooting off-hand is worse
  const tx = ax + rnd(-sp, sp), ty = ay + rnd(-sp, sp);
  shots.push({ x1: gx, y1: gy, x2: tx + (tx - gx) * 3, y2: ty + (ty - gy) * 3, life: 0.22 });
  D.noise(0.22, 0.09, 260);
  D.beep(120, 0.12, 'square', 0.05, -60);

  // what did it cross?
  let best = null, bestT = Infinity;
  for (const p of parts(target)) {
    const t = rayBox(gx, gy, tx - gx, ty - gy, p);
    if (t !== null && t < bestT) { bestT = t; best = p; }
  }
  if (!best) { msg = from === me ? 'MISSED' : 'HE MISSED'; msgT = 1.1; return; }
  const what = wound(target, best.id, from.stats.dmg || 1);
  target.hits.push({ x: best.x + best.w / 2, y: best.y + best.h / 2, t: D.t });
  if (what === 'HEAD' && from === me) headBonus = true;
  // THE CLOCK. Only for a man who still has a shot in him: one who has
  // already fired this volley, or who is standing there with no gun, has
  // nothing to answer with and is not asked to.
  if (target.alive && !target.fired && !target.noGun && canFight(target)) {
    target.returnBy = D.t + ANSWER;
  }
  msg = (from === me ? '' : 'HE HIT YOUR ') + what + (what === 'HEAD' ? '  —  DOWN' : '');
  msgT = 1.3;
  D.beep(what === 'HEAD' ? 900 : 300, 0.1, 'square', 0.05, -200);
}

/** where the muzzle is */
function gunPos(f) {
  const k = f.kneeling ? 30 : 0;
  if (!f.drawn) return { x: f.x + f.side * 22, y: GROUND - 62 + k };
  const a = Math.atan2(f.aimY - (GROUND - 86 + k), f.aimX - f.x);
  return { x: f.x + Math.cos(a) * 40, y: GROUND - 86 + k + Math.sin(a) * 40 };
}

function rayBox(ox, oy, dx, dy, b) {
  // slab test, only forwards
  let tmin = 0, tmax = 1e9;
  for (const [o, d, lo, hi] of [[ox, dx, b.x, b.x + b.w], [oy, dy, b.y, b.y + b.h]]) {
    if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

function finish(won) {
  if (twoPlayer) return;
  if (won) {
    // money: the fight, how fast the last word went, whether you took
    // his head off, and how few volleys it took to put him down - a fight
    // won in one exchange is worth more than one won by attrition
    const speed = Math.max(0, 1.2 - (D.t - t0));
    const pay = 40 + Math.round(speed * 60) + (headBonus ? 40 : 0)
              + Math.max(0, 4 - volley) * 12 + round * 6;
    cash += pay; earned += pay;
    store('cash', cash);
    banner = '+$' + pay; bannerT = 2;
    D.record(cash);
  }
}

// =====================================================================
// drawing
// =====================================================================
function drawTown(g) {
  // sky: a late sun, low
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#3b2036');
  sky.addColorStop(0.45, '#a0472f');
  sky.addColorStop(0.78, '#e08b3c');
  sky.addColorStop(1, '#f2c073');
  g.fillStyle = sky; g.fillRect(0, 0, D.W, GROUND);
  g.fillStyle = '#ffd98a';
  g.beginPath(); g.arc(D.W / 2, GROUND - 40, 86, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,235,170,.18)';
  g.beginPath(); g.arc(D.W / 2, GROUND - 40, 140, 0, 7); g.fill();

  // far hills
  g.fillStyle = '#6b3a2c';
  g.beginPath(); g.moveTo(0, GROUND - 30);
  for (let x = 0; x <= D.W; x += 60) g.lineTo(x, GROUND - 40 - Math.sin(x * 0.011) * 26 - ((x * 7) % 17));
  g.lineTo(D.W, GROUND); g.lineTo(0, GROUND); g.fill();

  // the two rows of buildings, as silhouettes with lit windows
  town(g, 0, 1);
  town(g, D.W, -1);

  // the street
  g.fillStyle = '#6a4530'; g.fillRect(0, GROUND, D.W, D.H - GROUND);
  g.fillStyle = '#7a5138'; g.fillRect(0, GROUND, D.W, 6);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = 'rgba(0,0,0,.10)';
    const x = (i * 137) % D.W, y = GROUND + 8 + ((i * 53) % (D.H - GROUND - 10));
    g.fillRect(x, y, 6 + (i % 7), 2);
  }
  // ruts
  g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 5;
  for (const y of [GROUND + 26, GROUND + 52]) {
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(D.W * 0.3, y - 6, D.W * 0.7, y + 6, D.W, y); g.stroke();
  }
}

function town(g, edge, dir) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const w = 90 + i * 14, h = 130 - i * 16;
    const x = edge + dir * (i * 86) - (dir > 0 ? 0 : w);
    g.fillStyle = i % 2 ? '#3a2118' : '#452a1d';
    g.fillRect(x, GROUND - h, w, h);
    // a false front and a porch roof
    g.fillStyle = '#2e1a12';
    g.fillRect(x - 4, GROUND - h - 10, w + 8, 12);
    g.fillRect(x - 10 * dir, GROUND - 52, w + 12, 7);
    // windows, some lit
    for (let wy = 0; wy < 2; wy++) for (let wx = 0; wx < 3; wx++) {
      const lit = ((i + wx + wy) % 3) === 0;
      g.fillStyle = lit ? 'rgba(255,196,110,.75)' : 'rgba(20,12,10,.85)';
      g.fillRect(x + 14 + wx * 26, GROUND - h + 22 + wy * 34, 16, 22);
    }
    // posts
    g.fillStyle = '#2e1a12';
    for (let p = 0; p < 3; p++) g.fillRect(x + 8 + p * (w / 3), GROUND - 52, 5, 52);
  }
}

function drawDuel(g, myPtr, foePtr) {
  // the two men
  fighter(g, foe);
  fighter(g, me);

  // shots
  for (const s of shots) {
    g.strokeStyle = 'rgba(255,236,180,' + clamp(s.life * 5, 0, 1) + ')';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
  }

  // the holsters, while they matter
  const waiting = phase === 'settle' || phase === 'ready';
  if ((waiting || (phase === 'draw' && !me.drawn)) && !me.noGun) holsterBox(g, me, myPtr);
  if (twoPlayer && (waiting || (phase === 'draw' && !foe.drawn)) && !foe.noGun) {
    holsterBox(g, foe, foePtr);
  }

  // ---- THE HALFWAY LINE ----------------------------------------------
  // Your hand lives on your own side of it. It is only drawn while it is
  // being enforced, because a line across the picture the rest of the
  // time is just clutter.
  if (phase === 'draw' || phase === 'ready' || phase === 'settle') {
    const hx = Math.round(D.W / 2);
    const offside = myPtr && myPtr.x > hx;
    g.strokeStyle = offside ? 'rgba(255,110,110,.75)' : 'rgba(255,240,210,.22)';
    g.lineWidth = offside ? 2 : 1;
    g.setLineDash([7, 9]);
    g.beginPath(); g.moveTo(hx, 150); g.lineTo(hx, GROUND + 40); g.stroke();
    g.setLineDash([]);
    if (offside && phase === 'draw') {
      D.text('YOUR SIDE', hx - 10, 168, 11, '#ff9f9f', 'right');
      D.text('HIS', hx + 10, 168, 11, 'rgba(255,160,160,.6)');
    }
  }

  // ---- ANSWER IT: the quarter second after his bullet lands ----------
  for (const f of [me, foe]) {
    if (!f.returnBy || !f.alive) continue;
    const left = clamp(f.returnBy - D.t, 0, ANSWER) / ANSWER;
    const bx = f.x - 46, by = GROUND + 16;
    g.fillStyle = 'rgba(10,6,5,.7)'; g.fillRect(bx, by, 92, 9);
    g.fillStyle = left > 0.45 ? '#ffd166' : '#ff5c5c';
    g.fillRect(bx, by, 92 * left, 9);
    D.text('SHOOT BACK', f.x, by + 24, 10, '#ff9f9f', 'center');
  }

  // ---- WHAT THIS VOLLEY COSTS HIM ------------------------------------
  // An empty hand and a count of twitches are both things a player has
  // to be able to see, on the man they belong to.
  for (const f of [me, foe]) {
    if (!f.alive) continue;
    if (f.noGun) {
      const bx = f.x - 52, by = GROUND + 16;
      g.fillStyle = 'rgba(90,10,10,.75)'; g.fillRect(bx, by, 104, 16);
      D.text('NO GUN', f.x, by + 12, 12, '#ff9f9f', 'center');
      D.text('this one is free for him', f.x, by + 30, 9, 'rgba(255,170,170,.75)', 'center');
    } else if (f.falseStarts > 0 && (phase === 'settle' || phase === 'ready')) {
      D.text('EARLY  ' + f.falseStarts + '/' + FALSE_LIMIT, f.x, GROUND + 28, 11,
             f.falseStarts >= FALSE_LIMIT - 1 ? '#ff9f9f' : '#ffd166', 'center');
    }
  }

  // the crosshairs
  if (phase === 'draw' && me.drawn && !me.fired) {
    cross(g, myPtr.x, myPtr.y, myPtr.x > D.W / 2 ? '#ff6b6b' : '#ffe9a8');
  }
  if (twoPlayer && phase === 'draw' && foe.drawn && !foe.fired) cross(g, foePtr.x, foePtr.y, '#a8d8ff');
  if (twoPlayer && phase === 'ready') cross(g, foePtr.x, foePtr.y, 'rgba(168,216,255,.5)');

  if (flashT > 0) { g.fillStyle = 'rgba(255,255,255,' + flashT * 2.2 + ')'; g.fillRect(0, 0, D.W, D.H); }

  // ---- the words -----------------------------------------------------
  if (phase === 'settle') {
    D.text(me.noGun ? 'HAND ON YOUR HIP  -  YOU HAVE NO GUN'
                    : 'PUT YOUR HAND ON THE HOLSTER',
           D.W / 2, 92, 22, 'rgba(40,20,14,.8)', 'center');
    D.text(volley > 1 ? 'volley ' + volley + ' - it goes on until one of you is down'
                      : 'the wait starts when it is there',
           D.W / 2, 118, 12, 'rgba(40,20,14,.6)', 'center');
  }
  if (phase === 'ready') {
    D.text('WAIT', D.W / 2, 92, 34, 'rgba(40,20,14,.75)', 'center');
    D.text('keep the pointer on your holster', D.W / 2, 118, 12, 'rgba(40,20,14,.6)', 'center');
  }
  if (phase === 'draw') D.text('DRAW', D.W / 2, 96, 52, '#fff6e0', 'center');
  if (phase === 'lull' && msgT <= 0) {
    D.text('HANDS DOWN', D.W / 2, 96, 26, 'rgba(255,240,220,.7)', 'center');
  }
  if (phase === 'over') {
    D.text(msg, D.W / 2, 96, 30, msg.includes('WIN') ? '#ffe9a8' : '#ff9f9f', 'center');
    D.text('click to go on', D.W / 2, D.H - 22, 11, 'rgba(255,240,220,.6)', 'center');
  } else if (msgT > 0) {
    D.text(msg, D.W / 2, 140, 16, '#ffd9a8', 'center');
  }
  if (bannerT > 0) { bannerT -= D.dt; D.text(banner, D.W / 2, 170, 20, '#9ff0a8', 'center'); }

  // ---- the bars ------------------------------------------------------
  health(g, me, 16, true);
  health(g, foe, D.W - 236, false);

  D.hud(twoPlayer ? 'TWO PLAYER' : 'ROUND ' + Math.min(round + 1, FOES.length) + '/10   ' + foe.name,
        (twoPlayer ? 'ENTER fires · arrows aim' : '$' + cash) + '    VOLLEY ' + volley);
}

function holsterBox(g, f, ptr) {
  const h = holster(f);
  const inside = ptr && inBox(ptr, h);
  g.strokeStyle = inside ? 'rgba(120,255,170,.85)' : 'rgba(255,120,120,.9)';
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  g.strokeRect(h.x, h.y, h.w, h.h);
  g.setLineDash([]);
  g.fillStyle = inside ? 'rgba(120,255,170,.10)' : 'rgba(255,120,120,.12)';
  g.fillRect(h.x, h.y, h.w, h.h);
  D.text('HOLSTER', h.x + h.w / 2, h.y - 6, 9, inside ? '#8affc0' : '#ff9f9f', 'center');
}

function cross(g, x, y, col) {
  g.strokeStyle = col; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - 12, y); g.lineTo(x - 4, y); g.moveTo(x + 4, y); g.lineTo(x + 12, y);
  g.moveTo(x, y - 12); g.lineTo(x, y - 4); g.moveTo(x, y + 4); g.lineTo(x, y + 12);
  g.stroke();
  g.strokeStyle = col; g.beginPath(); g.arc(x, y, 15, 0, 7); g.stroke();
}

function health(g, f, x, mine) {
  const w = 220;
  g.fillStyle = 'rgba(20,10,8,.55)'; g.fillRect(x, 40, w, 40);
  D.text(f.name || (mine ? 'YOU' : 'HIM'), x + 8, 56, 11, '#ffe9c0');
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 8, 62, w - 16, 9);
  g.fillStyle = f.hp > 55 ? '#8fd98f' : f.hp > 25 ? '#ffd166' : '#ff6b8b';
  g.fillRect(x + 8, 62, (w - 16) * (f.hp / 100), 9);
  // what he has lost
  const gone = [];
  if (!f.arms.gun) gone.push('GUN ARM');
  if (!f.arms.off) gone.push('OFF ARM');
  if (f.kneeling) gone.push('LEG');
  if (gone.length) D.text(gone.join(' · '), x + w - 8, 56, 9, '#ff9f9f', 'right');
}

// ---- a man, drawn from parts so damage is visible --------------------
function fighter(g, f) {
  const k = f.kneeling ? 30 : 0;
  const x = f.x, base = GROUND + k;
  const coat = coatOf(f.look.coat);
  const lean = f.flinch > 0 ? Math.sin(f.flinch * 40) * 3 : 0;

  g.save();
  g.translate(lean, 0);

  // shadow on the street
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(x, GROUND + 6, 34, 8, 0, 0, 7); g.fill();

  // legs
  if (f.kneeling) {
    g.fillStyle = coat.dark;
    g.fillRect(x - 18, base - 46, 16, 46);
    g.fillRect(x + 2, base - 24, 26, 20);
  } else {
    g.fillStyle = coat.dark;
    g.fillRect(x - 17, base - 46, 14, 46);
    g.fillRect(x + 3, base - 46, 14, 46);
    g.fillStyle = '#33241a';
    g.fillRect(x - 19, base - 8, 18, 8);
    g.fillRect(x + 1, base - 8, 18, 8);
  }

  // coat body
  g.fillStyle = coat.col;
  g.fillRect(x - 21, base - 98, 42, 54);
  g.fillStyle = coat.dark;
  g.fillRect(x - 21, base - 98, 8, 54);            // shaded side
  g.fillRect(x - 21, base - 52, 42, 8);            // hem
  // a shirt showing at the front
  g.fillStyle = '#d8cbb0';
  g.fillRect(x - 6, base - 94, 12, 34);

  // head and hat
  g.fillStyle = f.look.skin;
  g.fillRect(x - 12, base - 126, 24, 28);
  g.fillStyle = 'rgba(0,0,0,.2)';
  g.fillRect(x - 12, base - 126, 7, 28);
  g.fillStyle = '#1d1512';
  g.fillRect(x + (f.side < 0 ? 4 : -8), base - 116, 4, 4);       // eye
  // moustache, because it is a western
  g.fillStyle = '#3a2a20';
  g.fillRect(x - 6, base - 106, 12, 3);
  hat(g, f, x, base);

  // arms
  const shoulder = { x: x + f.side * 16, y: base - 90 };
  const off = { x: x - f.side * 16, y: base - 90 };
  if (f.arms.off) {
    g.fillStyle = coat.col;
    g.fillRect(off.x - 6, off.y, 12, 34);
  } else stump(g, off.x, off.y);
  if (f.arms.gun) {
    if (f.drawn) {
      const gp = gunPos(f);
      const a = Math.atan2(gp.y - shoulder.y, gp.x - shoulder.x);
      g.save();
      g.translate(shoulder.x, shoulder.y);
      g.rotate(a - f.recoil * 0.35 * f.side);
      g.fillStyle = coat.col;
      g.fillRect(0, -6, 30, 12);
      g.fillStyle = f.look.skin;
      g.fillRect(26, -5, 10, 10);
      gun(g, 34, 0, f);
      g.restore();
    } else {
      g.fillStyle = coat.col;
      g.fillRect(shoulder.x - 6, shoulder.y, 12, 30);
      g.fillStyle = f.look.skin;
      g.fillRect(shoulder.x - 5, shoulder.y + 28, 10, 9);
      // the gun still in the leather
      g.fillStyle = '#4a3428';
      g.fillRect(shoulder.x - 8 + f.side * 4, shoulder.y + 30, 16, 20);
      g.fillStyle = '#8d8f96';
      g.fillRect(shoulder.x - 3 + f.side * 4, shoulder.y + 26, 6, 10);
    }
  } else stump(g, shoulder.x, shoulder.y);

  // blood marks where he has been hit
  for (const h of f.hits) {
    g.fillStyle = 'rgba(150,26,30,.85)';
    g.beginPath(); g.arc(h.x - lean, h.y, 5, 0, 7); g.fill();
    g.beginPath(); g.arc(h.x - lean + 5, h.y + 6, 3, 0, 7); g.fill();
  }

  if (!f.alive) {
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(x - 30, base - 130, 60, 130);
  }
  g.restore();
}

function stump(g, x, y) {
  g.fillStyle = '#7a2a28';
  g.fillRect(x - 5, y, 10, 10);
  g.fillStyle = 'rgba(150,26,30,.8)';
  g.fillRect(x - 6, y + 8, 12, 4);
}

function hat(g, f, x, base) {
  const id = f.look.hat;
  if (id === 'none') { g.fillStyle = '#4a3a2a'; g.fillRect(x - 12, base - 130, 24, 5); return; }
  const col = id === 'bowler' ? '#2e2620' : '#7a5a34';
  g.fillStyle = col;
  const brim = id === 'sombrero' ? 46 : id === 'bowler' ? 26 : 34;
  g.fillRect(x - brim / 2, base - 130, brim, 6);
  g.fillRect(x - 11, base - 144, 22, 15);
  if (id === 'stetson' || id === 'sombrero') {
    g.fillStyle = '#5a3f22';
    g.fillRect(x - 11, base - 134, 22, 4);
  }
}

function gun(g, x, y, f) {
  const id = kit.gun && f === me ? kit.gun : 'colt';
  const body = id === 'silver' ? '#d8dde4' : id === 'buffalo' ? '#6a6f78' : '#8d8f96';
  g.fillStyle = body;
  const len = id === 'buffalo' ? 26 : id === 'snub' ? 12 : 18;
  g.fillRect(x, y - 3, len, 6);
  g.fillStyle = '#4a3428';
  g.fillRect(x - 6, y - 1, 8, 12);
  g.fillStyle = body;
  g.beginPath(); g.arc(x + 2, y, 5, 0, 7); g.fill();
  if (f.recoil > 0.5) {
    g.fillStyle = 'rgba(255,220,150,' + (f.recoil - 0.5) * 2 + ')';
    g.beginPath();
    g.moveTo(x + len, y - 7); g.lineTo(x + len + 22, y); g.lineTo(x + len, y + 7);
    g.closePath(); g.fill();
  }
}

// =====================================================================
// the title and the shop
// =====================================================================
const hits = [];
function button(g, x, y, w, h, label, sub, on) {
  const hot = D.mouse.x > x && D.mouse.x < x + w && D.mouse.y > y && D.mouse.y < y + h;
  g.fillStyle = on ? 'rgba(255,190,110,.92)' : hot ? 'rgba(60,40,30,.92)' : 'rgba(30,18,14,.86)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = on ? '#ffe9a8' : hot ? '#c08a52' : '#6a4a34';
  g.lineWidth = 2; g.strokeRect(x, y, w, h);
  D.text(label, x + w / 2, y + (sub ? 24 : h / 2 + 5), 13, on ? '#2a1a10' : '#ffe9c0', 'center');
  if (sub) D.text(sub, x + w / 2, y + 42, 10, on ? '#5a3a20' : '#b09070', 'center');
  hits.push({ x, y, w, h, hot });
  return hot;
}

function title(g) {
  home.o.buttons[2].sub = '$' + cash + ' in your pocket';
  home.step(D.dt);
}

function shop(g) {
  g.fillStyle = 'rgba(20,10,8,.60)'; g.fillRect(0, 0, D.W, D.H);
  D.text('THE SHOP', 40, 60, 26, '#ffe9a8');
  D.text('$' + cash, D.W - 40, 60, 22, '#9ff0a8', 'right');
  hits.length = 0;

  const rows = [
    { list: GUNS, key: 'gun', label: 'IRON', y: 92 },
    { list: HATS, key: 'hat', label: 'HAT', y: 216 },
    { list: COATS, key: 'coat', label: 'COAT', y: 320 },
  ];
  for (const r of rows) {
    D.text(r.label, 40, r.y + 16, 11, '#c9a882');
    let x = 110;
    for (const item of r.list) {
      const have = owned.includes(item.id);
      const on = kit[r.key] === item.id;
      const w = r.key === 'gun' ? 170 : 120, h = r.key === 'gun' ? 86 : 62;
      const hot = button(g, x, r.y, w, h,
        item.name, have ? (on ? 'EQUIPPED' : 'equip') : '$' + item.cost, on);
      if (r.key === 'gun') {
        D.text('dmg ' + item.dmg.toFixed(2) + '  draw ' + item.draw.toFixed(2),
               x + w / 2, r.y + 60, 9, on ? '#5a3a20' : '#9a7c5c', 'center');
        D.text(item.note, x + w / 2, r.y + 74, 8, on ? '#5a3a20' : '#7a6048', 'center');
      }
      if (hot && D.tapped()) {
        if (have) { kit[r.key] = item.id; store('kit', kit); D.beep(620, .08, 'triangle', .05, 200); }
        else if (cash >= item.cost) {
          cash -= item.cost; owned.push(item.id); kit[r.key] = item.id;
          store('cash', cash); store('owned', owned); store('kit', kit);
          D.beep(820, .16, 'triangle', .06, 300);
        } else { D.noise(0.15, 0.05, 400); }
      }
      x += w + 12;
    }
  }

  // the man himself, wearing it
  const dummy = newFighter(-1, { hat: kit.hat, coat: kit.coat, skin: '#e8b98c' }, { dmg: 1, draw: 1, spread: 1 });
  dummy.x = D.W - 130;
  fighter(g, dummy);

  const back = button(g, 40, D.H - 70, 160, 46, 'BACK', null);
  if (back && D.tapped()) screen = 'title';
}

// =====================================================================
const board = new Board('quickdraw', { unit: 'MONEY', format: (v) => '$' + Math.round(v).toLocaleString() });
const home = new Home(D, {
  title: 'QUICKDRAW',
  lines: ['hand on the holster until the word, then pull it clear',
          'your hand stays on your side - the gun points along your arm',
          'hit? a quarter second to shoot back, or it puts you down'],
  board,
  buttons: [
    { label: 'ONE PLAYER', sub: 'ten men, each one faster', fn: () => startDuel(false) },
    { label: 'TWO PLAYER', sub: 'mouse against the arrow keys', fn: () => startDuel(true) },
    { label: 'THE SHOP', sub: '', fn: () => { screen = 'shop'; } },
  ],
  hint: 'head is instant · an arm is that arm gone · three early draws costs you your gun',
  wash: 'rgba(20,10,8,.55)',
});

screen = 'title';
me = newFighter(-1, { hat: kit.hat, coat: kit.coat, skin: '#e8b98c' }, { dmg: 1, draw: 1, spread: 1 });
foe = newFighter(1, { hat: 'stetson', coat: 'black', skin: '#c98f66' }, { dmg: 1, draw: 1, spread: 1 });
round = 0; phase = 'ready'; msg = ''; msgT = 0; banner = ''; bannerT = 0; shots = []; flashT = 0; t0 = 0; waitFor = 99;

if (D.shot) {
  screen = 'duel'; twoPlayer = false;
  round = 4; startDuel(false); round = 4;
  foe.name = FOES[4].name;
  volley = 3;
  phase = 'draw'; t0 = D.t - 0.2; flashT = 0.1;
  me.drawn = true; me.aimX = foe.x - 40; me.aimY = GROUND - 120;
  me.recoil = 0.9;
  foe.drawn = true; foe.aimX = me.x + 40; foe.aimY = GROUND - 100;
  foe.hits.push({ x: foe.x - 6, y: GROUND - 80, t: 0 });
  foe.hp = 55; foe.arms.off = false;
  shots.push({ x1: me.x + 40, y1: GROUND - 86, x2: foe.x - 10, y2: GROUND - 118, life: 0.2 });
  msg = 'ARM'; msgT = 2;
}

// What the tools need to see: tools/duel.mjs plays a whole round through
// the real input path and checks the holster, the aim and the wounds.
window.__qd = {
  state: () => ({ screen, phase, twoPlayer, round, cash, volley,
                  falseStartsMe: me.falseStarts, noGunMe: me.noGun,
                  falseStartsFoe: foe.falseStarts, noGunFoe: foe.noGun,
                  // where the home screen actually put its buttons this frame,
                  // so a test never has to guess at coordinates
                  buttons: (home.hot || []).map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h })),
                  me: snap(me), foe: snap(foe), msg,
                  holsterMe: holster(me), holsterFoe: holster(foe),
                  parts: parts(foe) }),
  // skip the random wait, so a test does not sit there for four seconds
  hurry: () => { waitFor = 0.05; foe.drawEarlyAt = 0; },
  // and hold him off, so a test can prove its own shot landed without
  // being interrupted by his
  slowFoe: (ms) => { foe.volleyMs = ms === undefined ? 4000 : ms; },
  // TAKE THE DICE OUT OF YOUR OWN GUN, so a test can prove the claim
  // that the shot goes out along the line from the shoulder through the
  // hand. With the spread on, that claim is only true on average, and a
  // test that is true on average fails at random.
  steady: () => { me.stats.spread = 0; },
  // put one of his shots exactly where the test wants it, so the answer
  // clock can be checked without waiting on his own dice
  foeFire: (part) => {
    const box = parts(me).find((q) => q.id === part) || parts(me)[1];
    fireAt(foe, me, box.x + box.w / 2, box.y + box.h / 2);
  },
};
const snap = (f) => f && ({ hp: f.hp, alive: f.alive, drawn: f.drawn, fired: f.fired,
                            arms: { ...f.arms }, kneeling: f.kneeling, name: f.name,
                            owes: f.returnBy > 0, noGun: f.noGun,
                            falseStarts: f.falseStarts });

D.run(step);
