import * as THREE from "../vendor/three.module.min.js";
import { createTierJudge } from "./tier.js";

/* 팔레트는 기존 버건디/골드를 심우주로 계승한 값이다. */
const C_NEBULA = new THREE.Color(0x8c1e52);
const C_PLATINUM = new THREE.Color(0xd8cfa6);

/* 강등해도 실루엣은 건드리지 않는다. 천체 열여섯 개를 다 합쳐도 면 수는 만 단위라
   GPU 에 부담이 아니다. 비싼 쪽은 별 개수와 동시에 디코딩하는 영상이다. */
const TIERS = [
  { stars: 20000, detail: 4, videos: 3 },
  { stars: 8000, detail: 3, videos: 2 },
  { stars: 3000, detail: 3, videos: 1 },
];

/* 천체마다 다른 얼굴을 준다. 열여섯 개가 같은 공이면 궤도가 아니라 목록으로 보인다.
   색은 배경의 청백 별과 금빛 성간 먼지 사이에서만 고른다. 채도를 올리면 배경에서 뜬다. */
const BODY_LOOKS = [
  { style: 0, seed: 0.0, tint: 0x8494b2 },  // 암석 · 청회
  { style: 1, seed: 1.7, tint: 0xc0a87f },  // 가스 · 모래
  { style: 2, seed: 3.1, tint: 0xaec6dd },  // 얼음 · 연청
  { style: 0, seed: 4.6, tint: 0xa08f9c },  // 암석 · 자회
  { style: 1, seed: 6.2, tint: 0x9aaccb },  // 가스 · 청
  { style: 2, seed: 7.9, tint: 0xc8d2e0 },  // 얼음 · 은
  { style: 0, seed: 9.3, tint: 0xb09677 },  // 암석 · 황토
  { style: 1, seed: 11.1, tint: 0x8894b4 }, // 가스 · 심청
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

/* 천체 표면. 배경이 검정과 청백 별로 정리되어 있어 채움색도 그 톤을 따른다.
   uStyle 0 암석 · 1 가스 · 2 얼음. uSeed 로 같은 양식 안에서 무늬를 흩는다. */
function makeBodyMaterial(style, seed, tint) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStyle: { value: style },
      uSeed: { value: seed },
      uTint: { value: tint },
      uMap: { value: null },
      uHasVideo: { value: 0 },
      uSpan: { value: new THREE.Vector2(0.25, 0.9) },
      uFill: { value: new THREE.Color(0x4a5570) },
      uRim: { value: new THREE.Color(0xbcd0e8) },
      uFocus: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormalV; varying vec3 vViewPos; varying vec3 vCenterV;
      varying vec3 vNormalM;
      void main(){
        vUv = uv;
        vNormalM = normalize(normal); // 표면 무늬는 천체에 붙어 함께 돈다
        vNormalV = normalize(normalMatrix * normal);
        vCenterV = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv; varying vec3 vNormalV; varying vec3 vViewPos; varying vec3 vCenterV;
      varying vec3 vNormalM;
      uniform sampler2D uMap; uniform float uHasVideo; uniform vec2 uSpan;
      uniform vec3 uFill; uniform vec3 uRim; uniform float uFocus; uniform float uOpacity;
      uniform float uStyle; uniform float uSeed; uniform vec3 uTint;
      float hs(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float ns(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(hs(i), hs(i + vec3(1,0,0)), f.x), mix(hs(i + vec3(0,1,0)), hs(i + vec3(1,1,0)), f.x), f.y);
        float b = mix(mix(hs(i + vec3(0,0,1)), hs(i + vec3(1,0,1)), f.x), mix(hs(i + vec3(0,1,1)), hs(i + vec3(1,1,1)), f.x), f.y);
        return mix(a, b, f.z);
      }
      float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * ns(p); p *= 2.04; a *= 0.5; } return v; }
      void main(){
        vec3 N = normalize(vNormalV);
        /* 구면 UV를 쓰면 지오메트리마다 이음새 위치와 상하 방향이 달라진다.
           대신 시선 공간 법선으로 찍어 영상 면이 항상 카메라를 정면으로 보게 했다.
           기준축은 카메라 정면(+Z)이 아니라 천체 중심→카메라 방향이다. 천체를 화면
           왼쪽 셋째로 밀어두므로 +Z를 쓰면 영상이 원반 한쪽으로 밀려난다. */
        vec3 A = normalize(-vCenterV);
        vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), A));
        vec3 U = cross(A, R);
        vec2 t = vec2(dot(N, R), dot(N, U)) / uSpan * 0.5 + 0.5;
        /* 표면 무늬. 가스는 위도 띠, 암석은 얼룩진 대륙, 얼음은 곱게 갈라진 면. */
        vec3 M = vNormalM;
        vec3 sp = M * 2.6 + uSeed;
        float grain = fbm3(sp * 1.9);
        float pattern;
        if (uStyle < 0.5) {
          pattern = fbm3(sp) * 0.65 + fbm3(sp * 4.1) * 0.35;        // 암석
        } else if (uStyle < 1.5) {
          float lat = M.y * 3.4 + fbm3(sp * 1.3) * 1.2;             // 가스 — 띠가 난류에 밀린다
          pattern = 0.5 + 0.5 * sin(lat * 2.6 + uSeed);
          pattern = pow(pattern, 1.4);
          pattern = mix(pattern, grain, 0.18);
        } else {
          pattern = pow(fbm3(sp * 2.4), 1.6);                        // 얼음
        }
        vec3 base = mix(uFill, uTint, clamp(pattern, 0.0, 1.0));
        base *= 0.82 + 0.40 * grain; // 얼룩의 대비를 살려야 공이 아니라 지표로 읽힌다
        if (uHasVideo > 0.5 && dot(N, A) > 0.0) {
          /* 영상은 표면에 난 창이다. 모서리를 둥글리고 가장자리를 넓게 풀어
             판때기가 덧대어진 느낌 대신 표면에서 배어 나오게 한다. */
          vec2 d = abs(t - 0.5) * 2.0;
          float corner = length(max(d - vec2(0.72), 0.0)) / 0.28;
          float win = 1.0 - smoothstep(0.55, 1.0, max(max(d.x, d.y) * 0.92, corner));
          base = mix(base * 0.55, texture2D(uMap, clamp(t, 0.0, 1.0)).rgb, win);
        }
        vec3 V = normalize(-vViewPos);
        // 프레넬 림라이트가 천체를 성운에서 떼어놓는다
        float f = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
        /* 한 방향에서만 빛이 온다. 반대쪽은 완전히 죽이지 않고 배경 별빛만큼 남긴다. */
        float lam = clamp(dot(N, normalize(vec3(0.42, 0.62, 0.66))), 0.0, 1.0);
        float lit = 0.30 + 1.10 * smoothstep(0.0, 0.68, lam);
        /* 대기 산란 — 빛을 받는 쪽 가장자리만 얇게 밝다. 천체를 배경에서 떼어낸다. */
        float halo = f * (0.25 + 0.75 * smoothstep(0.0, 0.5, lam));
        vec3 col = base * lit + uRim * halo * (0.55 + 0.35 * uFocus);
        gl_FragColor = vec4(col, uOpacity);
      }`,
    transparent: true,
  });
}

/* 첫 프레임이 GPU 에 올라왔는지 알려준다. 업로드 전 텍스처는 흰색으로 샘플링되어
   천체가 백지 판때기로 보인다. readyState 만으로는 그 순간을 거를 수 없다. */
function watchFrames(v, onFrame) {
  if (typeof v.requestVideoFrameCallback !== "function") return false;
  const tick = () => { onFrame(); v.requestVideoFrameCallback(tick); };
  v.requestVideoFrameCallback(tick);
  return true;
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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    if (!renderer.getContext()) return null;
  } catch (e) {
    return null; // 호출자가 정적 폴백을 유지한다
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  /* 성운을 따로 그리지 않는다. 캔버스를 비워 두면 페이지 전체에 깔린
     은하 배경이 그대로 비쳐서 다른 구간과 톤이 어긋날 일이 없다. */
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2000);

  const stars = makeStars(TIERS[0].stars);
  scene.add(stars.points);

  const n = projects.length;
  const geometries = {}; // detail 단계별 공유 지오메트리
  const geoFor = (d) => (geometries[d] || (geometries[d] = new THREE.IcosahedronGeometry(BODY_RADIUS, d)));

  const bodies = projects.map((p, i) => {
    const look = BODY_LOOKS[i % BODY_LOOKS.length];
    const mat = makeBodyMaterial(look.style, look.seed, new THREE.Color(look.tint));
    const mesh = new THREE.Mesh(geoFor(TIERS[0].detail), mat);
    mesh.position.copy(orbitPosition(i, n));
    mesh.rotation.y = -Math.atan2(mesh.position.z, mesh.position.x) + Math.PI / 2;
    scene.add(mesh);

    const b = { mesh, mat, video: null, texture: null, failed: false, playing: false,
                src: p.vid || null, retries: 0, stallSince: 0,
                hasFrame: false, tracksFrames: false, dir: viewDirFor(mesh.position) };
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
      b.tracksFrames = watchFrames(b.video, () => { b.hasFrame = true; });
      b.texture = new THREE.VideoTexture(b.video);
      b.texture.colorSpace = THREE.SRGBColorSpace;
      b.texture.minFilter = THREE.LinearFilter;
      b.texture.generateMipmaps = false;
      mat.uniforms.uMap.value = b.texture;
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
          /* 거부를 영구 실패로 낙인찍지 않는다. 자동재생 정책도 저전력 모드도 나중에 풀린다.
             진짜로 못 읽는 파일은 error 이벤트가 따로 걸러낸다. 되살리기는 스톨 감시가 맡는다. */
          if (pr && pr.catch) pr.catch(() => {});
        }
      } else if (b.playing) {
        b.playing = false;
        b.video.pause();
      }
    });
  }

  /* 첫 프레임이 사라진 천체를 되살린다. 브라우저는 메모리가 아쉬우면 화면 밖 영상의
     디코더를 회수하고, 그러면 readyState 가 0 으로 떨어진 채 다시 오르지 않는다.
     재생 대상인데 계속 비어 있으면 소스를 다시 걸어준다. */
  const STALL_WAIT = 1500;
  const STALL_RETRIES = 3;
  function updateVideoState(b, now) {
    // 프레임 콜백을 주는 브라우저에서는 실제 업로드를 기다린다. 없으면 readyState 로 만족한다.
    const ready = b.tracksFrames ? b.hasFrame : b.video.readyState >= 2;
    b.mat.uniforms.uHasVideo.value = ready ? 1 : 0;
    if (ready) { b.stallSince = 0; b.retries = 0; return; }
    if (!b.playing) { b.stallSince = 0; return; }
    if (!b.stallSince) { b.stallSince = now; return; }
    if (now - b.stallSince < STALL_WAIT * (b.retries + 1)) return;
    b.stallSince = 0;
    if (b.retries >= STALL_RETRIES) { b.failed = true; return; } // 세 번 실패하면 빈 구체로 둔다
    b.retries++;
    b.hasFrame = false; // 다시 올라오기 전까지는 그리지 않는다
    b.video.src = b.src;
    b.video.load();
    const pr = b.video.play();
    if (pr && pr.catch) pr.catch(() => {});
  }

  /* 강등과 복귀 */
  let tier = 0;
  function applyTier(t) {
    const cfg = TIERS[t];
    stars.geometry.setDrawRange(0, cfg.stars);
    const g = geoFor(cfg.detail);
    bodies.forEach((b) => { b.mesh.geometry = g; });
    activeKey = -1; // 동시 재생 수가 바뀌었으니 재판정
    resize();
  }

  const judge = createTierJudge(TIERS.length);
  const bornAt = performance.now();
  const win = new Float32Array(60);
  let winI = 0, winN = 0;
  function sampleFrame(dt, now) {
    // 로드 직후 3초는 판정하지 않는다. 텍스처 업로드와 첫 컴파일의 잼을
    // 저사양으로 오판하면 멀쩡한 기기가 저폴리로 떨어진다.
    if (now - bornAt < 3000) return;
    win[winI] = dt; winI = (winI + 1) % 60; winN = Math.min(60, winN + 1);
    if (winN < 60) return;
    let sum = 0;
    for (let i = 0; i < 60; i++) sum += win[i];
    // 강등도 복귀도 여기서 나온다. 여유가 생기면 별과 영상이 도로 살아난다.
    const next = judge.sample(60 / sum, now);
    if (next >= 0) { tier = next; applyTier(tier); winN = 0; }
  }

  /* 크기 */
  let W = 1, H = 1;
  function resize() {
    W = canvas.clientWidth || canvas.width || 1;
    H = canvas.clientHeight || canvas.height || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    stars.material.uniforms.uPixelRatio.value = dpr;
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
    stars.material.uniforms.uTime.value = time;

    updateCamera(dt);
    updatePlayback(focusIndex, TIERS[tier].videos);

    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.mesh.rotation.y += dt * 0.05;
      if (b.video && !b.failed) updateVideoState(b, now);
    }

    renderer.clear();
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
      winN = 0; judge.reset();
      bodies.forEach((b) => {
        b.stallSince = 0;
        if (b.video && b.playing && !b.failed) {
          const pr = b.video.play();
          if (pr && pr.catch) pr.catch(() => {}); // 탭 복귀 직후 거부도 스톨 감시가 다시 집어든다
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
      renderer.dispose();
    },
  };
}
