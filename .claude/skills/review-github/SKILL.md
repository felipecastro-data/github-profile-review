---
name: review-github
description: Run Felipe's multi-agent GitHub profile review (collector + benchmark → profile, projects, engineering and architect reviewers in parallel → synthesis) and publish it to the GitHub Review web app on Cloudflare. Use for /review-github or "review my GitHub".
---

# /review-github — orchestrator

One run: collect + benchmark → 4 reviewers in parallel → synthesis →
validate → publish to the Cloudflare app.
Profile: `https://github.com/felipecastro-data` (username `felipecastro-data`).

Say in one line that the run started and takes ~10 minutes. Make a task list
with the steps below. Do not ask questions unless a step is blocked.

## Step 0 — Preflight
1. `python3 scripts/new_run.py` → note `RUN_ID`, `RUN_AT`, the output paths,
   `previous_profile`, `previous_run` and `previous_benchmark` it prints.
2. `gh auth status` must show `felipecastro-data` logged in; if not, stop:
   "Run `gh auth login`, then /review-github again."
3. `python3 scripts/publish.py --check` must print OK (wrangler and the KV
   namespace are reachable). On FAIL, keep going but skip Step 4.2 and say so
   in the report.

## Step 1 — Collector + benchmark (parallel)
Launch BOTH subagents in the SAME message:
- `collector`: username, RUN_ID, output `profile_out`.
- `benchmark`: output `benchmark_out`, previous benchmark path (or "none").
When both return, confirm both files parse. If the collector failed, stop.
If only the benchmark failed, go on (synthesis handles it).

## Step 2 — Four reviewers (parallel)
Launch ALL FOUR subagents in the SAME message, each with `profile`
(= `profile_out`), `previous_run` (or "none") and its output path:
- `profile-reviewer` → `profile_review_out`
- `projects-reviewer` → `projects_review_out`
- `engineering-reviewer` → `engineering_review_out`
- `architect-reviewer` → `architect_review_out`
When all return, confirm each file parses. Re-run a failed reviewer once.

## Step 3 — Synthesis
Launch `synthesis` with: profile, previous_profile, previous_run, benchmark,
the four review paths, RUN_ID, RUN_AT, output `run_out`.

## Step 4 — Validate and publish
1. `python3 scripts/validate_run.py <RUN_ID>` — must print OK. On ERROR,
   send the errors back to synthesis once, then re-validate. WARN lines are
   fine; mention them only if many.
2. `python3 scripts/publish.py <RUN_ID>` — must print OK. On FAIL, show the
   error and stop.
3. Never commit anything from `data/`: it is gitignored on purpose.

## Step 5 — Report
Reply in 3–5 short lines: overall score and the four section scores (with
delta vs last run), the weakest repo, the top fix this week, any secret hit,
and what could not be collected. Last line: "Open the GitHub Review app to
see it." No recap of the steps.
