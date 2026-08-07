import * as THREE from "../vendor/three.module.min.js";

/* 팔레트는 기존 버건디/골드를 심우주로 계승한 값이다. 순검정을 피하려 바탕도 약간 푸르다. */
const C_VOID = new THREE.Color(0x06070f);
const C_NEBULA = new THREE.Color(0x8c1e52);
const C_PLATINUM = new THREE.Color(0xd8cfa6);

const TIERS = [
  { stars: 20000, detail: 4, videos: 3, nebulaScale: 1 },
  { stars: 8000, detail: 2, videos: 2, nebulaScale: 1 },
  { stars: 3000, detail: 1, videos: 1, nebulaScale: 0.5 },
];

const BODY_RADIUS = 3.1;
const ORBIT_RADIUS = 30;
const ORBIT_RISE = 9;      // 나선 한 칸의 상승량
const ORBIT_TURN = 2.05;   // 라디안. 황금각 근처라 앞뒤 천체가 서로 가리지 않는다
const FOV = 48;
const TAN_HALF_FOV = Math.tan((FOV / 2) * Math.PI / 180);

// 넓은 창은 천체를 왼쪽 셋째에 두고 오른쪽 절반을 카드에 내준다.
// 좁으면 카드가 아래로 가므로 중앙 정렬하고 더 작게 잡는다.
const NARROW_W = 1100;
const FRAME_WIDE = { dia: 0.40, cx: 0.32, cy: 0.50 };
// 좁으면 카드가 천체 아래로 가므로 천체를 위쪽으로 올리고 더 작게 잡는다.
const FRAME_NARROW = { dia: 0.24, cx: 0.50, cy: 0.24 };

// 정렬된 천체가 화면 높이의 dia 만큼 차지하도록 거리를 역산한다.
// 화면 높이는 distance * tan(fov/2) * 2 이므로 지름 2R의 비율은 R/(d*tan).
function frameFor(w) { return w < NARROW_W ? FRAME_NARROW : FRAME_WIDE; }
function viewDistFor(w) { return BODY_RADIUS / (frameFor(w).dia * TAN_HALF_FOV); }

const FBM = `
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
`;

const FULLSCREEN_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

/* ── 성운 ─────────────────────────────────────────────── */

