// Full-screen UI: title, shop, death, victory.
import { CLASS_INFO, DEFAULT_LOOK, randomLook } from '../art/characters.js';
import { CLOTH, ACCENT, TRIM } from '../art/palette.js';
import { upgradesFor } from '../game/progress.js';
import { SPELLS, SPELL_IDS, BOOK_PRICE } from '../game/spells.js';
import { LEVELS, levelIndex } from '../world/levels.js';
import { renderBlock, renderText, applyPixelText, setPixelText } from './pixelFont.js';

/** What a level map costs. Steep on purpose -- it is a real advantage. */
export const MAP_PRICE = 300;
/** Ten arrows. Cheap: the archer's constraint is meant to be the FIGHT. */
export const ARROW_PRICE = 24;

export class Screens {
  constructor(progress, hooks = {}) {
    this.progress = progress;
    this.hooks = hooks;

    this.title = document.getElementById('title');
    this.shop = document.getElementById('shop');
    this.death = document.getElementById('death');
    this.victory = document.getElementById('victory');
    this.sidebar = document.getElementById('sidebar');

    this.classId = progress.classId || 'knight';
    this.look = progress.look || { ...DEFAULT_LOOK[this.classId] };

    this.buildLogo();
    applyPixelText(document);
    this.wireTitle();
    this.wireShop();
    this.wireEndScreens();
    this.refreshTitle();
  }

  /* ---------------- title ---------------- */

  buildLogo() {
    const logo = document.getElementById('title-logo');
    logo.innerHTML = '';
    // fit the logo to whichever dimension is tighter
    const scale = Math.max(3, Math.min(8,
      Math.floor(Math.min(innerWidth / 165, innerHeight / 100))));
    const c = renderBlock(['DUNGEON', 'QUEST'], {
      scale, color: '#f2c14e', shadow: '#5a3c08', shadowOffset: 2, lineGap: 2,
    });
    c.style.imageRendering = 'pixelated';
    logo.appendChild(c);

    const sub = document.getElementById('title-sub');
    sub.innerHTML = '';
    // Name whichever level a START would actually drop you into.
    // progress.level is the level ID, not an index.
    const li = levelIndex(this.progress.level);
    const s = renderText(`LEVEL ${li + 1} - ${LEVELS[li].name}`, {
      scale: 2, color: '#8d7f9e', shadow: '#000',
    });
    s.style.imageRendering = 'pixelated';
    sub.appendChild(s);
  }

