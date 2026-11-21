// Side-view dimensions of the barrel bands, lid and hammer head, in world units.
export function hitsBarrel([x, y], radius, barrel) {
  const dx = Math.max(0, Math.abs(x - barrel.x) - 0.57);
  const dy = Math.max(0, barrel.y - y, y - barrel.y - 1.2);
  if (dx * dx + dy * dy < radius * radius) return true;
  const lidX = Math.max(0, Math.abs(x - barrel.x) - 0.3);
  const lidY = Math.max(0, barrel.y + 1.2 - y, y - barrel.y - 1.27);
  return lidX * lidX + lidY * lidY < radius * radius;
}
export function hitsHammer([x, y], radius, hx, hy) {
  return (x - hx) ** 2 + (y - hy) ** 2 < (0.9 + radius) ** 2;
}
