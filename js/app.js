import { CONFIG } from "./config.js";
import { copy } from "./copy.js";
import { JOBS, isJob } from "./shared/jobs.js";
import { applyVisibility } from "./shared/visibility.js";
import { h, fill, rich, clear, reducedMotion } from "./lib/dom.js";
import { feeVars, sol, tokens, compact, grouped, shortAddr, solscanTx, solscanAccount, solscanToken, timeAgo, duration } from "./lib/format.js";
import { loadLog, totals, api, mintInfo, largestHolders, recentTxs, dexPair, EMPTY_LOG } from "./lib/data.js";
import { solve } from "./lib/pow.js";
import { writeQuickDraft } from "./lib/draft.js";
import { exampleCards } from "./ui/examples.js";
import { createHero, punchClock } from "./ui/hero.js";
import { timeCard, jobMark } from "./ui/card.js";
import { createRollSim } from "./ui/rollsim.js";
import { downloadLink } from "./ui/share.js";
import { onView, takeIntro } from "./ui/motion.js";
import { createMarket } from "./ui/market.js";
import { initFx } from "./ui/fx.js";
import { createShiftBadge, recordPunch } from "./ui/shift.js";
import { createCardToy } from "./ui/cardtoy.js";
import { createPunchGame } from "./ui/punchgame.js";
import { createPayslip } from "./ui/payslip.js";
import { jobScene } from "./ui/scenes.js";

const IDEA_KEY = "job.idea";
const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
};

// Spec vs shipped. Each status must match what was verified (see README "Verified vs not yet").
const PROOF_STATUS = ["building", "building", "building", "building", "building", "notBuilt", "building"];

const FEES = feeVars();
const state = { log: EMPTY_LOG, logOk: true, seen: new Set(), timers: [] };
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

// ---------- shared bits ----------
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (toastEl.hidden = true), 2600);
}

async function copyText(text, msg = copy.toasts.copied) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast(text);
  }
}

const jobName = (job) => copy.jobs[job]?.name ?? job;
const route = (path) => `#/${path}`;
const ext = (href, ...children) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...children);

function countUp(el, target, format, from = 0) {
  if (reducedMotion() || target === from) {
    el.textContent = format(target);
    return;
  }
  const start = performance.now();
  const ms = 900;
  const step = (t) => {
    const k = Math.min(1, (t - start) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (target - from) * eased);
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = format(target);
  };
  requestAnimationFrame(step);
}

function counterValue(coin) {
  const c = coin.counters ?? {};
  if (coin.job === "cleaner") return { label: copy.jobs.cleaner.counter, text: `${tokens(c.burnedRaw, coin.decimals)} ${coin.ticker}` };
  if (coin.job === "payroll") return { label: copy.jobs.payroll.counter, text: `${sol(c.paidLamports)} SOL` };
  return { label: copy.jobs.builder.counter, text: `${sol(c.addedLamports ?? 0)} SOL` };
}

// The job badge: the visual identity, used in lists and on the coin page.
// Card numbers follow launch order, so a coin's number never changes.
function cardNo(coin) {
  const order = [...state.log.coins].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
  return order.findIndex((c) => c.mint === coin.mint) + 1 || order.length + 1;
}

function badge(coin, { large = false, link = true } = {}) {
  return timeCard(coin, counterValue(coin), { no: cardNo(coin), large, href: link ? route(`coin/${coin.mint}`) : undefined });
}

// Copy marks one word with *...*; on this site that word is pressed on like a rubber stamp.
function stamped(str) {
  return rich(str).map((n) => (n instanceof Node && n.tagName === "EM" ? h("span", { class: "ink-word" }, n.textContent) : n));
}

function section(id, heading, ...children) {
  return h("section", { id, class: "section", "aria-labelledby": `${id}-h` }, h("h2", { id: `${id}-h` }, ...rich(heading, FEES)), ...children);
}

function notice(text, kind = "info") {
  return h("p", { class: `notice notice-${kind}`, role: kind === "error" ? "alert" : "status" }, text);
}

// No coins yet: an open slot to fill, next to stamped example cards.
function emptyCoins() {
  return h("div", { class: "empty-rack" },
    h("div", { class: "card-grid" },
      h("a", { class: "tcard-slot", href: route("launch") },
        h("span", { class: "tcard-hole", "aria-hidden": "true" }),
        h("span", { class: "slot-title" }, copy.coins.examples.slot),
        h("span", { class: "slot-text" }, copy.coins.empty),
        h("span", { class: "btn" }, copy.coins.emptyButton)),
      ...exampleCards()),
    h("p", { class: "examples-caption" }, copy.coins.examples.caption));
}

function statusLabel(s) {
  return h("span", { class: `status status-${s}` }, copy.proof.status[s]);
}

