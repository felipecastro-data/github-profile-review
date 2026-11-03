#!/usr/bin/env python3
"""Start a run: print RUN_ID, RUN_AT, the output paths and the previous run's files; create folders.

Usage: python3 scripts/new_run.py
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
now = datetime.now(timezone.utc)
run_id = "r" + now.astimezone(ZoneInfo("America/Bogota")).strftime("%Y%m%d-%H%M")
run_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")


def latest(pattern: str) -> str:
    found = sorted(p for p in ROOT.glob(pattern) if run_id not in str(p))
    return str(found[-1].relative_to(ROOT)) if found else "none"


previous = {
    "previous_profile": latest("data/profiles/r*.json"),
    "previous_run": latest("data/runs/r*.json"),
    "previous_benchmark": latest("data/work/r*/benchmark.json"),
}
work = ROOT / "data" / "work" / run_id
for d in (work, ROOT / "data" / "runs", ROOT / "data" / "profiles"):
    d.mkdir(parents=True, exist_ok=True)

w = f"data/work/{run_id}"
print(json.dumps({
    "RUN_ID": run_id,
    "RUN_AT": run_at,
    **previous,
    "profile_out": f"data/profiles/{run_id}.json",
    "benchmark_out": f"{w}/benchmark.json",
    "profile_review_out": f"{w}/profile_review.json",
    "projects_review_out": f"{w}/projects_review.json",
    "engineering_review_out": f"{w}/engineering_review.json",
    "architect_review_out": f"{w}/architect_review.json",
    "run_out": f"data/runs/{run_id}.json",
}, indent=2))
