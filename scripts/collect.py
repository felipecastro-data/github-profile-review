#!/usr/bin/env python3
"""Collect the in-scope GitHub facts into one profile JSON (schema v1, see context/schema.md).

Usage: python3 scripts/collect.py <username> <RUN_ID> <profile_out>

Read-only: GraphQL queries and REST GETs through the gh CLI. Prints one WARN line per gap,
then OK (or FAIL on a fatal error, exit code 1).
"""
import base64
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
TOP_LINES = 25
KEY_FILE_LINES = 200
MAX_TREE = 3000           # paths kept per repo; the rest is noted
MAX_SOURCE_FILES = 4      # source files sampled per repo for E3 (logging, checks, idempotency)
COMMIT_SAMPLE = 30

missing, notes = [], []


def warn(msg: str) -> None:
    print("WARN ", msg)
    notes.append(msg)


def gh(*args: str):
    """Run `gh api ...`; return (ok, stdout)."""
    p = subprocess.run(["gh", "api", *args], capture_output=True, text=True)
    return p.returncode == 0, (p.stdout if p.returncode == 0 else (p.stderr or p.stdout).strip())


def gh_json(*args: str):
    ok, out = gh("--method", "GET", *args)
    return json.loads(out) if ok else None


def graphql(query: str, **variables):
    args = ["graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        args += ["-F" if isinstance(v, int) else "-f", f"{k}={v}"]
    ok, out = gh(*args)
    if not ok:
        return None, out
    d = json.loads(out)
    return d.get("data"), "; ".join(e.get("message", "") for e in d.get("errors", []))


def raw_file(full: str, path: str, ref: str):
    d = gh_json(f"repos/{full}/contents/{path}?ref={ref}")
    if not isinstance(d, dict) or d.get("encoding") != "base64":
        return None
    try:
        return base64.b64decode(d["content"]).decode("utf-8", "replace")
    except ValueError:
        return None


def head(text: str, n: int = KEY_FILE_LINES) -> str:
    return "\n".join(text.splitlines()[:n])


# ---------- header + pinned ----------

USER_Q = """
query($login: String!) {
  user(login: $login) {
    name bio company location websiteUrl avatarUrl
    status { emoji message }
    followers { totalCount } following { totalCount }
    repositories(privacy: PUBLIC, ownerAffiliations: OWNER) { totalCount }
    socialAccounts(first: 10) { nodes { provider url } }
    pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { nameWithOwner } } }
  }
}"""


def collect_header(username: str):
    data, err = graphql(USER_Q, login=username)
    u = (data or {}).get("user")
    if not u:
        print("FAIL user query:", err or "user not found")
        sys.exit(1)
    status = u.get("status") or {}
    header = {
        "name": u.get("name"), "bio": u.get("bio"), "company": u.get("company"),
        "location": u.get("location"), "website": u.get("websiteUrl"),
        "status": " ".join(x for x in (status.get("emoji"), status.get("message")) if x) or None,
        "avatar_url": u.get("avatarUrl"),
        "followers": u["followers"]["totalCount"], "following": u["following"]["totalCount"],
        "public_repos": u["repositories"]["totalCount"],
        "social": [{"provider": s["provider"].lower(), "url": s["url"]}
                   for s in u["socialAccounts"]["nodes"]],
    }
    for k in ("name", "bio", "location", "website"):
        if not header[k]:
            missing.append(f"header.{k}: empty on GitHub")
    pinned = [n["nameWithOwner"] for n in u["pinnedItems"]["nodes"] if n]
    return header, pinned


# ---------- profile README ----------

IMG_MD = re.compile(r"(\[)?!\[([^\]]*)\]\(([^)\s]+)[^)]*\)(?:\]\(([^)\s]+)[^)]*\))?")
A_TAG = re.compile(r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.S | re.I)
IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)
ATTR = re.compile(r"(\w+)=[\"']([^\"']*)[\"']")
REPO_LINK = re.compile(r"github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)", re.I)
NOT_REPOS = {"settings", "orgs", "topics", "features", "marketplace", "sponsors", "apps"}

