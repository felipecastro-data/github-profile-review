// GitHub Review app: renders run documents (schema v1, context/schema.md) from /api.
// Layout, glass, scroll motion and particles are ported from the LinkedIn Review app.
// Every field is read defensively so older runs keep rendering when the schema grows.
(function () {
"use strict";

const ICONS = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2.5"/><path d="M5.5 16.5c.8-1.8 2-2.6 3.5-2.6s2.7.8 3.5 2.6M15 9h3M15 13h3"/></svg>',
  projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 12l-2 2 2 2M14 12l2 2-2 2"/></svg>',
  actions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="5" cy="18" r="1.6"/><path d="M10 6h10M10 12h10M10 18h10"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 16l5-5 4 3 6-7"/><path d="M15 7h5v5"/></svg>',
  sources: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h6M8 11h6"/></svg>',
  scrape: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3 19c.8-2.8 2.6-4.2 5-4.2s4.2 1.4 5 4.2M11 19c.8-2.8 2.6-4.2 5-4.2s4.2 1.4 5 4.2"/></svg>',
  merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v5a5 5 0 0 0 5 5h7M18 4v16M14 10l4 4-4 4"/></svg>'
};
const PLUS = '<span class="plus"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 1v10M1 6h10"/></svg></span>';
const TABS = [["overview", "Overview"], ["profile", "Profile"], ["projects", "Projects"], ["actions", "Actions"], ["history", "History"], ["sources", "Sources"]];
const SECTIONS = [["profile", "Profile", "P", "var(--med)"], ["projects", "Projects", "J", "var(--accent)"], ["engineering", "Engineering", "E", "var(--high)"], ["architect", "Architect", "A", "var(--violet)"]];
const ST = { pass: ["good", "Pass", "✓"], partial: ["high", "Partial", "◐"], fail: ["crit", "Fail", "✕"], na: ["", "N/A", "–"] };
const HORIZONS = [["this_week", "This week"], ["this_month", "This month"], ["this_quarter", "This quarter"]];
const RUN_ID_RE = /^r\d{8}-\d{4}$/;

const S = { index: [], runs: {}, runId: null, tab: "overview", target: null, checks: {}, rules: [], filter: "all", loaded: false };
const $ = s => document.querySelector(s);
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const md = v => esc(v).replace(/`([^`]+)`/g, "<code>$1</code>");
const arr = v => (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = v => (typeof v === "number" && isFinite(v) ? v : null);
const fmtN = v => (num(v) === null ? "–" : v.toLocaleString());
const safeUrl = u => (/^https:\/\/[^\s"'<>]+$/i.test(u || "") ? u : null);
const ext = (u, html) => (safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${html}</a>` : html);
const shortRepo = full => String(full || "").split("/").pop();
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const motionOK = !matchMedia("(prefers-reduced-motion: reduce)").matches;
const ruleText = id => (S.rules.find(r => r.id === id) || {}).text || "";
const sectionOf = rule => SECTIONS.find(s => String(rule || "").startsWith(s[2])) || SECTIONS[0];
const scoreColor = v => (v >= 80 ? "var(--good)" : v >= 60 ? "var(--accent)" : v >= 45 ? "var(--high)" : "var(--crit)");
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200); }

// "r20261103-1424" → "Nov 3, 2026 · 14:24" (the id is Bogotá time)
function fmtRun(id, withTime) {
  const m = /^r(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(id || "");
  if (!m) return esc(id);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  return withTime === false ? d : d + " · " + m[4] + ":" + m[5];
}

function run() { return S.runs[S.runId] || null; }
function prevEntry() { const i = S.index.findIndex(e => e.run_id === S.runId); return i >= 0 ? S.index[i + 1] || null : null; }
function checkKey(item) { return /^w\d+$/.test(item.ref || "") ? item.ref : item.id; } // an action that applies a rewrite shares its tick
function isDone(key) { const c = S.checks[S.runId + "__" + key]; return !!(c && c.done); }
function planItems(r) { const a = obj(r.actions); return HORIZONS.flatMap(([k]) => arr(a[k])); }
function progress(r) { const it = planItems(r); return { done: it.filter(i => isDone(checkKey(i))).length, total: it.length }; }
function tabFor(id) {
  const r = run() || {};
  const f = arr(r.findings).find(x => x.id === id) || arr(r.rewrites).find(x => x.id === id);
  return f && String(f.rule || "").startsWith("P") ? "profile" : "projects";
}

function ring(pct, color, size, spin) {
  size = size || 22; const r = (size - 4) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="2.2"/><g class="${spin ? "spin" : ""}"><circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></g></svg>`;
}
function bigRing(v, label) {
  const C = 2 * Math.PI * 52, off = C * (1 - (num(v) || 0) / 100);
  return `<svg viewBox="0 0 120 120" class="bigring" role="img" aria-label="${esc(label)} ${num(v) ?? "–"} of 100"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor(num(v) || 0)}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)" class="val" data-ring="${off.toFixed(1)}" data-c="${C.toFixed(1)}"/><text x="60" y="58" text-anchor="middle" font-size="30" font-weight="600" fill="var(--ink)" font-family="Geist, sans-serif">${num(v) ?? "–"}</text><text x="60" y="78" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="Geist Mono, monospace">OUT OF 100</text></svg>`;
}
function meter(v, color) { const p = Math.max(0, Math.min(100, num(v) || 0)); return `<div class="meter"><i style="width:${p}%;background:${color || "var(--accent)"}"></i></div>`; }
function delta(now, before) {
  if (num(now) === null || num(before) === null) return "";
  const d = now - before;
  return d === 0 ? '<span class="delta flat" title="vs previous run">±0</span>' : `<span class="delta ${d > 0 ? "up" : "down"}" title="vs previous run">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>`;
}
function stChip(st) { const s = ST[st] || ["", esc(st)]; return `<span class="chip ${s[0]}">${s[1]}</span>`; }
function sd(st) { const s = ST[st] || ["", "?", "?"]; return `<span class="sd ${s[0]}" role="img" aria-label="${s[1]}">${s[2]}</span>`; }
function scorePill(v) { return num(v) === null ? "" : `<span class="chip ${v >= 80 ? "good" : v >= 60 ? "acc" : v >= 45 ? "high" : "crit"}">${v}/100</span>`; }
function verdictChip(v) { return v ? `<span class="chip ${v === "keep" ? "good" : v === "improve" ? "high" : v === "replace" ? "crit" : ""}">${esc(v)}</span>` : ""; }
const Q = (n, q, body, extra) => `<section class="glass card qcard" ${extra || ""}><div class="qhead"><span class="qn${String(n).length > 2 ? " wide" : ""}">${esc(n)}</span><span class="eyebrow">${md(q)}</span></div>${body}</section>`;

