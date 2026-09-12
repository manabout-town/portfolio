/* 카드 스냅은 CSS 와 JS 가 같은 전제를 공유해야 동작한다. 둘이 어긋나도
   에러가 안 나고 조용히 틀리기 때문에 여기서 잡는다.

   실제 스냅 동작은 브라우저에서 확인했다(진행률 0.37 → 0.4000, 카드 16개 기준 6/15).
   이 파일은 그 확인을 무효로 만드는 소스 변경만 감시한다. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = () => fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const snapJs = () => fs.readFileSync(path.join(ROOT, "js", "scroll-snap.js"), "utf8");

test("스냅 브레이크포인트가 CSS 와 맞는다", () => {
  /* CSS 가 .pin 높이를 auto 로 푸는 폭에서는 스냅할 구간이 없다.
     두 값이 어긋나면 좁은 화면에서 스냅이 걸리거나, 넓은 화면에서 안 걸린다. */
  const css = html().match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{\s*\.pin\{height:auto\}/);
  assert.ok(css, "index.html 에서 .pin height:auto 미디어쿼리를 못 찾았다");
  const cssMax = Number(css[1]);

  const js = snapJs().match(/min-width:\s*(\d+)px/);
  assert.ok(js, "scroll-snap.js 에서 min-width 를 못 찾았다");
  const jsMin = Number(js[1]);

  assert.equal(jsMin, cssMax + 1,
    `CSS 는 ${cssMax}px 이하에서 pin 을 푸는데 JS 는 ${jsMin}px 이상에서 스냅을 건다`);
});

test("scroll-behavior 가 auto 로 남아 있다", () => {
  /* smooth 로 되돌리면 ScrollTrigger 의 snap 과 브라우저가 같은 스크롤을
     동시에 움직여 서로 싸운다. 앵커의 부드러움은 initSmoothAnchors 가 맡는다. */
  const m = html().match(/html\{scroll-behavior:(\w+)\}/);
  assert.ok(m, "html 의 scroll-behavior 선언을 못 찾았다");
  assert.equal(m[1], "auto",
    "scroll-behavior 가 smooth 로 돌아왔다 — 스냅과 충돌한다");
});

test("앵커 이동 대체가 살아 있다", () => {
  /* CSS 부드러운 스크롤을 걷어냈으므로 이게 없으면 앵커가 뚝 끊긴다. */
  const js = snapJs();
  assert.match(js, /export function initSmoothAnchors/, "initSmoothAnchors 가 없다");
  assert.match(js, /a\[href\^="#"\]/, "앵커 선택자가 없다");
  assert.match(html(), /initSmoothAnchors\(\)/, "index.html 에서 호출하지 않는다");
});

test("스냅 스텝을 카드 수에서 가져온다", () => {
  /* 카드가 늘거나 줄면 스냅 간격도 따라와야 한다. 상수로 박으면 어긋난다. */
  assert.match(html(), /initCardSnap\(P\.length\)/,
    "initCardSnap 에 P.length 를 넘기지 않는다");
  assert.match(snapJs(), /1\s*\/\s*\(steps\s*-\s*1\)/,
    "snapTo 가 steps 에서 계산되지 않는다");
});
