// ===================== HIGHWAY :: HUD =====================
// Score and combo dominate, because they are the whole reason to take risks.
// Speed is second. Everything else stays out of the way.

import { money } from './catalog.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.speed = document.getElementById('speed');
    this.gear = document.getElementById('gear');
    this.arc = document.getElementById('dial-arc');
    this.red = document.getElementById('dial-red');
    this.score = document.getElementById('score');
    this.combo = document.getElementById('combo');
    this.comboBar = document.getElementById('combo-bar');
    this.dist = document.getElementById('dist');
    this.near = document.getElementById('near');
    this.event = document.getElementById('event');
    this.heatWrap = document.getElementById('heat-wrap');
    this.pips = [...document.querySelectorAll('.heat-pip')];
    this.bustBar = document.getElementById('bust-bar');
    this.bustWrap = document.getElementById('bust-wrap');
    this.bannerEl = document.getElementById('banner');
    this.toasts = document.getElementById('toasts');
    this.warn = document.getElementById('offroad');
    this.blockWarn = document.getElementById('blockwarn');
    this.dmgWrap = document.getElementById('dmg-wrap');
    this.dmgBar = document.getElementById('dmg-bar');
    this.clockT = document.getElementById('clock-t');
    this.clockWhere = document.getElementById('clock-where');
    this.seenEl = document.getElementById('seen');
    this.promptEl = document.getElementById('prompt');
    this.stamEl = document.getElementById('stam');
    this.stamBar = document.getElementById('stam-bar');
    this.useBtn = document.getElementById('btn-use');
    this.hpBar = document.getElementById('hp-bar');
    this.ammoEl = document.getElementById('ammo');
    this.magsEl = document.getElementById('mags');
    this.reloadEl = document.getElementById('reload');
    this.fireBtn = document.getElementById('btn-fire');
    this.boardList = document.getElementById('board-list');
    this.boardId = document.getElementById('board-id');
    this.nFood = document.getElementById('n-food');
    this.nWater = document.getElementById('n-water');
    this.nEnergy = document.getElementById('n-energy');
    this.sweepEl = document.getElementById('sweep');
    this.sweepB = document.getElementById('sweep-b');
    this.invList = document.getElementById('inv-list');
    this.invShown = null;
    this.blockDist = document.getElementById('blockdist');
    this.bannerT = 0;
  }

  update(o) {
    const { car, run, heat, bust, dt, offRoad, blockIn,
            timeFree, seen, searching, prompt, stamina, borough,
            hp, ammo, mags, reloading, hunt, sweep, floor, floors } = o;

    const kph = Math.max(0, car.kph);
    this.speed.textContent = Math.round(kph);
    this.gear.textContent = car.gear;
    const frac = Math.min(1, kph / Math.max(120, car.spec.topSpeed));
    this.arc.setAttribute('d', arcPath(60, 60, 52, -220, -220 + 260 * Math.min(frac, 0.82)));
    this.red.setAttribute('d', frac > 0.82
      ? arcPath(60, 60, 52, -220 + 260 * 0.82, -220 + 260 * frac) : '');

    if (run.score !== undefined) this.score.textContent = money(Math.round(run.score));
    this.dist.textContent = (run.dist / 1000).toFixed(2);
    if (run.nearMisses !== undefined) this.near.textContent = run.nearMisses;

    const hot = run.combo > 1.05;
    this.combo.parentElement.hidden = !hot;
    if (hot) {
      this.combo.textContent = run.combo.toFixed(1);
      this.comboBar.style.width = Math.max(0, Math.min(100, run.comboT / 2.6 * 100)) + '%';
    }

    if (run.eventT > 0 && run.lastEvent) {
      this.event.hidden = false;
      this.event.textContent = run.lastEvent.text;
      this.event.className = 'event ' + (run.lastEvent.kind || '');
    } else this.event.hidden = true;

    // how much car is left
    this.dmgBar.style.width = Math.round(run.damage * 100) + '%';
    this.dmgWrap.classList.toggle('crit', run.damage > 0.75);

    // the clock, which is the entire scoreboard
    if (this.clockT && timeFree !== undefined) {
      const m = Math.floor(timeFree / 60), s = Math.floor(timeFree % 60);
      this.clockT.textContent = m + ':' + String(s).padStart(2, '0');
      this.clockWhere.textContent = floors
        ? (borough || '') + '  ·  FLOOR ' + floor + ' / ' + floors
        : (borough || '');
    }
    if (this.seenEl) {
      this.seenEl.hidden = !(seen || searching);
      this.seenEl.textContent = seen ? 'SEEN' : 'SEARCHING';
      this.seenEl.classList.toggle('hunt', !seen);
    }
    if (this.promptEl) {
      this.promptEl.hidden = !prompt;
      if (prompt) this.promptEl.textContent = prompt;
    }
    if (this.stamEl) {
      this.stamEl.hidden = stamina === null || stamina === undefined;
      if (stamina !== null && stamina !== undefined) {
        this.stamBar.style.width = Math.round(stamina * 100) + '%';
        this.stamEl.classList.toggle('low', stamina < 0.28);
      }
    }
    // the touch buttons belong on touch devices only - they were showing on
    // desktop the moment any prompt appeared
    const touchOn = !document.getElementById('touch').hidden;
    if (this.useBtn) this.useBtn.hidden = !(prompt && touchOn);

    // how much of you is left, and what is in the gun
    if (this.hpBar && hp !== undefined) {
      this.hpBar.style.width = Math.round(Math.max(0, hp) * 100) + '%';
    }
    if (this.ammoEl && ammo !== undefined) {
      this.ammoEl.textContent = ammo;
      this.magsEl.textContent = '/ ' + mags;
      this.reloadEl.hidden = !reloading;
    }
    if (this.fireBtn) this.fireBtn.hidden = !touchOn;

    // ---- what they have on you ----
    // The board is the scoreboard of this game. It only redraws when it
    // changes, because it is read constantly and must never flicker.
    if (this.boardList && hunt) {
      const sig = hunt.lines.map(l => (l.known ? '1' : '0')).join('');
      if (sig !== this.boardShown) {
        this.boardShown = sig;
        this.boardList.innerHTML = hunt.lines.map(l =>
          '<li class="' + (l.known ? 'on' : '') + '">' + l.id.toUpperCase() + '</li>').join('');
      }
      this.boardId.hidden = !hunt.identified;
    }

    // ---- what you are carrying ----
    if (this.invList && hunt) {
      const K = hunt.kit;
      const rows = [
        ['MASK', K.mask ? (hunt.wearingMask ? 'ON' : 'IN POCKET') : null],
        ['GLOVES', K.gloves ? 'WORN' : null],
        ['PLATES', K.plates ? (hunt.plateSwapped ? 'USED' : 'SPARE') : null],
        ['CLOTHES', K.change ? 'IN BAG' : null],
        ['BURNER', K.burner ? 'CARRIED' : null],
        ['CASH', hunt.cash > 0 ? String(Math.round(hunt.cash)) : null],
        ['SUPPLIES', hunt.supplies > 0 ? String(hunt.supplies) : null],
        ['ROUNDS', String(ammo) + ' + ' + String(mags)],
      ];
      const sig = rows.map(r => r[0] + (r[1] || '-')).join('|');
      if (sig !== this.invShown) {
        this.invShown = sig;
        this.invList.innerHTML = rows.map(r => {
          if (!r[1]) return '<li class="gone"><span>' + r[0] + '</span><b>—</b></li>';
          const live = r[1] === 'ON' || r[1] === 'WORN';
          return '<li class="' + (live ? 'active' : 'idle') + '"><span>' + r[0] +
                 '</span><b>' + r[1] + '</b></li>';
        }).join('');
      }
    }

    // ---- needs ----
    if (this.nFood && hunt) {
      const set = (el, v) => {
        el.style.width = Math.round(v * 100) + '%';
        el.classList.toggle('low', v < 0.25);
      };
      set(this.nFood, hunt.food);
      set(this.nWater, hunt.water);
      set(this.nEnergy, hunt.energy);
    }

    // ---- they are coming up the stairs ----
    if (this.sweepEl) {
      this.sweepEl.hidden = !(sweep > 0.01);
      if (sweep > 0.01) this.sweepB.style.width = Math.round(sweep * 100) + '%';
    }

    this.heatWrap.hidden = heat <= 0;
    this.pips.forEach((p, i) => p.classList.toggle('on', i < heat));
    this.bustWrap.hidden = bust <= 0.02;
    this.bustBar.style.width = Math.round(bust * 100) + '%';

    this.warn.hidden = !offRoad;

    // distance to the next roadblock, while it matters
    if (blockIn !== null && blockIn !== undefined && blockIn < 420) {
      this.blockWarn.hidden = false;
      this.blockDist.textContent = Math.max(0, Math.round(blockIn / 10) * 10);
    } else this.blockWarn.hidden = true;

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.hidden = true;
    }
  }

  banner(text, col) {
    this.bannerEl.hidden = false;
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = col || '#fff';
    this.bannerEl.style.animation = 'none';
    void this.bannerEl.offsetWidth;
    this.bannerEl.style.animation = '';
    this.bannerT = 1.1;
  }

  toast(text, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = text;
    this.toasts.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity .3s'; d.style.opacity = '0';
      setTimeout(() => d.remove(), 320);
    }, 1400);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }
}

function arcPath(cx, cy, r, a0, a1) {
  if (a1 <= a0 + 0.1) return '';
  const rad = a => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
