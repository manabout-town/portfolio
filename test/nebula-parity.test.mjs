/* 배경 성운은 두 벌로 존재한다 — index.html 안의 GLSL(WebGL 경로)과
   js/nebula.wgsl.js 의 WGSL(WebGPU 경로). 기기에 따라 둘 중 하나가 그려지므로
   그림이 갈라지면 안 된다.

   실제 픽셀 비교는 브라우저 두 개를 띄워야 해서 여기 두지 않았다(그건 수동 검증에서
   0.003% 차이로 확인함 — 디더 양자화 경계의 반올림뿐). 이 테스트가 지키는 건
   그보다 현실적인 위험이다: 한쪽 셰이더만 고치고 다른 쪽을 잊는 것.

   색·세기·주파수 같은 튜닝 값이 한쪽에서만 바뀌면 상수 집합이 어긋나므로 여기서 걸린다. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* WGSL 타입 이름에 든 숫자(f32, vec2f, mat2x2f ...)는 상수가 아니다. 세기 전에 지운다. */
const TYPE_TOKENS = /\b(?:[fiu]32|vec[234][fiu]?|mat[234]x[234]f)\b/g;

function literals(src) {
  const counts = new Map();
  for (const tok of src.replace(TYPE_TOKENS, " ").match(/\d*\.?\d+(?:e-?\d+)?/g) || []) {
    const v = parseFloat(tok);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}

function readGlsl() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = html.match(/const fs=`([\s\S]*?)`;/);
  assert.ok(m, "index.html 에서 GLSL 프래그먼트 셰이더를 못 찾았다");
  return m[1];
}

function readWgsl() {
  const src = fs.readFileSync(path.join(ROOT, "js", "nebula.wgsl.js"), "utf8");
  const m = src.match(/export const NEBULA_WGSL = `([\s\S]*?)`;/);
  assert.ok(m, "nebula.wgsl.js 에서 NEBULA_WGSL 을 못 찾았다");
  return m[1];
}

test("성운 셰이더: GLSL 과 WGSL 의 튜닝 상수가 같다", () => {
  const a = literals(readGlsl());
  const b = literals(readWgsl());

  const onlyGlsl = [...a.keys()].filter((k) => !b.has(k)).sort((x, y) => x - y);
  const onlyWgsl = [...b.keys()].filter((k) => !a.has(k)).sort((x, y) => x - y);

  assert.deepEqual(onlyGlsl, [], `GLSL 에만 있는 상수 — WGSL 이식본에 반영 안 됨: ${onlyGlsl}`);
  assert.deepEqual(onlyWgsl, [], `WGSL 에만 있는 상수 — GLSL 원본에 반영 안 됨: ${onlyWgsl}`);
});

test("성운 셰이더: WGSL 이 좌표계를 뒤집는다", () => {
  /* WebGL 의 gl_FragCoord 는 좌하단 원점 y-up, WebGPU 가 주는 uv 는 좌상단 원점 y-down.
     이 뒤집기가 빠지면 은하면 기울기와 포인터 시차가 상하 반전된다. */
  assert.match(readWgsl(), /1\.0\s*-\s*uv0\.y/, "y 뒤집기가 없다");
});

test("성운 셰이더: 두 경로가 같은 유니폼을 쓴다", () => {
  const wgsl = readWgsl();
  for (const name of ["res", "mouse", "time"]) {
    assert.match(wgsl, new RegExp(`\\b${name}\\s*:`), `WGSL Globals 에 ${name} 이 없다`);
  }
  const glsl = readGlsl();
  for (const u of ["uniform vec2 r", "uniform float t", "uniform vec2 m"]) {
    assert.ok(glsl.includes(u), `GLSL 에 "${u}" 가 없다`);
  }
});
