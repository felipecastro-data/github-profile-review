#!/usr/bin/env python3
"""Check a run document (schema v1) before publishing. Exit code 1 on any ERROR.

Usage: python3 scripts/validate_run.py <RUN_ID>
"""
import json
import sys
from pathlib import Path

from scoring import SECTIONS, compute, load_rules

ROOT = Path(__file__).resolve().parent.parent
MAX_KB = 240
STATUSES = {"pass", "partial", "fail", "na"}
IMPACTS = {"high", "medium", "low"}
EFFORTS = {"S", "M", "L"}
VERDICTS = {"keep", "improve", "replace"}
ACTION_CAPS = {"this_week": 4, "this_month": 5, "this_quarter": 5}


def main(run_id: str) -> int:
    path = ROOT / "data" / "runs" / f"{run_id}.json"
    errors, warnings = [], []
    if not path.exists():
        print(f"ERROR missing {path.relative_to(ROOT)}")
        return 1
    size_kb = path.stat().st_size / 1024
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERROR invalid JSON: {e}")
        return 1

    if d.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if d.get("run_id") != run_id:
        errors.append(f"run_id is {d.get('run_id')!r}, expected {run_id!r}")
    if size_kb > MAX_KB:
        errors.append(f"{size_kb:.0f} KB is over {MAX_KB} KB")
    for key in ("run_at", "username", "summary", "scores", "findings", "actions", "repos"):
        if not d.get(key):
            errors.append(f"missing or empty: {key}")

    rules = load_rules()
    prof_path = ROOT / "data" / "profiles" / f"{run_id}.json"
    profile = json.loads(prof_path.read_text(encoding="utf-8")) if prof_path.exists() else None
    if profile is None:
        warnings.append(f"no {prof_path.relative_to(ROOT)}; in-scope checks skipped")
    in_scope = {r["full_name"] for r in (profile or {}).get("repos", [])}

    # findings
    findings = d.get("findings") or []
    ids = [f.get("id") for f in findings]
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"duplicate finding id {dup!r}")
    seen_pairs = set()
    for f in findings:
        fid, rule, repo = f.get("id"), f.get("rule"), f.get("repo")
        where = f"finding {fid}"
        if rule not in rules:
            errors.append(f"{where}: unknown rule {rule!r}")
            continue
        if not str(fid).startswith(rule[0].lower()):
            errors.append(f"{where}: id prefix should be {rule[0].lower()!r} for rule {rule}")
        if f.get("status") not in STATUSES:
            errors.append(f"{where}: bad status {f.get('status')!r}")
        if f.get("impact") not in IMPACTS:
            warnings.append(f"{where}: bad impact {f.get('impact')!r}")
        if f.get("effort") not in EFFORTS:
            warnings.append(f"{where}: bad effort {f.get('effort')!r}")
        if rules[rule] == "repo" and not repo:
            errors.append(f"{where}: {rule} is repo-level but repo is empty")
        if rules[rule] == "profile" and repo:
            warnings.append(f"{where}: {rule} is profile-level but names repo {repo!r}")
        if repo and in_scope and repo not in in_scope:
            errors.append(f"{where}: repo {repo!r} is out of scope")
        if f.get("status") in ("partial", "fail") and not f.get("fix"):
            warnings.append(f"{where}: {f.get('status')} without a fix")
        if f.get("status") == "na" and not f.get("finding"):
            warnings.append(f"{where}: na without a reason")
        if not f.get("evidence") and f.get("status") != "na":
            warnings.append(f"{where}: no evidence")
        pair = (rule, repo)
        if pair in seen_pairs:
            warnings.append(f"{where}: second result for ({rule}, {repo})")
        seen_pairs.add(pair)
    if in_scope:
        for rule, level in rules.items():
            if level == "repo":
                for repo in in_scope - {r for (ru, r) in seen_pairs if ru == rule}:
                    warnings.append(f"no {rule} result for {repo}")

    # scores must match context/rules.md
    expected, got = compute(findings), d.get("scores") or {}
    if got.get("overall") != expected["overall"]:
        errors.append(f"scores.overall is {got.get('overall')}, expected {expected['overall']}")
    for group in ("sections", "rules", "repos"):
        for k, v in expected[group].items():
            if (got.get(group) or {}).get(k) != v:
                errors.append(f"scores.{group}.{k} is {(got.get(group) or {}).get(k)}, expected {v}")
    for k in SECTIONS.values():
        if k not in (got.get("sections") or {}):
            warnings.append(f"scores.sections.{k} missing")

    # repos
    repo_names = {r.get("full_name") for r in d.get("repos") or []}
    if in_scope and repo_names != in_scope:
        errors.append(f"repos {sorted(repo_names)} differ from in-scope {sorted(in_scope)}")

    # rewrites + portfolio
    rw_ids = [w.get("id") for w in d.get("rewrites") or []]
    for w in d.get("rewrites") or []:
        if not w.get("after"):
            errors.append(f"rewrite {w.get('id')}: empty after")
        if w.get("rule") not in rules:
            warnings.append(f"rewrite {w.get('id')}: unknown rule {w.get('rule')!r}")
    pf = d.get("portfolio") or {}
    brief_ids = [b.get("id") for b in pf.get("replacement_briefs") or []]
    for v in pf.get("verdicts") or []:
        if v.get("verdict") not in VERDICTS:
            errors.append(f"portfolio verdict for {v.get('repo')}: bad value {v.get('verdict')!r}")
    for b in pf.get("replacement_briefs") or []:
        if in_scope and b.get("replaces") not in in_scope:
            warnings.append(f"brief {b.get('id')}: replaces {b.get('replaces')!r}, not an in-scope repo")
    if pf and not 4 <= (pf.get("ideal_count") or 0) <= 6:
        warnings.append(f"portfolio.ideal_count {pf.get('ideal_count')} is outside 4–6")
    all_ids = set(ids) | set(rw_ids) | set(brief_ids)
    for dup in {i for i in rw_ids + brief_ids if (rw_ids + brief_ids).count(i) > 1 or i in ids}:
        errors.append(f"id {dup!r} is used twice across findings/rewrites/briefs")

    # actions
    actions = d.get("actions") or {}
    action_ids = []
    for horizon, cap in ACTION_CAPS.items():
        items = actions.get(horizon) or []
        if len(items) > cap:
            warnings.append(f"actions.{horizon} has {len(items)} items (max {cap})")
        for a in items:
            action_ids.append(a.get("id"))
            if not a.get("text"):
                errors.append(f"actions.{horizon} {a.get('id')}: empty text")
            if a.get("ref") and a["ref"] not in all_ids:
                warnings.append(f"actions.{horizon} {a.get('id')} refers to unknown id {a['ref']!r}")
    for dup in {i for i in action_ids if action_ids.count(i) > 1}:
        errors.append(f"duplicate action id {dup!r}")
    secret_repos = [r["full_name"] for r in (profile or {}).get("repos", [])
                    if (r.get("signals") or {}).get("secret_hits")]
    if secret_repos:
        first = (actions.get("this_week") or [{}])[0]
        ref = next((f for f in findings if f.get("id") == first.get("ref")), {})
        if ref.get("rule") != "E5":
            errors.append(f"secret hits in {secret_repos}: first this_week action must fix them (E5)")

    # benchmark sources
    source_ids = {s.get("id") for s in d.get("sources") or []}
    for rule, examples in ((d.get("benchmark") or {}).get("by_rule") or {}).items():
        for ex in examples:
            if ex.get("source") and ex["source"] not in source_ids:
                warnings.append(f"benchmark.by_rule.{rule} cites unknown source {ex['source']!r}")

    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    n_actions = sum(len(actions.get(h) or []) for h in ACTION_CAPS)
    print(f"{'FAIL' if errors else 'OK'}  {path.relative_to(ROOT)}  {size_kb:.1f} KB  overall "
          f"{got.get('overall')}  {len(findings)} findings, {len(rw_ids)} rewrites, {n_actions} actions")
    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
