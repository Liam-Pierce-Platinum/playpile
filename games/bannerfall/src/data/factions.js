// BANNERFALL :: data/factions.js - the kingdoms (DESIGN.md 9.1, 9.2).
// Faction ids 0..4 are playable kingdoms (0 is always the player, Aldmere). 7 is NEUTRAL
// (villages and their militia), 8 is WILD (bandits). Colours are sRGB hex.

export const NEUTRAL = 7, WILD = 8, NF = 9;

export const FACTIONS = {
  aldmere: {
    id: 'aldmere', name: 'Aldmere', short: 'Aldmere', leader: 'The Marshal', main: 0x2f5fa8, trim: 0xe2b33c, ink: 0xf6eccf,
    personality: null, doctrine: 'shieldbow', emblem: 'wheat',
  },
  varkhal: {
    id: 'varkhal', name: 'Varkhal, the Iron Crown', short: 'Varkhal', leader: 'King Oswin the Iron', main: 0xa82f2f, trim: 0x2a2326, ink: 0xf1e3d0,
    personality: 'conqueror', doctrine: 'royal', emblem: 'crown',
  },
  thornwood: {
    id: 'thornwood', name: 'The Thornwood League', short: 'Thornwood', leader: 'Lady Morwen', main: 0x3f6b3a, trim: 0xb08a3e, ink: 0xf2ead2,
    personality: 'ambusher', doctrine: 'hammer', emblem: 'oak',
  },
  saltmere: {
    id: 'saltmere', name: 'The Saltmere Compact', short: 'Saltmere', leader: 'The Salt Lords', main: 0x2f7d86, trim: 0xc9ccd0, ink: 0xf2f4f2,
    personality: 'merchant', doctrine: 'turtle', emblem: 'ship',
  },
  hounds: {
    id: 'hounds', name: "Drogan's Black Hounds", short: 'Black Hounds', leader: 'Drogan the Hound', main: 0xc4652a, trim: 0x1e1a18, ink: 0xf6e6d0,
    personality: 'raider', doctrine: 'horde', emblem: 'hound',
  },
};
export const RIVALS = ['varkhal', 'thornwood', 'saltmere', 'hounds'];

// colour sets indexed by faction slot id once a war is set up (slot 7 neutral, 8 wild)
export const NEUTRAL_COL = { main: 0x8a7a5c, trim: 0xd8ceb4, ink: 0xf4ecd8 };
export const WILD_COL = { main: 0x4a4440, trim: 0x8a2a20, ink: 0xe8d8c8 };

// numeric personalities (DESIGN.md 9.2)
export const PERSONALITY = {
  conqueror: { aggression: 0.7, expansion: 0.8, pillage: 0.2, truce: 0.15, betrayal: 0, targets: 'strongest' },
  ambusher: { aggression: 0.5, expansion: 0.4, pillage: 0.5, truce: 0.6, betrayal: 0.3, targets: 'weakest' },
  merchant: { aggression: 0.3, expansion: 0.6, pillage: 0, truce: 0.8, betrayal: 0.1, targets: 'leader' },
  raider: { aggression: 0.9, expansion: 0.1, pillage: 1, truce: 0.4, betrayal: 0.7, targets: 'richest' },
};
