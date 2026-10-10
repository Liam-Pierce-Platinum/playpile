// Menus: title, pause, game over, settings, how to play.
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class UI {
  constructor(g) {
    this.g = g;
    this.root = document.getElementById('ui');
    this.el = null; this.panel = null;
    this.pauseBtn = h('button', 'pausebtn', 'II');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.g.mode === 'play' && !this.open) this.show('pause'); });
    this.root.appendChild(this.pauseBtn);
    this.hud(false);
  }
  get open() { return !!this.el; }
  hud(on) { this.pauseBtn.style.display = on ? '' : 'none'; }
  close() { if (this.el) { this.el.remove(); this.el = null; this.panel = null; } }
  show(kind, data = {}) {
    this.close();
    this.panel = kind;
    const el = this.el = h('div', 'scrim ' + kind);
    el.innerHTML = this['p_' + kind](data);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; this.g.audio.unlock(); this.g.audio.play('click'); this.act(b.dataset.act); });
    el.addEventListener('input', (e) => { const k = e.target.dataset.set; if (k) { this.g.audio[k] = +e.target.value / 100; this.g.save[k] = this.g.audio[k]; this.g.audio.apply(); this.g.persist(); } });
    this.root.appendChild(el);
  }
  back() { if (this.g.mode === 'title') this.show('title'); else if (this.panel === 'settings' || this.panel === 'howto') this.show('pause'); else this.close(); }
  primary() { const b = this.el && this.el.querySelector('[data-primary]'); if (b) b.click(); }
  act(a) {
    const g = this.g;
    switch (a) {
      case 'race': g.start('race'); break;
      case 'attack': g.start('attack'); break;
      case 'free': g.start('free'); break;
      case 'again': g.start(g.runMode); break;
      case 'resume': this.close(); break;
      case 'settings': this.show('settings'); break;
      case 'howto': this.show('howto'); break;
      case 'back': this.back(); break;
      case 'title': g.mode = 'title'; this.hud(false); g.newRun('attack', true); g.mode = 'title'; this.show('title'); break;
    }
  }
  p_title() {
    const s = this.g.save;
    return `<div class="title"><div class="logo"><span class="kanji">峠</span><h1><span class="n">TOUGE</span><span class="d">DRIFT</span></h1></div><p class="tag">Mountain pass · Classic 80s hatchback · Eurobeat</p>
      <div class="menu"><button class="btn pink" data-act="race" data-primary>Race <small>${s.wins ? s.wins + ' wins' : 'vs 3 rivals'}</small></button>
      <button class="btn" data-act="attack">Time Attack <small>best ${s.best.toLocaleString()}</small></button>
      <button class="btn" data-act="free">Free Run <small>best ${s.bestFree.toLocaleString()}</small></button>
      <div class="row"><button class="btn sm" data-act="howto">How to play</button><button class="btn sm" data-act="settings">Settings</button></div></div>
      <div class="keys">${this.g.isTouch ? 'Hold left / right side of the screen to steer' : '<b>W</b> gas · <b>S</b> brake · <b>A D</b> steer · <b>Space</b> handbrake · <b>Shift</b> nitro'}</div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
  p_pause() {
    return `<div class="card"><h2>Paused</h2><div class="menu"><button class="btn pink" data-act="resume">Resume</button><button class="btn" data-act="again">Restart (R)</button><button class="btn" data-act="howto">How to play</button><button class="btn" data-act="settings">Settings</button><button class="btn" data-act="title">Quit to title</button></div></div>`;
  }
  p_over(d) {
    return `<div class="card over"><h2>${d.mode === 'attack' ? 'TIME UP' : 'RUN OVER'}</h2>
      <div class="big">${d.score.toLocaleString()}</div>${d.best ? '<div class="nb">NEW BEST!</div>' : `<div class="sub">best ${d.top.toLocaleString()}</div>`}
      <div class="stats"><div><b>${d.dist}</b><span>metres</span></div><div><b>${d.longest.toFixed(1)}s</b><span>longest drift</span></div><div><b>x${d.mult}</b><span>top multiplier</span></div></div>
      <div class="menu row"><button class="btn" data-act="title">Title</button><button class="btn pink" data-act="again" data-primary>Again <small>R / Space</small></button></div></div>`;
  }
  p_race(d) {
    const ord = ['1ST', '2ND', '3RD', '4TH'];
    const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    const col = { hatch: '#f2f2ee', red: '#c81e24', blue: '#2a4e9a', yellow: '#f2c21e' };
    return `<div class="card over"><h2>${d.place === 1 ? 'YOU WIN!' : 'FINISHED ' + ord[d.place - 1]}</h2>
      <div class="big">${ord[d.place - 1]}</div>${d.newBest ? '<div class="nb">NEW BEST TIME!</div>' : `<div class="sub">best ${fmt(d.best)}</div>`}
      <div class="results">${d.rows.map((r, i) => `<div class="res ${r.you ? 'you' : ''}"><b>${ord[i]}</b><i style="background:${col[r.style]}"></i><span>${r.name}</span><em>${fmt(r.time)}</em></div>`).join('')}</div>
      <div class="sub">drift points ${d.score.toLocaleString()} · ${d.wins} win${d.wins === 1 ? '' : 's'} so far</div>
      <div class="menu row"><button class="btn" data-act="title">Title</button><button class="btn pink" data-act="again" data-primary>Race again <small>R / Space</small></button></div></div>`;
  }
  p_settings() {
    const a = this.g.audio;
    return `<div class="card"><h2>Settings</h2><label class="set">Music <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></label>
      <label class="set">Sound <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></label><div class="menu"><button class="btn" data-act="back">Back</button></div></div>`;
  }
  p_howto() {
    const r = (k, t) => `<div class="how"><span class="k">${k}</span><span>${t}</span></div>`;
    return `<div class="card"><h2>How to play</h2>
      ${r('W', 'Gas. <b>S</b> brakes.')}
      ${r('A D', 'Steer. Turn hard at speed and the back steps out: you\'re drifting.')}
      ${r('SPACE', 'Handbrake: kick the car sideways instantly.')}
      ${r('x10', 'Hold a drift to raise the multiplier. Start the next one within 2 seconds to keep it.')}
      ${r('!', 'Drift close to the guardrail for double points. Slam it hard and you lose the drift you were building.')}
      ${r('SHIFT', 'Nitro. It fills up as you bank drifts.')}
      ${r('⏱', 'Time Attack: the chequered checkpoints add time. Free Run has no clock.')}
      <div class="menu"><button class="btn pink" data-act="back">Got it</button></div></div>`;
  }
}
