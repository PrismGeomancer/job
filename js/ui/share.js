// "Download badge": the coin's time card as a 1200x675 PNG (X's card size).
import { copy } from "../copy.js";
import { JOBS } from "../shared/jobs.js";

const W = 1200, H = 675;
const C = { bg: "#000000", card: "#E4D3A6", cardLine: "rgba(42,33,18,0.28)", ink: "#2A2112", inkSoft: "rgba(42,33,18,0.62)", red: "#C3352A", fg: "#FFFFFF" };
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const SANS = "Archivo, system-ui, sans-serif";
const DOT = 'Doto, "JetBrains Mono", monospace';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, maxWidth, size, weight, family) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 18);
  return s;
}

export async function badgePng(coin, counter, no = null) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // the time card
  const x = 110, y = 70, w = 520, h = 540;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = C.card;
  ctx.fill();
  roundRect(ctx, x + w / 2 - 40, y + 22, 80, 14, 7); // punch hole
  ctx.fillStyle = C.bg;
  ctx.fill();

  const left = x + 40, right = x + w - 40;
  ctx.fillStyle = C.ink;
  ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillText(copy.card.company, left, y + 80);
  if (no) {
    ctx.font = `800 22px ${DOT}`;
    ctx.textAlign = "right";
    ctx.fillText(copy.card.no.replace("{n}", String(no).padStart(4, "0")), right, y + 80);
    ctx.textAlign = "left";
  }
  const rule = (yy) => { ctx.fillStyle = C.cardLine; ctx.fillRect(left, yy, right - left, 2); };
  const label = (t, yy) => { ctx.fillStyle = C.inkSoft; ctx.font = `500 18px ${SANS}`; ctx.fillText(t, left, yy); };
  rule(y + 100);
  label(copy.card.name, y + 140);
  ctx.fillStyle = C.ink;
  fit(ctx, coin.name, right - left - 110, 52, 800, DISPLAY);
  ctx.fillText(coin.name, left + 110, y + 146);
  rule(y + 170);
  label(copy.card.ticker, y + 208);
  ctx.fillStyle = C.ink;
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(`$${coin.ticker}`, left + 110, y + 210);
  rule(y + 236);

  // job boxes, the coin's job ticked in red ink
  let bx = left;
  for (const j of JOBS) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx, y + 262, 26, 26);
    if (j === coin.job) {
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bx + 4, y + 276);
      ctx.lineTo(bx + 11, y + 285);
      ctx.lineTo(bx + 28, y + 258);
      ctx.stroke();
    }
    ctx.fillStyle = j === coin.job ? C.ink : C.inkSoft;
    ctx.font = `${j === coin.job ? 700 : 500} 24px ${SANS}`;
    ctx.fillText(copy.jobs[j].name, bx + 36, y + 284);
    bx += 36 + ctx.measureText(copy.jobs[j].name).width + 30;
  }
  rule(y + 316);

  label(counter.label, y + 360);
  ctx.fillStyle = C.ink;
  fit(ctx, counter.text, right - left, 58, 800, DOT);
  ctx.fillText(counter.text, left, y + 430);

  // the stamp
  ctx.save();
  ctx.translate(x + w - 150, y + 470);
  ctx.rotate(-0.16);
  ctx.strokeStyle = C.red;
  ctx.fillStyle = C.red;
  ctx.lineWidth = 5;
  roundRect(ctx, -110, -38, 220, 70, 6);
  ctx.stroke();
  ctx.font = `900 46px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText(copy.launch.stamp, 0, 16);
  ctx.restore();

  // right side: the closing line, its *word* pressed on in red
  const [l1, l2 = ""] = copy.closing.h2.split(/(?<=\.)\s+/);
  const [before, word = "", after = ""] = l2.split("*");
  ctx.fillStyle = C.fg;
  ctx.font = `900 92px ${DISPLAY}`;
  ctx.fillText(l1.replace(/\*/g, "").toUpperCase(), 700, 300);
  ctx.fillText(before.toUpperCase(), 700, 395);
  const bw = ctx.measureText(before.toUpperCase()).width;
  const ww = ctx.measureText(word.toUpperCase()).width;
  ctx.save();
  ctx.translate(700 + bw + 4, 395);
  ctx.rotate(-0.06);
  ctx.fillStyle = C.red;
  ctx.fillText(word.toUpperCase(), 0, 0);
  ctx.restore();
  ctx.fillStyle = C.fg;
  ctx.fillText(after, 700 + bw + ww + 8, 395);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// A plain <a download> link. The PNG is drawn right away, so the link works on the first press.
export function downloadLink(coin, counter, label, no = null) {
  const a = document.createElement("a");
  a.className = "btn btn-ghost";
  a.textContent = label;
  a.download = `${coin.ticker.toLowerCase()}-job-card.png`;
  a.setAttribute("aria-disabled", "true");
  badgePng(coin, counter, no).then((blob) => {
    if (!blob) return a.remove();
    a.href = URL.createObjectURL(blob);
    a.removeAttribute("aria-disabled");
  });
  return a;
}
