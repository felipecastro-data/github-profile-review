#!/usr/bin/env python3
"""Publish a run to the GitHub Review app's Cloudflare KV namespace with wrangler.

Usage:
  python3 scripts/publish.py <RUN_ID>   put profile:<id>, run:<id>, then refresh index
  python3 scripts/publish.py --all      re-put every local run and rebuild index
  python3 scripts/publish.py --check    wrangler logged in and the namespace reachable
  python3 scripts/publish.py --stats <RUN_ID>   put stats:<id> (data/stats, from agent_stats.py) and
                                        add its usage summary to that run's index entry (Town tab)
  add --local to any of them to write the local KV that `npm run dev` in cloudflare/ serves

KV keys:  run:<RUN_ID>  profile:<RUN_ID>  stats:<RUN_ID>
          index (newest first: run_id, run_at, overall, sections, usage when stats exist)
          checks is owned by the app (Actions tab ticks); never written here.
Namespace id: GR_KV_NAMESPACE_ID from .env or the environment, else the GR_KV id in
cloudflare/wrangler.toml (the placeholder of zeros counts as unset). Uses cloudflare/node_modules/.bin/wrangler
when installed, else npx wrangler@WRANGLER_VERSION.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRANGLER_VERSION = "4.155.0"
RUN_ID_RE = re.compile(r"^r\d{8}-\d{4}$")
CF = ROOT / "cloudflare"
LOCAL = False  # --local: the dev server's KV (cloudflare/.wrangler/state) instead of Cloudflare


def load_env() -> dict:
    env = dict(os.environ)
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    if not env.get("GR_KV_NAMESPACE_ID"):
        toml = CF / "wrangler.toml"
        m = re.search(r'binding\s*=\s*"GR_KV"\s*\n\s*id\s*=\s*"([0-9a-f]{32})"', toml.read_text()) if toml.exists() else None
        if m and set(m.group(1)) != {"0"}:
            env["GR_KV_NAMESPACE_ID"] = m.group(1)
    return env


def wrangler_cmd() -> list:
    local = ROOT / "cloudflare" / "node_modules" / ".bin" / "wrangler"
    return [str(local)] if local.exists() else ["npx", "--yes", f"wrangler@{WRANGLER_VERSION}"]


def wrangler(env: dict, *args: str):
    p = subprocess.run([*wrangler_cmd(), *args], capture_output=True, text=True, env=env, cwd=CF if LOCAL else ROOT)
    return p.returncode == 0, (p.stdout if p.returncode == 0 else (p.stderr or p.stdout).strip())


def error_line(out: str) -> str:
    """The useful part of a wrangler error: the [ERROR] line and its detail, no colors or log path."""
    lines = [re.sub(r"\x1b\[[0-9;]*m", "", l).strip() for l in out.splitlines()]
    lines = [l for l in lines if l and not l.startswith(("🪵", "If you think this is a bug"))]
    i = next((i for i, l in enumerate(lines) if "ERROR" in l), 0)
    return " ".join(lines[i:i + 2])[:300] or "wrangler failed"


def kv(env: dict, *args: str):
    if LOCAL:
        return wrangler(env, "kv", "key", *args, "--binding", "GR_KV", "--local")
    return wrangler(env, "kv", "key", *args, "--namespace-id", env["GR_KV_NAMESPACE_ID"], "--remote")


def put_file(env: dict, key: str, path: Path) -> bool:
    ok, out = kv(env, "put", key, "--path", str(path))
    print(("OK  " if ok else "FAIL"), key, "" if ok else error_line(out))
    return ok


def put_json(env: dict, key: str, value) -> bool:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as t:
        json.dump(value, t, ensure_ascii=False)
    try:
        return put_file(env, key, Path(t.name))
    finally:
        os.unlink(t.name)


def usage_of(rid: str):
    """Small per-run usage summary for the index (Town tab run comparison), or None without stats."""
    path = ROOT / "data" / "stats" / f"{rid}.json"
    if not path.exists():
        return None
    st = json.loads(path.read_text(encoding="utf-8"))
    t = st.get("totals") or {}
    return {"tokens": t.get("tokens"), "cost_usd": t.get("cost_usd"), "wall_s": st.get("wall_s"),
            "tool_calls": t.get("tool_calls"),
            "by_agent": {k: (a.get("tokens") or {}).get("total") for k, a in (st.get("agents") or {}).items()}}


def index_entry(run: dict) -> dict:
    s = run.get("scores") or {}
    e = {"run_id": run["run_id"], "run_at": run.get("run_at"),
         "overall": s.get("overall"), "sections": s.get("sections") or {}}
    u = usage_of(run["run_id"])
    if u:
        e["usage"] = u
    return e


def publish_stats(env: dict, rid: str) -> int:
    path = ROOT / "data" / "stats" / f"{rid}.json"
    if not path.exists():
        print("FAIL stats", rid, "missing", path.relative_to(ROOT))
        return 1
    if not put_file(env, f"stats:{rid}", path):
        return 1
    entries = [e for e in remote_index(env) if isinstance(e, dict) and "run_id" in e]
    hit = next((e for e in entries if e["run_id"] == rid), None)
    if not hit:
        print("WARN run", rid, "is not in the index yet; publish the run first")
        return 0
    hit["usage"] = usage_of(rid)
    return 0 if put_json(env, "index", entries) else 1


def remote_index(env: dict) -> list:
    ok, out = kv(env, "get", "index")
    if not ok or not out.strip():
        return []
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def check(env: dict) -> int:
    if LOCAL:
        ok, out = kv(env, "list", "--prefix", "index")
        print("OK  local namespace" if ok else f"FAIL {error_line(out)}")
        return 0 if ok else 1
    if not env.get("GR_KV_NAMESPACE_ID"):
        print("FAIL GR_KV_NAMESPACE_ID is not set in .env (copy .env.example)")
        return 1
    ok, out = wrangler(env, "whoami")
    if not ok or "not authenticated" in out.lower():
        print("FAIL wrangler is not logged in (run: npx wrangler login)")
        return 1
    ok, out = kv(env, "list", "--prefix", "index")
    print("OK  namespace reachable" if ok else f"FAIL {error_line(out)}")
    return 0 if ok else 1


def main(argv: list) -> int:
    global LOCAL
    LOCAL = "--local" in argv
    argv = [a for a in argv if a != "--local"]
    if len(argv) not in (1, 2):
        print(__doc__)
        return 2
    env = load_env()
    if len(argv) == 2 and argv[0] == "--stats" and RUN_ID_RE.match(argv[1]):
        if not LOCAL and not env.get("GR_KV_NAMESPACE_ID"):
            print("FAIL GR_KV_NAMESPACE_ID is not set in .env (copy .env.example)")
            return 1
        return publish_stats(env, argv[1])
    if len(argv) != 1:
        print(__doc__)
        return 2
    arg = argv[0]
    if arg == "--check":
        return check(env)
    if not LOCAL and not env.get("GR_KV_NAMESPACE_ID"):
        print("FAIL GR_KV_NAMESPACE_ID is not set in .env (copy .env.example)")
        return 1
    if arg == "--all":
        ids = sorted(p.stem for p in (ROOT / "data" / "runs").glob("r*.json"))
    elif RUN_ID_RE.match(arg):
        ids = [arg]
    else:
        print(__doc__)
        return 2

    # --all rebuilds the index from local runs only, so runs deleted from data/ drop out
    old = [] if arg == "--all" else remote_index(env)
    ok, entries = True, {e["run_id"]: e for e in old if isinstance(e, dict) and "run_id" in e}
    for rid in ids:
        run_path = ROOT / "data" / "runs" / f"{rid}.json"
        if not run_path.exists():
            print("FAIL run", rid, "missing", run_path.relative_to(ROOT))
            ok = False
            continue
        prof = ROOT / "data" / "profiles" / f"{rid}.json"
        if prof.exists():
            ok &= put_file(env, f"profile:{rid}", prof)
        stats = ROOT / "data" / "stats" / f"{rid}.json"
        if arg == "--all" and stats.exists():
            ok &= put_file(env, f"stats:{rid}", stats)
        if put_file(env, f"run:{rid}", run_path):
            entries[rid] = index_entry(json.loads(run_path.read_text(encoding="utf-8")))
        else:
            ok = False
    # index last: the app lists a run only once its documents are in KV
    ok &= put_json(env, "index", sorted(entries.values(), key=lambda e: e["run_id"], reverse=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
