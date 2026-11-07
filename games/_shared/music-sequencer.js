// Schedule a short, repeating score on the audio clock. Games call update
// from their own frame loop so no scheduler stays awake when they are idle.
export function createMusicSequencer(context, output, { bpm, steps, notesAt }) {
  const eighth = 30 / bpm;
  const bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(output);

  const voices = new Set();
  let nextNote = null;
  let step = 0;
  let level = 0;

  function playNote([pitch, type, strength, length], at) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const duration = eighth * length;
    oscillator.type = type;
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(strength, at + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(bus);
    voices.add(oscillator);
    oscillator.onended = () => {
      voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  function setLevel(volume, time) {
    if (level === volume) return;
    level = volume;
    bus.gain.cancelScheduledValues(time);
    bus.gain.setTargetAtTime(volume, time, 0.018);
  }

  function stop() {
    if (nextNote === null) return;
    const time = context.currentTime;
    setLevel(0, time);
    for (const voice of voices) voice.stop(time + 0.025);
    voices.clear();
    nextNote = null;
  }

  return {
    stop,
    update(volume) {
      if (!volume || context.state !== 'running') { stop(); return; }
      const time = context.currentTime;
      setLevel(volume, time);
      // Skip the overdue window after sleep or a long frame. Never play a
      // backlog of notes all at once.
      if (nextNote === null || nextNote < time) nextNote = time + 0.015;
      while (nextNote <= time + 0.16) {
        for (const note of notesAt(step)) playNote(note, nextNote);
        nextNote += eighth;
        step = (step + 1) % steps;
      }
    },
  };
}