function unverifiedTag() {
  return CONFIG.FEES_VERIFIED ? null : h("span", { class: "tag" }, copy.how.unverified);
}

// ---------- header / footer ----------
function renderChrome() {
  document.title = copy.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", copy.meta.description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", copy.meta.ogTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", copy.meta.description);
  for (const el of document.querySelectorAll("[data-copy]")) {
    const val = el.dataset.copy.split(".").reduce((o, k) => o?.[k], copy);
    if (typeof val === "string") el.textContent = val;
  }
  const chip = document.getElementById("ca-chip");
  if (CONFIG.CA) {
    chip.textContent = fill(copy.nav.ca, { short: shortAddr(CONFIG.CA) });
    chip.title = CONFIG.CA;
    chip.onclick = () => copyText(CONFIG.CA);
  } else {
    chip.textContent = copy.nav.caSoon;
    chip.disabled = true;
  }
  for (const [id, key] of [["link-x", "X_URL"], ["nav-x", "X_URL"], ["link-tg", "TG_URL"], ["link-code", "REPO_URL"]]) {
    const a = document.getElementById(id);
    if (a && CONFIG[key]) a.href = CONFIG[key];
  }
  applyVisibility(document, CONFIG);
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("nav");
  toggle.onclick = () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  };
  nav.onclick = (e) => {
    if (e.target.closest("a")) {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
    }
  };
}

function markNav(key) {
  for (const a of document.querySelectorAll("#nav a")) {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

// ---------- home ----------
function counterItems() {
  const t = totals(state.log);
  return [
    [copy.hero.counters.coins, t.coins, (v) => grouped(Math.round(v))],
    [copy.hero.counters.work, Number(sol(t.workLamports, 9)), (v) => compact(v)],
    [copy.hero.counters.burned, t.burned, (v) => compact(v)],
    [copy.hero.counters.paid, Number(sol(t.paidLamports, 9)), (v) => compact(v)],
  ];
}

function heroCounters() {
  const wrap = h("dl", { class: "board" });
  state.counters = [];
  for (const [label, value, fmt] of counterItems()) {
    const dd = h("dd", { class: "dot board-num" }, "0");
    wrap.append(h("div", { class: "board-cell" }, h("dt", {}, label), dd));
    countUp(dd, value, fmt);
    state.counters.push({ dd, value });
  }
  return wrap;
}

// When the log refreshes on the home page, counters count from their old value to the new one.
function updateCounters() {
  if (!state.counters?.length || !state.counters[0].dd.isConnected) return;
  counterItems().forEach(([, value, fmt], i) => {
    const c = state.counters[i];
    if (value === c.value) return;
    countUp(c.dd, value, fmt, c.value);
    c.dd.parentElement.classList.remove("bump");
    void c.dd.offsetWidth;
    c.dd.parentElement.classList.add("bump");
    c.value = value;
  });
}


// The rack: one card per job hanging from a rail.
function jobCards() {
  return onView(h("div", { class: "rack" },
    h("div", { class: "rack-rail", "aria-hidden": "true" }),
    h("div", { class: "rack-cards" }, JOBS.map((job) =>
      h("article", { class: `tcard tcard-explain tcard-${job}` },
        h("div", { class: "tcard-head" }, h("span", { class: "tcard-hole", "aria-hidden": "true" }), jobMark(job)),
        jobScene(job),
        h("h3", { class: "tcard-jobname" }, copy.jobs[job].name),
        h("p", { class: "tcard-line" }, copy.jobs[job].line),
        h("p", { class: "tcard-detail" }, copy.jobs[job].detail),
        h("div", { class: "tcard-total" }, h("span", { class: "tcard-label" }, copy.jobs[job].counter)))))));
}

// Payslip stub: where the fee goes, one line per recipient, amounts right-aligned.
function feeBox() {
  return h("aside", { class: "stub", "aria-labelledby": "fee-h" },
    h("h3", { id: "fee-h" }, fill(copy.how.feeHeading, FEES), unverifiedTag()),
    h("ul", {}, copy.how.feeLines.map((l) => {
      const [amount, ...rest] = fill(l, FEES).split(" → ");
      return h("li", {}, h("span", {}, rest.join(" → ")), h("span", { class: "dot" }, amount));
    })),
    h("p", { class: "stub-note" }, fill(copy.how.feeNote, FEES)));
}

function proofTable() {
  return h("table", { class: "table proof" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, copy.proof.columns.claim), h("th", { scope: "col" }, copy.proof.columns.status))),
    h("tbody", {}, copy.proof.rows.map((r, i) =>
      h("tr", {}, h("td", { "data-label": copy.proof.columns.claim }, fill(r, FEES)), h("td", { "data-label": copy.proof.columns.status }, statusLabel(PROOF_STATUS[i]))))));
}

