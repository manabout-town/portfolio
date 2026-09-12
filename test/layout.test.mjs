/* node test/layout.test.mjs */
import assert from "node:assert/strict";
import { uvSpanFor, windowReach, RING_INNER, RING_OUTER, MOON_ORBIT, MOON_RADIUS, ASPECTS } from "../js/layout.js";

// 창은 천체 가장자리에 닿지 않는다. 닿으면 곡률에 눌려 UI 를 읽을 수 없다.
for (const a of ASPECTS) {
  const [x, y] = uvSpanFor(a);
  assert.ok(x > 0 && y > 0, `양수여야 한다: ${a}`);
  assert.ok(windowReach(a) < 0.80, `창이 가장자리에 너무 가깝다: ${a} → ${windowReach(a)}`);
}

// 화면비가 유지된다. 어긋나면 영상이 늘어나거나 잘린다.
for (const a of ASPECTS) {
  const [x, y] = uvSpanFor(a);
  assert.ok(Math.abs(x / y - a) < 1e-9, `화면비가 어긋난다: ${a}`);
}

// 고리는 창 바깥에서만 돈다.
for (const a of ASPECTS) {
  assert.ok(RING_INNER > windowReach(a) + 0.25, `고리가 창에 너무 붙는다: ${a}`);
}
assert.ok(RING_OUTER > RING_INNER, "고리 바깥이 안쪽보다 커야 한다");

// 위성도 창을 덮지 않는다. 가장 가까이 붙었을 때로 따진다.
for (const a of ASPECTS) {
  assert.ok(MOON_ORBIT - MOON_RADIUS > windowReach(a) + 0.25, `위성이 창을 스친다: ${a}`);
}

// 위성이 고리 띠 한가운데 박히지 않는다.
assert.ok(MOON_ORBIT - MOON_RADIUS > RING_INNER - 0.1, "위성 궤도가 고리 안쪽으로 파고든다");

console.log("layout: 4 cases ok");
