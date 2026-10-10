// Weather: clear skies, cloud, rain, high wind and storms. It drifts from one
// to the next on its own; rain and storms push the sea up (storm surge),
// wind whips up the waves and pushes boats, storms bring lightning.
import * as THREE from 'three';
import { clamp, damp, rand } from './util.js';

export const WEATHER = {
  clear: { name: 'Clear', cloud: 0, rain: 0, wind: 0.15, surge: 0, dur: [100, 190] },
  cloudy: { name: 'Cloudy', cloud: 0.6, rain: 0, wind: 0.35, surge: 0, dur: [50, 100] },
  rain: { name: 'Rain', cloud: 0.85, rain: 0.6, wind: 0.45, surge: 0.18, dur: [60, 120] },
  windy: { name: 'High wind', cloud: 0.35, rain: 0, wind: 1, surge: 0.1, dur: [50, 90] },
  storm: { name: 'Storm', cloud: 1, rain: 1, wind: 1, surge: 0.45, dur: [70, 120] },
};
const NEXT = {
  clear: [['cloudy', 0.5], ['windy', 0.25], ['clear', 0.25]],
  cloudy: [['rain', 0.45], ['clear', 0.3], ['storm', 0.15], ['windy', 0.1]],
  rain: [['cloudy', 0.4], ['storm', 0.3], ['clear', 0.3]],
  windy: [['clear', 0.4], ['cloudy', 0.35], ['storm', 0.25]],
  storm: [['rain', 0.6], ['cloudy', 0.4]],
};
function roll(from) {
  let r = Math.random();
  for (const [k, p] of NEXT[from]) { r -= p; if (r <= 0) return k; }
  return 'clear';
}

export class Weather {
  constructor(scene) {
    this.state = 'clear';
    this.timer = 120;
    this.next = roll('clear');
    this.cloud = 0; this.rain = 0; this.wind = 0.15; this.surge = 0; this.storm = 0;
    this.windDir = Math.random() * Math.PI * 2;
    this.flash = 0;
    this.boltT = rand(6, 14);
    this.washT = 0;          // after rain/storm: extra driftwood and shells on the beach
    this.events = [];

    // rain: short streaks in a box that follows the camera
    const N = 1800;
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.drops[i * 3] = rand(-35, 35); this.drops[i * 3 + 1] = rand(0, 30); this.drops[i * 3 + 2] = rand(-35, 35); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6), 3));
    this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d6e6f5', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.rainLines.frustumCulled = false;
    scene.add(this.rainLines);

    // lightning bolt: a jagged line from the clouds to the sea
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(14 * 3), 3));
    this.bolt = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: '#f4f8ff', transparent: true, opacity: 1, fog: false }));
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    scene.add(this.bolt);
    this.boltLife = 0;
  }

  get W() { return WEATHER[this.state]; }
  get name() { return this.W.name; }

  save() { return { state: this.state, timer: this.timer, next: this.next, windDir: this.windDir }; }
  load(o) {
    if (!o || !WEATHER[o.state]) return;
    Object.assign(this, { state: o.state, timer: o.timer, next: o.next || roll(o.state), windDir: o.windDir ?? this.windDir });
    const W = this.W;
    this.cloud = W.cloud; this.rain = W.rain; this.wind = W.wind; this.surge = W.surge; this.storm = o.state === 'storm' ? 1 : 0;
  }
  set(state) {
    this.state = state; this.timer = rand(...WEATHER[state].dur); this.next = roll(state);
  }

  // dt in game seconds; returns a list of events for the game to announce
  update(dt, focus, level, indoors) {
    this.events.length = 0;
    this.timer -= dt;
    if (this.next === 'storm' && this.timer < 30 && !this.warned) { this.warned = true; this.events.push('storm-coming'); }
    if (this.timer <= 0) {
      const was = this.state;
      this.state = this.next;
      this.timer = rand(...this.W.dur);
      this.next = roll(this.state);
      this.warned = false;
      if (this.state === 'storm') this.windDir += rand(-1, 1);
      if ((was === 'storm' || was === 'rain') && this.state !== 'storm' && this.state !== 'rain') this.washT = 70;
      this.events.push('change:' + this.state);
    }
    const W = this.W;
    const k = 0.05;      // ~20 s to settle into the new weather
    this.cloud = damp(this.cloud, W.cloud, k * 1.5, dt);
    this.rain = damp(this.rain, W.rain, k * 1.5, dt);
    this.wind = damp(this.wind, W.wind, k * 1.5, dt);
    this.surge = damp(this.surge, W.surge, k * 0.6, dt);
    this.storm = damp(this.storm, this.state === 'storm' ? 1 : 0, k * 1.5, dt);
    this.windDir += Math.sin(performance.now() / 20000) * 0.01 * dt;
    this.washT = Math.max(0, this.washT - dt);

    // lightning
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.storm > 0.6) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = rand(5, 13);
        this.strike(focus, level);
        this.events.push('thunder:' + rand(0.4, 2.2).toFixed(2));
      }
    }
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      this.bolt.material.opacity = this.boltLife > 0.12 ? 1 : this.boltLife / 0.12;
      if (this.boltLife <= 0) this.bolt.visible = false;
    }

    // rain streaks
    const show = this.rain > 0.02 && !indoors;
    this.rainLines.visible = show;
    if (show) {
      const p = this.rainLines.geometry.attributes.position.array, d = this.drops;
      const wx = Math.sin(this.windDir) * this.wind, wz = Math.cos(this.windDir) * this.wind;
      const fall = 26 * dt;
      const n = Math.floor((d.length / 3) * clamp(this.rain, 0.15, 1));
      for (let i = 0; i < d.length / 3; i++) {
        const j = i * 3;
        d[j + 1] -= fall; d[j] += wx * 8 * dt; d[j + 2] += wz * 8 * dt;
        if (d[j + 1] < level - focus.y - 1) { d[j + 1] += 30; d[j] = rand(-35, 35); d[j + 2] = rand(-35, 35); }
        if (d[j] > 35) d[j] -= 70; if (d[j] < -35) d[j] += 70;
        if (d[j + 2] > 35) d[j + 2] -= 70; if (d[j + 2] < -35) d[j + 2] += 70;
        const o = i * 6;
        if (i >= n) { p[o] = p[o + 3] = 0; p[o + 1] = p[o + 4] = -999; p[o + 2] = p[o + 5] = 0; continue; }
        const x = focus.x + d[j], y = focus.y + d[j + 1], z = focus.z + d[j + 2];
        p[o] = x; p[o + 1] = y; p[o + 2] = z;
        p[o + 3] = x - wx * 0.5; p[o + 4] = y + 0.9; p[o + 5] = z - wz * 0.5;
      }
      this.rainLines.geometry.attributes.position.needsUpdate = true;
      this.rainLines.material.opacity = 0.45 * this.rain;
    }
    return this.events;
  }

  strike(focus, level) {
    const a = rand(0, Math.PI * 2), r = rand(50, 140);
    const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
    const p = this.bolt.geometry.attributes.position;
    let cx = x + rand(-8, 8), cz = z + rand(-8, 8);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      if (i > 0) { cx += rand(-2.5, 2.5) + (x - cx) * 0.25; cz += rand(-2.5, 2.5) + (z - cz) * 0.25; }
      p.setXYZ(i, cx, 70 - t * (70 - level), cz);
    }
    p.needsUpdate = true;
    this.bolt.visible = true;
    this.boltLife = 0.3;
    this.flash = 1;
  }
}

