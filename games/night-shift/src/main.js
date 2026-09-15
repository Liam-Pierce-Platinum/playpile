// ===================== NIGHT SHIFT =====================
// You are wanted in New York. Stay free as long as you can.
//
// There is no finish line and no score to chase down - there is a clock, and it
// only stops when they get their hands on you. Everything else is in service of
// that: the car, the boroughs, the buildings you can cut through, the garage
// you can vanish into. Survive.
//
// The whole game is the loop between three states. In the car you are fast and
// obvious. On foot you are slow and hard to find. Inside you are gone, but so
// is your car, and they are still out there looking.

import { City, BOROUGHS, interiorOf } from './city.js';
import { Combat } from './combat.js';
import { Manhunt, KIT } from './manhunt.js';
import { WEAPONS, WEAPON_BY_ID } from './weapons.js';
import { TrafficStop, STOP } from './stop.js';
import { Car, resolveCarCollisions, carsTouching, clamp } from './physics.js';
import { CityTraffic } from './citytraffic.js';
import { CityPolice } from './citycops.js';
import { CityRenderer } from './cityrender.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Garage } from './garage.js';
import { Pedestrian } from './onfoot.js';
import { buildSpec, money, CAR_BY_ID, CARS } from './catalog.js';
import * as SaveIO from './save.js';

class Game {
  constructor() {
    this.save = SaveIO.load();
    this.city = new City(20240828);
    this.canvas = document.getElementById('game');
    this.renderer = new CityRenderer(this.canvas, this.city);
    this.input = new Input();
    this.traffic = new CityTraffic(this.city);
    this.police = new CityPolice(this.city);
    this.ped = new Pedestrian(this.city);
    this.combat = new Combat();
    this.hunt = new Manhunt();
    this.stop = new TrafficStop();
    this.hud = new HUD();
    this.garageUI = new Garage(this);

    this.state = 'title';
    this.last = performance.now();
    this.mode = 'drive';           // drive | foot | inside
    this.buildPlayer();
    this.bindUI();
    addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame(t => this.frame(t));
  }

  // ---------------- setup ----------------
  buildPlayer() {
    let id = this.save.current;
    if (!CAR_BY_ID[id]) { id = CARS[0].id; this.save.current = id; }
    const spec = buildSpec(id, SaveIO.loadout(this.save, id));
    this.player = new Car(spec, 0, 0, 0);
    this.player.basePower = spec.power;
    this.player.baseTop = spec.topSpeed;
    this.player.isPlayer = true;
  }

  rebuildPlayer() {
    const id = this.save.current;
    this.player.setSpec(buildSpec(id, SaveIO.loadout(this.save, id)));
    this.player.basePower = this.player.spec.power;
    this.player.baseTop = this.player.spec.topSpeed;
  }

  persist() { SaveIO.save(this.save); }

  // Drop the player somewhere sensible in Manhattan, pointing down an avenue.
  // Lower Manhattan, on Broadway, pointing uptown.
  startSpot() {
    const C = this.city;
    let best = null, bd = 1e9;
    for (const r of C.roads) {
      if (r.name !== 'BROADWAY') continue;
      const d = Math.hypot(r.x0 - 190, r.y0 + 700);
      if (d < bd) { bd = d; best = r; }
    }
    if (!best) best = C.roads[0];
    return { x: (best.x0 + best.x1) / 2, y: (best.y0 + best.y1) / 2,
             h: Math.atan2(best.uy, best.ux) };
  }

  newRun() {
    const sp = this.startSpot();
    this.startSpotCache = sp;
    this.player.place(sp.x, sp.y, sp.h);
    this.player.speed = 8;
    this.player.spec.power = this.player.basePower;
    this.player.spec.topSpeed = this.player.baseTop;
    this.mode = 'drive';
    this.ped.reset(sp.x, sp.y);
    this.traffic.clear();
    this.police.reset();
    this.renderer.marks.length = 0;
    this.renderer.particles.length = 0;
    this.renderer.cam.x = sp.x; this.renderer.cam.y = sp.y;
    this.myCar = this.player;
    this.garageIn = null;
    this.deck = 0;
    this.sceneCalled = false;
    this.stop.reset();
    this.combat.reset(WEAPON_BY_ID[this.save.gun] || WEAPON_BY_ID.pistol);
    this.hunt.reset(this.loadout || {});
    // The job. You start parked outside it; it is deliberately easy, because
    // the crime is not the game - everything after it is.
    const jx = this.startSpotCache.x, jy = this.startSpotCache.y;
    this.job = { x: jx + Math.cos(this.startSpotCache.h + 1.57) * 13,
                 y: jy + Math.sin(this.startSpotCache.h + 1.57) * 13,
                 done: false, progress: 0 };
    this.home = { x: jx + 900, y: jy - 1400 };
    this.run = {
      live: true, over: false, t: 0, damage: 0, best: 0, hits: 0,
      dist: 0, boroughs: new Set(), reason: '', hidden: 0, cash: 0,
      lastEvent: null, eventT: 0, combo: 1, comboT: 0, nearMisses: 0,
      score: 0, bestCombo: 1, topKph: 0,
    };
  }

  bindUI() {
    const show = (id, v) => { const e = document.getElementById(id); if (e) e.hidden = !v; };
    document.getElementById('btn-play').onclick = () => this.openPrep();
    document.getElementById('btn-title-garage').onclick = () => this.openGarage(true);
    document.getElementById('btn-wipe').onclick = () => {
      if (!confirm('Erase your save?')) return;
      SaveIO.wipe(); this.save = SaveIO.defaultSave(); this.buildPlayer();
      this.hud.toast('SAVE ERASED');
    };
    document.getElementById('btn-again').onclick = () => this.openPrep();
    document.getElementById('btn-res-garage').onclick = () => { show('results', false); this.openGarage(true); };
    document.getElementById('btn-res-title').onclick = () => {
      show('results', false); show('title', true); show('hud', false); show('touch', false);
      this.state = 'title';
    };
    document.getElementById('btn-pause').onclick = () => this.pause(true);
    document.getElementById('btn-resume').onclick = () => this.pause(false);
    document.getElementById('btn-pause-quit').onclick = () => {
      this.pause(false); show('title', true); show('hud', false); show('touch', false);
      this.state = 'title';
    };
    document.getElementById('help').innerHTML = this.input.isTouch
      ? 'Wheel to steer, <b>GAS</b> and <b>BRAKE</b>.<br><b>USE</b> to get out, go in, or take a car. <b>FIRE</b> to shoot.<br>They have to kill you - break their line of sight.'
      : '<b>W A S D</b> drive &middot; <b>SHIFT</b> sprint &middot; <b>F</b> get out / go in / take a car<br><b>MOUSE</b> aim &middot; <b>CLICK</b> shoot &middot; <b>R</b> reload<br>They have to KILL you. Break line of sight and stay alive.';
    document.getElementById('title-hint').textContent = this.input.isTouch
      ? 'Wheel, pedals and USE on screen' : 'W A S D  ·  F';
  }

