#!/usr/bin/env python3
"""Build step for the Cloudflare app: write cloudflare/public/rules.json from context/rules.md,
so the app shows each rule's text without a copy of the rules in app.js.

Usage: python3 scripts/build_app.py   (run by `npm run build` in cloudflare/)
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "cloudflare" / "public" / "rules.json"
SECTIONS = {"P": "profile", "J": "projects", "E": "engineering", "A": "architect"}

text = (ROOT / "context" / "rules.md").read_text(encoding="utf-8")
rules = [{"id": rid, "level": level, "section": SECTIONS[rid[0]], "text": body.strip()}
         for rid, level, body in re.findall(r"^\|\s*([PJEA]\d+)\s*\|\s*(profile|repo)\s*\|(.+?)\|\s*$", text, re.M)]
OUT.write_text(json.dumps(rules, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK  {OUT.relative_to(ROOT)}  {len(rules)} rules")
