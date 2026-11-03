/* GitHub Review — Town tab. A Three.js 0.170 lab town (ES modules from jsDelivr, loaded the first
   time the tab opens) where the orchestrator and the seven subagents of /review-github replay one run
   from its stats file (scripts/agent_stats.py): who works when, what each tool call was (kind plus a
   website host or file name only), tokens and approximate cost. Every object opens a frosted card.
   Structure and replay logic follow the LinkedIn Review Office tab; robots follow Felipe's reference.
   The app calls Town.view(ctx) for the tab's markup, then attach() / detach(). */
(function () {
const CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/";

// Agent goals and descriptions shown in the cards. Update when an agent's scope changes.
const META = {
  order: ["orchestrator", "collector", "benchmark", "profile-reviewer", "projects-reviewer", "engineering-reviewer", "architect-reviewer", "synthesis"],
  agents: {
    orchestrator: { name: "Orchestrator", short: "Orchestrator", step: "0 · Conduct", color: "#d9a400",
      goal: "Run the whole review from one command and publish it.",
      description: "The main Claude Code session behind /review-github: preflight, then the collector and benchmark in parallel, the four reviewers in parallel, synthesis, validation, publishing and these stats.",
      inputs: "/review-github", outputs: "published run + stats", scope: "Coordination" },
    collector: { name: "Collector", short: "Collector", step: "1a · Collect", color: "#22a6b3",
      goal: "Collect the header, profile README and in-scope repos into one JSON, without filling gaps.",
      description: "Reads GitHub with the gh CLI (GETs and GraphQL queries only): README, file tree, CI runs, tests, commits and key files of each pinned or README-linked repo, plus a secret scan. Unknowns stay null and are listed in missing_fields.",
      inputs: "GitHub, read-only", outputs: "profile JSON", scope: "Facts only" },
    benchmark: { name: "Benchmark", short: "Benchmark", step: "1b · North stars", color: "#8b6cf0",
      goal: "Show what good looks like, rule by rule, from three north-star profiles.",
      description: "Reads josephmachado, EcZachly and sspaeti and their flagship repos, and records how each one handles every rule, with cited sources. Examples only: never part of the score.",
      inputs: "3 public profiles", outputs: "benchmark.json", scope: "Examples only" },
    "profile-reviewer": { name: "Profile Reviewer", short: "Profile", step: "2 · P1–P5", color: "#f08a3c", section: "profile", prefix: "P",
      goal: "Judge the header and profile README against P1–P5 and write paste-ready rewrites.",
      description: "Scores what a recruiter sees first: headline, bio, README top, links and pinned order. Every finding cites the field or line it is about.",
      inputs: "profile JSON", outputs: "profile_review.json", scope: "Header + README" },
    "projects-reviewer": { name: "Projects Reviewer", short: "Projects", step: "2 · J1–J4", color: "#3fa37a", section: "projects", prefix: "J",
      goal: "Judge each pinned repo against J1–J4 and keep the portfolio to 4–6 flagships.",
      description: "Gives every repo a keep, improve or replace verdict and writes briefs for ideal replacement projects, each naming the repo it replaces.",
      inputs: "profile JSON", outputs: "projects_review.json", scope: "Portfolio" },
    "engineering-reviewer": { name: "Engineering Reviewer", short: "Engineering", step: "2 · E1–E6", color: "#4f86e8", section: "engineering", prefix: "E",
      goal: "Check the engineering signals in each repo against E1–E6.",
      description: "Layout and consistency, tests, lint, types and CI, data quality and idempotency, a one-command run, secrets and commit hygiene, from the collected files only.",
      inputs: "profile JSON", outputs: "engineering_review.json", scope: "Code signals" },
    "architect-reviewer": { name: "Architect Reviewer", short: "Architect", step: "2 · A1–A4", color: "#d4509a", section: "architect", prefix: "A",
      goal: "Judge each repo as a Data Architect would, against A1–A4.",
      description: "Looks for ADRs and design docs, data patterns, IaC and environment promotion: the evidence for the Senior Data Engineer to Data Architect move.",
      inputs: "profile JSON", outputs: "architect_review.json", scope: "Architecture" },
    synthesis: { name: "Synthesis", short: "Synthesis", step: "3 · Merge", color: "#e5484d",
      goal: "Merge the four reviews and the benchmark into the run document the app renders.",
      description: "Computes the scores with scripts/scoring.py, orders findings and the action plan, and writes what changed since the last run. It only merges; it never collects or re-runs agents.",
      inputs: "4 reviews + benchmark", outputs: "run JSON (schema v1)", scope: "Merge only" },
  },
  pipeline: [
    { ids: ["collector", "benchmark"], label: "Collect ‖ Benchmark" },
    { ids: ["profile-reviewer", "projects-reviewer", "engineering-reviewer", "architect-reviewer"], label: "Four reviewers" },
    { ids: ["synthesis"], label: "Synthesis" },
    { ids: [], label: "Publish" },
  ],
};
const OBJ = {
  tower: { name: "Command Tower", color: "#d9a400" },
  score: { name: "Score hologram", color: "#22a6b3" },
  library: { name: "Rules library", color: "#8b6cf0" },
  vault: { name: "Run archive", color: "#4f86e8" },
};
const ROWS = META.order;
const LOOP_S = 48;
const HOLD_S = 5;
const TYPES = [
  ["input", "Input", "var(--of-input)"],
  ["cache_write", "Cache write", "var(--of-write)"],
  ["cache_read", "Cache read", "var(--of-read)"],
  ["output", "Output", "var(--of-output)"],
];
const REVIEWERS = ["profile-reviewer", "projects-reviewer", "engineering-reviewer", "architect-reviewer"];
const EDGES = [
  ...REVIEWERS.map((r) => ["collector", r]),
  ...REVIEWERS.map((r) => [r, "synthesis"]),
  ["benchmark", "synthesis"], ["synthesis", "orchestrator"],
];
const ORDERS = {
  collector: "Collector, read the profile.",
  benchmark: "Benchmark, fly to the north stars.",
  "profile-reviewer": "Reviewers, go!",
  synthesis: "Synthesis, merge it all.",
  publish: "Validated. Publishing!",
};
const PHRASES = {
  gh: () => "Querying GitHub", collect: () => "Running the collector", score: () => "Computing the scores",
  python: () => "Running a script", search: () => "Searching the web…",
  fetch: (d) => (d ? `Reading ${d}` : "Reading a web page"),
  write: (d) => (d ? `Writing ${d}` : "Writing a file"), edit: (d) => (d ? `Editing ${d}` : "Editing a file"),
  read: (d) => (d ? `Reading ${d}` : "Reading a file"), bash: () => "Running a check",
  validate: () => "Validating the run", publish: () => "Publishing to the app", start: () => "Starting a new run",
  stats: () => "Saving the stats", handback: () => "Done, handing back", tool: () => "Using a tool",
};
const WEB = new Set(["search", "fetch", "gh"]);
const FILES = new Set(["write", "edit"]);

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTok = (n) => (n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K" : String(Math.round(n)));
const fmtUsd = (n) => (n == null ? "—" : "~$" + (n < 0.1 ? n.toFixed(3) : n.toFixed(2)));
const fmtDur = (s) => (s == null ? "—" : Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0"));
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return iso; } };
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return iso; } };
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const shortRepo = (s) => String(s || "").split("/").pop();
const nameOf = (id) => (META.agents[id] ? META.agents[id].name : OBJ[id] ? OBJ[id].name : id.startsWith("repo:") ? shortRepo(id.slice(5)) : id);
const colorOf = (id) => (META.agents[id] ? META.agents[id].color : OBJ[id] ? OBJ[id].color : "#22a6b3");
const scoreHex = (v) => (v >= 80 ? "#3fa37a" : v >= 60 ? "#22a6b3" : v >= 45 ? "#f08a3c" : "#e5484d");
const scoreVar = (v) => (v >= 80 ? "var(--good)" : v >= 60 ? "var(--accent)" : v >= 45 ? "var(--high)" : "var(--crit)");
const motionOK = !matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- scene ----------------------------------------------------------------------------------------
let scenePromise = null;
function loadScene() {
  return scenePromise || (scenePromise = (async () => {
    const ex = (p) => import(CDN + "examples/jsm/" + p + ".js/+esm");
    const [THREE, { OrbitControls }, { RoundedBoxGeometry }, { RoomEnvironment }] = await Promise.all([
      import(CDN + "+esm"), ex("controls/OrbitControls"), ex("geometries/RoundedBoxGeometry"), ex("environments/RoomEnvironment"),
    ]);
    return (canvas, opts) => createTown(THREE, { OrbitControls, RoundedBoxGeometry, RoomEnvironment }, canvas, opts);
  })());
}

