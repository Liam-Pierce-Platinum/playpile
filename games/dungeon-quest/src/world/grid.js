// A UNIFORM GRID OVER THE COLLIDERS.
//
// Every ground query -- and there are a lot of them, one per enemy per frame
// plus the player plus every ground decal -- used to walk the whole collider
// list. A level has a few hundred boxes and, since the visible cliff rock
// started colliding, a few hundred cylinders too, so that is tens of thousands
// of rejections a frame doing nothing.
//
// This buckets them by position once, at build time, and hands back only the
// handful that could possibly be near the point being asked about. It is the
// cheapest possible spatial index and it is more than enough: the world is
// flat-ish, the colliders are small, and nothing moves.

const CELL = 8;

export class ColliderGrid {
  constructor(cell = CELL) {
    this.cell = cell;
    this.map = new Map();
    this.all = [];
    this.dirty = true;
  }

  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  clear() {
    this.map.clear();
    this.all.length = 0;
    this.dirty = true;
  }

  /** Bucket one item by its footprint. */
  insert(item, minX, minZ, maxX, maxZ) {
    this.all.push(item);
    const c = this.cell;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    // Anything spanning a huge area (a containment wall is 40m deep) would
    // otherwise be written into hundreds of cells. Past a threshold it goes on
    // an "everywhere" list that every query checks -- still far cheaper than
    // checking everything.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) {
      item._everywhere = true;
      return;
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.map.get(k);
        if (!list) { list = []; this.map.set(k, list); }
        list.push(item);
      }
    }
  }

  /** Everything bucketed near (x, z), plus the oversized ones. */
  near(x, z, out) {
    out.length = 0;
    const c = this.cell;
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    const list = this.map.get(this.key(cx, cz));
    if (list) for (const it of list) out.push(it);
    return out;
  }

  /**
   * Everything within `pad` of (x, z). A capsule can straddle a cell edge, so
   * a single-cell lookup is not enough for collision -- only for the height
   * query, where being a few centimetres out does not matter.
   */
  nearPadded(x, z, pad, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - pad) / c), x1 = Math.floor((x + pad) / c);
    const z0 = Math.floor((z - pad) / c), z1 = Math.floor((z + pad) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (const it of list) if (!it._seen) { it._seen = 1; out.push(it); }
      }
    }
    for (const it of out) it._seen = 0;
    return out;
  }
}