function faqList() {
  const items = copy.faq.items.filter((it) => !it.mainnetOnly || CONFIG.NETWORK === "mainnet");
  return h("div", { class: "faq" }, items.map((it) =>
    h("details", {}, h("summary", {}, it.q), h("p", {}, it.a))));
}

function renderHome() {
  markNav("home");
  const hero = createHero({
    timers: state.timers,
    nextNo: state.log.coins.length + 1,
    onGo: (idea) => {
      if (idea.length >= 3) session.set(IDEA_KEY, idea);
      recordPunch(0);
      location.hash = route("launch");
    },
  });
  const latest = [...state.log.coins].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6);
  clear(app).append(
    h("section", { id: "hero", class: `hero${takeIntro() ? " intro" : ""}`, "aria-labelledby": "hero-h" },
      h("div", { class: "hero-grid" },
        h("div", { class: "hero-copy" },
          h("h1", { id: "hero-h" }, ...stamped(copy.hero.h1)),
          h("p", { class: "lede" }, fill(copy.hero.sub, FEES)),
          hero.form,
          h("p", { class: "hero-hint" }, copy.hero.hint, " ", h("a", { href: "#jobs" }, copy.hero.secondary))),
        hero.machine),
      heroCounters(),
      h("p", { class: "board-note" }, copy.hero.footnote),
      state.logOk ? null : notice(copy.errors.log_unavailable, "error"),
      state.log.halted ? notice(fill(copy.errors.halted, { reason: state.log.halted.reason }), "error") : null,
    ),
    createMarket({ timers: state.timers }),
    section("card", copy.fx.card.heading, h("p", { class: "lede" }, copy.fx.card.lede), createCardToy()),
    section("punch", copy.fx.punch.heading, h("p", { class: "lede" }, copy.fx.punch.lede), createPunchGame()),
    section("jobs", copy.jobs.heading, h("p", { class: "lede" }, copy.jobs.lede), jobCards(), h("p", { class: "muted small" }, copy.jobs.footnote)),
    section("how", copy.how.heading,
      h("ol", { class: "steps grid-3" }, copy.how.steps.map((s, i) =>
        h("li", {}, h("span", { class: "step-n mono" }, String(i + 1).padStart(2, "0")), h("h3", {}, s.title), h("p", { class: "muted" }, fill(s.body, FEES))))),
      feeBox(),
      h("h3", { class: "slip-h" }, copy.fx.slip.heading), h("p", { class: "muted" }, copy.fx.slip.lede), createPayslip()),
    section("roll-call", copy.rollCall.heading,
      h("p", { class: "lede" }, copy.rollCall.lede),
      h("ol", { class: "rc-steps" }, copy.rollCall.steps.map((s) => h("li", {}, s))),
      createRollSim(),
      h("p", {}, copy.rollCall.verify),
      h("p", { class: "muted" }, copy.rollCall.honesty)),
    section("coins", copy.coins.heading, latest.length ? onView(h("div", { class: "card-grid deal" }, latest.map((c) => badge(c)))) : emptyCoins()),
    section("proof", copy.proof.heading, h("p", { class: "lede" }, copy.proof.lede), proofTable()),
    section("faq", copy.faq.heading, faqList()),
    h("section", { class: "closing section" },
      h("h2", {}, ...stamped(copy.closing.h2)),
      h("p", { class: "lede" }, copy.closing.sub),
      h("a", { class: "btn", href: route("launch") }, copy.closing.button)),
  );
}

// ---------- launch ----------
function renderLaunch() {
  markNav("launch");
  const wrap = h("div", { class: "page narrow" }, h("h1", {}, copy.launch.heading));
  clear(app).append(wrap);
  if (!CONFIG.API_URL) wrap.append(h("p", { class: "soon-tag" }, copy.launch.openingSoon));
  const aiPane = h("div", { id: "pane-ai", role: "tabpanel" });
  if (CONFIG.WALLET_LAUNCH) {
    const walletPane = walletLaunchPane();
    walletPane.hidden = true;
    const tabs = h("div", { class: "tabs", role: "tablist" });
    const mk = (label, pane, other) => {
      const b = h("button", { role: "tab", type: "button", "aria-selected": pane === aiPane ? "true" : "false", onclick: () => {
        pane.hidden = false; other.hidden = true;
        for (const t of tabs.children) t.setAttribute("aria-selected", String(t === b));
      } }, label);
      return b;
    };
    tabs.append(mk(copy.launch.tabs.ai, aiPane, walletPane), mk(copy.launch.tabs.wallet, walletPane, aiPane));
    wrap.append(tabs, aiPane, walletPane);
  } else wrap.append(aiPane);
  aiLaunchPane(aiPane);
}