function makeNebula() {
  // 풀스크린 삼각형: 쿼드보다 프래그먼트 중복이 없다
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uProgress: { value: 0 },
    },
    vertexShader: FULLSCREEN_VS,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 uRes; uniform float uTime; uniform float uProgress;
      ${FBM}
      void main(){
        vec2 uv=(vUv*uRes-.5*uRes)/uRes.y;
        // 진행도가 성운을 아래로 흘려보낸다. 항해감의 대부분이 여기서 나온다
        vec2 q=uv*1.15+vec2(uProgress*.35,-uProgress*1.15);
        float flow=fbm(q*1.5+vec2(0.,-uTime*.02)+fbm(q*2.1+uTime*.012));
        float d=length(uv);
        float glow=pow(smoothstep(1.35,.05,d)*.45+flow*.55,3.0);
        vec3 col=mix(vec3(.024,.027,.059),vec3(.055,.030,.072),flow);
        col+=vec3(.549,.118,.322)*glow*.80;
        col+=vec3(.847,.812,.651)*pow(glow,4.0)*.55;
        col+=vec3(.35,.30,.20)*pow(flow,3.2)*.16;
        col*=1.-.34*length(uv)*.7;
        gl_FragColor=vec4(col,1.);
      }`,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, geometry: g, material: mat };
}

function makeBlit() {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null } },
    vertexShader: FULLSCREEN_VS,
    fragmentShader: `precision mediump float; varying vec2 vUv; uniform sampler2D uMap;
      void main(){ gl_FragColor = texture2D(uMap, vUv); }`,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, geometry: g, material: mat };
}

/* ── 별 ───────────────────────────────────────────────── */

function makeStars(max) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const siz = new Float32Array(max);
  const pha = new Float32Array(max);
  const shells = [110, 260, 620];
  const c = new THREE.Color();

  for (let i = 0; i < max; i++) {
    // 레이어를 교차 배치해야 drawRange로 잘라도 3레이어 시차가 유지된다
    const layer = i % 3;
    const r = shells[layer] * (0.62 + Math.random() * 0.38);
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(t);
    pos[i * 3 + 1] = r * u * 0.8;
    pos[i * 3 + 2] = r * s * Math.sin(t);
    c.copy(C_PLATINUM).lerp(new THREE.Color(0x9fb6d8), Math.random() * 0.85);
    c.multiplyScalar(0.55 + Math.random() * 0.45);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = (layer === 0 ? 2.6 : layer === 1 ? 1.9 : 1.3) * (0.6 + Math.random() * 0.8);
    pha[i] = Math.random() * Math.PI * 2;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(pha, 1));
  g.setDrawRange(0, max);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      uniform float uTime; uniform float uPixelRatio;
      varying vec3 vColor; varying float vTw;
      void main(){
        vColor = aColor;
        // 반짝임은 0.88~1.0 폭. 이보다 크면 크리스마스 트리가 된다
        vTw = 0.94 + 0.06 * sin(uTime * 0.9 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision mediump float;
      varying vec3 vColor; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * vTw, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return { points, geometry: g, material: mat };
}

/* ── 천체 ─────────────────────────────────────────────── */

// 법선 공간(-1~1의 원반)에 영상을 얹으므로 비율 보정은 반지름 비 그대로다.
// 세로 영상은 높이를, 가로 영상은 폭을 기준으로 원반 안에 담는다.
// 실루엣에 가까울수록 법선이 눕기 때문에 화면이 늘어난다. 원반 안쪽에만 얹는다.
function uvSpanFor(aspect) {
  if (aspect >= 1) { const hw = 0.60; return [hw, hw / aspect]; }
  const hh = 0.58;
  return [hh * aspect, hh];
}

function makeBodyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasVideo: { value: 0 },
      uSpan: { value: new THREE.Vector2(0.25, 0.9) },
      uFill: { value: new THREE.Color(0x6e2547) },
      uRim: { value: C_PLATINUM.clone() },
      uFocus: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormalV; varying vec3 vViewPos;
      void main(){
        vUv = uv;
        vNormalV = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv; varying vec3 vNormalV; varying vec3 vViewPos;
      uniform sampler2D uMap; uniform float uHasVideo; uniform vec2 uSpan;
      uniform vec3 uFill; uniform vec3 uRim; uniform float uFocus; uniform float uOpacity;
      void main(){
        vec3 N = normalize(vNormalV);
        /* 구면 UV를 쓰면 지오메트리마다 이음새 위치와 상하 방향이 달라진다.
           대신 시선 공간 법선으로 찍어 영상 면이 항상 카메라를 정면으로 보게 했다. */
        vec2 t = vec2(-N.x, -N.y) / uSpan * 0.5 + 0.5;
        vec3 base = uFill;
        if (uHasVideo > 0.5 && N.z > 0.0) {
          vec2 e = smoothstep(vec2(0.0), vec2(0.03), t) * (1.0 - smoothstep(vec2(0.97), vec2(1.0), t));
          base = mix(uFill, texture2D(uMap, clamp(t, 0.0, 1.0)).rgb, e.x * e.y);
        }
        vec3 V = normalize(-vViewPos);
        // 프레넬 림라이트가 천체를 성운에서 떼어놓는다
        float f = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
        float lam = 0.34 + 0.66 * clamp(dot(N, normalize(vec3(0.4, 0.7, 0.8))), 0.0, 1.0);
        vec3 col = base * mix(0.62, 1.0, lam) + uRim * f * (0.55 + 0.45 * uFocus);
        gl_FragColor = vec4(col, uOpacity);
      }`,
    transparent: true,
  });
}

function makeVideo(src, onReady, onFail) {
  const v = document.createElement("video");
  v.src = src;
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "metadata";
  v.addEventListener("loadedmetadata", onReady);
  v.addEventListener("error", onFail);
  return v;
}

