// Weapon table. r = blast radius (px), dmg = damage at the centre.
// ammo = uses per match (Infinity for the basic Shell).
export const WEAPONS = [
  { id: 'shell', name: 'Shell', ammo: Infinity, r: 34, dmg: 30, col: '#3b3f4a', desc: 'Trusty basic round.' },
  { id: 'big', name: 'Big Shot', ammo: 3, r: 58, dmg: 44, col: '#2b2f3a', size: 7, desc: 'Fat blast, big crater.' },
  { id: 'cluster', name: 'Cluster', ammo: 2, r: 28, dmg: 16, col: '#e0533a', desc: 'Bursts into 5 bomblets.' },
  { id: 'mirv', name: 'MIRV', ammo: 2, r: 30, dmg: 20, col: '#8a4fe0', desc: 'Splits into 5 at the top of its arc.' },
  { id: 'roller', name: 'Roller', ammo: 3, r: 40, dmg: 36, col: '#2aa84a', size: 6, desc: 'Lands and rolls downhill.' },
  { id: 'digger', name: 'Digger', ammo: 2, r: 34, dmg: 34, col: '#c78a2e', desc: 'Tunnels through hills, then blows.' },
  { id: 'napalm', name: 'Napalm', ammo: 2, r: 20, dmg: 10, col: '#ff7a1a', desc: 'Fire that runs downhill and burns.' },
  { id: 'bouncer', name: 'Bouncer', ammo: 3, r: 36, dmg: 28, col: '#1fb6c9', desc: 'Bounces 3 times, then pops.' },
  { id: 'volcano', name: 'Volcano', ammo: 1, r: 34, dmg: 20, col: '#d1281f', desc: 'Erupts a shower of fireballs.' },
  { id: 'skipper', name: 'Skipper', ammo: 2, r: 26, dmg: 15, col: '#4f7de0', desc: 'Hops along the ground, 4 blasts.' },
  { id: 'sniper', name: 'Sniper', ammo: 2, r: 14, dmg: 12, direct: 52, col: '#222', size: 3, desc: 'Fast and flat. Ignores wind.' },
  { id: 'nuke', name: 'Nuke', ammo: 1, r: 112, dmg: 72, col: '#f2d231', size: 8, desc: 'The big one.' },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const freshAmmo = () => Object.fromEntries(WEAPONS.map((w) => [w.id, w.ammo]));