function aiLaunchPane(pane) {
  const status = h("div", { class: "launch-status", "aria-live": "polite" });
  const result = h("div", {});
  const input = h("textarea", { id: "idea", rows: 4, maxlength: 1000, placeholder: copy.launch.placeholder, required: true });
  const btn = h("button", { class: "btn", type: "submit" }, copy.launch.button);
  const form = h("form", { class: "launch-form" },
    h("label", { for: "idea" }, copy.launch.boxLabel), input,
    h("div", { class: "actions" }, btn), h("p", { class: "muted small" }, copy.hero.hint),
    CONFIG.API_URL ? null : h("p", { class: "muted small" }, copy.launch.freeAi));
  let busy = false;
  let drafts = 0;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || input.value.trim().length < 3) return;
    busy = true;
    btn.disabled = true;
    btn.textContent = copy.launch.loading;
    clear(status);
    clear(result);
    try {
      let draft;
      if (CONFIG.API_URL) {
        const { challenge, bits } = await api.pow();
        const nonce = await solve(challenge, bits);
        draft = await api.generate({ idea: input.value, pow: { challenge, nonce } });
      } else {
        const taken = new Set(state.log.coins.map((c) => c.ticker.toUpperCase()));
        await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 700)); // a beat, so the result reads as new
        draft = writeQuickDraft(input.value.trim(), { tickerTaken: (t) => taken.has(t.toUpperCase()), variant: drafts++ });
      }
      result.append(resultCard(draft, () => { input.focus(); input.select(); }));
      btn.textContent = copy.launch.again;
    } catch (err) {
      status.append(notice(copy.errors[err.code] ?? (err.status ? copy.errors.generate_failed : copy.errors.api_down), "error"));
      btn.textContent = copy.launch.button;
    }
    busy = false;
    btn.disabled = false;
  });
  pane.append(form, status, result);
  const idea = session.get(IDEA_KEY);
  if (idea) {
    session.del(IDEA_KEY);
    input.value = idea;
    queueMicrotask(() => form.requestSubmit());
  } else queueMicrotask(() => input.focus());
}

function resultCard(draft, writeAnother) {
  let chosen = isJob(draft.job) ? draft.job : null;
  const reviewJob = h("span", {}, chosen ? jobName(chosen) : "—");
  const errBox = h("div", { "aria-live": "assertive" });
  const img = h("img", { class: "result-img", src: draft.imageUrl, alt: draft.name, width: 256, height: 256 });
  const fallback = h("div", { class: "result-img typo", "aria-hidden": "true", hidden: true }, `$${draft.ticker}`);
  img.addEventListener("error", () => { img.hidden = true; fallback.hidden = false; });
  // A blank (unstamped) time card for the draft; it follows the job switcher.
  const cardSlot = h("div", { class: "result-card" });
  const drawCard = () => {
    clear(cardSlot).append(timeCard(
      { name: draft.name, ticker: draft.ticker, job: chosen ?? draft.job, image: null },
      { label: copy.jobs[chosen ?? draft.job].counter, text: "0" },
      { no: state.log.coins.length + 1, stamp: false }));
  };
  drawCard();

  const picker = h("fieldset", { class: "picker" }, h("legend", {}, copy.launch.switcher),
    JOBS.map((job) => {
      const id = `job-${job}`;
      const radio = h("input", { type: "radio", name: "job", id, value: job, checked: job === chosen, onchange: () => {
        chosen = job;
        reviewJob.textContent = jobName(job);
        drawCard();
        clear(errBox);
      } });
      return h("div", { class: `pick pick-${job}` }, radio,
        h("label", { for: id }, h("span", { class: "pick-name" }, copy.jobs[job].name), h("span", { class: "muted small" }, copy.jobs[job].line)));
    }));

  const launchBtn = h("button", { class: "btn", type: "button" }, copy.launch.launch);
  const card = h("article", { class: "result" },
    h("div", { class: "result-grid" },
      h("div", { class: "result-visual" }, cardSlot, draft.imageUrl ? [img, fallback] : null),
      h("dl", { class: "facts" },
        h("dt", {}, copy.launch.labels.name), h("dd", {}, draft.name),
        h("dt", {}, copy.launch.labels.ticker), h("dd", { class: "mono" }, `$${draft.ticker}`),
        h("dt", {}, copy.launch.labels.description), h("dd", {}, draft.description),
        h("dt", {}, copy.launch.labels.job), h("dd", {}, jobName(draft.job)),
        h("dt", {}, copy.launch.labels.why), h("dd", { class: "muted" }, draft.jobReason))),
    picker,
    h("section", { class: "review", "aria-labelledby": "review-h" },
      h("h3", { id: "review-h" }, copy.launch.reviewHeading),
      h("ul", { class: "mono" }, copy.launch.review.map((line) =>
        line.includes("{job}") ? h("li", {}, line.split("{job}")[0], reviewJob)
          : h("li", {}, fill(line, FEES), line.includes("{jobFee}") ? [" ", unverifiedTag()] : null))),
      CONFIG.LAUNCH_COST_TEXT ? h("p", { class: "muted small" }, fill(copy.launch.cost, { cost: CONFIG.LAUNCH_COST_TEXT })) : null),
    errBox,
    h("div", { class: "actions" }, launchBtn));

  launchBtn.onclick = async () => {
    clear(errBox);
    if (!isJob(chosen)) {
      errBox.append(notice(copy.errors.no_job, "error"));
      return;
    }
    if (!CONFIG.API_URL) {
      const coin = { name: draft.name, ticker: draft.ticker, job: chosen, image: null };
      errBox.append(h("div", { class: "sign", role: "status" },
        h("span", { class: "sign-pin", "aria-hidden": "true" }),
        h("p", { class: "sign-text" }, copy.launch.notYet),
        h("div", { class: "actions" },
          downloadLink(coin, { label: copy.jobs[chosen].counter, text: "0" }, copy.launch.download, state.log.coins.length + 1),
          h("button", { class: "btn btn-ink", type: "button", onclick: () => writeAnother?.() }, copy.launch.another))));
      return;
    }
    launchBtn.disabled = true;
    launchBtn.textContent = copy.launch.launching;
    for (const r of picker.querySelectorAll("input")) r.disabled = true;
    try {
      const res = await api.launch({ draftId: draft.draftId, job: chosen });
      card.replaceWith(successCard(res));
      toast(copy.toasts.launched);
      setTimeout(() => toast(copy.toasts.locked), 2800);
    } catch (err) {
      errBox.append(notice(copy.errors[err.code] ?? copy.errors.launch_failed, "error"));
      launchBtn.disabled = false;
      launchBtn.textContent = copy.launch.launch;
      for (const r of picker.querySelectorAll("input")) r.disabled = false;
    }
  };
  return card;
}

