// Axe skins. shape picks the head outline in draw.js; the rest are colours.
// boss: unlocked by beating that boss log for the first time (not for sale).
export const SKINS = [
  { id: 'classic', name: 'Lumberjack', cost: 0, shape: 'classic', head: '#8e9aa6', edge: '#eef3f7', handle: '#c06a32', wrap: '#c0392b' },
  { id: 'hatchet', name: 'Camp Hatchet', cost: 60, shape: 'tomahawk', head: '#4f5d6b', edge: '#dfe7ee', handle: '#8b5a2b', wrap: '#2e86c1' },
  { id: 'cleaver', name: 'Butcher', cost: 120, shape: 'cleaver', head: '#aab4bd', edge: '#ffffff', handle: '#3b2a20', wrap: '#7f8c8d' },
  { id: 'tomahawk', name: 'Tomahawk', cost: 180, shape: 'tomahawk', head: '#7f8c8d', edge: '#f4f6f7', handle: '#a0522d', wrap: '#e67e22', feathers: ['#e74c3c', '#f5f5f5'] },
  { id: 'viking', name: 'Viking', cost: 250, shape: 'broad', head: '#9aa7b0', edge: '#f0f4f6', handle: '#6e3b1e', wrap: '#d4ac0d' },
  { id: 'candy', name: 'Candy Cane', cost: 320, shape: 'broad', head: '#ff8fb1', edge: '#ffffff', handle: '#ffffff', stripe: '#e8364f', wrap: '#e8364f' },
  { id: 'neon', name: 'Neon', cost: 450, shape: 'classic', head: '#1d1b33', edge: '#39ff88', handle: '#2a2846', wrap: '#ff2e88', glow: '#39ff88' },
  { id: 'gnarl', name: 'Gnarlwood', boss: 'gnarl', shape: 'broad', head: '#8a5a2e', edge: '#e8b779', handle: '#4a2c14', wrap: '#3f8a3a' },
  { id: 'iron', name: 'Ironclad', boss: 'iron', shape: 'double', head: '#4b5560', edge: '#cfd8df', handle: '#2b2f33', wrap: '#8a939b' },
  { id: 'frost', name: 'Frostbite', boss: 'frost', shape: 'classic', head: '#9fd8f5', edge: '#ffffff', handle: '#3d6e8f', wrap: '#e8f7ff', glow: '#9fe6ff' },
  { id: 'ember', name: 'Emberbrand', boss: 'ember', shape: 'tomahawk', head: '#3a1a10', edge: '#ffb03a', handle: '#2a120a', wrap: '#ff5a1f', glow: '#ff7a1f', feathers: ['#ff5a1f', '#ffd23a'] },
  { id: 'moss', name: 'Mossback', boss: 'moss', shape: 'cleaver', head: '#5f7d3a', edge: '#d6f0a8', handle: '#4b3420', wrap: '#8fbf4a' },
  { id: 'gold', name: 'Golden Burl', boss: 'gold', shape: 'double', head: '#e5b53a', edge: '#fff4c2', handle: '#7a4a12', wrap: '#c0392b', glow: '#ffe27a' },
];
// The old axes already stuck in a log when it arrives.
export const RUSTY = { id: 'rusty', shape: 'classic', head: '#7d6352', edge: '#a88f7b', handle: '#5b4636', wrap: '#43342a' };
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