  // ---------------- before the job ----------------
  // The single most consequential screen in the game. Nothing you buy here
  // helps you drive or shoot; all of it decides what they can prove.
  openPrep() {
    for (const id of ['title','results','hud','touch']) {
      const e = document.getElementById(id); if (e) e.hidden = true;
    }
    document.getElementById('prep').hidden = false;
    this.state = 'prep';
    this.loadout = this.loadout || {};
    // Deliberately not enough. The whole kit is 625; this buys about three
    // of it, and which three is the most interesting decision in the game.
    // Deliberately not enough. The whole kit is 625; this buys about three of
    // it, and which three is the most interesting decision in the game.
    if (this.save.funds === undefined) this.save.funds = 165;
    // saves made before the budget came down keep an amount that trivialises
    // the choice, so bring those in line once
    if (!this.save.fundsV2) { this.save.funds = Math.min(this.save.funds, 165); this.save.fundsV2 = 1; }
    this.renderPrep();
  }

  renderPrep() {
    const list = document.getElementById('prep-list');
    this.save.guns = this.save.guns || { pistol: true };
    this.save.gun = this.save.gun || 'pistol';
    let spent = 0;
    for (const k of KIT) if (this.loadout[k.id]) spent += k.price;
    const left = (this.save.funds || 0) - spent;
    document.getElementById('prep-cash').textContent =
      money(left) + '  ·  BANK ' + money(this.save.cash);
    list.innerHTML = KIT.map(k => {
      const on = !!this.loadout[k.id];
      const afford = on || left >= k.price;
      return '<div class="kit' + (on ? ' on' : '') + (afford ? '' : ' off') +
        '" data-k="' + k.id + '">' +
        '<div class="kit-box"></div><div><div class="kit-t">' + k.name +
        '</div><div class="kit-n">' + k.note + '</div></div>' +
        '<div class="kit-p">' + money(k.price) + '</div></div>';
    }).join('');
    // ---- weapons: bought once, carried between jobs ----
    list.innerHTML += '<div class="prep-h">THE GUN</div>' +
      '<div class="prep-note">Bought with job money and kept. Only one comes with you.</div>' +
      WEAPONS.map(w => {
        const owned = !!this.save.guns[w.id];
        const on = this.save.gun === w.id;
        const afford = owned || this.save.cash >= w.price;
        return '<div class="kit gun' + (on ? ' on' : '') + (afford ? '' : ' off') +
          '" data-w="' + w.id + '">' +
          '<div class="kit-box"></div><div><div class="kit-t">' + w.name +
          (owned ? '' : ' <span style="color:#ffcf4a">— ' + money(w.price) + '</span>') +
          '</div><div class="kit-n">' + w.note + '</div>' +
          '<div class="kit-n" style="opacity:.65">' +
          (w.pellets ? w.pellets + ' pellets x ' : '') + w.dmg + ' dmg · ' +
          w.mag + ' rounds · ' + (1 / w.rate).toFixed(1) + '/s</div></div>' +
          '<div class="kit-p">' + (owned ? (on ? 'CARRIED' : 'OWNED') : '') + '</div></div>';
      }).join('');

    for (const el of list.querySelectorAll('.kit')) {
      el.onclick = () => {
        const wid = el.getAttribute('data-w');
        if (wid) {
          const w = WEAPON_BY_ID[wid];
          if (!this.save.guns[wid]) {
            if (this.save.cash < w.price) { this.hud.toast('NOT ENOUGH', 'bad'); return; }
            this.save.cash -= w.price;
            this.save.guns[wid] = true;
            this.hud.toast('BOUGHT ' + w.name, 'good');
          }
          this.save.gun = wid;
          this.persist();
          this.renderPrep();
          return;
        }
        const id = el.getAttribute('data-k');
        const k = KIT.find(q => q.id === id);
        if (this.loadout[id]) delete this.loadout[id];
        else if (left >= k.price) this.loadout[id] = true;
        else { this.hud.toast('NOT ENOUGH', 'bad'); return; }
        this.renderPrep();
      };
    }
    document.getElementById('btn-go').onclick = () => {
      this.save.funds = left;
      this.persist();
      document.getElementById('prep').hidden = true;
      this.startRun();
    };
  }

  // ---------------- shops ----------------
  // Cash is untraceable and finite. The card is unlimited and tells them the
  // shop, the minute and the direction you left in - which only matters once
  // they know whose card it is, and by then it matters a great deal.
  openShop(b) {
    // Guarded. This screen pauses the world, so anything that threw inside
    // it left the game paused forever with nothing on screen. That was the
    // freeze, and it must not be possible again.
    try {
      this.state = 'shop';
    this.shopAt = b;
    document.getElementById('shop').hidden = false;
      document.getElementById('shop-name').textContent = b.shopName || 'BODEGA';
      this.renderShop();
    } catch (e) {
      this.state = 'play';
      const el = document.getElementById('shop');
      if (el) el.hidden = true;
      this.last = performance.now();
      this.hud.toast('SHOP CLOSED', 'bad');
      console.error(e);
    }
  }

  renderShop(msg) {
    const H = this.hunt;
    const goods = [
      { id: 'meal', name: 'FOOD AND WATER', price: 22,
        note: 'Three meals. A few hours of not having to think about it.' },
      { id: 'clothes', name: 'CLOTHES OFF THE RACK', price: 48,
        note: 'Lets you change later and drop the clothing description.' },
      { id: 'mask', name: 'BALACLAVA', price: 40,
        note: 'Late, but it stops them getting your face from here on.' },
    ];

    document.getElementById('shop-cash').textContent =
      money(H.cash) + (H.cash <= 0 ? '  (you did not draw any out)' : '');

    const list = document.getElementById('shop-list');
    list.innerHTML = goods.map(g => {
      const canCash = H.cash >= g.price;
      return '<div class="good"><div class="good-t">' + g.name +
        '<span class="good-p">' + money(g.price) + '</span></div>' +
        '<div class="good-n">' + g.note + '</div>' +
        '<div class="good-b">' +
          '<button data-g="' + g.id + '" data-pay="cash"' +
            (canCash ? '' : ' disabled') + '>CASH</button>' +
          '<button data-g="' + g.id + '" data-pay="card" class="card">CARD</button>' +
        '</div></div>';
    }).join('') +
      '<div class="shop-msg' + (msg ? ' on' : '') + '" id="shop-msg">' +
        (msg || (H.identified
          ? 'They are watching the account. A card payment tells them exactly where you are standing.'
          : 'Cash leaves nothing behind. A card leaves the shop, the minute, and which way you left.')) +
      '</div>';

    for (const btn of list.querySelectorAll('button')) {
      btn.onclick = () => {
        try {
          const g = goods.find(q => q.id === btn.getAttribute('data-g'));
          const card = btn.getAttribute('data-pay') === 'card';
          if (!H.buy(g.price, card, this.ped.x, this.ped.y)) {
            this.renderShop(card ? 'The card was declined.'
                                 : 'Not enough cash — you have ' + money(H.cash) + '.');
            return;
          }
          let said;
          if (g.id === 'meal') { H.supplies += 3; said = 'Three meals in the bag.'; }
          if (g.id === 'clothes') { H.kit.change = true; said = 'A change of clothes in the bag. Use it somewhere quiet.'; }
          if (g.id === 'mask') { H.kit.mask = true; H.maskOn(true); said = 'Mask on.'; }
          if (card) {
            said += H.identified
              ? '  THEY JUST WATCHED THAT PAYMENT LAND.'
              : '  Paid by card — that is on a statement now.';
            this.police.lastSeen.x = this.ped.x;
            this.police.lastSeen.y = this.ped.y;
            if (H.identified) this.police.searchT = Math.max(this.police.searchT, 40);
          }
          this.renderShop(said);
        } catch (e) {
          // never leave the player looking at a dead panel
          this.renderShop('Something went wrong with that. ' + e.message);
          console.error(e);
        }
      };
    }

    document.getElementById('btn-shop-close').onclick = () => {
      document.getElementById('shop').hidden = true;
      this.state = 'play';
      this.last = performance.now();
    };
  }

