/* 히어로 제목 분할이 조용히 망가지는 지점들.

   실제 동작은 브라우저에서 확인했다 — 글자 11개로 쪼개지고, 글자0은 즉시·글자4는
   약 150ms 뒤·2번째 줄은 더 뒤에 움직이며, 이동량은 전부 124.7~124.8px 로 같다.
   여기서는 그 확인을 무효로 만드는 소스 변경만 감시한다. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = () => fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const js = () => fs.readFileSync(path.join(ROOT, "js", "hero-split.js"), "utf8");

test("그라디언트 글자는 쪼개지 않는다", () => {
  /* .kine b 는 background-clip:text 로 금색 그라디언트가 걸려 있다. 글자마다
     요소를 나누면 그라디언트가 글자마다 다시 시작해서 금속 느낌이 사라진다.
     ignore 를 지우면 에러 없이 그림만 나빠지므로 여기서 잡는다. */
  assert.match(html(), /\.kine b\{[^}]*background-clip:text/,
    ".kine b 의 background-clip:text 가 사라졌다 — ignore 가 필요 없어졌는지 확인할 것");
  assert.match(js(), /ignore:\s*"b"/,
    'SplitText 의 ignore: "b" 가 사라졌다 — 그라디언트가 글자마다 끊긴다');
});

test("CSS 폴백 연출이 남아 있다", () => {
  /* GSAP 로드에 실패하면 js-split 클래스가 안 붙고 아래 CSS 연출이 그대로 돈다.
     둘 중 하나만 남으면 제목이 안 보이거나 두 연출이 겹친다. */
  const h = html();
  assert.match(h, /\.kine \.ln i\{[^}]*animation:rise/, "CSS 줄 단위 등장이 사라졌다");
  assert.match(h, /\.kine\.js-split \.ln i\{[^}]*animation:none/,
    "js-split 이 CSS 애니메이션을 끄지 않는다 — 두 연출이 겹친다");
  assert.match(js(), /classList\.add\("js-split"\)/, "js-split 클래스를 붙이지 않는다");
});

test("모션 축소 설정에서는 돌지 않는다", () => {
  assert.match(js(), /prefers-reduced-motion:\s*reduce/, "모션 축소 가드가 없다");
});

test("인트로가 걷힌 뒤 시작한다", () => {
  /* 인트로 표지가 덮고 있는 동안 제목이 올라가면 아무도 못 본다.
     인트로 스크립트가 죽어도 제목은 나와야 하므로 시간 제한도 함께 둔다. */
  const j = js();
  assert.match(j, /classList\.contains\("launched"\)/, "launched 를 기다리지 않는다");
  assert.match(j, /setTimeout\([\s\S]{0,80}?,\s*\d{4}\s*\)/, "인트로가 죽었을 때의 시간 제한이 없다");
});

test("index.html 이 호출하고, 실패해도 넘어간다", () => {
  const h = html();
  assert.match(h, /import\("\.\/js\/hero-split\.js"\)/, "hero-split.js 를 부르지 않는다");
  assert.match(h, /hero-split\.js"\)\.then\([\s\S]{0,60}?\.catch\(/,
    "로드 실패를 삼키지 않는다 — GSAP 이 없으면 페이지가 멈출 수 있다");
});
