// Split / spare puzzles and ball finishes.
export const SPLITS = [
  { name: 'Lone Ten', pins: [10], tip: 'The corner pin. Start left of centre and angle across.' },
  { name: 'Lone Seven', pins: [7], tip: 'Mirror it: start right, aim left.' },
  { name: 'Bucket', pins: [2, 4, 5, 8], tip: 'Hit the 2 pin just left of centre.' },
  { name: 'Washout', pins: [1, 2, 4, 10], tip: 'Clip the head pin thin so it slides into the 10.' },
  { name: 'Baby Split', pins: [3, 10], tip: 'Squeeze between - catch both with the ball.' },
  { name: 'Mirror Baby', pins: [2, 7], tip: 'Same trick on the left.' },
  { name: 'Five-Seven', pins: [5, 7], tip: 'Hit the 5 on its right side to send it left.' },
  { name: 'Three Corners', pins: [6, 7, 10], tip: 'Take the 6 into the 10, then pray for the 7.' },
  { name: 'Greek Church', pins: [4, 6, 7, 9, 10], tip: 'Take the right side and hope for a slider.' },
  { name: 'Four-Six', pins: [4, 6], tip: 'A pin must fly across. Clip one thin.' },
  { name: 'Eight-Ten', pins: [8, 10], tip: 'Thin hit on the 8, send it right.' },
  { name: 'Big Four', pins: [4, 6, 7, 10], tip: 'Legends only. Kick a pin across the deck.' },
];

// unlock: { strikes } total strikes ever, or { stars } total split stars
export const BALLS = [
  { id: 'magenta', name: 'Neon Pop', a: '#ff2bd6', b: '#5a0b8c', glow: '#ff5ce1', unlock: null },
  { id: 'cyan', name: 'Ice Comet', a: '#2de2ff', b: '#0a2a6b', glow: '#5cf0ff', unlock: { strikes: 5 } },
  { id: 'lime', name: 'Acid', a: '#b6ff2e', b: '#0f5a24', glow: '#d4ff6a', unlock: { stars: 6 } },
  { id: 'gold', name: 'Gold Rush', a: '#ffd54a', b: '#7a3c00', glow: '#ffe27a', unlock: { strikes: 20 } },
  { id: 'lava', name: 'Lava', a: '#ff6a1f', b: '#3a0505', glow: '#ff8c4a', unlock: { stars: 18 } },
  { id: 'void', name: 'Void', a: '#9b7bff', b: '#06020f', glow: '#c2adff', unlock: { strikes: 60 } },
];

export function ballUnlocked(ball, save) {
  if (!ball.unlock) return true;
  if (ball.unlock.strikes) return (save.strikes || 0) >= ball.unlock.strikes;
  if (ball.unlock.stars) return totalStars(save) >= ball.unlock.stars;
  return false;
}
export function totalStars(save) { return Object.values(save.stars || {}).reduce((a, b) => a + b, 0); }
export function unlockText(ball) {
  if (!ball.unlock) return '';
  return ball.unlock.strikes ? ball.unlock.strikes + ' strikes' : ball.unlock.stars + ' split stars';
}
