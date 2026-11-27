import * as THREE from 'three';

export function buildSky(scene) {
  const uniforms = {
    top: { value: new THREE.Color('#2e6fb3') }, bot: { value: new THREE.Color('#f3c48a') },
    sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() }, sunCol: { value: new THREE.Color('#fff') },
    time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float time; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        float y = clamp(vP.y*1.2+0.15,0.,1.);
        vec3 c = mix(bot, top, pow(y,0.8));
        float s = max(dot(vP, sunDir),0.);
        c += sunCol*pow(s,600.)*4. + sunCol*pow(s,8.)*0.35;
        // bandes de nuages stylisées
        vec2 uv = vP.xz/(vP.y+0.25)*1.5 + vec2(time*0.004,0.);
        float n = 0.; vec2 p = uv*2.; float a=0.5;
        for(int i=0;i<4;i++){ vec2 ip=floor(p), fp=fract(p); fp=fp*fp*(3.-2.*fp);
          float v = mix(mix(h(ip),h(ip+vec2(1,0)),fp.x), mix(h(ip+vec2(0,1)),h(ip+vec2(1,1)),fp.x), fp.y);
          n += v*a; p*=2.1; a*=0.5; }
        float cl = smoothstep(0.55,0.8,n)*smoothstep(0.0,0.25,vP.y);
        c = mix(c, mix(vec3(1.), bot, 0.3), cl*0.6);
        gl_FragColor = vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  sky.frustumCulled = false; sky.renderOrder = -100; sky.userData.noCull = true; sky.userData.noCollide = true; // jamais solide (sphère de 400 m centrée sur le Moyeu à la construction) // dessiné en premier, indépendant de camera.far
  scene.add(sky);
  return { mesh: sky, uniforms };
}
