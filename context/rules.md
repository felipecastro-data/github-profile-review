# Review rules — the only scoring criteria

Every finding maps to exactly one rule id below. North-star profiles are
examples, never criteria. `Level` says what a rule is judged on: `profile`
(once per run) or `repo` (once per in-scope repo).

## Profile (P)
| Id | Level | Rule |
|---|---|---|
| P1 | profile | Lead with your projects: a short, text-first README with your name, a one-line role, and your focus areas. |
| P2 | profile | Make the top of the README answer "what does this person build?" without scrolling. |
| P3 | profile | Keep the stack row to 8–12 tools you use in production, not everything you've touched. |
| P4 | profile | Add one row of contact badges and certifications. They're verifiable; trophies and widgets aren't. |
| P5 | profile | Skip trophies, stats cards, streaks and visitor counters, or keep one at most. |

## Projects (J)
| Id | Level | Rule |
|---|---|---|
| J1 | profile | Pin 4–6 flagship repos. Quality beats quantity, so archive or privatize noise. |
| J2 | repo | Build end-to-end pipelines (ingestion → transform → storage → serving), not isolated notebooks. |
| J3 | repo | Each README covers the problem, an architecture diagram, the stack, how to run it, and quantified results. |
| J4 | repo | Use realistic data at meaningful scale and state row counts and runtimes. |

## Engineering signal (E)
| Id | Level | Rule |
|---|---|---|
| E1 | repo | Use a modular `src/` layout and keep it consistent across repos. |
| E2 | repo | Include tests, linting, type hints and CI (GitHub Actions). |
| E3 | repo | Show data quality checks, logging, idempotent loads and error handling. |
| E4 | repo | Make each project reproducible with one command (`make up`, Docker, Codespaces). |
| E5 | repo | Never commit secrets; use `.env.example`. |
| E6 | repo | Keep commit history clean with small, descriptive commits. |

## Architect layer (A)
| Id | Level | Rule |
|---|---|---|
| A1 | repo | Document decisions with ADRs explaining why you chose one option over another and the trade-offs. |
| A2 | repo | Write design docs covering scalability, cost, governance and security. |
| A3 | repo | Show patterns, not just tools: medallion, CDC, SCD2, data contracts, lineage. |
| A4 | repo | Include IaC (Terraform/Bicep) and environment promotion (dev → test → prod). |

## Status and scoring
- Status per result: `pass` (1.0), `partial` (0.5), `fail` (0), `na` (excluded;
  only with a reason, e.g. A4 on a repo that deploys nothing).
- Rule score = mean over its results. Section score = mean of its rule
  scores × 100. Overall = mean of the four section scores.
- Repo score = mean of that repo's repo-level results × 100.
