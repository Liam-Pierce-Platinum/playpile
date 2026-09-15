// ===================== TOKYO SLIDE :: GARAGE =====================
// Buy cars, tune five sliders, bolt on body kits, wings, wheels, paint,
// liveries and underglow. Everything here writes straight into the save and
// re-derives the spec, so the preview always shows exactly what you will drive.

import { CARS, CAR_BY_ID, KITS, WINGS, WHEELS, PAINTS, LIVERIES, GLOWS,
         TUNES, MAX_TUNE, buildSpec, ratings, money } from './catalog.js';
import { drawPreview, carSprite } from './carart.js';
import * as SaveIO from './save.js';

export class Garage {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('garage');
    this.tab = 'cars';
    this.viewCar = null;
    this.raf = 0;
    this.preview = document.getElementById('g-preview');
    this.pctx = this.preview.getContext('2d');

    document.getElementById('btn-garage-back').onclick = () => this.close();
    for (const b of document.querySelectorAll('.g-tab')) {
      b.onclick = () => {
        this.tab = b.dataset.tab;
        for (const o of document.querySelectorAll('.g-tab')) o.classList.toggle('on', o === b);
        for (const p of ['cars', 'tune', 'body', 'paint']) {
          document.getElementById('pane-' + p).hidden = (p !== this.tab);
        }
        this.render();
      };
    }
  }

  get save() { return this.game.save; }

  open() {
    this.viewCar = this.save.current;
    this.el.hidden = false;
    document.getElementById('hud').hidden = true;
    document.getElementById('touch').hidden = true;
    this.render();
    this.loop();
  }

  close() {
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    this.game.closeGarage();
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const step = t => {
      const spec = this.specFor(this.viewCar);
      const cv = this.preview;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const want = Math.round(cv.clientWidth * dpr), wantH = Math.round(cv.clientHeight * dpr);
      if (want && (cv.width !== want || cv.height !== wantH)) { cv.width = want; cv.height = wantH; }
      this.pctx.save();
      this.pctx.scale(dpr, dpr);
      drawPreview(this.pctx, spec, cv.width / dpr, cv.height / dpr, t);
      this.pctx.restore();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  owns(id) { return !!this.save.owned[id]; }

  specFor(id) {
    const l = SaveIO.loadout(this.save, id);
    return buildSpec(id, l);
  }

  // ---------------- rendering ----------------
  render() {
    const s = this.save;
    document.getElementById('g-cash').textContent = money(s.cash);
    // A save written before a catalogue change can name a car that no longer
    // exists; fall back rather than throwing on every render.
    if (!CAR_BY_ID[this.viewCar]) this.viewCar = CARS[0].id;
    const car = CAR_BY_ID[this.viewCar];
    const spec = this.specFor(this.viewCar);
    document.getElementById('g-name').textContent = car.name;

    const r = ratings(spec);
    document.getElementById('g-stats').innerHTML = Object.entries(r).map(([k, v]) =>
      `<div class="st">${k}<div class="bar"><i style="width:${Math.round(v)}%"></i></div></div>`).join('')
      + `<div class="st">${car.drive.toUpperCase()} &middot; ${Math.round(spec.mass)}kg &middot; ${Math.round(spec.power)}kW</div>`;

    // actions
    const act = document.getElementById('g-actions');
    act.innerHTML = '';
    if (!this.owns(this.viewCar)) {
      const b = document.createElement('button');
      b.className = 'big';
      const afford = s.cash >= car.price;
      b.textContent = 'BUY  ' + money(car.price);
      b.style.opacity = afford ? 1 : 0.45;
      b.onclick = () => {
        if (s.cash < car.price) return this.game.say('NOT ENOUGH CASH', 'bad');
        s.cash -= car.price;
        s.owned[this.viewCar] = {
          tune: { power:0, tyre:0, rear:0, susp:0, weight:0 },
          kit:'stock', wing:'none', wheel:'stockw',
          paint: car.color, accent: car.accent, livery:'none', glow:'none',
        };
        s.tierSeen = Math.max(s.tierSeen, car.tier);
        s.current = this.viewCar;
        this.game.persist();
        this.game.say('PURCHASED', 'good');
        this.render();
      };
      act.appendChild(b);
    } else if (s.current !== this.viewCar) {
      const b = document.createElement('button');
      b.className = 'big';
      b.textContent = 'DRIVE THIS';
      b.onclick = () => { s.current = this.viewCar; this.game.persist(); this.game.rebuildPlayer(); this.render(); };
      act.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = 'CURRENT CAR';
      b.style.pointerEvents = 'none';
      act.appendChild(b);
    }
    const sell = CAR_BY_ID[this.viewCar];
    if (this.owns(this.viewCar) && sell.price > 0 && Object.keys(s.owned).length > 1) {
      const b = document.createElement('button');
      b.className = 'ghost small';
      b.textContent = 'SELL  ' + money(Math.round(sell.price * 0.6));
      b.onclick = () => {
        s.cash += Math.round(sell.price * 0.6);
        delete s.owned[this.viewCar];
        if (s.current === this.viewCar) s.current = Object.keys(s.owned)[0];
        this.viewCar = s.current;
        this.game.persist(); this.game.rebuildPlayer(); this.render();
      };
      act.appendChild(b);
    }

    this.renderCars();
    this.renderTune();
    this.renderBody();
    this.renderPaint();
  }

  renderCars() {
    const pane = document.getElementById('pane-cars');
    pane.innerHTML = '';
    let tier = -1;
    for (const c of CARS) {
      if (c.tier !== tier) {
        tier = c.tier;
        const h = document.createElement('div');
        h.className = 'pane-h';
        h.textContent = ['STARTER', 'STREET', 'TUNER', 'PRO', 'LEGEND'][tier];
        pane.appendChild(h);
      }
      const owned = this.owns(c.id);
      const row = document.createElement('div');
      row.className = 'car-row' + (c.id === this.viewCar ? ' on' : '') + (owned ? '' : ' locked');
      const chip = document.createElement('canvas');
      chip.className = 'car-chip'; chip.width = 112; chip.height = 68;
      const cc = chip.getContext('2d');
      const spec = owned ? this.specFor(c.id) : buildSpec(c.id, { paint: c.color, accent: c.accent });
      const spr = carSprite(spec);
      const sc = Math.min(chip.width / (spec.len + 0.9), chip.height / (spec.wid + 0.9));
      cc.save();
      cc.translate(chip.width / 2, chip.height / 2);
      cc.scale(sc, sc);
      cc.drawImage(spr.canvas, -spec.len / 2 - spr.ox / spr.ppm, -spr.oy / spr.ppm,
        spr.w / spr.ppm, spr.h / spr.ppm);
      cc.restore();
      row.appendChild(chip);

      const info = document.createElement('div');
      info.className = 'car-info';
      info.innerHTML = `<div class="car-nm">${c.name}</div>
        <div class="car-sub">${c.drive.toUpperCase()} &middot; ${c.mass}kg &middot; ${c.power}kW</div>`;
      row.appendChild(info);

      const price = document.createElement('div');
      price.className = 'car-price' + (owned ? ' owned' : '');
      price.textContent = owned ? 'OWNED' : money(c.price);
      row.appendChild(price);

      row.onclick = () => { this.viewCar = c.id; this.render(); };
      pane.appendChild(row);
    }
  }

  renderTune() {
    const pane = document.getElementById('pane-tune');
    pane.innerHTML = '';
    if (!this.owns(this.viewCar)) {
      pane.innerHTML = '<div class="pane-h">BUY THIS CAR TO TUNE IT</div>';
      return;
    }
    const l = SaveIO.loadout(this.save, this.viewCar);
    l.tune = l.tune || { power:0, tyre:0, rear:0, susp:0, weight:0 };
    for (const t of TUNES) {
      const lv = l.tune[t.id] | 0;
      const row = document.createElement('div');
      row.className = 'tune-row';
      const next = lv < MAX_TUNE ? `NEXT ${money(t.costPer * (lv + 1))}` : 'MAX';
      row.innerHTML = `<div class="tune-head"><span>${t.name}</span><b>${lv} / ${MAX_TUNE}</b></div>
        <input type="range" min="0" max="${MAX_TUNE}" value="${lv}">
        <div class="tune-note">${t.note} &middot; ${next}</div>`;
      const range = row.querySelector('input');
      range.oninput = () => {
        const want = +range.value;
        if (want <= lv) {          // refund at 60%
          let back = 0;
          for (let i = want + 1; i <= lv; i++) back += t.costPer * i * 0.6;
          this.save.cash += Math.round(back);
          l.tune[t.id] = want;
        } else {
          let cost = 0;
          for (let i = lv + 1; i <= want; i++) cost += t.costPer * i;
          if (cost > this.save.cash) {
            range.value = lv;
            this.game.say('NOT ENOUGH CASH', 'bad');
            return;
          }
          this.save.cash -= cost;
          l.tune[t.id] = want;
        }
        this.save.owned[this.viewCar] = l;
        this.game.persist();
        if (this.save.current === this.viewCar) this.game.rebuildPlayer();
        this.render();
      };
      pane.appendChild(row);
    }
  }

  optGrid(pane, list, currentId, onPick, label) {
    const h = document.createElement('div');
    h.className = 'pane-h'; h.textContent = label;
    pane.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'opt-grid';
    for (const o of list) {
      const d = document.createElement('div');
      d.className = 'opt' + (o.id === currentId ? ' on' : '');
      d.innerHTML = o.name + (o.price ? `<small>${money(o.price)}</small>` : '<small>FREE</small>');
      d.onclick = () => onPick(o);
      grid.appendChild(d);
    }
    pane.appendChild(grid);
  }

  buyPart(l, field, o) {
    const s = this.save;
    const ownedKey = 'parts';
    s[ownedKey] = s[ownedKey] || {};
    const tag = field + ':' + o.id;
    if (o.price > 0 && !s[ownedKey][tag]) {
      if (s.cash < o.price) { this.game.say('NOT ENOUGH CASH', 'bad'); return false; }
      s.cash -= o.price;
      s[ownedKey][tag] = true;
      this.game.say('FITTED', 'good');
    }
    l[field] = o.id;
    s.owned[this.viewCar] = l;
    this.game.persist();
    if (s.current === this.viewCar) this.game.rebuildPlayer();
    this.render();
    return true;
  }

  renderBody() {
    const pane = document.getElementById('pane-body');
    pane.innerHTML = '';
    if (!this.owns(this.viewCar)) { pane.innerHTML = '<div class="pane-h">BUY THIS CAR FIRST</div>'; return; }
    const l = SaveIO.loadout(this.save, this.viewCar);
    this.optGrid(pane, KITS, l.kit || 'stock', o => this.buyPart(l, 'kit', o), 'BODY KIT');
    this.optGrid(pane, WINGS, l.wing || 'none', o => this.buyPart(l, 'wing', o), 'REAR WING');
    this.optGrid(pane, WHEELS, l.wheel || 'stockw', o => this.buyPart(l, 'wheel', o), 'WHEELS');
  }

  renderPaint() {
    const pane = document.getElementById('pane-paint');
    pane.innerHTML = '';
    if (!this.owns(this.viewCar)) { pane.innerHTML = '<div class="pane-h">BUY THIS CAR FIRST</div>'; return; }
    const l = SaveIO.loadout(this.save, this.viewCar);

    const swatches = (title, field) => {
      const h = document.createElement('div');
      h.className = 'pane-h'; h.textContent = title;
      pane.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'sw-grid';
      for (const col of PAINTS) {
        const d = document.createElement('div');
        d.className = 'sw' + (l[field] === col ? ' on' : '');
        d.style.background = col;
        d.onclick = () => {
          l[field] = col;
          this.save.owned[this.viewCar] = l;
          this.game.persist();
          if (this.save.current === this.viewCar) this.game.rebuildPlayer();
          this.render();
        };
        grid.appendChild(d);
      }
      pane.appendChild(grid);
    };
    swatches('BODY COLOUR', 'paint');
    swatches('ACCENT COLOUR', 'accent');
    this.optGrid(pane, LIVERIES, l.livery || 'none', o => this.buyPart(l, 'livery', o), 'LIVERY');
    this.optGrid(pane, GLOWS, l.glow || 'none', o => this.buyPart(l, 'glow', o), 'UNDERGLOW');
  }
}