export const WEATHER_ICON = {
  clear: 'sun',
  cloudy: `<svg class="ic" viewBox="0 0 24 24"><path d="M6 18 h11 a4 4 0 0 0 0 -8 a6 6 0 0 0 -11 1 a3.5 3.5 0 0 0 0 7z" fill="#e6ecf2" stroke="#3b2f2a" stroke-width="2" stroke-linejoin="round"/></svg>`,
  rain: `<svg class="ic" viewBox="0 0 24 24"><path d="M6 14 h11 a4 4 0 0 0 0 -8 a6 6 0 0 0 -11 1 a3.5 3.5 0 0 0 0 7z" fill="#c8d2dc" stroke="#3b2f2a" stroke-width="2" stroke-linejoin="round"/><path d="M8 17 l-1 3 M12 17 l-1 3 M16 17 l-1 3" stroke="#2b8fc8" stroke-width="2" stroke-linecap="round"/></svg>`,
  windy: `<svg class="ic" viewBox="0 0 24 24"><path d="M3 9 h12 a3 3 0 1 0 -3 -3 M3 14 h16 a3 3 0 1 1 -3 3 M3 19 h7" fill="none" stroke="#3b2f2a" stroke-width="2" stroke-linecap="round"/></svg>`,
  storm: `<svg class="ic" viewBox="0 0 24 24"><path d="M6 13 h11 a4 4 0 0 0 0 -8 a6 6 0 0 0 -11 1 a3.5 3.5 0 0 0 0 7z" fill="#8a96a4" stroke="#3b2f2a" stroke-width="2" stroke-linejoin="round"/><path d="M12 13 l-3 5 h3 l-2 4" fill="none" stroke="#f2c14e" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
};
