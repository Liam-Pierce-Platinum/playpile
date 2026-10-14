// Window glass with "interior mapping": every pane ray-casts into a fake room box behind it,
// so windows show floors, walls, ceilings, lamps, curtains and furniture with real parallax.
// kind 0 = apartment, 1 = shop (grocery / restaurant / laundromat / boutique), 2 = office
import * as THREE from 'three';

export function interiorMaterial(envTex) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, tEnv: { value: envTex }, tEnvCube: { value: null }, uEnvI: { value: 0.3 }, uLitFrac: { value: 0.42 },
    }]),
    fog: true,
    vertexShader: /* glsl */`
      attribute vec3 aTan; attribute vec4 aInfo; attribute float aKind;
      varying vec2 vUv; varying vec3 vViewT, vW, vN; flat varying vec4 vInfo; flat varying float vKind;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.0);
        vW = wp.xyz; vUv = uv; vInfo = aInfo; vKind = aKind; vN = normal;
        vec3 V = wp.xyz - cameraPosition;
        vViewT = vec3(dot(V, aTan), V.y, dot(V, normal));
        vec4 mvPosition = viewMatrix*wp;
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uEnvI, uLitFrac; uniform sampler2D tEnv; uniform samplerCube tEnvCube;
      varying vec2 vUv; varying vec3 vViewT, vW, vN; flat varying vec4 vInfo; flat varying float vKind;
      #include <fog_pars_fragment>
      float h1(float n){ n = fract(n*0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
      float h2(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
      float vnoise(float x){ float i=floor(x), f=fract(x); return mix(h1(i), h1(i+1.0), f*f*(3.0-2.0*f)); }
      vec3 envLook(vec3 R){
        vec2 uv = vec2(atan(R.z, R.x)/6.2832 + 0.5, asin(clamp(R.y,-1.0,1.0))/3.14159 + 0.5);
        return texture2D(tEnv, uv).rgb;
      }
      float box(vec2 p, vec2 a, vec2 b){ return step(a.x,p.x)*step(p.x,b.x)*step(a.y,p.y)*step(p.y,b.y); }
      float sbox(vec2 p, vec2 a, vec2 b, float s){ return smoothstep(a.x-s,a.x+s,p.x)*smoothstep(b.x+s,b.x-s,p.x)*smoothstep(a.y-s,a.y+s,p.y)*smoothstep(b.y+s,b.y-s,p.y); }
      vec3 palette(float r){
        vec3 a = vec3(0.55,0.12,0.1), b = vec3(0.12,0.22,0.42), c = vec3(0.72,0.6,0.25), d = vec3(0.2,0.38,0.2), e = vec3(0.75,0.72,0.66);
        return r < 0.2 ? a : r < 0.4 ? b : r < 0.6 ? c : r < 0.78 ? d : e;
      }
      // products on shelves: rows of boxes of varying height with dark gaps above
      vec3 shelves(vec2 q, float seed, vec3 wall){
        if (q.y < 0.15 || q.y > 2.25) return wall;
        float row = floor((q.y - 0.15)/0.42), fy = fract((q.y - 0.15)/0.42);
        float cw = 0.16 + 0.1*h1(row*7.0 + seed);
        float cell = floor(q.x/cw), fx = fract(q.x/cw);
        float r = h2(vec2(cell, row + seed));
        float top = 0.45 + 0.45*h2(vec2(cell*1.3, row*2.1 + seed));
        vec3 prod = palette(r) * (0.55 + 0.45*h2(vec2(cell, row*3.0)));
        prod *= 0.75 + 0.25*step(0.25, fy)*step(fy, 0.6);
        vec3 c = fy < top ? prod * smoothstep(0.0, 0.08, fx) * smoothstep(1.0, 0.92, fx) : vec3(0.03);
        if (fy < 0.06) c = vec3(0.5);
        return c;
      }

      void main(){
        float seed = floor(vInfo.x), depth = vInfo.y; vec2 size = vInfo.zw;
        bool shop = vKind > 0.5 && vKind < 1.5;
        bool office = vKind > 1.5;
        float theme = shop ? floor(h1(seed*11.3)*4.0) : 0.0;   // 0 grocery 1 restaurant 2 laundromat 3 boutique
        float Wr = shop ? size.x : max(size.x*2.3, 3.4);
        float Hr = shop ? 3.5 : 2.9;
        float sill = shop ? 0.45 : (office ? 0.35 : 0.85);
        vec3 p = vec3((vUv.x-0.5)*size.x + Wr*0.5, vUv.y*size.y + sill, 0.0);
        vec3 dir = normalize(vViewT);
        dir.z = min(dir.z, -1e-3);
        vec3 inv = 1.0/dir;
        float tx = ((dir.x > 0.0 ? Wr : 0.0) - p.x)*inv.x;
        float ty = ((dir.y > 0.0 ? Hr : 0.0) - p.y)*inv.y;
        float tz = (-depth - p.z)*inv.z;
        float t = min(tx, min(ty, tz));
        vec3 h = p + dir*t;
        bool isBack = tz <= tx && tz <= ty, isSide = !isBack && tx <= ty, isFloor = !isBack && !isSide && dir.y < 0.0;

        // ---- how this room is lit ----
        float r0 = h1(seed*3.7), r1 = h1(seed*9.1), r2 = h1(seed*1.3+4.0);
        bool lit = shop ? (r0 < 0.9) : (r0 < uLitFrac);
        vec3 lightCol = mix(vec3(1.0,0.6,0.3), vec3(1.0,0.8,0.58), r1);
        if (r2 < 0.2) lightCol = vec3(0.8,0.87,1.0);
        float power = 0.9 + 0.7*r1;
        if (office) { lightCol = mix(vec3(0.85,0.93,1.0), vec3(1.0,0.9,0.75), r1*0.6); power = 1.3; }
        if (shop) {
          if (theme < 0.5) { lightCol = vec3(0.92,0.97,1.0); power = 1.15; }
          else if (theme < 1.5) { lightCol = vec3(1.0,0.62,0.3); power = 0.75; }
          else if (theme < 2.5) { lightCol = vec3(0.85,0.95,1.0); power = 1.25; }
          else { lightCol = vec3(1.0,0.86,0.7); power = 0.9; }
        }
        float tv = (!shop && !office && r2 > 0.9) ? 1.0 : 0.0;
        if (tv > 0.5) { lit = true; lightCol = vec3(0.35,0.5,1.0)*(0.35 + 0.65*vnoise(uTime*7.0 + seed*20.0)); power = 1.0; }
        if (!lit) { lightCol = vec3(0.01,0.012,0.018); power = 1.0; }
        vec3 lamp = vec3(Wr*0.5, Hr-0.15, -depth*0.5);
        float dl = distance(h, lamp);
        vec3 illum = lightCol*power*(0.3 + 1.3/(1.0 + dl*dl*0.3));
        if (tv > 0.5) illum = lightCol*1.4/(1.0 + distance(h, vec3(Wr*0.5, 0.8, -depth+0.3))*0.8);
        if (shop && theme > 0.5 && theme < 1.5) {
          float px = (floor(h.x/2.2)+0.5)*2.2;
          illum = lightCol*power*(0.25 + 1.6/(1.0 + pow(distance(h.xz, vec2(px, -depth*0.45)), 2.0)*0.8));
        }

        // ---- surfaces ----
        vec3 wallCol = mix(vec3(0.42,0.36,0.29), vec3(0.55,0.52,0.47), h1(seed*5.3));
        if (h1(seed*6.1) > 0.7) wallCol = vec3(0.36,0.42,0.4);
        vec3 alb = wallCol; float emit = 0.0;
        if (isBack || isSide) {
          vec2 q = isBack ? h.xy : vec2(-h.z, h.y);
          alb = isSide ? wallCol*0.9 : wallCol;
          if (shop) {
            if (theme < 0.5) alb = shelves(q, seed + (isSide ? 17.0 : 0.0), alb);
            else if (theme < 1.5) {
              alb = mix(vec3(0.22,0.12,0.07), vec3(0.35,0.16,0.1), step(1.1, q.y));
              if (isBack) {
                float bar = box(q, vec2(Wr*0.15, 1.2), vec2(Wr*0.85, 2.3));
                float bot = step(0.55, h2(vec2(floor(q.x/0.09), floor((q.y-1.2)/0.37))))*step(0.1, fract((q.y-1.2)/0.37))*step(fract(q.x/0.09), 0.7);
                alb = mix(alb, vec3(0.05), bar);
                vec3 bc = mix(vec3(1.0,0.55,0.15), vec3(0.35,0.8,0.3), step(0.6, h2(vec2(floor(q.x/0.09), 7.0))));
                alb = mix(alb, bc*0.25, bar*bot);
                emit += bar*bot*0.5*(0.5 + h2(vec2(floor(q.x/0.09), 3.0)));
              } else { vec2 fq = fract(q/vec2(1.8,1.0)); alb = mix(alb, mix(vec3(0.35,0.28,0.2), vec3(0.15,0.2,0.25), fq.y)*(0.7+0.3*h2(floor(q/vec2(1.8,1.0)))), box(fq, vec2(0.2,0.45), vec2(0.7,0.9))*step(1.3, q.y)); }
            } else if (theme < 2.5) {
              vec2 m = vec2(fract(q.x/0.72), q.y);
              float machine = step(q.y, 1.9)*step(0.05, m.x)*step(m.x, 0.95);
              float row = step(0.95, q.y);
              vec2 dc = vec2(0.5, row > 0.5 ? 1.42 : 0.5);
              float door = smoothstep(0.23, 0.2, length(vec2(m.x - dc.x, (q.y - dc.y)/0.72)*0.72));
              alb = mix(alb, vec3(0.82), machine);
              alb = mix(alb, vec3(0.04,0.05,0.06), door*machine);
            } else {
              float rail = step(0.9, q.y)*step(q.y, 1.75);
              float hang = step(0.35, h2(vec2(floor(q.x/0.07), 3.0)));
              vec3 cloth = palette(h2(vec2(floor(q.x/0.07), seed)))*0.7;
              vec3 wood = vec3(0.16,0.1,0.065)*(0.8 + 0.2*h2(vec2(floor(q.x*4.0), 1.0)));
              alb = mix(wood, cloth, rail*hang*smoothstep(1.75, 1.6, q.y + 0.1*h2(vec2(floor(q.x/0.07), 9.0))));
            }
          } else if (isBack) {
            float sofa = box(q, vec2(Wr*0.2, 0.0), vec2(Wr*0.75, 0.75));
            alb = mix(alb, vec3(0.12,0.1,0.09) + 0.12*h1(seed), sofa);
            float pic = box(q, vec2(Wr*0.35, 1.35), vec2(Wr*0.6, 1.9));
            alb = mix(alb, vec3(0.3,0.25,0.2)*(0.5+h2(floor(q*6.0))), pic*step(0.4, r1));
            float door = box(q, vec2(Wr*0.82, 0.0), vec2(Wr*0.82+0.8, 2.1));
            alb = mix(alb, alb*0.6, door*step(r2, 0.5));
            if (tv > 0.5) emit += box(q, vec2(Wr*0.4, 0.7), vec2(Wr*0.4+0.9, 1.25))*2.5;
          }
        } else if (isFloor) {
          vec2 q = vec2(h.x, h.z);
          if (shop) {
            if (theme < 0.5 || (theme > 1.5 && theme < 2.5)) alb = mix(vec3(0.42), vec3(0.34), mod(floor(q.x*2.0)+floor(q.y*2.0), 2.0));
            else if (theme < 1.5) alb = vec3(0.2,0.11,0.06)*(0.8+0.2*h2(vec2(floor(q.x*6.0), floor(q.y*0.7+floor(q.x*6.0)*0.37))));
            else alb = vec3(0.3)*(0.85+0.15*h2(floor(q*3.0)));
          } else {
            alb = vec3(0.3,0.19,0.11)*(0.75 + 0.25*h2(vec2(floor(q.x*5.0), floor(q.y*0.8 + floor(q.x*5.0)*0.37))));
            if (!office) alb = mix(alb, vec3(0.35,0.12,0.1)*(0.8+0.2*h1(seed)), box(q, vec2(Wr*0.25,-depth*0.8), vec2(Wr*0.75,-depth*0.3))*step(0.5,r2));
          }
        } else {
          alb = vec3(0.7);
          if (lit && tv < 0.5) {
            if (shop && theme > 0.5 && theme < 1.5) { alb = vec3(0.08); emit = smoothstep(0.16, 0.08, distance(vec2(fract(h.x/2.2)*2.2, h.z), vec2(1.1, -depth*0.45)))*8.0; }
            else if (shop && theme > 2.5) emit = smoothstep(0.08, 0.03, distance(fract(h.xz/vec2(1.2, 1.5)), vec2(0.5)))*6.0;
            else if (shop || office) emit = step(0.72, fract(h.x*0.55))*step(0.82, fract(h.z*0.45))*2.2;
            else emit = smoothstep(0.2, 0.1, distance(h.xz, lamp.xz))*4.0;
          }
        }
        vec3 col = alb*illum + lightCol*emit;

        // ---- mid-room silhouettes (with parallax) ----
        float zc = -depth*0.42;
        float tc = (zc - p.z)*inv.z;
        if (tc < t) {
          vec3 m = p + dir*tc;
          float s = 0.0;
          if (shop) {
            float px = Wr*(0.3 + 0.4*h1(seed*2.0));
            float person = step(length((m.xy - vec2(px, 1.6))/vec2(0.1,0.13)), 1.0) + sbox(m.xy, vec2(px-0.21, 0.9), vec2(px+0.21, 1.5), 0.02) + box(m.xy, vec2(px-0.15, 0.0), vec2(px+0.15, 0.9));
            if (theme < 0.5) s = box(m.xy, vec2(Wr*0.6, 0.0), vec2(Wr*0.95, 1.4));
            else if (theme < 1.5) {
              float tx2 = fract(m.x/2.2);
              s = box(vec2(tx2, m.y), vec2(0.25, 0.72), vec2(0.75, 0.78)) + box(vec2(tx2, m.y), vec2(0.47, 0.0), vec2(0.53, 0.75));
              float head = step(length(vec2((tx2-0.12)*2.2, m.y - 1.18)/vec2(0.1, 0.12)), 1.0) + sbox(vec2(tx2*2.2, m.y), vec2(0.08, 0.5), vec2(0.42, 1.08), 0.03);
              s += head * step(0.4, h2(vec2(floor(m.x/2.2), seed)));
            } else if (theme < 2.5) s = box(m.xy, vec2(Wr*0.3, 0.0), vec2(Wr*0.7, 0.9));
            else s = box(m.xy, vec2(Wr*0.15, 1.45), vec2(Wr*0.45, 1.5)) + box(vec2(fract(m.x/0.1), m.y), vec2(0.0, 0.8), vec2(0.6, 1.45))*step(Wr*0.15, m.x)*step(m.x, Wr*0.45);
            s += person*step(0.3, r1);
          } else if (!office) {
            s = box(m.xy, vec2(Wr*0.15, 0.0), vec2(Wr*0.15+1.1, 0.75))*step(0.3, r0);
            s = max(s, box(m.xy, vec2(Wr*0.7, 0.0), vec2(Wr*0.7+0.5, 1.6))*step(r1, 0.4));
          } else {
            s = box(m.xy, vec2(0.0, 0.0), vec2(Wr, 1.15))*step(0.5, fract(m.x/2.4 + 0.2));
          }
          col = mix(col, (lit ? lightCol*power*0.05 : vec3(0.003)), clamp(s, 0.0, 1.0));
        }

        // ---- curtains / blinds just behind the glass ----
        if (!shop) {
          float kindC = h1(seed*7.7);
          vec3 cc = mix(vec3(0.8,0.7,0.55), vec3(0.6,0.25,0.2), step(0.75, h1(seed*8.8)));
          float glow = lit ? 0.9 : 0.04;
          if (kindC < 0.45) {
            float cl = 0.12 + 0.3*h1(seed*4.4), cr = 0.1 + 0.3*h1(seed*5.5);
            float fold = 0.75 + 0.25*sin(vUv.x*70.0);
            float cov = step(vUv.x, cl) + step(1.0 - cr, vUv.x);
            col = mix(col, cc*illum*0.45*fold*glow + cc*0.01, min(cov, 1.0)*0.92);
          } else if (kindC < 0.75) {
            float bh = 0.35 + 0.65*h1(seed*6.6);
            float slat = 0.6 + 0.4*step(0.2, fract(vUv.y*size.y*14.0));
            float cov = step(1.0 - bh, vUv.y);
            col = mix(col, vec3(0.75,0.72,0.66)*lightCol*power*0.35*slat*(lit?1.0:0.03), cov*0.95);
          }
        } else {
          float poster = box(vUv, vec2(0.04, 0.05), vec2(0.18, 0.42))*step(0.5, h1(seed*3.3));
          col = mix(col, palette(h1(seed*4.1))*0.6*(0.4 + power*0.6), poster*0.85);
        }

        float edge = smoothstep(0.0, 0.04, vUv.x)*smoothstep(0.0, 0.04, 1.0-vUv.x)*smoothstep(0.0, 0.04, vUv.y)*smoothstep(0.0, 0.04, 1.0-vUv.y);
        col *= 0.55 + 0.45*edge;

        // ---- glass: fresnel reflection of the street ----
        vec3 I = normalize(vW - cameraPosition);
        float ci = clamp(dot(-I, vN), 0.0, 1.0);
        float F = 0.04 + 0.96*pow(1.0 - ci, 5.0);
        vec3 R = reflect(I, vN);
        vec3 env = textureLod(tEnvCube, R, 1.0).rgb * uEnvI;
        vec3 outc = col*(1.0 - F)*0.9 + env*(F + 0.03);
        gl_FragColor = vec4(outc, 1.0);
        #include <fog_fragment>
      }`,
  });
}
