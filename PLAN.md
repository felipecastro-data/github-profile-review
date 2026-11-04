# GitHub Profile Review — plan

Multi-agent review of github.com/felipecastro-data, run manually with `/review-github`.
Runs on the Claude subscription only (Claude Code subagents + `gh` CLI, no API keys).
Reference: `../linkedin-multi-agent-profile-review`.

## Scope
- Profile header (name, bio, links, avatar), profile README.
- Repos: pinned + repos linked from the profile README (deduplicated). Other repos out of scope.
- Rules (priority): Profile, Projects, Engineering signal, Architect layer (`context/rules.md`).
- North stars (examples only): josephmachado, EcZachly, sspaeti.

## Agents
| # | Agent | Job | Output |
|---|---|---|---|
| 1 | Collector | `gh api`: header, profile README, pinned + linked repos; per repo README, tree, CI, tests, Makefile/Docker, `.env.example`, ADRs, IaC, commits | `profile.json` |
| 2 | Benchmark | `gh api` on the 3 north-star profiles and their flagship repos; patterns per rule | `benchmark.json` |
| 3 | Profile reviewer | Profile rules | `profile_review.json` |
| 4 | Projects reviewer | Projects rules per repo; keep / improve / replace verdict; brief for an ideal replacement project; 4–6 repos max | `projects_review.json` |
| 5 | Engineering reviewer | Engineering signal rules per repo | `engineering_review.json` |
| 6 | Architect reviewer | Architect layer rules per repo | `architect_review.json` |
| 7 | Synthesis | Merge: pass/partial/fail per rule with evidence + fix, scores, prioritized actions, north-star example per rule, changes since last run | `runs/<RUN_ID>.json` |

Flow: Collector ∥ Benchmark → 4 reviewers in parallel → Synthesis → validate → publish → report.

## Web app (Cloudflare)
- Pages + Pages Function + KV, behind Cloudflare Access (only Felipe). Published with wrangler.
- Tabs: Overview, Profile, Projects (per repo + replacement briefs), Actions (checklist saved to KV), History (run picker + score trend), Sources.
- Light/dark, mobile, home-screen icon from the magnifier-over-code image.
- Town tab (the planned 3D Office): a three.js lab town that replays each run from agent stats.

## Phases
1. Plan and decisions — done
2. Scaffold: agents, skill, `known_context.md`, `rules.md`, run schema — done
3. Collector + scripts (`new_run`, `collect`, `scoring`, `validate_run`, `publish`) — done
4. Web app — done (LinkedIn Review layout: liquid glass, scroll story, particles; preview with sample data in local KV)
5. Cloudflare deploy + icons + Access — done (github-review.pages.dev, KV `github-review`, Access "GitHub Review" on both domains)
6. First real run + tuning — done (`r20261103-1619`; rewrite ids split: profile `w1`–`w49`, projects `w50`+; Town tab + 3D upgrade)
7. Repo README (following the rules) + git push — done