function successCard({ coin, ownerKey, tx }) {
  const keyBox = h("section", { class: "ownerkey", "aria-labelledby": "ok-h" },
    h("h3", { id: "ok-h" }, copy.launch.ownerKey.heading),
    h("p", { class: "warn" }, copy.launch.ownerKey.once),
    h("code", { class: "mono key" }, ownerKey),
    h("p", { class: "muted small" }, copy.launch.ownerKey.scope));
  const actions = h("div", { class: "actions" },
    h("button", { class: "btn", type: "button", onclick: () => copyText(ownerKey, copy.toasts.ownerCopied) }, copy.launch.ownerKey.copy),
    h("button", { class: "btn btn-ghost", type: "button", onclick: () => { keyBox.remove(); actions.remove(); } }, copy.launch.ownerKey.saved));
  // The moment of launch: the badge gets its slot punched and is stamped LOCKED.
  return h("article", { class: "result success" },
    h("h2", {}, copy.launch.successHeading),
    h("div", { class: "stamped" }, badge(coin, { large: true })),
    h("div", { class: "actions" }, downloadLink(coin, counterValue(coin), copy.launch.download, cardNo(coin))),
    keyBox, actions,
    h("ul", { class: "links mono" },
      h("li", {}, h("a", { href: route(`coin/${coin.mint}`) }, `${location.origin}${location.pathname}${route(`coin/${coin.mint}`)}`)),
      h("li", {}, ext(solscanTx(tx), `Solscan: ${shortAddr(tx)}`))));
}

// Own-wallet launch (CONFIG.WALLET_LAUNCH). Wallet connection works; the signed launch is not built yet.
function walletLaunchPane() {
  const out = h("div", { "aria-live": "polite" });
  const pane = h("div", { role: "tabpanel" },
    h("button", { class: "btn", type: "button", onclick: async () => {
      clear(out);
      const provider = window.phantom?.solana ?? window.solflare ?? window.backpack ?? window.solana;
      if (!provider?.connect) return out.append(notice(copy.errors.wallet_not_found, "error"));
      try {
        const r = await provider.connect();
        const pk = (r?.publicKey ?? provider.publicKey)?.toString();
        out.append(h("p", { class: "mono" }, shortAddr(pk)));
      } catch {
        out.append(notice(copy.errors.launch_failed, "error"));
      }
    } }, copy.launch.connect), out);
  return pane;
}

// ---------- coins ----------
function activity(coin) {
  const c = coin.counters ?? {};
  return Number(BigInt(c.workLamports ?? 0) + BigInt(c.claimedLamports ?? 0));
}

