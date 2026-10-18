// HUD: ammo / fire mode, health, stance, compass, crosshair (hidden when aiming), hit markers,
// kill feed, enemy radio callouts, damage direction, objective line, range readout, vignettes.
const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud'); this.vig = $('vignette');
    this.hm = $('hitmark'); this.hmT = 0;
    this.feed = $('killfeed'); this.calls = $('callouts'); this.dmg = $('dmgdir');
    this.strip = $('compassStrip');
    this.xh = $('xhair');
    this.hurtV = 0; this.suppressV = 0;
    // compass ticks: 0..360 repeated 3 times so it scrolls seamlessly
    const marks = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    this.pxPerDeg = 3;
    let html = '';
    for (let rep = -1; rep <= 1; rep++) for (let d = 0; d < 360; d += 15) {
      const x = (rep * 360 + d) * this.pxPerDeg;
      html += marks[d] ? `<span class="c" style="left:${x}px">${marks[d]}</span>` : `<span class="t" style="left:${x}px">${d}</span>`;
    }
    this.strip.innerHTML = html;
    this.centerT = 0;
  }
  show(on) { this.el.classList.toggle('hidden', !on); if (!on) { this.vig.style.opacity = 0; } }
  weapon(ws) {
    const s = ws.slot; if (!s) return;
    $('gunName').textContent = s.stats.name;
    $('mag').textContent = s.mag;
    $('reserve').textContent = '/ ' + (s.reserve === Infinity ? '∞' : s.reserve);
    const mode = s.stats.modes[s.mode] || 'semi';
    $('fireMode').textContent = { auto: 'AUTO', semi: 'SEMI', bolt: 'BOLT', pump: 'PUMP', burst: 'BURST' }[mode] + (ws.slot.stats.laser ? (ws.laserOn ? ' · LASER' : ' · laser off') : '');
    $('mag').style.color = s.mag <= Math.ceil(s.stats.mag * 0.25) ? '#e0453a' : '';
  }
  vitals(p) {
    $('hpBar').firstElementChild.style.width = Math.max(0, p.health) + '%';
    $('stance').textContent = (p.slide > 0 ? 'SLIDE' : p.mantle ? (p.mantle.vault ? 'VAULT' : 'MANTLE') : p.tac ? 'TAC SPRINT' : p.sprint ? 'SPRINT' : p.stance.toUpperCase()) + (Math.abs(p.lean) > 0.3 ? (p.lean > 0 ? ' · LEAN R' : ' · LEAN L') : '');
  }
  compass(yawRad, enemies = []) {
    let deg = (-yawRad * 180 / Math.PI) % 360; if (deg < 0) deg += 360;
    this.strip.style.left = (210 - deg * this.pxPerDeg) + 'px';
  }
  crosshair(spreadPx, ads) {
    this.xh.style.opacity = ads > 0.5 ? 0 : 0.9;
    const s = Math.max(4, spreadPx);
    const [t, b, l, r] = this.xh.children;
    t.style.top = (-s - 8) + 'px'; b.style.top = s + 'px'; l.style.left = (-s - 8) + 'px'; r.style.left = s + 'px';
  }
  hitmarker(kill, head) {
    this.hm.classList.toggle('kill', !!kill);
    this.hm.style.opacity = 1; this.hm.style.transform = `scale(${head ? 1.35 : 1})`; this.hmT = kill ? 0.45 : 0.22;
  }
  killfeed(html) {
    const d = document.createElement('div'); d.innerHTML = html; this.feed.prepend(d);
    setTimeout(() => d.remove(), 5000); while (this.feed.children.length > 5) this.feed.lastChild.remove();
  }
  callout(text, who = 'Team') {
    const d = document.createElement('div'); d.innerHTML = '<b>[' + String(who).replace(/[<&]/g, '') + ']</b> ' + text; this.calls.prepend(d);
    setTimeout(() => d.remove(), 3500); while (this.calls.children.length > 4) this.calls.lastChild.remove();
  }
  damageFrom(angle) {
    const i = document.createElement('i'); i.style.transform = `rotate(${angle}rad)`; this.dmg.appendChild(i);
    setTimeout(() => { i.style.opacity = 0; }, 900); setTimeout(() => i.remove(), 1600);
    this.hurtV = Math.min(1, this.hurtV + 0.5);
  }
  suppress(k) { this.suppressV = Math.min(1, this.suppressV + k); }
  objective(text, sub = '') { $('objective').innerHTML = text + (sub ? `<small>${sub}</small>` : ''); }
  center(text, dur = 2.5) { const c = $('center-msg'); c.textContent = text; c.style.opacity = 1; this.centerT = dur; }
  // score: null hides it (range); a pop line per award, newest on top
  score(v, pop) {
    $('score').style.display = v == null ? 'none' : '';
    if (v == null) return;
    $('scoreV').textContent = v.toLocaleString();
    if (pop) { const box = $('scorePops'), d = document.createElement('div'); d.textContent = pop; box.prepend(d); setTimeout(() => d.remove(), 1700); while (box.children.length > 5) box.lastChild.remove(); }
  }
  // lethal (F) and tactical (X) with what is left
  nades(kit, n) {
    if (!kit || !n) { $('nades').innerHTML = ''; return; }
    const S = { frag: 'FRAG', semtex: 'SEMTEX', flash: 'FLASH', smoke: 'SMOKE' }, c = v => v > 9 ? ' ∞' : '<i></i>'.repeat(Math.max(0, v));
    $('nades').innerHTML = `<span><kbd>F</kbd>${S[kit.lethal]}${c(n.lethal)}</span><span><kbd>X</kbd>${S[kit.tactical]}${c(n.tactical)}</span>`;
  }
  matchbar(html) { const el = $('matchbar'); if (html == null) { el.style.display = 'none'; return; } el.style.display = ''; if (html !== this._mb) { el.innerHTML = html; this._mb = html; } }
  board(html) { const el = $('board'); if (html == null) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; } el.classList.remove('hidden'); if (html !== this._bd) { el.innerHTML = html; this._bd = html; } }
  pickup(text) { const p = $('pickup'); p.textContent = text; p.style.opacity = 1; clearTimeout(this._pk); this._pk = setTimeout(() => p.style.opacity = 0, 1400); }
  rangeInfo(text) { $('rangeInfo').textContent = text || ''; }
  update(dt, player) {
    if (this.hmT > 0) { this.hmT -= dt; if (this.hmT <= 0) this.hm.style.opacity = 0; }
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) $('center-msg').style.opacity = 0; }
    this.hurtV = Math.max(0, this.hurtV - dt * 0.8);
    this.suppressV = Math.max(0, this.suppressV - dt * 0.7);
    const low = player ? Math.max(0, 1 - player.health / 60) : 0;
    this.vig.style.opacity = Math.min(1, this.hurtV * 0.8 + low * 0.7);
  }
}
