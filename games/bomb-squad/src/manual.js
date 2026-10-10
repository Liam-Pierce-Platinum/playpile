// The paper manual: a flip-open booklet (DOM), printed from the rule data in rules.js.
import { WIRE_RULES, BUTTON_RULES, STRIP_DIGIT, SWITCH_RULES, SYMBOLS, KEY_COLUMNS, SIMON_MAP, MAZES, WORDS, VENT_VALVE, MODULE_NAMES } from './rules.js';

const chip = (c) => `<span class="chip ${c}">${c}</span>`;
const fmt = (s) => s.replace(/\{(\w+)\}/g, (_, c) => chip(c));
const ICON = { info: 'ⓘ', wires: '⌇', button: '◉', switches: '⇅', keypad: '▦', simon: '◆', maze: '⌗', code: '⊞', vent: '♨' };
const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

function svgSym(i, size = 34) {
  return `<svg viewBox="-2 -2 24 24" width="${size}" height="${size}"><path d="${SYMBOLS[i]}" fill="none" stroke="#1f1b16" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function svgMaze(m, n) {
  const c = 18, o = 6, w = c * 5 + o * 2;
  let s = `<svg viewBox="0 0 ${w} ${w}" width="100%" class="maze"><rect x="${o}" y="${o}" width="${c * 5}" height="${c * 5}" fill="#fbf6ea" stroke="#1f1b16" stroke-width="2.5"/>`;
  for (let i = 0; i < 25; i++) {
    const x = o + (i % 5) * c, y = o + ((i / 5) | 0) * c;
    s += `<circle cx="${x + c / 2}" cy="${y + c / 2}" r="1.3" fill="#8b8270"/>`;
    if (i % 5 < 4 && !(m.open[i] & 2)) s += `<line x1="${x + c}" y1="${y}" x2="${x + c}" y2="${y + c}" stroke="#1f1b16" stroke-width="2.5" stroke-linecap="round"/>`;
    if (i < 20 && !(m.open[i] & 4)) s += `<line x1="${x}" y1="${y + c}" x2="${x + c}" y2="${y + c}" stroke="#1f1b16" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  const rx = o + (m.ring % 5) * c + c / 2, ry = o + ((m.ring / 5) | 0) * c + c / 2;
  s += `<circle cx="${rx}" cy="${ry}" r="6" fill="none" stroke="#1d9a50" stroke-width="2.4"/>`;
  return s + `<text x="${w - 4}" y="${w - 1}" font-size="7" text-anchor="end" fill="#8b8270">${n}</text></svg>`;
}
function svgWiresArt() {
  const cols = ['#d9372c', '#2e6fd9', '#f3c22f', '#232428'];
  let s = '<svg viewBox="0 0 140 64" width="140" height="64" class="art">';
  cols.forEach((col, i) => { const y = 10 + i * 14; s += `<path d="M10 ${y} C 50 ${y + 8} 90 ${y - 4} 130 ${y}" stroke="#111" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M10 ${y} C 50 ${y + 8} 90 ${y - 4} 130 ${y}" stroke="${col}" stroke-width="5" fill="none" stroke-linecap="round"/><text x="2" y="${y + 3}" font-size="8">${i + 1}</text>`; });
  return s + '<text x="136" y="62" font-size="7" text-anchor="end">top wire = 1st</text></svg>';
}