  startRun() {
    document.getElementById('title').hidden = true;
    document.getElementById('results').hidden = true;
    document.getElementById('hud').hidden = false;
    document.getElementById('touch').hidden = !this.input.isTouch;
    document.getElementById('btn-pause').style.display = this.input.isTouch ? 'block' : 'none';
    this.newRun();
    this.state = 'play';
    this.last = performance.now();
  }

  pause(on) {
    if (on && this.state !== 'play') return;
    document.getElementById('pause').hidden = !on;
    this.state = on ? 'pause' : 'play';
    if (!on) this.last = performance.now();
  }

  openGarage(fromTitle) {
    this.fromTitle = !!fromTitle;
    this.state = 'garage';
    document.getElementById('title').hidden = true;
    this.garageUI.open();
  }
  closeGarage() {
    document.getElementById('title').hidden = false;
    this.state = 'title';
    this.rebuildPlayer();
  }
  say(t, k) { this.hud.toast(t, k); }

  endRun(reason) {
    const r = this.run;
    if (r.over) return;
    r.over = true; r.live = false;
    r.reason = reason;
    // paid by the minute, because the clock IS the score
    r.cash = Math.round(r.t * 45 + r.dist * 0.4 + r.boroughs.size * 900);
    this.save.cash += r.cash;
    this.save.funds = (this.save.funds || 0) + Math.round(r.cash * 0.03) + 70;
    this.save.bestTime = Math.max(this.save.bestTime || 0, r.t);
    this.save.bestScore = Math.max(this.save.bestScore || 0, Math.round(r.t));
    this.persist();
    const H = this.hunt;
    document.getElementById('res-title').textContent = reason;
    document.getElementById('res-lines').innerHTML = `
      <div class="res-line big"><span>TIME FREE</span><b>${fmtTime(r.t)}</b></div>
      <div class="res-line"><span>DISTANCE</span><b>${(r.dist / 1000).toFixed(2)} km</b></div>
      <div class="res-line"><span>BOROUGHS</span><b>${r.boroughs.size} / 5</b></div>
      <div class="res-line"><span>TOP SPEED</span><b>${Math.round(r.topKph)} km/h</b></div>
      <div class="res-line"><span>HITS TAKEN</span><b>${r.hits}</b></div>
      <div class="res-line"><span>OFFICERS DOWN</span><b>${this.combat.kills}</b></div>
      <div class="res-line"><span>THEY LEARNED</span><b>${H.lines.filter(l=>l.known).map(l=>l.id.toUpperCase()).join(" ") || "NOTHING"}</b></div>
      <div class="res-line"><span>IDENTIFIED</span><b>${H.identified ? "YES" : "NO"}</b></div>
      <div class="res-line big"><span>EARNED</span><b>&yen;${money(r.cash)}</b></div>
      <div class="res-line"><span>BEST EVER</span><b>${fmtTime(this.save.bestTime || 0)}</b></div>`;
    document.getElementById('results').hidden = false;
    this.state = 'over';
  }