function renderCoins(params) {
  markNav("coins");
  const job = isJob(params.get("job")) ? params.get("job") : "all";
  const sort = params.get("sort") === "active" ? "active" : "newest";
  const setQ = (k, v) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    location.hash = `#/coins?${p}`;
  };
  const filters = h("div", { class: "filters", role: "group", "aria-label": copy.coins.heading },
    ["all", ...JOBS].map((j) => h("button", { type: "button", class: "chip", "aria-pressed": String(j === job), onclick: () => setQ("job", j) }, copy.coins.filters[j])));
  const sortSel = h("select", { "aria-label": `${copy.coins.sort.newest} / ${copy.coins.sort.active}`, onchange: (e) => setQ("sort", e.target.value) },
    h("option", { value: "newest", selected: sort === "newest" }, copy.coins.sort.newest),
    h("option", { value: "active", selected: sort === "active" }, copy.coins.sort.active));
  let list = state.log.coins.filter((c) => job === "all" || c.job === job);
  list = list.sort(sort === "active" ? (a, b) => activity(b) - activity(a) : (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  clear(app).append(h("div", { class: "page" },
    h("h1", { id: "coins" }, copy.coins.heading),
    h("div", { class: "toolbar" }, filters, sortSel),
    state.logOk ? null : notice(copy.errors.log_unavailable, "error"),
    list.length ? h("div", { class: "card-grid" }, list.map((c) => badge(c))) : emptyCoins()));
}

// ---------- coin detail ----------
function renderCoin(mint) {
  markNav("coins");
  const coin = state.log.coins.find((c) => c.mint === mint);
  if (!coin) {
    clear(app).append(h("div", { class: "page" }, state.logOk ? notice(copy.coin.notFound) : notice(copy.errors.log_unavailable, "error"),
      h("p", {}, h("a", { href: route("coins") }, copy.coins.heading))));
    return;
  }
  const checking = copy.coin.authority.checking;
  const supplyEl = h("dd", { class: "mono" }, checking);
  const mintEl = h("dd", {}, checking);
  const freezeEl = h("dd", {}, checking);
  const curve = coin.curve ?? {};
  const curveText = curve.migrated ? copy.coin.curveMigrated : typeof curve.progress === "number" ? fill(copy.coin.curveProgress, { n: Math.round(curve.progress * 100) }) : "—";
  const facts = h("dl", { class: "facts facts-grid" },
    h("dt", {}, copy.coin.facts.supply), supplyEl,
    h("dt", {}, copy.coin.facts.mint), mintEl,
    h("dt", {}, copy.coin.facts.freeze), freezeEl,
    h("dt", {}, copy.coin.facts.curve), h("dd", {}, curveText),
    h("dt", {}, copy.coin.facts.holders), h("dd", { class: "mono" }, typeof coin.holders === "number" ? grouped(coin.holders) : "—"));

  const unknown = () => { for (const el of [supplyEl, mintEl, freezeEl]) el.textContent = "—"; };
  mintInfo(coin.mint).then((m) => {
    if (!m) return unknown();
    supplyEl.textContent = tokens(m.supply, m.decimals);
    mintEl.textContent = m.mintAuthority === null ? copy.coin.authority.renounced : copy.coin.authority.not;
    freezeEl.textContent = m.freezeAuthority === null ? copy.coin.authority.renounced : copy.coin.authority.not;
  }).catch(unknown);

  const v = counterValue(coin);
  const payrollBox = coin.job === "payroll" ? payrollExtras(coin) : null;
  const panels = { trades: tradesPanel(coin), holders: holdersPanel(coin), log: logTable(state.log.actions.filter((a) => a.mint === coin.mint)) };
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const panelWrap = h("div", { role: "tabpanel" });
  const show = (key) => {
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.key === key));
    clear(panelWrap).append(panels[key]);
  };
  for (const key of ["trades", "holders", "log"]) tabs.append(h("button", { type: "button", role: "tab", dataset: { key }, onclick: () => show(key) }, copy.coin.tabs[key]));
  show("log");

  clear(app).append(h("div", { class: "page" },
    h("div", { class: "coin-top" },
      badge(coin, { large: true, link: false }),
      h("div", {},
        h("h1", { class: "coin-name" }, coin.name),
        h("p", { class: "coin-jobline" }, ...stamped(fill(copy.coin.jobLine, { job: `*${jobName(coin.job)}*` }))),
        coin.description ? h("p", { class: "muted" }, coin.description) : null,
        h("div", { class: "bigcounter" }, h("span", { class: "dot big" }, v.text), h("span", { class: "muted small" }, v.label)),
        facts,
        h("p", { class: "mono small addr" }, ext(solscanToken(coin.mint), shortAddr(coin.mint)), ext(solscanAccount(coin.jobWallet), fill(copy.coin.jobWallet, { addr: shortAddr(coin.jobWallet) }))),
        h("div", { class: "actions" }, downloadLink(coin, v, copy.coin.download, cardNo(coin))),
        payrollBox)),
    tabs, panelWrap));
}