WIDGET_HINTS = ("github-readme-stats", "readme-stats", "streak", "trophy", "komarev", "visitor",
                "hits.seeyoufarm", "profile-views", "activity-graph", "readme-activity",
                "github-profile-summary", "wakatime", "snake")
CONTACT_HINTS = ("linkedin.com", "mailto:", "twitter.com", "x.com/", "medium.com", "t.me/",
                 "calendly", "wa.me", "dev.to", "substack", "youtube.com")
CERT_HINTS = ("credly.com", "learn.microsoft.com", "credentials.databricks.com", "accredible",
              "certif", "badgr", "coursera.org/verify", "aws.amazon.com/verification")
STACK_HINTS = ("logo=", "skillicons.dev", "devicon", "simpleicons", "techstack")


def badge_kind(label: str, img: str, link: str) -> str:
    s = f"{label} {img} {link}".lower()
    if any(h in s for h in WIDGET_HINTS):
        return "widget"
    if any(h in s for h in CERT_HINTS):
        return "cert"
    if link and any(h in link.lower() for h in CONTACT_HINTS):
        return "contact"
    if any(h in s for h in STACK_HINTS) or ("shields.io/badge" in img.lower() and not link):
        return "stack"
    return "other"


def parse_readme(raw: str, username: str) -> dict:
    images = []  # (label, img_url, link_url)
    for m in IMG_MD.finditer(raw):
        images.append((m.group(2), m.group(3), m.group(4) or ""))
    linked_imgs = set()
    for m in A_TAG.finditer(raw):
        for tag in IMG_TAG.findall(m.group(2)):
            a = dict(ATTR.findall(tag))
            if a.get("src"):
                images.append((a.get("alt", ""), a["src"], m.group(1)))
                linked_imgs.add(tag)
    for tag in IMG_TAG.findall(raw):
        if tag not in linked_imgs:
            a = dict(ATTR.findall(tag))
            if a.get("src"):
                images.append((a.get("alt", ""), a["src"], ""))

    badges, widgets = [], []
    for label, img, link in images:
        kind = badge_kind(label, img, link)
        if kind == "widget":
            widgets.append(img)
        badges.append({"label": label, "kind": kind, "url": link or img})

    linked, seen = [], set()
    for owner, name in REPO_LINK.findall(raw):
        name = re.sub(r"\.git$", "", name).rstrip(".")
        full = f"{owner}/{name}"
        if owner.lower() != username.lower() or name.lower() in NOT_REPOS:
            continue
        if name.lower() == username.lower() or full.lower() in seen:
            continue  # the profile README repo itself, or a duplicate
        seen.add(full.lower())
        linked.append(full)

    return {"raw": raw, "top_lines": "\n".join(raw.splitlines()[:TOP_LINES]),
            "badges": badges, "widgets": widgets, "linked_repos": linked}


# ---------- repos ----------

REPO_Q = """
query($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner url description stargazerCount isArchived pushedAt
    primaryLanguage { name }
    repositoryTopics(first: 20) { nodes { topic { name } } }
    languages(first: 20, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } }
    defaultBranchRef { name target { ... on Commit {
      history(first: $n) { totalCount nodes {
        oid committedDate message changedFilesIfAvailable additions deletions } } } } }
  }
}"""

LINT_FILES = {"ruff.toml", ".ruff.toml", ".flake8", ".pylintrc", "pylintrc", ".pre-commit-config.yaml",
              ".sqlfluff", ".editorconfig", "tox.ini", ".eslintrc", ".eslintrc.json", ".eslintrc.js",
              "eslint.config.js", ".prettierrc", ".yamllint", ".markdownlint.json"}
TYPE_FILES = {"mypy.ini", ".mypy.ini", "pyrightconfig.json", "py.typed", "tsconfig.json"}
ENV_EXAMPLES = {".env.example", ".env.sample", ".env.template", "example.env", ".env.dist", "env.example"}
ENV_NAMES = {"dev", "develop", "development", "test", "testing", "qa", "uat", "stg", "stage",
             "staging", "prod", "production"}