const PAGES = {
  info: () => `
    <h2>${ICON.info} Read the bomb</h2>
    <p class="lead">Click or tap a module and this booklet flips to its page. Three strikes and it goes off. Every strike makes the clock run faster.</p>
    <div class="infogrid">
      <div class="infobox"><div class="serial"><i>SERIAL NO.</i><b>KT4AE7</b></div><p>The <b>last digit</b> is odd (1 3 5 7 9) or even (0 2 4 6 8). The only <b>vowels</b> are A, E and U: serials never use I, O or Y.</p></div>
      <div class="infobox"><div class="bats"><span></span><span></span><span></span></div><p><b>Batteries</b>: count the gold cells. "No batteries" counts as 0 (even).</p></div>
      <div class="infobox"><div class="ind"><span class="bulb on"></span>SIG <span class="bulb"></span>FRQ</div><p><b>Indicators</b>: a <b>lit</b> one glows. An unlit one does not count as lit.</p></div>
    </div>
    <p>Each module has a light in its corner: <span class="dot green"></span> green means done. Clear every module to defuse. The <b>Vent</b> never clears; just keep it happy.</p>
    <p class="note">Counting: 1st = the top wire, or the leftmost switch.</p>`,
  wires: () => `
    <h2>${ICON.wires} Wires</h2>
    ${svgWiresArt()}
    <p class="lead">Count the wires, use that section, and check the lines in order. Cut the wire from the <b>first</b> line that is true.</p>
    ${[3, 4, 5, 6].map(n => `<section class="wsec" data-n="${n}"><h3>${n} wires</h3><ol>${WIRE_RULES[n].map(r => `<li>${r.if === 'Otherwise' ? '<i>Otherwise</i>' : 'If ' + fmt(r.if).replace(/^(\w)/, m => m.toLowerCase())} <b>→ ${fmt(r.then)}</b></li>`).join('')}</ol></section>`).join('')}`,
  button: () => `
    <h2>${ICON.button} The Button</h2>
    <p class="lead">Check in order. The first true line says <b>TAP</b> or <b>HOLD</b>.</p>
    <ol>${BUTTON_RULES.map(r => `<li>${r.if === 'Otherwise' ? '<i>Otherwise</i>' : 'If ' + fmt(r.if).replace(/^(\w)/, m => m.toLowerCase())} <b class="act ${r.act}">→ ${r.act.toUpperCase()}</b></li>`).join('')}</ol>
    <div class="box"><b>TAP</b>: press and let go straight away.</div>
    <div class="box"><b>HOLD</b>: keep it pressed. A strip lights up beside it. Let go when the clock's <b>last digit</b> is:
      <table class="strip">${Object.entries(STRIP_DIGIT).map(([c, d]) => `<tr><td>${chip(c)} strip</td><td class="big">${d}</td></tr>`).join('')}</table>
      <span class="note">e.g. a blue strip: let go at 0:47 or 0:37.</span></div>`,
  switches: () => `
    <h2>${ICON.switches} Switches</h2>
    <p class="lead">Set each switch by its <b>cap colour</b>. If the rule is false it goes <b>DOWN</b>. Then press <b>SET</b>.</p>
    <table class="rules">${Object.entries(SWITCH_RULES).map(([c, r]) => `<tr><td>${chip(c)}</td><td>${r.text}</td></tr>`).join('')}</table>
    <p class="note">Slots are numbered 1 to 5 from the left. Wrong pattern on SET = a strike.</p>`,
  keypad: () => `
    <h2>${ICON.keypad} Keypad</h2>
    <p class="lead">Exactly <b>one</b> column has all four symbols from the keys. Press the keys in the order they appear in that column, <b>top to bottom</b>.</p>
    <div class="cols">${KEY_COLUMNS.map((col, i) => `<div class="col"><em>${'ABCDE'[i]}</em>${col.map(s => `<div class="sym">${svgSym(s)}</div>`).join('')}</div>`).join('')}</div>`,
  simon: () => {
    const tab = (m) => `<table class="simon">${Object.entries(m).map(([a, b]) => `<tr><td>${chip(a)}</td><td class="arr">→</td><td>${chip(b)}</td></tr>`).join('')}</table>`;
    return `
    <h2>${ICON.simon} Simon</h2>
    <p class="lead">Pads flash a sequence. Press the <b>mapped</b> pad for each flash, in order. Each round adds one more flash: repeat the whole sequence.</p>
    <p class="note">flash → press</p><div class="two"><div><h3>Even batteries <small>(0, 2, 4)</small></h3>${tab(SIMON_MAP.even)}</div><div><h3>Odd batteries <small>(1, 3)</small></h3>${tab(SIMON_MAP.odd)}</div></div>
    <p class="note">The little dots in the middle show how many rounds are done.</p>`;
  },
  maze: () => `
    <h2>${ICON.maze} Dial Maze</h2>
    <p class="lead">Find the maze with the <b class="g">green ring</b> in the same spot. Steer the <b>white square</b> to the <b class="r">red triangle</b>. The walls are hidden on the bomb: bump one and it's a strike.</p>
    <div class="mazes">${MAZES.map((m, i) => svgMaze(m, i + 1)).join('')}</div>`,
  code: () => `
    <h2>${ICON.code} Code Wheel</h2>
    <p class="lead">Spin the four wheels until they spell a word from this list, then press <b>SUBMIT</b>. Only one of these words can be made.</p>
    <div class="words">${WORDS.map(w => `<span>${w}</span>`).join('')}</div>
    <p class="note">Tip: check which letters wheel 1 has, then cross words off.</p>`,
  vent: () => `
    <h2>${ICON.vent} Vent <small>(needy)</small></h2>
    <p class="lead">It never clears. Every so often it <b>hisses</b>, its lamp lights and a counter starts. Open the right valve before the counter hits 0, or take a strike.</p>
    <table class="rules">${Object.entries(VENT_VALVE).map(([c, v]) => `<tr><td>${chip(c)} lamp</td><td><b>${['LEFT', 'MIDDLE', 'RIGHT'][v]}</b> valve</td></tr>`).join('')}</table>
    <div class="box">Lamp <b>blinking</b>? Use the next valve to the <b>right</b> instead (RIGHT wraps round to LEFT).</div>`,
};