/* ── 궤도 ─────────────────────────────────────────────── */

function orbitPosition(i, n) {
  const a = i * ORBIT_TURN;
  const r = ORBIT_RADIUS * (1 - 0.12 * (i / Math.max(1, n - 1)));
  return new THREE.Vector3(Math.cos(a) * r, (i - (n - 1) / 2) * ORBIT_RISE, Math.sin(a) * r);
}

// 카메라가 천체를 보는 방향(단위 벡터). 궤도 바깥 + 약간의 상승.
// 거리는 창 크기에 따라 달라지므로 방향만 들고 있다가 매 프레임 곱한다.
function viewDirFor(p) {
  const out = new THREE.Vector3(p.x, 0, p.z).normalize();
  return out.add(new THREE.Vector3(0, 0.22, 0)).normalize();
}

/* ── 본체 ─────────────────────────────────────────────── */

export function initCosmos(opts) {
  const canvas = opts && opts.canvas;
  const projects = (opts && opts.projects) || [];
  const onUpdate = (opts && opts.onUpdate) || null;
  if (!canvas || !projects.length) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!renderer.getContext()) return null;
  } catch (e) {
    return null; // 호출자가 정적 폴백을 유지한다
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(C_VOID, 1);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2000);
  const dummyCam = new THREE.Camera();

  const nebula = makeNebula();
  const blit = makeBlit();
  const stars = makeStars(TIERS[0].stars);
  scene.add(stars.points);

  const n = projects.length;
  const geometries = {}; // detail 단계별 공유 지오메트리
  const geoFor = (d) => (geometries[d] || (geometries[d] = new THREE.IcosahedronGeometry(BODY_RADIUS, d)));

  const bodies = projects.map((p, i) => {
    const mat = makeBodyMaterial();
    const mesh = new THREE.Mesh(geoFor(TIERS[0].detail), mat);
    mesh.position.copy(orbitPosition(i, n));
    mesh.rotation.y = -Math.atan2(mesh.position.z, mesh.position.x) + Math.PI / 2;
    scene.add(mesh);

    const b = { mesh, mat, video: null, texture: null, failed: false, playing: false, dir: viewDirFor(mesh.position) };
    const span = uvSpanFor(p.wide ? 1280 / 800 : 390 / 844);
    mat.uniforms.uSpan.value.set(span[0], span[1]);

    if (p.vid) {
      const fail = () => {
        b.failed = true;
        mat.uniforms.uHasVideo.value = 0;
      };
      const ready = () => {
        if (b.failed || !b.video) return;
        const a = b.video.videoWidth / Math.max(1, b.video.videoHeight);
        if (a > 0) {
          const s = uvSpanFor(a);
          mat.uniforms.uSpan.value.set(s[0], s[1]);
        }
      };
      b.video = makeVideo(p.vid, ready, fail);
      b.texture = new THREE.VideoTexture(b.video);
      b.texture.colorSpace = THREE.SRGBColorSpace;
      b.texture.minFilter = THREE.LinearFilter;
      b.texture.generateMipmaps = false;
      mat.uniforms.uMap.value = b.texture;
      b._fail = fail;
    }
    return b;
  });

  /* 재생 관리: 정렬 대상이 바뀔 때만 갱신한다 */
  let activeKey = -1;
  function updatePlayback(center, limit) {
    const key = center * 10 + limit;
    if (key === activeKey) return;
    activeKey = key;
    const want = new Set();
    for (let k = 0; want.size < limit && k < n; k++) {
      const a = center - Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      if (a >= 0 && a < n) want.add(a);
      if (k > n * 2) break;
    }
    bodies.forEach((b, i) => {
      if (!b.video || b.failed) return;
      if (want.has(i)) {
        if (!b.playing) {
          b.playing = true;
          const pr = b.video.play();
          if (pr && pr.catch) pr.catch(() => b._fail && b._fail());
        }
      } else if (b.playing) {
        b.playing = false;
        b.video.pause();
      }
    });
  }

  /* 강등 */
  let tier = 0;
  let rt = null;
  function applyTier(t) {
    const cfg = TIERS[t];
    stars.geometry.setDrawRange(0, cfg.stars);
    const g = geoFor(cfg.detail);
    bodies.forEach((b) => { b.mesh.geometry = g; });
    if (cfg.nebulaScale < 1 && !rt) {
      rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
      blit.material.uniforms.uMap.value = rt.texture;
    }
    activeKey = -1; // 동시 재생 수가 바뀌었으니 재판정
    resize();
  }

  let slowSince = 0;
  const bornAt = performance.now();
  const win = new Float32Array(60);
  let winI = 0, winN = 0;
  function sampleFrame(dt, now) {
    // 로드 직후 3초는 판정하지 않는다. 텍스처 업로드와 첫 컴파일의 잼을
    // 저사양으로 오판하면 멀쩡한 기기가 저폴리로 떨어진다.
    if (now - bornAt < 3000) return;
    win[winI] = dt; winI = (winI + 1) % 60; winN = Math.min(60, winN + 1);
    if (winN < 60 || tier >= TIERS.length - 1) return;
    let sum = 0;
    for (let i = 0; i < 60; i++) sum += win[i];
    if (60 / sum < 45) {
      if (!slowSince) slowSince = now;
      else if (now - slowSince > 3000) { tier++; applyTier(tier); slowSince = 0; winN = 0; }
    } else slowSince = 0;
  }

  /* 크기 */
  let W = 1, H = 1;
  function resize() {
    W = canvas.clientWidth || canvas.width || 1;
    H = canvas.clientHeight || canvas.height || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const s = TIERS[tier].nebulaScale;
    nebula.material.uniforms.uRes.value.set(W * dpr * s, H * dpr * s);
    stars.material.uniforms.uPixelRatio.value = dpr;
    if (rt) rt.setSize(Math.max(1, Math.round(W * dpr * s)), Math.max(1, Math.round(H * dpr * s)));
  }
  resize();

  /* 카메라 궤도 */
  let progress = 0;
  const camPos = new THREE.Vector3().copy(orbitPosition(0, n))
    .addScaledVector(viewDirFor(orbitPosition(0, n)), viewDistFor(W));
  const camLook = new THREE.Vector3().copy(orbitPosition(0, n));
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const camTmp = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const proj = new THREE.Vector3();
  let focusIndex = 0;
  let aligned = 1;
  let firstFrame = true;

  function updateCamera(dt) {
    const u = Math.max(0, Math.min(1, progress)) * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(u));
    const raw = n > 1 ? u - i0 : 0;
    // 0.25~0.75 구간만 이동에 쓴다 → 천체 앞에서 머무는 정렬 구간이 생긴다
    const f = raw <= 0.25 ? 0 : raw >= 0.75 ? 1 : (raw - 0.25) / 0.5;
    const e = f * f * (3 - 2 * f);
    const i1 = Math.min(n - 1, i0 + 1);

    const D = viewDistFor(W);
    tmpPos.copy(bodies[i0].mesh.position).addScaledVector(bodies[i0].dir, D);
    tmpLook.copy(bodies[i0].mesh.position).lerp(bodies[i1].mesh.position, e);
    camTmp.copy(bodies[i1].mesh.position).addScaledVector(bodies[i1].dir, D);
    tmpPos.lerp(camTmp, e);

    focusIndex = e < 0.5 ? i0 : i1;
    aligned = 1 - Math.min(1, Math.abs(e - (e < 0.5 ? 0 : 1)) * 4);

    const k = firstFrame ? 1 : Math.min(1, dt * 3.2);
    camPos.lerp(tmpPos, k);
    camLook.lerp(tmpLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    /* 천체를 화면 왼쪽 셋째로 밀어 오른쪽을 카드에 내준다.
       lookAt 이후에 카메라를 옆으로 평행 이동시킨다. 다시 lookAt 하면 도로 가운데로 온다. */
    const fr = frameFor(W);
    if (fr.cx !== 0.5 || fr.cy !== 0.5) {
      const dist = camPos.distanceTo(camLook), t = dist * TAN_HALF_FOV;
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(camRight, (1 - 2 * fr.cx) * t * (W / Math.max(1, H)));
      camera.position.addScaledVector(camUp, (2 * fr.cy - 1) * t);
      camera.updateMatrixWorld();
    }
    firstFrame = false;
  }

  const states = projects.map(() => ({ x: 0, y: 0, r: 0, scale: 1, opacity: 0, focus: false }));
  function emit() {
    if (!onUpdate) return;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      proj.copy(b.mesh.position).project(camera);
      const dist = camera.position.distanceTo(b.mesh.position);
      const s = states[i];
      s.x = (proj.x * 0.5 + 0.5) * W;
      s.y = (-proj.y * 0.5 + 0.5) * H;
      // 화면 반지름(px). 뷰포트 높이의 절반이 dist*tan 이므로 R/(dist*tan) * H/2 가 된다.
      s.r = BODY_RADIUS / Math.max(1, dist * TAN_HALF_FOV) * (H / 2);
      const D = viewDistFor(W);
      s.scale = Math.max(0, Math.min(1.4, D / Math.max(1, dist) * 1.15));
      const behind = proj.z > 1;
      s.opacity = behind ? 0 : Math.max(0, Math.min(1, 1 - (dist - D) / (ORBIT_RISE * 2.2)));
      s.focus = i === focusIndex && aligned > 0.5 && !behind;
      b.mat.uniforms.uFocus.value = s.focus ? 1 : 0;
      b.mat.uniforms.uOpacity.value = Math.max(0.12, s.opacity);
    }
    onUpdate(states);
  }

  /* 루프 */
  let raf = 0, last = performance.now(), t0 = last, running = true;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sampleFrame(dt, now);

    const time = (now - t0) / 1000;
    nebula.material.uniforms.uTime.value = time;
    nebula.material.uniforms.uProgress.value = progress;
    stars.material.uniforms.uTime.value = time;

    updateCamera(dt);
    updatePlayback(focusIndex, TIERS[tier].videos);

    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.mesh.rotation.y += dt * 0.05;
      if (b.video && !b.failed) b.mat.uniforms.uHasVideo.value = b.video.readyState >= 2 ? 1 : 0;
    }

    renderer.clear();
    if (rt) {
      renderer.setRenderTarget(rt);
      renderer.render(nebula.scene, dummyCam);
      renderer.setRenderTarget(null);
      renderer.render(blit.scene, dummyCam);
    } else {
      renderer.render(nebula.scene, dummyCam);
    }
    renderer.clearDepth();
    renderer.render(scene, camera);

    emit();
  }
  raf = requestAnimationFrame(frame);

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      if (running) {
        running = false;
        cancelAnimationFrame(raf);
        bodies.forEach((b) => { if (b.video && b.playing) b.video.pause(); });
      }
    } else if (!running) {
      running = true;
      last = performance.now();
      winN = 0; slowSince = 0;
      bodies.forEach((b) => {
        if (b.video && b.playing && !b.failed) {
          const pr = b.video.play();
          if (pr && pr.catch) pr.catch(() => b._fail && b._fail());
        }
      });
      raf = requestAnimationFrame(frame);
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  return {
    setProgress(p) {
      progress = typeof p === "number" && isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    },
    resize,
    destroy() {
      cancelAnimationFrame(raf);
      running = false;
      document.removeEventListener("visibilitychange", onVisibility);
      bodies.forEach((b) => {
        if (b.video) {
          b.video.pause();
          b.video.removeAttribute("src");
          b.video.load();
        }
        if (b.texture) b.texture.dispose();
        b.mat.dispose();
        scene.remove(b.mesh);
      });
      Object.keys(geometries).forEach((k) => geometries[k].dispose());
      stars.geometry.dispose();
      stars.material.dispose();
      nebula.geometry.dispose();
      nebula.material.dispose();
      blit.geometry.dispose();
      blit.material.dispose();
      if (rt) rt.dispose();
      renderer.dispose();
    },
  };
}
