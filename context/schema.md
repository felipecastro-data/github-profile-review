# Data shapes (schema v1)

Paths per run (`RUN_ID` = `r<YYYYMMDD>-<HHMM>`, America/Bogota):
```
data/profiles/<RUN_ID>.json          collector  (kept for "changes since last")
data/work/<RUN_ID>/benchmark.json    benchmark
data/work/<RUN_ID>/<agent>.json      profile_review | projects_review |
                                     engineering_review | architect_review
data/runs/<RUN_ID>.json              synthesis  (what the app renders)
```
Unknown values are `null` / `[]`, never guessed; say why in `missing_fields`.
- `ci_last_run` is the newest run of any workflow; `ci_runs` is the newest
  run of each workflow (judge E2 on the CI/test workflow, not a monitor).
- `environments` comes from path segments and from `environment:` /
  bundle `targets:` in the fetched key files.
- A committed `.env` is fetched only to scan it; it is never stored.

## profile.json (collector)
```json
{
  "schema_version": 1, "run_id": "", "collected_at": "", "username": "",
  "header": {"name": "", "bio": "", "company": "", "location": "",
             "website": "", "status": "", "avatar_url": "",
             "followers": 0, "following": 0, "public_repos": 0,
             "social": [{"provider": "", "url": ""}]},
  "readme": {"raw": "", "top_lines": "first ~25 lines, i.e. what shows without scrolling",
             "badges": [{"label": "", "kind": "stack|contact|cert|widget|other", "url": ""}],
             "widgets": ["stats card / trophy / streak / visitor counter urls"],
             "linked_repos": ["owner/name"]},
  "pinned": ["owner/name"],
  "repos": [{
    "full_name": "", "url": "", "source": ["pinned", "readme"],
    "description": "", "topics": [], "primary_language": "", "languages": {},
    "stars": 0, "archived": false, "pushed_at": "", "default_branch": "",
    "readme": "full raw text",
    "tree": ["every path in the default branch"],
    "signals": {
      "src_layout": false, "tests_dir": false, "test_files": 0,
      "ci_workflows": [".github/workflows/*.yml"], "ci_last_run": {"name": "", "conclusion": "", "at": ""},
      "ci_runs": [{"name": "", "path": "", "conclusion": "", "at": ""}],
      "lint_config": [], "type_hints_config": [],
      "makefile_targets": [], "dockerfile": false, "compose": false, "devcontainer": false,
      "env_example": false, "env_committed": false, "secret_hits": ["path:line pattern (value redacted)"],
      "adr_files": [], "design_docs": [], "iac_files": [], "environments": [],
      "notebooks": 0, "py_files": 0
    },
    "key_files": {"path": "first 200 lines of Makefile, workflows, pyproject, compose, ADR index, IaC entry, up to 4 source files"},
    "commits": {"total": 0, "sample": [{"sha": "", "date": "", "message": "", "files_changed": 0, "additions": 0, "deletions": 0}]}
  }],
  "missing_fields": [], "collector_notes": []
}
```

## benchmark.json (benchmark)
```json
{
  "agent": "benchmark",
  "profiles": [{"username": "", "flagship_repos": ["owner/name"], "strength": ""}],
  "patterns": [{"rule": "P1", "example": "what they do, 1–2 sentences", "source": "b1"}],
  "sources": [{"id": "b1", "url": "", "title": ""}]
}
```

## <agent>_review.json (the four reviewers)
```json
{
  "agent": "profile|projects|engineering|architect",
  "summary": "2 sentences",
  "results": [{
    "id": "f1", "rule": "E2", "repo": "owner/name or null for profile-level",
    "status": "pass|partial|fail|na",
    "evidence": ["path, file:line, url or field that proves it"],
    "finding": "what is true now, 1–2 sentences",
    "fix": "imperative, concrete; empty when pass",
    "impact": "high|medium|low", "effort": "S|M|L"
  }],
  "rewrites": [{"id": "w1", "rule": "P2", "target": "profile README top", "before": "exact current text", "after": "paste-ready text"}],
  "portfolio": {
    "ideal_count": 5, "current_count": 0,
    "verdicts": [{"repo": "", "verdict": "keep|improve|replace", "reason": ""}],
    "replacement_briefs": [{"id": "n1", "title": "", "replaces": "owner/name",
      "problem": "", "architecture": "ingestion → transform → storage → serving",
      "stack": [], "dataset": "public source + approx rows", "patterns": [],
      "rules_covered": ["J2", "A3"], "effort_weeks": 0}]
  }
}
```
- Finding ids are prefixed per agent: profile `p*`, projects `j*`,
  engineering `e*`, architect `a*` (so they never collide).
- `rewrites` only from profile and projects reviewers; `portfolio` only from
  the projects reviewer.

## run.json (synthesis → the app)
```json
{
  "schema_version": 1, "run_id": "", "run_at": "", "username": "", "profile_url": "",
  "summary": "2–3 sentences",
  "scores": {"overall": 0, "sections": {"profile": 0, "projects": 0, "engineering": 0, "architect": 0},
             "rules": {"P1": 0}, "repos": {"owner/name": 0}},
  "snapshot": {"followers": 0, "public_repos": 0, "pinned": 0, "in_scope_repos": 0,
               "repos_with_ci": 0, "repos_with_tests": 0, "repos_with_adrs": 0, "repos_with_iac": 0},
  "header": {}, "repos": [{"full_name": "", "url": "", "description": "", "score": 0, "verdict": ""}],
  "findings": [], "rewrites": [], "portfolio": {},
  "benchmark": {"profiles": [], "by_rule": {"P1": [{"example": "", "source": "b1"}]}},
  "actions": {"this_week": [{"id": "x1", "text": "", "ref": "e3"}], "this_month": [], "this_quarter": []},
  "changes_since_last": [], "sources": [], "notes": []
}
```
Must stay under 240 KB. Older runs must keep rendering when fields are added.