export class Manual {
  constructor(root, onToggle) {
    this.root = root; this.page = 'info'; this.open = true; this.onToggle = onToggle;
    root.innerHTML = `<div class="mhead"><div class="rings">${'<i></i>'.repeat(9)}</div><nav class="tabs"></nav><button class="mtoggle" aria-label="Show or hide the manual">MANUAL</button></div><div class="mpage"><article></article></div>`;
    this.tabs = root.querySelector('.tabs'); this.art = root.querySelector('article'); this.pageEl = root.querySelector('.mpage');
    root.querySelector('.mtoggle').onclick = () => this.setOpen(!this.open);
  }
  setTypes(types) {
    this.types = ['info', ...new Set(types)];
    this.tabs.innerHTML = this.types.map(t => `<button data-p="${t}" title="${t === 'info' ? 'Bomb info' : MODULE_NAMES[t]}"><span>${ICON[t]}</span><em>${t === 'info' ? 'Info' : MODULE_NAMES[t].replace('The ', '').replace(' (needy)', '')}</em></button>`).join('');
    this.tabs.querySelectorAll('button').forEach(b => b.onclick = () => { this.show(b.dataset.p); this.onFlip?.(); });
    this.page = null; this.show('info', {}, true);
  }
  show(p, opt = {}, instant = false) {
    if (!this.types?.includes(p)) return;
    if (this.page !== p) {
      this.page = p;
      this.art.innerHTML = PAGES[p]();
      this.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
      const tb = this.tabs.querySelector('button.on');
      if (tb) { const l = tb.offsetLeft, r = l + tb.offsetWidth, v = this.tabs; if (l < v.scrollLeft) v.scrollLeft = l - 6; else if (r > v.scrollLeft + v.clientWidth) v.scrollLeft = r - v.clientWidth + 6; }
      this.pageEl.scrollTop = 0;
      if (!instant) { this.art.classList.remove('flip'); void this.art.offsetWidth; this.art.classList.add('flip'); }
    }
    if (p === 'wires' && opt.wires) {
      this.art.querySelectorAll('.wsec').forEach(s => s.classList.toggle('hi', +s.dataset.n === opt.wires));
      const el = this.art.querySelector(`.wsec[data-n="${opt.wires}"]`);
      // only scroll when the section is not already fully on screen, so short pages keep their heading
      if (el) { const fits = el.offsetTop + el.offsetHeight + 8 <= this.pageEl.clientHeight; this.pageEl.scrollTo({ top: fits ? 0 : el.offsetTop - 10, behavior: instant ? 'auto' : 'smooth' }); }
    }
  }
  setOpen(v) { this.open = v; this.root.classList.toggle('closed', !v); this.onToggle?.(v); }
}
