/* 배경 성운의 WebGPU 경로. 성공하면 컨트롤 객체를, 실패하면 null 을 돌려준다.
   null 이면 호출자가 기존 WebGL 경로를 그대로 태운다 — 이 파일은 폴백을 결정하지 않는다.

   호출 순서 주의: 캔버스는 컨텍스트 타입을 하나만 가진다. getContext("webgl") 을
   한 번이라도 부른 캔버스에서는 getContext("webgpu") 가 null 을 돌려준다.
   그래서 이 함수가 WebGL 시도보다 반드시 먼저 와야 한다.

   그림은 WebGL 판과 같아야 한다. 계수는 nebula.wgsl.js 에 있고 원본은 index.html 안의
   GLSL 이다. 둘 중 하나만 고치면 기기에 따라 다른 배경이 보인다. */

import { NEBULA_WGSL } from "./nebula.wgsl.js";

const DPR_MAX = 1.25;   // 원본 WebGL 경로와 같은 상한
const EASE = 0.045;     // 포인터 감쇠 계수. 원본과 같다
const RM_TIME = 4.0;    // 모션 축소 시 고정할 시각(초)

export async function startNebulaWebGPU(canvas, opts) {
  const reducedMotion = !!(opts && opts.reducedMotion);
  if (!canvas || !navigator.gpu) return null;

  let api;
  try {
    api = await import("../vendor/vgpu.module.min.js");
  } catch (e) {
    return null; // 번들이 없거나 파싱 실패
  }

  const { init, effect, surface, frameLoop, uniforms } = api;

  let gpu = null, surf = null;
  try {
    gpu = await init();
    if (!gpu) return null;
    surf = surface(gpu, canvas, { dpr: [1, DPR_MAX], alphaMode: "opaque" });
  } catch (e) {
    /* 어댑터 없음, webgpu 컨텍스트 거부, 캔버스가 이미 다른 컨텍스트를 가진 경우 등.
       전부 폴백으로 보낸다. */
    try { if (gpu) gpu.dispose(); } catch (_) {}
    return null;
  }

  const g = uniforms(gpu, { res: [1, 1], mouse: [0, 0], time: reducedMotion ? RM_TIME : 0 });

  let fx;
  try {
    fx = effect(gpu, NEBULA_WGSL, { set: { g } });
  } catch (e) {
    try { surf.dispose(); gpu.dispose(); } catch (_) {}
    return null;
  }

  /* 물리 픽셀 크기를 셰이더에 넘긴다. 구독 즉시 한 번 불리므로 초기값도 여기서 잡힌다. */
  let W = 1, H = 1;
  const offResize = surf.onResize((e) => { W = e.width; H = e.height; });

  let mx = 0, my = 0, tx = 0, ty = 0;
  const onPointer = (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = -(e.clientY / innerHeight - 0.5) * 2;
  };
  addEventListener("pointermove", onPointer);

  const t0 = performance.now();
  let stopped = false;

  /* ponytail: 디바이스 로스트(탭 장시간 백그라운드, 드라이버 리셋)는 처리하지 않는다.
     그 경우 캔버스가 마지막 프레임에서 멈춘다 — 정지된 성운이라 치명적이지 않다.
     복구가 필요해지면 gpu.device.lost 를 받아 stop() 후 WebGL 경로를 다시 태우면 된다. */
  const loop = frameLoop(gpu, (frame) => {
    if (stopped) return;
    mx += (tx - mx) * EASE;
    my += (ty - my) * EASE;
    g.set({
      res: [W, H],
      mouse: [mx, my],
      time: reducedMotion ? RM_TIME : (performance.now() - t0) / 1000,
    });
    frame.pass(surf, fx);
  });

  return {
    backend: "webgpu",
    stop() {
      if (stopped) return;
      stopped = true;
      removeEventListener("pointermove", onPointer);
      try { loop.stop(); } catch (_) {}
      try { offResize(); } catch (_) {}
      try { surf.dispose(); } catch (_) {}
      try { gpu.dispose(); } catch (_) {}
    },
  };
}