function smooth(P) {
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/* ---------- nav ---------- */
function isDark() { const a = document.documentElement.getAttribute("data-theme"); return a ? a === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
function renderNav() {
  const sel = S.index.length ? `<label class="runpick"><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Run</span><select id="runSel" aria-label="Choose review run">${S.index.map((x, i) => `<option value="${esc(x.run_id)}" ${x.run_id === S.runId ? "selected" : ""}>${fmtRun(x.run_id, false)}${i === 0 ? " · latest" : ""}</option>`).join("")}</select></label>` : "";
  $("#nav").innerHTML = `<div class="logo" aria-hidden="true">GR</div><span class="brandname">GitHub Review</span>${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>${l}</button>`).join("")}${sel}<button class="themebtn" id="themeBtn" aria-label="Switch to ${isDark() ? "light" : "dark"} mode">${isDark() ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'}</button>`;
  $("#bottombar").innerHTML = TABS.map(([k, l]) => `<button class="tab" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>${ICONS[k]}<span>${l}</span></button>`).join("");
}

/* ---------- overview: scroll story ---------- */
function viewOverview(r) {
  const s = obj(r.scores), sec = obj(s.sections), prev = prevEntry(), ps = obj((prev || {}).sections), sn = obj(r.snapshot);
  const F = arr(r.findings), b = obj(r.benchmark), pr = progress(r);
  const nFail = F.filter(f => f.status === "fail").length;
  const examples = Object.values(obj(b.by_rule)).reduce((n, x) => n + arr(x).length, 0);
  const stages = [
    ["scrape", "Profile collected", `${fmtN(sn.in_scope_repos)} repos in scope · ${fmtN(sn.public_repos)} public`, 1, "var(--accent)"],
    ["compass", "North-star benchmark", `${arr(b.profiles).length} profiles · ${examples} examples`, 1, "var(--accent)"],
    ["user", "Four reviewers", `${F.length} findings · ${nFail} failing`, 1, "var(--accent)"],
    ["merge", "Action plan", `${pr.done} of ${pr.total} done`, pr.total ? pr.done / pr.total : 0, "var(--ink)"]
  ];
  const impactRank = { high: 0, medium: 1, low: 2 };
  const top = F.filter(f => f.status === "fail" || f.status === "partial")
    .sort((a, c) => (a.status === c.status ? 0 : a.status === "fail" ? -1 : 1) || (impactRank[a.impact] ?? 3) - (impactRank[c.impact] ?? 3)).slice(0, 4);
  const week = arr(obj(r.actions).this_week);
  const changes = arr(r.changes_since_last);
  const repos = arr(r.repos);
  const ratio = k => (num(sn[k]) === null ? "–" : `${sn[k]}<span style="font-size:.8rem;color:var(--muted)">/${fmtN(sn.in_scope_repos)}</span>`);
  return `
  <section class="scene-hero">
    <div class="hero-sticky" data-exit>
      <span class="eyebrow">Review · ${fmtRun(r.run_id)}</span>
      <h1 class="hero-title"><span class="tone">GitHub score</span>${num(s.overall) ?? "–"} out of 100</h1>
      <p class="hero-sub">${md(r.summary)}</p>
      <div class="scrollcue"><i></i>Scroll</div>
    </div>
  </section>

  <div class="over">
    <div class="pills">${stages.map(st => `<div class="pill glass" data-rv><span class="ic">${ICONS[st[0]]}</span><span class="tx"><b>${st[1]}</b><span>${st[2]}</span></span>${ring(st[3], st[4], 22, st[3] < 1)}</div>`).join("")}</div>
    <section class="glass dash" data-rv>
      <div>
        <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0"><span class="eyebrow">Overall score · ${S.index.length} run${S.index.length === 1 ? "" : "s"}</span><div class="big" style="margin-top:6px"><span class="n" data-count="${num(s.overall) || 0}">${num(s.overall) ?? "–"}</span><span class="u">/ 100</span>${delta(num(s.overall), num((prev || {}).overall))}</div></div>
          <div class="seg" aria-hidden="true"><span class="on">Overall</span><span>${fmtRun(r.run_id, false)}</span></div>
        </div>
        <div class="chart" id="trendChart">${trendChart()}</div>
        <div class="stats">
          <div class="stat"><b>${ratio("repos_with_ci")}</b><span>Repos with CI</span></div>
          <div class="stat"><b>${ratio("repos_with_tests")}</b><span>Repos with tests</span></div>
          <div class="stat"><b>${ratio("repos_with_adrs")}</b><span>Repos with ADRs</span></div>
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:baseline;gap:8px"><h3 style="font-size:1rem">Top fixes</h3><button class="link" data-tab="projects" style="margin-left:auto;font-size:.82rem">All ${F.length} findings →</button></div>
        <div class="rows" style="margin-top:6px">${top.map(f => { const sc = sectionOf(f.rule); return `<a class="row" href="#${tabFor(f.id)}:${esc(f.id)}"><span class="dot" style="background:${sc[3]}">${esc(f.rule)}</span><span class="tx">${md(f.fix || f.finding)}<small>${esc(f.repo ? shortRepo(f.repo) : "profile")} · ${esc(f.impact || "")} impact · ${esc(f.effort || "")}</small></span>${stChip(f.status)}</a>`; }).join("") || '<p class="muted">Nothing failing. Nice.</p>'}</div>
      </div>
    </section>

    <section class="scene-h" data-rv><span class="eyebrow">Four sections</span><h2><span class="tone">How each layer</span> of your GitHub scores</h2></section>
    <section class="glass card scorewrap" data-rv>
      ${bigRing(s.overall, "Overall score")}
      <div class="scgrid">${SECTIONS.map(([k, label, letter, color]) => `<div class="scrow"><span>${label}</span><b class="mono">${num(sec[k]) ?? "–"} ${delta(num(sec[k]), num(ps[k]))}</b>${meter(sec[k], color)}<small>${letter === "P" ? "P1–P5 · header and profile README" : letter === "J" ? "J1–J4 · which repos and how they read" : letter === "E" ? "E1–E6 · code, tests, CI, secrets, commits" : "A1–A4 · ADRs, design docs, patterns, IaC"}</small></div>`).join("")}</div>
    </section>

    <section class="scene-h" data-rv><span class="eyebrow">Rules × repos</span><h2><span class="tone">Where you pass,</span> and where you don't</h2></section>
    <section class="glass card" data-rv>${matrix(r)}
      <div class="mxlegend">${Object.keys(ST).map(k => `<span>${sd(k)}${ST[k][1]}</span>`).join("")}<span style="margin-left:auto">${repos.length} repos · tap a dot for the finding</span></div>
    </section>

    <div class="grid2">
      <section class="glass card" data-rv>
        <div class="sec-h"><h2>This week</h2><span class="muted">${week.filter(i => isDone(checkKey(i))).length} of ${week.length} done</span></div>
        <div class="checks">${week.map(checkRow).join("") || '<p class="muted">Nothing scheduled this week.</p>'}</div>
        <button class="link" data-tab="actions" style="margin-top:14px">Full action plan →</button>
      </section>
      <section class="glass card" data-rv>
        <div class="sec-h"><h2>Since last run</h2></div>
        ${changes.length ? `<ul class="since">${changes.map(x => `<li><span>${md(typeof x === "string" ? x : obj(x).text || "")}</span></li>`).join("")}</ul>` : '<p class="muted">First run: nothing to compare yet.</p>'}
      </section>
    </div>
  </div>`;
}

function trendChart() {
  const pts = S.index.slice().reverse().filter(e => num(e.overall) !== null);
  if (pts.length < 2) {
    const r = run(), sec = obj(obj(r && r.scores).sections);
    return `<div style="padding-block:18px;display:flex;flex-direction:column;gap:12px">${SECTIONS.map(([k, label, , color]) => `<div class="scrow"><span>${label}</span><b class="mono">${num(sec[k]) ?? "–"}</b>${meter(sec[k], color)}</div>`).join("")}<p class="muted" style="font-size:.8rem">The trend line appears after your second run.</p></div>`;
  }
  const W = 560, H = 190, L = 8, R = 8, T = 34, B = 26;
  const x = i => L + (W - L - R) * (i / (pts.length - 1)), y = v => T + (H - T - B) * (1 - v / 100);
  const P = pts.map((p, i) => [x(i), y(p.overall)]);
  const d = smooth(P), area = d + ` L${P[P.length - 1][0]},${H - B} L${P[0][0]},${H - B} Z`;
  const cur = Math.max(0, pts.findIndex(p => p.run_id === S.runId));
  S._chart = { pts, P, W, H };
  const step = Math.ceil(pts.length / 5);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall score per run, oldest to newest" id="chartSvg">
    <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75].map(f => `<line x1="${L}" x2="${W - R}" y1="${T + (H - T - B) * f}" y2="${T + (H - T - B) * f}" stroke="var(--line)" stroke-dasharray="2 4"/>`).join("")}
    <path d="${area}" fill="url(#ga)"/>
    <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round" class="draw"/>
    <line id="cx" x1="${P[cur][0]}" x2="${P[cur][0]}" y1="${P[cur][1]}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 3" stroke-width="1"/>
    <circle id="cdot" cx="${P[cur][0]}" cy="${P[cur][1]}" r="5" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>
    ${pts.map((p, i) => (i % step === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}" font-size="10" fill="var(--muted)" font-family="Geist Mono, monospace">${fmtRun(p.run_id, false)}</text>` : "").join("")}
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg><div class="tip${tipSide(P[cur][0] / W)}" id="ctip" style="left:${(P[cur][0] / W * 100).toFixed(2)}%;top:${(P[cur][1] / H * 100).toFixed(2)}%">${pts[cur].overall}<b>${fmtRun(pts[cur].run_id, false)}</b></div>`;
}
function tipSide(f) { return f < 0.15 ? " l" : f > 0.85 ? " r" : ""; }
function chartHover(e) {
  const C = S._chart, svg = document.getElementById("chartSvg"); if (!C || !svg) return;
  const b = svg.getBoundingClientRect(); const xv = (e.clientX - b.left) / b.width * C.W;
  let best = 0; C.P.forEach((p, i) => { if (Math.abs(p[0] - xv) < Math.abs(C.P[best][0] - xv)) best = i; });
  const p = C.P[best], pt = C.pts[best];
  const cx = document.getElementById("cx"), cd = document.getElementById("cdot"), tip = document.getElementById("ctip");
  cx.setAttribute("x1", p[0]); cx.setAttribute("x2", p[0]); cx.setAttribute("y1", p[1]); cd.setAttribute("cx", p[0]); cd.setAttribute("cy", p[1]);
  tip.className = "tip" + tipSide(p[0] / C.W); tip.style.left = (p[0] / C.W * 100) + "%"; tip.style.top = (p[1] / C.H * 100) + "%";
  tip.innerHTML = `${pt.overall}<b>${fmtRun(pt.run_id, false)}</b>`;
}

function matrix(r) {
  const repos = arr(r.repos).map(x => x.full_name);
  const cells = {};
  for (const f of arr(r.findings)) cells[f.rule + "|" + (f.repo || "")] = f;
  const ruleScores = obj(obj(r.scores).rules);
  const rules = S.rules.length ? S.rules
    : [...new Set(arr(r.findings).map(f => f.rule))].map(id => ({ id, level: arr(r.findings).some(f => f.rule === id && f.repo) ? "repo" : "profile", text: "" }));
  const cell = f => f
    ? `<td class="c"><a href="#${tabFor(f.id)}:${esc(f.id)}" title="${esc(f.rule)}${f.repo ? " · " + esc(shortRepo(f.repo)) : ""} · ${(ST[f.status] || ["", esc(f.status)])[1]}">${sd(f.status)}</a></td>`
    : '<td class="c"></td>';
  const body = SECTIONS.map(([, label, letter]) => {
    const rows = rules.filter(x => String(x.id).startsWith(letter)).map(rule => {
      const cols = rule.level === "profile"
        ? cell(cells[rule.id + "|"]) + repos.map(() => '<td class="c"></td>').join("")
        : '<td class="c"></td>' + repos.map(repo => cell(cells[rule.id + "|" + repo])).join("");
      return `<tr><th class="rl" scope="row"><b>${esc(rule.id)}</b><span>${md(rule.text)}</span></th>${cols}<td class="rs">${num(ruleScores[rule.id]) ?? "–"}</td></tr>`;
    }).join("");
    return rows ? `<tr class="sec"><th colspan="${repos.length + 3}"><span class="eyebrow">${label}</span></th></tr>${rows}` : "";
  }).join("");
  return `<div class="mx-wrap"><table class="mx"><thead><tr><th class="rl"><span class="eyebrow">Rule</span></th><th class="v"><span>profile</span></th>${repos.map(x => `<th class="v" title="${esc(x)}"><span>${esc(shortRepo(x))}</span></th>`).join("")}<th class="v"><span>score</span></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ---------- findings, rewrites, briefs ---------- */
function findingTile(f) {
  const ev = arr(f.evidence).map(e => safeUrl(e) ? `<a class="src" href="${esc(e)}" target="_blank" rel="noopener noreferrer">${esc(e.replace(/^https:\/\/(www\.)?/, ""))}</a>` : `<span class="src">${esc(e)}</span>`).join("");
  return `<div class="tile ftile st-${esc(f.status)}" id="i-${esc(f.id)}" data-status="${esc(f.status)}">
    <div class="tile-h">${stChip(f.status)}<b class="mono">${esc(f.rule)}</b><span class="muted rt">${md(ruleText(f.rule))}</span></div>
    <p>${md(f.finding)}</p>
    ${f.fix ? `<p class="fixline"><span class="eyebrow">Fix</span>${md(f.fix)}</p>` : ""}
    <div class="ev">${f.impact ? `<span class="chip ${f.impact === "high" ? "crit" : f.impact === "medium" ? "high" : ""}">${esc(f.impact)} impact</span>` : ""}${f.effort ? `<span class="chip">effort ${esc(f.effort)}</span>` : ""}${ev}</div>
  </div>`;
}

function changeCard(w, open) {
  const done = isDone(w.id);
  return `<details class="item glass" id="i-${esc(w.id)}" ${open && !done ? "open" : ""}><summary>${PLUS}<div class="sum-main"><h3 style="${done ? "color:var(--muted);text-decoration:line-through" : ""}">${esc(w.target || "Rewrite")}</h3><div class="chips"><span class="chip acc">${esc(w.rule)}</span><span class="chip">${esc(w.id)}</span>${done ? '<span class="chip good">Done</span>' : ""}</div></div></summary>
    <div class="item-body"><div class="diff" ${w.before ? "" : 'style="grid-template-columns:minmax(0,1fr)"'}>${w.before ? `<div class="pane before"><div class="pane-h"><span class="eyebrow">Now</span></div>${esc(w.before)}</div>` : ""}
    <div class="pane after"><div class="pane-h"><span class="eyebrow" style="color:var(--accent)">${w.before ? "Replace with" : "Add"}</span><button class="copy" data-copy="${esc(w.id)}">Copy</button></div><span data-text="${esc(w.id)}">${esc(w.after)}</span></div></div>
    <label class="check glass" style="align-self:flex-start;padding:8px 14px 8px 10px;border-radius:999px;box-shadow:none"><input type="checkbox" data-check="${esc(w.id)}" ${done ? "checked" : ""}><span style="font-size:.86rem">Done on GitHub</span></label></div></details>`;
}

function briefCard(b) {
  return `<div class="glass card move brief" id="i-${esc(b.id)}"><div class="chips"><span class="chip acc">Replaces ${esc(shortRepo(b.replaces))}</span>${num(b.effort_weeks) !== null ? `<span class="chip">${b.effort_weeks} weeks</span>` : ""}</div>
    <h3>${esc(b.title)}</h3>${b.problem ? `<p>${md(b.problem)}</p>` : ""}${b.architecture ? `<p class="arch">${esc(b.architecture)}</p>` : ""}
    <dl class="kv" style="grid-template-columns:minmax(0,1fr);font-size:.86rem">${arr(b.stack).length ? `<dt>Stack</dt><dd>${arr(b.stack).map(esc).join(", ")}</dd>` : ""}${b.dataset ? `<dt>Dataset</dt><dd>${md(b.dataset)}</dd>` : ""}${arr(b.patterns).length ? `<dt>Patterns</dt><dd>${arr(b.patterns).map(esc).join(", ")}</dd>` : ""}</dl>
    <div class="chips">${arr(b.rules_covered).map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>`;
}

/* ---------- profile ---------- */
function viewProfile(r) {
  const h = obj(r.header), sec = obj(obj(r.scores).sections), rs = obj(obj(r.scores).rules);
  const F = arr(r.findings).filter(f => String(f.rule).startsWith("P"));
  const W = arr(r.rewrites).filter(w => String(w.rule).startsWith("P"));
  const pass = F.filter(f => f.status === "pass").length;
  const avatar = /^https:\/\/avatars\.githubusercontent\.com\//.test(h.avatar_url || "") ? `<img src="${esc(h.avatar_url)}" alt="" width="64" height="64">` : "";
  const profileUrl = safeUrl(r.profile_url) || "https://github.com/" + encodeURIComponent(r.username || "");
  const status = h.status ? String(h.status).replace(/:[\w+-]+:\s*/g, "") : "";
  const kv = [["Bio", md(h.bio)], ["Company", md(h.company)], ["Location", md(h.location)], ["Website", h.website ? ext(h.website, esc(h.website)) : ""], ["Status", md(status)],
    ["Followers", num(h.followers) === null ? "" : fmtN(h.followers)], ["Social", arr(h.social).map(x => ext(x.url, esc(x.provider || x.url))).join(", ")]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  return `<div class="enter" style="display:flex;flex-direction:column;gap:22px">
  <section class="page-hero"><span class="eyebrow">Profile · P1–P5</span><h1><span class="tone">Profile score</span>${num(sec.profile) ?? "–"}/100</h1><p>${pass} of ${F.length} profile rules pass. The header and profile README are the first thing a recruiter opens.</p></section>
  <div class="grid2">
    <section class="glass card" style="display:flex;flex-direction:column;gap:16px"><div class="who">${avatar}<div><h2>${esc(h.name || r.username)}</h2><span class="muted mono" style="font-size:.8rem">@${esc(r.username)}</span></div><span style="margin-left:auto">${ext(profileUrl, "Open ↗")}</span></div><dl class="kv">${kv}</dl></section>
    <section class="glass card"><div class="sec-h"><h2>Rules</h2><span class="muted">score per rule</span></div>
      ${F.map(f => `<div class="score"><span class="nm">${esc(f.rule)} · ${stChip(f.status)}</span><span class="val">${num(rs[f.rule]) ?? "–"}</span><div class="track"><i style="width:${num(rs[f.rule]) || 0}%;background:${scoreColor(num(rs[f.rule]) || 0)}"></i></div><p class="note">${md(ruleText(f.rule))}</p></div>`).join("") || '<p class="muted">No profile findings in this run.</p>'}
    </section>
  </div>
  <div class="qgrid">${F.map((f, i) => Q(f.rule, ruleText(f.rule), findingTile(f), F.length % 2 && i === F.length - 1 ? 'style="grid-column:1/-1"' : "")).join("")}</div>
  <section><div class="sec-h"><h2>Rewrites</h2><span class="muted">${W.length} paste-ready edits for the profile README and bio.</span></div><div style="display:flex;flex-direction:column;gap:12px">${W.map((w, i) => changeCard(w, i < 2)).join("") || '<p class="muted">No rewrites in this run.</p>'}</div></section>
  </div>`;
}

/* ---------- projects ---------- */
function viewProjects(r) {
  const F = arr(r.findings), pf = obj(r.portfolio), repos = arr(r.repos);
  const verdicts = Object.fromEntries(arr(pf.verdicts).map(v => [v.repo, v]));
  const vOf = x => x.verdict || (verdicts[x.full_name] || {}).verdict;
  const counts = ["keep", "improve", "replace"].map(v => [v, repos.filter(x => vOf(x) === v).length]).filter(([, n]) => n);
  const j1 = F.filter(f => !f.repo && !String(f.rule).startsWith("P"));
  const opt = (v, l) => `<label><input type="radio" name="filter" value="${v}" ${S.filter === v ? "checked" : ""}>${l}</label>`;
  const W = arr(r.rewrites).filter(w => !String(w.rule).startsWith("P"));
  const briefs = arr(pf.replacement_briefs);
  return `<div class="enter" style="display:flex;flex-direction:column;gap:22px">
  <section class="page-hero"><span class="eyebrow">Projects · Engineering · Architect</span><h1><span class="tone">Portfolio</span>${repos.length} flagship repos</h1><p>${counts.map(([v, n]) => `${n} ${v}`).join(" · ") || "No verdicts yet"}. Each repo is judged on J2–J4, E1–E6 and A1–A4.</p></section>
  <div class="qgrid">
    ${Q("J1", ruleText("J1") || "Pin 4–6 flagship repos", `<div class="countcmp"><div><b>${num(pf.current_count) ?? repos.length}</b><span>you have</span></div><div><b>${num(pf.ideal_count) ?? "–"}</b><span>ideal (4–6)</span></div></div>
      <div class="rows">${repos.map(x => `<a class="row" href="#projects:${esc(x.full_name)}"><span class="tx">${esc(shortRepo(x.full_name))}<small>${md((verdicts[x.full_name] || {}).reason || x.description || "")}</small></span>${verdictChip(vOf(x))}</a>`).join("")}</div>
      ${j1.map(findingTile).join("")}`)}
    <section class="glass card"><div class="sec-h"><h2>Repo scores</h2><span class="muted">mean of its repo-level rules</span></div>
      ${repos.map(x => `<div class="score"><span class="nm mono" style="font-size:.84rem">${esc(shortRepo(x.full_name))}</span><span class="val">${num(x.score) ?? "–"}</span><div class="track"><i style="width:${num(x.score) || 0}%;background:${scoreColor(num(x.score) || 0)}"></i></div></div>`).join("")}
    </section>
  </div>
  <section><div class="sec-h"><h2>Repos</h2><span class="muted" style="flex:1">Findings per repo, grouped by layer</span><div class="segf" role="radiogroup" aria-label="Show findings">${opt("all", "All")}${opt("work", "Needs work")}${opt("fail", "Fail only")}</div></div>
    <div class="findings" data-filter="${esc(S.filter)}" style="display:flex;flex-direction:column;gap:12px">${repos.map((x, i) => {
      const fs = F.filter(f => f.repo === x.full_name);
      const nF = fs.filter(f => f.status === "fail").length, nP = fs.filter(f => f.status === "partial").length;
      const groups = SECTIONS.slice(1).map(([, label, letter]) => {
        const g = fs.filter(f => String(f.rule).startsWith(letter));
        return g.length ? `<span class="eyebrow">${label}</span><div class="stack">${g.map(findingTile).join("")}</div>` : "";
      }).join("");
      return `<details class="item glass" id="i-${esc(x.full_name)}" ${i === 0 ? "open" : ""}><summary>${PLUS}<div class="sum-main"><h3 class="mono" style="font-size:.98rem;overflow-wrap:anywhere">${esc(shortRepo(x.full_name))}</h3><div class="chips">${verdictChip(vOf(x))}${scorePill(num(x.score))}${nF ? `<span class="chip crit">${nF} fail</span>` : ""}${nP ? `<span class="chip high">${nP} partial</span>` : ""}</div></div></summary>
        <div class="item-body"><p>${md(x.description || "")} ${ext(x.url, "Open repo ↗")}</p>${groups || '<p class="muted">No findings for this repo.</p>'}</div></details>`;
    }).join("") || '<p class="muted">No in-scope repos in this run.</p>'}</div>
  </section>
  ${W.length ? `<section><div class="sec-h"><h2>README rewrites</h2><span class="muted">Copy straight into the repo.</span></div><div style="display:flex;flex-direction:column;gap:12px">${W.map(w => changeCard(w, false)).join("")}</div></section>` : ""}
  ${briefs.length ? `<section><div class="sec-h"><h2>Replacement projects</h2><span class="muted">Each one replaces a repo, so the portfolio never grows past 6.</span></div><div class="grid2">${briefs.map(briefCard).join("")}</div></section>` : ""}
  </div>`;
}

/* ---------- actions ---------- */
function checkRow(item) {
  const key = checkKey(item), done = isDone(key);
  return `<label class="check glass ${done ? "done" : ""}" style="box-shadow:none"><input type="checkbox" data-check="${esc(key)}" ${done ? "checked" : ""} aria-label="${esc(item.text)}"><span class="t">${md(item.text)}</span>${item.ref ? `<a class="ref" href="#${tabFor(item.ref)}:${esc(item.ref)}">${esc(item.ref)}</a>` : ""}</label>`;
}
function viewActions(r) {
  const a = obj(r.actions), pr = progress(r);
  const group = (t, items) => { const d = items.filter(i => isDone(checkKey(i))).length; return `<section class="glass card"><div class="sec-h"><h2>${t}</h2><span class="muted mono" style="margin-left:auto">${d}/${items.length}</span>${ring(items.length ? d / items.length : 0, "var(--accent)", 24)}</div><div class="checks">${items.map(checkRow).join("") || '<p class="muted">Nothing here.</p>'}</div></section>`; };
  return `<div class="enter" style="display:flex;flex-direction:column;gap:22px">
  <section class="page-hero"><span class="eyebrow">Action plan</span><h1><span class="tone">${pr.done} of ${pr.total}</span>done</h1><div class="bar" style="width:min(420px,100%)"><i style="width:${pr.total ? Math.round(pr.done / pr.total * 100) : 0}%"></i></div><p>Ticks save to this review, so they stay put across your devices.</p></section>
  ${HORIZONS.map(([k, t]) => group(t, arr(a[k]))).join("")}</div>`;
}

/* ---------- history ---------- */
function historyChart() {
  const pts = S.index.slice().reverse();
  if (pts.length < 2) return '<p class="muted" style="padding-block:30px">The trend appears after your second run.</p>';
  // viewBox follows the card width so axis labels stay readable on a phone
  const W = Math.max(340, Math.min(900, ($("#main").clientWidth || 760) - 60)), H = 260, L = 30, R = 12, T = 16, B = 28;
  const x = i => L + (W - L - R) * (i / (pts.length - 1)), y = v => T + (H - T - B) * (1 - v / 100);
  const series = [["overall", "Overall", "var(--ink)", e => e.overall, 2.4], ...SECTIONS.map(([k, label, , color]) => [k, label, color, e => obj(e.sections)[k], 1.6])];
  const step = Math.ceil(pts.length / 6);
  const lines = series.map(([k, label, color, get, w]) => {
    const P = pts.map((e, i) => [x(i), num(get(e))]).filter(p => p[1] !== null).map(([px, v]) => [px, y(v)]);
    if (P.length < 2) return "";
    return `<path d="${smooth(P)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" class="draw"><title>${label}</title></path>${P.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${k === "overall" ? 3.5 : 2.6}" fill="var(--surface)" stroke="${color}" stroke-width="1.6"/>`).join("")}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible" role="img" aria-label="Score per run, overall and per section">
    ${[0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${L - 8}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="Geist Mono, monospace">${v}</text>`).join("")}
    ${pts.map((e, i) => (i % step === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}" font-size="10" fill="var(--muted)" font-family="Geist Mono, monospace">${fmtRun(e.run_id, false)}</text>` : "").join("")}
    ${lines}</svg>
    <div class="legend">${series.map(([, label, color]) => `<span><i class="ln" style="background:${color}"></i>${label}</span>`).join("")}</div>`;
}
function viewHistory() {
  const first = S.index[S.index.length - 1], last = S.index[0];
  const gain = first && last && num(first.overall) !== null && num(last.overall) !== null ? last.overall - first.overall : null;
  return `<div class="enter" style="display:flex;flex-direction:column;gap:22px">
  <section class="page-hero"><span class="eyebrow">History</span><h1><span class="tone">${S.index.length} run${S.index.length === 1 ? "" : "s"}</span>${gain === null || S.index.length < 2 ? "so far" : (gain >= 0 ? "+" : "") + gain + " points"}</h1><p>Every run of <code>/review-github</code> is kept, so you can see each fix move the score.</p></section>
  <section class="glass card" data-rv><div class="sec-h"><h2>Score trend</h2><span class="muted">overall and per section</span></div>${historyChart()}</section>
  <section class="glass card"><div class="sec-h"><h2>Runs</h2><span class="muted">Bogotá time · tap one to open it</span></div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Run</th><th class="n">Overall</th>${SECTIONS.map(([, label, letter]) => `<th class="n" title="${label}"><span class="full">${label}</span><span class="short">${letter}</span></th>`).join("")}</tr></thead><tbody>
    ${S.index.map(e => `<tr class="${e.run_id === S.runId ? "cur" : ""}"><td style="white-space:nowrap"><button class="link" data-run="${esc(e.run_id)}">${fmtRun(e.run_id)}</button></td><td class="n"><b>${num(e.overall) ?? "–"}</b></td>${SECTIONS.map(([k]) => `<td class="n">${num(obj(e.sections)[k]) ?? "–"}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div></section></div>`;
}

/* ---------- sources ---------- */
function viewSources(r) {
  const b = obj(r.benchmark), sources = arr(r.sources), notes = arr(r.notes);
  const src = id => { const s = sources.find(x => x.id === id); return s && safeUrl(s.url) ? `<a class="src key" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(id)}</a>` : `<span class="src">${esc(id || "")}</span>`; };
  const order = S.rules.map(x => x.id);
  const byRule = Object.entries(obj(b.by_rule)).sort(([a], [c]) => order.indexOf(a) - order.indexOf(c));
  const colors = ["var(--med)", "var(--accent)", "var(--high)", "var(--good)"];
  const gh = path => "https://github.com/" + String(path || "").split("/").map(encodeURIComponent).join("/");
  return `<div class="enter" style="display:flex;flex-direction:column;gap:22px">
  <section class="page-hero"><span class="eyebrow">Evidence</span><h1><span class="tone">North stars</span>examples, never criteria</h1><p>How ${arr(b.profiles).map(p => esc(p.username)).join(", ") || "the north-star profiles"} handle each rule. The rules decide the score; these only show what good looks like.</p></section>
  <section class="glass card"><div class="sec-h"><h2>Profiles</h2></div><div class="rows">${arr(b.profiles).map((p, i) => `<div class="row"><span class="dot" style="background:${colors[i % 4]}">${esc(String(p.username || "?").slice(0, 2).toUpperCase())}</span><span class="tx">${ext(gh(p.username), esc(p.username))}<small>${md(p.strength)}</small></span><span class="chips" style="justify-content:flex-end">${arr(p.flagship_repos).map(x => `<a class="src" href="${esc(gh(x))}" target="_blank" rel="noopener noreferrer">${esc(shortRepo(x))}</a>`).join("")}</span></div>`).join("") || '<p class="muted">No benchmark in this run.</p>'}</div></section>
  <section class="glass card"><div class="sec-h"><h2>By rule</h2><span class="muted">What they do, with the source</span></div>
    ${byRule.flatMap(([rule, exs]) => arr(exs).map(x => `<div class="signal"><span class="n">${esc(rule)}</span><div class="b"><p>${md(x.example)}</p><div class="chips">${src(x.source)}</div></div></div>`)).join("") || '<p class="muted">No examples.</p>'}</section>
  <section class="glass card"><div class="sec-h"><h2>${sources.length} sources</h2></div><ul class="sources" style="list-style:none;margin:0;padding:0">${sources.map(s => `<li><span class="pub key">${esc(s.id)}</span><div style="min-width:0;flex:1">${ext(s.url, esc(s.title || s.url))}<div class="muted mono" style="font-size:.72rem;margin-top:2px;overflow-wrap:anywhere">${esc(s.url)}</div></div></li>`).join("")}</ul></section>
  ${notes.length ? `<section class="glass card"><div class="sec-h"><h2>About this run</h2><span class="muted">collector gaps and reviewer conflicts</span></div><ul class="since">${notes.map(n => `<li><span class="muted" style="font-size:.88rem">${md(n)}</span></li>`).join("")}</ul></section>` : ""}</div>`;
}

/* ---------- render ---------- */
const VIEWS = { overview: viewOverview, profile: viewProfile, projects: viewProjects, actions: viewActions, history: viewHistory, sources: viewSources };
function render(soft) {
  renderNav();
  const main = $("#main");
  if (!S.loaded) return;
  if (S.error) { main.innerHTML = S.error; return; }
  const r = run();
  if (!r) { main.innerHTML = `<div class="empty glass"><span class="eyebrow">No reviews yet</span><h2>Run your first review</h2><p>In Claude Code, in the github-profile-review folder, type <code>/review-github</code>. The result appears here.</p></div>`; return; }
  document.title = TABS.find(t => t[0] === S.tab)[1] + " · GitHub Review";
  const y = scrollY, open = [...document.querySelectorAll("details.item[open]")].map(d => d.id);
  try { main.innerHTML = VIEWS[S.tab](r); }
  catch (e) { console.error(e); main.innerHTML = `<div class="empty glass"><span class="eyebrow">Error</span><h2>This run couldn't be shown</h2><p class="muted">${esc(e.message)}</p></div>`; return; }
  if (soft) {
    document.querySelectorAll(".enter").forEach(e => e.classList.remove("enter"));
    document.querySelectorAll("details.item").forEach(d => { d.open = open.includes(d.id); });
    scrollTo(0, y);
    document.querySelectorAll("[data-rv]").forEach(el => { el._grown = true; });
  }
  fitHero(); motion();
  if (S.tab === "overview" && !soft) countUp();
  if (!soft && S.target) focusTarget(S.target);
}
function focusTarget(id) {
  const el = document.getElementById("i-" + id); if (!el) return;
  const d = el.matches("details") ? el : el.closest("details"); if (d) d.open = true;
  const list = el.closest(".findings");
  if (list && getComputedStyle(el).display === "none") { S.filter = "all"; list.dataset.filter = "all"; const r = document.querySelector('input[name="filter"][value="all"]'); if (r) r.checked = true; }
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: "center", behavior: motionOK ? "smooth" : "auto" });
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
  });
}
function countUp() {
  document.querySelectorAll("[data-count]").forEach(el => {
    const to = +el.dataset.count || 0; if (!motionOK || !to) return;
    const t0 = performance.now(), dur = 1200;
    const tick = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1 && el.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

function go(tab, target) {
  S.tab = TABS.some(t => t[0] === tab) ? tab : "overview"; S.target = target || null;
  ls.set("gr.tab", S.tab);
  const h = "#" + S.tab + (S.target ? ":" + S.target : "");
  if (location.hash !== h) history.replaceState(null, "", h);
  render();
  if (!S.target) scrollTo({ top: 0 });
}
function fromHash() { const [tab, target] = decodeURIComponent(location.hash.slice(1)).split(":"); return { tab, target }; }

/* ---------- scroll motion ---------- */
let ticking = false;
function motion() { if (!ticking) { ticking = true; requestAnimationFrame(applyMotion); } }
function fitHero() { const h = document.querySelector(".hero-sticky"); if (!h) return; h.classList.remove("free"); if (h.scrollHeight > innerHeight - 84) h.classList.add("free"); }
function applyMotion() {
  ticking = false; document.documentElement.style.setProperty("--sy", String(scrollY)); if (!motionOK) return;
  const vh = innerHeight;
  const ex = document.querySelector("[data-exit]");
  if (ex) {
    const host = ex.parentElement.getBoundingClientRect(); const q = Math.max(0, Math.min(1, (-host.top) / (vh * 0.55)));
    ex.style.opacity = String(1 - q * 0.95); ex.style.transform = `translateY(${-q * 70}px) scale(${1 - q * 0.05})`; ex.style.filter = q > 0.01 ? `blur(${(q * 10).toFixed(1)}px)` : "none";
  }
  document.querySelectorAll("[data-rv]").forEach(el => {
    if (el.closest("[data-exit]")) return;
    const r = el.getBoundingClientRect(); let p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.32)));
    p = 1 - Math.pow(1 - p, 3);
    el.style.opacity = String(p); el.style.transform = p < 1 ? `translateY(${((1 - p) * 60).toFixed(1)}px) scale(${(0.95 + 0.05 * p).toFixed(4)})` : "none"; el.style.filter = p < 1 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : "none";
    if (p >= 1 && !el._grown) {
      el._grown = true;
      el.querySelectorAll(".meter i, .score .track i").forEach(b => b.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 900, easing: "cubic-bezier(.2,.8,.2,1)" }));
      el.querySelectorAll(".draw").forEach(pth => { const L = pth.getTotalLength(); pth.animate([{ strokeDasharray: L, strokeDashoffset: L }, { strokeDasharray: L, strokeDashoffset: 0 }], { duration: 1400, easing: "cubic-bezier(.4,0,.2,1)" }); });
      el.querySelectorAll("[data-ring]").forEach(c => c.animate([{ strokeDashoffset: c.dataset.c }, { strokeDashoffset: c.dataset.ring }], { duration: 1300, easing: "cubic-bezier(.2,.8,.2,1)" }));
      el.querySelectorAll(".sd").forEach((d, i) => d.animate([{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, delay: Math.min(i * 12, 900), easing: "cubic-bezier(.2,1.4,.4,1)", fill: "backwards" }));
    }
  });
}
addEventListener("scroll", motion, { passive: true }); addEventListener("resize", () => { fitHero(); motion(); });