  wireTitle() {
    const picker = document.getElementById('class-picker');
    picker.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...picker.querySelectorAll('button')].forEach(n => n.classList.remove('on'));
      b.classList.add('on');
      this.classId = b.dataset.class;
      this.look = { ...DEFAULT_LOOK[this.classId] };
      this.progress.classId = this.classId;
      this.progress.look = this.look;
      this.progress.save();
      this.refreshTitle();
      this.hooks.onClassChange?.(this.classId, this.look);
    });

    document.getElementById('btn-random').addEventListener('click', () => {
      this.look = randomLook(this.classId);
      this.progress.look = this.look;
      this.progress.save();
      this.refreshSwatches();
      this.hooks.onLookChange?.(this.look);
    });

    document.getElementById('btn-start').addEventListener('click', () => {
      this.hide(this.title);
      this.hooks.onStart?.(this.classId, this.look);
    });

    document.getElementById('btn-wipe').addEventListener('click', () => {
      this.progress.reset();
      this.refreshTitle();
      this.hooks.onUpgrade?.();
    });

    addEventListener('resize', () => this.buildLogo());
  }

  refreshTitle() {
    this.buildLogo();   // the subtitle names the level, and that can change
    const info = CLASS_INFO[this.classId];
    document.getElementById('class-blurb').textContent = info.blurb;
    document.getElementById('class-special').textContent = 'SPECIAL — ' + info.special;
    document.getElementById('title-coin').textContent = this.progress.coin;
    const picker = document.getElementById('class-picker');
    [...picker.querySelectorAll('button')].forEach(b =>
      b.classList.toggle('on', b.dataset.class === this.classId));
    this.refreshSwatches();
  }

  refreshSwatches() {
    this.buildSwatches('sw-primary', CLOTH, 'primary');
    this.buildSwatches('sw-secondary', ACCENT, 'secondary');
    this.buildSwatches('sw-trim', TRIM, 'trim');
  }

  buildSwatches(id, colors, key) {
    const el = document.getElementById(id);
    el.innerHTML = '';
    for (const c of colors) {
      const i = document.createElement('i');
      i.style.background = c;
      if (this.look[key] === c) i.classList.add('on');
      i.addEventListener('click', () => {
        this.look = { ...this.look, [key]: c };
        this.progress.look = this.look;
        this.progress.save();
        [...el.children].forEach(n => n.classList.remove('on'));
        i.classList.add('on');
        this.hooks.onLookChange?.(this.look);
      });
      el.appendChild(i);
    }
  }

  /* ---------------- shop ---------------- */

  /** Enable or disable the checkpoint button on the death screen. */
  setCheckpointAvailable(on, name) {
    const b = document.getElementById('btn-respawn');
    b.disabled = !on;
    b.textContent = on ? ('LAST CHECKPOINT — ' + name) : 'NO CHECKPOINT REACHED';
    b.style.opacity = on ? '' : '0.45';
  }

  wireShop() {
    document.getElementById('btn-leave-shop').addEventListener('click', () => {
      this.hide(this.shop);
      this.hooks.onLeaveShop?.();
    });
  }

  openShop(classId) {
    this.shopClass = classId;
    this.renderShop();
    this.show(this.shop);
  }

  renderShop() {
    const list = document.getElementById('upgrade-list');
    document.getElementById('shop-coin').textContent = this.progress.coin;
    list.innerHTML = '';

    // THE SPELL BOOK, and everything in it. Wizard only, and the book has to
    // be bought before any of the spells will show at all.
    if (this.shopClass === 'wizard') this.renderSpells(list);

    // Arrows, for the one class that runs out of them. Pulling them back out
    // of bodies is free but slow; this is the same thing for coin.
    const inv = this.hooks.inventory?.();
    if (this.shopClass === 'archer' && inv) {
      const card = document.createElement('div');
      card.className = 'upg';
      const full = inv.arrows >= inv.maxArrows;
      card.innerHTML = `
        <div class="upg-top">
          <span class="upg-name">A SHEAF OF ARROWS</span>
          <span class="pips">${inv.arrows}/${inv.maxArrows}</span>
        </div>
        <div class="upg-desc">Ten arrows, straight into the quiver.</div>`;
      const btn = document.createElement('button');
      btn.textContent = full ? 'QUIVER FULL' : `BUY — ${ARROW_PRICE}`;
      btn.disabled = full || this.progress.coin < ARROW_PRICE;
      btn.addEventListener('click', () => {
        if (this.progress.coin < ARROW_PRICE) return;
        this.progress.coin -= ARROW_PRICE;
        this.progress.save();
        this.hooks.onBuyArrows?.(10);
        this.renderShop();
      });
      card.appendChild(btn);
      list.appendChild(card);
    }

    // The map sits above the upgrade tree because it is the one thing here
    // that changes how you PLAY the level rather than how hard you hit.
    const lvl = this.hooks.currentLevel?.();
    if (lvl) {
      const owned = this.progress.hasMap(lvl.id);
      const card = document.createElement('div');
      card.className = 'upg mastery' + (owned ? ' maxed' : '');
      card.innerHTML = `
        <div class="upg-top"><span class="upg-name">MAP OF ${lvl.name}</span></div>
        <div class="upg-desc">A chart of the whole level, with the shrines,
          taverns, merchants and unopened chests marked. Press M to read it.</div>`;
      const btn = document.createElement('button');
      btn.textContent = owned ? 'CARRIED' : `BUY — ${MAP_PRICE}`;
      btn.disabled = owned || this.progress.coin < MAP_PRICE;
      btn.addEventListener('click', () => {
        if (!this.progress.buyMap(lvl.id, MAP_PRICE)) return;
        this.renderShop();
        this.hooks.onBuyMap?.(lvl.id);
      });
      card.appendChild(btn);
      list.appendChild(card);
    }

    for (const up of upgradesFor(this.shopClass)) {
      const lv = this.progress.levelOf(this.shopClass, up.id);
      const cost = this.progress.nextCost(this.shopClass, up);
      const maxed = cost === null;
      const afford = !maxed && this.progress.coin >= cost;

      const card = document.createElement('div');
      card.className = 'upg' + (maxed ? ' maxed' : '') + (up.mastery ? ' mastery' : '');

      const pips = Array.from({ length: up.max },
        (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');

      card.innerHTML = `
        <div class="upg-top">
          <span class="upg-name">${up.name}</span>
          <span class="pips">${pips}</span>
        </div>
        <div class="upg-desc">${up.desc}</div>
      `;
      const btn = document.createElement('button');
      btn.textContent = maxed ? (up.mastery ? 'LEARNED' : 'MAXED') : `BUY — ${cost}`;
      btn.disabled = maxed || !afford;
      btn.addEventListener('click', () => {
        if (this.progress.buy(this.shopClass, up)) {
          this.renderShop();
          this.hooks.onUpgrade?.();
        }
      });
      card.appendChild(btn);
      list.appendChild(card);
    }
  }

  /**
   * The book and its contents.
   *
   * A bought spell does nothing until it is BOUND -- the wizard has one slot,
   * on the block key, and choosing what goes in it is meant to be a decision
   * rather than a menu of eight hotkeys.
   */
  renderSpells(list) {
    const P = this.progress;

    if (!P.hasBook) {
      const card = document.createElement('div');
      card.className = 'upg mastery';
      card.innerHTML = `
        <div class="upg-top"><span class="upg-name">A SPELL BOOK</span></div>
        <div class="upg-desc">Empty, and worth nothing on its own. Every
          merchant from here on will sell you something to write in it.</div>`;
      const btn = document.createElement('button');
      btn.textContent = `BUY — ${BOOK_PRICE}`;
      btn.disabled = P.coin < BOOK_PRICE;
      btn.addEventListener('click', () => {
        if (P.coin < BOOK_PRICE) return;
        P.coin -= BOOK_PRICE;
        P.hasBook = true;
        P.save();
        this.renderShop();
        this.hooks.onBuyBook?.();
      });
      card.appendChild(btn);
      list.appendChild(card);
      return;
    }

    // Plain styled text, NOT pixel text: a canvas dropped into the upgrade
    // list inherits the list's full width and the glyphs stretch to fill it.
    const head = document.createElement('div');
    head.className = 'book-head';
    head.textContent = 'THE BOOK';
    list.appendChild(head);

    for (const id of SPELL_IDS) {
      const sp = SPELLS[id];
      const owned = P.spells.includes(id);
      const bound = P.boundSpell === id;
      const card = document.createElement('div');
      card.className = 'upg' + (bound ? ' mastery' : '') + (owned && !bound ? ' maxed' : '');
      card.innerHTML = `
        <div class="upg-top">
          <span class="upg-name" style="color:${sp.colour}">${sp.name}</span>
          <span class="pips">${sp.mana} MANA · ${sp.cooldown}s</span>
        </div>
        <div class="upg-desc">${sp.desc}</div>`;
      const btn = document.createElement('button');
      if (!owned) {
        btn.textContent = `LEARN — ${sp.cost}`;
        btn.disabled = P.coin < sp.cost;
        btn.addEventListener('click', () => {
          if (P.coin < sp.cost || P.spells.includes(id)) return;
          P.coin -= sp.cost;
          P.spells.push(id);
          if (!P.boundSpell) P.boundSpell = id;      // the first one binds itself
          P.save();
          this.renderShop();
          this.hooks.onLearnSpell?.(id);
        });
      } else if (bound) {
        btn.textContent = 'BOUND TO BLOCK';
        btn.disabled = true;
      } else {
        btn.textContent = 'BIND TO BLOCK';
        btn.addEventListener('click', () => {
          P.boundSpell = id;
          P.save();
          this.renderShop();
          this.hooks.onBindSpell?.(id);
        });
      }
      card.appendChild(btn);
      list.appendChild(card);
    }
  }

  /* ---------------- death / victory ---------------- */

  wireEndScreens() {
    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.hide(this.death);
      this.hooks.onRespawn?.();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.hide(this.death);
      this.hooks.onRestart?.();
    });
    document.getElementById('btn-death-title').addEventListener('click', () => {
      this.hide(this.death);
      this.toTitle();
    });
    document.getElementById('btn-victory-title').addEventListener('click', () => {
      this.hide(this.victory);
      this.toTitle();
    });
    document.getElementById('btn-title').addEventListener('click', () => this.toTitle());
  }

  toTitle() {
    this.refreshTitle();
    this.show(this.title);
    this.hooks.onTitle?.();
  }

  showDeath() { this.show(this.death); }
  showVictory(bossName, note) {
    // The victory screen is shared by every level, so its headline has to name
    // whichever dragon actually just died.
    if (bossName) {
      setPixelText(this.victory.querySelector(".big-head"),
        "THE " + bossName.toUpperCase() + " FALLS", { scale: 3, color: "#f2c14e" });
    }
    if (note) this.victory.querySelector("p").textContent = note;
    this.show(this.victory);
  }

  show(el) { el.hidden = false; }
  hide(el) { el.hidden = true; }
  get anyOpen() {
    return !this.title.hidden || !this.shop.hidden ||
      !this.death.hidden || !this.victory.hidden;
  }
}
