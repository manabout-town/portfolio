/* 궤도 구간의 카드 단위 스냅. 손으로 짜던 디바운스 + 플래그 + 타임아웃 조합을
   ScrollTrigger 의 snap 으로 옮긴 것이다.

   .pin 은 CSS 로 1090vh 높이에 .stick 자식이 sticky 로 붙어 있다. 여기서 pin 을
   다시 걸지 않는다 — 고정은 이미 CSS 가 하고 있고, ScrollTrigger 까지 pin 을 잡으면
   스페이서가 이중으로 생긴다. 진행률만 읽어 스냅한다.

   start "top top" ~ end "bottom bottom" 구간의 스크롤 거리는
   pin.offsetHeight - innerHeight 와 같다. 기존 손계산과 같은 축이다.

   821px 미만에서는 CSS 가 .pin 높이를 auto 로 풀어 스크롤 구간 자체가 사라지므로
   스냅을 걸지 않는다. 모션 축소 설정에서도 걸지 않는다. */

import { gsap, ScrollTrigger } from "../vendor/gsap.module.min.js";

export function initCardSnap(steps) {
  if (!document.getElementById("pin") || steps < 2) return null;

  gsap.registerPlugin(ScrollTrigger);

  const mm = gsap.matchMedia();
  mm.add("(min-width: 821px) and (prefers-reduced-motion: no-preference)", () => {
    const st = ScrollTrigger.create({
      id: "card-snap",
      trigger: "#pin",
      start: "top top",
      end: "bottom bottom",
      snap: {
        snapTo: 1 / (steps - 1),
        /* 기존 동작과 맞춘다: 멈춘 뒤 170ms 기다렸다가 붙고, 가까우면 짧게 끝낸다. */
        delay: 0.17,
        duration: { min: 0.15, max: 0.5 },
        ease: "power1.inOut",
      },
    });
    return () => st.kill();
  });

  return mm;
}

/* html{scroll-behavior:smooth} 를 걷어냈기 때문에 앵커 이동을 여기서 대신한다.
   그 CSS 를 남겨 두면 ScrollTrigger 가 스냅으로 스크롤 위치를 쓸 때 브라우저가
   같은 이동을 한 번 더 애니메이션해서 서로 싸운다. */
export function initSmoothAnchors() {
  addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollTo({ top: el.getBoundingClientRect().top + scrollY, behavior: reduce ? "auto" : "smooth" });
    history.pushState(null, "", "#" + id);
  });
}
