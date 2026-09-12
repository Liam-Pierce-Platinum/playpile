// HOW YOU FIGHT.
//
// Shown once at the start of a run, before the player is handed the controls.
// It is CLASS-SPECIFIC on purpose: a knight does not need to be told about
// mana and an archer does not need to be told about a shield, and a wall of
// every binding in the game teaches nobody anything.
//
// It also switches device. If a pad is plugged in it shows the N64 layout and
// nothing else, because a player on a controller has no use for a list of keys
// they cannot press.

/**
 * Rows shared by every class. Keyboard keys first, then the pad equivalent,
 * so one table drives both and neither can drift out of date.
 */
const COMMON = [
  { keys: ['W', 'A', 'S', 'D'], pad: ['STICK'], name: 'MOVE',
    text: 'Hold SHIFT (or Z on the pad) to run.' },
  { keys: ['&#8593;'], pad: ['C&#8593;'], name: 'JUMP', text: '' },
  { keys: ['SPACE'], pad: ['A'], name: 'USE',
    text: 'Talk, open a chest, pick things up, look in a mirror.' },
  { keys: ['E'], pad: ['B'], name: 'SATCHEL',
    text: 'Food, relics, and the map once you have bought one.' },
  { keys: ['TAB'], pad: ['L'], name: 'SWITCH TARGET',
    text: 'Twice in a row releases the lock and gives you free look.' },
  { keys: ['A', 'A'], pad: ['STICK'], name: 'DART ASIDE',
    text: 'Double-tap left or right to throw yourself out of the way. '
      + 'Every class can do it, because dodging a dragon is not a knight-only problem.' },
];

const PER_CLASS = {
  knight: {
    blurb: 'Armour, a shield and no magic at all. You have to be in reach, '
      + 'so everything else is built around surviving being there.',
    rows: [
      { keys: ['&#8592;'], pad: ['C&#8592;'], name: 'SWING',
        text: 'A wide arc. It hits everything in front of you, not just the lock.' },
      { keys: ['&#8594;'], pad: ['C&#8594;'], name: 'JAB',
        text: 'A fast forward thrust that closes the gap. On a wounded tier-one '
          + 'foe it finishes them outright.' },
      { keys: ['&#8595;'], pad: ['C&#8595;'], name: 'BLOCK',
        text: 'Cuts an incoming blow to an eighth -- but only from the FRONT, '
          + 'and never against ice.' },
      { keys: ['W', 'W'], pad: ['STICK'], name: 'DASH',
        text: 'Double-tap forward. Yours alone, and the only dash that commits.' },
    ],
  },
  wizard: {
    blurb: 'A pool of mana instead of a shield. It regenerates slowly on its '
      + 'own, so the pool is the real limit on how fast you can fight.',
    rows: [
      { keys: ['&#8592;'], pad: ['C&#8592;'], name: 'BOLT',
        text: '15 mana. Homes in on whatever you are locked on to.' },
      { keys: ['&#8594;'], pad: ['C&#8594;'], name: 'FLAME',
        text: '45 mana. A close-range cone, not a beam -- you have to step in.' },
      { keys: ['&#8592;', '&#8594;'], pad: ['C&#8592;', 'C&#8594;'], name: 'DRAW MANA',
        text: 'HOLD both. You stop fighting and pull mana back by hand.' },
      { keys: ['&#8595;'], pad: ['C&#8595;'], name: 'BLOCK / SPELL',
        text: 'Buy the spell book at a merchant and this key becomes whichever '
          + 'spell you bind to it.' },
      { keys: [], pad: [], name: 'OUT OF MANA?',
        text: 'You can still swing the staff. It does 1 damage. It is not a '
          + 'plan, it is what you have left.' },
    ],
  },
  archer: {
    blurb: 'The only class with real reach, and it pays for it in ammunition. '
      + 'Arrows do not come back on their own.',
    rows: [
      { keys: ['&#8592;'], pad: ['C&#8592;'], name: 'SHOOT',
        text: '1 arrow. A slow, deliberate draw.' },
      { keys: ['&#8594;'], pad: ['C&#8594;'], name: 'TWIN SHOT',
        text: '2 arrows at once.' },
      { keys: ['&#8592;', '&#8594;'], pad: ['C&#8592;', 'C&#8594;'], name: 'PULL ARROWS',
        text: 'HOLD both next to a body for two seconds and every arrow in it '
          + 'comes back. Merchants sell them too.' },
      { keys: ['&#8595;'], pad: ['C&#8595;'], name: 'BLOCK', text: '' },
      { keys: [], pad: [], name: 'OUT OF ARROWS?',
        text: 'The bow is still a stick. Swinging it does 1 damage.' },
    ],
  },
};

export class Briefing {
  constructor() {
    this.el = document.getElementById('briefing');
    this.nameEl = document.getElementById('brief-name');
    this.deviceEl = document.getElementById('brief-device');
    this.blurbEl = document.getElementById('brief-blurb');
    this.rowsEl = document.getElementById('brief-rows');
    this.done = null;
    document.getElementById('btn-brief-go')
      .addEventListener('click', () => this.hide());
  }

  get open() { return !this.el.hidden; }

  /**
   * @param classId  which hero's controls to explain
   * @param onPad    true if a controller is plugged in
   * @param done     called once the player dismisses it
   */
  show(classId, onPad, done) {
    const info = PER_CLASS[classId];
    this.done = done;
    this.nameEl.textContent = 'THE ' + classId.toUpperCase();
    this.deviceEl.textContent = onPad ? 'CONTROLLER' : 'KEYBOARD';
    this.blurbEl.innerHTML = info.blurb;

    this.rowsEl.innerHTML = '';
    for (const r of [...info.rows, ...COMMON]) {
      const keys = onPad ? r.pad : r.keys;
      const row = document.createElement('div');
      row.className = 'brow';
      row.innerHTML = `
        <span class="bkeys">${keys.map(k => `<kbd>${k}</kbd>`).join('')}</span>
        <span class="btext"><b>${r.name}</b>${r.text ? '<br>' + r.text : ''}</span>`;
      this.rowsEl.appendChild(row);
    }
    this.el.hidden = false;
  }

  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    const fn = this.done;
    this.done = null;
    fn?.();
  }
}
