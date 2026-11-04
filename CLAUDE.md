# CLAUDE.md

## What this is
GitHub Review: Claude Code subagents review Felipe's GitHub profile
(`felipecastro-data`) against his own rules, and a private Cloudflare web app
shows the result (desktop + mobile). Runs on the Claude subscription only:
subagents + `gh` CLI, no API keys. One command: `/review-github`.
Sister project: `../linkedin-multi-agent-profile-review` (same patterns).

## Pipeline
```
/review-github (.claude/skills/review-github/SKILL.md)
  collector ─┐ parallel   → data/profiles/<RUN_ID>.json
  benchmark ─┘            → data/work/<RUN_ID>/benchmark.json
  profile-reviewer     ─┐
  projects-reviewer     │ parallel → data/work/<RUN_ID>/<agent>_review.json
  engineering-reviewer  │
  architect-reviewer   ─┘
  synthesis               → data/runs/<RUN_ID>.json   (schema v1)
  scripts/validate_run.py → scripts/publish.py → Cloudflare KV
                          (keys run:<id>, profile:<id>, index; checks = app)
  scripts/agent_stats.py  → data/stats/<RUN_ID>.json → publish.py --stats
                          (key stats:<id> + index usage; Office tab)
  → Cloudflare Pages "github-review" (Access) renders it
```
RUN_ID = `r<YYYYMMDD>-<HHMM>` in America/Bogota time (`scripts/new_run.py`).

## App (`cloudflare/`)
- No build step for the UI: `public/index.html`, `app.css`, `app.js`, `theme.js`.
  `npm run build` only writes `public/rules.json` from `context/rules.md`.
- API: `functions/api/[[path]].js` over KV binding `GR_KV`; verifies the
  Cloudflare Access JWT itself. `DEV_NO_ACCESS=1` (`.dev.vars`) works on
  localhost only.
- Local preview: `npm --prefix cloudflare run dev` (port 8791, launch config
  `github-review`), fed by `python3 scripts/publish.py <RUN_ID> --local`.
- Office tab: `public/town.js`, a Three.js 0.170 lab office (ES modules from
  jsDelivr, loaded the first time the tab opens; CSP allows only that path).
  Robots replay the run from `stats:<id>`; every object opens a frosted card.

## Rules
- **Rules first.** `context/rules.md` (P1–P5, J1–J4, E1–E6, A1–A4) is the
  only scoring criteria; north stars are examples only.
- **Known context.** Every agent reads `context/known_context.md` first and
  never contradicts it. New confirmed facts go there, not in agent prompts.
- **Scope.** Header, profile README, pinned + README-linked repos. Nothing else.
- **No fabricated data.** Unknown → `null` / `[]` + `missing_fields`.
  Reviewers never fill gaps left by the collector.
- **Read-only GitHub.** Agents use `gh api` GETs only.
- **Secrets.** Never copy a secret value into any file; path + pattern only.
- **Schema changes.** If a run field changes, update `context/schema.md`,
  the synthesis prompt, `scripts/validate_run.py` and the app together; the
  app must keep rendering older runs.
- `data/` and `.env` are gitignored and must stay that way.