  // ---------------- loop ----------------
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = 1 / 60;
    if (this.state === 'shop' && this.input.hit('escape')) {
      document.getElementById('shop').hidden = true;
      this.state = 'play'; this.last = performance.now();
    }
    if (this.state === 'garage' || this.state === 'prep' || this.state === 'shop') return;
    this.input.poll(dt);
    if (this.state === 'play') this.step(dt);
    else if (this.state === 'over' || this.state === 'pause') this.render(dt);
    else if (this.state === 'title') {
      if (!this.run) this.newRun();
      this.step(dt, true);
    }
    this.input.endFrame();
  }

  // Where is the player, whatever they are currently sitting in or standing on?
  get here() {
    if (this.mode === 'drive') return this.myCar;
    return this.ped;
  }

  step(dt, attract) {
    const inp = this.input;
    if (!attract && (inp.hit('escape') || inp.hit('p'))) { this.pause(true); return; }
    // Q: go down a floor, from anywhere in the stairwell
    if (!attract && inp.hit('q') && this.mode === 'inside') {
      const t2 = this.ped.target([], [], this.hunt.kit);
      if (t2 && t2.kind === 'stairs' && t2.down && this.ped.useStairs(-1, t2.at)) {
        const it = interiorOf(this.ped.inside);
        this.hud.banner('FLOOR ' + (this.ped.floor + 1) + ' / ' + it.floors, '#8fa0b4');
      }
    }
    if (!attract && inp.hit('e')) {
      if (this.hunt.eat()) this.hud.toast('ATE SOMETHING', 'good');
      else this.hud.toast('NOTHING TO EAT', 'bad');
    }
    if (!attract && inp.hit('m') && this.hunt.kit.mask) {
      this.hunt.maskOn(!this.hunt.wearingMask);
      this.hud.toast(this.hunt.wearingMask ? 'MASK ON' : 'MASK OFF');
    }

    const here = this.here;
    const buildings = this.city.around(here.x, here.y, 190);
    this.buildings = buildings;

    if (this.mode === 'drive') this.stepDrive(dt, attract, buildings);
    else this.stepFoot(dt, attract, buildings);

    // ---- the job ----
    // Drive up, hold still, take the money. Two seconds of standing in the
    // open, which is exactly long enough for somebody to look at you.
    if (!attract && this.job && !this.job.done) {
      const d = Math.hypot(here.x - this.job.x, here.y - this.job.y);
      if (d < 7 && Math.abs(here.speed || 0) < 3) {
        this.job.progress = Math.min(1, this.job.progress + dt * 0.5);
        if (this.job.progress >= 1) {
          this.job.done = true;
          // whoever was on that street is who they will be talking to
          const wit = this.traffic.people.filter(q =>
            Math.hypot(q.x - this.job.x, q.y - this.job.y) < 45).length;
          this.hunt.commit(this.job.x, this.job.y, wit);
          this.hud.toast(wit ? wit + ' PEOPLE SAW THAT' : 'NOBODY AROUND',
                         wit ? 'bad' : 'good');
          this.police.scene = { x: this.job.x, y: this.job.y };
          this.police.everSeen = false;
          // the car they will be looking for is the one it was done in
          this.crimeCar = this.myCar;
          this.hud.banner('GO', '#ff2d6f');
        }
      } else this.job.progress = Math.max(0, this.job.progress - dt * 0.3);
    }

    // ---- the clock, and everything measured off it ----
    const r = this.run;
    if (!attract && r.live) {
      r.t += dt;
      const b = this.city.boroughAt(here.x, here.y);
      if (b) r.boroughs.add(b.id);
      r.topKph = Math.max(r.topKph, this.mode === 'drive' ? this.myCar.kph : 0);
    }

    // ---- police ----
    const hidden = this.mode === 'inside' || !!this.garageIn;
    // What a patrol looking at you would actually have to go on.
    const sp = Math.abs(here.speed || 0);
    const near = this.police.cars.some(c2 => c2.wrecked <= 0 &&
      Math.hypot(c2.x - here.x, c2.y - here.y) < 26);
    const cop = this.police.update(dt, {
      px: here.x, py: here.y, hidden, buildings,
      onFoot: this.mode !== 'drive',
      playerSpeed: sp,
      combat: attract ? null : this.combat,
      hunt: this.hunt,
      // driving like this gets you stopped whether they know you or not
      reckless: this.mode === 'drive' && (sp > 33 || this.run.damage > 0.45
                 || !this.city.surfaceAt(here.x, here.y).onRoad),
      loud: (this.loudT || 0) > 0,
      close: near,
      cornered: !!(this.siegeInfo && this.siegeInfo.onYourFloor),
      carSwapped: this.mode === 'drive' && this.myCar !== this.crimeCar,
    });
    this.loudT = Math.max(0, (this.loudT || 0) - dt);
    this.police.checkWrecks(this.traffic.cars);
    if (!attract) this.watchCars(dt);

    // ---- the manhunt ----
    const H = this.hunt;
    const resting = this.mode === 'inside' && Math.abs(here.speed || 0) < 0.3
                    && !!this.ped.room;
    if (!attract) {
      H.update(dt, { seen: cop.seen, hidden, resting, px: here.x, py: here.y,
                     sceneUnits: this.police.sceneUnits });
      if (this.police.sceneUnits > 0 && !this.sceneCalled) {
        this.sceneCalled = true;
        this.hud.banner('UNITS AT THE SCENE', '#ffcf4a');
      }
      // the response scales with how much of a description they have
      this.police.heatFloat = Math.max(2, 1 + H.wanted * 4.4);
      this.police.heat = Math.max(2, Math.floor(this.police.heatFloat));
      if (H.justLearned) {
        const names = { vehicle:'THEY HAVE THE CAR', clothing:'THEY HAVE YOUR CLOTHES',
                        face:'THEY HAVE YOUR FACE', prints:'THEY HAVE YOUR PRINTS',
                        build:'THEY HAVE YOUR BUILD' };
        this.hud.banner(names[H.justLearned] || 'DESCRIPTION UPDATED', '#ff2d6f');
        H.justLearned = null;
      }
      if (H.newlyIdentified) {
        H.newlyIdentified = false;
        this.hud.banner('THEY KNOW WHO YOU ARE', '#ff2d6f');
      }
      if (H.houseJustRaided) {
        H.houseJustRaided = false;
        this.hud.toast('YOUR PLACE HAS BEEN RAIDED', 'bad');
      }
      this.police.updateCordons(dt, H.cordon, here.x, here.y);
      if (this.police.newCordon) {
        this.hud.banner('CHECKPOINT — ' + this.police.newCordon, '#ffcf4a');
        this.police.newCordon = null;
      }
      if (H.houseRaided && this.police.raid(dt, this.home, here.x, here.y)) {
        this.hud.banner('THEY ARE AT YOUR DOOR', '#ff2d6f');
      }
      // Home is a safehouse right up until it is the first place they look.
      if (!H.identified && Math.hypot(here.x - this.home.x, here.y - this.home.y) < 40
          && this.mode === 'inside') {
        H.wanted = Math.max(0, H.wanted - dt * 0.06);
      }
      if (H.won) { this.endRun(H.winReason); return; }
    }
    r.hidden = cop.seen ? Math.max(0, r.hidden - dt * 2) : Math.min(1, r.hidden + dt);
    if (this.police.lastWreck) { this.police.lastWreck = 0; this.hud.toast('PATROL DOWN', 'good'); }
    for (const s of this.police.shots) this.muzzle(s.x, s.y, s.a);
    this.cop = cop;

    // ---- they come in after you ----
    // Not a meter any more: they surround the building, one covers the back,
    // the rest come through the front and climb the same stairs you did.
    if (!attract) {
      const st = this.police.updateSiege(dt, {
        inBuilding: this.mode === 'inside' ? this.ped.inside : null,
        playerFloor: this.ped.floor,
        px: here.x, py: here.y, buildings,
        barricaded: !!(this.ped.room && this.ped.room.barricade > 0),
        interiorOf,
      });
      for (const o of this.police.foot) {
        o.onPlayerFloor = this.mode === 'inside' && o.inside === this.ped.inside
                          && o.floor === this.ped.floor;
      }
      this.siegeInfo = st;
      this.sweep = st ? Math.min(1, st.inside * 0.34 + (st.onYourFloor ? 0.6 : 0)) : 0;
      if (st && st.onYourFloor && !this.sawThem) {
        this.sawThem = true;
        this.hud.banner('THEY ARE ON YOUR FLOOR', '#ff2d6f');
      }
      if (!st || !st.onYourFloor) this.sawThem = false;
    }

    // ---- the middle ground ----
    if (!attract && this.hunt) {
      const H = this.hunt;
      const drive = this.mode === 'drive';
      const surf = this.city.surfaceAt(here.x, here.y);
      this.stop.addSuspicion(dt, {
        speeding: drive && Math.abs(here.speed) > 30,
        wrongSide: drive && !surf.onRoad,
        damaged: drive && this.run.damage > 0.35,
        maskedInPublic: !drive && H.wearingMask,
        nearScene: !!(H.scene && Math.hypot(here.x - H.scene.x, here.y - H.scene.y) < 90),
        buildMatches: !!H.known.build,
        runningOnFoot: !drive && this.ped.speed > 6,
      });

      // a unit close enough to act on it
      const near = this.police.cars.find(o => !o.blocker && o.wrecked <= 0 &&
        Math.hypot(o.x - here.x, o.y - here.y) < 40);
      if (near && this.stop.maybeStop(near, { recognised: cop.seen })) {
        this.hud.banner('THEY WANT YOU TO STOP', '#ffcf4a');
      }

      const out = this.stop.update(dt, {
        speed: Math.abs(here.speed || 0),
        known: H.known,
        masked: H.wearingMask,
        changed: !H.known.clothing,
        inCrimeCar: drive && this.myCar === this.crimeCar,
        identified: H.identified,
      });
      if (out) {
        if (out.fled) {
          this.hud.banner('YOU RAN', '#ff2d6f');
          // running from a stop is itself a reason to be chased
          this.police.everSeen = true;
          this.police.lastSeen.x = here.x; this.police.lastSeen.y = here.y;
          this.police.searchT = 60;
          H.wanted = Math.min(1, H.wanted + 0.25);
          this.loudT = 4;
        } else if (out.cleared) {
          this.hud.banner('NOTHING ON YOU — ON YOUR WAY', '#3ad6a0');
        } else if (out.taken) {
          this.endRun('TAKEN IN — ' + out.on.join(', ').toUpperCase());
          return;
        }
      }

      // ---- the public ----
      // Once a description is out, people start ringing it in. What they
      // produce is a place and maybe a car - never a certainty, which is
      // why it ends in a question rather than an arrest.
      const reach = H.reach();
      if (reach !== 'none' && !hidden) {
        this.tipT = (this.tipT || 0) - dt;
        if (this.tipT <= 0) {
          this.tipT = 2.5;
          const inSameBorough = this.city.boroughAt(here.x, here.y);
          const canSee = reach === 'city' ||
            (inSameBorough && H.scene && this.city.boroughAt(H.scene.x, H.scene.y) === inSameBorough);
          if (canSee) {
            const match = H.publicMatch({
              masked: H.wearingMask,
              changed: !H.known.clothing,
              inCrimeCar: drive && this.myCar === this.crimeCar,
            });
            // somebody looking straight at you, who thinks it might be you
            const watcher = this.traffic.people.find(q =>
              !q.seenT && Math.hypot(q.x - here.x, q.y - here.y) < 26);
            if (watcher && match > 0.2 && Math.random() < match * 0.55) {
              watcher.seenT = 1;
              H.addTip(here.x, here.y, drive);
              this.hud.toast('SOMEBODY CALLED IT IN', 'bad');
              this.police.lastSeen.x = here.x; this.police.lastSeen.y = here.y;
              this.police.searchT = Math.max(this.police.searchT, 35);
              this.stop.suspicion = Math.min(1, this.stop.suspicion + 0.45);
            }
          }
        }
      }
    }

    // ---- guns ----
    if (!attract) this.stepCombat(dt, here, buildings);
    // The ONLY way this ends. Not an arrest, not a wrecked car - you have to be
    // put down, and they have to get you out of the car first to do it.
    if (!attract && this.combat.dead) { this.endRun('KILLED'); return; }

    this.renderer.stepParticles(dt);
    this.renderer.follow(here, dt, Math.abs(here.speed || 0), this.mode !== 'drive');
    this.render(dt);

    if (!attract) {
      const t = this.mode === 'drive' ? null
        : this.ped.target(buildings, this.mode === 'inside' ? [] : this.nearbyCars());
      this.hud.update({
        car: this.mode === 'drive' ? this.myCar : { kph: this.ped.kph, gear: 1, spec: { topSpeed: 22 } },
        hp: this.combat.hp / this.combat.maxHp,
        ammo: this.combat.inMag, mags: this.combat.ammo,
        reloading: this.combat.reloading,
        onFootCops: this.cop ? this.cop.onFootCount : 0,
        run: r, heat: this.police.heat, bust: 0, dt,
        offRoad: false, blockIn: null,
        timeFree: r.t, seen: cop.seen, searching: cop.searching,
        prompt: (this.stop && this.stop.label) || this.jobPrompt(here) ||
                (this.mode === 'drive' ? this.drivePrompt(buildings) : (t ? t.label : null)),
        stamina: this.mode === 'drive' ? null : this.ped.stam / 4.6,
        borough: this.city.placeName(here.x, here.y),
        hunt: this.hunt, sweep: this.sweep || 0,
        suspicion: this.stop ? this.stop.suspicion : 0,
        floor: this.mode === 'inside' ? this.ped.floor + 1 : 0,
        floors: this.mode === 'inside' ? interiorOf(this.ped.inside).floors : 0,
        job: this.job,
      });
    }
  }

  // Aim is the mouse if there is one, otherwise wherever you are facing. On
  // foot you can turn on the spot to aim; in the car you are shooting out of
  // the window, which is why the spread is worse and they will not sit still
  // for it.
  aimAngle(here) {
    if (this.input.aimX !== undefined && this.input.aimHas) {
      const R = this.renderer;
      const wx = R.cam.x + (this.input.aimX - R.vw / 2) / R.cam.zoom;
      const wy = R.cam.y + (this.input.aimY - R.vh / 2) / R.cam.zoom;
      return Math.atan2(wy - here.y, wx - here.x);
    }
    return here.h || 0;
  }

  muzzle(x, y, a) {
    this.renderer.addParticle({
      x: x + Math.cos(a) * 1.3, y: y + Math.sin(a) * 1.3,
      vx: Math.cos(a) * 8, vy: Math.sin(a) * 8,
      life: 0.07, life0: 0.07, r: 0.55, grow: 4, drag: 6,
      col: '#ffd88a', alpha: 0.95, add: true, front: true,
    });
  }

  stepCombat(dt, here, buildings) {
    const K = this.combat;
    const inp = this.input;
    const aim = this.aimAngle(here);
    const fromCar = this.mode === 'drive';
    const shot = K.tryFire(dt, inp.fire, inp.hit('r'), here.x, here.y, aim, fromCar);
    if (shot) {
      this.muzzle(shot.x, shot.y, shot.a);
      this.renderer.cam.shake = Math.min(0.5, this.renderer.cam.shake + 0.10);
      // gunfire is the loudest thing you can do in a quiet street
      this.police.searchT = Math.max(this.police.searchT, 12);
      this.police.lastSeen.x = here.x; this.police.lastSeen.y = here.y;
      const G = this.combat.gun;
      this.police.addHeat(0.22 * (G.loud || 1));
      this.loudT = 6 * (G.loud || 1);
    }

    const before = K.kills;
    // Inside, the walls that matter are this floor's - and the only people who
    // can be hit are the ones standing on it.
    const insideNow = this.mode === 'inside' ? this.ped.inside : null;
    const targets = insideNow
      ? this.police.foot.filter(o => o.inside === insideNow && o.floor === this.ped.floor)
      : this.police.foot.filter(o => !o.inside);
    const hits = K.update(dt, {
      buildings,
      interior: insideNow
        ? { bl: insideNow, walls: interiorOf(insideNow).plan[this.ped.floor].walls }
        : null,
      targets,
      copCars: insideNow ? [] : this.police.cars,
      playerCar: this.mode === 'drive' ? this.myCar : null,
      inCar: this.mode === 'drive',
      px: here.x, py: here.y,
      onCarHit: (n) => { if (this.mode === 'drive') this.damage(n / 200, this.myCar, false, true); },
    });
    if (K.kills > before) this.hud.toast('OFFICER DOWN', 'good');
    for (const h of hits) {
      const col = h.kind === 'flesh' ? '#b8203c' : h.kind === 'metal' ? '#ffd08a' : '#c9cfd8';
      for (let i = 0; i < (h.kind === 'wall' ? 4 : 6); i++) {
        const a = Math.random() * 7;
        this.renderer.addParticle({
          x: h.x, y: h.y,
          vx: Math.cos(a) * (2 + Math.random() * 7), vy: Math.sin(a) * (2 + Math.random() * 7),
          life: 0.30, life0: 0.30, r: 0.10, grow: 0.3, drag: 4,
          col, alpha: 0.9, add: h.kind !== 'flesh', front: true,
        });
      }
    }
  }

  // Is a unit close enough to this car, and looking at it, to connect it to
  // the person getting in or out?
  witnessedAt(car) {
    const B = this.buildings || [];
    const units = [
      ...this.police.cars.filter(o => !o.blocker && o.wrecked <= 0),
      ...this.police.foot.filter(o => !o.down),
    ];
    for (const o of units) {
      if (Math.hypot(o.x - car.x, o.y - car.y) > 20) continue;
      if (this.police.blocked(o.x, o.y, car.x, car.y, B)) continue;
      return true;
    }
    return false;
  }

  // Five seconds with the car is a plate run. This is what catches a car you
  // abandoned and walked away from - you are gone, but it is still sitting
  // there with your description attached to it.
  watchCars(dt) {
    const H = this.hunt;
    const watch = [];
    if (this.mode === 'drive') watch.push(this.myCar);
    if (this.abandoned && !this.abandoned.dead) watch.push(this.abandoned);
    const B = this.buildings || [];
    const units = [
      ...this.police.cars.filter(o => !o.blocker && o.wrecked <= 0),
      ...this.police.foot.filter(o => !o.down),
    ];
    for (const car of watch) {
      let on = false;
      for (const o of units) {
        if (Math.hypot(o.x - car.x, o.y - car.y) > 16) continue;
        if (this.police.blocked(o.x, o.y, car.x, car.y, B)) continue;
        on = true; break;
      }
      if (!on) { car.copDwell = 0; continue; }
      car.copDwell = (car.copDwell || 0) + dt;
      if (car.copDwell > 5 && !H.known.vehicle && car === this.myCar) {
        H.known.vehicle = 1;
        this.hud.banner('THEY RAN THE PLATE', '#ff2d6f');
      }
      // an abandoned car they have stood with is a car they can now place
      if (car.copDwell > 5 && car === this.abandoned && !car.made) {
        car.made = true;
        this.hud.toast('THEY FOUND THE CAR YOU LEFT', 'bad');
        this.police.lastSeen.x = car.x; this.police.lastSeen.y = car.y;
        this.police.searchT = Math.max(this.police.searchT, 30);
      }
    }
  }

  nearbyCars() {
    const out = [];
    // parked first - it is the one you actually want, and it is not moving
    for (const c of this.traffic.parked)
      if (Math.hypot(c.x - this.ped.x, c.y - this.ped.y) < 6) out.push(c);
    for (const c of this.traffic.cars)
      if (Math.hypot(c.x - this.ped.x, c.y - this.ped.y) < 6) out.push(c);
    for (const c of this.police.cars)
      if (c.wrecked <= 0 && Math.hypot(c.x - this.ped.x, c.y - this.ped.y) < 6) out.push(c);
    return out;
  }

  // Until the job is done, that is the only thing worth telling you.
  jobPrompt(here) {
    if (!this.job || this.job.done) return null;
    const d = Math.hypot(here.x - this.job.x, here.y - this.job.y);
    if (d < 7) return 'HOLD STILL — TAKING THE MONEY';
    return 'THE JOB — ' + Math.round(d) + ' m';
  }

  drivePrompt(buildings) {
    if (this.garageIn) return 'DECK ' + (this.deck + 1) + ' — FIND THE RAMP';
    for (const b of buildings) {
      if (!b.garage) continue;
      if (Math.hypot(b.door.x - this.myCar.x, b.door.y - this.myCar.y) < 9) return 'DRIVE IN';
    }
    return null;
  }

  // ---------------- driving ----------------
  stepDrive(dt, attract, buildings) {
    const p = this.myCar;
    const inp = this.input;
    const ctrl = attract
      ? { steer: 0, throttle: 0, brake: 1 }
      : { steer: inp.steer, throttle: inp.throttle, brake: inp.brake };

    const surf = this.city.surfaceAt(p.x, p.y);
    const grip = surf.onRoad ? 1 : 0.62;
    p.updateFree(dt, ctrl, grip);

    // buildings are solid. Hitting one at speed is the single most expensive
    // thing you can do, which is what makes a city chase different: the walls
    // are always right there.
    if (!this.garageIn) {
      for (const b of buildings) {
        const hit = pushCarOut(b, p);
        if (hit > 0 && !attract) this.damage(hit * 0.9, p, true);
      }
    }

    // ---- traffic and people ----
    this.traffic.update(dt, p.x, p.y,
      Math.min(46, 26 + Math.floor(this.run.t / 20)), 34,
      { x: p.x, y: p.y, speed: Math.abs(p.speed) }, buildings);

    const contacts = [];
    for (const c of this.traffic.cars)
      if (carsTouching(p, c)) contacts.push({ c, rel: Math.hypot(p.vx - c.vx, p.vy - c.vy) });
    for (const c of this.traffic.parked)
      if (carsTouching(p, c)) contacts.push({ c, rel: Math.hypot(p.vx - c.vx, p.vy - c.vy) });
    for (const c of this.police.cars)
      if (c.wrecked <= 0 && carsTouching(p, c))
        contacts.push({ c, rel: Math.hypot(p.vx - c.vx, p.vy - c.vy) });
    resolveCarCollisions([p, ...this.traffic.cars, ...this.traffic.parked, ...this.police.cars]);
    for (const { c, rel } of contacts) {
      if (attract || rel <= 3.5) continue;
      if (this.run.t - (c.lastHitT || -9) < 0.6) continue;
      c.lastHitT = this.run.t;
      if (c.gentle) continue;                    // a patrol nudging you is free
      const sev = clamp((rel - 4) / 46, 0, 1) * (c.copCar ? 0.42 : 1);
      this.damage(sev, p, false);
    }

    // running people over. It is a chase sim, not a driving test - but the
    // whole city hears about it.
    if (!attract) {
      for (const q of this.traffic.people) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > 1.6) continue;
        if (Math.abs(p.speed) < 4) continue;
        q.x += (q.x - p.x) * 3; q.y += (q.y - p.y) * 3;
        this.police.addHeat(0.9);
        this.police.searchT = 16;
        this.hud.banner('WITNESSES', '#ff2d6f');
      }
    }

    // ---- garages ----
    this.stepGarage(dt, buildings, p);

    // ---- get out ----
    if (!attract && this.input.hit('use') && Math.abs(p.speed) < 6) {
      this.getOut(p);
    }

    if (!attract) this.run.dist += Math.abs(p.speed) * dt;
    this.effects(dt, p, surf);
  }

  // Driving into a garage takes you off the street entirely: they cannot see
  // you, the heat cools, and you can climb decks to put concrete between you
  // and the search. It is the one place a chase can be properly broken.
  stepGarage(dt, buildings, p) {
    if (!this.garageIn) {
      for (const b of buildings) {
        if (!b.garage) continue;
        const d = b.door;
        if (Math.hypot(d.x - p.x, d.y - p.y) < 4.5) {
          this.garageIn = b; this.deck = 0; this.rampT = 0;
          this.hud.banner('OFF THE STREET', '#3ad6a0');
          break;
        }
      }
      return;
    }
    const g = this.garageIn;
    // inside: kept within the footprint, and driving to the far corner takes
    // you up a deck (or back out at ground level)
    const cs = Math.cos(-g.ang), sn = Math.sin(-g.ang);
    const u = cs * (p.x - g.x) - sn * (p.y - g.y);
    const v = sn * (p.x - g.x) + cs * (p.y - g.y);
    const hu = g.w / 2 - 2, hv = g.d / 2 - 2;
    let nu = clamp(u, -hu, hu), nv = clamp(v, -hv, hv);
    if (nu !== u || nv !== v) {
      const c2 = Math.cos(g.ang), s2 = Math.sin(g.ang);
      p.x = g.x + c2 * nu - s2 * nv;
      p.y = g.y + s2 * nu + c2 * nv;
      p.speed *= 0.55;
    }
    this.rampT = Math.max(0, (this.rampT || 0) - dt);
    // ramp in the far corner
    if (this.rampT <= 0 && nu > hu - 6 && nv > hv - 6) {
      this.rampT = 1.6;
      this.deck++;
      if (this.deck >= g.decks) this.deck = 0;
      this.hud.banner('DECK ' + (this.deck + 1), '#8fa0b4');
    }
    // the way out is back at the mouth, on the ground floor
    if (this.deck === 0 && Math.hypot(g.door.x - p.x, g.door.y - p.y) < 4 && this.rampT <= 0) {
      if (this.leaveGarageT === undefined) this.leaveGarageT = 1.2;
      this.leaveGarageT -= dt;
      if (this.leaveGarageT <= 0) {
        this.garageIn = null; this.leaveGarageT = undefined;
        this.hud.banner('BACK ON THE STREET', '#ffcf4a');
      }
    } else this.leaveGarageT = undefined;
  }

  getOut(p) {
    // if somebody was standing at the car when you stepped out of it, the
    // link between you and that vehicle is made there and then
    if (this.hunt && this.witnessedAt(p)) {
      this.hunt.known.vehicle = 1;
      p.made = true;
      this.hud.banner('THEY SAW YOU GET OUT', '#ff2d6f');
    }
    this.ped.reset(p.x - Math.sin(p.h) * 1.9, p.y + Math.cos(p.h) * 1.9);
    this.ped.h = p.h;
    this.mode = 'foot';
    p.speed = 0; p.vx = 0; p.vy = 0;
    this.abandoned = p;
    this.hud.banner('ON FOOT', '#ffcf4a');
  }

  // ---------------- on foot ----------------
  stepFoot(dt, attract, buildings) {
    const inp = this.input;
    const ctrl = {
      mx: inp.steer, my: inp.walkY !== undefined ? inp.walkY : (inp.throttle - inp.brake),
      run: inp.down && inp.down('shift'),
    };
    if (attract) { ctrl.mx = 0; ctrl.my = 0; }
    const done = this.ped.update(dt, ctrl, this.mode === 'inside' ? [] : buildings,
                                 this.hunt.exhausted);
    if (done) {
      if (done.kind === 'barricade') {
        done.room.barricade = 1;
        this.hud.toast('DOOR BARRICADED', 'good');
      } else if (done.kind === 'change') {
        if (this.hunt.changeClothes()) {
          this.hud.banner('DESCRIPTION DROPPED', '#3ad6a0');
          this.hud.toast('THEY ARE LOOKING FOR THE WRONG CLOTHES', 'good');
        }
      }
    }
    if (this.mode === 'inside') this.mode = this.ped.inside ? 'inside' : 'foot';

    // traffic keeps running while you are out of the car
    this.traffic.update(dt, this.ped.x, this.ped.y,
      Math.min(40, 22 + Math.floor(this.run.t / 22)), 38,
      { x: this.ped.x, y: this.ped.y, speed: this.ped.speed }, buildings);

    if (attract) return;
    if (!this.input.hit('use')) return;

    const t = this.ped.target(buildings, this.mode === 'inside' ? [] : this.nearbyCars(),
                              this.hunt.kit);
    if (!t) return;
    if (t.kind === 'enter') {
      this.ped.enter(t.b);
      this.mode = 'inside';
      this.hud.banner(t.b.garage ? 'INSIDE THE GARAGE' : 'INSIDE', '#3ad6a0');
    } else if (t.kind === 'exit') {
      this.ped.leave(t.at);
      this.mode = 'foot';
    } else if (t.kind === 'car') {
      this.takeCar(t.car);
    } else if (t.kind === 'stairs') {
      // F goes up; at the top it goes down, because there is nowhere else.
      // Q always goes down. (Handled below for Q so it works without USE.)
      const dir = t.up ? 1 : -1;
      if (this.ped.useStairs(dir, t.at)) {
        const it = interiorOf(this.ped.inside);
        this.hud.banner('FLOOR ' + (this.ped.floor + 1) + ' / ' + it.floors, '#8fa0b4');
        // climbing resets their sweep - they have to work up to you again
        this.sweep = Math.max(0, (this.sweep || 0) - (dir > 0 ? 0.45 : 0));
      }
    } else if (t.kind === 'barricade') {
      this.ped.begin({ kind: 'barricade', room: t.room }, 2.4);
      this.hud.banner('BARRICADING', '#ffcf4a');
    } else if (t.kind === 'unbarricade') {
      t.room.barricade = 0;
      this.hud.toast('DOOR CLEAR');
    } else if (t.kind === 'counter') {
      this.openShop(t.b);
    } else if (t.kind === 'change') {
      this.ped.begin({ kind: 'change' }, 3.2);
      this.hud.banner('CHANGING', '#ffcf4a');
    }
  }

  // Any car will do. Yours if it is still there, someone else's if it is not -
  // which is the answer to "they wrecked my car", and the reason a run does not
  // end when the car does.
  takeCar(c) {
    if (c.copCar) {
      const i = this.police.cars.indexOf(c);
      if (i >= 0) this.police.cars.splice(i, 1);
      this.police.addHeat(1.2);
      this.hud.banner('YOU TOOK A CRUISER', '#ff2d6f');
    } else {
      let i = this.traffic.cars.indexOf(c);
      if (i >= 0) this.traffic.cars.splice(i, 1);
      else { i = this.traffic.parked.indexOf(c); if (i >= 0) this.traffic.parked.splice(i, 1); }
      this.hud.banner(c.parked ? 'TOOK A PARKED CAR' : 'NEW CAR', '#3ad6a0');
    }
    c.parked = false;
    c.headlights = true;
    c.copCar = false;
    c.civilian = false;
    c.gentle = false;
    c.isPlayer = true;
    c.basePower = c.spec.power;
    c.baseTop = c.spec.topSpeed;
    // A new car is a new description. This is the cheapest thing you can do
    // to make them wrong about you, and it costs nothing but the risk of
    // standing in the street to do it.
    const H = this.hunt;
    // Did anyone actually watch this? They have to be AT the car, with a clear
    // line to it - not merely somewhere in the borough.
    if (this.witnessedAt(c)) {
      this.hud.banner('THEY WATCHED YOU GET IN', '#ff2d6f');
      H.known.vehicle = 1;
    } else {
      if (H.known.vehicle) this.hud.banner('THEY ARE LOOKING FOR THE WRONG CAR', '#3ad6a0');
      H.swapCar();
    }
    c.copDwell = 0;
    this.myCar = c;
    // and the one they are looking for is now parked somewhere else
    if (this.crimeCar && this.crimeCar !== c) this.crimeCar = this.crimeCar;
    this.mode = 'drive';
    this.garageIn = null;
  }

  // ---------------- damage ----------------
  damage(sev, p, wall, gunfire) {
    const r = this.run;
    if (!r.live) return;
    const armour = p.spec.armour ?? 1;
    const d = gunfire ? sev * armour
                      : (0.09 + sev * sev * (wall ? 0.78 : 0.58)) * armour;
    r.damage = Math.min(1, r.damage + d);
    r.hits++;
    if (!gunfire) {
      p.speed = Math.max(0, p.speed * (1 - 0.34 * sev) - 2.5 * sev);
      p.crashT = Math.min(1, sev + 0.2);
      this.renderer.cam.shake = Math.min(0.9, 0.25 + sev * 0.7);
    }
    this.police.addHeat(0.25);
    this.loudT = 5;
    this.police.searchT = Math.max(this.police.searchT, 8);
    p.spec.power = p.basePower * (1 - r.damage * 0.45);
    p.spec.topSpeed = p.baseTop * (1 - r.damage * 0.32);
    if (!gunfire || Math.random() < 0.25) {
      this.hud.banner(r.damage > 0.75 ? 'CRITICAL' : 'DAMAGE',
                      r.damage > 0.75 ? '#ff2d6f' : '#ffcf4a');
    }
    // The car dies; you do not. It becomes a wreck and you are out on the
    // street, which is a worse position but not the end of the run.
    // The car dies; you do not. It stops being cover and you are out on the
    // street, which is the worst place to be - but it is not the end.
    if (r.damage >= 1) {
      this.hud.banner('OUT OF THE CAR', '#ff2d6f');
      this.getOut(p);
      r.damage = 0;
      p.spec.power = p.basePower * 0.35;
      p.spec.topSpeed = p.baseTop * 0.5;
      p.dead = true;
    }
  }

  effects(dt, p, surf) {
    const r = this.run;
    if (r.damage > 0.25) {
      this.smokeT = (this.smokeT || 0) + dt * (0.6 + r.damage * 3.2);
      while (this.smokeT > 0.1) {
        this.smokeT -= 0.1;
        const g = 90 + Math.random() * 40 - r.damage * 45;
        this.renderer.addParticle({
          x: p.x - Math.cos(p.h) * p.spec.len * 0.45,
          y: p.y - Math.sin(p.h) * p.spec.len * 0.45,
          vx: -Math.cos(p.h) * 3 + (Math.random() - 0.5) * 2.2,
          vy: -Math.sin(p.h) * 3 + (Math.random() - 0.5) * 2.2,
          life: 0.7 + r.damage * 0.8, life0: 0.7 + r.damage * 0.8,
          r: 0.5, grow: 2.4, drag: 1.1,
          col: `rgb(${g | 0},${(g - 4) | 0},${(g - 10) | 0})`,
          alpha: 0.18 + r.damage * 0.30, front: true,
        });
      }
    }
    // tyre marks when you are working the car hard
    if (p.slipRatio > 0.5 && Math.abs(p.speed) > 8) {
      const bx = p.x - Math.cos(p.h) * p.spec.len * 0.35;
      const by = p.y - Math.sin(p.h) * p.spec.len * 0.35;
      const nx = -Math.sin(p.h) * p.spec.wid * 0.42, ny = Math.cos(p.h) * p.spec.wid * 0.42;
      if (this.markPrev) {
        this.renderer.addMark(this.markPrev[0], this.markPrev[1], bx + nx, by + ny, 0.30, 0.5);
        this.renderer.addMark(this.markPrev[2], this.markPrev[3], bx - nx, by - ny, 0.30, 0.5);
      }
      this.markPrev = [bx + nx, by + ny, bx - nx, by - ny];
    } else this.markPrev = null;
    void surf;
  }

  render(dt) {
    const here = this.here;
    const cars = [];
    if (this.mode === 'drive') cars.push(this.myCar);
    else if (this.abandoned && !this.abandoned.dead) cars.push(this.abandoned);
    for (const c of this.traffic.cars) cars.push(c);
    for (const c of this.traffic.parked) cars.push(c);
    for (const c of this.police.cars) cars.push(c);
    this.renderer.draw({
      dt,
      cars: this.mode === 'inside' ? [] : cars,
      people: this.mode === 'inside' ? [] : this.traffic.people,
      officers: this.police.foot,
      ped: this.ped,
      onFoot: this.mode === 'foot',
      interior: this.mode === 'inside' ? this.ped.inside : null,
      buildings: this.buildings || [],
      speedKph: this.mode === 'drive' ? this.myCar.kph : 0,
      damage: this.run ? this.run.damage : 0,
      hiddenGlow: this.run ? this.run.hidden : 0,
      tod: ((this.run ? this.run.t : 0) / 1200 + 0.18) % 1,
      bullets: this.combat.bullets,
      casings: this.combat.casings,
      hurt: this.combat.hurtT,
      gunLen: (this.combat.gun && this.combat.gun.len) || 0.5,
      floor: this.mode === 'inside' ? this.ped.floor : 0,
      job: this.job, hunt: this.hunt,
    });
    void here;
  }
}

