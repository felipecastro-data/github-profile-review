/* GitHub Review — Office tab (file kept as town.js). A Three.js 0.170 lab office building (ES modules from jsDelivr, loaded the first
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
  core: { name: "Compute core", color: "#8b6cf0" },
  deploy: { name: "Deploy pad", color: "#3fa37a" },
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
    const [THREE, { OrbitControls }, { RoundedBoxGeometry }, { RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { mergeGeometries }] = await Promise.all([
      import(CDN + "+esm"), ex("controls/OrbitControls"), ex("geometries/RoundedBoxGeometry"), ex("environments/RoomEnvironment"),
      ex("postprocessing/EffectComposer"), ex("postprocessing/RenderPass"), ex("postprocessing/UnrealBloomPass"), ex("postprocessing/OutputPass"), ex("utils/BufferGeometryUtils"),
    ]);
    return (canvas, opts) => createTown(THREE, { OrbitControls, RoundedBoxGeometry, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, mergeGeometries }, canvas, opts);
  })());
}

function createTown(THREE, X, canvas, { onPick, onHover }) {
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const deg = (d) => (d * Math.PI) / 180;
  const polar = (r, a, y = 0) => V3(r * Math.sin(a), y, r * Math.cos(a));
  const phone = Math.min(innerWidth, innerHeight) < 700 || matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const PR = Math.min(phone ? 1.6 : 2, devicePixelRatio || 1);
  renderer.setPixelRatio(PR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0xeef3f7, 70, 190);

  // Town v2: orthographic iso camera. VH0 = world units visible vertically at zoom 1; framing is set as a visible height.
  const VH0 = 36, CAM_R = 150;
  const camera = new THREE.OrthographicCamera(-VH0 / 2, VH0 / 2, VH0 / 2, -VH0 / 2, 1, 600);
  // HDR pipeline: MSAA scene pass -> bloom (only HDR emissive light passes the threshold) -> ACES + sRGB
  const composer = new X.EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: phone ? 0 : 4 }));
  // Measured at 1440×900 on a 2× display: full 2× MSAA + full-res bloom cost 16.5 ms a frame; scene at 1.5×
  // with 4× MSAA and bloom at half that resolution costs 4.6 ms and looks the same.
  composer.setPixelRatio(Math.min(PR, 1.5));
  composer.addPass(new X.RenderPass(scene, camera));
  const bloom = new X.UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 1.0);
  { const set = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); }
  composer.addPass(bloom);
  let bloomBase = 0.42; // scaled down in close-ups, where neon covers more of the screen and would veil it
  composer.addPass(new X.OutputPass());
  const controls = new X.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
  controls.minZoom = VH0 / 110; controls.maxZoom = VH0 / 3.5; controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.8;
  controls.minPolarAngle = 0.42; controls.maxPolarAngle = 1.36;
  controls.minAzimuthAngle = deg(45) - 1.75; controls.maxAzimuthAngle = deg(45) + 1.75;
  canvas.style.touchAction = "pan-y"; // vertical swipes scroll the page, horizontal ones orbit
  const HOME = { target: V3(1.0, 9.8, 5.0), vh: 42, az: deg(45), pol: deg(55) }; // 35° elevation, looking down the building's diagonal

  // ---- textures and materials ----
  const cv = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; if (draw) draw(c.getContext("2d"), w, h); return c; };
  const ctex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const rnd = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const glowTex = ctex(cv(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.28, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));
  const shadowTex = ctex(cv(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(0,0,0,.55)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));

  const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const phys = (color, roughness, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.22, ...extra });
  const M = {
    white: phys(0xf3f5f7, 0.35),                      // hero panels: glossy white shell
    white2: phys(0xd9dfe5, 0.45, { clearcoat: 0.15 }), // recessed walls and floors: a step darker for depth
    grey: phys(0xb9c2cb, 0.5, { clearcoat: 0.1 }),
    pave: std(0xeef1f4, 0.85),
    dark: std(0x2a323c, 0.32, { metalness: 0.8 }),    // gunmetal
    darker: std(0x151b22, 0.28, { metalness: 0.85 }),
    metal: std(0x9aa3ad, 0.3, { metalness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a141d, roughness: 0.06, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 }),
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

  // holographic panel look on top of MeshBasicMaterial: scanlines, a bright edge and a slight flicker
  const HT = { value: 0 };
  function holoFx(m, seed = Math.random() * 10) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = HT; sh.uniforms.uSeed = { value: seed };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vHuv;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHuv = uv;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vHuv; uniform float uT; uniform float uSeed;").replace("#include <opaque_fragment>", `
        float scan = 0.8 + 0.2 * sin(vHuv.y * 260.0 - uT * 5.0);
        vec2 eg = min(vHuv, 1.0 - vHuv); float edge = 1.0 - smoothstep(0.0, 0.03, min(eg.x, eg.y));
        float flick = 0.94 + 0.06 * sin(uT * 23.0 + uSeed * 7.0) * sin(uT * 3.1 + uSeed);
        outgoingLight = (outgoingLight * scan + diffuse * edge * 1.6) * flick;
        diffuseColor.a = max(diffuseColor.a * scan, edge * opacity * 0.85) * flick;
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => "holoFx";
    return m;
  }
  // dynamic canvas screens (redrawn when the run changes)
  const screens = [];
  const holoBack = new THREE.MeshBasicMaterial({ color: 0x0a1e2c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  function screen(w, h, cw, ch, draw, opacity) {
    const c = cv(cw, ch), t = ctex(c), m = holoFx(holo(t, opacity)); m.userData.backed = true;
    const mesh = plane(w, h, m);
    const bk = plane(w * 0.985, h * 0.985, holoBack); bk.position.z = -0.006; bk.renderOrder = -1; mesh.add(bk);
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

  // ---- sky, ground, far hills (v2: nothing near the building but a paved plaza that fades into fog) ----
  const skyCanvas = cv(16, 256), skyTex = ctex(skyCanvas);
  scene.background = skyTex;
  const ground = plane(900, 900, M.snow); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const hills = new THREE.Group(); scene.add(hills); // (v2: none; the orthographic view has no horizon, far ground just fades)
  const paveTex = ctex(cv(512, 512, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(110,125,140,.12)"; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }));
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping; paveTex.repeat.set(10, 10);
  const fadeTex = ctex(cv(256, 256, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, w * 0.22, w / 2, w / 2, w / 2); r.addColorStop(0, "#fff"); r.addColorStop(1, "#000"); g.fillStyle = r; g.fillRect(0, 0, w, w); }), false);
  M.plaza = std(0xffffff, 0.8, { map: paveTex, alphaMap: fadeTex, transparent: true, depthWrite: false });
  const plaza = plane(80, 80, M.plaza); plaza.rotation.x = -Math.PI / 2; plaza.rotation.z = deg(45); plaza.position.y = 0.02; plaza.receiveShadow = true; scene.add(plaza);

  // ---- architecture helpers ----
  // Static architecture is tagged with fixed() and merged per material by bake() once the town is built.
  const fixed = (o) => { o.traverse((c) => { if (c.isMesh) c.userData.bake = true; }); return o; };
  const OCT = deg(22.5);
  function roundedPoly(n, r, c, rot = 0) {
    const s = new THREE.Shape(), pts = [];
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a))); }
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = p.clone().add(pts[(i + n - 1) % n].clone().sub(p).setLength(c)), b = p.clone().add(pts[(i + 1) % n].clone().sub(p).setLength(c));
      if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
      s.quadraticCurveTo(p.x, p.y, b.x, b.y);
    }
    s.closePath(); return s;
  }
  // flat slab from a plan shape, bevelled on all edges, bottom at y = 0, top at y = h
  function slab(shape, h, m, bevel = 0.08, seg = 10) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: seg });
    g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0); return new THREE.Mesh(g, m);
  }
  // light strips along the eight edges of an octagon slab (circumradius R, rounded corners c)
  function octStrips(parent, R, c, y, out, t = 0.05) {
    const g = new THREE.Group(); parent.add(g);
    const inr = R * Math.cos(OCT), len = 2 * R * Math.sin(OCT) - 2 * c;
    for (let k = 0; k < 8; k++) { const a = deg(45 * k), s = box(len, t, t, M.neon); s.position.copy(polar(inr + out, a, y)); s.rotation.y = a; g.add(s); }
    return fixed(g);
  }
  // straight segment in a group's XY plane (circuit lines, emblems)
  function seg(parent, x0, y0, x1, y1, z, t = 0.05, m = M.neon) {
    const b = box(Math.hypot(x1 - x0, y1 - y0) + t, t, 0.02, m); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); b.rotation.z = Math.atan2(y1 - y0, x1 - x0); parent.add(b); return b;
  }
  const deckTex = ctex(cv(256, 256, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(96,112,128,.3)"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.strokeStyle = "rgba(96,112,128,.12)"; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.fillStyle = "rgba(96,112,128,.32)"; for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  }));
  deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping; deckTex.repeat.set(1 / 3.2, 1 / 3.2);
  M.deck = phys(0xf1f4f6, 0.4, { map: deckTex, clearcoat: 0.2 });
  const ventTex = ctex(cv(256, 64, (g, w, h) => { g.fillStyle = "#e9edf1"; g.fillRect(0, 0, w, h); g.fillStyle = "#3a434d"; for (let x = 6; x < w; x += 12) g.fillRect(x, 8, 6, h - 16); }));
  M.vent = phys(0xffffff, 0.5, { map: ventTex, clearcoat: 0.05 });
  { const t2 = ventTex.clone(); t2.wrapS = THREE.RepeatWrapping; t2.repeat.set(9, 1); t2.needsUpdate = true; M.ventC = phys(0xffffff, 0.5, { map: t2, clearcoat: 0.05 }); }
  const fanTex = ctex(cv(128, 128, (g, w) => { g.fillStyle = "#2a323b"; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#8b96a2"; g.lineWidth = 3; for (let r = 14; r < w / 2 - 4; r += 9) { g.beginPath(); g.arc(w / 2, w / 2, r, 0, Math.PI * 2); g.stroke(); } g.lineWidth = 5; for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + Math.cos(a) * (w / 2 - 6), w / 2 + Math.sin(a) * (w / 2 - 6)); g.stroke(); } }));
  M.fan = std(0xffffff, 0.5, { map: fanTex, transparent: true });

  // ---- massing (Town v2, refs 1–2): one compact, rectilinear building seen down its diagonal ----
  // Plan: a plus of four arms with 45° chamfered ends on a stepped plinth. L1 holds the agents' rooms as open
  // alcoves in the two faces the camera sees (+z, +x); L2, a chamfered square, sits on L1 and cantilevers over
  // the entrance court between the two front arms; the tower stands on L2.
  const A = 8, B = 14, CH = 2.2;                         // arm half-width, arm half-length, end chamfer
  const P0 = 0.6, T1 = 5.0, T2 = 8.6, SLAB = 0.45, EAVE = 0.3;  // plinth top (ground floor), L1 roof, L2 roof
  const D = 3.2, D2 = 3.0;                               // room depth on L1 / L2
  const Q2 = { x0: -6.5, x1: 10.5, z0: -6.5, z1: 10.5, c: 2.0 };
  const H0 = P0, H1 = T1, WALL = T1 - SLAB - P0;
  const TX = 0.5, TZ = 0.5;                              // tower centre on the L2 roof
  M.white.color.set(0xf2f4f6);
  M.mid = phys(0x9aa3ab, 0.55, { clearcoat: 0.05 });     // insets and parapet caps
  M.char = std(0x22282e, 0.42, { metalness: 0.3 });      // recessed floors, soffits, window bands
  M.floor = phys(0xb9c0c7, 0.5, { map: deckTex, clearcoat: 0.08 }); // terrace and plinth paving
  const town = new THREE.Group(); scene.add(town);
  const diagPt = (d, l, y = 0) => V3((d + l) / Math.SQRT2, y, (d - l) / Math.SQRT2); // d along the view diagonal, l across it

  // plan polygons are lists of [x, z]; clip a polygon by half-planes nx·x + nz·z <= k (the 45° chamfers)
  function clipPoly(pts, hps) {
    for (const [nx, nz, k] of hps) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length], dp = nx * p[0] + nz * p[1] - k, dq = nx * q[0] + nz * q[1] - k;
        if (dp <= 0) out.push(p);
        if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const u = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
      }
      pts = out; if (pts.length < 3) return null;
    }
    return pts;
  }
  const rectPts = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const planShape = (pts) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  function prism(pts, y0, y1, m, bevel = 0.04) {
    if (!pts) return null;
    const h = y1 - y0, bv = Math.min(bevel, h / 3);
    const geo = new THREE.ExtrudeGeometry(planShape(pts), bv > 0 ? { depth: h - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 1 } : { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, y0 + bv, 0);
    const s = new THREE.Mesh(geo, m); town.add(s); return fixed(s);
  }
  function plate(pts, y, m) { const geo = new THREE.ShapeGeometry(planShape(pts)); geo.rotateX(-Math.PI / 2); const p = new THREE.Mesh(geo, m); p.position.y = y; town.add(p); return fixed(p); }
  function plusPts(g = 0) {
    const a = A + g, b = B + g, c = CH + g * (2 - Math.SQRT2);
    return [[b, -a + c], [b, a - c], [b - c, a], [a, a], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, a], [-b + c, a], [-b, a - c], [-b, -a + c], [-b + c, -a], [-a, -a], [-a, -b + c], [-a + c, -b], [a - c, -b], [a, -b + c], [a, -a], [b - c, -a]];
  }
  const plusHP = [[1, 1, A + B - CH], [1, -1, A + B - CH], [-1, 1, A + B - CH], [-1, -1, A + B - CH]];
  function sqPts(q, g = 0) {
    const c = q.c + g * (2 - Math.SQRT2), x0 = q.x0 - g, x1 = q.x1 + g, z0 = q.z0 - g, z1 = q.z1 + g;
    return [[x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c], [x0 + c, z0], [x1 - c, z0]];
  }
  const sqHP = [[1, 1, Q2.x1 + Q2.z1 - Q2.c], [1, -1, Q2.x1 - Q2.z0 - Q2.c], [-1, 1, -Q2.x0 + Q2.z1 - Q2.c], [-1, -1, -Q2.x0 - Q2.z0 - Q2.c]];
  // a box run along chosen edges of a plan polygon (parapets, caps, light strips); inset > 0 moves it inward,
  // skip[i] = [trim at the edge's start, trim at its end] leaves an opening
  function edgeRun(pts, edges, y, h, t, inset, m, skip = {}) {
    const g = new THREE.Group(); town.add(g);
    for (const i of edges) {
      const p = pts[i], q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.05) continue;
      const [t0, t1] = skip[i] || [0, 0], len = L - t0 - t1; if (len < 0.1) continue;
      const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, nx = -uz, nz = ux, mid = t0 + len / 2;
      const b = box(len + (inset > 0 && !skip[i] ? t : 0), h, t, m); b.position.set(p[0] + ux * mid + nx * inset, y + h / 2, p[1] + uz * mid + nz * inset); b.rotation.y = Math.atan2(-uz, ux); g.add(b);
    }
    return fixed(g);
  }
  const allEdges = (pts) => pts.map((_, i) => i);

  // rooms: open alcoves facing the camera. u = position along the face (z on the +x face, x on the +z face).
  // Left to right on screen: collector, benchmark, profile | projects, engineering, architect; L2 above them.
  const ROOMS = [
    { id: "collector", kind: "intake", sign: "COLLECTOR · gh", level: 1, face: "z", u: -3.75, W: 3.3 },
    { id: "benchmark", kind: "observatory", sign: "BENCHMARK", level: 1, face: "z", u: 0, W: 3.3 },
    { id: "profile-reviewer", kind: "lab", sign: "PROFILE · P1–P5", level: 1, face: "z", u: 3.75, W: 3.3 },
    { id: "projects-reviewer", kind: "lab", sign: "PROJECTS · J1–J4", level: 1, face: "x", u: 3.75, W: 3.3 },
    { id: "engineering-reviewer", kind: "lab", sign: "ENGINEERING · E1–E6", level: 1, face: "x", u: 0, W: 3.3 },
    { id: "architect-reviewer", kind: "lab", sign: "ARCHITECT · A1–A4", level: 1, face: "x", u: -3.75, W: 3.3 },
    { id: "library", kind: "library", sign: "RULES LIBRARY", level: 2, face: "z", u: -0.9, W: 4.2 },
    { id: "orchestrator", kind: "command", sign: "COMMAND DECK", level: 2, face: "z", u: 4.4, W: 4.2 },
    { id: "synthesis", kind: "merge", sign: "MERGE LAB", level: 2, face: "x", u: 4.4, W: 4.2 },
    { id: "vault", kind: "vault", sign: "RUN ARCHIVE", level: 2, face: "x", u: -0.9, W: 4.2 },
  ];
  const roomsOn = (lv, face) => ROOMS.filter((r) => r.level === lv && r.face === face).map((r) => [r.u - r.W / 2, r.u + r.W / 2]).sort((p, q) => p[0] - q[0]);
  function gaps(spans, lo, hi) { const out = []; let u = lo; for (const [a0, a1] of spans) { if (a0 > u + 0.01) out.push([u, a0]); u = Math.max(u, a1); } if (hi > u + 0.01) out.push([u, hi]); return out; }

  // the plinth walkway the L1 robots use: along the +z face, through the entrance court, along the +x face
  const WALK = [[-A + 0.3, B + 1.1], [A - CH + 0.45, B + 1.1], [A + 1.1, B - CH + 0.45], [A + 1.1, A + 1.1], [B - CH + 0.45, A + 1.1], [B + 1.1, A - CH + 0.45], [B + 1.1, -A + 0.3]].map(([x, z]) => V3(x, P0, z));
  const WS = [0]; for (let i = 1; i < WALK.length; i++) WS.push(WS[i - 1] + WALK[i].distanceTo(WALK[i - 1]));
  function walkProj(p) {
    let best = { d: Infinity };
    for (let i = 0; i + 1 < WALK.length; i++) {
      const a = WALK[i], ab = V3().subVectors(WALK[i + 1], a), L = ab.length();
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / (L * L))), q = a.clone().addScaledVector(ab, u), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < best.d) best = { d, p: q, s: WS[i] + u * L };
    }
    return best;
  }
  function walkBetween(s0, s1) {
    const out = [];
    if (s1 > s0) { for (let i = 0; i < WALK.length; i++) if (WS[i] > s0 + 0.05 && WS[i] < s1 - 0.05) out.push(WALK[i].clone()); }
    else for (let i = WALK.length - 1; i >= 0; i--) if (WS[i] < s0 - 0.05 && WS[i] > s1 + 0.05) out.push(WALK[i].clone());
    return out;
  }

  // stepped plinth: three slabs; the top one also fills the entrance court between the front arms
  function plinthPts(g, cc) {
    const a = A + g, b = B + g, c = CH + g * (2 - Math.SQRT2);
    return [[b, -a + c], [b, b - cc], [b - cc, b], [-a + c, b], [-a, b - c], [-a, a], [-b + c, a], [-b, a - c], [-b, -a + c], [-b + c, -a], [-a, -a], [-a, -b + c], [-a + c, -b], [a - c, -b], [a, -b + c], [a, -a], [b - c, -a]];
  }
  const PG = 2.2, CC = 5;
  [[PG + 0.9, 0.2, M.mid], [PG + 0.45, 0.4, M.white2], [PG, P0, M.white]].forEach(([g, h, m]) => prism(plinthPts(g, CC + (g - PG) * (2 - Math.SQRT2)), 0, h, m, 0.03));
  plate(plinthPts(PG, CC), P0 + 0.004, M.floor);
  // front walkway out of the court (ref 1, bottom right), with end steps, light rails, lamp posts and the floor logo
  const WK0 = (2 * (B + PG) - CC) / Math.SQRT2, WK1 = WK0 + 4.4, WKW = 2.7;
  const wkPts = (d0, d1, l) => [diagPt(d0, -l), diagPt(d1, -l), diagPt(d1, l), diagPt(d0, l)].map((v) => [v.x, v.z]);
  prism(wkPts(WK0, WK1, WKW), 0, P0, M.white, 0.03); plate(wkPts(WK0, WK1, WKW), P0 + 0.004, M.floor);
  prism(wkPts(WK1, WK1 + 0.45, WKW), 0, 0.4, M.white, 0.03); prism(wkPts(WK1 + 0.45, WK1 + 0.9, WKW), 0, 0.2, M.white, 0.03);
  { const g = new THREE.Group(); g.rotation.y = deg(45); town.add(g);
    for (const sx of [-1, 1]) add(g, box(0.08, 0.03, WK1 - WK0 - 0.6, M.neon), sx * (WKW - 0.3), P0 + 0.02, (WK0 + WK1) / 2);
    fixed(g);
    for (const sx of [-1, 1]) for (const d of [WK0 + 1.4, WK1 - 0.4]) {
      const lp = new THREE.Group(); lp.position.set(sx * (WKW + 0.7), 0, d); g.add(lp);
      add(lp, cyl(0.06, 0.09, 2.4, M.white, 12), 0, 1.2, 0); add(lp, box(0.46, 0.08, 0.16, M.white, 0.03), 0, 2.42, 0);
      add(lp, box(0.38, 0.03, 0.1, M.neon), 0, 2.37, 0); add(lp, glow(0x5be3ff, 1.2, 0.35), 0, 2.3, 0);
    }
    const logo = plane(3.4, 3.4, new THREE.MeshBasicMaterial({ map: ctex(cv(1024, 1024, (gg, w) => {
      const hex = (r) => { gg.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; gg[k ? "lineTo" : "moveTo"](w / 2 + r * Math.cos(a), w / 2 + r * Math.sin(a)); } gg.closePath(); };
      for (const [dy, c] of [[6, "rgba(255,255,255,.7)"], [0, "rgba(70,88,108,.55)"]]) {
        gg.save(); gg.translate(0, dy); gg.strokeStyle = c; gg.lineWidth = 22; hex(440); gg.stroke(); gg.lineWidth = 8; hex(380); gg.stroke();
        gg.fillStyle = c; gg.font = `700 330px ${FONT}`; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText("GR", w / 2, w / 2 + 16); gg.restore();
      }
    })), transparent: true, depthWrite: false }));
    logo.rotation.x = -Math.PI / 2; add(g, logo, 0, P0 + 0.012, WK1 - 1.9);
  }

  // L1: a core inset where the rooms are, piers between the rooms, a roof slab with an eave and a dark soffit line,
  // a paved terrace inside solid parapets, and one lit edge along the faces with rooms
  const L1top = T1 - SLAB;
  for (const p of [rectPts(-B, B - D, -A, A), rectPts(-A, A, A, B - D), rectPts(-A, A, -B, -A)]) prism(clipPoly(p, plusHP), P0, L1top, M.white, 0);
  for (const [u0, u1] of gaps(roomsOn(1, "x"), -A, A)) prism(clipPoly(rectPts(B - D, B, u0, u1), plusHP), P0, L1top, M.white, 0.04);
  for (const [u0, u1] of gaps(roomsOn(1, "z"), -A, A)) prism(clipPoly(rectPts(u0, u1, B - D, B), plusHP), P0, L1top, M.white, 0.04);
  const roof1 = plusPts(EAVE), open1 = { 7: [0, 2.6], 8: [2.4, 0], 17: [0, 2.6], 18: [2.4, 0] }; // openings where the side stairs arrive
  prism(roof1, L1top, T1, M.white, 0.06);
  prism(plusPts(EAVE - 0.02), L1top - 0.22, L1top, M.char, 0);
  plate(plusPts(0), T1 + 0.004, M.floor);
  edgeRun(roof1, allEdges(roof1), T1, 0.55, 0.26, 0.13, M.white, open1);
  edgeRun(roof1, allEdges(roof1), T1 + 0.55, 0.05, 0.32, 0.13, M.mid, open1);
  edgeRun(roof1, [19, 0, 1, 2, 3, 4, 5, 6], L1top + 0.2, 0.06, 0.06, -0.02, M.neon);

  // L2: the same idea one storey up; its front corner cantilevers over the entrance court
  const L2top = T2 - SLAB, X1 = Q2.x1 - D2, Z1 = Q2.z1 - D2;
  prism(clipPoly(rectPts(Q2.x0, X1, Q2.z0, Z1), sqHP), T1, L2top, M.white, 0);
  for (const [u0, u1] of gaps(roomsOn(2, "x"), Q2.z0, Z1)) prism(clipPoly(rectPts(X1, Q2.x1, u0, u1), sqHP), T1, L2top, M.white, 0.04);
  for (const [u0, u1] of gaps(roomsOn(2, "z"), Q2.x0, X1)) prism(clipPoly(rectPts(u0, u1, Z1, Q2.z1), sqHP), T1, L2top, M.white, 0.04);
  prism(clipPoly(rectPts(X1, Q2.x1, Z1, Q2.z1), sqHP), T1 + 0.42, L2top, M.white, 0.04);
  prism(clipPoly(rectPts(X1, Q2.x1 - 0.3, Z1, Q2.z1 - 0.3), [...sqHP, [1, 1, Q2.x1 + Q2.z1 - Q2.c - 0.42]]), T1, T1 + 0.42, M.char, 0); // recessed dark band under the cantilever
  const roof2 = sqPts(Q2, EAVE);
  prism(roof2, L2top, T2, M.white, 0.06);
  prism(sqPts(Q2, EAVE - 0.02), L2top - 0.22, L2top, M.char, 0);
  plate(sqPts(Q2, 0), T2 + 0.004, M.floor);
  edgeRun(roof2, allEdges(roof2), T2, 0.55, 0.26, 0.13, M.white);
  edgeRun(roof2, allEdges(roof2), T2 + 0.55, 0.05, 0.32, 0.13, M.mid);
  edgeRun(roof2, [7, 0, 1, 2, 3], L2top + 0.2, 0.06, 0.06, -0.02, M.neon);
  // lab sign on the cantilever's chamfer, which faces the camera head-on
  { const g = new THREE.Group(); g.position.set(Q2.x1 - Q2.c / 2 + 0.03, (T1 + 0.42 + L2top) / 2, Q2.z1 - Q2.c / 2 + 0.03); g.rotation.y = deg(45); town.add(g);
    add(g, box(2.3, 1.05, 0.05, M.glass, 0.03), 0, 0, 0);
    const sm = neon(0xffffff); sm.map = ctex(cv(512, 256, (gg, w, h) => { gg.fillStyle = "#8ff0ff"; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.font = `700 92px ${FONT}`; gg.fillText("GR", w / 2, h * 0.38); gg.font = `600 34px ${MONO}`; gg.fillText("REVIEW LAB", w / 2, h * 0.78); })); sm.transparent = true; sm.userData.base.setScalar(0.55);
    add(g, plane(2.0, 1.0, sm), 0, 0, 0.03); fixed(g); }
  // entrance porch under the cantilever: glass doors in the two court faces, a lit line over each
  { const g = new THREE.Group(); town.add(g); const dz = A + 2.0, dh = 2.5;
    add(g, box(0.08, dh, 2.2, M.glass, 0.02), A + 0.04, P0 + dh / 2, dz); add(g, box(0.12, 0.08, 2.4, M.white), A + 0.06, P0 + dh + 0.04, dz); add(g, box(0.05, 0.05, 2.1, M.neon), A + 0.12, P0 + dh + 0.14, dz);
    add(g, box(2.2, dh, 0.08, M.glass, 0.02), dz, P0 + dh / 2, A + 0.04); add(g, box(2.4, 0.08, 0.12, M.white), dz, P0 + dh + 0.04, A + 0.06); add(g, box(2.1, 0.05, 0.05, M.neon), dz, P0 + dh + 0.14, A + 0.12);
    fixed(g); }

  // greebles on the 45° chamfers that face the camera: panel seams, a louvred vent, a lit slit and a service door
  function chamferPanel(x, z, ry, y0, h, door) {
    const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = ry; town.add(g); const zf = 0.07;
    for (const y of [h * 0.3, h * 0.82]) add(g, box(2.7, 0.035, 0.03, M.mid), 0, y, zf);
    add(g, box(0.035, h * 0.52, 0.03, M.mid), door ? 0.55 : 0, h * 0.56, zf);
    add(g, box(1.5, 0.62, 0.05, M.white2, 0.02), door ? -0.45 : 0, h * 0.56, zf); add(g, plane(1.36, 0.48, M.vent), door ? -0.45 : 0, h * 0.56, zf + 0.03);
    add(g, box(0.05, h * 0.22, 0.04, M.neon), door ? 1.0 : 0.9, h * 0.56, zf + 0.01);
    if (door) { add(g, box(0.9, h * 0.29, 0.04, M.char, 0.02), -0.4, h * 0.145, zf); add(g, box(1.02, 0.06, 0.06, M.mid), -0.4, h * 0.29 + 0.03, zf); }
    return fixed(g);
  }
  chamferPanel(-6.9, 12.9, deg(-45), P0, WALL, true); chamferPanel(6.9, 12.9, deg(45), P0, WALL); chamferPanel(12.9, 6.9, deg(45), P0, WALL); chamferPanel(12.9, -6.9, deg(135), P0, WALL, true);
  chamferPanel(-5.5, 9.5, deg(-45), T1, L2top - T1); chamferPanel(9.5, -5.5, deg(135), T1, L2top - T1);

  // side stairs, plinth to the L1 roof, set into the two back concave corners (ref 2)
  function stair(ox, oz, dx, dz, ax, az, n, run, w) {
    const g = new THREE.Group(); town.add(g); const rise = (T1 - P0) / n;
    for (let k = 1; k <= n; k++) {
      const along = (n - k + 0.5) * run, h = k * rise;
      add(g, box(Math.abs(dx) * run + Math.abs(ax) * w, h, Math.abs(dz) * run + Math.abs(az) * w, M.white), ox + dx * along + ax * (w / 2), P0 + h / 2, oz + dz * along + az * (w / 2));
      add(g, box(Math.abs(dx) * run + Math.abs(ax) * 0.3, h + 0.5, Math.abs(dz) * run + Math.abs(az) * 0.3, M.white), ox + dx * along + ax * (w + 0.15), P0 + (h + 0.5) / 2, oz + dz * along + az * (w + 0.15));
      add(g, box(Math.abs(dx) * run + Math.abs(ax) * 0.34, 0.05, Math.abs(dz) * run + Math.abs(az) * 0.34, M.mid), ox + dx * along + ax * (w + 0.15), P0 + h + 0.525, oz + dz * along + az * (w + 0.15));
    }
    return fixed(g);
  }
  stair(-A, A, -1, 0, 0, 1, 9, 0.52, 1.8);
  stair(A, -A, 0, -1, 1, 0, 9, 0.52, 1.8);

  // deploy pad on the right-hand (-z) arm's roof terrace
  const PADC = V3(3.6, T1, -10.9);
  { const pg = new THREE.Group(); pg.position.copy(PADC); town.add(pg);
    pg.add(slab(roundedPoly(8, 2.5, 0.5, OCT), 0.22, M.mid, 0.04));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.045, 6, 96), M.neon); ring.rotation.x = Math.PI / 2; add(pg, ring, 0, 0.24, 0);
    add(pg, cyl(1.65, 1.65, 0.03, M.char, 48), 0, 0.235, 0);
    fixed(pg); }
  const deployPad = PADC.clone().setY(T1 + 0.22);
  const rocket = new THREE.Group(); rocket.position.copy(deployPad); rocket.position.y += 0.3; rocket.scale.setScalar(0.9); town.add(rocket);
  const rb = new THREE.Group(); rocket.add(rb);
  { const prof = [[0, 0.05], [0.4, 0.05], [0.56, 0.35], [0.62, 0.9], [0.62, 3.7], [0.56, 4.5], [0.4, 5.15], [0.18, 5.65], [0, 5.85]];
    rb.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48), M.white));
    add(rb, cyl(0.63, 0.63, 0.32, M.dark, 48), 0, 3.05, 0);
    for (const y of [2.86, 3.24]) { const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.635, 0.02, 6, 64), M.neon); r2.rotation.x = Math.PI / 2; add(rb, r2, 0, y, 0); }
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), M.glass); add(rb, port, 0, 4.25, 0.585).rotation.x = -0.12;
    const pr = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 32), M.neon); add(rb, pr, 0, 4.25, 0.59).rotation.x = -0.12;
    add(rb, cyl(0.3, 0.44, 0.38, M.dark, 32), 0, -0.12, 0);
    const finS = new THREE.Shape([[0, 0], [0.95, -0.25], [0.95, 0.15], [0.05, 1.7]].map(([x, y]) => new THREE.Vector2(x, y)));
    const finG = new THREE.ExtrudeGeometry(finS, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 }); finG.translate(0, 0, -0.035);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(finG, M.white); const a = deg(45 + 90 * k); f.position.set(0.5 * Math.sin(a), 0.15, 0.5 * Math.cos(a)); f.rotation.y = a - Math.PI / 2; rb.add(f); }
    rb.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  }
  // exhaust: a hot core cone, a glow and smoke puffs that only show while the engine burns
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.2, 24, 1, true), neon(0xffc06a)); flame.rotation.x = Math.PI; flame.position.y = -1.3; rb.add(flame);
  const flameGlow = glow(0xffa64d, 3.2, 0.9); flameGlow.position.y = -0.8; rb.add(flameGlow);
  const smokeM = () => new THREE.SpriteMaterial({ map: glowTex, color: 0xe4e9ef, transparent: true, opacity: 0, depthWrite: false });
  const smoke = []; for (let i = 0; i < 10; i++) { const s2 = new THREE.Sprite(smokeM()); s2.userData.a = (i / 10) * Math.PI * 2; rocket.add(s2); smoke.push(s2); }
  // service gantry to the rocket's left (seen from the camera), with an arm that swings away at ignition
  const gantry = new THREE.Group(); gantry.position.copy(polar(1.75, deg(315), 0)); gantry.rotation.y = deg(45); rocket.add(gantry);
  { const GH = 5.4;
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) add(gantry, box(0.09, GH, 0.09, M.white2), x, GH / 2, z);
    for (let y = 0.9; y < GH; y += 1.5) for (const [w2, d2, x, z] of [[0.8, 0.07, 0, -0.35], [0.8, 0.07, 0, 0.35], [0.07, 0.8, -0.35, 0], [0.07, 0.8, 0.35, 0]]) add(gantry, box(w2, 0.07, d2, M.white2), x, y, z);
    for (let y = 0.9; y < GH - 1.4; y += 1.5) for (const [x, z, ry] of [[0, -0.35, 0], [0, 0.35, 0], [-0.35, 0, Math.PI / 2], [0.35, 0, Math.PI / 2]]) { const b2 = box(0.05, 1.62, 0.05, M.metal); b2.position.set(x, y + 0.75, z); b2.rotation.set(0, ry, 0.43 * (ry ? 1 : -1)); if (ry) b2.rotation.set(0.43, 0, 0); gantry.add(b2); }
    add(gantry, box(0.9, 0.12, 0.9, M.white, 0.03), 0, GH + 0.06, 0);
    add(gantry, box(0.05, GH - 0.6, 0.05, M.neon), 0.39, GH / 2, 0.39);
    add(gantry, glow(0xff5a5a, 0.7, 0.9), 0, GH + 0.3, 0);
    fixed(gantry);
  }
  const armPivot = new THREE.Group(); armPivot.position.copy(gantry.position).add(V3(0, 4.3, 0)); rocket.add(armPivot);
  { const L = 1.25; add(armPivot, box(0.24, 0.14, L, M.white, 0.04), 0, 0, L / 2); add(armPivot, box(0.05, 0.05, L - 0.2, M.neon), 0, 0.09, L / 2);
    armPivot.rotation.y = armPivot.userData.y0 = deg(135); }
  reg(rocket, "deploy");
  let rocketT = -1, rocketNext = 25;

  // ---- rooms: open alcoves with a dark floor, a back panel, a ceiling lamp, one lit lintel and a sign on the fascia ----
  const stations = {};   // id -> {group, spot, yaw, front, out, active, holo:[...], spin:[...]}
  // room sign: a charcoal plate on the white fascia with the agent's colour dot and light text (third tone, refs 1–2)
  function signTex(text, color) {
    return ctex(cv(1024, 128, (g, w, h) => {
      g.font = `600 54px ${MONO}`; const tw = g.measureText(text).width, pw = Math.min(w - 8, tw + 150), x0 = (w - pw) / 2;
      g.fillStyle = "#20272e"; rr(g, x0, 10, pw, h - 20, (h - 20) / 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 3; rr(g, x0 + 2, 12, pw - 4, h - 24, (h - 24) / 2); g.stroke();
      g.fillStyle = color; g.beginPath(); g.arc(x0 + 58, h / 2, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#eef6fa"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(text, x0 + 96, h / 2 + 2);
    }));
  }
  const IS = 0.8; // interiors are modelled at the old scale and shrunk to suit the human-scale robots
  function room(def) {
    const two = def.level === 2, Wd = def.W, Dd = two ? D2 : D, y0 = two ? T1 : P0, hg = (two ? T2 : T1) - SLAB - y0;
    const fx = def.face === "x", a = fx ? deg(90) : 0, edge = two ? (fx ? Q2.x1 : Q2.z1) : B;
    const g = new THREE.Group(); g.position.set(fx ? edge - Dd / 2 : def.u, y0, fx ? def.u : edge - Dd / 2); g.rotation.y = a; town.add(g);
    const st = { group: g, a, active: 0, holo: [], spin: [], blink: [], cue: 0, kind: def.kind };
    const sh = new THREE.Group(); g.add(sh);
    add(sh, box(Wd, 0.04, Dd, M.mid), 0, 0.02, 0);
    add(sh, box(Wd, hg, 0.06, M.white2), 0, hg / 2, -Dd / 2 + 0.03);
    const lamp = plane(Wd - 0.7, 0.45, M.ceil); lamp.rotation.x = Math.PI / 2; add(sh, lamp, 0, hg - 0.01, -Dd / 2 + 0.55);
    add(sh, box(Wd - 0.3, 0.04, 0.04, M.neon), 0, hg - 0.14, Dd / 2 - 0.04);
    if (def.sign) add(sh, plane(Wd * 0.9, Wd * 0.9 / 8, new THREE.MeshBasicMaterial({ map: signTex(def.sign, colorOf(def.id)), transparent: true })), 0, hg + 0.24, Dd / 2 + EAVE + 0.075);
    // door frame: proud mid-grey jambs and a head, so each opening reads as a framed doorway
    for (const sx of [-1, 1]) add(sh, box(0.1, hg, 0.14, M.mid), sx * (Wd / 2 - 0.05), hg / 2, Dd / 2 - 0.07);
    add(sh, box(Wd, 0.1, 0.14, M.mid), 0, hg - 0.05, Dd / 2 - 0.07);
    fixed(sh);
    if (def.kind) { const gi = new THREE.Group(); gi.scale.setScalar(IS); g.add(gi); buildInterior(def, gi, st, Wd / IS, Dd / IS); }
    g.traverse((c) => { c.userData.noRecv = true; });
    if (def.id) { reg(g, def.id); stations[def.id] = st; }
    g.updateWorldMatrix(true, false);
    st.spot = g.localToWorld(V3(0, 0, 0.35 * IS)); st.spot.y = y0; st.yaw = a + Math.PI;
    st.out = g.localToWorld(V3(0, 0, Dd / 2 + 0.9)); st.out.y = y0;
    st.front = two ? st.out.clone() : walkProj(st.out).p.clone();
    return st;
  }
  // ---- prop kit: racks with instanced LEDs, curved monitor desks, hologram tables, holo panels ----
  // shared animated UI screens (bars, signal, log), redrawn ~10×/s and reused by every monitor
  const UI = [0, 1, 2].map((i) => { const c = cv(256, 160); return { c, t: ctex(c), i }; });
  function drawUI(u, tt) {
    const g = u.c.getContext("2d"), w = 256, h = 160;
    g.fillStyle = "#04121b"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,230,255,.35)"; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "rgba(170,240,255,.9)"; g.font = `600 14px ${MONO}`; g.textBaseline = "top"; g.fillText(["THROUGHPUT", "SIGNAL", "LOG"][u.i], 12, 11);
    if (u.i === 0) {
      for (let k = 0; k < 12; k++) { const v = 0.2 + 0.75 * Math.abs(Math.sin(tt * 0.9 + k * 1.7) * Math.cos(tt * 0.37 + k)); g.fillStyle = k % 5 === 0 ? "rgba(255,190,80,.95)" : "rgba(90,225,255,.95)"; g.fillRect(14 + k * 19, h - 14 - v * 108, 12, v * 108); }
    } else if (u.i === 1) {
      g.strokeStyle = "rgba(90,225,255,.25)"; g.lineWidth = 1; for (let y = 50; y < h - 10; y += 22) { g.beginPath(); g.moveTo(12, y); g.lineTo(w - 12, y); g.stroke(); }
      g.strokeStyle = "rgba(110,235,255,1)"; g.lineWidth = 2.5; g.beginPath();
      for (let x = 0; x <= w - 24; x += 4) { const y = h * 0.6 + Math.sin(x * 0.07 + tt * 3) * 24 * Math.sin(x * 0.013 + tt * 0.7) + Math.sin(x * 0.31 + tt * 5) * 4; if (x) g.lineTo(12 + x, y); else g.moveTo(12 + x, y); }
      g.stroke();
    } else {
      const off = (tt * 22) % 16; g.save(); g.beginPath(); g.rect(8, 32, w - 16, h - 40); g.clip();
      for (let k = 0; k < 9; k++) { const y = 36 + k * 16 - off, r2 = rnd((Math.floor(tt * 1.375) + k) * 13 + 1); g.fillStyle = r2() < 0.2 ? "rgba(120,255,170,.9)" : "rgba(150,230,255,.8)"; g.fillRect(14, y, 18 + r2() * 30, 6); g.fillRect(60 + r2() * 20, y, 40 + r2() * 110, 6); }
      g.restore();
    }
    u.t.needsUpdate = true;
  }
  UI.forEach((u) => drawUI(u, 0));
  // emissive screen material (HDR via the neon list, so screens bloom a little)
  const scrMats = new Map();
  const scrMat = (map) => { if (scrMats.has(map)) return scrMats.get(map); const m = neon(0xffffff); m.map = map; m.userData.base.setScalar(0.4); scrMats.set(map, m); return m; };
  function solidScreen(w, h, cw, ch, draw) {
    const c = cv(cw, ch), t = ctex(c), mesh = plane(w, h, scrMat(t));
    const sObj = { c, t, mesh, draw: (g, W2, H2, inf) => { g.fillStyle = "#04121b"; g.fillRect(0, 0, W2, H2); draw(g, W2, H2, inf); } };
    screens.push(sObj); paint(sObj); return mesh;
  }

  // racks: gunmetal cabinet, slotted grille, lit edges; LEDs are collected and drawn as one InstancedMesh
  const grilleTex = ctex(cv(64, 256, (g, w, h) => { g.fillStyle = "#1c242e"; g.fillRect(0, 0, w, h); g.fillStyle = "#090d12"; for (let y = 6; y < h; y += 8) g.fillRect(5, y, w - 10, 4); }));
  const grilleM = std(0xffffff, 0.45, { map: grilleTex, metalness: 0.6 });
  const leds = [];
  let ledMesh = null, ledOn = null, ledClock = 0, ledGain = 3.5; const ledBase = [], tmpC = new THREE.Color();
  function rack(h = 2.1, w = 0.72, d = 0.62) {
    const g = new THREE.Group();
    add(g, box(w, h, d, M.dark, 0.04), 0, h / 2, 0);
    add(g, plane(w - 0.12, h - 0.2, grilleM), 0, h / 2, d / 2 + 0.004);
    for (const sx of [-1, 1]) add(g, box(0.03, h - 0.12, 0.03, M.neon), sx * (w / 2 - 0.02), h / 2, d / 2 + 0.006);
    add(g, box(w - 0.1, 0.03, 0.03, M.neon), 0, h - 0.05, d / 2 + 0.006);
    const pts = [], r = rnd(leds.length * 131 + Math.round(h * 977) + 3);
    for (let y = 0.24; y < h - 0.18; y += 0.085) for (const x of [-0.3, -0.18, -0.06, 0.06]) if (r() < 0.6) pts.push(V3(x * (w / 0.72), y, d / 2 + 0.012));
    leds.push({ g, pts });
    return fixed(g);
  }
  function ledColor(k) { tmpC.copy(ledBase[k]).multiplyScalar(ledOn[k] ? ledGain : ledGain * 0.07); ledMesh.setColorAt(k, tmpC); }

  // curved monitor desk: centre of curvature at the origin (where the robot stands), screens face it
  function arcShape(r1, r2, a0, a1) { const sh = new THREE.Shape(); sh.absarc(0, 0, r2, a0, a1, false); sh.absarc(0, 0, r1, a1, a0, true); sh.closePath(); return sh; }
  const deskSide = M.white.clone(); deskSide.side = THREE.DoubleSide;
  const spillM = holo(ctex(cv(128, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.55); r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, h); })), 0.5);
  function monitorDesk(parent, x, z, mons, span = 50, R1 = 0.95, R2 = 1.45) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    const top = slab(arcShape(R1, R2, deg(90 - span), deg(90 + span)), 0.07, M.white, 0.02, 24); top.position.y = 0.72; g.add(top);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R2 - 0.06, R2 - 0.06, 0.7, 24, 1, true, Math.PI - deg(span), deg(2 * span)), deskSide); back.position.y = 0.37; g.add(back);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(R1 + 0.03, 0.018, 6, 40, deg(2 * span)), M.neon); trim.rotation.set(-Math.PI / 2, 0, deg(90 - span)); trim.position.y = 0.76; g.add(trim);
    for (const sg of [-1, 1]) { const th = sg * deg(span * 0.86), rm = (R1 + R2) / 2, p = box(0.28, 0.72, 0.42, M.white2, 0.04); p.position.set(rm * Math.sin(th), 0.36, -rm * Math.cos(th)); p.rotation.y = -th; g.add(p); }
    const n = mons.length, rm = (R1 + R2) / 2 + 0.12;
    mons.forEach((spec, i) => {
      const th = n === 1 ? 0 : deg(span * 0.62) * (n === 2 ? (i ? 0.5 : -0.5) : i - 1), big = n !== 2 && i === 1 || n === 1;
      const mw = big ? 0.8 : 0.62, mh = big ? 0.5 : 0.4;
      const m = new THREE.Group(); m.position.set(rm * Math.sin(th), 0.79, -rm * Math.cos(th)); m.rotation.y = -th; g.add(m);
      add(m, box(0.05, 0.16, 0.05, M.dark), 0, 0.08, -0.03);
      add(m, box(0.22, 0.02, 0.14, M.dark, 0.008), 0, 0.01, -0.03);
      const scr = new THREE.Group(); scr.position.set(0, 0.16 + mh / 2, 0); scr.rotation.x = -0.12; m.add(scr);
      add(scr, box(mw + 0.06, mh + 0.06, 0.04, M.darker, 0.015), 0, 0, -0.02);
      const face = typeof spec === "number" ? plane(mw, mh, scrMat(UI[spec].t)) : solidScreen(mw, mh, spec.cw || 512, spec.ch || 320, spec.draw);
      add(scr, face, 0, 0, 0.002);
      const sp = plane(mw + 0.1, 0.32, spillM); sp.rotation.x = -Math.PI / 2; add(m, sp, 0, 0.004, 0.2);
    });
    return fixed(g);
  }

  // hologram table (ref 4): bevelled console, animated terrain (shader-displaced, wire overlay),
  // a floating rounded-rect frame with small UI panels, and drifting "+" particles
  function rrShape(w, h, r) { const sh = new THREE.Shape(), x = -w / 2, y = -h / 2; sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); return sh; }
  function rrRing(w, h, r, t) { const sh = rrShape(w, h, r); sh.holes.push(rrShape(w - 2 * t, h - 2 * t, Math.max(0.01, r - t))); return sh; }
  const terrainGeo = new THREE.PlaneGeometry(1.0, 0.7, 40, 28);
  function terrainFx(m, seed) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = HT; sh.uniforms.uSeed = { value: seed };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT; uniform float uSeed; varying float vH;").replace("#include <begin_vertex>", `#include <begin_vertex>
        vec2 q = position.xy * 6.0 + uSeed;
        float hg = 0.5 + 0.5 * (sin(q.x * 1.3 + uT * 0.8) * cos(q.y * 1.7 - uT * 0.6) * 0.6 + sin(q.x * 3.1 - q.y * 2.3 + uT * 1.3) * 0.25 + sin(length(q - 3.0) * 2.0 - uT) * 0.15);
        float fall = smoothstep(0.0, 0.12, 0.5 - abs(position.x)) * smoothstep(0.0, 0.1, 0.35 - abs(position.y));
        transformed.z += hg * 0.24 * fall; vH = hg * fall;`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vH;").replace("#include <opaque_fragment>", "outgoingLight *= 0.4 + vH * 1.4; diffuseColor.a *= 0.3 + vH;\n#include <opaque_fragment>");
    };
    m.customProgramCacheKey = () => "terrainFx"; return m;
  }
  const plusTex = ctex(cv(32, 32, (g) => { g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.moveTo(16, 6); g.lineTo(16, 26); g.moveTo(6, 16); g.lineTo(26, 16); g.stroke(); }));
  const floaters = [];
  function holoTable(g, st, x, z, ry = 0, sc = 1) {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = ry; t.scale.setScalar(sc); g.add(t);
    t.add(fixed(slab(rrShape(1.12, 0.82, 0.16), 0.56, M.grey, 0.06)));
    add(t, fixed(slab(rrShape(1.26, 0.96, 0.2), 0.14, M.dark, 0.04)), 0, 0.55, 0);
    add(t, fixed(slab(rrRing(1.2, 0.9, 0.17, 0.035), 0.02, M.neon, 0.004)), 0, 0.69, 0);
    add(t, fixed(box(0.8, 0.035, 0.03, M.neon)), 0, 0.3, 0.43);
    const seed = Math.random() * 20;
    for (const [op, wire] of [[0.5, false], [0.9, true]]) {
      const m = terrainFx(holo(null, op), seed); m.wireframe = wire;
      const tm = new THREE.Mesh(terrainGeo, m); tm.rotation.x = -Math.PI / 2; add(t, tm, 0, 0.73, 0); st.holo.push(tm);
    }
    const fr = new THREE.Group(); fr.position.y = 1.5; t.add(fr);
    fr.add(slab(rrRing(1.5, 1.08, 0.22, 0.035), 0.025, M.neon, 0.005));
    [[-0.42, -0.54, 0], [0.4, -0.54, 1], [0.76, 0.1, 2]].forEach(([px, pz, k], i) => {
      const pn = plane(0.3, 0.19, holoFx(holo(UI[k].t, 0.9))); pn.position.set(px, 0.12, pz); if (i === 2) pn.rotation.y = -Math.PI / 2; fr.add(pn); st.holo.push(pn);
    });
    floaters.push({ o: fr, y0: 1.5, amp: 0.05, sp: 1.2, ph: seed });
    const pts = [], r = rnd(Math.round(seed * 1000) + 1); for (let i = 0; i < 36; i++) pts.push((r() - 0.5) * 1.3, 0.8 + r() * 0.9, (r() - 0.5) * 0.9);
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const pm = new THREE.PointsMaterial({ map: plusTex, size: 0.08, transparent: true, depthWrite: false, color: 0xffffff }); pm.userData.base = new THREE.Color(0x7ef3ff).multiplyScalar(0.35); neonMats.push(pm);
    const pp = new THREE.Points(pg, pm); t.add(pp); floaters.push({ o: pp, y0: 0, amp: 0.04, sp: 0.8, ph: seed, rot: 0.15 });
    const gl = glow(0x5be3ff, 1.6, 0.45); add(t, gl, 0, 0.9, 0); st.blink.push(gl);
    return t;
  }

  // book spines for the library shelves: five rows, muted lab palette with a few accent colours
  const bookM = std(0xffffff, 0.7, { map: ctex(cv(256, 412, (g, w, h) => {
    g.fillStyle = "#1b2128"; g.fillRect(0, 0, w, h);
    const r = rnd(21), pal = ["#e8edf1", "#c9d3dc", "#8fa1b3", "#4f6378", "#2f8fb0", "#3fb5c9", "#d9a45b", "#e8edf1", "#b8c4cf"];
    for (let row = 0; row < 5; row++) {
      let x = 6; const y1 = h - row * (h / 4.5) - 8;
      while (x < w - 10) { const bw = 7 + r() * 9, bh = 44 + r() * 24; if (r() < 0.08) { x += 14; continue; } g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fillRect(x, y1 - bh, bw - 1.5, bh); g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x + 1.5, y1 - bh + 6, bw - 4.5, 2); x += bw; }
    }
  })) });
  // reviewer back-wall panels: a different picture per section, so each lab reads as its own room
  function labPanel(gg, w, h, kind, inf, ag) {
    uiFrame(gg, w, h, ag.short.toUpperCase(), { profile: "header · README", projects: "pinned repos", engineering: "CI · tests · lint", architect: "ADRs · IaC" }[kind]);
    const y0 = h * 0.36, ph = h - y0 - 18; gg.strokeStyle = "rgba(255,255,255,.9)"; gg.fillStyle = "rgba(255,255,255,.85)"; gg.lineWidth = 3;
    if (kind === "profile") { // ID card: avatar, name lines, badges
      rr(gg, 22, y0, w - 44, ph, 12); gg.stroke();
      gg.beginPath(); gg.arc(22 + ph * 0.5, y0 + ph * 0.5, ph * 0.3, 0, Math.PI * 2); gg.stroke();
      lines(gg, 30 + ph, y0 + 16, w - 80 - ph, 3, 7);
    } else if (kind === "projects") { // kanban: three columns of repo cards
      const repos = arr(inf.run && inf.run.repos), cw = (w - 44 - 20) / 3;
      for (let c = 0; c < 3; c++) { const x = 22 + c * (cw + 10); gg.globalAlpha = 0.35; gg.fillRect(x, y0, cw, 4); gg.globalAlpha = 1;
        for (let k = 0; k < 3 - c % 2; k++) { const rp = repos[c * 2 + k]; gg.fillStyle = rp ? scoreHex(num(rp.score) || 0) : "rgba(255,255,255,.7)"; rr(gg, x, y0 + 12 + k * (ph / 3.2), cw, ph / 3.8, 6); gg.fill(); } gg.fillStyle = "rgba(255,255,255,.85)"; }
    } else if (kind === "engineering") { // CI pipeline: stages with checks
      const n = 4, sw = (w - 44) / n;
      for (let k = 0; k < n; k++) { const x = 22 + k * sw + sw / 2, y = y0 + ph * 0.45; gg.beginPath(); gg.arc(x, y, ph * 0.22, 0, Math.PI * 2); gg.stroke();
        gg.beginPath(); gg.moveTo(x - ph * 0.09, y); gg.lineTo(x - ph * 0.02, y + ph * 0.08); gg.lineTo(x + ph * 0.11, y - ph * 0.08); gg.stroke();
        if (k < n - 1) { gg.beginPath(); gg.moveTo(x + ph * 0.24, y); gg.lineTo(x + sw - ph * 0.24, y); gg.stroke(); } }
      gg.font = `600 ${Math.round(h * 0.06)}px ${MONO}`; ["lint", "type", "test", "build"].forEach((s, k) => gg.fillText(s, 22 + k * sw + sw / 2 - h * 0.06, y0 + ph * 0.78));
    } else { // architect: blueprint grid with a box diagram
      gg.globalAlpha = 0.25; for (let x = 22; x < w - 22; x += 18) gg.fillRect(x, y0, 1, ph); for (let y = y0; y < y0 + ph; y += 18) gg.fillRect(22, y, w - 44, 1); gg.globalAlpha = 1;
      const bx = [[0.1, 0.15], [0.42, 0.15], [0.74, 0.15], [0.42, 0.6]].map(([u, v]) => [22 + u * (w - 44), y0 + v * ph]), bw = (w - 44) * 0.18, bh = ph * 0.28;
      bx.forEach(([x, y]) => { gg.strokeRect(x, y, bw, bh); });
      gg.beginPath(); gg.moveTo(bx[0][0] + bw, bx[0][1] + bh / 2); gg.lineTo(bx[1][0], bx[1][1] + bh / 2); gg.moveTo(bx[1][0] + bw, bx[1][1] + bh / 2); gg.lineTo(bx[2][0], bx[2][1] + bh / 2); gg.moveTo(bx[1][0] + bw / 2, bx[1][1] + bh); gg.lineTo(bx[3][0] + bw / 2, bx[3][1]); gg.stroke();
    }
  }
  function buildInterior(def, g, st, W, Dl) {
    const back = -Dl / 2 + 0.2;
    if (def.kind === "lab") {
      // reviewer lab: curved desk (left/right live UI, centre = this section's score), hologram table, rack
      const ag = META.agents[def.id];
      monitorDesk(g, 0, 0.35, [0, { cw: 512, ch: 320, draw: (gg, w, h, inf) => {
        const sec = inf.run ? num(obj(obj(inf.run.scores).sections)[ag.section]) : null;
        uiFrame(gg, w, h, ag.short.toUpperCase(), ag.step.split("· ")[1] || "");
        gauge(gg, w * 0.27, h * 0.62, h * 0.2, sec);
        const rules = inf.run ? Object.entries(obj(obj(inf.run.scores).rules)).filter(([k]) => k[0] === ag.prefix) : [];
        bars(gg, w * 0.52, h * 0.38, w * 0.4, h * 0.46, rules.length ? rules.map(([, v]) => v) : [40, 70, 55, 85]);
      } }, 1]);
      holoTable(g, st, -1.12, 0.78, 0.25, 0.8);
      add(g, rack(2.1), W / 2 - 0.55, 0, back + 0.33);
      // a wall panel that differs per section (ID card, kanban, CI pipeline, blueprint)
      const wp = new THREE.Group(); wp.position.set(-0.45, 2.15, back - 0.1); g.add(wp);
      add(wp, fixed(box(1.72, 1.04, 0.06, M.white, 0.03)), 0, 0, 0);
      add(wp, fixed(box(1.5, 0.03, 0.03, M.neon)), 0, -0.56, 0.02);
      add(wp, solidScreen(1.6, 0.92, 512, 296, (gg, w, h, inf) => labPanel(gg, w, h, ag.section, inf, ag)), 0, 0, 0.035);
    } else if (def.kind === "intake") {
      // intake: racks, a desk with the snapshot, and a conveyor of data cubes along the front
      add(g, rack(2.2), -W / 2 + 0.55, 0, back + 0.33);
      add(g, rack(2.2), W / 2 - 0.55, 0, back + 0.33);
      monitorDesk(g, 0, 0.35, [2, { cw: 512, ch: 320, draw: (gg, w, h, inf) => {
        const sn = obj(inf.run && inf.run.snapshot);
        uiFrame(gg, w, h, "INTAKE · gh", `${sn.in_scope_repos ?? "–"} repos in scope`);
        bars(gg, 22, h * 0.45, w - 44, h * 0.42, [sn.repos_with_ci, sn.repos_with_tests, sn.repos_with_adrs, sn.repos_with_iac].map((v) => ((v || 0) / Math.max(1, sn.in_scope_repos || 1)) * 100));
      } }, 0], 44);
      const belt = box(2.6, 0.08, 0.42, M.darker); add(g, belt, -0.2, 0.5, 1.12);
      add(g, fixed(box(2.6, 0.46, 0.04, M.white2)), -0.2, 0.23, 1.32);
      add(g, fixed(box(2.5, 0.03, 0.03, M.neon)), -0.2, 0.47, 1.34);
      st.cubes = [];
      for (let i = 0; i < 5; i++) { const c = box(0.2, 0.2, 0.2, holo(null, 0.85), 0.03); add(g, c, 0, 0.64, 1.12); st.cubes.push(c); st.holo.push(c); }
    } else if (def.kind === "observatory") {
      // benchmark: desk with the north-star map, a star-terrain hologram table, a rack
      monitorDesk(g, 0, 0.35, [1, { cw: 512, ch: 320, draw: (gg, w, h, inf) => {
        const b = obj(inf.run && inf.run.benchmark);
        uiFrame(gg, w, h, "NORTH STARS", `${arr(b.profiles).length || 3} profiles`);
        const r = rnd(9); gg.fillStyle = "#fff";
        for (let i = 0; i < 60; i++) { const x = 20 + r() * (w - 40), y = h * 0.35 + r() * h * 0.55; gg.globalAlpha = 0.3 + r() * 0.7; gg.fillRect(x, y, 3, 3); }
        gg.globalAlpha = 1; gg.strokeStyle = "rgba(255,255,255,.8)"; gg.lineWidth = 2; gg.beginPath(); gg.moveTo(w * 0.2, h * 0.8); gg.lineTo(w * 0.45, h * 0.5); gg.lineTo(w * 0.7, h * 0.62); gg.lineTo(w * 0.85, h * 0.4); gg.stroke();
      } }, 2]);
      holoTable(g, st, 1.12, 0.78, -0.25, 0.8);
      add(g, rack(2.1), -W / 2 + 0.55, 0, back + 0.33);
    } else if (def.kind === "library") {
      // rules library (refs 1–2): two white bookshelves on the back wall, a reading table, the rules hologram above it
      for (const sx of [-1, 1]) {
        const sg = new THREE.Group(); sg.position.set(sx * 1.55, 0, back + 0.25); g.add(sg);
        add(sg, box(1.6, 2.5, 0.5, M.white, 0.04), 0, 1.25, 0);
        add(sg, box(1.44, 2.3, 0.05, M.char), 0, 1.27, 0.2);
        add(sg, plane(1.4, 2.26, bookM), 0, 1.27, 0.26);
        for (let k = 0; k <= 4; k++) add(sg, box(1.46, 0.04, 0.3, M.white2), 0, 0.14 + k * 0.555, 0.3);
        add(sg, box(1.3, 0.03, 0.03, M.neon), 0, 2.46, 0.27);
        fixed(sg);
      }
      const tb2 = new THREE.Group(); tb2.position.set(0, 0, 0.35); g.add(tb2);
      add(tb2, box(1.3, 0.06, 0.75, M.white, 0.03), 0, 0.72, 0); add(tb2, box(1.0, 0.68, 0.12, M.white2), 0, 0.35, 0);
      add(tb2, box(1.1, 0.025, 0.025, M.neon), 0, 0.68, 0.38); add(tb2, box(0.3, 0.05, 0.22, M.char), -0.3, 0.77, 0.05);
      fixed(tb2);
      const book = screen(1.1, 0.68, 320, 200, (gg, w, h, inf) => { uiFrame(gg, w, h, "RULES", `${(inf.rules || []).length || 19} rules`); lines(gg, 22, h * 0.48, w - 44, 4, 3); });
      add(g, book, 0, 1.75, 0.2); st.holo.push(book);
      floaters.push({ o: book, y0: 1.75, amp: 0.04, sp: 1.1, ph: 2 });
    } else if (def.kind === "vault") {
      for (let i = 0; i < 4; i++) add(g, rack(2.3), -W / 2 + 0.55 + i * 0.95, 0, back + 0.33);
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
    } else if (def.kind === "command") {
      // orchestrator: a curved desk with the run totals on three screens
      monitorDesk(g, 0, 0.3, [0, 1, 2].map((i) => ({ cw: 256, ch: 160, draw: (gg, w, h, inf) => {
        const t = obj(inf.stats && inf.stats.totals);
        uiFrame(gg, w, h, ["TOKENS", "TOOLS", "TIME"][i], "");
        gg.fillStyle = "#fff"; gg.font = `700 46px ${FONT}`; gg.fillText([fmtTok(t.tokens), t.tool_calls == null ? "–" : String(t.tool_calls), fmtDur(inf.stats && inf.stats.wall_s)][i], 22, h * 0.48);
      } })), 50, 0.9, 1.35);
    } else if (def.kind === "merge") {
      // synthesis: console with floating screens, a glass reactor sphere fed by pipes, two vials
      monitorDesk(g, -0.65, 0.3, [{ cw: 352, ch: 220, draw: (gg, w, h, inf) => { const r = inf.run; uiFrame(gg, w, h, "MERGE", r ? `${arr(r.findings).length} findings` : ""); gauge(gg, w * 0.25, h * 0.64, h * 0.2, r ? num(obj(r.scores).overall) : null); lines(gg, w * 0.48, h * 0.45, w * 0.45, 4, 5); } }, 2], 35, 0.85, 1.3);
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
    } else if (def.kind === "lobby") {
      // glass front with a reception desk and the town logo
      add(g, box(W - 0.4, WALL - 0.15, 0.05, M.clearGlass), 0, (WALL - 0.15) / 2, Dl / 2 - 0.12);
      for (const x of [-1.2, 1.2]) add(g, box(0.08, WALL, 0.1, M.white), x, WALL / 2, Dl / 2 - 0.12);
      add(g, shadowy(box(2.4, 0.95, 0.7, M.white, 0.12)), 0, 0.48, -0.3);
      add(g, box(2.2, 0.03, 0.03, M.neon), 0, 0.7, 0.06);
      const lg = screen(1.6, 1.0, 400, 250, (gg, w, h) => { gg.strokeStyle = "rgba(255,255,255,.95)"; gg.lineWidth = 8; rr(gg, w / 2 - 80, 20, 160, 160, 30); gg.stroke(); gg.fillStyle = "#fff"; gg.font = `700 84px ${FONT}`; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText("GR", w / 2, 104); gg.font = `600 26px ${MONO}`; gg.fillText("REVIEW LAB", w / 2, 222); });
      lg.scale.setScalar(0.75); add(g, lg, 0, 1.35, -0.85); st.holo.push(lg);
    }
  }
  for (const r of ROOMS) room(r);

  // ---- L2 roof: tower on a stepped octagonal podium (Town v2 phase 3, ref 2: angular slab, full-height glass slot) ----
  const up = new THREE.Group(); up.position.set(TX, T2, TZ); town.add(up);
  const PODR = 6.6, PODH = 2.25;
  const podium = new THREE.Group(); up.add(podium);
  podium.add(slab(roundedPoly(8, PODR, 0.9, OCT), 0.45, M.deck, 0.08));
  add(podium, slab(roundedPoly(8, PODR - 0.85, 0.8, OCT), 0.55, M.white, 0.08), 0, 0.45, 0);
  add(podium, slab(roundedPoly(8, PODR - 0.95, 0.8, OCT), 0.22, M.char, 0.02), 0, 0.62, 0); // dark reveal band in the upper tier
  // top tier: a full storey with a dark window band and a lit sill (ref 2's tower base)
  add(podium, slab(roundedPoly(8, PODR - 1.6, 0.7, OCT), PODH - 1.0, M.white, 0.08), 0, 1.0, 0);
  add(podium, slab(roundedPoly(8, PODR - 1.58, 0.7, OCT), 0.42, M.char, 0.02), 0, 1.38, 0);
  octStrips(podium, PODR, 0.9, 0.4, 0.1); octStrips(podium, PODR - 1.6, 0.7, 1.3, 0.06); octStrips(podium, PODR - 1.6, 0.7, PODH - 0.05, 0.1);
  fixed(podium);

  const tgTex = ctex(cv(128, 1024, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h); const r = rnd(4);
    for (let y = 8; y < h; y += 14) for (let x = 10; x < w - 10; x += 22) if (r() < 0.22) { g.fillStyle = `rgba(80,220,255,${(0.2 + r() * 0.6).toFixed(2)})`; g.fillRect(x, y, 12, 3); }
  }));
  M.towerGlass = new THREE.MeshPhysicalMaterial({ color: 0x081018, roughness: 0.18, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.35, emissive: 0xffffff, emissiveMap: tgTex, emissiveIntensity: 1.4 });
  const TW = 6.2, TH = 16.2, TD = 4.2, FZ = TD / 2, HW = TW / 2;
  const topY = (x) => TH - 0.4 + ((x + HW) / TW) * -2.6; // slanted crown: high on the left, falling 2.6 to the right
  const tower = new THREE.Group(); tower.position.set(0, PODH, 0); tower.rotation.y = deg(22); up.add(tower);
  const tb = new THREE.Group(); tower.add(tb);
  const ext = (pts, depth, m, bev = 0.12) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: depth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3 }); g.translate(0, 0, -(depth - 2 * bev) / 2); return new THREE.Mesh(g, m); };
  const gx0 = 0.15, gx1 = 2.55, gxm = (gx0 + gx1) / 2, gy0 = 1.9;
  { // main slab: crown peak at the left edge, a short flat, then the slope
    tb.add(ext([[-HW, 0], [HW, 0], [HW, topY(HW)], [-HW + 0.9, TH], [-HW, TH - 0.5]], TD, M.white, 0.16));
    // setback volume at the back right, a step lower, banded with dark windows
    const SB = { x0: HW - 0.3, x1: HW + 1.7, z0: -FZ + 0.1, z1: FZ - 1.3, h: TH * 0.66 };
    add(tb, box(SB.x1 - SB.x0, SB.h, SB.z1 - SB.z0, M.white2, 0.12), (SB.x0 + SB.x1) / 2, SB.h / 2, (SB.z0 + SB.z1) / 2);
    add(tb, box(SB.x1 - SB.x0 + 0.1, 0.3, SB.z1 - SB.z0 + 0.1, M.mid, 0.04), (SB.x0 + SB.x1) / 2, SB.h + 0.15, (SB.z0 + SB.z1) / 2);
    for (let y = 2.4; y < SB.h - 1; y += 1.55) {
      add(tb, box(0.06, 0.62, SB.z1 - SB.z0 - 0.6, M.char), SB.x1 + 0.02, y, (SB.z0 + SB.z1) / 2);
      add(tb, box(SB.x1 - SB.x0 - 0.5, 0.62, 0.06, M.char), (SB.x0 + SB.x1) / 2 + 0.15, y, SB.z1 + 0.02);
    }
    // full-height glass slot on the front face, framed by proud fins; its top follows the crown slope
    const gt0 = topY(gx0) - 0.55, gt1 = topY(gx1) - 0.55;
    add(tb, ext([[gx0, gy0], [gx1, gy0], [gx1, gt1], [gx0, gt0]], 0.14, M.towerGlass, 0.02), 0, 0, FZ + 0.03);
    for (const [x, t] of [[gx0 - 0.2, gt0], [gx1 + 0.2, gt1]]) add(tb, ext([[x - 0.2, gy0 - 0.35], [x + 0.2, gy0 - 0.35], [x + 0.2, t + 0.35], [x - 0.2, t + 0.35]], 0.5, M.white, 0.06), 0, 0, FZ + 0.12);
    add(tb, box(gx1 - gx0 + 0.8, 0.36, 0.5, M.white, 0.06), gxm, gy0 - 0.18, FZ + 0.12);
    // crown: a charcoal cap band under the slope and a mid-grey coping
    const cap = ext([[-HW, TH - 0.5 - 0.5], [-HW + 0.9, TH - 0.5], [HW, topY(HW) - 0.5], [HW, topY(HW) - 0.85], [-HW + 0.9, TH - 0.85], [-HW, TH - 1.35]], TD + 0.06, M.char, 0.01); tb.add(cap);
    // circuit line with a diamond node and branch stubs, down the middle of the glass
    const LZ = FZ + 0.12, ly1 = Math.min(gt0, gt1) - 0.4, gh = ly1 - gy0, mid = gy0 + gh * 0.55, dh = 0.75, dw = 0.5;
    seg(tb, gxm, gy0 + 0.3, gxm, mid - dh, LZ, 0.07); seg(tb, gxm, mid + dh, gxm, ly1, LZ, 0.07);
    seg(tb, gxm, mid + dh, gxm + dw, mid, LZ, 0.07); seg(tb, gxm + dw, mid, gxm, mid - dh, LZ, 0.07); seg(tb, gxm, mid - dh, gxm - dw, mid, LZ, 0.07); seg(tb, gxm - dw, mid, gxm, mid + dh, LZ, 0.07);
    for (const [y, s] of [[gy0 + gh * 0.14, 1], [gy0 + gh * 0.3, -1], [gy0 + gh * 0.76, 1], [gy0 + gh * 0.9, -1]]) {
      seg(tb, gxm, y, gxm + s * 0.55, y + 0.4, LZ, 0.05);
      const n = cyl(0.11, 0.11, 0.03, M.neon, 16); n.rotation.x = Math.PI / 2; add(tb, n, gxm, y, LZ);
    }
    tower.userData.py = [gy0 + 0.3, ly1];
    tower.userData.pulses = [0, 0.33, 0.66].map((p) => { const s = glow(0x8ff0ff, 0.9, 0.9); add(tower, s, gxm, gy0, LZ + 0.08); s.userData.p = p; return s; });
    // hexagon emblem on the white panel left of the glass
    const em = new THREE.Group(); em.position.set(-1.45, TH * 0.6, FZ + 0.012); tb.add(em);
    const ep = new THREE.Mesh(new THREE.CircleGeometry(1.0, 6), M.glass); ep.rotation.z = Math.PI / 6; em.add(ep);
    const hex = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 4, 6), M.neon); hex.rotation.z = Math.PI / 6; em.add(hex);
    seg(em, 0, 0.55, 0.36, 0, 0.01, 0.05); seg(em, 0.36, 0, 0, -0.55, 0.01, 0.05); seg(em, 0, -0.55, -0.36, 0, 0.01, 0.05); seg(em, -0.36, 0, 0, 0.55, 0.01, 0.05);
    // panel seams on the white front, and a vertical light slit at the left edge
    for (const y of [4.2, 7.6, 13.4]) add(tb, box(HW + gx0 - 0.5, 0.04, 0.03, M.mid), (-HW + gx0 - 0.4) / 2, y, FZ + 0.01);
    add(tb, box(0.1, TH - 4.2, 0.05, M.neon), -HW + 0.32, (TH - 4.2) / 2 + 1.6, FZ + 0.02);
    // left face: two tall dark windows and a light band
    for (const z of [-0.9, 0.9]) add(tb, box(0.06, 5.2, 0.7, M.towerGlass), -HW - 0.02, 6.4, z);
    add(tb, box(0.05, 0.06, TD - 0.5, M.neon), -HW - 0.04, 9.4, 0);
    // base collar with a dark window band and a lit sill, and a hologram panel floating in front (ref 2)
    add(tb, box(TW + 1.3, 1.6, TD + 1.3, M.white2, 0.2), 0.35, 0.8, 0);
    add(tb, box(TW + 1.34, 0.42, TD + 1.34, M.char, 0.04), 0.35, 1.0, 0);
    add(tb, box(TW + 1.38, 0.05, TD + 1.38, M.neon), 0.35, 0.66, 0);
    // antenna on the crown peak
    const ant = new THREE.Group(); ant.position.set(-HW + 0.9, TH, 0); tb.add(ant);
    add(ant, box(0.7, 0.35, 0.7, M.mid, 0.05), 0, 0.17, 0);
    add(ant, cyl(0.08, 0.13, 3.4, M.metal, 12), 0, 2.0, 0);
    for (const y of [1.3, 2.2]) add(ant, box(0.7, 0.05, 0.05, M.metal), 0, y, 0);
    const tip = glow(0xff5a5a, 1.0, 0.9); add(tower, tip, -HW + 0.9, TH + 3.8, 0); tower.userData.tip = tip;
  }
  fixed(tb);
  const emGlow = glow(0x5be3ff, 3.0, 0.35); add(tower, emGlow, -1.45, TH * 0.6, FZ + 0.15);
  const coreHolo = screen(2.6, 1.7, 400, 260, (g, w, h) => {
    uiFrame(g, w, h, "REVIEW CORE", "8 agents · 1 run");
    brain(g, w / 2, h * 0.6, h * 0.24);
  });
  add(tower, coreHolo, gxm, 3.0, FZ + 1.5);
  reg(tower, "tower"); reg(podium, "tower");

  // score hologram at the front corner of the L2 roof
  const scoreG = new THREE.Group(); scoreG.position.set(7.7 - TX, 0, 7.7 - TZ); scoreG.rotation.y = deg(45); up.add(scoreG);
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

  // benchmark dish: a rooftop unit at the back right of the L2 roof
  const dish = new THREE.Group(); dish.position.set(6.6, T2, -4.4); town.add(dish);
  add(dish, shadowy(cyl(0.18, 0.28, 0.9, M.white, 16)), 0, 0.45, 0);
  const dishHead = add(dish, new THREE.Group(), 0, 0.95, 0);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), M.white); bowl.material = M.white.clone(); bowl.material.side = THREE.DoubleSide; bowl.rotation.x = -1.0; dishHead.add(shadowy(bowl));
  add(dishHead, cyl(0.03, 0.03, 0.9, M.metal, 8), 0, 0.3, 0.25).rotation.x = -1.0;
  reg(dish, "benchmark");

  // compute core on the left (-x) arm's roof terrace (Town v2 phase 5): a white silo with charcoal vent bands,
  // a lit base ring and a glass crown, flanked by two rooftop units. White on white, like the refs; no dark blob.
  const CORE = V3(-11, T1, 0);
  // rooftop unit: white casing, louvred side, a fan grille on top
  function rooftopUnit(parent, x, z, w = 1.6, d = 1.1, h = 0.8, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
    add(g, box(w, 0.08, d, M.mid, 0.02), 0, 0.04, 0);
    add(g, box(w - 0.1, h, d - 0.1, M.white, 0.05), 0, 0.08 + h / 2, 0);
    add(g, plane(w - 0.4, h * 0.55, M.vent), 0, 0.08 + h / 2, d / 2 - 0.045);
    for (const sx of w > 1.3 ? [-w / 4, w / 4] : [0]) { const f = plane(Math.min(0.6, d - 0.3), Math.min(0.6, d - 0.3), M.fan); f.rotation.x = -Math.PI / 2; add(g, f, sx, 0.09 + h, 0); }
    return fixed(g);
  }
  { const cc = new THREE.Group(); cc.position.copy(CORE); scene.add(cc);
    const base = new THREE.Group(); cc.add(base);
    base.add(slab(roundedPoly(8, 2.7, 0.5, OCT), 0.18, M.mid, 0.04));
    add(base, cyl(1.62, 1.8, 2.3, M.white, 48), 0, 0.18 + 1.15, 0);
    for (const y of [0.85, 1.55]) add(base, cyl(1.73, 1.73, 0.3, M.ventC, 48, true), 0, y, 0);
    add(base, cyl(1.7, 1.7, 0.16, M.mid, 48), 0, 2.56, 0);
    add(base, cyl(1.5, 1.5, 0.06, M.char, 48), 0, 2.66, 0);
    const rg = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.035, 6, 96), M.neon); rg.rotation.x = Math.PI / 2; add(base, rg, 0, 0.3, 0);
    const rg2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.03, 6, 96), M.neon); rg2.rotation.x = Math.PI / 2; add(base, rg2, 0, 2.7, 0);
    rooftopUnit(cc, 0, 3.75, 1.5, 1.0, 0.7, Math.PI);
    fixed(base);
    const domeM = new THREE.MeshPhysicalMaterial({ color: 0xdff6ff, roughness: 0.04, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false });
    add(cc, new THREE.Mesh(new THREE.SphereGeometry(1.32, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeM), 0, 2.68, 0);
    const coreRod = cyl(0.32, 0.32, 1.1, neon(0x5be3ff), 24); coreRod.material.userData.base.multiplyScalar(0.55); add(cc, coreRod, 0, 3.15, 0);
    for (const y of [2.95, 3.35]) { const r3 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 48), M.neon); r3.rotation.x = Math.PI / 2; add(cc, fixed(r3), 0, y, 0); }
    add(cc, glow(0x5be3ff, 3.4, 0.55), 0, 3.2, 0);
    reg(cc, "core"); }
  // more rooftop units and planters on the open L1 terraces (greebles)
  rooftopUnit(town, -12.3, -5.6, 1.8, 1.2, 0.85, 0);
  rooftopUnit(town, 5.8, -12.4, 1.6, 1.1, 0.8, Math.PI / 2);
  M.leaf = std(0x6f9f78, 0.8);
  function planter(x, z, len, ry = 0, y = T1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; town.add(g);
    add(g, box(len, 0.5, 0.7, M.white, 0.06), 0, 0.25, 0); add(g, box(len - 0.14, 0.04, 0.56, M.char), 0, 0.5, 0);
    add(g, box(len + 0.04, 0.04, 0.74, M.mid), 0, 0.03, 0);
    const r = rnd(Math.round(x * 31 + z * 7 + 500));
    for (let u = -len / 2 + 0.35; u < len / 2 - 0.2; u += 0.42) { const s = sph(0.22 + r() * 0.1, M.leaf, 12, 8); s.scale.y = 0.8; add(g, s, u, 0.6 + r() * 0.06, (r() - 0.5) * 0.18); }
    return fixed(g);
  }
  planter(-5.2, 12.6, 2.6); planter(0.6, 12.6, 2.6); planter(12.6, -3.0, 2.6, Math.PI / 2);

  // repo pillars on the L2 roof, three along each front edge, left to right in run order
  const pods = new THREE.Group(); scene.add(pods);
  const podList = [];
  const POD_SLOTS = [[-4.4, 9.1], [-1.6, 9.1], [1.2, 9.1], [9.1, 1.2], [9.1, -1.6], [9.1, -4.4]];
  function buildPods(repos) {
    for (const p of podList) pods.remove(p.g);
    for (let i = pick.length - 1; i >= 0; i--) if (String(pick[i].userData.pick).startsWith("repo:")) pick.splice(i, 1);
    podList.length = 0;
    repos.slice(0, 6).forEach((r, i) => {
      const g = new THREE.Group(); g.position.set(POD_SLOTS[i][0], T2, POD_SLOTS[i][1]); g.rotation.y = deg(45); g.scale.setScalar(0.8); pods.add(g);
      const col = new THREE.Color(scoreHex(num(r.score) || 0));
      add(g, shadowy(slab(roundedPoly(6, 0.95, 0.16), 0.36, M.white, 0.06)), 0, 0.06, 0);
      const pm = neon(col.getHex()); pm.userData.base.multiplyScalar(0.3); add(g, slab(roundedPoly(6, 0.7, 0.1), 0.05, pm, 0.015), 0, 0.42, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 6, 6), neon(col.getHex())); ring.rotation.set(Math.PI / 2, 0, Math.PI / 6); add(g, ring, 0, 0.44, 0);
      const bm = holo(null, 0.16); bm.color = col.clone(); bm.userData.keep = true;
      add(g, cyl(0.4, 0.52, 1.5, bm, 6, true), 0, 1.2, 0);
      const cube = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), holo(null, 0.4)); cube.material.color = col.clone(); cube.material.userData.keep = true; add(g, cube, 0, 1.45, 0);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2), toneMapped: false })); cube.add(edges);
      const hr = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 48), neon(col.getHex())); hr.rotation.x = Math.PI / 2; add(g, hr, 0, 2.0, 0);
      add(g, glow(col.getHex(), 1.6, 0.3), 0, 1.45, 0);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ transparent: true, map: ctex(cv(512, 128, (gg, w, h) => {
        gg.fillStyle = "#26323e"; gg.font = `600 46px ${MONO}`; gg.textAlign = "center"; gg.textBaseline = "middle";
        let s = shortRepo(r.full_name); while (gg.measureText(s).width > w - 20 && s.length > 4) s = s.slice(0, -2); if (s !== shortRepo(r.full_name)) s += "…";
        gg.fillText(s, w / 2, 40); gg.fillStyle = scoreHex(num(r.score) || 0); gg.font = `700 44px ${FONT}`; gg.fillText(num(r.score) == null ? "–" : r.score + "/100", w / 2, 96);
      })) }));
      add(g, lbl, 0, 0.24, 0.83);
      reg(g, "repo:" + r.full_name);
      podList.push({ id: "repo:" + r.full_name, g, cube });
    });
  }

  // ---- drone (benchmark), refs 1–2: white lifting-body hull, swept wings, twin rear thrusters, and a glowing
  // wireframe sphere with the brain inside, carried on a collar above the hull ----
  const ship = new THREE.Group(); scene.add(ship);
  { const body = new THREE.Group(); ship.add(body);
    const hull = new THREE.Mesh(new THREE.LatheGeometry([[0, -1.7], [0.3, -1.55], [0.5, -1.0], [0.56, -0.1], [0.5, 0.8], [0.36, 1.35], [0.14, 1.7], [0, 1.78]].map(([x, y]) => new THREE.Vector2(x, y)), 40), M.white);
    hull.rotation.x = Math.PI / 2; hull.scale.set(1.35, 1, 0.6); body.add(shadowy(hull, true, false));
    // cockpit visor and a lit keel line
    const cp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.glass); cp.scale.set(0.9, 0.42, 1.25); cp.position.set(0, 0.22, 1.0); body.add(cp);
    add(body, box(0.05, 0.04, 2.6, M.neon), 0, -0.33, 0);
    // swept wings: root chord at the hull, tip swept back and thinner; a neon edge on each leading edge
    const wingShape = (s) => new THREE.Shape([[0.45, 0.55], [2.55, -0.55], [2.6, -0.95], [0.45, -0.9]].map(([x, z]) => new THREE.Vector2(s * x, -z)));
    for (const s of [-1, 1]) {
      const wg = new THREE.ExtrudeGeometry(wingShape(s), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
      wg.rotateX(-Math.PI / 2); wg.translate(0, -0.06, 0);
      const wing = new THREE.Mesh(wg, M.white); wing.rotation.z = s * -0.06; body.add(shadowy(wing, true, false));
      const le = box(Math.hypot(2.1, 1.1), 0.035, 0.035, M.neon); le.position.set(s * 1.5, -0.01, 0.0); le.rotation.y = s * Math.atan2(1.1, 2.1); body.add(le);
      add(body, box(0.08, 0.03, 0.42, M.char), s * 2.55, -0.01, -0.75);
      const nav = glow(s < 0 ? 0xff5a5a : 0x4dff9a, 0.6, 0.9); nav.position.set(s * 2.6, 0, -0.6); body.add(nav);
      // twin thrusters at the wing roots, a lit ring and a flame glow at each nozzle
      const th = cyl(0.24, 0.3, 1.3, M.white2, 24); th.rotation.x = Math.PI / 2; th.position.set(s * 0.68, -0.05, -1.2); body.add(th);
      add(body, cyl(0.31, 0.31, 0.12, M.char, 24), s * 0.68, -0.05, -1.86).rotation.x = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 28), neon(0x5be3ff)); ring.position.set(s * 0.68, -0.05, -1.93); body.add(ring);
      const fl = glow(0x5be3ff, 1.5, 0.9); fl.position.set(s * 0.68, -0.05, -2.2); body.add(fl); ship.userData.flames = (ship.userData.flames || []).concat(fl);
    }
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [0.75, 0], [0.95, 0.55], [0.55, 0.55]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }), M.white);
    fin.rotation.y = Math.PI / 2; fin.position.set(-0.025, 0.2, -0.75); body.add(fin);
    // collar and the sphere: glass shell, a glowing geodesic wireframe, the brain inside
    const SC = V3(0, 0.95, 0.15);
    add(body, cyl(0.62, 0.78, 0.22, M.white, 40), SC.x, 0.32, SC.z); add(body, cyl(0.6, 0.6, 0.04, M.char, 40), SC.x, 0.44, SC.z);
    const cr = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 8, 64), M.neon); cr.rotation.x = Math.PI / 2; add(body, cr, SC.x, 0.45, SC.z);
    const shell = sph(0.98, new THREE.MeshPhysicalMaterial({ color: 0xdff6ff, roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }), 40, 24); shell.position.copy(SC); body.add(shell);
    const geo = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.0, 2)), new THREE.LineBasicMaterial({ color: 0x7ef3ff, transparent: true, opacity: 0.85, toneMapped: false }));
    geo.material.userData.base = new THREE.Color(0x7ef3ff).multiplyScalar(0.3); neonMats.push(geo.material);
    geo.position.copy(SC); body.add(geo);
    const bg = new THREE.IcosahedronGeometry(0.62, 5), p = bg.attributes.position, v = V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const fold = 0.06 * Math.sin(14 * n.x + 9 * n.y) * Math.sin(12 * n.z - 7 * n.y) + 0.03 * Math.sin(30 * n.y + 21 * n.z); const fiss = Math.abs(n.x) < 0.08 ? -0.08 : 0; v.multiplyScalar(1 + fold + fiss); v.y *= 0.8; v.z *= 1.15; p.setXYZ(i, v.x, v.y, v.z); }
    bg.computeVertexNormals();
    const brainM = std(0x0f5c78, 0.3, { emissive: new THREE.Color(0x2fd2ff), emissiveIntensity: 0.9 });
    const brainMesh = new THREE.Mesh(bg, brainM); brainMesh.position.copy(SC); brainMesh.scale.setScalar(1.0); body.add(brainMesh);
    const brainW = new THREE.Mesh(bg, holo(null, 0.5)); brainW.material.wireframe = true; brainW.scale.setScalar(1.015); brainMesh.add(brainW);
    add(body, glow(0x5be3ff, 3.2, 0.4), SC.x, SC.y, SC.z);
    ship.userData.brain = brainMesh; ship.userData.body = body; ship.userData.geo = geo;
    ship.scale.setScalar(1.55);
  }
  reg(ship, "benchmark");

  // ---- robots (after Felipe's reference figure: floating head, black visor, cyan eyes, ear fin, egg body) ----
  const RM = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xe9ecef, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.1, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
    ear: std(0x24272d, 0.4, { metalness: 0.4 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x7ef3ff, toneMapped: false }),
    line: new THREE.MeshBasicMaterial({ color: 0x5ee9ff, toneMapped: false }),
    joint: std(0x1d232b, 0.32, { metalness: 0.75 }),
  };
  const BOT_S = 0.65; // about a third of a room's opening height
  const STATUS = { working: new THREE.Color(0x3fe0ff), done: new THREE.Color(0x3fd18a), waiting: new THREE.Color(0x8796ad) };
  const ringGeo = new THREE.RingGeometry(0.46, 0.55, 64), discGeo = new THREE.CircleGeometry(0.62, 48);
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
    // chest light in the agent's colour (the only place it shows on the figure itself)
    { const bz = radiusAt(0.56) * 0.9 + 0.006, bd = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), neon(accent)); bd.material.userData.base.multiplyScalar(0.5); add(hover, bd, 0, 0.56, bz);
      const br = new THREE.Mesh(new THREE.RingGeometry(0.062, 0.078, 24), RM.ear); add(hover, br, 0, 0.56, bz - 0.002); }
    const headPivot = new THREE.Group(); headPivot.position.y = 0.805 + 0.42; hover.add(headPivot);
    // dark joints: a floating neck collar with a lit seam, shoulders, elbows and hands
    add(hover, cyl(0.15, 0.19, 0.07, RM.joint, 28), 0, 0.85, 0);
    const nr = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 32), acc); nr.rotation.x = Math.PI / 2; add(hover, nr, 0, 0.87, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 28), RM.shell); head.scale.set(1.1, 0.94, 1); headPivot.add(head);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.006, 6, 48), RM.ear); seam.rotation.x = Math.PI / 2; seam.position.y = 0.245; headPivot.add(seam);
    const vis = RM.visor.clone(); vis.emissive = new THREE.Color(0x2fd8ff); vis.emissiveIntensity = 0;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.366, 40, 20, Math.PI / 2 - 0.98, 1.96, Math.PI / 2 - 0.4, 0.7), vis); visor.scale.set(1.1, 0.94, 1); headPivot.add(visor);
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
      add(sh, sph(0.085, RM.joint, 20, 14));
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 16), RM.shell); upper.position.y = -0.1; sh.add(upper);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.008, 6, 24), acc); ring.rotation.x = Math.PI / 2; ring.position.y = -0.2; sh.add(ring);
      const elbow = new THREE.Group(); elbow.position.y = -0.235; sh.add(elbow);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 6, 16), RM.shell); lower.position.y = -0.13; lower.scale.set(1, 1, 0.95); elbow.add(lower);
      add(elbow, sph(0.066, RM.joint, 16, 12)); add(elbow, sph(0.06, RM.joint, 16, 12), 0, -0.29, 0);
      arms.push({ sh, elbow, s });
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; root.add(shadow);
    // status ring under the feet (cyan working, green done, slate waiting) over a soft disc of the same colour
    const sel = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false })); sel.rotation.x = -Math.PI / 2; sel.position.y = 0.024; root.add(sel);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.2, toneMapped: false, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.018; root.add(disc);
    // only the shell and head cast shadows: the joints and trim would double the robots' draw calls for no visible gain
    hover.traverse((c) => { if (c.isMesh) { c.castShadow = c === body || c === head; c.userData.noCast = !c.castShadow; } });
    root.traverse((c) => { c.userData.noRecv = true; });
    root.scale.setScalar(BOT_S);
    reg(root, id);
    return { root, hover, headPivot, eyes, arms, shadow, sel, disc, vis, col: STATUS.waiting.clone() };
  }

  // spots and paths: L1 robots wait in the entrance court and walk the plinth walkway; the orchestrator and
  // synthesis work in L2 rooms and stay on the L1 roof terrace in front of them
  const lounge = [[16.3, -2.3], [16.3, 0], [16.3, 2.3], [17.9, -2.3], [17.9, 0], [17.9, 2.3]].map(([d, l]) => diagPt(d, l, P0));
  const bots = {};
  const L1 = ["collector", "benchmark", ...REVIEWERS];
  const SYN_HOME = V3(12.7, T1, 1.4), SYN_DONE = V3(12.6, T1, 7.0);
  META.order.forEach((id) => {
    const r = makeRobot(id, META.agents[id].color);
    scene.add(r.root);
    const level = L1.includes(id) ? "L1" : "UP";
    const b = { id, r, level, pos: V3(), yaw: 0, path: [], speed: 0, look: null, phase: Math.random() * 10, blink: 2 + Math.random() * 3, state: "waiting", want: null, wave: 0, typing: 0, chat: 0, amb: { next: 2 + Math.random() * 6, at: "lounge" } };
    if (level === "L1") { b.home = lounge[L1.indexOf(id)]; b.homeYaw = deg(45); }
    else if (id === "orchestrator") { b.home = stations.orchestrator.spot.clone(); b.homeYaw = stations.orchestrator.yaw; }
    else { b.home = SYN_HOME; b.homeYaw = deg(45); }
    b.pos.copy(b.home); b.yaw = b.homeYaw; b.target = { p: b.home, yaw: b.homeYaw };
    bots[id] = b;
  });
  function planPath(b, to) {
    const st = stations[b.id], pts = [];
    if (b.level === "L1") {
      const a = walkProj(b.pos), c = walkProj(to);
      if (a.d > 0.3) pts.push(a.p.clone());
      pts.push(...walkBetween(a.s, c.s));
      if (c.d > 0.3) pts.push(c.p.clone());
    } else if (st && (b.pos.distanceTo(st.spot) < 0.6 || to.distanceTo(st.spot) < 0.05)) pts.push(st.out.clone());
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
    if (b.state === "done") return b.level === "L1" ? { p: st.front, yaw: st.a } : { p: SYN_DONE, yaw: deg(45) };
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
  { const r = rnd(3), pos = []; for (let i = 0; i < 220; i++) { const a = r() * Math.PI * 2, d = 2 + r() * 12; pos.push(TX + Math.sin(a) * d, T2 + r() * 14, TZ + Math.cos(a) * d); } motes.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); }
  scene.add(motes);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb4c0cc, 0.6); scene.add(hemi);
  // key light from the back right (refs 1–2): lit +x faces, shaded +z faces, one long crisp shadow to the left
  const sun = new THREE.DirectionalLight(0xfff4e6, 3.4); sun.position.set(34, 36, -30); sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -31, right: 31, top: 31, bottom: -31, near: 10, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 1.5; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdbe8ff, 0.6); fill.position.set(-30, 20, 30); scene.add(fill);
  const glows = [V3(TX, T2 + 4, TZ), V3(7.7, T2 + 2.5, 7.7), V3(9.4, T1 + 1.5, 4.4), V3(9.6, P0 + 2, 9.6)].map((p) => { const l = new THREE.PointLight(0x4fd8ff, 0, 11, 1.7); l.position.copy(p); scene.add(l); return l; });

  // ---- theme ----
  let dark = false;
  function setTheme(d) {
    dark = !!d;
    const g = skyCanvas.getContext("2d"), grd = g.createLinearGradient(0, 0, 0, 256);
    // light = refs 1–2 (white lab, pale-blue sky, snowy dunes); dark = refs 3/5 (navy floor, cyan + violet glow)
    if (dark) { grd.addColorStop(0, "#02040c"); grd.addColorStop(0.55, "#0a1430"); grd.addColorStop(1, "#1a2350"); }
    else { grd.addColorStop(0, "#a9c6dd"); grd.addColorStop(0.55, "#d9e7f1"); grd.addColorStop(1, "#f4f7fa"); }
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256); skyTex.needsUpdate = true;
    // Lights stay low (lit white ≈ 0.8 linear) and exposure lifts them, so only HDR neon (≈ 3+) clears the bloom threshold.
    scene.fog.color.set(dark ? 0x060c1e : 0xf3f6f9).multiplyScalar(dark ? 1 : 2.6); scene.fog.near = CAM_R + (dark ? 12 : 22); scene.fog.far = CAM_R + (dark ? 80 : 100);
    hemi.intensity = dark ? 0.3 : 0.45; hemi.color.set(dark ? 0x4a5fa8 : 0xffffff); hemi.groundColor.set(dark ? 0x0a0f22 : 0xd4dce4);
    sun.intensity = dark ? 0.5 : 3.2; sun.color.set(dark ? 0x9aa8ff : 0xfbfcff);
    fill.intensity = dark ? 0.2 : 0.5; fill.color.set(dark ? 0x8a6cff : 0xdbe8ff);
    // light: Khronos PBR Neutral keeps lit white white (ACES greys it); dark keeps ACES for the neon night look
    renderer.toneMapping = dark ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    renderer.toneMappingExposure = dark ? 1.5 : 1.0;
    scene.environmentIntensity = dark ? 0.1 : 0.4;
    bloomBase = dark ? 0.34 : 0.42; bloom.radius = dark ? 0.28 : 0.12; bloom.threshold = dark ? 2.0 : 2.4;
    M.snow.color.set(dark ? 0x141d36 : 0xf2f5f8);
    M.plaza.color.set(dark ? 0x2c3a5c : 0xf4f6f9);
    for (const m of [M.vent, M.ventC, M.fan, bookM]) m.color.set(dark ? 0x7c879c : 0xffffff); M.leaf.color.set(dark ? 0x3d6b52 : 0x6f9f78);
    M.white2.color.set(dark ? 0x5e6880 : 0xd9dfe5); M.white.color.set(dark ? 0x8c97ad : 0xf2f4f6); M.mid.color.set(dark ? 0x4b556a : 0x9aa3ab); M.char.color.set(dark ? 0x0d1219 : 0x22282e); M.floor.color.set(dark ? 0x5a6478 : 0xb9c0c7); deskSide.color.copy(M.white.color); M.deck.color.set(dark ? 0x7a869c : 0xf1f4f6);
    M.window.emissiveIntensity = dark ? 2.2 : 0.4;
    M.towerGlass.emissiveIntensity = dark ? 2.6 : 0.7;
    ledGain = dark ? 5 : 3.5; if (ledMesh) { for (let k = 0; k < ledBase.length; k++) ledColor(k); ledMesh.instanceColor.needsUpdate = true; }
    M.ceil.color.set(dark ? 0xd8f6ff : 0xf6fbff).multiplyScalar(dark ? 2.2 : 1.4);
    // neon is HDR (> 1) so it alone clears the bloom threshold
    for (const m of neonMats) m.color.copy(m.userData.base).multiplyScalar(dark ? 4.2 : 6);
    holoBack.color.set(dark ? 0x04101c : 0x0b2232); holoBack.opacity = dark ? 0.45 : 0.72;
    for (const m of holoMats) {
      m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (!m.userData.keep) m.color.set(dark ? 0x6fe8ff : m.userData.backed ? 0x7fe6ff : 0x0f9bd0).multiplyScalar(dark ? 1.8 : m.userData.backed ? 1.6 : 1.25);
      m.opacity = m.userData.op * (dark ? 1 : 0.95); m.needsUpdate = true;
    }
    for (const s of glowSprites) { s.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; s.material.opacity = s.userData.op * (dark ? 1 : 0.4); s.material.needsUpdate = true; }
    glows.forEach((l, i) => { l.intensity = dark ? 2.5 : 0; l.color.set(i === 1 ? 0x9b7bff : 0x4fd8ff); });
    stars.visible = dark; motes.material.opacity = dark ? 0.8 : 0.45; motes.material.color.set(dark ? 0x7ef3ff : 0x1aa6d1);
    RM.eye.color.set(dark ? 0x9ff7ff : 0x5ee9ff).multiplyScalar(dark ? 4 : 3); RM.line.color.set(dark ? 0x7ef3ff : 0x3fd8f5).multiplyScalar(dark ? 3.5 : 2.5);
  }

  // ---- camera (orthographic iso; framing is a visible height in world units) ----
  const sphC = new THREE.Spherical();
  let view = { offX: 0, offY: 0 };
  let tween = null, W = 1, H = 1;
  const curVH = () => VH0 / camera.zoom;
  function setVH(vh) { camera.zoom = VH0 / vh; camera.updateProjectionMatrix(); }
  function fitVH(vh) { return Math.max(vh, 37 / Math.max(0.3, W / Math.max(1, H))); } // keep the whole building's width in view
  function placeCamera(target, vh, az = HOME.az, polA = HOME.pol) {
    sphC.set(CAM_R, polA, az); camera.position.copy(target).add(V3().setFromSpherical(sphC)); controls.target.copy(target); setVH(vh);
  }
  function setOffset(x, y) {
    view.offX = x; view.offY = y;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(W, H, x, y, W, H);
  }
  function tweenTo(target, vh, off, dur = 1.1, az = null, polA = null) {
    const cur = V3().subVectors(camera.position, controls.target); sphC.setFromVector3(cur);
    tween = { t0: performance.now() / 1000, dur, fromT: controls.target.clone(), toT: target.clone(), fromD: curVH(), toD: vh, az: sphC.theta, pol: sphC.phi,
      toAz: az == null ? sphC.theta : sphC.theta + wrap(az - sphC.theta), toPol: polA == null ? sphC.phi : polA, fromO: [view.offX, view.offY], toO: off };
  }
  function stepTween(now) {
    if (!tween) return;
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const tg = tween.fromT.clone().lerp(tween.toT, e), d = Math.exp(Math.log(tween.fromD) + (Math.log(tween.toD) - Math.log(tween.fromD)) * e);
    placeCamera(tg, d, tween.az + (tween.toAz - tween.az) * e, tween.pol + (tween.toPol - tween.pol) * e);
    setOffset(tween.fromO[0] + (tween.toO[0] - tween.fromO[0]) * e, tween.fromO[1] + (tween.toO[1] - tween.fromO[1]) * e);
    if (k >= 1) tween = null;
  }
  controls.addEventListener("start", () => { tween = null; });
  function centerOf(id) {
    if (bots[id]) return bots[id].pos.clone().add(V3(0, 0.7, 0));
    if (id === "tower") return V3(TX, T2 + 11, TZ);
    if (id === "score") return scoreG.getWorldPosition(V3()).add(V3(0, 3.2, 0));
    if (id === "core") return CORE.clone().add(V3(0, 1.2, 0));
    if (id === "deploy") return rocket.position.clone().add(V3(0, 2.4, 0));
    if (id.startsWith("repo:")) { const p = podList.find((q) => q.id === id); return p ? p.g.position.clone().add(V3(0, 1, 0)) : V3(); }
    const st = stations[id]; if (st) return st.group.getWorldPosition(V3()).add(V3(0, 1.1, 0));
    return V3(0, 4, 0);
  }
  let focusId = null;
  // rooms are alcoves under a slab, so anything inside one is framed lower and from its opening
  const AZ_LIM = [controls.minAzimuthAngle, controls.maxAzimuthAngle];
  function underDeck(id) {
    if (id === "tower") return null;
    const b = bots[id], st = stations[id];
    if (b) return b.atStation && st && st.kind ? st.a : null;
    return st && st.kind ? st.a : null;
  }
  function focus(id, off) {
    focusId = id;
    if (!id) { tweenTo(HOME.target, fitVH(HOME.vh), [0, 0], 1.1, HOME.az, HOME.pol); return; }
    const o = [off ? off.x : 0, off ? off.y : 0], a = underDeck(id);
    if (a != null) { tweenTo(centerOf(id), bots[id] ? 6 : 8, o, 1.2, Math.min(AZ_LIM[1], Math.max(AZ_LIM[0], a)), deg(68)); return; }
    const vh = id === "tower" ? 40 : id === "benchmark" && !bots.benchmark.atStation ? 30 : bots[id] ? 6.5 : id.startsWith("repo:") ? 7 : 11;
    tweenTo(centerOf(id), vh, o);
  }
  function resetView() { focusId = null; tweenTo(HOME.target, fitVH(HOME.vh), [0, 0], 0.9, HOME.az, HOME.pol); }

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
  let uiClock = 0, running = false, raf = 0, onFrame = null, t = 0, states = {}, shipAway = 0, shipA = 0, shipPrev = V3(), cues = [];
  const tmp = V3(), tmp2 = V3();
  function animBot(b, dt) {
    const want = destination(b);
    if (!b.target || b.target.p.distanceTo(want.p) > 0.05 || Math.abs(b.target.yaw - want.yaw) > 0.01) goTo(b, want.p, want.yaw);
    let moving = false;
    if (b.path.length) {
      const nx = b.path[0]; tmp.subVectors(nx, b.pos); tmp.y = 0; const dist = tmp.length();
      const vmax = 4.2; b.speed = Math.min(vmax, b.speed + dt * 4);
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
    const st0 = b.state === "done" ? "done" : b.state === "working" ? "working" : "waiting";
    R.col.lerp(STATUS[st0], Math.min(1, dt * 4));
    const gain = st0 === "working" ? (dark ? 3.2 : 2.6) * (0.85 + 0.15 * Math.sin(ph * 3)) : dark ? 1.6 : 1.1;
    R.sel.material.color.copy(R.col).multiplyScalar(gain); R.disc.material.color.copy(R.col);
    const selOn = focusId === b.id ? 1 : hoverId === b.id ? 0.9 : st0 === "waiting" ? 0.45 : 0.75;
    R.sel.material.opacity += (selOn - R.sel.material.opacity) * Math.min(1, dt * 8);
    R.disc.material.opacity = (st0 === "waiting" ? 0.1 : 0.28) * (dark ? 1.3 : 1);
    R.vis.emissiveIntensity = b.typing * (0.35 + 0.3 * Math.sin(ph * 4.5)) * (dark ? 1.8 : 1.2);
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
    // shared shader clock, live UI screens, rack LEDs, floating holograms
    HT.value = t;
    bloom.strength = bloomBase * Math.min(1, Math.max(0.3, (curVH() - 3) / 26));
    uiClock -= dt; if (uiClock <= 0 && motionOK) { uiClock = 0.1; for (const u of UI) drawUI(u, t); }
    ledClock -= dt; if (ledClock <= 0 && motionOK) { ledClock = 0.12; for (let i = 0, n = Math.ceil(ledBase.length * 0.05); i < n; i++) { const k = Math.floor(Math.random() * ledBase.length); ledOn[k] ^= 1; ledColor(k); } ledMesh.instanceColor.needsUpdate = true; }
    for (const f of floaters) { f.o.position.y = f.y0 + Math.sin(t * f.sp + f.ph) * f.amp; if (f.rot) f.o.rotation.y += dt * f.rot; }
    // tower pulses, antenna blink, hologram float
    for (const p of tower.userData.pulses) { const u = (t * 0.12 + p.userData.p) % 1; p.position.y = tower.userData.py[0] + u * (tower.userData.py[1] - tower.userData.py[0]); p.material.opacity = Math.sin(u * Math.PI) * (dark ? 1 : 0.6); }
    tower.userData.tip.material.opacity = (Math.sin(t * 3) > 0.2 ? 1 : 0.15) * (dark ? 1 : 0.8);
    scorePanel.position.y = 3.3 + Math.sin(t * 1.1) * 0.06;
    dishHead.rotation.y = Math.sin(t * 0.25) * 1.2 + (bots.benchmark.atStation ? t * 0.8 : 0);
    // pods spin
    podList.forEach((p, i) => { p.cube.rotation.y = t * 0.6 + i; p.cube.position.y = 1.45 + Math.sin(t * 1.4 + i) * 0.08; });
    motes.rotation.y = t * 0.03;
    // spaceship: circles the tower; flies out to the north stars while the benchmark works
    const awayT = bots.benchmark.atStation ? 1 : 0; shipAway += (awayT - shipAway) * Math.min(1, dt * 0.35);
    shipA += dt * 0.1;
    const circ2 = polar(14.5, shipA, T2 + 11.5 + Math.sin(shipA * 2) * 1.0).add(V3(TX, 0, TZ)), far = polar(95, shipA + 0.4, 42);
    shipPrev.copy(ship.position); ship.position.copy(circ2).lerp(far, shipAway * shipAway * (3 - 2 * shipAway));
    tmp.subVectors(ship.position, shipPrev);
    if (tmp.lengthSq() > 1e-6) { const yaw = Math.atan2(tmp.x, tmp.z); ship.rotation.y = lerpAngle(ship.rotation.y, yaw, Math.min(1, dt * 3)); }
    ship.userData.body.rotation.z = -0.32 + Math.sin(t * 0.7) * 0.05; ship.userData.body.position.y = Math.sin(t * 1.3) * 0.15;
    ship.userData.brain.rotation.y = t * 0.4; ship.userData.geo.rotation.y = -t * 0.15; ship.userData.geo.rotation.x = t * 0.07;
    // rocket: ignition (0-1.4 s), climb out of view (to 6 s), hold, then a powered landing back on the pad (8-12 s)
    if (!replay && motionOK) { rocketNext -= dt; if (rocketNext <= 0 && rocketT < 0) { rocketT = 0; rocketNext = 55; } }
    let thrust = 0, ry = 0, shake = 0;
    if (rocketT >= 0 && motionOK) {
      rocketT += dt; const T = rocketT;
      if (T < 1.4) { thrust = T / 1.4; shake = 0.03 * thrust; }
      else if (T < 6) { const u = T - 1.4; ry = 3.2 * u * u; thrust = 1; }
      else if (T < 8) { ry = 70; }
      else if (T < 12) { const u = (T - 8) / 4; ry = 70 * (1 - u) * (1 - u) * (1 - u); thrust = u > 0.2 ? 0.75 : 0; }
      else { rocketT = -1; }
    }
    rb.position.set((Math.random() - 0.5) * shake, ry, (Math.random() - 0.5) * shake);
    rb.visible = ry < 69;
    flame.visible = thrust > 0.02; flame.scale.set(0.7 + thrust * 0.3, (0.4 + thrust * 0.9) * (0.9 + Math.random() * 0.2), 0.7 + thrust * 0.3);
    flameGlow.material.opacity = thrust * (dark ? 1 : 0.85) * (0.8 + Math.random() * 0.2);
    const armT = rocketT >= 0 && rocketT < 11.5 ? 1 : 0; armPivot.rotation.y += ((armT ? deg(205) : armPivot.userData.y0) - armPivot.rotation.y) * Math.min(1, dt * 2);
    const near = thrust * Math.max(0, 1 - ry / 9);
    smoke.forEach((s2, i) => { const u = (t * 0.5 + i / smoke.length) % 1, a = s2.userData.a + t * 0.2, rr2 = 0.8 + u * 3.2; s2.position.set(Math.sin(a) * rr2, 0.3 + u * 1.2, Math.cos(a) * rr2); s2.scale.setScalar(1.4 + u * 2.6); s2.material.opacity = near * (1 - u) * (dark ? 0.35 : 0.75); });
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
    composer.render(dt);
    onFrame && onFrame();
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); composer.setSize(W, H);
    const asp = W / H; camera.left = (-VH0 * asp) / 2; camera.right = (VH0 * asp) / 2; camera.top = VH0 / 2; camera.bottom = -VH0 / 2;
    if (view.offX || view.offY) camera.setViewOffset(W, H, view.offX, view.offY, W, H);
    if (!focusId && !tween) setVH(fitVH(HOME.vh)); else camera.updateProjectionMatrix();
  }
  // every rack LED in the town as one InstancedMesh; a few blink each tick
  { scene.updateMatrixWorld(true);
    const total = leds.reduce((n, l) => n + l.pts.length, 0), pal = [0x39e6ff, 0x39e6ff, 0x39e6ff, 0x4dff9a, 0x4dff9a, 0xffb02e];
    ledMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.022, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
    ledOn = new Uint8Array(total);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1), pw = V3(), r = rnd(11); let k = 0;
    for (const { g, pts } of leds) { g.getWorldQuaternion(q); for (const pt of pts) { pw.copy(pt).applyMatrix4(g.matrixWorld); m4.compose(pw, q, one); ledMesh.setMatrixAt(k, m4); ledBase[k] = new THREE.Color(pal[Math.floor(r() * pal.length)]); ledOn[k] = r() < 0.7 ? 1 : 0; ledColor(k); k++; } }
    scene.add(ledMesh);
  }
  // merge all fixed() architecture into one mesh per material + pick id (cuts ~1,000 draw calls)
  { scene.updateMatrixWorld(true);
    const buckets = new Map(), gone = new Set();
    scene.traverse((c) => {
      if (!c.isMesh || c.isInstancedMesh || !c.userData.bake) return;
      const key = c.material.uuid + "|" + (c.userData.pick || "");
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { m: c.material, id: c.userData.pick, noRecv: c.userData.noRecv, geos: [] }));
      const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      g.clearGroups(); g.applyMatrix4(c.matrixWorld); b.geos.push(g); gone.add(c);
    });
    for (const c of gone) c.parent.remove(c);
    for (let i = pick.length - 1; i >= 0; i--) if (gone.has(pick[i])) pick.splice(i, 1);
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(X.mergeGeometries(b.geos), b.m); b.geos.forEach((g) => g.dispose());
      if (b.id) { mesh.userData.pick = b.id; pick.push(mesh); }
      mesh.userData.noRecv = b.noRecv;
      scene.add(mesh);
    }
  }
  // every solid, lit mesh casts and receives shadows; glow, holograms and the far terrain do not cast
  scene.traverse((c) => {
    if (!c.isMesh || c === ground) return;
    const m = c.material, solid = m && !m.transparent && !m.isMeshBasicMaterial;
    c.receiveShadow = !c.userData.noRecv && (c.receiveShadow || solid);
    if (solid && !c.userData.noCast && !hills.children.includes(c) && c !== plaza) c.castShadow = true;
  });
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  W = canvas.clientWidth || 800; H = canvas.clientHeight || 600;
  placeCamera(HOME.target, HOME.vh);
  resize();
  setTheme(false);

  return {
    setTheme,
    setRun(inf) {
      info = inf;
      for (const s of screens) paint(s);
      buildPods(arr(inf.run && inf.run.repos));
      setTheme(dark); // new neon and holo materials pick up the theme
    },
    setReplay(on) { replay = !!on; if (!on) for (const id of META.order) bots[id].amb.next = Math.random() * 4; },
    setStates(st) { states = st; for (const [id, s] of Object.entries(st)) if (bots[id]) bots[id].state = s; },
    cue(id) {
      if (id === "publish") { const s = stations.score; if (s) s.cue = 1.5; bots.orchestrator.wave = 1.6; if (rocketT < 0) rocketT = 0; return; }
      const st = stations[id]; if (st) st.cue = 1.2;
      const ob = bots.orchestrator; ob.lookAt = id; ob.lookUntil = performance.now() / 1000 + 2.5; ob.wave = 1.2;
    },
    setFlights(f) { flights = f; },
    focus, resetView,
    settled() { return META.order.every((id) => !bots[id].path.length); },
    projectLabel(id) {
      const b = bots[id]; if (!b) return { x: 0, y: 0, behind: true };
      const p = b.pos.clone(); p.y += 2.25 * BOT_S; p.project(camera);
      return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, behind: p.z > 1, busy: b.atStation || id === "orchestrator" };
    },
    set onFrame(fn) { onFrame = fn; },
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); },
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); composer.dispose(); pmrem.dispose(); renderer.dispose(); },
    _debug: { scene, camera, controls, ship, bots, stations, renderer, composer, bloom, M, sun, hemi, fill, setTheme },
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
  st.innerHTML = `<canvas class="of-canvas" aria-label="3D lab office: the orchestrator and seven subagents replaying the selected run. Click any building, robot, pod or the spaceship for its numbers."></canvas>
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
  showMsg("Building the office…");
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
    showMsg("Couldn't load the 3D office. It needs cdn.jsdelivr.net; the numbers below still work.");
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
  } else if (id === "tower" || id === "core") {
    head = hd(OBJ[id].name, "Run totals", OBJ[id].color);
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
  } else if (id === "deploy") {
    head = hd("Deploy pad", "Publish", OBJ.deploy.color);
    body = `<p class="of-desc">After synthesis, <code>validate_run.py</code> checks the run against the schema and <code>publish.py</code> writes it to Cloudflare KV. The rocket launches when the run is published.</p>
      <div class="of-stats">${box("Run", esc(r ? r.run_id : "–"))}${box("Published", esc(r ? fmtWhen(r.run_at) : "–"))}${box("Schema", esc(r ? "v" + r.schema_version : "–"))}</div>`;
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
// Each robot's labels (name tag, speech line or the orchestrator's bubble) stack into one block above
// its head; blocks are placed bottom-up and pushed upward until none overlap.
function layoutLabels(W) {
  const blocks = [], speaker = O.latest && O.latest.id;
  for (const id of META.order) {
    const L = O.lab[id]; if (!L) continue;
    const parts = [];
    if (L.tag) parts.push(O.tags[id]);
    if (id === "orchestrator" && !O.bubble.hidden) parts.push(O.bubble);
    else if (!O.says[id].hidden) parts.push(O.says[id]);
    if (!parts.length) continue;
    const sz = parts.map((n) => [n.offsetWidth, n.offsetHeight]);
    const w = Math.max(...sz.map((s) => s[0])), h = sz.reduce((a, s) => a + s[1], 0) + (parts.length - 1) * 5;
    const talk = parts.length > 1 || id === speaker || (id === "orchestrator" && !O.bubble.hidden);
    blocks.push({ id, parts, sz, w, h, talk, x: Math.min(Math.max(L.p.x, w / 2 + 8), W - w / 2 - 8), y: L.p.y, y0: L.p.y });
  }
  // the speaking agent is placed first and never moves; the others step up once, then fade if still covered
  blocks.sort((a, b) => (b.talk - a.talk) || (b.y - a.y));
  const placed = [];
  const hits = (b) => placed.find((q) => Math.abs(b.x - q.x) < (b.w + q.w) / 2 + 6 && b.y > q.y - q.h - 4 && b.y - b.h < q.y + 4);
  for (const b of blocks) {
    let q = hits(b), fade = false;
    if (q && !b.talk) { b.y = q.y - q.h - 5; if (hits(b) || b.y0 - b.y > 46) { b.y = b.y0; fade = true; } }
    if (!fade) placed.push(b);
    let y = b.y;
    b.parts.forEach((n, i) => { n.style.transform = `translate(${b.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; n.style.opacity = fade ? ".18" : ""; y -= b.sz[i][1] + 5; });
  }
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
  O.lab = {};
  for (const id of META.order) {
    const p = town.projectLabel(id), tag = O.tags[id];
    // only agents at work carry a tag; the lounge crowd stays clean until hovered or picked
    const show = !p.behind && p.y > 70 && p.y < H - 10 && (p.busy || O.selected === id || tag.classList.contains("on"));
    tag.style.visibility = show ? "visible" : "hidden";
    O.lab[id] = { p, tag: show };
  }
  const now = performance.now() / 1000;
  const dt = O.lastNow ? Math.min(0.25, now - O.lastNow) : 0;
  O.lastNow = now;
  const run = O.stats;
  if (!run) { layoutLabels(W); setStatus("orchestrator", O.stats === undefined ? "Loading the run stats…" : "Ambient mode · usage appears after the next /review-github run"); return; }
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
  O.bubble.hidden = now > O.bubbleUntil || O.lab.orchestrator.p.behind;
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
    b.hidden = narrow || now > c.until || O.lab[id].p.behind || (id === "orchestrator" && !O.bubble.hidden) || !(O.latest && O.latest.id === id);
  }
  layoutLabels(W);
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
      <span class="eyebrow">Office${r ? " · " + esc(fmtDay(r.run_at)) : ""}</span>
      <div class="of-tools"><button class="of-btn" type="button" data-tw="reset">Reset view</button><button class="of-btn" type="button" data-tw="pause" aria-pressed="${O.userPaused}">${O.userPaused ? "Play" : "Pause"}</button></div>
      <h2 class="of-title"><span class="tone">Eight agents,</span>one office</h2>${note ? `<span class="of-note">${esc(note)}</span>` : ""}
    </div>
    <div class="of-status" id="twStatus" aria-live="polite"><i></i><div><b></b><span></span></div></div>
  </section>`;
  const facts = r ? runTiles(r) : "";
  if (!st) {
    const empty = st === null ? `<section class="glass card"><div class="sec-h"><h2>No agent usage for this run yet</h2></div><p class="muted">Step 5 of <code>/review-github</code> runs <code>scripts/agent_stats.py</code> and publishes tokens, cost and timing per agent. Until then the office runs in ambient mode; every building, robot, pod and the spaceship still opens its card.</p></section>` : "";
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