/* ---------- particles: flow-field filaments (background) ---------- */
(function filaments() {
  const cv = document.getElementById("particles"); const ctx = cv.getContext("2d"); if (!ctx) return;
  let W, H, dpr, ps = [], dark = false, lastY = scrollY, t = 0; const TL = 16;
  function col() { dark = isDark(); }
  function spawn(p) { p.x = Math.random() * W; p.y = Math.random() * H; p.life = 160 + Math.random() * 320; p.age = 0; p.hue = Math.random() < 0.58 ? 0 : 1; p.w = 0.5 + Math.random() * 1; p.tr = []; return p; }
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(420, Math.max(140, W * H / 4200))); ps = Array.from({ length: n }, () => spawn({})); col();
  }
  function field(x, y) { return Math.sin(x * 0.0021 + t * 0.00021) * 1.7 + Math.cos(y * 0.0027 - t * 0.00016) * 1.7 + Math.sin((x - y) * 0.0011 + t * 0.0001) * 1.2; }
  function step(dy) {
    for (const p of ps) {
      const a = field(p.x, p.y); const sp = 0.8 + p.w * 0.6; p.x += Math.cos(a) * sp; p.y += Math.sin(a) * sp;
      for (const q of p.tr) { q[1] -= dy * (0.35 + p.w * 0.3); } p.y -= dy * (0.35 + p.w * 0.3);
      p.tr.push([p.x, p.y]); if (p.tr.length > TL) p.tr.shift(); p.age++; p.life--;
      if (p.life < 0 || p.x < -40 || p.x > W + 40 || p.y < -80 || p.y > H + 80) spawn(p);
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = dark ? "lighter" : "source-over"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const cols = dark ? ["79,209,191", "150,120,255"] : ["14,122,110", "96,78,190"];
    for (const p of ps) {
      const tr = p.tr; if (tr.length < 2) continue; const fadeIn = Math.min(1, p.age / 30), fadeOut = Math.min(1, p.life / 40); const A = (dark ? 0.5 : 0.32) * fadeIn * fadeOut;
      for (let i = 1; i < tr.length; i++) { const k = i / tr.length; ctx.strokeStyle = `rgba(${cols[p.hue]},${(A * k).toFixed(3)})`; ctx.lineWidth = p.w * (0.4 + 0.8 * k); ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke(); }
      ctx.fillStyle = `rgba(${cols[p.hue]},${(A * 1.6).toFixed(3)})`; const h = tr[tr.length - 1]; ctx.fillRect(h[0] - p.w * 0.8, h[1] - p.w * 0.8, p.w * 1.6, p.w * 1.6);
    }
  }
  function frame() { if (!document.hidden) { t += 16; const dy = scrollY - lastY; lastY = scrollY; step(dy); draw(); } requestAnimationFrame(frame); }
  size(); addEventListener("resize", size); window.__retheme = window.__retheme || []; window.__retheme.push(() => { col(); if (!motionOK) draw(); });
  if (motionOK) requestAnimationFrame(frame); else { for (let i = 0; i < TL; i++) { t += 16; step(0); } draw(); }
})();

