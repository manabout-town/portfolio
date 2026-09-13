/* 히어로 제목을 글자 단위로 올린다.

   기존 연출을 버리는 게 아니라 잘게 쪼개는 것이다. .ln 의 overflow:hidden 마스크와
   1.15s cubic-bezier(.16,1,.3,1) 곡선은 그대로 쓰고, 한 줄이 통째로 올라오던 것을
   글자별로 시차를 두어 올린다.

   <b>내보냈다</b> 는 쪼개지 않는다. 거기엔 background-clip:text 로 금색 그라디언트가
   걸려 있어서, 글자마다 요소를 나누면 그라디언트가 글자마다 처음부터 다시 시작한다.
   가로로 훑고 지나가는 금속 느낌이 사라진다. 그래서 ignore 로 통째 남기고
   한 덩어리로 올린다 — 마지막 줄이 한 번에 도착하는 편이 결론처럼 읽히기도 한다.

   모션 축소 설정에서는 아무것도 하지 않는다. CSS 가 이미 정적으로 보여 준다. */

import { gsap, SplitText, CustomEase } from "../vendor/gsap.module.min.js";

const DUR = 1.15;         /* 기존 rise 애니메이션과 같은 길이 */
const LINE_GAP = 0.09;    /* 줄 사이 시차. 기존 nth-child 딜레이와 같다 */
const CHAR_GAP = 0.035;   /* 한 줄 안에서 글자 사이 시차 */

export function initHeroSplit() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

  const h1 = document.querySelector("h1.kine");
  if (!h1) return null;

  const lines = [...h1.querySelectorAll(".ln > i")];
  if (!lines.length) return null;

  gsap.registerPlugin(SplitText, CustomEase);
  /* CSS 의 cubic-bezier(.16,1,.3,1) 을 그대로 옮긴다. 사이트의 다른 큰 모션과 같은 곡선이다. */
  const ease = CustomEase.create("heroRise", "M0,0 C0.16,1 0.3,1 1,1");

  /* CSS 등장 애니메이션을 끄고 GSAP 이 몰고 간다. */
  h1.classList.add("js-split");

  const units = lines.map((line) => {
    /* b 는 그라디언트 때문에 통째로 둔다. 쪼갤 게 없으면 줄 자체를 한 단위로 쓴다. */
    const split = SplitText.create(line, {
      type: "chars",
      charsClass: "kchar",
      ignore: "b",
      smartWrap: true,
      aria: "auto",
    });
    return { line, split, targets: split.chars.length ? split.chars : [line] };
  });

  const tl = gsap.timeline({ paused: true });
  units.forEach(({ targets }, i) => {
    tl.from(targets, {
      yPercent: 105,
      duration: DUR,
      ease,
      stagger: targets.length > 1 ? CHAR_GAP : 0,
    }, i * LINE_GAP);
  });

  /* 인트로 표지가 걷힌 뒤에 시작한다. CSS 가 animation-play-state 로 하던 일과 같다. */
  const start = () => tl.play();
  if (document.body.classList.contains("launched")) {
    start();
  } else {
    const obs = new MutationObserver(() => {
      if (document.body.classList.contains("launched")) { obs.disconnect(); start(); }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    /* 인트로 스크립트가 죽어도 제목은 반드시 나온다. */
    setTimeout(() => { obs.disconnect(); start(); }, 6000);
  }

  return { timeline: tl, revert: () => units.forEach((u) => u.split.revert()) };
}