function createTown(THREE, X, canvas, { onPick, onHover }) {
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const deg = (d) => (d * Math.PI) / 180;
  const H0 = 0.9, H1 = 3.95, RROOM = 10, RW = 12.7, ROOF_R = 8.75, ROCT = 15.15;
  const polar = (r, a, y = 0) => V3(r * Math.sin(a), y, r * Math.cos(a));
  const phone = Math.min(innerWidth, innerHeight) < 700 || matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(phone ? 1.6 : 2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0xeef3f7, 70, 190);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
  const controls = new X.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
  controls.minDistance = 14; controls.maxDistance = 120; controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.8;
  controls.minPolarAngle = 0.42; controls.maxPolarAngle = 1.36;
  controls.minAzimuthAngle = deg(45) - 1.15; controls.maxAzimuthAngle = deg(45) + 1.15;
  canvas.style.touchAction = "pan-y"; // vertical swipes scroll the page, horizontal ones orbit
  const HOME = { target: V3(0, 4.4, 0), dist: 70, az: deg(45), pol: deg(60) };

  // ---- textures and materials ----
  const cv = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; if (draw) draw(c.getContext("2d"), w, h); return c; };
  const ctex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const rnd = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const glowTex = ctex(cv(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.28, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));
  const shadowTex = ctex(cv(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(0,0,0,.55)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));

  const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const M = {
    white: std(0xeef1f4, 0.58),
    white2: std(0xdfe4e9, 0.66),
    grey: std(0xc9d0d7, 0.6),
    pave: std(0xeef1f4, 0.85),
    dark: std(0x1b2430, 0.45, { metalness: 0.3 }),
    darker: std(0x10161e, 0.4, { metalness: 0.4 }),
    metal: std(0x9aa3ad, 0.35, { metalness: 0.75 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x14212e, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
    window: std(0x223140, 0.18, { metalness: 0.4, emissive: new THREE.Color(0x39c6ee), emissiveIntensity: 0 }),
    clearGlass: new THREE.MeshPhysicalMaterial({ color: 0xdff4fb, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, depthWrite: false }),
    ceil: new THREE.MeshBasicMaterial({ color: 0xf2fbff, toneMapped: false }),
    snow: std(0xe9eef3, 0.96),
  };
  M.octa = M.white.clone(); M.octa.flatShading = true;
  const neonMats = [], holoMats = [], glowSprites = [];
  const neon = (color = 0x39c6ee) => { const m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); m.userData.base = new THREE.Color(color); neonMats.push(m); return m; };
  M.neon = neon();
  const holo = (map, opacity = 0.9) => {
    const m = new THREE.MeshBasicMaterial({ map, color: 0x1aa6d1, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    m.userData.op = opacity; holoMats.push(m); return m;
  };
  const glow = (color, size, opacity = 0.6) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    s.scale.set(size, size, 1); s.userData.op = opacity; glowSprites.push(s); return s;
  };

  // ---- geometry helpers ----
  const box = (w, h, d, m, r = 0, seg = 3) => new THREE.Mesh(r ? new X.RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, m, s = 32, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s, 1, open), m);
  const sph = (r, m, ws = 32, hs = 20) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m);
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  const add = (parent, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); parent.add(o); return o; };
  const shadowy = (o, cast = true, recv = true) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = recv; } }); return o; };
  const pick = [];
  const reg = (o, id) => { o.traverse((c) => { if (c.isMesh) { c.userData.pick = id; pick.push(c); } }); return o; };
  const plane = (w, h, m) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);

  // dynamic canvas screens (redrawn when the run changes)
  const screens = [];
  function screen(w, h, cw, ch, draw, opacity) {
    const c = cv(cw, ch), t = ctex(c), m = holo(t, opacity);
    const mesh = plane(w, h, m);
    const s = { c, t, draw, mesh }; screens.push(s); paint(s); return mesh;
  }
  function paint(s) { const g = s.c.getContext("2d"); g.clearRect(0, 0, s.c.width, s.c.height); s.draw(g, s.c.width, s.c.height, info); s.t.needsUpdate = true; }
  const FONT = "Geist, system-ui, sans-serif", MONO = "'Geist Mono', ui-monospace, monospace";
  function uiFrame(g, w, h, title, sub) {
    g.fillStyle = "rgba(255,255,255,.13)"; rr(g, 4, 4, w - 8, h - 8, 18); g.fill();
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3; rr(g, 4, 4, w - 8, h - 8, 18); g.stroke();
    g.fillStyle = "rgba(255,255,255,.95)"; g.font = `600 ${Math.round(h * 0.085)}px ${MONO}`; g.textBaseline = "top";
    g.fillText(title, 22, 18);
    if (sub) { g.globalAlpha = 0.75; g.font = `500 ${Math.round(h * 0.06)}px ${MONO}`; g.fillText(sub, 22, 22 + h * 0.1); g.globalAlpha = 1; }
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function bars(g, x, y, w, h, vals) {
    const n = vals.length, bw = w / n;
    vals.forEach((v, i) => { const bh = Math.max(4, (h * v) / 100); g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x + i * bw + bw * 0.18, y + h - bh, bw * 0.64, bh); });
  }
  function lines(g, x, y, w, n, seed) {
    const r = rnd(seed); g.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < n; i++) g.fillRect(x, y + i * 22, w * (0.35 + r() * 0.6), 8);
  }
  function gauge(g, cx, cy, rad, v) {
    g.lineWidth = rad * 0.22; g.strokeStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (v || 0)) / 100); g.stroke();
    g.fillStyle = "#fff"; g.font = `700 ${Math.round(rad * 0.8)}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(v == null ? "–" : String(v), cx, cy + 2); g.textAlign = "left"; g.textBaseline = "top";
  }
  function brain(g, cx, cy, s) {
    g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = s * 0.06; g.lineCap = "round";
    g.beginPath(); g.ellipse(cx, cy, s, s * 0.78, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - s * 0.78); g.bezierCurveTo(cx - s * 0.15, cy - s * 0.2, cx + s * 0.15, cy + s * 0.2, cx, cy + s * 0.78); g.stroke();
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) {
      g.beginPath(); const yy = cy - s * 0.45 + i * s * 0.42;
      g.moveTo(cx + k * s * 0.18, yy); g.bezierCurveTo(cx + k * s * 0.5, yy - s * 0.25, cx + k * s * 0.7, yy + s * 0.25, cx + k * s * 0.92, yy + s * 0.05); g.stroke();
    }
  }

  // ---- shared run info for screens ----
  let info = { run: null, stats: null };

  // ---- sky, ground, terrain ----
  const skyCanvas = cv(16, 256), skyTex = ctex(skyCanvas);
  scene.background = skyTex;
  const ground = plane(700, 700, M.snow); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const hills = new THREE.Group(); scene.add(hills);
  { const r = rnd(5);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 70 + r() * 120, h = sph(1, M.snow, 24, 12);
      h.scale.set(18 + r() * 30, 3 + r() * 7, 12 + r() * 20); h.position.copy(polar(d, a, -1)); h.rotation.y = r() * 3; h.receiveShadow = true; hills.add(h);
    }
    for (let i = 0; i < 18; i++) {
      const a = deg(-80 + r() * 260), d = 26 + r() * 16, h = sph(1, M.snow, 18, 10);
      h.scale.set(2 + r() * 4, 0.35 + r() * 0.6, 1.5 + r() * 3); h.position.copy(polar(d, a, 0)); h.receiveShadow = true; hills.add(h);
    }
  }
  // paved plaza with markings
  const paveTex = ctex(cv(1024, 1024, (g, w, h) => {
    g.fillStyle = "#eef1f4"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,135,150,.16)"; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    g.strokeStyle = "rgba(120,135,150,.35)"; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.47, 0, Math.PI * 2); g.stroke();
  }));
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping;
  const plaza = cyl(25, 25.4, 0.08, std(0xffffff, 0.85, { map: paveTex }), 72); plaza.position.y = 0.04; plaza.receiveShadow = true; scene.add(plaza);
  // floor logo in front of the stairs
  const logo = plane(4.2, 4.2, new THREE.MeshBasicMaterial({ map: ctex(cv(512, 512, (g, w) => {
    g.strokeStyle = "rgba(90,110,130,.5)"; g.lineWidth = 16; rr(g, 40, 40, w - 80, w - 80, 70); g.stroke();
    g.fillStyle = "rgba(90,110,130,.5)"; g.font = `700 210px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("GR", w / 2, w / 2 + 10);
  })), transparent: true, depthWrite: false }));
  logo.rotation.x = -Math.PI / 2; logo.rotation.z = deg(45); logo.position.copy(polar(19.6, deg(45), 0.09)); scene.add(logo);

  // ---- base platform (deck) ----
  const town = new THREE.Group(); scene.add(town);
  const base = cyl(ROCT, ROCT + 0.3, H0, M.octa, 8); base.geometry.dispose();
  base.geometry = new THREE.CylinderGeometry(ROCT, ROCT + 0.3, H0, 8, 1, false, deg(22.5));
  base.position.y = H0 / 2; town.add(shadowy(base));
  const inr = ROCT * Math.cos(deg(22.5)), edge = 2 * ROCT * Math.sin(deg(22.5));
  for (let k = 0; k < 8; k++) {
    const s = box(edge, 0.05, 0.05, M.neon); s.position.copy(polar(inr + 0.02, deg(45 * k), H0 - 0.08)); s.rotation.y = deg(45 * k); town.add(s);
    const s2 = box(edge + 0.2, 0.04, 0.04, M.neon); s2.position.copy(polar(inr + 0.29, deg(45 * k), 0.12)); s2.rotation.y = deg(45 * k); town.add(s2);
  }
  // front stairs ground -> deck
  { const g = new THREE.Group(); g.rotation.y = deg(45); town.add(g);
    for (let i = 0; i < 4; i++) { const st = box(5.2, (i + 1) * 0.225, 0.55, M.white, 0.02); st.position.set(0, ((i + 1) * 0.225) / 2, inr + 2.0 - i * 0.55 - 0.27); g.add(shadowy(st)); }
    for (const s of [-1, 1]) { const w = box(0.35, 1.0, 2.3, M.white2, 0.06); w.position.set(s * 2.78, 0.5, inr + 1.1); g.add(shadowy(w)); const n = box(0.04, 0.04, 2.3, M.neon); n.position.set(s * 2.6, 0.98, inr + 1.1); g.add(n); }
  }

  // ---- core building: rooms open outward around the core, roof = upper deck ----
  const core = cyl(8.7, 8.7, H1 - H0, M.white2, 64); core.position.y = (H0 + H1) / 2; town.add(core);
  const roof = cyl(ROOF_R, ROOF_R, 0.35, M.white, 72); roof.position.y = H1 - 0.175; town.add(shadowy(roof));
  const roofRing = new THREE.Mesh(new THREE.TorusGeometry(ROOF_R + 0.01, 0.035, 6, 120), M.neon); roofRing.rotation.x = Math.PI / 2; roofRing.position.y = H1 - 0.06; town.add(roofRing);
  const parapet = cyl(ROOF_R - 0.05, ROOF_R - 0.05, 0.28, M.white, 72, true); parapet.material = M.white.clone(); parapet.material.side = THREE.DoubleSide; parapet.position.y = H1 + 0.14; town.add(parapet);

  const ROOMS = [
    { id: "architect-reviewer", a: -62, kind: "lab", sign: "ARCHITECT · A1–A4" },
    { id: "engineering-reviewer", a: -36, kind: "lab", sign: "ENGINEERING · E1–E6" },
    { id: "projects-reviewer", a: -10, kind: "lab", sign: "PROJECTS · J1–J4" },
    { id: "profile-reviewer", a: 16, kind: "lab", sign: "PROFILE · P1–P5" },
    { id: "tower", a: 45, kind: "lobby", sign: "GITHUB REVIEW LAB", W: 5.6 },
    { id: "collector", a: 74, kind: "intake", sign: "COLLECTOR · gh" },
    { id: "benchmark", a: 100, kind: "observatory", sign: "BENCHMARK" },
    { id: "library", a: 126, kind: "library", sign: "RULES LIBRARY" },
    { id: "vault", a: 152, kind: "vault", sign: "RUN ARCHIVE" },
    { id: null, a: 178, kind: "closed" }, { id: null, a: 204, kind: "closed" }, { id: null, a: 230, kind: "closed" }, { id: null, a: 256, kind: "closed" },
  ];
  const D = 3.2, WALL = H1 - H0 - 0.35;
  const stations = {};   // id -> {group, spot, yaw, active, holo:[...], spin:[...]}
  function signTex(text) {
    return ctex(cv(1024, 96, (g, w, h) => {
      g.fillStyle = "#26323e"; g.font = `600 52px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2);
    }));
  }
  function room(def) {
    const W = def.W || 4.0, a = deg(def.a);
    const g = new THREE.Group(); g.position.copy(polar(RROOM, a, H0)); g.rotation.y = a; town.add(g);
    const st = { group: g, a, active: 0, holo: [], spin: [], blink: [], cue: 0, kind: def.kind };
    add(g, box(W, 0.04, D, M.white2), 0, 0.02, 0);
    add(g, box(W, WALL, 0.2, M.white2), 0, WALL / 2, -D / 2 + 0.1);
    for (const s of [-1, 1]) add(g, shadowy(box(0.24, WALL, D, M.white, 0.05)), s * (W / 2 - 0.12), WALL / 2, 0);
    add(g, box(W - 0.3, 0.035, 0.035, M.neon), 0, 0.06, D / 2 - 0.02);
    for (const sx of [-1, 1]) add(g, box(0.035, 0.035, D, M.neon), sx * (W / 2 - 0.02), WALL + 0.01, 0);
    add(g, box(W - 0.5, 0.05, 0.08, M.ceil), 0, WALL - 0.12, -D / 2 + 0.24);
    if (def.sign) { const s = plane(W * 0.84, W * 0.84 * 0.094, new THREE.MeshBasicMaterial({ map: signTex(def.sign), transparent: true })); add(g, s, 0, WALL - 0.36, -D / 2 + 0.205); }
    if (def.kind === "closed") {
      add(g, box(W - 0.3, WALL, 0.16, M.white), 0, WALL / 2, D / 2 - 0.1);
      add(g, box(W - 0.9, 0.5, 0.05, M.window), 0, WALL * 0.62, D / 2 - 0.0);
      add(g, shadowy(box(W + 0.1, 0.3, D + 0.1, M.white, 0.04)), 0, WALL + 0.15, 0);
    } else {
      buildInterior(def, g, st, W);
    }
    if (def.id) { reg(g, def.id); stations[def.id] = st; }
    st.spot = g.localToWorld(V3(0, 0, 0.35)); st.spot.y = H0; st.yaw = a + Math.PI;
    st.front = polar(RW, a, H0);
    return st;
  }
  const rackTex = ctex(cv(64, 256, (g, w, h) => {
    g.fillStyle = "#0d141c"; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 16) { g.fillStyle = "#1a2531"; g.fillRect(4, y, w - 8, 11); g.fillStyle = "rgba(90,220,255,.95)"; g.fillRect(8, y + 4, 10, 3); g.fillStyle = "rgba(90,220,255,.45)"; g.fillRect(24, y + 4, 30, 3); }
  }));
  const rackFace = new THREE.MeshStandardMaterial({ map: rackTex, emissiveMap: rackTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.6, roughness: 0.4 });
  function rack(h = 2.1) { const g = new THREE.Group(); add(g, box(0.72, h, 0.62, M.dark, 0.03), 0, h / 2, 0); add(g, plane(0.6, h - 0.15, rackFace), 0, h / 2, 0.315); add(g, box(0.04, h - 0.1, 0.04, M.neon), 0.33, h / 2, 0.32); return shadowy(g); }
  function holoTable(g, st, x, z, r = 0.55) {
    const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t);
    add(t, shadowy(cyl(r * 0.55, r * 0.8, 0.72, M.dark, 24)), 0, 0.36, 0);
    add(t, cyl(r, r * 0.92, 0.08, M.darker, 32), 0, 0.76, 0);
    const disc = cyl(r * 0.86, r * 0.86, 0.02, neon(0x5be3ff), 32); add(t, disc, 0, 0.81, 0);
    const scanC = cv(256, 64, (gg, w, h) => { for (let y = 0; y < h; y += 6) { gg.fillStyle = `rgba(255,255,255,${0.15 + 0.35 * (y / h)})`; gg.fillRect(0, y, w, 2); } });
    const shell = cyl(r * 0.82, r * 0.82, 0.5, holo(ctex(scanC), 0.45), 32, true); add(t, shell, 0, 1.08, 0); st.holo.push(shell);
    for (const [rad, y] of [[r * 0.7, 0.95], [r * 0.5, 1.2]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.012, 6, 48), holo(null, 0.9)); ring.rotation.x = Math.PI / 2; add(t, ring, 0, y, 0); st.spin.push(ring); st.holo.push(ring); }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.22, 1), holo(null, 0.85)); core.material.wireframe = true; add(t, core, 0, 1.12, 0); st.spin.push(core);
    const gl = glow(0x5be3ff, r * 3, 0.5); add(t, gl, 0, 0.95, 0); st.blink.push(gl);
    return t;
  }
  function console_(g, x, z, w = 1.4) {
    const c = new THREE.Group(); c.position.set(x, 0, z); g.add(c);
    add(c, shadowy(box(w, 0.78, 0.55, M.white, 0.06)), 0, 0.39, 0);
    const top = box(w + 0.05, 0.06, 0.62, M.dark, 0.02); top.rotation.x = -0.25; add(c, top, 0, 0.82, 0.02);
    add(c, box(w * 0.8, 0.02, 0.02, M.neon), 0, 0.5, 0.28);
    return c;
  }
  function buildInterior(def, g, st, W) {
    const back = -D / 2 + 0.2;
    if (def.kind === "lab") {
      const ag = META.agents[def.id];
      holoTable(g, st, 0, -0.5);
      add(g, rack(), -W / 2 + 0.6, 0, back + 0.35);
      add(g, rack(1.7), W / 2 - 0.6, 0, back + 0.35);
      const scr = screen(1.5, 0.9, 512, 308, (gg, w, h, inf) => {
        const sec = inf.run ? num(obj(obj(inf.run.scores).sections)[ag.section]) : null;
        uiFrame(gg, w, h, ag.short.toUpperCase(), ag.step.split("· ")[1] || "");
        gauge(gg, w * 0.27, h * 0.62, h * 0.2, sec);
        const rules = inf.run ? Object.entries(obj(obj(inf.run.scores).rules)).filter(([k]) => k[0] === ag.prefix) : [];
        bars(gg, w * 0.52, h * 0.38, w * 0.4, h * 0.46, rules.length ? rules.map(([, v]) => v) : [40, 70, 55, 85]);
      });
      add(g, scr, 0, 1.95, -0.62); st.holo.push(scr);
    } else if (def.kind === "intake") {
      for (let i = 0; i < 3; i++) add(g, rack(), -W / 2 + 0.6 + i * 0.78, 0, back + 0.35);
      add(g, console_(g, W / 2 - 0.85, -0.3, 1.0));
      // conveyor of data cubes into the racks
      const belt = box(2.6, 0.08, 0.5, M.darker); add(g, belt, -0.2, 0.62, 0.55);
      add(g, box(2.6, 0.55, 0.04, M.white2), -0.2, 0.3, 0.78);
      st.cubes = [];
      for (let i = 0; i < 5; i++) { const c = box(0.22, 0.22, 0.22, holo(null, 0.85), 0.03); add(g, c, 0, 0.78, 0.55); st.cubes.push(c); st.holo.push(c); }
      const scr = screen(1.2, 0.72, 384, 230, (gg, w, h, inf) => {
        const sn = obj(inf.run && inf.run.snapshot);
        uiFrame(gg, w, h, "INTAKE · gh", `${sn.in_scope_repos ?? "–"} repos in scope`);
        bars(gg, 22, h * 0.45, w - 44, h * 0.42, [sn.repos_with_ci, sn.repos_with_tests, sn.repos_with_adrs, sn.repos_with_iac].map((v) => ((v || 0) / Math.max(1, sn.in_scope_repos || 1)) * 100));
      });
      add(g, scr, W / 2 - 0.85, 1.6, -0.25); scr.rotation.y = -0.25; st.holo.push(scr);
    } else if (def.kind === "observatory") {
      add(g, console_(g, 0, -0.55, 1.6));
      const scr = screen(1.7, 0.95, 512, 286, (gg, w, h, inf) => {
        const b = obj(inf.run && inf.run.benchmark);
        uiFrame(gg, w, h, "NORTH STARS", `${arr(b.profiles).length || 3} profiles`);
        const r = rnd(9); gg.fillStyle = "#fff";
        for (let i = 0; i < 60; i++) { const x = 20 + r() * (w - 40), y = h * 0.35 + r() * h * 0.55; gg.globalAlpha = 0.3 + r() * 0.7; gg.fillRect(x, y, 3, 3); }
        gg.globalAlpha = 1; gg.strokeStyle = "rgba(255,255,255,.8)"; gg.lineWidth = 2; gg.beginPath(); gg.moveTo(w * 0.2, h * 0.8); gg.lineTo(w * 0.45, h * 0.5); gg.lineTo(w * 0.7, h * 0.62); gg.lineTo(w * 0.85, h * 0.4); gg.stroke();
      });
      add(g, scr, 0, 1.75, -0.9); st.holo.push(scr);
      add(g, rack(1.9), W / 2 - 0.55, 0, back + 0.35);
      add(g, rack(1.9), -W / 2 + 0.55, 0, back + 0.35);
    } else if (def.kind === "library") {
      const bookCols = [0x5b6b7c, 0x8c6f56, 0x3f5d70, 0xa58c6f, 0x6d7f69, 0x7a5c4c, 0x2f4a5d, 0xb9a58a];
      const shelf = (w, x, z, ry) => {
        const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
        add(s, shadowy(box(w, 2.25, 0.42, M.white, 0.03)), 0, 1.12, 0);
        add(s, box(w - 0.12, 2.05, 0.3, M.dark), 0, 1.12, 0.07);
        const r = rnd(Math.round(x * 100 + 7)); const bg = new THREE.BoxGeometry(1, 1, 1);
        const n = Math.round(w * 22) * 4, im = new THREE.InstancedMesh(bg, std(0xffffff, 0.8), n), m4 = new THREE.Matrix4(), col = new THREE.Color();
        let k = 0;
        for (let row = 0; row < 4; row++) { let xx = -w / 2 + 0.1; while (xx < w / 2 - 0.12 && k < n) { const bw = 0.04 + r() * 0.04, bh = 0.3 + r() * 0.14;
          m4.makeScale(bw, bh, 0.24); m4.setPosition(xx + bw / 2, 0.25 + row * 0.5 + bh / 2, 0.08); im.setMatrixAt(k, m4); im.setColorAt(k, col.setHex(bookCols[Math.floor(r() * bookCols.length)])); k++; xx += bw + 0.008; } }
        im.count = k; s.add(im);
        for (let row = 0; row < 5; row++) add(s, box(w - 0.12, 0.03, 0.3, M.white2), 0, 0.22 + row * 0.5, 0.07);
      };
      shelf(W - 0.6, 0, back + 0.1, 0);
      shelf(1.8, -W / 2 + 0.45, -0.25, Math.PI / 2);
      shelf(1.8, W / 2 - 0.45, -0.25, -Math.PI / 2);
      add(g, shadowy(box(1.3, 0.75, 0.7, M.white, 0.05)), 0, 0.375, 0.25);
      const book = screen(0.9, 0.6, 256, 170, (gg, w, h, inf) => { uiFrame(gg, w, h, "RULES", `${(inf.rules || []).length || 19} rules`); lines(gg, 22, h * 0.48, w - 44, 3, 3); });
      book.rotation.x = -0.5; add(g, book, 0, 1.2, 0.2); st.holo.push(book);
    } else if (def.kind === "vault") {
      for (let i = 0; i < 4; i++) add(g, rack(2.3), -W / 2 + 0.55 + i * 0.95, 0, back + 0.35);
      // robot arm (image 2) moving cartridges
      const arm = new THREE.Group(); arm.position.set(0.6, 0, 0.45); g.add(arm);
      add(arm, shadowy(cyl(0.3, 0.36, 0.2, M.dark, 24)), 0, 0.1, 0);
      const j1 = add(arm, new THREE.Group(), 0, 0.2, 0);
      add(j1, shadowy(cyl(0.12, 0.14, 0.7, M.dark, 18)), 0, 0.35, 0);
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 24), neon(0x5be3ff)); ringA.rotation.x = Math.PI / 2; add(j1, ringA, 0, 0.72, 0);
      const j2 = add(j1, new THREE.Group(), 0, 0.72, 0);
      add(j2, shadowy(box(0.16, 0.85, 0.16, M.dark, 0.05)), 0, 0.42, 0);
      const j3 = add(j2, new THREE.Group(), 0, 0.85, 0);
      add(j3, shadowy(box(0.13, 0.13, 0.6, M.dark, 0.04)), 0, 0, 0.3);
      add(j3, box(0.05, 0.05, 0.05, neon(0x5be3ff)), 0, 0, 0.62);
      st.arm = { j1, j2, j3 };
      const scr = screen(1.1, 0.66, 384, 230, (gg, w, h, inf) => {
        const idx = inf.index || [];
        uiFrame(gg, w, h, "ARCHIVE", `${idx.length} run${idx.length === 1 ? "" : "s"}`);
        bars(gg, 22, h * 0.42, w - 44, h * 0.46, idx.slice(0, 8).reverse().map((e) => e.overall || 0).concat(idx.length ? [] : [30, 45, 60]));
      });
      add(g, scr, -0.9, 1.5, 0.3); scr.rotation.y = 0.3; st.holo.push(scr);
    } else if (def.kind === "lobby") {
      // glass front with a reception desk and the town logo
      add(g, box(W - 0.4, WALL - 0.15, 0.05, M.clearGlass), 0, (WALL - 0.15) / 2, D / 2 - 0.12);
      for (const x of [-1.2, 1.2]) add(g, box(0.08, WALL, 0.1, M.white), x, WALL / 2, D / 2 - 0.12);
      add(g, shadowy(box(2.4, 0.95, 0.7, M.white, 0.12)), 0, 0.48, -0.3);
      add(g, box(2.2, 0.03, 0.03, M.neon), 0, 0.7, 0.06);
      const lg = screen(1.6, 1.0, 400, 250, (gg, w, h) => { gg.strokeStyle = "rgba(255,255,255,.95)"; gg.lineWidth = 8; rr(gg, w / 2 - 80, 20, 160, 160, 30); gg.stroke(); gg.fillStyle = "#fff"; gg.font = `700 84px ${FONT}`; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText("GR", w / 2, 104); gg.font = `600 26px ${MONO}`; gg.fillText("REVIEW LAB", w / 2, 222); });
      add(g, lg, 0, 1.75, -1.2); st.holo.push(lg);
    }
  }
  for (const r of ROOMS) room(r);
  // fill the gaps between modules so the ring reads as one building
  { const spans = ROOMS.map((r) => { const half = ((r.W || 4) / 2 / RROOM) * (180 / Math.PI); return [r.a - half, r.a + half]; }).sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < spans.length; i++) {
      const a0 = spans[i][1], a1 = i + 1 < spans.length ? spans[i + 1][0] : spans[0][0] + 360;
      if (a1 - a0 < 0.3) continue;
      const mid = deg((a0 + a1) / 2), w = 2 * RROOM * Math.sin(deg((a1 - a0) / 2)) + 0.3;
      const f = new THREE.Group(); f.position.copy(polar(RROOM, mid, H0)); f.rotation.y = mid; town.add(f);
      add(f, shadowy(box(w, WALL, D + 0.02, M.white)), 0, WALL / 2, 0);
      add(f, box(w + 0.02, 0.035, 0.035, M.neon), 0, WALL + 0.01, D / 2);
      if (w > 1.2) add(f, box(w - 0.5, 0.35, 0.04, M.window), 0, WALL * 0.66, D / 2 + 0.01);
    }
  }
  // wide stairs ground -> deck on the right edge, after the reference
  { const g = new THREE.Group(); g.rotation.y = deg(-45); town.add(g);
    for (let i = 0; i < 4; i++) { const st = box(6.4, (i + 1) * 0.225, 0.6, M.white, 0.02); st.position.set(0, ((i + 1) * 0.225) / 2, inr + 2.2 - i * 0.6 - 0.3); g.add(shadowy(st)); }
    for (const sx of [-1, 1]) { const w = box(0.35, 1.0, 2.5, M.white2, 0.06); w.position.set(sx * 3.38, 0.5, inr + 1.2); g.add(shadowy(w)); const n = box(0.04, 0.04, 2.5, M.neon); n.position.set(sx * 3.2, 0.98, inr + 1.2); g.add(n); }
  }

  // ---- upper deck: podium, tower, score hologram, pavilions ----
  const up = new THREE.Group(); up.position.y = H1; town.add(up);
  add(up, shadowy(cyl(4.4, 4.5, 0.45, M.white, 64)), 0, 0.225, 0);
  add(up, shadowy(cyl(3.6, 3.7, 0.45, M.white, 64)), 0, 0.675, 0);
  for (const [r, y] of [[4.42, 0.44], [3.62, 0.89]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 96), M.neon); t.rotation.x = Math.PI / 2; add(up, t, 0, y, 0); }
  const tower = new THREE.Group(); tower.position.set(0, 0.9, 0); tower.rotation.y = deg(75); up.add(tower);
  { const sh = new THREE.Shape([V3(-1.3, 0), V3(1.3, 0), V3(1.3, 12), V3(0.2, 14.2), V3(-1.3, 13.2)].map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 }); geo.translate(0, 0, -1.1);
    tower.add(shadowy(new THREE.Mesh(geo, M.white)));
    add(tower, box(0.9, 11.2, 0.1, M.glass), 0.32, 6.6, 1.18);
    const circ = ctex(cv(64, 896, (g, w, h) => {
      g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h * 0.42); g.stroke();
      g.beginPath(); g.moveTo(w / 2, h * 0.42); g.lineTo(w * 0.82, h * 0.5); g.lineTo(w / 2, h * 0.58); g.lineTo(w * 0.18, h * 0.5); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(w / 2, h * 0.58); g.lineTo(w / 2, h - 20); g.stroke();
      g.fillStyle = "#fff"; for (const y of [0.12, 0.25, 0.7, 0.85]) { g.beginPath(); g.arc(w / 2, h * y, 7, 0, Math.PI * 2); g.fill(); }
    }));
    const cm = holo(circ, 1); add(tower, plane(0.9, 11.2, cm), 0.32, 6.6, 1.24);
    // diamond emblem on the left face
    const em = new THREE.Group(); em.position.set(-1.42, 9.6, -0.1); em.rotation.y = -Math.PI / 2; tower.add(em);
    for (const s of [1.25, 0.62]) for (let k = 0; k < 4; k++) { const b = box(s * 0.74, 0.07, 0.04, M.neon); const ang = deg(45 + 90 * k); b.position.set(Math.cos(ang) * s * 0.26, Math.sin(ang) * s * 0.26 * 1.6, 0); b.rotation.z = ang + (k % 2 ? -1 : 1) * 0.55 + Math.PI / 2; b.scale.y = 1; em.add(b); }
    add(em, glow(0x5be3ff, 2.6, 0.35), 0, 0, 0.1);
    add(tower, box(0.08, 3.2, 1.2, M.glass), -1.4, 2.4, 0.1);
    add(tower, box(0.08, 0.06, 1.25, M.neon), -1.44, 4.05, 0.1);
    // antenna
    const ant = new THREE.Group(); ant.position.set(0.2, 14.2, 0); tower.add(ant);
    add(ant, cyl(0.06, 0.09, 2.8, M.metal, 12), 0, 1.4, 0);
    for (const y of [0.9, 1.6]) add(ant, box(0.5, 0.04, 0.04, M.metal), 0, y, 0);
    const tip = glow(0xff5a5a, 0.9, 0.9); add(ant, tip, 0, 2.85, 0); tower.userData.tip = tip;
    // pulses travelling up the circuit line
    tower.userData.pulses = [0, 0.33, 0.66].map((p) => { const s = glow(0x8ff0ff, 0.6, 0.9); add(tower, s, 0.32, 1, 1.32); s.userData.p = p; return s; });
  }
  reg(tower, "tower"); reg(up.children[0], "tower"); reg(up.children[1], "tower");

  // score hologram in front of the tower
  const scoreG = new THREE.Group(); scoreG.position.copy(polar(6.5, deg(45), 0)); scoreG.rotation.y = deg(45); up.add(scoreG);
  add(scoreG, shadowy(cyl(0.55, 0.65, 0.3, M.dark, 32)), 0, 0.15, 0);
  add(scoreG, cyl(0.45, 0.45, 0.02, M.neon, 32), 0, 0.31, 0);
  const beam = cyl(1.9, 0.42, 1.6, holo(null, 0.14), 32, true); add(scoreG, beam, 0, 1.1, 0);
  const scorePanel = screen(4.4, 2.85, 640, 414, (g, w, h, inf) => {
    const s = obj(inf.run && inf.run.scores), sec = obj(s.sections);
    uiFrame(g, w, h, "GITHUB SCORE", inf.run ? inf.run.run_id : "no run");
    brain(g, w * 0.2, h * 0.58, h * 0.2);
    g.fillStyle = "#fff"; g.font = `700 ${h * 0.3}px ${FONT}`; g.textBaseline = "middle"; g.fillText(s.overall == null ? "–" : String(s.overall), w * 0.38, h * 0.5);
    g.font = `600 ${h * 0.05}px ${MONO}`; g.globalAlpha = 0.8; g.fillText("OUT OF 100", w * 0.39, h * 0.72); g.globalAlpha = 1;
    ["profile", "projects", "engineering", "architect"].forEach((k, i) => {
      const y = h * 0.34 + i * h * 0.13, x = w * 0.66;
      g.font = `600 ${h * 0.045}px ${MONO}`; g.fillText(k.slice(0, 4).toUpperCase(), x, y);
      g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x + w * 0.1, y - 5, w * 0.18, 10); g.fillStyle = "#fff"; g.fillRect(x + w * 0.1, y - 5, (w * 0.18 * (sec[k] || 0)) / 100, 10);
    });
  }, 0.92);
  scorePanel.rotation.x = -0.06; add(scoreG, scorePanel, 0, 3.3, 0);
  for (const [w, h, x, y] of [[4.5, 0.05, 0, 1.42], [4.5, 0.05, 0, -1.42], [0.05, 2.85, 2.24, 0], [0.05, 2.85, -2.24, 0]]) add(scorePanel, box(w, h, 0.03, M.neon), x, y, 0);
  reg(scoreG, "score");
  const scoreSt = { group: scoreG, holo: [scorePanel, beam], spin: [], blink: [], active: 0, cue: 0 };
  stations.score = scoreSt;

  // pavilions on the upper deck: command deck (orchestrator) and merge lab (synthesis, image 3)
  function pavilion(id, a, build) {
    const g = new THREE.Group(); g.position.copy(polar(6.75, deg(a), 0)); g.rotation.y = deg(a); up.add(g);
    const W = 3.6, Dp = 2.6, Hp = 2.4;
    add(g, box(W, 0.06, Dp, M.white2), 0, 0.03, 0);
    add(g, shadowy(box(W, Hp, 0.18, M.white)), 0, Hp / 2, -Dp / 2 + 0.09);
    for (const s of [-1, 1]) add(g, shadowy(box(0.2, Hp, Dp, M.white, 0.05)), s * (W / 2 - 0.1), Hp / 2, 0);
    add(g, shadowy(box(W + 0.3, 0.22, Dp + 0.3, M.white, 0.06)), 0, Hp + 0.11, 0.05);
    add(g, box(W + 0.3, 0.035, 0.035, M.neon), 0, Hp + 0.01, Dp / 2 + 0.2);
    const lamp = plane(W - 0.8, Dp - 0.8, M.ceil); lamp.rotation.x = Math.PI / 2; add(g, lamp, 0, Hp - 0.01, 0);
    const st = { group: g, a: deg(a), active: 0, holo: [], spin: [], blink: [], cue: 0 };
    build(g, st, W, Dp);
    reg(g, id); stations[id] = st;
    st.spot = g.localToWorld(V3(0, 0, 0.3)); st.spot.y = H1; st.yaw = deg(a) + Math.PI;
    st.front = g.localToWorld(V3(0, 0, Dp / 2 + 0.9)); st.front.y = H1;
    return st;
  }
  pavilion("orchestrator", -24, (g, st, W) => {
    add(g, console_(g, 0, -0.55, 2.2));
    [-0.85, 0, 0.85].forEach((x, i) => {
      const s = screen(0.8, 0.5, 256, 160, (gg, w, h, inf) => {
        const t = obj(inf.stats && inf.stats.totals);
        uiFrame(gg, w, h, ["TOKENS", "TOOLS", "TIME"][i], "");
        gg.fillStyle = "#fff"; gg.font = `700 46px ${FONT}`; gg.fillText([fmtTok(t.tokens), t.tool_calls == null ? "–" : String(t.tool_calls), fmtDur(inf.stats && inf.stats.wall_s)][i], 22, h * 0.48);
      });
      s.rotation.y = -x * 0.35; add(g, s, x, 1.45, -0.55 - Math.abs(x) * 0.12); st.holo.push(s);
    });
    add(g, rack(1.9), -W / 2 + 0.55, 0, -0.75);
  });
  pavilion("synthesis", 112, (g, st, W) => {
    // console with floating screens, a glass reactor sphere fed by pipes, two vials
    add(g, console_(g, -0.75, -0.45, 1.3));
    const s1 = screen(1.1, 0.66, 352, 212, (gg, w, h, inf) => { const r = inf.run; uiFrame(gg, w, h, "MERGE", r ? `${arr(r.findings).length} findings` : ""); gauge(gg, w * 0.25, h * 0.64, h * 0.2, r ? num(obj(r.scores).overall) : null); lines(gg, w * 0.48, h * 0.45, w * 0.45, 4, 5); });
    add(g, s1, -0.75, 1.55, -0.55); s1.rotation.y = 0.18; st.holo.push(s1);
    const s2 = screen(0.45, 0.45, 160, 160, (gg, w, h) => { uiFrame(gg, w, h, "!", ""); gg.strokeStyle = "#fff"; gg.lineWidth = 6; gg.beginPath(); gg.moveTo(w / 2, 50); gg.lineTo(w * 0.8, h - 30); gg.lineTo(w * 0.2, h - 30); gg.closePath(); gg.stroke(); });
    add(g, s2, -1.55, 1.75, -0.35); s2.rotation.y = 0.5; st.holo.push(s2);
    const rx = 0.8;
    add(g, shadowy(box(0.9, 0.9, 0.9, M.white, 0.1)), rx, 0.45, -0.5);
    add(g, box(0.5, 0.06, 0.04, M.neon), rx, 0.72, -0.04);
    const sphere = sph(0.5, new THREE.MeshPhysicalMaterial({ color: 0xe8f8ff, roughness: 0.04, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }), 32, 24); add(g, sphere, rx, 1.42, -0.5);
    const liquid = sph(0.42, neon(0x3fd4ff), 32, 16); liquid.geometry = new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55); add(g, liquid, rx, 1.42, -0.5);
    st.liquid = liquid;
    add(g, cyl(0.2, 0.25, 0.14, M.dark, 24), rx, 1.95, -0.5);
    add(g, glow(0x3fd4ff, 1.8, 0.45), rx, 1.35, -0.5);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(rx, 2.0, -0.5), V3(rx, 2.25, -0.5), V3(rx - 0.6, 2.25, -0.85), V3(-1.4, 2.25, -0.85), V3(-1.4, 0.4, -0.85)]), 40, 0.06, 10), M.dark);
    add(g, pipe); const pipeGlow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(rx + 0.45, 1.2, -0.5), V3(rx + 0.75, 1.2, -0.3), V3(rx + 0.75, 0.75, 0.15)]), 20, 0.05, 10), neon(0x3fd4ff)); g.add(pipeGlow);
    for (const [x, z] of [[1.35, 0.25], [1.55, 0.0]]) { add(g, cyl(0.1, 0.1, 0.28, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05 }), 16), x, 0.98, z); add(g, cyl(0.085, 0.085, 0.18, neon(0x3fd4ff), 16), x, 0.94, z); add(g, box(0.5, 0.06, 0.5, M.dark, 0.02), 1.45, 0.81, 0.12); }
    add(g, box(0.6, 0.78, 0.6, M.white, 0.06), 1.45, 0.39, 0.12);
  });
  // rooftop props: dish (benchmark), vents, small antennas
  const dish = new THREE.Group(); dish.position.copy(polar(7.6, deg(146), H1)); town.add(dish);
  add(dish, shadowy(cyl(0.18, 0.28, 0.9, M.white, 16)), 0, 0.45, 0);
  const dishHead = add(dish, new THREE.Group(), 0, 0.95, 0);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), M.white); bowl.material = M.white.clone(); bowl.material.side = THREE.DoubleSide; bowl.rotation.x = -1.0; dishHead.add(shadowy(bowl));
  add(dishHead, cyl(0.03, 0.03, 0.9, M.metal, 8), 0, 0.3, 0.25).rotation.x = -1.0;
  reg(dish, "benchmark");
  { const r = rnd(21);
    for (let i = 0; i < 9; i++) { const a = deg(165 + r() * 150), rr2 = 5.2 + r() * 2.6, p = polar(rr2, a, H1); const v = box(0.6 + r() * 0.8, 0.4 + r() * 0.4, 0.6 + r() * 0.6, M.white2, 0.05); v.position.set(p.x, H1 + 0.3, p.z); v.rotation.y = a; town.add(shadowy(v)); }
  }

  // section kiosks on the upper deck (one per reviewer) and light posts on the plaza
  REVIEWERS.forEach((id, i) => {
    const a = deg([-4, 14, 70, 86][i]), g = new THREE.Group(); g.position.copy(polar(7.9, a, 0)); g.rotation.y = a; up.add(g);
    const ag = META.agents[id];
    add(g, shadowy(box(0.5, 1.0, 0.35, M.white, 0.06)), 0, 0.5, 0);
    add(g, box(0.06, 0.6, 0.02, neon(new THREE.Color(ag.color).getHex())), 0, 0.55, 0.18);
    const scr = screen(0.95, 0.62, 256, 168, (gg, w, h, inf) => {
      const v = inf.run ? num(obj(obj(inf.run.scores).sections)[ag.section]) : null;
      uiFrame(gg, w, h, ag.short.toUpperCase(), ""); gauge(gg, w / 2, h * 0.6, h * 0.22, v);
    });
    scr.rotation.x = -0.2; add(g, scr, 0, 1.45, 0.05);
    reg(g, id);
  });
  [[10, 17.5], [80, 17.5], [28, 24], [62, 24], [-20, 20], [110, 20]].forEach(([a, d]) => {
    const g = new THREE.Group(); g.position.copy(polar(d, deg(a), 0)); scene.add(g);
    add(g, shadowy(cyl(0.07, 0.1, 2.6, M.white, 12)), 0, 1.3, 0);
    add(g, box(0.5, 0.08, 0.16, M.white, 0.03), 0, 2.62, 0);
    add(g, box(0.42, 0.03, 0.1, M.neon), 0, 2.57, 0);
    add(g, glow(0x5be3ff, 1.4, 0.35), 0, 2.5, 0);
  });

  // repo pods on the plaza
  const pods = new THREE.Group(); scene.add(pods);
  const podList = [];
  function buildPods(repos) {
    for (const p of podList) pods.remove(p.g);
    for (let i = pick.length - 1; i >= 0; i--) if (String(pick[i].userData.pick).startsWith("repo:")) pick.splice(i, 1);
    podList.length = 0;
    const list = repos.slice(0, 6), n = list.length;
    list.forEach((r, i) => {
      const a = deg(n > 1 ? 18 + (54 * i) / (n - 1) : 45), d = i % 2 ? 21.4 : 19.2;
      const g = new THREE.Group(); g.position.copy(polar(d, a, 0)); g.rotation.y = a; pods.add(g);
      add(g, shadowy(box(1.3, 0.55, 1.3, M.white, 0.1)), 0, 0.275, 0);
      const col = new THREE.Color(scoreHex(num(r.score) || 0));
      const ring = cyl(0.5, 0.5, 0.02, neon(col.getHex()), 32); add(g, ring, 0, 0.56, 0);
      const cube = box(0.62, 0.62, 0.62, holo(null, 0.32), 0.04); cube.material.color = col.clone(); cube.material.userData.keep = true; add(g, cube, 0, 1.4, 0);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.62, 0.62)), new THREE.LineBasicMaterial({ color: col, toneMapped: false })); cube.add(edges);
      add(g, glow(col.getHex(), 2, 0.4), 0, 1.4, 0);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.32), new THREE.MeshBasicMaterial({ transparent: true, map: ctex(cv(512, 128, (gg, w, h) => {
        gg.fillStyle = "#26323e"; gg.font = `600 46px ${MONO}`; gg.textAlign = "center"; gg.textBaseline = "middle";
        let s = shortRepo(r.full_name); while (gg.measureText(s).width > w - 20 && s.length > 4) s = s.slice(0, -2); if (s !== shortRepo(r.full_name)) s += "…";
        gg.fillText(s, w / 2, 40); gg.fillStyle = scoreHex(num(r.score) || 0); gg.font = `700 44px ${FONT}`; gg.fillText(num(r.score) == null ? "–" : r.score + "/100", w / 2, 96);
      })) }));
      add(g, lbl, 0, 0.3, 0.66);
      reg(g, "repo:" + r.full_name);
      podList.push({ id: "repo:" + r.full_name, g, cube });
    });
  }

  // ---- spaceship with the brain dome (benchmark) ----
  const ship = new THREE.Group(); scene.add(ship);
  { const body = new THREE.Group(); ship.add(body);
    const hull = new THREE.Mesh(new THREE.LatheGeometry([[0, -1.6], [0.32, -1.45], [0.55, -0.9], [0.62, 0], [0.55, 0.9], [0.4, 1.4], [0, 1.55]].map(([x, y]) => new THREE.Vector2(x, y)), 32), M.white);
    hull.rotation.x = Math.PI / 2; hull.scale.set(1.5, 1, 0.55); body.add(shadowy(hull, true, false));
    for (const s of [-1, 1]) {
      const wing = box(1.9, 0.08, 0.9, M.white, 0.04); wing.position.set(s * 1.25, -0.05, -0.15); wing.rotation.y = s * 0.25; body.add(shadowy(wing, true, false));
      const pod = cyl(0.22, 0.26, 1.3, M.white2, 20); pod.rotation.x = Math.PI / 2; pod.position.set(s * 2.05, 0, -0.35); body.add(pod);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24), neon(0x5be3ff)); ring.position.set(s * 2.05, 0, -1.0); body.add(ring);
      const flame = glow(0x5be3ff, 1.4, 0.9); flame.position.set(s * 2.05, 0, -1.25); body.add(flame); ship.userData.flames = (ship.userData.flames || []).concat(flame);
      const stripe = box(0.9, 0.03, 0.05, M.neon); stripe.position.set(s * 1.3, 0.0, 0.3); stripe.rotation.y = s * 0.25; body.add(stripe);
    }
    const tail = box(0.08, 0.6, 0.7, M.white, 0.03); tail.position.set(0, 0.35, -1.0); tail.rotation.x = -0.4; body.add(tail);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xdff6ff, roughness: 0.05, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false }));
    dome.position.set(0, 0.25, 0.15); body.add(dome);
    const bg = new THREE.IcosahedronGeometry(0.62, 5), p = bg.attributes.position, v = V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const fold = 0.06 * Math.sin(14 * n.x + 9 * n.y) * Math.sin(12 * n.z - 7 * n.y) + 0.03 * Math.sin(30 * n.y + 21 * n.z); const fiss = Math.abs(n.x) < 0.08 ? -0.08 : 0; v.multiplyScalar(1 + fold + fiss); v.y *= 0.8; v.z *= 1.15; p.setXYZ(i, v.x, v.y, v.z); }
    bg.computeVertexNormals();
    const brainM = std(0x0f5c78, 0.3, { emissive: new THREE.Color(0x2fd2ff), emissiveIntensity: 0.9 });
    const brainMesh = new THREE.Mesh(bg, brainM); brainMesh.position.set(0, 0.55, 0.15); body.add(brainMesh);
    const brainW = new THREE.Mesh(bg, holo(null, 0.5)); brainW.material.wireframe = true; brainW.scale.setScalar(1.015); brainMesh.add(brainW);
    add(body, glow(0x5be3ff, 2.6, 0.55), 0, 0.55, 0.15);
    ship.userData.brain = brainMesh; ship.userData.body = body;
    ship.scale.setScalar(1.15);
  }
  reg(ship, "benchmark");

  // ---- robots (after Felipe's reference figure: floating head, black visor, cyan eyes, ear fin, egg body) ----
  const RM = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xe9ecef, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.1, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
    ear: std(0x24272d, 0.4, { metalness: 0.4 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x7ef3ff, toneMapped: false }),
    line: new THREE.MeshBasicMaterial({ color: 0x5ee9ff, toneMapped: false }),
  };
  const eyeShape = new THREE.Shape(); { const w = 0.11, h = 0.085, r = 0.035; eyeShape.moveTo(-w / 2 + r, -h / 2); eyeShape.lineTo(w / 2 - r, -h / 2); eyeShape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); eyeShape.lineTo(w / 2, h / 2 - r); eyeShape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); eyeShape.lineTo(-w / 2 + r, h / 2); eyeShape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); eyeShape.lineTo(-w / 2, -h / 2 + r); eyeShape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); }
  const eyeGeo = new THREE.ShapeGeometry(eyeShape, 6);
  const bodyProfile = [[0, 0], [0.12, 0.01], [0.24, 0.08], [0.31, 0.22], [0.345, 0.42], [0.35, 0.58], [0.33, 0.7], [0.27, 0.77], [0.15, 0.8], [0, 0.805]].map(([x, y]) => new THREE.Vector2(x, y));
  const bodyGeo = new THREE.LatheGeometry(bodyProfile, 40);
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.bezierCurveTo(0.09, 0.12, 0.12, 0.34, 0.03, 0.52); finShape.bezierCurveTo(-0.02, 0.4, -0.06, 0.2, -0.05, 0.05); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 16 }); finGeo.translate(0, 0, -0.02);
  function radiusAt(y) { for (let i = 1; i < bodyProfile.length; i++) { const a = bodyProfile[i - 1], b = bodyProfile[i]; if (y <= b.y) return a.x + ((b.x - a.x) * (y - a.y)) / Math.max(1e-6, b.y - a.y); } return 0; }
  function makeRobot(id, accent) {
    const root = new THREE.Group(), hover = new THREE.Group(); root.add(hover);
    const acc = RM.line; // cyan light lines, as in the reference; the agent colour lives in the floor ring and tag
    const body = new THREE.Mesh(bodyGeo, RM.shell); body.scale.z = 0.9; hover.add(body);
    const wave = []; for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2, y = 0.24 + 0.045 * Math.sin(t * 2 + 0.6), r = radiusAt(y) + 0.004; wave.push(V3(Math.sin(t) * r, y, Math.cos(t) * r * 0.9)); }
    hover.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wave, true), 96, 0.009, 6, true), acc));
    const headPivot = new THREE.Group(); headPivot.position.y = 0.805 + 0.42; hover.add(headPivot);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 28), RM.shell); head.scale.set(1.1, 0.94, 1); headPivot.add(head);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.006, 6, 48), RM.ear); seam.rotation.x = Math.PI / 2; seam.position.y = 0.245; headPivot.add(seam);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.366, 40, 20, Math.PI / 2 - 0.98, 1.96, Math.PI / 2 - 0.4, 0.7), RM.visor); visor.scale.set(1.1, 0.94, 1); headPivot.add(visor);
    const eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, RM.eye); const ex = s * 0.13, ey = 0.01, ez = Math.sqrt(Math.max(0, 0.366 * 0.366 - (ex / 1.1) ** 2 - (ey / 0.94) ** 2)) + 0.004;
      e.position.set(ex, ey, ez); e.lookAt(ex * 2.2, ey, ez * 2.4); headPivot.add(e); eyes.push(e);
      const gl = glow(0x7ef3ff, 0.35, 0.55); gl.position.set(ex, ey, ez + 0.03); headPivot.add(gl);
    }
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.39, 0.0, -0.02); headPivot.add(ear);
      const d = cyl(0.12, 0.12, 0.08, RM.ear, 28); d.rotation.z = Math.PI / 2; ear.add(d);
      const cap = cyl(0.085, 0.085, 0.03, RM.shell, 28); cap.rotation.z = Math.PI / 2; cap.position.x = s * 0.05; ear.add(cap);
      if (s < 0) { const fg = new THREE.Group(); fg.position.set(-0.02, 0.1, -0.03); fg.rotation.set(-0.2, 0, 0.5); ear.add(fg); const fin = new THREE.Mesh(finGeo, RM.shell); fin.rotation.y = Math.PI / 2; fin.scale.set(1.3, 0.82, 1.3); fg.add(fin); }
    }
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.43, 0.66, 0.02); hover.add(sh);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 16), RM.shell); upper.position.y = -0.1; sh.add(upper);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.008, 6, 24), acc); ring.rotation.x = Math.PI / 2; ring.position.y = -0.2; sh.add(ring);
      const elbow = new THREE.Group(); elbow.position.y = -0.235; sh.add(elbow);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 6, 16), RM.shell); lower.position.y = -0.13; lower.scale.set(1, 1, 0.95); elbow.add(lower);
      arms.push({ sh, elbow, s });
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; root.add(shadow);
    const sel = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0, toneMapped: false, depthWrite: false })); sel.rotation.x = -Math.PI / 2; sel.position.y = 0.02; root.add(sel);
    hover.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    root.scale.setScalar(1.12);
    reg(root, id);
    return { root, hover, headPivot, eyes, arms, shadow, sel };
  }

  // spots and paths
  const lounge = [];
  for (let i = 0; i < 7; i++) lounge.push(polar(i % 2 ? 13.15 : 12.35, deg(33 + i * 4.2), H0));
  const loungeC = polar(12.8, deg(45), H0);
  const bots = {};
  const L1 = ["collector", "benchmark", ...REVIEWERS];
  const UP = { orchestrator: { home: null }, synthesis: { home: polar(6.2, deg(60), H1) } };
  META.order.forEach((id, i) => {
    const r = makeRobot(id, META.agents[id].color);
    scene.add(r.root);
    const level = L1.includes(id) ? "L1" : "UP";
    const b = { id, r, level, pos: V3(), yaw: 0, path: [], speed: 0, look: null, phase: Math.random() * 10, blink: 2 + Math.random() * 3, state: "waiting", want: null, wave: 0, typing: 0, chat: 0, amb: { next: 2 + Math.random() * 6, at: "lounge" } };
    if (level === "L1") { b.home = lounge[L1.indexOf(id)]; b.homeYaw = Math.atan2(loungeC.x - b.home.x, loungeC.z - b.home.z); }
    else if (id === "orchestrator") { b.home = stations.orchestrator.spot.clone(); b.homeYaw = stations.orchestrator.yaw; }
    else { b.home = UP.synthesis.home; b.homeYaw = deg(45); }
    b.pos.copy(b.home); b.yaw = b.homeYaw; b.target = { p: b.home, yaw: b.homeYaw };
    bots[id] = b;
  });
  const pol = (v) => ({ r: Math.hypot(v.x, v.z), a: Math.atan2(v.x, v.z) });
  function planPath(b, to) {
    const pts = [];
    if (b.level === "L1") {
      const f = pol(b.pos), t = pol(to);
      if (Math.abs(f.r - RW) > 0.35) pts.push(polar(RW, f.a, H0));
      let a0 = f.a, a1 = t.a; const steps = Math.ceil(Math.abs(a1 - a0) / deg(5));
      for (let i = 1; i < steps; i++) pts.push(polar(RW, a0 + ((a1 - a0) * i) / steps, H0));
      if (Math.abs(t.r - RW) > 0.35) pts.push(polar(RW, t.a, H0));
    }
    pts.push(to.clone());
    return pts;
  }
  function goTo(b, p, yaw) {
    if (b.target && b.target.p.distanceTo(p) < 0.05 && Math.abs(b.target.yaw - yaw) < 0.01) return;
    b.target = { p: p.clone(), yaw };
    b.path = b.pos.distanceTo(p) < 0.05 ? [] : planPath(b, p);
  }
  function destination(b) {
    const st = stations[b.id];
    if (b.id === "orchestrator") return { p: st.spot, yaw: st.yaw };
    if (b.state === "working") return { p: st.spot, yaw: st.yaw };
    if (b.state === "done") return b.level === "L1" ? { p: st.front, yaw: st.a } : { p: polar(6.0, deg(28), H1), yaw: deg(45) };
    return { p: b.home, yaw: b.homeYaw };
  }

  // flights: data orbs between agents
  const orbs = [];
  for (let i = 0; i < 14; i++) { const o = glow(0x7ef3ff, 0.9, 0.95); o.visible = false; const core2 = sph(0.09, neon(0xbaf7ff), 12, 8); o.add(core2); scene.add(o); orbs.push(o); }
  let flights = [];
  const anchor = (id) => { const b = bots[id]; return b ? b.pos.clone().add(V3(0, 1.4, 0)) : V3(); };

  // ambient: stars (night), motes
  const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
  { const r = rnd(77), pos = []; for (let i = 0; i < 900; i++) { const a = r() * Math.PI * 2, e = 0.08 + r() * 1.3, d = 320; pos.push(Math.cos(e) * Math.sin(a) * d, Math.sin(e) * d, Math.cos(e) * Math.cos(a) * d); } stars.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); }
  scene.add(stars);
  const motes = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x7ef3ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
  { const r = rnd(3), pos = []; for (let i = 0; i < 220; i++) { const a = r() * Math.PI * 2, d = 2 + r() * 12; pos.push(Math.sin(a) * d, H1 + r() * 16, Math.cos(a) * d); } motes.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); }
  scene.add(motes);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc9d4de, 1.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.4); sun.position.set(-26, 42, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdbe8ff, 0.6); fill.position.set(30, 18, 24); scene.add(fill);
  const glows = [V3(0, H1 + 3, 0), polar(6.5, deg(45), H1 + 2.5), polar(6.75, deg(112), H1 + 1.4), polar(11, deg(45), H0 + 1.5)].map((p) => { const l = new THREE.PointLight(0x4fd8ff, 0, 11, 1.7); l.position.copy(p); scene.add(l); return l; });

  // ---- theme ----
  let dark = false;
  function setTheme(d) {
    dark = !!d;
    const g = skyCanvas.getContext("2d"), grd = g.createLinearGradient(0, 0, 0, 256);
    if (dark) { grd.addColorStop(0, "#02060f"); grd.addColorStop(0.55, "#071528"); grd.addColorStop(1, "#0f2a48"); }
    else { grd.addColorStop(0, "#c3d3e0"); grd.addColorStop(0.55, "#e2eaf0"); grd.addColorStop(1, "#f2f5f8"); }
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256); skyTex.needsUpdate = true;
    scene.fog.color.set(dark ? 0x061224 : 0xedf2f6); scene.fog.near = dark ? 45 : 70; scene.fog.far = dark ? 150 : 190;
    hemi.intensity = dark ? 0.22 : 0.8; hemi.color.set(dark ? 0x5a78b0 : 0xffffff); hemi.groundColor.set(dark ? 0x050a14 : 0xc9d4de);
    sun.intensity = dark ? 0.42 : 2.3; sun.color.set(dark ? 0x8fa8ff : 0xfff6ea);
    fill.intensity = dark ? 0.12 : 0.6;
    renderer.toneMappingExposure = dark ? 1.05 : 0.92;
    scene.environmentIntensity = dark ? 0.09 : 0.55;
    M.snow.color.set(dark ? 0x7d90aa : 0xe9eef3);
    M.window.emissiveIntensity = dark ? 0.55 : 0;
    rackFace.emissiveIntensity = dark ? 1.3 : 0.55;
    M.ceil.color.set(dark ? 0xd8f6ff : 0xf6fbff);
    for (const m of neonMats) m.color.copy(m.userData.base).multiplyScalar(dark ? 1.35 : 0.85);
    for (const m of holoMats) {
      m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (!m.userData.keep) m.color.set(dark ? 0x6fe8ff : 0x1597c2);
      m.opacity = m.userData.op * (dark ? 1 : 0.95); m.needsUpdate = true;
    }
    for (const s of glowSprites) { s.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; s.material.opacity = s.userData.op * (dark ? 1 : 0.4); s.material.needsUpdate = true; }
    for (const l of glows) l.intensity = dark ? 9 : 0;
    stars.visible = dark; motes.material.opacity = dark ? 0.8 : 0.45; motes.material.color.set(dark ? 0x7ef3ff : 0x1aa6d1);
    RM.eye.color.set(dark ? 0x9ff7ff : 0x5ee9ff); RM.line.color.set(dark ? 0x7ef3ff : 0x3fd8f5);
  }

  // ---- camera ----
  const sphC = new THREE.Spherical();
  let view = { target: HOME.target.clone(), dist: HOME.dist, offX: 0, offY: 0 };
  let tween = null, W = 1, H = 1;
  function fitDist(d) { const aspect = W / Math.max(1, H); return d * (aspect < 1 ? Math.min(1.45, 1.05 / Math.max(0.5, aspect)) : aspect < 1.4 ? 1.1 : 1); }
  function placeCamera(target, dist, az = HOME.az, polA = HOME.pol) {
    sphC.set(dist, polA, az); camera.position.copy(target).add(V3().setFromSpherical(sphC)); controls.target.copy(target);
  }
  function setOffset(x, y) {
    view.offX = x; view.offY = y;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(W, H, x, y, W, H);
  }
  function tweenTo(target, dist, off, dur = 1.1) {
    const cur = V3().subVectors(camera.position, controls.target); sphC.setFromVector3(cur);
    tween = { t0: performance.now() / 1000, dur, fromT: controls.target.clone(), toT: target.clone(), fromD: sphC.radius, toD: dist, az: sphC.theta, pol: sphC.phi, fromO: [view.offX, view.offY], toO: off };
  }
  function stepTween(now) {
    if (!tween) return;
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const tg = tween.fromT.clone().lerp(tween.toT, e), d = tween.fromD + (tween.toD - tween.fromD) * e;
    placeCamera(tg, d, tween.az, tween.pol);
    setOffset(tween.fromO[0] + (tween.toO[0] - tween.fromO[0]) * e, tween.fromO[1] + (tween.toO[1] - tween.fromO[1]) * e);
    if (k >= 1) tween = null;
  }
  controls.addEventListener("start", () => { tween = null; });
  function centerOf(id) {
    if (bots[id]) return bots[id].pos.clone().add(V3(0, 1.1, 0));
    if (id === "tower") return V3(0, H1 + 7, 0);
    if (id === "score") return polar(6.5, deg(45), H1 + 3.2);
    if (id.startsWith("repo:")) { const p = podList.find((q) => q.id === id); return p ? p.g.position.clone().add(V3(0, 1, 0)) : V3(); }
    const st = stations[id]; if (st) return st.group.getWorldPosition(V3()).add(V3(0, 1.2, 0));
    return V3(0, 4, 0);
  }
  let focusId = null;
  function focus(id, off) {
    focusId = id;
    if (!id) { tweenTo(HOME.target, fitDist(HOME.dist), [0, 0]); return; }
    const d = id === "tower" ? 46 : id === "benchmark" && !bots.benchmark.atStation ? 40 : bots[id] ? 15 : id.startsWith("repo:") ? 17 : 21;
    tweenTo(centerOf(id), d, [off ? off.x : 0, off ? off.y : 0]);
  }
  function resetView() { focusId = null; tweenTo(HOME.target, fitDist(HOME.dist), [0, 0], 0.9); }

  // ---- picking ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hs = ray.intersectObjects(pick, false);
    for (const h of hs) { let o = h.object, vis = true; while (o) { if (!o.visible) { vis = false; break; } o = o.parent; } if (vis) return h.object.userData.pick; }
    return null;
  }
  let down = null, hoverId = null;
  canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved < 7 && dt < 700) onPick && onPick(hit(e));
  });
  let hoverQ = null;
  canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hoverQ = e; });
  canvas.addEventListener("pointerleave", () => { hoverQ = null; if (hoverId) { hoverId = null; canvas.style.cursor = "grab"; onHover && onHover(null, null); } });
  canvas.style.cursor = "grab";

  // ---- per frame ----
  const clock = new THREE.Clock();
  let running = false, raf = 0, onFrame = null, t = 0, states = {}, shipAway = 0, shipA = 0, shipPrev = V3(), cues = [];
  const tmp = V3(), tmp2 = V3();
  function animBot(b, dt) {
    const want = destination(b);
    if (!b.target || b.target.p.distanceTo(want.p) > 0.05 || Math.abs(b.target.yaw - want.yaw) > 0.01) goTo(b, want.p, want.yaw);
    let moving = false;
    if (b.path.length) {
      const nx = b.path[0]; tmp.subVectors(nx, b.pos); tmp.y = 0; const dist = tmp.length();
      const vmax = 2.6; b.speed = Math.min(vmax, b.speed + dt * 4);
      if (dist < 0.12) { b.path.shift(); }
      else { const step = Math.min(dist, b.speed * dt); b.pos.addScaledVector(tmp.normalize(), step); const yawT = Math.atan2(tmp.x, tmp.z); b.yaw = lerpAngle(b.yaw, yawT, Math.min(1, dt * 8)); moving = true; }
    } else { b.speed = 0; b.yaw = lerpAngle(b.yaw, b.target.yaw, Math.min(1, dt * 4)); }
    b.atStation = !b.path.length && b.state === "working";
    const R = b.r, ph = b.phase + t;
    R.root.position.copy(b.pos); R.root.rotation.y = b.yaw;
    R.hover.position.y = 0.28 + Math.sin(ph * 2.1) * 0.05;
    R.hover.rotation.x = moving ? 0.12 : 0;
    R.headPivot.position.y = 0.805 + 0.42 + Math.sin(ph * 2.1 + 0.9) * 0.025;
    const work = b.atStation ? 1 : 0;
    b.typing += (work - b.typing) * Math.min(1, dt * 4);
    b.wave = Math.max(0, b.wave - dt);
    R.arms.forEach((a, i) => {
      const swing = moving ? Math.sin(ph * 7 + i * Math.PI) * 0.35 : Math.sin(ph * 1.3 + i) * 0.06;
      const type = b.typing * (-0.9 + Math.sin(ph * 14 + i * 2) * 0.12);
      let x = swing * (1 - b.typing) + type, z = a.s * (0.14 + (1 - b.typing) * 0.04);
      if (b.wave > 0 && a.s > 0) { x = -2.4 + Math.sin(t * 12) * 0.25; z = 0.35; }
      a.sh.rotation.x += (x - a.sh.rotation.x) * Math.min(1, dt * 8); a.sh.rotation.z += (z - a.sh.rotation.z) * Math.min(1, dt * 8);
      a.elbow.rotation.x = b.typing * -0.6;
    });
    // head: look at the station screen while working, otherwise around / at the camera
    let ly = 0, lx = 0;
    if (b.typing > 0.5) { lx = 0.18 + Math.sin(ph * 3) * 0.05; ly = Math.sin(ph * 0.7) * 0.15; }
    else if (b.look) { tmp2.subVectors(b.look, b.pos); ly = wrap(Math.atan2(tmp2.x, tmp2.z) - b.yaw); ly = Math.max(-1, Math.min(1, ly)); }
    else { ly = Math.sin(ph * 0.4) * 0.45; lx = Math.sin(ph * 0.3) * 0.08; }
    R.headPivot.rotation.y += (ly - R.headPivot.rotation.y) * Math.min(1, dt * 3);
    R.headPivot.rotation.x += (lx - R.headPivot.rotation.x) * Math.min(1, dt * 3);
    b.blink -= dt; const bl = b.blink < 0.12 ? 0.15 : 1; if (b.blink < 0) b.blink = 2 + Math.random() * 4;
    R.eyes.forEach((e) => (e.scale.y = bl));
    const selOn = focusId === b.id ? 0.95 : hoverId === b.id ? 0.6 : 0.28;
    R.sel.material.opacity += (selOn - R.sel.material.opacity) * Math.min(1, dt * 8);
    R.shadow.material.opacity = 0.75 - Math.sin(ph * 2.1) * 0.1;
  }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const lerpAngle = (a, b, k) => a + wrap(b - a) * k;

  // ambient choreography when no stats are loaded: robots take turns at their stations
  let replay = false;
  function ambient(dt) {
    for (const id of L1) {
      const b = bots[id]; b.amb.next -= dt;
      if (b.amb.next <= 0) { b.state = b.state === "working" ? "waiting" : "working"; b.amb.next = b.state === "working" ? 9 + Math.random() * 9 : 5 + Math.random() * 8; }
    }
    const s = bots.synthesis; s.amb.next -= dt; if (s.amb.next <= 0) { s.state = s.state === "working" ? "done" : "working"; s.amb.next = 8 + Math.random() * 8; }
    bots.orchestrator.state = "working";
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta()); if (motionOK) t += dt;
    const now = performance.now() / 1000;
    stepTween(now);
    controls.update();
    if (!replay) ambient(dt);
    for (const id of META.order) animBot(bots[id], motionOK ? dt : 1);
    // orchestrator looks at whoever just started
    const ob = bots.orchestrator; ob.look = ob.lookUntil > now && ob.lookAt ? bots[ob.lookAt].pos : null;
    // stations glow while their agent works
    for (const [id, st] of Object.entries(stations)) {
      const b = bots[id], on = b ? (b.atStation ? 1 : 0) : id === "score" ? 0.6 : 0.35;
      st.active += (on - st.active) * Math.min(1, dt * 3); st.cue = Math.max(0, st.cue - dt);
      const k = 0.55 + st.active * 0.45 + st.cue * 0.6;
      for (const m of st.holo) m.material.opacity = m.material.userData.op * (dark ? 1 : 0.95) * Math.min(1.3, k);
      for (const s of st.spin) { s.rotation.z += dt * (0.4 + st.active * 2.2); s.rotation.y += dt * (0.2 + st.active * 1.2); }
      for (const s of st.blink) s.material.opacity = s.userData.op * (dark ? 1 : 0.4) * (0.6 + st.active * 0.6 + st.cue);
      if (st.cubes) st.cubes.forEach((c, i) => { const u = ((t * (0.25 + st.active * 0.5) + i / st.cubes.length) % 1); c.position.x = 1.0 - u * 2.4; c.position.y = 0.78 + Math.sin(u * Math.PI) * 0.03; c.rotation.y = u * 3; c.visible = u < 0.94; });
      if (st.arm) { st.arm.j1.rotation.y = Math.sin(t * 0.6) * 1.2; st.arm.j2.rotation.x = -0.4 + Math.sin(t * 0.9) * 0.35; st.arm.j3.rotation.x = 0.9 + Math.sin(t * 1.1) * 0.3; }
      if (st.liquid) st.liquid.position.y = 1.42 + Math.sin(t * 2) * 0.02;
    }
    // tower pulses, antenna blink, hologram float
    for (const p of tower.userData.pulses) { const u = (t * 0.12 + p.userData.p) % 1; p.position.y = 1 + u * 11.2; p.material.opacity = Math.sin(u * Math.PI) * (dark ? 1 : 0.6); }
    tower.userData.tip.material.opacity = (Math.sin(t * 3) > 0.2 ? 1 : 0.15) * (dark ? 1 : 0.8);
    scorePanel.position.y = 3.3 + Math.sin(t * 1.1) * 0.06;
    dishHead.rotation.y = Math.sin(t * 0.25) * 1.2 + (bots.benchmark.atStation ? t * 0.8 : 0);
    // pods spin
    podList.forEach((p, i) => { p.cube.rotation.y = t * 0.6 + i; p.cube.rotation.x = 0.35; p.cube.position.y = 1.4 + Math.sin(t * 1.4 + i) * 0.08; });
    motes.rotation.y = t * 0.03;
    // spaceship: circles the tower; flies out to the north stars while the benchmark works
    const awayT = bots.benchmark.atStation ? 1 : 0; shipAway += (awayT - shipAway) * Math.min(1, dt * 0.35);
    shipA += dt * 0.16;
    const circ2 = polar(20, shipA, 14 + Math.sin(shipA * 2) * 1.5), far = polar(95, shipA + 0.4, 42);
    shipPrev.copy(ship.position); ship.position.copy(circ2).lerp(far, shipAway * shipAway * (3 - 2 * shipAway));
    tmp.subVectors(ship.position, shipPrev);
    if (tmp.lengthSq() > 1e-6) { const yaw = Math.atan2(tmp.x, tmp.z); ship.rotation.y = lerpAngle(ship.rotation.y, yaw, Math.min(1, dt * 3)); }
    ship.userData.body.rotation.z = -0.32 + Math.sin(t * 0.7) * 0.05; ship.userData.body.position.y = Math.sin(t * 1.3) * 0.15;
    ship.userData.brain.rotation.y = t * 0.4;
    for (const f of ship.userData.flames) f.material.opacity = (0.6 + Math.random() * 0.3) * (dark ? 1 : 0.55);
    // data orbs
    orbs.forEach((o, i) => {
      const f = flights[i]; o.visible = !!f; if (!f) return;
      const a = anchor(f.from), b = anchor(f.to), mid = a.clone().lerp(b, 0.5); mid.y += 3 + a.distanceTo(b) * 0.15;
      const u = f.p, iu = 1 - u; o.position.set(iu * iu * a.x + 2 * iu * u * mid.x + u * u * b.x, iu * iu * a.y + 2 * iu * u * mid.y + u * u * b.y, iu * iu * a.z + 2 * iu * u * mid.z + u * u * b.z);
      o.material.color.set(colorOf(f.from)); o.material.opacity = dark ? 0.95 : 0.7;
    });
    // hover (throttled to frames)
    if (hoverQ && !down) { const id = hit(hoverQ); if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? "pointer" : "grab"; onHover && onHover(id, hoverQ); } else if (id) onHover && onHover(id, hoverQ); hoverQ = null; }
    renderer.render(scene, camera);
    onFrame && onFrame();
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    if (view.offX || view.offY) camera.setViewOffset(W, H, view.offX, view.offY, W, H);
    if (!focusId && !tween) { controls.update(); sphC.setFromVector3(V3().subVectors(camera.position, controls.target)); placeCamera(controls.target.clone(), fitDist(HOME.dist), sphC.theta, sphC.phi); }
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  W = canvas.clientWidth || 800; H = canvas.clientHeight || 600;
  placeCamera(HOME.target, HOME.dist);
  resize();
  setTheme(false);

  return {
    setTheme,
    setRun(inf) {
      info = inf;
      for (const s of screens) paint(s);
      buildPods(arr(inf.run && inf.run.repos));
      if (dark) setTheme(true); // new holo materials pick up the theme
    },
    setReplay(on) { replay = !!on; if (!on) for (const id of META.order) bots[id].amb.next = Math.random() * 4; },
    setStates(st) { states = st; for (const [id, s] of Object.entries(st)) if (bots[id]) bots[id].state = s; },
    cue(id) {
      if (id === "publish") { const s = stations.score; if (s) s.cue = 1.5; bots.orchestrator.wave = 1.6; return; }
      const st = stations[id]; if (st) st.cue = 1.2;
      const ob = bots.orchestrator; ob.lookAt = id; ob.lookUntil = performance.now() / 1000 + 2.5; ob.wave = 1.2;
    },
    setFlights(f) { flights = f; },
    focus, resetView,
    settled() { return META.order.every((id) => !bots[id].path.length); },
    projectLabel(id) {
      const b = bots[id]; if (!b) return { x: 0, y: 0, behind: true };
      const p = b.pos.clone(); p.y += 2.25 * 1.12; p.project(camera);
      return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, behind: p.z > 1, busy: b.atStation || id === "orchestrator" };
    },
    set onFrame(fn) { onFrame = fn; },
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); },
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); },
    _debug: { scene, camera, controls, bots, stations, renderer },
  };
}

// ---- tab state ----------------------------------------------------------------------------------
const O = {
  town: null, booting: false, stage: null, canvas: null, labels: null, card: null, msg: null, bubble: null, hint: null,
  tags: {}, says: {}, refs: {}, ctx: null, run: null, stats: null, dark: false, attached: false, visible: true, userPaused: false,
  selected: null, elapsed: 0, lastNow: 0, prev: {}, published: false, bubbleUntil: 0, cursors: {}, lastT: -1, latest: null, appliedKey: undefined,
};
const stat = (id) => (O.stats && O.stats.agents && O.stats.agents[id]) || null;

function buildStage() {
  const st = document.createElement("div");
  st.className = "of-stage";
  st.innerHTML = `<canvas class="of-canvas" aria-label="3D lab town: the orchestrator and seven subagents replaying the selected run. Click any building, robot, pod or the spaceship for its numbers."></canvas>
    <div class="of-labels off"></div>
    <div class="tw-hint" hidden></div>
    <div class="of-msg" role="status" hidden></div>
    <aside class="of-agent tw-card" role="dialog" aria-label="Details" hidden></aside>`;
  O.stage = st;
  O.canvas = st.querySelector("canvas");
  O.labels = st.querySelector(".of-labels");
  O.msg = st.querySelector(".of-msg");
  O.card = st.querySelector(".of-agent");
  O.hint = st.querySelector(".tw-hint");
  for (const id of META.order) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "of-tag"; b.dataset.id = id;
    b.style.setProperty("--c", colorOf(id));
    b.innerHTML = `<i></i>${esc(META.agents[id].short)}`;
    b.addEventListener("click", () => select(O.selected === id ? null : id));
    O.labels.append(b); O.tags[id] = b;
    const s = document.createElement("div");
    s.className = "of-say"; s.hidden = true; s.style.setProperty("--c", colorOf(id));
    O.labels.append(s); O.says[id] = s;
  }
  O.bubble = document.createElement("div");
  O.bubble.className = "of-bubble"; O.bubble.hidden = true;
  O.labels.append(O.bubble);
  O.card.addEventListener("click", (e) => { if (e.target.closest(".of-x")) select(null); });
  new IntersectionObserver((es) => { O.visible = es[0].isIntersecting; syncLoop(); }).observe(st);
}

function showMsg(text) { O.msg.textContent = text || ""; O.msg.hidden = !text; }

async function ensureScene() {
  if (O.town || O.booting) return;
  O.booting = true;
  showMsg("Building the town…");
  try {
    const create = await loadScene();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    O.town = create(O.canvas, {
      onPick: (id) => select(id || null),
      onHover: (id, e) => {
        for (const [k, t] of Object.entries(O.tags)) t.classList.toggle("on", k === id || k === O.selected);
        if (!id || !e) { O.hint.hidden = true; return; }
        const r = O.stage.getBoundingClientRect();
        O.hint.textContent = nameOf(id); O.hint.hidden = false;
        O.hint.style.transform = `translate(${(e.clientX - r.left + 14).toFixed(0)}px, ${(e.clientY - r.top + 12).toFixed(0)}px)`;
      },
    });
    O.town.onFrame = onFrame;
    O.town.setTheme(O.dark);
    applyRun(true);
    syncLoop();
  } catch (e) {
    console.error(e);
    scenePromise = null;
    showMsg("Couldn't load the 3D town. It needs cdn.jsdelivr.net; the numbers below still work.");
  } finally {
    O.booting = false;
  }
}

function syncLoop() {
  if (!O.town) return;
  if (O.attached && O.visible && !O.userPaused && !document.hidden) { O.lastNow = 0; O.town.resume(); }
  else O.town.pause();
}
document.addEventListener("visibilitychange", syncLoop);

function applyRun(force) {
  if (!O.town) return;
  const key = (O.run ? O.run.run_id : "") + "|" + (O.stats ? O.stats.run_id : O.stats === null ? "none" : "loading") + "|" + ((O.ctx && O.ctx.index) || []).length;
  if (!force && key === O.appliedKey) return;
  O.appliedKey = key;
  O.elapsed = 0; O.prev = {}; O.published = false; O.cursors = {}; O.lastT = -1; O.latest = null; O.bubbleUntil = 0;
  Object.values(O.says).forEach((s) => (s.hidden = true));
  O.bubble.hidden = true;
  O.town.setRun({ run: O.run, stats: O.stats, index: (O.ctx && O.ctx.index) || [], rules: (O.ctx && O.ctx.rules) || [] });
  O.town.setReplay(!!O.stats);
  O.town.setFlights([]);
  if (O.selected) renderCard(O.selected);
}

// ---- frosted cards ----------------------------------------------------------------------------------
const box = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
function usageBlock(s) {
  if (!s) return `<p class="of-foot">No usage recorded for this run yet. Step 5 of <code>/review-github</code> runs <code>scripts/agent_stats.py</code> and publishes it here.</p>`;
  const sp = s.cost_split || {}, total = Object.values(sp).reduce((x, y) => x + y, 0) || 1;
  return `<div class="of-stats">${box("Tokens", fmtTok(s.tokens.total))}${box("Cost", fmtUsd(s.cost_usd))}${box("Time", fmtDur(s.duration_s))}${box("Requests", s.requests)}${box("Tool calls", s.tool_calls)}${box("Cache saved", fmtUsd(s.cache_saved_usd))}</div>
    <div class="of-bar">${TYPES.map(([k, , c]) => `<i style="width:${((sp[k] || 0) / total) * 100}%;background:${c}"></i>`).join("")}</div>
    <ul class="of-split">${TYPES.map(([k, label, c]) => `<li><i class="of-sw" style="background:${c}"></i>${label} ${fmtTok(s.tokens[k])}<span>${fmtUsd(sp[k])}</span></li>`).join("")}</ul>
    ${Object.keys(s.tools || {}).length ? `<div class="tw-tools">${Object.entries(s.tools).filter(([k]) => k !== "ToolSearch").slice(0, 6).map(([k, v]) => `<span>${esc(k.replace(/^mcp__.*__/, ""))} <b>${v}</b></span>`).join("")}</div>` : ""}`;
}
function runFacts(id) {
  const r = O.run; if (!r) return "";
  const F = arr(r.findings), sn = obj(r.snapshot), sec = obj(obj(r.scores).sections), a = META.agents[id] || {};
  const cnt = (list) => ({ fail: list.filter((f) => f.status === "fail").length, partial: list.filter((f) => f.status === "partial").length, pass: list.filter((f) => f.status === "pass").length });
  if (a.section) {
    const mine = F.filter((f) => String(f.rule || "").startsWith(a.prefix)), c = cnt(mine), v = num(sec[a.section]);
    const rules = Object.entries(obj(obj(r.scores).rules)).filter(([k]) => k[0] === a.prefix);
    return `<div class="of-stats">${box("Section", v == null ? "–" : v + "/100")}${box("Fail", c.fail)}${box("Partial", c.partial)}</div>
      ${rules.length ? `<div class="tw-rules">${rules.map(([k, s]) => `<div><span>${esc(k)}</span><i><b style="width:${s || 0}%;background:${scoreVar(s || 0)}"></b></i><em>${s ?? "–"}</em></div>`).join("")}</div>` : ""}
      <button class="link tw-go" data-tab="${a.section === "profile" ? "profile" : "projects"}">Open the findings →</button>`;
  }
  if (id === "collector") return `<div class="of-stats">${box("In scope", sn.in_scope_repos ?? "–")}${box("Pinned", sn.pinned ?? "–")}${box("Public", sn.public_repos ?? "–")}${box("With CI", sn.repos_with_ci ?? "–")}${box("With tests", sn.repos_with_tests ?? "–")}${box("With IaC", sn.repos_with_iac ?? "–")}</div>`;
  if (id === "benchmark") { const b = obj(r.benchmark), ex = Object.values(obj(b.by_rule)).reduce((n, x) => n + arr(x).length, 0); return `<div class="of-stats">${box("Profiles", arr(b.profiles).length)}${box("Examples", ex)}${box("Rules", Object.keys(obj(b.by_rule)).length)}</div><button class="link tw-go" data-tab="sources">See the examples →</button>`; }
  if (id === "synthesis") { const ac = obj(r.actions), c = cnt(F); return `<div class="of-stats">${box("Overall", num(obj(r.scores).overall) ?? "–")}${box("Findings", F.length)}${box("Failing", c.fail)}${box("This week", arr(ac.this_week).length)}${box("Rewrites", arr(r.rewrites).length)}${box("Changes", arr(r.changes_since_last).length)}</div>`; }
  if (id === "orchestrator") return `<div class="of-stats">${box("Run", esc(r.run_id))}${box("Agents", 7)}${box("Stages", 4)}</div>`;
  return "";
}
function renderCard(id) {
  let head = "", body = "";
  const x = `<button class="of-x" type="button" aria-label="Close details">×</button>`;
  const hd = (eyebrow, title, color) => `${x}<div class="of-agent-h" style="--c:${color}"><i></i><div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3></div></div>`;
  const r = O.run, s = O.stats;
  if (META.agents[id]) {
    const a = META.agents[id], u = stat(id);
    head = hd(a.step, a.name, a.color);
    body = `<p class="of-goal">${esc(a.goal)}</p><p class="of-desc">${esc(a.description)}</p>
      <dl class="of-kv"><dt>Scope</dt><dd>${esc(a.scope)}</dd><dt>Reads</dt><dd>${esc(a.inputs)}</dd><dt>Writes</dt><dd>${esc(a.outputs)}</dd>${u ? `<dt>Model</dt><dd>${esc(u.model)}</dd>` : ""}</dl>
      ${runFacts(id)}<h4 class="tw-h">Usage this run</h4>${usageBlock(u)}`;
  } else if (id === "tower") {
    head = hd("Command Tower", "Run totals", OBJ.tower.color);
    const t = s && s.totals;
    body = t ? `<div class="of-stats">${box("Tokens", fmtTok(t.tokens))}${box("Cost", fmtUsd(t.cost_usd))}${box("Wall time", fmtDur(s.wall_s))}${box("Requests", t.requests)}${box("Tool calls", t.tool_calls)}${box("Cache saved", fmtUsd(t.cache_saved_usd))}</div>
      <div class="of-bar">${TYPES.map(([k, , c]) => `<i style="width:${((t[k] || 0) / (t.tokens || 1)) * 100}%;background:${c}"></i>`).join("")}</div>
      <ul class="of-split">${TYPES.map(([k, label, c]) => `<li><i class="of-sw" style="background:${c}"></i>${label}<span>${fmtTok(t[k])}</span></li>`).join("")}</ul>
      <h4 class="tw-h">Tokens by agent</h4><div class="tw-rules">${ROWS.filter((k) => s.agents[k]).map((k) => `<div><span>${esc(META.agents[k].short)}</span><i><b style="width:${(s.agents[k].tokens.total / Math.max(...ROWS.filter((q) => s.agents[q]).map((q) => s.agents[q].tokens.total))) * 100}%;background:${colorOf(k)}"></b></i><em>${fmtTok(s.agents[k].tokens.total)}</em></div>`).join("")}</div>
      <p class="of-foot">${esc(s.price_basis || "")}</p>` : `<p class="of-desc">The tower runs <code>/review-github</code>: collector and benchmark in parallel, four reviewers in parallel, synthesis, validate, publish.</p>${usageBlock(null)}`;
  } else if (id === "score") {
    const sc = obj(r && r.scores), sec = obj(sc.sections), idx = (O.ctx && O.ctx.index) || [], i = idx.findIndex((e) => r && e.run_id === r.run_id), prev = i >= 0 ? idx[i + 1] : null;
    const F = arr(r && r.findings);
    head = hd("Score hologram", `${sc.overall ?? "–"} out of 100`, OBJ.score.color);
    body = `<div class="tw-rules">${["profile", "projects", "engineering", "architect"].map((k) => { const v = num(sec[k]), p = prev ? num(obj(prev.sections)[k]) : null, d = v != null && p != null ? v - p : null; return `<div><span>${k[0].toUpperCase() + k.slice(1)}</span><i><b style="width:${v || 0}%;background:${scoreVar(v || 0)}"></b></i><em>${v ?? "–"}${d ? ` <small class="${d > 0 ? "up" : "dn"}">${d > 0 ? "+" : ""}${d}</small>` : ""}</em></div>`; }).join("")}</div>
      <div class="of-stats" style="margin-top:12px">${box("Fail", F.filter((f) => f.status === "fail").length)}${box("Partial", F.filter((f) => f.status === "partial").length)}${box("Pass", F.filter((f) => f.status === "pass").length)}</div>
      <p class="of-desc">${esc(r ? r.summary : "")}</p><button class="link tw-go" data-tab="overview">Open the overview →</button>`;
  } else if (id === "library") {
    const rules = (O.ctx && O.ctx.rules) || [], rs = obj(obj(r && r.scores).rules);
    head = hd("Rules library", `${rules.length || Object.keys(rs).length} rules`, OBJ.library.color);
    const groups = [["P", "Profile"], ["J", "Projects"], ["E", "Engineering"], ["A", "Architect"]];
    body = `<p class="of-desc">The only scoring criteria, from <code>context/rules.md</code>. North stars are examples, never criteria.</p>
      ${groups.map(([p, label]) => { const ks = Object.keys(rs).filter((k) => k[0] === p); return ks.length ? `<h4 class="tw-h">${label}</h4><div class="tw-rules">${ks.map((k) => { const txt = (rules.find((x) => x.id === k) || {}).text || ""; return `<div title="${esc(txt)}"><span>${esc(k)}</span><i><b style="width:${rs[k] || 0}%;background:${scoreVar(rs[k] || 0)}"></b></i><em>${rs[k] ?? "–"}</em></div>`; }).join("")}</div>` : ""; }).join("")}`;
  } else if (id === "vault") {
    const idx = (O.ctx && O.ctx.index) || [];
    head = hd("Run archive", `${idx.length} run${idx.length === 1 ? "" : "s"}`, OBJ.vault.color);
    body = `<p class="of-desc">Every run of <code>/review-github</code> is kept in Cloudflare KV, so each fix shows up in the score.</p>
      <div class="tw-rules">${idx.slice(0, 8).map((e) => `<div><span>${esc(fmtWhen(e.run_at))}</span><i><b style="width:${e.overall || 0}%;background:${scoreVar(e.overall || 0)}"></b></i><em>${e.overall ?? "–"}${e.usage ? ` <small>${fmtTok(e.usage.tokens)}</small>` : ""}</em></div>`).join("")}</div>
      <button class="link tw-go" data-tab="history">Open the history →</button>`;
  } else if (id.startsWith("repo:")) {
    const name = id.slice(5), rp = arr(r && r.repos).find((x) => x.full_name === name) || {}, F = arr(r && r.findings).filter((f) => f.repo === name);
    const v = num(rp.score), pf = obj(r && r.portfolio), verdict = (arr(pf.verdicts).find((x) => x.repo === name) || {}).verdict || rp.verdict;
    head = hd("Repo pod", shortRepo(name), v == null ? "#22a6b3" : scoreHex(v));
    body = `<p class="of-desc">${esc(rp.description || "")}</p>
      <div class="of-stats">${box("Score", v == null ? "–" : v + "/100")}${box("Verdict", esc(verdict || "–"))}${box("Fail", F.filter((f) => f.status === "fail").length)}</div>
      ${F.filter((f) => f.status !== "pass").slice(0, 4).map((f) => `<div class="tw-find"><b>${esc(f.rule)}</b><span>${esc(f.finding)}</span></div>`).join("")}
      <button class="link tw-go" data-tab="projects" data-target="${esc(name)}">Open this repo →</button>`;
  }
  O.card.style.setProperty("--c", colorOf(id));
  O.card.innerHTML = head + body;
}

function select(id) {
  O.selected = id;
  const host = O.stage.closest(".of-card");
  if (host) host.classList.toggle("of-picked", !!id);
  if (id) {
    renderCard(id);
    O.card.hidden = false;
    const wide = O.stage.clientWidth > 700;
    if (O.town) O.town.focus(id, wide ? { x: 190, y: 0 } : { x: 0, y: O.stage.clientHeight * 0.24 });
  } else {
    O.card.hidden = true;
    if (O.town) O.town.focus(null);
  }
  for (const [k, t] of Object.entries(O.tags)) { t.classList.toggle("on", k === id); t.classList.toggle("dim", !!id && k !== id); }
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && O.attached && O.selected) select(null); });

// ---- per frame: labels, replay clock, bubbles, pipeline, status ---------------------------------------
function place(node, p, dy, W) {
  const half = node.offsetWidth / 2 + 8;
  const x = Math.min(Math.max(p.x, half), W - half);
  node.style.transform = `translate(${x.toFixed(1)}px, ${(p.y - dy).toFixed(1)}px) translate(-50%, -100%)`;
}
function phrase(ev) {
  const [, kind, detail] = ev;
  if (kind === "agent") return `Launching ${META.agents[detail] ? META.agents[detail].short : "an agent"}`;
  return (PHRASES[kind] || PHRASES.tool)(detail);
}
function say(text) {
  O.bubble.textContent = text;
  O.bubbleUntil = performance.now() / 1000 + 3.2;
  O.latest = { id: "orchestrator", text };
}
function onFrame() {
  const town = O.town, W = O.stage.clientWidth, H = O.stage.clientHeight;
  if (O.labels.classList.contains("off")) { O.labels.classList.remove("off"); showMsg(""); }
  for (const id of META.order) {
    const p = town.projectLabel(id), tag = O.tags[id];
    tag.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    // only agents at work carry a tag; the lounge crowd stays clean until hovered or picked
    const show = !p.behind && p.y > 70 && p.y < H - 10 && (p.busy || O.selected === id || tag.classList.contains("on"));
    tag.style.visibility = show ? "visible" : "hidden";
  }
  const now = performance.now() / 1000;
  const dt = O.lastNow ? Math.min(0.25, now - O.lastNow) : 0;
  O.lastNow = now;
  const run = O.stats;
  if (!run) { setStatus("orchestrator", O.stats === undefined ? "Loading the run stats…" : "Ambient mode · usage appears after the next /review-github run"); return; }
  const cycle = LOOP_S + HOLD_S, settled = town.settled();
  let regroup = false;
  if (O.elapsed > 0 || settled) O.elapsed += dt; else regroup = true;
  if (O.elapsed >= cycle) { if (settled) O.elapsed -= cycle; else { O.elapsed = cycle - 1e-3; regroup = true; } }
  const wall = run.wall_s || 1, e = O.elapsed, t = Math.min(wall, (e / LOOP_S) * wall), holding = e > LOOP_S;
  const st = {};
  for (const id of META.order) {
    const s = run.agents[id];
    if (!s) { st[id] = id === "orchestrator" ? "working" : "waiting"; continue; }
    if (id === "orchestrator") st[id] = "working";
    else st[id] = holding ? "waiting" : t < s.start_offset_s ? "waiting" : t < s.start_offset_s + s.duration_s ? "working" : "done";
  }
  town.setStates(st);
  const started = Object.keys(st).filter((id) => id !== "orchestrator" && st[id] === "working" && O.prev[id] !== "working");
  if (started.length) {
    const rev = started.filter((id) => REVIEWERS.includes(id));
    say(rev.length > 1 ? ORDERS["profile-reviewer"] : started.length > 1 ? started.map((id) => META.agents[id].short).join(" & ") + ": go, in parallel." : ORDERS[started[0]] || `${META.agents[started[0]].short}, go.`);
    started.forEach((id) => town.cue(id));
  }
  const synthDone = st.synthesis === "done" || (holding && run.agents.synthesis);
  if (synthDone && !O.published) { say(ORDERS.publish); town.cue("publish"); O.published = true; }
  if (!synthDone) O.published = false;
  O.prev = st;
  const bp = town.projectLabel("orchestrator");
  O.bubble.hidden = now > O.bubbleUntil || bp.behind;
  if (!O.bubble.hidden) place(O.bubble, bp, 34, W);
  const narrow = W < 640;
  if (t < O.lastT) { O.cursors = {}; O.latest = null; }
  O.lastT = t;
  for (const id of META.order) {
    const events = (run.agents[id] && run.agents[id].events) || [];
    const c = O.cursors[id] || (O.cursors[id] = { i: 0, shown: -1, shownAt: 0, until: 0 });
    while (c.i < events.length && events[c.i][0] <= t) c.i++;
    const b = O.says[id];
    if (!holding && c.i > 0 && c.i - 1 !== c.shown && now - c.shownAt > 1.3) {
      c.shown = c.i - 1; c.shownAt = now; c.until = now + 2.2;
      b.textContent = phrase(events[c.shown]);
      if (!(id === "orchestrator" && now < O.bubbleUntil)) O.latest = { id, text: b.textContent };
    }
    const p = town.projectLabel(id);
    const hide = narrow || now > c.until || p.behind || (id === "orchestrator" && !O.bubble.hidden);
    b.hidden = hide;
    if (!hide) place(b, p, 34, W);
  }
  const flights = [];
  if (!holding) for (const [from, to] of EDGES) {
    const a = run.agents[from], b = run.agents[to];
    if (!a || !b) continue;
    const end = a.start_offset_s + a.duration_s, begin = end - 0.01 * wall, arrive = Math.max(b.start_offset_s, begin + 0.06 * wall);
    const p = (t - begin) / (arrive - begin);
    if (p > 0 && p < 1) flights.push({ from, to, p });
  }
  town.setFlights(flights.slice(0, 14));
  for (const [id, tag] of Object.entries(O.tags)) tag.dataset.state = st[id];
  if (regroup) setStatus("orchestrator", holding ? "Run complete · next replay once everyone is back in the lounge" : "Getting everyone back to the lounge");
  else if (holding) setStatus("orchestrator", "Run complete · published to the app");
  else if (O.latest) setStatus(O.latest.id, O.latest.text);
  else setStatus("orchestrator", "Starting the run");
  const r = O.refs;
  if (r.playhead) r.playhead.style.left = `calc(96px + (100% - 96px) * ${(t / wall).toFixed(4)})`;
  if (r.clock) r.clock.textContent = `${fmtDur(t)} / ${fmtDur(wall)} · replay ${Math.max(1, Math.round(wall / LOOP_S))}×`;
  if (r.pipe) renderPipe(t);
}
function setStatus(id, text) {
  const key = id + "|" + text, el = O.refs.status;
  if (!el || el.dataset.k === key) return;
  el.dataset.k = key;
  el.style.setProperty("--c", colorOf(id));
  el.querySelector("b").textContent = nameOf(id);
  el.querySelector("span").textContent = text;
}
function renderPipe(t) {
  const html = META.pipeline.map((s, i) => {
    let state = "";
    if (!s.ids.length) { const y = stat("synthesis"); state = y && t >= y.start_offset_s + y.duration_s ? "on" : ""; }
    else {
      const ss = s.ids.map(stat).filter(Boolean);
      if (ss.length) { const started = ss.some((x) => t >= x.start_offset_s), done = ss.every((x) => t >= x.start_offset_s + x.duration_s); state = done ? "done" : started ? "on" : ""; }
    }
    const c = s.ids[0] ? colorOf(s.ids[0]) : "var(--accent)";
    return `${i ? '<li class="sep">›</li>' : ""}<li class="${state}" style="--c:${c}">${s.label}</li>`;
  }).join("");
  if (O.refs.pipe.dataset.h !== html) { O.refs.pipe.dataset.h = html; O.refs.pipe.innerHTML = html; }
}

// ---- tab markup ---------------------------------------------------------------------------------------
function tiles(st) {
  const t = st.totals, tile = (k, v, sub) => `<div class="glass of-tile"><span>${k}</span><b>${v}</b><small>${sub}</small></div>`;
  return `<section class="of-tiles">${tile("Tokens", fmtTok(t.tokens), `${t.requests} model requests`)}${tile("Cost", fmtUsd(t.cost_usd), "API list prices, approximate")}${tile("Wall time", fmtDur(st.wall_s), `${t.tool_calls} tool calls`)}${tile("Saved by cache", fmtUsd(t.cache_saved_usd), `${fmtTok(t.cache_read)} cache reads`)}</section>`;
}
function runTiles(r) {
  const F = arr(r.findings), sn = obj(r.snapshot), tile = (k, v, sub) => `<div class="glass of-tile"><span>${k}</span><b>${v}</b><small>${sub}</small></div>`;
  return `<section class="of-tiles">${tile("Overall", num(obj(r.scores).overall) ?? "–", "out of 100")}${tile("Findings", F.length, `${F.filter((f) => f.status === "fail").length} failing`)}${tile("Repos", sn.in_scope_repos ?? "–", `${sn.pinned ?? "–"} pinned`)}${tile("This week", arr(obj(r.actions).this_week).length, "actions")}</section>`;
}
function timeline(st) {
  const rows = ROWS.map((id) => {
    const s = st.agents[id];
    const bar = s ? `<i style="--c:${colorOf(id)};left:${(s.start_offset_s / st.wall_s) * 100}%;width:${Math.max(0.8, (s.duration_s / st.wall_s) * 100)}%" title="${esc(nameOf(id))}: ${fmtDur(s.duration_s)}"></i>` : "";
    return `<div class="of-tl-row"><span>${esc(META.agents[id].short)}</span>${bar}</div>`;
  }).join("");
  return `<section class="glass card"><div class="sec-h"><h2>Run replay</h2><span class="muted mono" id="twClock"></span></div>
    <ol class="of-pipe" id="twPipe"></ol><div class="of-tl">${rows}<div class="of-playhead" id="twPlayhead"></div></div></section>`;
}
function costSplit(st) {
  const rows = ROWS.filter((id) => st.agents[id]);
  const max = Math.max(...rows.map((id) => st.agents[id].cost_usd || 0), 0.0001);
  return `<section class="glass card"><div class="sec-h"><h2>Where the cost goes</h2><span class="muted">By agent and token type</span></div>
    <div class="of-sc">${rows.map((id) => { const sp = st.agents[id].cost_split || {}; return `<div class="of-sc-row"><span>${esc(META.agents[id].short)}</span><div class="of-bar">${TYPES.map(([k, label, c]) => `<i style="width:${((sp[k] || 0) / max) * 100}%;background:${c}" title="${label} ${fmtUsd(sp[k])}"></i>`).join("")}</div></div>`; }).join("")}</div>
    <ul class="of-legend">${TYPES.map(([, label, c]) => `<li><i class="of-sw" style="background:${c}"></i>${label}</li>`).join("")}</ul></section>`;
}
function compare(index, cur) {
  const runs = index.filter((e) => e.usage);
  if (!runs.length) return "";
  const max = Math.max(...runs.map((r) => r.usage.tokens || 0), 1);
  const delta = (a, b, what) => { if (!b) return ""; const pct = ((a - b) / b) * 100; return `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct).toFixed(0)}% ${what}`; };
  const rows = runs.map((r, i) => {
    const prev = runs[i + 1], u = r.usage;
    const segs = ROWS.filter((id) => obj(u.by_agent)[id]).map((id) => `<i style="width:${(u.by_agent[id] / max) * 100}%;background:${colorOf(id)}" title="${esc(nameOf(id))} ${fmtTok(u.by_agent[id])} tokens"></i>`).join("");
    return `<button class="of-cmp-row ${r.run_id === cur ? "cur" : ""}" type="button" data-run="${esc(r.run_id)}">
      <span class="of-cmp-when">${esc(fmtWhen(r.run_at))}</span><span class="of-cmp-bar">${segs}</span>
      <span class="of-cmp-nums"><b>${fmtTok(u.tokens)}</b> tok · ${fmtUsd(u.cost_usd)} · ${fmtDur(u.wall_s)}<br>${prev ? `${delta(u.tokens, prev.usage.tokens, "tokens")} · ${delta(u.wall_s, prev.usage.wall_s, "time")}` : "first run with stats"}</span></button>`;
  }).join("");
  return `<section class="glass card"><div class="sec-h"><h2>Compare runs</h2><span class="muted">Tokens by agent, one scale. Pick a run to open it.</span></div>
    <ul class="of-legend" style="margin:0 0 10px">${ROWS.map((id) => `<li><i class="of-sw" style="background:${colorOf(id)}"></i>${esc(META.agents[id].short)}</li>`).join("")}</ul>
    <div class="of-cmp">${rows}</div></section>`;
}
function view(ctx) {
  O.ctx = ctx;
  O.dark = !!ctx.dark;
  O.run = ctx.run || null;
  O.stats = ctx.stats;
  const st = O.stats, r = O.run;
  const note = st === undefined ? "Loading stats…" : st === null ? "Ambient mode · no usage recorded for this run" : "";
  const card = `<section class="glass of-card tw-town">
    <div class="of-slot" id="twSlot"></div>
    <div class="of-head">
      <span class="eyebrow">Town${r ? " · " + esc(fmtDay(r.run_at)) : ""}</span>
      <div class="of-tools"><button class="of-btn" type="button" data-tw="reset">Reset view</button><button class="of-btn" type="button" data-tw="pause" aria-pressed="${O.userPaused}">${O.userPaused ? "Play" : "Pause"}</button></div>
      <h2 class="of-title"><span class="tone">Eight agents,</span>one lab town</h2>${note ? `<span class="of-note">${esc(note)}</span>` : ""}
    </div>
    <div class="of-status" id="twStatus" aria-live="polite"><i></i><div><b></b><span></span></div></div>
  </section>`;
  const facts = r ? runTiles(r) : "";
  if (!st) {
    const empty = st === null ? `<section class="glass card"><div class="sec-h"><h2>No agent usage for this run yet</h2></div><p class="muted">Step 5 of <code>/review-github</code> runs <code>scripts/agent_stats.py</code> and publishes tokens, cost and timing per agent. Until then the town runs in ambient mode; every building, robot, pod and the spaceship still opens its card.</p></section>` : "";
    return `<div class="tw-wrap">${card}${facts}${empty}</div>`;
  }
  return `<div class="tw-wrap">${card}${tiles(st)}${timeline(st)}
    <div class="grid2">${costSplit(st)}${compare((ctx.index || []), st.run_id) || `<section class="glass card"><div class="sec-h"><h2>Compare runs</h2></div><p class="muted">The next run with stats shows up here next to this one.</p></section>`}</div>
    <p class="muted" style="font-size:.78rem">Input and cache tokens are exact; output tokens are estimated from visible text, so costs are approximate API list prices, not your subscription. Tool calls show only their kind, a website host or a file name.</p></div>`;
}
function attach() {
  const slot = document.getElementById("twSlot");
  if (!slot) return;
  if (!O.stage) buildStage();
  slot.append(O.stage);
  O.refs = { status: document.getElementById("twStatus"), pipe: document.getElementById("twPipe"), playhead: document.getElementById("twPlayhead"), clock: document.getElementById("twClock") };
  O.attached = true;
  if (O.town) { O.town.setTheme(O.dark); applyRun(false); }
  ensureScene();
  syncLoop();
}
function detach() {
  if (!O.attached) return;
  O.attached = false;
  if (O.selected) select(null);
  O.hint && (O.hint.hidden = true);
  syncLoop();
}
document.addEventListener("click", (e) => {
  if (!O.attached) return;
  const b = e.target.closest("[data-tw]");
  if (b && b.dataset.tw === "reset") { select(null); if (O.town) O.town.resetView(); return; }
  if (b && b.dataset.tw === "pause") {
    O.userPaused = !O.userPaused;
    b.textContent = O.userPaused ? "Play" : "Pause";
    b.setAttribute("aria-pressed", String(O.userPaused));
    syncLoop();
  }
});

window.Town = { view, attach, detach, setTheme(d) { O.dark = !!d; if (O.town) O.town.setTheme(O.dark); } };
// follow the system theme while the app does (no explicit choice saved)
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => { if (!document.documentElement.hasAttribute("data-theme")) window.Town.setTheme(e.matches); });
})();
