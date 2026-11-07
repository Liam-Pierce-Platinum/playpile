import { createMusicSequencer } from './music-sequencer.js';
import { SCORES, MUSIC_PREF, musicOn } from './game-scores.js';

const SCALES = {
  major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10], dorian: [0,2,3,5,7,9,10],
  phrygian: [0,1,3,5,7,8,10], pentatonic: [0,2,4,7,9],
};

// Palette controls the instrumentation, space and amount of percussion.
const PALETTES = {
  chip:      ['square',   'triangle', .09, .075, .72, [0,3,6], true],
  pulse:     ['triangle', 'square',   .11, .055, .79, [0,2,4,6], true],
  drift:     ['sawtooth', 'triangle', .065,.08,  .85, [0,3,4,6], true],
  cozy:      ['sine',     'triangle', .16, .08, 1.75, [0,4], false],
  noir:      ['triangle', 'sine',     .13, .11, 1.26, [0,5], false],
  tension:   ['sine',     'sine',     .075,.048,2.75, [0], false],
  mystery:   ['sine',     'triangle', .11, .075,1.28, [0,6], false],
  quest:     ['triangle', 'sine',     .14, .10, 1.85, [0,4], false],
  stadium:   ['sawtooth', 'triangle', .064,.09,  .92, [0,2,4,6], true],
  toy:       ['sine',     'triangle', .15, .082,.92, [0,3,6], false],
  surf:      ['triangle', 'sine',     .15, .087,.82, [0,3,5], true],
  flight:    ['triangle', 'sine',     .13, .09, 1.38, [0,4], true],
  workshop:  ['square',   'triangle', .077,.08,  .55, [0,3,6], true],
  rhythmic:  ['triangle', 'sine',     .13, .13, 1.03, [0,3,4,7], true],
};

export function arrangement([, palette, bpm, tonic, mode, motif, roots]) {
  const scale = SCALES[mode];
  const [lead, bass, leadVolume, bassVolume, length, bassSteps, beat] = PALETTES[palette];
  const pitch = degree => scale[((degree % scale.length) + scale.length) % scale.length] + 12*Math.floor(degree/scale.length);
  const sparse = palette === 'tension' || palette === 'mystery';
  const lyrical = ['cozy','quest','flight','noir'].includes(palette);
  return {
    bpm, steps: 128,
    notesAt(step) {
      const bar = Math.floor(step / 8), phase = Math.floor(bar / 4), beatInBar = step % 8;
      const root = roots[bar % 4];
      const notes = [];
      if (bassSteps.includes(beatInBar) && (phase !== 2 || beatInBar === 0 || beatInBar === 4)) {
        notes.push([tonic - 12 + pitch(root + (beatInBar >= 5 ? 4 : 0)), bass, bassVolume, lyrical ? 2.6 : 1.15]);
      }
      const degree = motif[(beatInBar + (phase === 1 ? 2 : 0)) % 8];
      if (degree !== null && (phase !== 2 || beatInBar % 2 === 0)) {
        const octave = sparse ? 12 : phase === 3 && beatInBar <= 3 ? 24 : 12;
        const note = tonic + octave + pitch(degree + root);
        notes.push([note,lead,leadVolume,length]);
        if (lyrical && beatInBar === 0) notes.push([note-12,'sine',.044,2.2]);
      }
      if (beatInBar === 0 && !sparse) {
        const third = tonic + pitch(root+2), fifth = tonic + pitch(root+4);
        notes.push([third,'triangle',.033,lyrical ? 5.6 : 2.2], [fifth,'sine',.036,lyrical ? 5.6 : 2.2]);
      }
      if (beat && phase !== 2) {
        if (beatInBar === 0 || beatInBar === 4) notes.push([34,'sine',.115,.46]);
        if (beatInBar === 2 || beatInBar === 6) notes.push([81,'triangle',.041,.29]);
        if (beatInBar % 2) notes.push([102,'sine',.026,.18]);
      }
      return notes;
    },
  };
}

export function mountCatalogueScore(slug) {
  const score = SCORES[slug];
  if (!score || window.__playpileMusic) return;
  let enabled = musicOn(), context, sequencer, timer;

  function update() {
    const playing = enabled && !document.hidden && context?.state === 'running';
    if (!playing) {
      clearInterval(timer);
      timer = undefined;
      sequencer?.stop();
      return;
    }
    sequencer.update(.37);
    timer ??= setInterval(update, 90);
  }

  function wake() {
    if (!enabled || document.hidden) return;
    if (!context) {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        sequencer = createMusicSequencer(context, context.destination, arrangement(score));
        context.addEventListener('statechange', update);
      } catch { return; }
    }
    if (context.state === 'running') update();
    else if (context.state !== 'closed') {
      try { context.resume().then(update).catch(() => {}); } catch { /* try again on the next gesture */ }
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) wake(); else update();
  }

  window.__playpileMusic = { title: score[0], wake, setEnabled };
  for (const event of ['pointerup','touchend','click','keydown']) {
    window.addEventListener(event, e => { if (e.isTrusted) wake(); }, { capture:true, passive:true });
  }
  window.addEventListener('storage', e => {
    if (e.key === MUSIC_PREF) { enabled = musicOn(); update(); }
  });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', () => { clearInterval(timer); timer=undefined; sequencer?.stop(); });
  window.addEventListener('pageshow', update);
  try {
    if (window.parent !== window && window.parent.navigator.userActivation?.isActive) wake();
  } catch { /* wait for an in-game gesture when embedded on another origin */ }
}
