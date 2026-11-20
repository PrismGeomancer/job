// Page-wide effects: a lamp that follows the cursor, a little parallax, magnetic buttons,
// key sounds, floating dust and a sound switch. Everything is skipped with reduced motion.
import { copy } from "../copy.js";
import { h, reducedMotion } from "../lib/dom.js";
import { play, setSound, soundOn } from "./sound.js";

export function initFx() {
  const root = document.documentElement;
  const still = reducedMotion();

  if (!still) {
    document.body.append(h("div", { class: "floor-light", "aria-hidden": "true" }));
    let raf = 0, mx = 0.5, my = 0.3, px = 0, py = 0;
    const apply = () => {
      raf = 0;
      root.style.setProperty("--mx", `${(mx * 100).toFixed(1)}%`);
      root.style.setProperty("--my", `${(my * 100).toFixed(1)}%`);
      root.style.setProperty("--px", px.toFixed(3));
      root.style.setProperty("--py", py.toFixed(3));
    };
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      mx = e.clientX / window.innerWidth;
      my = e.clientY / window.innerHeight;
      px = mx * 2 - 1;
      py = my * 2 - 1;
      raf ||= requestAnimationFrame(apply);
    }, { passive: true });

    // magnetic buttons: they lean toward the pointer
    document.addEventListener("pointermove", (e) => {
      const b = e.target.closest?.(".btn");
      if (!b || e.pointerType === "touch") return;
      const r = b.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      b.style.translate = `${(dx * 8).toFixed(1)}px ${(dy * 6).toFixed(1)}px`;
    }, { passive: true });
    document.addEventListener("pointerout", (e) => {
      const b = e.target.closest?.(".btn");
      if (b) b.style.translate = "";
    });

    // scroll depth for the hero and the footer wordmark
    let sraf = 0;
    window.addEventListener("scroll", () => {
      sraf ||= requestAnimationFrame(() => {
        sraf = 0;
        root.style.setProperty("--scroll", String(Math.round(window.scrollY)));
      });
    }, { passive: true });
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".btn, .chip, .jobbox, .swatch")) play("key");
  });

  const snd = h("button", { class: "chip sound-btn", type: "button", "aria-pressed": String(soundOn()) });
  const label = () => { snd.textContent = soundOn() ? copy.fx.sound.on : copy.fx.sound.off; snd.setAttribute("aria-pressed", String(soundOn())); };
  snd.onclick = () => { setSound(!soundOn()); label(); play("ding"); };
  label();
  return snd;
}

// Slow dust in the lamp light. It stops by itself once its canvas leaves the page.
export function dust(parent) {
  if (reducedMotion()) return null;
  const canvas = h("canvas", { class: "dust", "aria-hidden": "true" });
  parent.append(canvas);
  const ctx = canvas.getContext("2d");
  const specks = Array.from({ length: 38 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, s: 0.02 + Math.random() * 0.05, a: 0.1 + Math.random() * 0.35, p: Math.random() * 6.28 }));
  let last = performance.now();
  const frame = (now) => {
    if (!canvas.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const w = canvas.clientWidth, hgt = canvas.clientHeight, ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(hgt * ratio); }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    if (!document.hidden) {
      for (const s of specks) {
        s.y -= s.s * dt; s.p += dt * 0.6; s.x += Math.sin(s.p) * 0.01 * dt;
        if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
        ctx.globalAlpha = s.a * (0.6 + Math.sin(s.p * 2) * 0.4);
        ctx.fillStyle = "#f3e7bd";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * hgt, s.r, 0, 6.283);
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return canvas;
}
