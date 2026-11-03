#!/usr/bin/env python3
"""Scores exactly as context/rules.md defines them. Used by synthesis and validate_run.

Usage: python3 scripts/scoring.py <RUN_ID>    print the scores of data/work/<RUN_ID>/*_review.json
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECTIONS = {"P": "profile", "J": "projects", "E": "engineering", "A": "architect"}
POINTS = {"pass": 1.0, "partial": 0.5, "fail": 0.0}
REVIEWS = ("profile_review", "projects_review", "engineering_review", "architect_review")


def load_rules() -> dict:
    """{rule_id: level} from the tables in context/rules.md."""
    text = (ROOT / "context" / "rules.md").read_text(encoding="utf-8")
    return dict(re.findall(r"^\|\s*([PJEA]\d+)\s*\|\s*(profile|repo)\s*\|", text, re.M))


def _mean(xs):
    return sum(xs) / len(xs) if xs else None


def _pct(x):
    return None if x is None else round(x * 100)


def compute(findings: list) -> dict:
    """Rule = mean of its results; section = mean of rule scores; overall = mean of sections;
    repo = mean of that repo's repo-level results. `na` is excluded everywhere."""
    rules = load_rules()
    by_rule, by_repo = {}, {}
    for f in findings:
        pts = POINTS.get(f.get("status"))
        if pts is None:
            continue
        by_rule.setdefault(f.get("rule"), []).append(pts)
        if rules.get(f.get("rule")) == "repo" and f.get("repo"):
            by_repo.setdefault(f["repo"], []).append(pts)
    rule_raw = {r: _mean(v) for r, v in by_rule.items()}
    section_raw = {}
    for letter, name in SECTIONS.items():
        vals = [v for r, v in rule_raw.items() if r and r[0] == letter and v is not None]
        section_raw[name] = _mean(vals)
    overall = _mean([v for v in section_raw.values() if v is not None])
    order = list(rules)
    return {
        "overall": _pct(overall),
        "sections": {k: _pct(v) for k, v in section_raw.items()},
        "rules": {r: _pct(rule_raw[r]) for r in sorted(rule_raw, key=lambda r: order.index(r) if r in order else 99)},
        "repos": {k: _pct(_mean(v)) for k, v in by_repo.items()},
    }


def findings_from_work(run_id: str) -> list:
    out = []
    for name in REVIEWS:
        p = ROOT / "data" / "work" / run_id / f"{name}.json"
        if p.exists():
            out += json.loads(p.read_text(encoding="utf-8")).get("results", [])
        else:
            print(f"WARN  missing {p.relative_to(ROOT)}", file=sys.stderr)
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    print(json.dumps(compute(findings_from_work(sys.argv[1])), indent=2))
