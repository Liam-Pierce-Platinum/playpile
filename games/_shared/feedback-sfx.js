// Small procedural effects for games whose rules previously had no audio bus.
const SHOTS = {
  pop: [920, 0.12, 135], crack: [1540, 0.1, 155], boom: [600, 0.24, 84],
  thunk: [470, 0.2, 92], thump: [410, 0.11, 87], thud: [310, 0.15, 73],
  stab: [1950, 0.08, 148], chop: [1240, 0.12, 108], clang: [2880, 0.18, 227],
};

export function createFeedback(slug, options = {}) {
  const storage = `pd.${slug}.feedbackMuted`;
  let context, output, noise, engine;
  let muted = false;
  try { muted = localStorage.getItem(storage) === '1'; } catch {}

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.style.cssText = 'position:fixed;z-index:50;min-width:44px;min-height:44px;padding:5px;border:1px solid #ffffff70;border-radius:8px;background:#111820e6;color:#f3f0e8;font:20px/1 Arial,sans-serif;touch-action:manipulation;cursor:pointer';
  mute.style.top = options.top || 'max(6px,env(safe-area-inset-top))';
  mute.style.right = options.right || 'max(6px,env(safe-area-inset-right))';
  if (options.left) { mute.style.left = options.left; mute.style.right = 'auto'; }
  document.body.append(mute);

  const level = () => muted || document.hidden ? 0 : 0.55;
  function showMute() {
    mute.textContent = muted ? '🔇' : '🔊';
    mute.title = muted ? 'Turn sound on' : 'Mute sound';
    mute.setAttribute('aria-label', mute.title);
    mute.setAttribute('aria-pressed', String(muted));
    if (output && context.state !== 'closed') output.gain.setTargetAtTime(level(), context.currentTime, 0.03);
  }
  showMute();

  function activate() {
    if (muted || document.hidden) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context) {
        context = new Audio();
        output = context.createGain();
        output.gain.value = level();
        output.connect(context.destination);
      }
      if (context.state !== 'running' && context.state !== 'closed') context.resume().catch(() => {});
    } catch {}
  }
  for (const event of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(event, e => { if (e.isTrusted) activate(); }, { capture:true, passive:true });
  }
  document.addEventListener('visibilitychange', showMute);
  mute.addEventListener('click', event => {
    event.stopPropagation();
    muted = !muted;
    try { localStorage.setItem(storage, muted ? '1' : '0'); } catch {}
    showMute();
    if (!muted) activate();
  });

  function audible() { return context?.state === 'running' && level() > 0; }
  function envelope(node, duration, volume) {
    const now = context.currentTime;
    const amp = context.createGain();
    amp.gain.setValueAtTime(volume, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    node.connect(amp).connect(output);
    return now;
  }
  function tone(from, to, duration, volume = 0.2, wave = 'triangle') {
    if (!audible() || volume <= 0) return;
    const osc = context.createOscillator();
    osc.type = wave;
    const now = envelope(osc, duration, volume);
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    osc.start(now); osc.stop(now + duration);
  }
  function burst(frequency, duration, volume = 0.3) {
    if (!audible() || volume <= 0) return;
    if (!noise) {
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.4), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i=0; i<samples.length; i++) samples[i] = Math.random()*2-1;
    }
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    source.connect(filter);
    const now = envelope(filter, duration, volume);
    source.start(now); source.stop(now+duration);
  }
  function shot(kind = 'pop', volume = 1) {
    const [frequency, duration, pitch] = SHOTS[kind] || SHOTS.pop;
    burst(frequency, duration, 0.52 * volume);
    tone(pitch, Math.max(40, pitch*0.4), duration*0.74, 0.31*volume);
  }
  function motor(active, frequency = 0, load = 0, wave = 'sawtooth') {
    if (!context || context.state === 'closed') return;
    if (!active || !audible()) {
      if (engine?.active) {
        engine.amp.gain.setTargetAtTime(0, context.currentTime, 0.03);
        engine.active = false;
      }
      return;
    }
    if (!engine) {
      const osc = context.createOscillator();
      const filter = context.createBiquadFilter();
      const amp = context.createGain();
      osc.type = wave;
      filter.type = 'lowpass';
      amp.gain.value = 0;
      osc.connect(filter).connect(amp).connect(output);
      osc.start();
      engine = {osc,filter,amp};
    }
    engine.active = true;
    const now = context.currentTime;
    engine.osc.frequency.setTargetAtTime(frequency, now, 0.035);
    engine.filter.frequency.setTargetAtTime(240 + load * 720, now, 0.06);
    engine.amp.gain.setTargetAtTime(0.04 + 0.15 * load, now, 0.055);
  }
  return { tone, burst, shot, motor };
}
