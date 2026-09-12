/* 성능 티어 판정만 떼어냈다. 렌더러와 섞여 있으면 브라우저 없이는 검증할 수 없다.

   강등은 빠르게(3초), 복귀는 느리게(기본 6초) 본다. 두 임계 사이가 넓으면 그 구간의
   기기가 낮은 티어에 갇히므로 45와 52로 좁게 잡고, 흔들림은 시간으로 막는다. 올리자마자 다시 내려간 적이
   있으면 다음 복귀는 훨씬 오래 지켜본다 — 두 티어 사이를 오가며 별 수와 영상이
   깜빡이는 것이 낮은 티어에 머무는 것보다 나쁘다. */

export const TIER_DOWN_FPS = 45;
export const TIER_UP_FPS = 52;
const DOWN_HOLD = 3000;
const UP_HOLD = 6000;
const UP_HOLD_MAX = 120000;
const REGRET = 30000; // 복귀 후 이 시간 안에 다시 강등되면 대기 시간을 늘린다

/* ponytail: 화면 주사율이 57Hz 미만인 기기는 복귀 조건을 영원히 못 넘는다.
   실측 주사율을 기준으로 잡으려면 첫 창에서 최고 fps를 재서 비율로 바꾸면 된다. */
export function createTierJudge(count) {
  let tier = 0, slowSince = 0, fastSince = 0, upHold = UP_HOLD, upAt = 0;
  return {
    get tier() { return tier; },
    get upHold() { return upHold; },
    /* 측정 창이 끊긴 뒤(탭 복귀 등) 진행 중이던 판정을 버린다 */
    reset() { slowSince = 0; fastSince = 0; },
    /* fps 표본 하나를 먹이고 바뀐 티어를 돌려준다. 안 바뀌었으면 -1 */
    sample(fps, now) {
      if (fps < TIER_DOWN_FPS && tier < count - 1) {
        fastSince = 0;
        if (!slowSince) slowSince = now;
        else if (now - slowSince >= DOWN_HOLD) {
          if (upAt && now - upAt < REGRET) upHold = Math.min(upHold * 4, UP_HOLD_MAX);
          tier++; slowSince = 0; upAt = 0;
          return tier;
        }
      } else if (fps > TIER_UP_FPS && tier > 0) {
        slowSince = 0;
        if (!fastSince) fastSince = now;
        else if (now - fastSince >= upHold) {
          tier--; fastSince = 0; upAt = now;
          return tier;
        }
      } else {
        slowSince = 0; fastSince = 0;
      }
      return -1;
    },
  };
}
