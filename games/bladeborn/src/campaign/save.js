// Progress and settings in localStorage. Every access is wrapped: private windows and blocked storage just mean
// nothing is remembered, never an error.
const KEY = 'bladeborn.save.v1', SKEY = 'bladeborn.settings.v1';
const read = k => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

// progress: { level, checkpoint, unlocked: [ids], done: [ids], t }
export function loadProgress() { return read(KEY); }
export function saveProgress(p) { write(KEY, { ...p, t: Date.now() }); }
export function clearProgress() { try { localStorage.removeItem(KEY); localStorage.removeItem('bladeborn.taught.v1'); } catch (_) {} }
export function unlock(id) { const p = loadProgress() || { unlocked: [] }; p.unlocked = [...new Set([...(p.unlocked || []), id])]; saveProgress(p); return p; }

export const DEFAULT_SETTINGS = { sens: 1, invertY: false, volume: 0.8, subtitles: true, fx: true, shake: 1 };
export function loadSettings() { return { ...DEFAULT_SETTINGS, ...(read(SKEY) || {}) }; }
export function saveSettings(s) { write(SKEY, s); }
