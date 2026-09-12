// Cutscene player: pixel-text beats over a STAGED SHOT.
//
// A beat naming a shot gets a real diorama built behind it -- the dragon
// asleep on its hoard, the kingdom burning -- rendered through the same N64
// pipeline as the game. A beat with no shot falls back to the live world, so a
// boss intro can still hold on the boss itself. Any key advances; ESC skips.
import { renderBlock } from './pixelFont.js';
import { CutsceneStage } from './cutsceneStage.js';
import './shotsDark.js';   // registers chapter four's shots

export class Cutscene {
  constructor() {
    this.el = document.getElementById('cutscene');
    this.textEl = document.getElementById('cutscene-text');
    this.skipEl = document.getElementById('cutscene-skip');
    this.beats = [];
    this.index = -1;
    this.t = 0;
    this.active = false;
    this.onDone = null;
    this.fade = 0;
    this.stage = new CutsceneStage();

    const advance = (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (e.code === 'Escape') this.finish();
      else this.next();
    };
    addEventListener('keydown', advance);
    this.el.addEventListener('click', () => { if (this.active) this.next(); });
  }

  /** @param beats array of { lines, hold, title, boss } */
  play(beats, onDone) {
    if (!beats || !beats.length) { onDone?.(); return; }
    this.beats = beats;
    this.index = -1;
    this.active = true;
    this.onDone = onDone;
    this.el.hidden = false;
    this.next();
  }

  next() {
    this.index++;
    if (this.index >= this.beats.length) { this.finish(); return; }
    const beat = this.beats[this.index];
    this.t = beat.hold ?? 3.0;
    this.fade = 0;
    this.stage.setShot(beat.shot || null);

    const scale = beat.title ? 5 : 3;
    const color = beat.boss ? '#ff6a4a' : beat.title ? '#f2c14e' : '#e8dfc8';
    const canvas = renderBlock(beat.lines, {
      scale, color, shadow: '#000', shadowOffset: 2, lineGap: 3,
    });
    canvas.style.imageRendering = 'pixelated';
    this.textEl.innerHTML = '';
    this.textEl.appendChild(canvas);
  }

  finish() {
    this.active = false;
    this.el.hidden = true;
    this.stage.clear();
    this.textEl.innerHTML = '';
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  update(dt) {
    if (!this.active) return;
    this.stage.update(dt);
    this.t -= dt;
    // fade the text in over the first third of a second
    this.fade = Math.min(1, this.fade + dt * 3.5);
    this.textEl.style.opacity = this.fade.toFixed(2);
    if (this.t <= 0) this.next();
  }
}
