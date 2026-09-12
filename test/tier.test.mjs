/* node test/tier.test.mjs */
import assert from "node:assert/strict";
import { createTierJudge } from "../js/tier.js";

// 표본 하나를 dt 간격으로 여러 번 먹인다. 마지막으로 바뀐 티어를 돌려준다.
function feed(j, fps, ms, t0, step = 100) {
  let last = -1;
  for (let t = t0; t < t0 + ms; t += step) {
    const r = j.sample(fps, t);
    if (r >= 0) last = r;
  }
  return last;
}

// 느리면 내려간다
{
  const j = createTierJudge(3);
  assert.equal(feed(j, 30, 4000, 0), 1);
  assert.equal(j.tier, 1);
}

// 빨라지면 도로 올라온다 — 이게 없던 동작이다
{
  const j = createTierJudge(3);
  feed(j, 30, 4000, 0);
  assert.equal(j.tier, 1);
  assert.equal(feed(j, 55, 7000, 10000), 0);
  assert.equal(j.tier, 0);
}

// 복귀는 6초를 채워야 한다. 잠깐 빨라진 것으로는 안 올라간다
{
  const j = createTierJudge(3);
  feed(j, 30, 4000, 0);
  assert.equal(feed(j, 60, 3000, 10000), -1);
  assert.equal(j.tier, 1);
}

// 중간에 한 번 느려지면 복귀 타이머가 처음부터 다시 간다
{
  const j = createTierJudge(3);
  feed(j, 30, 4000, 0);
  feed(j, 60, 5000, 10000);
  j.sample(30, 15000);              // 방해
  assert.equal(feed(j, 60, 3000, 15100), -1);
  assert.equal(j.tier, 1);
}

// 올린 직후 다시 내려가면 다음 복귀 대기가 길어진다 (깜빡임 방지)
{
  const j = createTierJudge(3);
  feed(j, 30, 4000, 0);
  feed(j, 60, 7000, 10000);         // 복귀
  assert.equal(j.tier, 0);
  feed(j, 30, 4000, 20000);         // 30초 안에 다시 강등
  assert.equal(j.tier, 1);
  assert.equal(j.upHold, 24000);
  assert.equal(feed(j, 60, 7000, 40000), -1);   // 예전 대기로는 안 올라간다
  assert.equal(feed(j, 60, 20000, 47000), 0);   // 더 오래 버티면 올라간다
}

// 최저 티어 아래로는 안 내려가고, 최고 티어 위로는 안 올라간다
{
  const j = createTierJudge(3);
  feed(j, 10, 60000, 0);
  assert.equal(j.tier, 2);
  feed(j, 60, 300000, 100000);
  assert.equal(j.tier, 0);
  feed(j, 60, 60000, 500000);
  assert.equal(j.tier, 0);
}

console.log("tier: 6 cases ok");