function payrollExtras(coin) {
  const roundMs = (state.log.roundSeconds ?? CONFIG.ROUND_SECONDS) * 1000;
  const clock = punchClock({ timers: state.timers, label: copy.coin.clockLabel, countdownMs: roundMs });
  const last = [...state.log.rounds].filter((r) => r.mint === coin.mint && r.status === "done").sort((a, b) => b.roundId - a.roundId)[0];
  return h("div", { class: "payroll-box" },
    clock.el,
    last ? h("p", { class: "mono small" }, fill(copy.coin.payroll.last, { slot: last.chosenSlot })) : null,
    last ? h("p", { class: "mono small muted" }, `blockhash ${shortAddr(last.blockhash)}`) : null,
    last ? h("p", { class: "small" }, fill(copy.coin.payroll.paid, { n: last.paidWallets ?? 0 })) : null);
}

function tradesPanel(coin) {
  const box = h("div", { class: "panel" }, h("p", { class: "muted" }, copy.coin.authority.checking));
  Promise.all([dexPair(coin.mint), recentTxs(coin.pool, 20).catch(() => [])]).then(([pair, txs]) => {
    clear(box);
    if (pair) {
      box.append(h("dl", { class: "facts facts-grid" },
        h("dt", {}, copy.coin.trades.price), h("dd", { class: "mono" }, pair.priceUsd ? `$${pair.priceUsd}` : "—"),
        h("dt", {}, copy.coin.trades.volume), h("dd", { class: "mono" }, pair.volume?.h24 != null ? `$${grouped(Math.round(pair.volume.h24))}` : "—"),
        h("dt", {}, copy.coin.trades.txns), h("dd", { class: "mono" }, pair.txns?.h24 ? `${pair.txns.h24.buys} / ${pair.txns.h24.sells}` : "—")),
        h("p", { class: "small" }, ext(pair.url, copy.coin.trades.dex)));
    }
    if (txs.length) {
      box.append(h("ul", { class: "txlist mono small" }, txs.map((t) =>
        h("li", {}, h("span", { class: "muted" }, t.blockTime ? timeAgo(t.blockTime * 1000) : `slot ${t.slot}`), " ", ext(solscanTx(t.signature), shortAddr(t.signature)), t.err ? ` (${copy.coin.trades.failed})` : ""))));
    }
    if (!pair && !txs.length) box.append(h("p", { class: "muted" }, "—"));
  });
  return box;
}

function holdersPanel(coin) {
  const box = h("div", { class: "panel" }, h("p", { class: "muted" }, copy.coin.authority.checking));
  largestHolders(coin.mint).then((list) => {
    clear(box);
    if (!list.length) return box.append(h("p", { class: "muted" }, "—"));
    box.append(h("table", { class: "table" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, copy.coin.holderCols.account), h("th", { scope: "col" }, copy.coin.holderCols.amount))),
      h("tbody", {}, list.map((a) => h("tr", {},
        h("td", { "data-label": copy.coin.holderCols.account, class: "mono" }, ext(solscanAccount(a.address), shortAddr(a.address))),
        h("td", { "data-label": copy.coin.holderCols.amount, class: "mono" }, compact(Number(a.uiAmount ?? 0))))))));
  }).catch(() => { clear(box).append(h("p", { class: "muted" }, "—")); });
  return box;
}

