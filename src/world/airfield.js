import * as THREE from 'three';
// Champ d'air respirable : UNE seule surface « bulle de savon » = union lisse (smooth-min) de la bulle du Moyeu
// et de la bulle du train. Pas de bulle dans la bulle : quand le train est près, les deux fusionnent ; quand il
// s'éloigne, la bulle du Moyeu s'étire vers lui (col), puis le col casse et on a deux bulles distinctes.
// Rendu en raymarching sur un triangle plein écran, profondeur écrite à la main (gl_FragDepth) pour être caché
// correctement par le décor. Le même champ (fieldAt) sert à la logique d'oxygène : ce qu'on voit = ce qui protège.
export const HUB_C = new THREE.Vector3(0, -12, 0), HUB_R = 95, K = 85;

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const ell = (px, py, pz, c, r) => { const x = (px - c.x) / r.x, y = (py - c.y) / r.y, z = (pz - c.z) / r.z, l = Math.hypot(x, y, z); return (l - 1) * Math.min(r.x, r.y, r.z); };

export function createAirField(scene, steps = 48) {
  const U = { time: { value: 0 }, tc: { value: new THREE.Vector3() }, tr: { value: new THREE.Vector3(1, 1, 1) }, ton: { value: 0 }, hon: { value: 1 }, k: { value: K },
    steps: { value: steps }, hc: { value: HUB_C.clone() }, hr: { value: HUB_R }, camW: { value: new THREE.Matrix4() }, projI: { value: new THREE.Matrix4() }, projM: { value: new THREE.Matrix4() }, viewM: { value: new THREE.Matrix4() } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform float time, ton, hon, k, hr, steps; uniform vec3 tc, tr, hc; uniform mat4 camW, projI, projM, viewM; varying vec2 vUv;
      float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
      float ell(vec3 p, vec3 c, vec3 r){ return (length((p - c) / r) - 1.0) * min(min(r.x, r.y), r.z); }
      float F(vec3 p){ float a = hon > 0.5 ? length(p - hc) - hr : 1e5; float b = ton > 0.5 ? ell(p, tc, tr) : 1e5; return smin(a, b, k); }
      vec3 N(vec3 p){ vec2 e = vec2(0.25, 0.0); return normalize(vec3(F(p + e.xyy) - F(p - e.xyy), F(p + e.yxy) - F(p - e.yxy), F(p + e.yyx) - F(p - e.yyx))); }
      vec2 sph(vec3 ro, vec3 rd, vec3 c, float r){ vec3 oc = ro - c; float b = dot(oc, rd), q = dot(oc, oc) - r * r, h = b * b - q; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
      void main(){
        vec4 a = projI * vec4(vUv, -1.0, 1.0); a /= a.w; vec4 b = projI * vec4(vUv, 1.0, 1.0); b /= b.w;
        vec3 ro = (camW * vec4(a.xyz, 1.0)).xyz, rd = normalize((camW * vec4(b.xyz, 1.0)).xyz - ro);
        // intervalle utile : sphères englobantes (bulle + marge de fusion)
        float t0 = 1e9, t1 = -1e9;
        if (hon > 0.5) { vec2 s = sph(ro, rd, hc, hr + k * 0.3); t0 = min(t0, s.x); t1 = max(t1, s.y); }
        if (ton > 0.5) { vec2 s = sph(ro, rd, tc, max(max(tr.x, tr.y), tr.z) + k * 0.3); t0 = min(t0, s.x); t1 = max(t1, s.y); }
        if (ton > 0.5 && hon > 0.5) { vec3 m = (hc + tc) * 0.5; vec2 s = sph(ro, rd, m, length(hc - tc) * 0.5 + k); t0 = min(t0, s.x); t1 = max(t1, s.y); }
        t0 = max(t0, 0.0); if (t1 < t0) discard;
        float t = t0, d0 = F(ro + rd * t), inside = d0 < 0.0 ? -1.0 : 1.0; bool hit = false;
        for (int i = 0; i < 90; i++) { if (float(i) >= steps) break; float d = F(ro + rd * t) * inside; if (d < 0.05) { hit = true; break; } t += max(d * 0.95, 0.25 + t * 0.004); if (t > t1) break; }
        if (!hit) discard;
        vec3 p = ro + rd * t, n = N(p);
        if (p.y < -1.0) discard; // sous le sol
        vec4 clip = projM * viewM * vec4(p, 1.0); gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
        float f = pow(1.0 - abs(dot(rd, n)), 2.4);
        vec2 h = vec2(atan(n.z, n.x) * 26.0, p.y * 0.42); vec2 g = abs(fract(h + vec2(0.0, fract(floor(h.x) * 0.5))) - 0.5);
        float hex = smoothstep(0.45, 0.5, max(g.x, g.y)), band = smoothstep(0.9, 1.0, sin(p.y * 0.09 - time * 1.4) * 0.5 + 0.5);
        // irisation « savon » : la teinte glisse avec l'angle
        vec3 iri = 0.5 + 0.5 * cos(6.28 * (f * 1.3 + vec3(0.0, 0.33, 0.67)) + time * 0.3);
        vec3 col = mix(vec3(0.45, 0.82, 1.0), iri, 0.35); col = mix(col, vec3(1.0, 0.88, 0.55), band);
        float al = f * 0.55 + hex * (0.04 + f * 0.22) + band * 0.07;
        gl_FragColor = vec4(col, al);
      }` });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 6; m.userData.noCollide = true; m.userData.noCull = true; scene.add(m);
  const st = { tc: new THREE.Vector3(), tr: new THREE.Vector3(), ton: false };
  return {
    mesh: m,
    // c : centre du train, R : rayon horizontal ; on = bulle du train active (joueur à pied hors du Moyeu, ou proche)
    update(camera, t, c, R, on) {
      U.time.value = t % 1000; st.ton = on; st.tc.copy(c); st.tr.set(R, R * 0.5, R);
      U.tc.value.copy(c); U.tr.value.copy(st.tr); U.ton.value = on ? 1 : 0;
      U.camW.value.copy(camera.matrixWorld); U.projI.value.copy(camera.projectionMatrixInverse); U.projM.value.copy(camera.projectionMatrix); U.viewM.value.copy(camera.matrixWorldInverse);
    },
    // < 0 : dans l'air respirable (même union lisse que le rendu)
    fieldAt(p) { const a = Math.hypot(p.x - HUB_C.x, p.y - HUB_C.y, p.z - HUB_C.z) - HUB_R, b = st.ton ? ell(p.x, p.y, p.z, st.tc, st.tr) : 1e5; return smin(a, b, K); },
  };
}