/* ---------- data ---------- */
async function api(path, opts) {
  // An expired Access session redirects to the login page, so reload into it.
  const res = await fetch("/api/" + path, Object.assign({ redirect: "manual", cache: "no-store", headers: { "Content-Type": "application/json" } }, opts || {}));
  if (res.type === "opaqueredirect") { location.reload(); return new Promise(() => {}); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "HTTP " + res.status), { status: res.status });
  return body;
}
async function selectRun(id) {
  if (!S.runs[id]) S.runs[id] = await api("run/" + encodeURIComponent(id));
  S.runId = id; ls.set("gr.run", id === (S.index[0] || {}).run_id ? null : id);
}
async function refreshIndex() {
  const [index, checks] = await Promise.all([api("index"), api("checks").catch(() => S.checks)]);
  S.index = arr(index).filter(e => e && RUN_ID_RE.test(e.run_id)); S.checks = obj(checks);
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  if (e.target.closest("#themeBtn")) {
    const d = !isDark(), sys = matchMedia("(prefers-color-scheme: dark)").matches;
    if (d === sys) { document.documentElement.removeAttribute("data-theme"); ls.set("gr.theme", null); } // back to following the system
    else { document.documentElement.setAttribute("data-theme", d ? "dark" : "light"); ls.set("gr.theme", d ? "dark" : "light"); }
    (window.__retheme || []).forEach(f => f()); renderNav(); return;
  }
  const nb = e.target.closest("[data-tab]");
  if (nb) { go(nb.dataset.tab); return; }
  const rb = e.target.closest("[data-run]");
  if (rb) { try { await selectRun(rb.dataset.run); go("overview"); } catch (err) { toast("Couldn't load that run"); } return; }
  const cp = e.target.closest("[data-copy]");
  if (cp) {
    e.preventDefault(); const el = document.querySelector(`[data-text="${CSS.escape(cp.dataset.copy)}"]`); const txt = el ? el.textContent : "";
    try { await navigator.clipboard.writeText(txt); toast("Copied"); }
    catch (err) { const rg = document.createRange(); rg.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); toast("Text selected — press Copy"); }
  }
});
document.addEventListener("pointermove", e => {
  if (e.target.closest && e.target.closest("#trendChart")) chartHover(e);
  const g = e.target.closest && e.target.closest(".glass");
  if (g) { const b = g.getBoundingClientRect(); g.style.setProperty("--mx", (e.clientX - b.left) + "px"); g.style.setProperty("--my", (e.clientY - b.top) + "px"); }
}, { passive: true });
document.addEventListener("change", async e => {
  if (e.target.name === "filter") { S.filter = e.target.value; const l = document.querySelector(".findings"); if (l) l.dataset.filter = S.filter; return; }
  const cb = e.target.closest("[data-check]");
  if (cb) {
    const runId = S.runId, key = cb.dataset.check, id = runId + "__" + key, val = cb.checked, before = S.checks[id];
    S.checks[id] = { done: val }; render(true);
    try { await api(`checks/${encodeURIComponent(runId)}/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ done: val }) }); }
    catch (err) { if (before) S.checks[id] = before; else delete S.checks[id]; render(true); toast("Couldn't save that tick. Try again."); }
    return;
  }
  if (e.target.id === "runSel") { try { await selectRun(e.target.value); render(); scrollTo({ top: 0 }); } catch (err) { toast("Couldn't load that run"); } }
});
addEventListener("hashchange", () => { const h = fromHash(); go(h.tab || S.tab, h.target); });
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !S.loaded || S.error) return;
  const latest = (S.index[0] || {}).run_id;
  try { await refreshIndex(); } catch (e) { return; }
  if ((S.index[0] || {}).run_id !== latest) toast("A new run landed. Pick it from the run menu.");
  render(true);
});

/* ---------- start ---------- */
{ const h = fromHash(); S.tab = TABS.some(t => t[0] === h.tab) ? h.tab : ls.get("gr.tab") || "overview"; S.target = h.target || null; }
renderNav();
(async () => {
  try {
    const [, rules] = await Promise.all([refreshIndex(), fetch("rules.json").then(r => (r.ok ? r.json() : [])).catch(() => [])]);
    S.rules = arr(rules);
    if (S.index.length) {
      const want = new URLSearchParams(location.search).get("run") || ls.get("gr.run");
      await selectRun(S.index.some(e => e.run_id === want) ? want : S.index[0].run_id);
    }
  } catch (e) {
    console.error(e);
    S.error = `<div class="empty glass"><span class="eyebrow">Error</span><h2>Couldn't load reviews</h2><p class="muted">${e.status === 401 ? "Not signed in through Cloudflare Access. Reload to sign in." : "Reload the page to try again."}</p></div>`;
  }
  S.loaded = true; render();
})();
})();