// ---------- log ----------
// The log as receipt tape: the engine prints one entry per transaction, newest on top.
const KIND = { launch: "launched", claim: "claimed fees", buy: "bought", burn: "burned", payout: "paid holders", add_liquidity: "added liquidity" };
function stampTime(iso) {
  const d = new Date(iso);
  const mon = d.toLocaleString("en-US", { month: "short" });
  return `${mon} ${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function logTable(rows) {
  const coinsByMint = new Map(state.log.coins.map((c) => [c.mint, c]));
  const sorted = [...rows].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const cols = copy.log.columns;
  const entries = sorted.map((a, i) => {
    const coin = coinsByMint.get(a.mint);
    const fresh = state.seen.size && !state.seen.has(a.id) && !reducedMotion();
    const pending = a.status && a.status !== "confirmed";
    const amount = a.amount ? `${a.amount} ${a.unit === "SOL" ? "SOL" : a.unit ? "$" + a.unit : ""}` : "";
    return h("li", { class: `tape-row${fresh ? " row-new" : ""}${pending ? " tape-pending" : ""}`, style: `--i:${Math.min(i, 12)}` },
      h("div", { class: "tape-line" },
        h("time", { class: "dot", datetime: a.time, title: `${cols.time}: ${a.time}` }, stampTime(a.time)),
        h("span", { class: "tape-amt dot" }, amount)),
      h("div", { class: "tape-line" },
        h("span", {}, coin ? h("a", { href: route(`coin/${a.mint}`) }, `$${coin.ticker}`) : shortAddr(a.mint), " ", jobName(a.job), " ", KIND[a.kind] ?? a.kind),
        a.tx ? ext(solscanTx(a.tx), shortAddr(a.tx)) : null),
      a.memo ? h("div", { class: "tape-memo mono" }, a.memo) : null,
      pending ? h("div", { class: "tape-status" }, a.status) : null);
  });
  return onView(h("div", { class: "tape" },
    h("div", { class: "tape-head" }, h("span", { class: "dot" }, copy.card.company), h("span", {}, copy.log.heading)),
    entries.length ? h("ol", { class: "tape-list" }, entries) : h("p", { class: "tape-empty" }, copy.log.empty),
    h("p", { class: "tape-foot mono" }, copy.log.note)));
}

function renderLog(params) {
  markNav("log");
  const job = isJob(params.get("job")) ? params.get("job") : "all";
  const mint = params.get("coin") || "";
  const setQ = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    location.hash = `#/log?${p}`;
  };
  const filters = h("div", { class: "filters", role: "group", "aria-label": copy.log.columns.job },
    ["all", ...JOBS].map((j) => h("button", { type: "button", class: "chip", "aria-pressed": String(j === job), onclick: () => setQ("job", j === "all" ? "" : j) }, copy.coins.filters[j])));
  const coinSel = h("select", { "aria-label": copy.log.columns.coin, onchange: (e) => setQ("coin", e.target.value) },
    h("option", { value: "" }, copy.coins.filters.all),
    state.log.coins.map((c) => h("option", { value: c.mint, selected: c.mint === mint }, `$${c.ticker}`)));
  const rows = state.log.actions.filter((a) => (job === "all" || a.job === job) && (!mint || a.mint === mint));
  clear(app).append(h("div", { class: "page" },
    h("h1", { id: "log" }, copy.log.heading),
    h("p", { class: "lede" }, copy.log.lede),
    h("div", { class: "toolbar" }, filters, coinSel),
    state.logOk ? null : notice(copy.errors.log_unavailable, "error"),
    state.log.halted ? notice(fill(copy.errors.halted, { reason: state.log.halted.reason }), "error") : null,
    logTable(rows)));
}

function renderFaq() {
  markNav("faq");
  clear(app).append(h("div", { class: "page narrow" }, h("h1", { id: "faq" }, copy.faq.heading), faqList()));
}

// ---------- router ----------
const HOME_SECTIONS = new Set(["hero", "market", "card", "punch", "jobs", "how", "roll-call", "coins", "proof", "faq"]);

function stopTimers() {
  for (const t of state.timers) clearInterval(t);
  state.timers.length = 0;
}

function render() {
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/")) {
    const id = hash.slice(1);
    if (!document.getElementById("hero")) { stopTimers(); renderHome(); }
    markNav(id === "how" ? "how" : "home");
    if (HOME_SECTIONS.has(id)) document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
    return;
  }
  stopTimers();
  const [path, query = ""] = hash.slice(2).split("?");
  const params = new URLSearchParams(query);
  const [page, arg] = path.split("/");
  if (page === "launch") renderLaunch();
  else if (page === "coins") renderCoins(params);
  else if (page === "coin" && arg) renderCoin(decodeURIComponent(arg));
  else if (page === "log") renderLog(params);
  else if (page === "faq") renderFaq();
  else renderHome();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

async function refresh({ rerender }) {
  const { log, ok } = await loadLog();
  const prevSeen = state.seen;
  state.log = log;
  state.logOk = ok;
  const hash = location.hash || "#/";
  const onLaunch = hash.startsWith("#/launch");
  if (rerender) updateCounters();
  if (rerender && !onLaunch) {
    const changed = log.actions.some((a) => !prevSeen.has(a.id)) || !prevSeen.size;
    if (changed && (hash.startsWith("#/log") || hash.startsWith("#/coin/"))) render();
  }
  state.seen = new Set(log.actions.map((a) => a.id));
}

async function main() {
  renderChrome();
  const sound = initFx();
  const actions = document.querySelector(".header-actions");
  actions.prepend(sound, createShiftBadge({ copyText, toast }));
  await refresh({ rerender: false });
  if (state.log.preview) document.body.append(h("p", { class: "preview-tag", role: "note" }, copy.preview.tag));
  state.seen = new Set(); // first paint: nothing counts as "new"
  render();
  state.seen = new Set(state.log.actions.map((a) => a.id));
  window.addEventListener("hashchange", render);
  setInterval(() => refresh({ rerender: true }), 30_000);
}

main();
