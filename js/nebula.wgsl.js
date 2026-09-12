/* index.html 의 WebGL(GLSL) 성운을 WGSL 로 옮긴 것. 그림은 같아야 한다 —
   여기서 색이나 계수를 바꾸면 WebGPU 기기와 WebGL 기기가 서로 다른 배경을 보게 된다.
   원본을 고치면 이 파일도 같이 고칠 것.

   좌표계 주의: WebGL 의 gl_FragCoord 는 좌하단 원점에 y 가 위로 증가하지만
   WebGPU 가 주는 uv 는 좌상단 원점에 y 가 아래로 증가한다(실측 확인). 그래서
   프래그먼트 좌표를 만들 때 y 를 뒤집는다. 안 뒤집으면 은하면 기울기와
   포인터 시차가 상하 반전된다. */

export const NEBULA_WGSL = `
struct Globals {
  res: vec2f,     // 캔버스 픽셀 크기
  mouse: vec2f,   // -1..1, 감쇠된 포인터
  time: f32,      // 초
}
@group(0) @binding(0) var<uniform> g: Globals;

fn h(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn n(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h(i), h(i + vec2f(1.0, 0.0)), f.x),
    mix(h(i + vec2f(0.0, 1.0)), h(i + vec2f(1.0, 1.0)), f.x),
    f.y);
}

fn fbm(p0: vec2f) -> f32 {
  var v = 0.0; var a = 0.5; var p = p0;
  for (var i = 0; i < 4; i++) { v += a * n(p); p *= 2.03; a *= 0.5; }
  return v;
}

/* 워핑 변위장은 좌표를 밀어내는 용도라 디테일이 필요 없다 — 원본과 같이 3옥타브. */
fn fbm3(p0: vec2f) -> f32 {
  var v = 0.0; var a = 0.5; var p = p0;
  for (var i = 0; i < 3; i++) { v += a * n(p); p *= 2.03; a *= 0.5; }
  return v;
}

/* 격자 한 칸에 최대 하나. 위치는 고정이고 밝기만 흔들린다. */
fn star(uv: vec2f, sc: f32, dens: f32, k: f32, tw: f32, amp: f32) -> f32 {
  let gg = uv * sc;
  let i = floor(gg);
  let fr = fract(gg);
  if (h(i) > dens) { return 0.0; }
  let c = vec2f(h(i + 11.3), h(i + 37.7));
  let dd = length(fr - c);
  let mag = pow(h(i + 5.1), 3.6);
  let tk = 0.72 + 0.28 * sin(g.time * tw + h(i + 91.7) * 6.2832);
  return amp * mag * tk * exp(-dd * dd * k);
}

/* 먼 층 전용. 깜빡임이 안 보이는 크기라 sin 과 해시 하나를 뺀다. */
fn dust(uv: vec2f, sc: f32, dens: f32, k: f32, amp: f32) -> f32 {
  let gg = uv * sc;
  let i = floor(gg);
  let fr = fract(gg);
  let e = h(i);
  if (e > dens) { return 0.0; }
  let c = vec2f(h(i + 11.3), h(i + 37.7));
  let dd = length(fr - c);
  return amp * pow(e / dens, 2.2) * exp(-dd * dd * k);
}

/* 정렬 디더(Bayer 8x8). 2x2 를 세 번 접는다. */
fn b2(a0: vec2f) -> f32 { let a = floor(a0); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
fn b4(a: vec2f) -> f32 { return b2(0.5 * a) * 0.25 + b2(a); }
fn b8(a: vec2f) -> f32 { return b4(0.5 * a) * 0.25 + b2(a); }

@fragment
fn fs(@location(0) uv0: vec2f) -> @location(0) vec4f {
  // WebGL 의 gl_FragCoord 와 같은 좌하단 원점 y-up 픽셀 좌표로 되돌린다.
  let frag = vec2f(uv0.x, 1.0 - uv0.y) * g.res;
  let uv = (frag - 0.5 * g.res) / g.res.y;
  let p = uv * 1.35;

  /* 도메인 워핑 — fbm 의 입력을 fbm 으로 두 번 밀어낸다. */
  let q = vec2f(fbm3(p + vec2f(0.0, g.time * 0.02)), fbm3(p + vec2f(5.2, 1.3)));
  let w = vec2f(fbm3(p + 2.4 * q + vec2f(1.7, 9.2) - vec2f(0.0, g.time * 0.035)),
                fbm3(p + 2.4 * q + vec2f(8.3, 2.8)));
  let f = fbm(p + 2.6 * w);

  let bend = smoothstep(0.28, 0.86, length(w));
  /* 능선만 남겨 가는 필라멘트로 만든다. */
  let fil = pow(1.0 - abs(f * 2.0 - 1.0), 8.0);
  let d = length(uv - g.mouse * 0.5);
  let lamp = smoothstep(0.72, 0.0, d);

  /* 은하면 — 기울인 축에서 멀어질수록 옅어진다. */
  let ruv = mat2x2f(vec2f(0.93, -0.37), vec2f(0.37, 0.93)) * uv;
  let band = exp(-ruv.y * ruv.y * 3.4);

  var col = vec3f(0.006, 0.008, 0.019);
  col += mix(vec3f(0.055, 0.060, 0.098), vec3f(0.12, 0.055, 0.085), bend) * f * f * 0.85 * band;
  col += mix(vec3f(0.20, 0.06, 0.13), vec3f(0.09, 0.10, 0.16), bend) * fil * 0.04 * band;
  col += vec3f(0.84, 0.80, 0.66) * pow(fil, 3.4) * lamp * 0.13;

  /* 네 층. 가까울수록 포인터에 더 밀려 시차가 생긴다. */
  col += star(uv + g.mouse * 0.008, 22.0, 0.30, 1600.0, 0.9, 1.25) * vec3f(1.0, 0.97, 0.92);
  col += star(uv + g.mouse * 0.004, 55.0, 0.45, 380.0, 1.3, 0.85) * vec3f(0.94, 0.96, 1.0);
  col += dust(uv + g.mouse * 0.001, 120.0, 0.62, 90.0, 0.62) * vec3f(0.90, 0.93, 1.0);
  col += dust(uv, 255.0, 0.78, 22.0, 0.34) * (0.4 + 0.6 * band) * vec3f(0.86, 0.90, 1.0);

  col *= 1.0 - 0.46 * length(uv) * 0.72;

  /* 디더 후 계단화. 감마 공간에서 잘라 어두운 쪽이 뭉개지지 않게 한다. */
  let L = 18.0;
  col = sqrt(max(col, vec3f(0.0)));
  col += vec3f((b8(frag / 3.0) - 0.5) / L);
  col = floor(col * L + 0.5) / L;
  col *= col;

  return vec4f(col, 1.0);
}
`;
