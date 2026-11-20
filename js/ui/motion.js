// Small, one-time motion cues. Each runs once when its element first scrolls into view.
// With reduced motion (or no IntersectionObserver) the final state is applied at once.
import { reducedMotion } from "../lib/dom.js";

let observer = null;

export function onView(el, cls = "inview") {
  if (!el) return el;
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    el.classList.add(cls);
    return el;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add(e.target.dataset.viewClass || "inview");
      observer.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
  el.dataset.viewClass = cls;
  observer.observe(el);
  return el;
}

// The home intro plays once per visit, not every time someone comes back to the home page.
let introPlayed = false;
export function takeIntro() {
  if (introPlayed || reducedMotion()) return false;
  introPlayed = true;
  return true;
}
