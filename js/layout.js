/* 천체 표면의 자리 배분. 렌더러와 섞지 않아야 브라우저 없이 검증할 수 있다.

   불변식 하나를 지킨다: 영상 창은 언제나 온전히 보이고, 고리도 위성도 그 위를
   지나지 않는다. 아래 수를 건드리면 test/layout.test.mjs 가 먼저 깨진다. */

/* 창의 반너비·반높이. 단위는 천체 반지름이고, 값이 곧 화면에서 차지하는 비율이다.
   1.0 이면 천체 가장자리까지 닿아 곡률에 눌려 읽을 수 없게 된다. */
export function uvSpanFor(aspect) {
  if (aspect >= 1) { const hw = 0.60; return [hw, hw / aspect]; }
  const hh = 0.58;
  return [hh * aspect, hh];
}

/* 창 모서리가 중심에서 얼마나 떨어지는지. 고리와 위성은 이 밖에서만 돈다. */
export function windowReach(aspect) {
  const [x, y] = uvSpanFor(aspect);
  return Math.hypot(x, y);
}

export const RING_INNER = 1.34;
export const RING_OUTER = 1.92;
export const MOON_ORBIT = 1.72;
export const MOON_RADIUS = 0.125;

/* 화면비의 양 끝. 세로 앱 화면과 가로 웹 화면을 모두 감당해야 한다. */
export const ASPECTS = [390 / 844, 1280 / 800];
