// Shared mutable state + engine handles. Kept in one tiny module so the gameplay modules can share it.
export const G = {
  mode: 'title',          // title | play | modal | shop | dead | victory | hub
  baseMode: 'play',       // the mode to go back to when a modal closes
  monsters: [], projs: [], eprojs: [], pickups: [], zones: [], summons: [], chests: [], timers: [], hazards: [], dying: [],
  P: null, F: null, M: null, run: null, save: null, input: null,
  shake: 0, hitstop: 0, time: 0, room: -1, boss: null, stairs: null, flow: null, flowT: 0,
  pendingLevels: 0, levelDelay: 0, modalQueue: [], modalOpen: false, modalApi: null, autopilot: false,
};
export const C = { scene: null, camera: null, renderer: null, fx: null, flash: null, ground: null, dmg: null, TEX: null, ui: null };