KEY_NAMES = {"makefile", "pyproject.toml", "requirements.txt", "setup.cfg", "dockerfile",
             "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
             ".pre-commit-config.yaml", "dbt_project.yml", "databricks.yml", "devcontainer.json",
             "main.tf", "main.bicep"}
SOURCE_DIRS = ("src/", "pipelines/", "pipeline/", "etl/", "dags/", "jobs/", "ingestion/", "transform/")

SECRET_PATTERNS = [
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("slack_token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("databricks_token", re.compile(r"\bdapi[0-9a-f]{32}\b")),
    ("azure_storage_key", re.compile(r"AccountKey=[A-Za-z0-9+/=]{40,}")),
    ("connection_string_password", re.compile(r"(?i)(?:password|pwd)=[^;\s'\"]{6,};")),
    ("assigned_secret", re.compile(
        r"(?i)\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret)\b\s*[:=]\s*"
        r"[\"'](?!\s*(?:\$\{|<|your|changeme|xxx|\*\*\*))[^\"'\s]{8,}[\"']")),
]


def scan_secrets(path: str, text: str) -> list:
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        for name, rx in SECRET_PATTERNS:
            if rx.search(line):
                hits.append(f"{path}:{i} {name} (value redacted)")
    return hits


def text_environments(path: str, text: str) -> set:
    """Environment names declared in workflows (`environment: prod`) and bundle targets."""
    envs = {m.lower() for m in re.findall(r"^\s*environment:\s*['\"]?([A-Za-z][\w-]*)", text, re.M)}
    if PurePosixPath(path).name.lower() == "databricks.yml":
        block = re.search(r"^targets:\s*\n((?:[ \t]+.*\n?|\s*\n)+)", text, re.M)
        if block:
            envs |= {m.lower() for m in re.findall(r"^  ([A-Za-z][\w-]*):", block.group(1), re.M)}
    return envs


def makefile_targets(text: str) -> list:
    out = []
    for m in re.finditer(r"^([A-Za-z0-9_.-]+)\s*:(?!=)", text, re.M):
        t = m.group(1)
        if not t.startswith(".") and t not in out:
            out.append(t)
    return out


def detect_signals(paths: list) -> dict:
    lower = [p.lower() for p in paths]
    names = [PurePosixPath(p).name for p in lower]
    envs = set()
    for p in lower:
        parts = PurePosixPath(p).parts
        for seg in parts[:-1]:
            if seg in ENV_NAMES:
                envs.add(seg)
        stem = parts[-1].split(".")[0]
        if stem in ENV_NAMES and parts[-1].endswith((".tfvars", ".yml", ".yaml", ".json", ".bicepparam", ".env")):
            envs.add(stem)
    return {
        "src_layout": any(p.startswith("src/") for p in lower),
        "tests_dir": any(re.search(r"(^|/)tests?/", p) for p in lower),
        "test_files": sum(1 for n in names if re.match(r"(test_.*\.py|.*_test\.(py|go)|.*\.(test|spec)\.[jt]sx?)$", n)),
        "ci_workflows": [p for p in paths if re.match(r"\.github/workflows/[^/]+\.ya?ml$", p)],
        "ci_last_run": None, "ci_runs": [],
        "lint_config": [p for p, n in zip(paths, names) if n in LINT_FILES],
        "type_hints_config": [p for p, n in zip(paths, names) if n in TYPE_FILES],
        "makefile_targets": [],
        "dockerfile": any(n == "dockerfile" or n.endswith(".dockerfile") for n in names),
        "compose": any(re.match(r"(docker-)?compose(\.[\w-]+)?\.ya?ml$", n) for n in names),
        "devcontainer": any(p.startswith(".devcontainer") for p in lower),
        "env_example": any(n in ENV_EXAMPLES for n in names),
        "env_committed": any(re.match(r"\.env(\.(local|dev|prod|production|development))?$", n) for n in names),
        "secret_hits": [],
        "adr_files": [p for p, l in zip(paths, lower)
                      if l.endswith(".md") and re.search(r"(^|/)(adrs?|decisions|architecture-decisions)/", l)
                      and not l.endswith(("readme.md", "template.md"))],
        "design_docs": [p for p, l in zip(paths, lower)
                        if l.endswith(".md") and (l.startswith("docs/") or re.search(r"design|architecture", l))
                        and not re.search(r"(^|/)(adrs?|decisions)/", l)],
        "iac_files": [p for p, l in zip(paths, lower)
                      if l.endswith((".tf", ".tfvars", ".bicep", ".bicepparam")) or
                      PurePosixPath(l).name in ("databricks.yml", "cdk.json", "pulumi.yaml", "azuredeploy.json")],
        "environments": sorted(envs),
        "notebooks": sum(1 for n in names if n.endswith(".ipynb")),
        "py_files": sum(1 for n in names if n.endswith(".py")),
    }


def pick_key_files(paths: list, signals: dict) -> list:
    picked = [p for p in paths if PurePosixPath(p).name.lower() in KEY_NAMES and p.count("/") <= 2]
    picked += signals["ci_workflows"]
    picked += [p for p in paths if re.search(r"(^|/)(adrs?|decisions)/(readme|index)\.md$", p.lower())]
    sources = [p for p in paths if p.lower().endswith((".py", ".sql")) and p.lower().startswith(SOURCE_DIRS)
               and not re.search(r"(^|/)tests?/|__init__\.py$", p.lower())]
    picked += sources[:MAX_SOURCE_FILES]
    if signals["env_committed"]:  # fetched only to scan it; its content is never stored
        picked += [p for p in paths if re.match(r"\.env(\.\w+)?$", PurePosixPath(p).name.lower())
                   and PurePosixPath(p).name.lower() not in ENV_EXAMPLES]
    return list(dict.fromkeys(picked))[:25]


def collect_repo(full: str, sources: list) -> dict:
    owner, name = full.split("/", 1)
    data, err = graphql(REPO_Q, owner=owner, name=name, n=COMMIT_SAMPLE)
    r = (data or {}).get("repository")
    if not r:
        warn(f"{full}: repository not readable ({err or 'not found'}); skipped")
        missing.append(f"repos[{full}]: not readable")
        return None
    branch_ref = r.get("defaultBranchRef") or {}
    branch = branch_ref.get("name")
    history = ((branch_ref.get("target") or {}).get("history")) or {"totalCount": 0, "nodes": []}

    repo = {
        "full_name": r["nameWithOwner"], "url": r["url"], "source": sources,
        "description": r.get("description"),
        "topics": [t["topic"]["name"] for t in r["repositoryTopics"]["nodes"]],
        "primary_language": (r.get("primaryLanguage") or {}).get("name"),
        "languages": {e["node"]["name"]: e["size"] for e in r["languages"]["edges"]},
        "stars": r["stargazerCount"], "archived": r["isArchived"], "pushed_at": r["pushedAt"],
        "default_branch": branch, "readme": None, "tree": [], "signals": None, "key_files": {},
        "commits": {"total": history["totalCount"], "sample": [
            {"sha": c["oid"][:7], "date": c["committedDate"], "message": c["message"].strip()[:300],
             "files_changed": c.get("changedFilesIfAvailable"), "additions": c["additions"],
             "deletions": c["deletions"]} for c in history["nodes"]]},
    }
    if not repo["description"]:
        missing.append(f"repos[{full}].description: empty on GitHub")
    if not branch:
        warn(f"{full}: empty repository (no default branch)")
        missing.append(f"repos[{full}]: empty repository")
        repo["signals"] = detect_signals([])
        return repo

    ok, out = gh("--method", "GET", "-H", "Accept: application/vnd.github.raw", f"repos/{full}/readme")
    if ok:
        repo["readme"] = out
    else:
        missing.append(f"repos[{full}].readme: no README")

    tree = gh_json(f"repos/{full}/git/trees/{branch}?recursive=1")
    if tree is None:
        warn(f"{full}: file tree not readable")
        missing.append(f"repos[{full}].tree: not readable")
        paths = []
    else:
        paths = [t["path"] for t in tree.get("tree", []) if t.get("type") == "blob"]
        if tree.get("truncated"):
            warn(f"{full}: GitHub truncated the file tree; signals may undercount")
    if len(paths) > MAX_TREE:
        notes.append(f"{full}: tree has {len(paths)} files, kept the first {MAX_TREE}")
    signals = detect_signals(paths)
    repo["tree"] = paths[:MAX_TREE]

    runs = gh_json(f"repos/{full}/actions/runs?per_page=50&branch={branch}")
    latest = {}
    for w in (runs or {}).get("workflow_runs", []):  # newest first: keep each workflow's last run
        latest.setdefault(w.get("path") or w.get("name"), {
            "name": w.get("name"), "path": w.get("path"),
            "conclusion": w.get("conclusion") or w.get("status"), "at": w.get("created_at")})
    signals["ci_runs"] = list(latest.values())
    if signals["ci_runs"]:
        signals["ci_last_run"] = {k: signals["ci_runs"][0][k] for k in ("name", "conclusion", "at")}

    hits = scan_secrets("README", repo["readme"] or "")
    for path in pick_key_files(paths, signals):
        text = raw_file(full, path, branch)
        if text is None:
            missing.append(f"repos[{full}].key_files[{path}]: not readable")
            continue
        hits += scan_secrets(path, text)
        envs = text_environments(path, text)
        if envs:
            signals["environments"] = sorted(set(signals["environments"]) | envs)
        lname = PurePosixPath(path).name.lower()
        if re.match(r"\.env(\.\w+)?$", lname) and lname not in ENV_EXAMPLES:
            continue  # never store a committed .env
        if lname == "makefile":
            signals["makefile_targets"] = makefile_targets(text)
        if lname == "pyproject.toml":
            for tool in ("ruff", "black", "flake8", "pylint", "isort"):
                if f"[tool.{tool}" in text:
                    signals["lint_config"].append(f"{path}[tool.{tool}]")
            for tool in ("mypy", "pyright"):
                if f"[tool.{tool}" in text:
                    signals["type_hints_config"].append(f"{path}[tool.{tool}]")
        repo["key_files"][path] = head(text)
    signals["secret_hits"] = hits
    if hits:
        warn(f"{full}: {len(hits)} possible secret(s) in fetched files (values redacted)")
    repo["signals"] = signals
    return repo


def main(username: str, run_id: str, out: str) -> int:
    if not re.fullmatch(r"r\d{8}-\d{4}", run_id):
        print("FAIL bad RUN_ID", run_id)
        return 1
    header, pinned = collect_header(username)
    if not pinned:
        warn("no pinned repos")
        missing.append("pinned: none on the profile")

    ok, raw = gh("--method", "GET", "-H", "Accept: application/vnd.github.raw",
                 f"repos/{username}/{username}/readme")
    if ok:
        readme = parse_readme(raw, username)
    else:
        warn("profile README not found")
        missing.append(f"readme: {username}/{username} has no README")
        readme = {"raw": None, "top_lines": None, "badges": [], "widgets": [], "linked_repos": []}

    scope = {}  # full_name (case-insensitive key) → (name, sources)
    for full in pinned:
        scope.setdefault(full.lower(), [full, []])[1].append("pinned")
    for full in readme["linked_repos"]:
        scope.setdefault(full.lower(), [full, []])[1].append("readme")
    repos = [r for r in (collect_repo(full, src) for full, src in scope.values()) if r]
    # A README link whose repo is gone is not in scope.
    readme["linked_repos"] = [f for f in readme["linked_repos"]
                              if any(r["full_name"].lower() == f.lower() for r in repos)]

    doc = {
        "schema_version": 1, "run_id": run_id,
        "collected_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "username": username, "header": header, "readme": readme, "pinned": pinned, "repos": repos,
        "missing_fields": missing,
        "collector_notes": notes + ["secret scan covers the README and the fetched key files only"],
    }
    path = Path(out) if Path(out).is_absolute() else ROOT / out
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK    {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}  "
          f"pinned={len(pinned)} in_scope={len(repos)} missing={len(missing)} "
          f"{path.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