// Push a car out of a solid building, returning the severity of the hit.
function pushCarOut(b, p) {
  const cs = Math.cos(-b.ang), sn = Math.sin(-b.ang);
  const dx = p.x - b.x, dy = p.y - b.y;
  const u = cs * dx - sn * dy, v = sn * dx + cs * dy;
  const rad = p.spec.len * 0.42;
  const hu = b.w / 2 + rad, hv = b.d / 2 + rad;
  if (Math.abs(u) > hu || Math.abs(v) > hv) return 0;
  // a garage mouth is a hole you can drive through
  if (b.garage) {
    const onFace = (b.doorSide === 'v-' && v < 0) || (b.doorSide === 'v+' && v > 0);
    if (onFace && Math.abs(u) < b.mouth / 2) return 0;
  }
  const ou = hu - Math.abs(u), ov = hv - Math.abs(v);
  let nu = u, nv = v, nrmU = 0, nrmV = 0;
  if (ou < ov) { nu = Math.sign(u) * hu; nrmU = Math.sign(u); }
  else { nv = Math.sign(v) * hv; nrmV = Math.sign(v); }
  const c2 = Math.cos(b.ang), s2 = Math.sin(b.ang);
  p.x = b.x + c2 * nu - s2 * nv;
  p.y = b.y + s2 * nu + c2 * nv;
  // speed into the wall decides how bad it was
  const wx = c2 * nrmU - s2 * nrmV, wy = s2 * nrmU + c2 * nrmV;
  const into = -(p.vx * wx + p.vy * wy);
  p.speed *= 0.30;
  p.vx = 0; p.vy = 0;
  return into > 4 ? clamp((into - 4) / 34, 0, 1) : 0;
}

function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

window.NIGHTSHIFT = window.HIGHWAY = new Game();
export {};
