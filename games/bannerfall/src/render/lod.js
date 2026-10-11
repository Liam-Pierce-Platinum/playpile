// BANNERFALL :: render/lod.js - level of detail by projected size (DESIGN.md 16.2, 23.10).
// Every LOD distance in the renderers (soldiers, trees, terrain chunks, detail tiles) is tuned for
// the RTS camera: a 40 deg vertical field of view on a 900 px tall screen. lodScale() turns any
// camera into a multiplier on those distances, so a thing switches LOD when it reaches the same
// size on screen: a 70 deg first-person view shrinks the distances, a tall 4K window grows them,
// and the quality preset scales the lot. applyLod() pushes it into every renderer of a view.
const REF_FOV = 40 * Math.PI / 180, REF_H = 900;
export const QUALITY = { low: 0.6, medium: 0.8, high: 1, ultra: 1.3 };

export function lodScale(camera, viewportHeight, quality = 'high') {
  const fov = (camera.fov || 40) * Math.PI / 180;
  const k = (viewportHeight / REF_H) * (Math.tan(REF_FOV / 2) / Math.tan(fov / 2)) * (QUALITY[quality] || 1);
  return Math.max(0.4, Math.min(2.2, k));
}

export function applyLod(V, k) {
  if (!V || V._lod === k) return;
  V._lod = k;
  if (V.units && V.units.setLodScale) V.units.setLodScale(k);
  if (V.props && V.props.setLodScale) V.props.setLodScale(k);
  if (V.terrain && V.terrain.setLodScale) V.terrain.setLodScale(k);
}
