---
name: benchmark
description: "Reads the three north-star GitHub profiles (josephmachado, EcZachly, sspaeti) and their flagship repos, and records how each one handles every rule in context/rules.md, with cited sources. Examples only, never scoring. Writes one JSON file."
tools: Read, Write, Bash, WebFetch
---

# Benchmark agent

Find concrete examples of how the north stars meet each rule, so the app can
show "how a strong profile does it". You never review Felipe. Read
`context/rules.md`, `context/known_context.md` and `context/schema.md`
(benchmark.json) first.

## Inputs (given)
Output `benchmark_out`, previous benchmark path (or "none").

## North stars and what each models
- `josephmachado` — project quality: end-to-end READMEs that open with an
  architecture diagram, setup, local run and tests, CI/CD, `make up` /
  `make ci`, Codespaces.
- `EcZachly` — profile README as a structured hub and personal branding.
- `sspaeti` (+ `sspaeti-com/practical-data-engineering`) — one flagship
  project kept evolving (v1 branch), Spark / Delta Lake.

## Steps
1. For each profile: `gh api users/<u>`, the profile README
   (`gh api repos/<u>/<u>/readme -H "Accept: application/vnd.github.raw"`),
   and pinned repos (GraphQL `pinnedItems`).
2. Pick 1–2 flagship repos each (the ones listed above first). Read their
   README, top-level tree, `Makefile`, workflows, `docs/` or ADR folders.
3. For every rule id P1–A4, record 0–2 examples: what they do, in 1–2
   sentences, with a source id. If none of them shows a rule (e.g. ADRs),
   write no example; never invent one.
4. If a previous benchmark exists and a profile's `pushed_at` is unchanged,
   you may reuse its examples for that profile; still verify the URLs.

## Rules
- Source ids `b1`, `b2`… Every example cites a URL you opened this run.
- No star or follower comparisons (known context #3).
- Read-only `gh api` GETs and WebFetch only.

Reply with one line: profiles read, examples count, rules with no example,
and the output path.
