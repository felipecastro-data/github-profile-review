// /api/* for the GitHub Review app, reading the GR_KV namespace that scripts/publish.py fills:
//   GET /api/index                     index (newest first: run_id, run_at, overall, sections)
//   GET /api/run/<RUN_ID>              run document (schema v1)
//   GET /api/profile/<RUN_ID>          collector profile
//   GET /api/stats/<RUN_ID>            per-agent tokens, cost and timing (scripts/agent_stats.py; Town tab)
//   GET /api/checks                    Actions ticks {"<RUN_ID>__<action id>": {done, at}}
//   PUT /api/checks/<RUN_ID>/<id>      body {"done": true|false}
// Cloudflare Access sits in front of the site; this function also verifies the Access token itself so
// a misconfigured policy fails closed.

const RUN_ID_RE = /^r\d{8}-\d{4}$/;
const ACTION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

let cachedCerts = null; // { keys, exp } — reused across requests on a warm isolate

export async function onRequest({ request, env, params }) {
  try {
    await verifyAccess(request, env);
  } catch (e) {
    return json({ error: "Unauthorized" }, 401);
  }
  const parts = params.path || [];
  const [kind, id, sub] = parts;
  const method = request.method;
  try {
    if (method === "GET" && parts.length === 1 && kind === "index") {
      return raw((await env.GR_KV.get("index")) || "[]");
    }
    if (method === "GET" && parts.length === 1 && kind === "checks") {
      return raw((await env.GR_KV.get("checks")) || "{}");
    }
    if (method === "GET" && parts.length === 2 && (kind === "run" || kind === "profile" || kind === "stats")) {
      if (!RUN_ID_RE.test(id)) return json({ error: "bad run id" }, 400);
      const value = await env.GR_KV.get(kind + ":" + id);
      return value ? raw(value) : json({ error: "not found" }, 404);
    }
    if (method === "PUT" && parts.length === 3 && kind === "checks") {
      return await setCheck(request, env, id, sub);
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(parts.join("/") + ": " + e.message);
    return json({ error: "server error" }, 500);
  }
}

// Single user, so read-modify-write on one key is fine; two ticks in the same instant could lose one.
async function setCheck(request, env, runId, actionId) {
  if (!RUN_ID_RE.test(runId) || !ACTION_ID_RE.test(actionId)) return json({ error: "bad id" }, 400);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "bad origin" }, 403);
  if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
    return json({ error: "JSON body required" }, 415);
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.done !== "boolean") return json({ error: "body must be {done: boolean}" }, 400);
  const checks = JSON.parse((await env.GR_KV.get("checks")) || "{}");
  const key = runId + "__" + actionId;
  if (body.done) checks[key] = { done: true, at: new Date().toISOString() };
  else delete checks[key];
  await env.GR_KV.put("checks", JSON.stringify(checks));
  return json({ ok: true }, 200);
}

function raw(text) {
  return new Response(text, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

/* ---------- Cloudflare Access ---------- */

async function verifyAccess(request, env) {
  if (env.DEV_NO_ACCESS === "1") {
    // local `wrangler pages dev` only (.dev.vars); never honoured on a public host
    const host = new URL(request.url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new Error("Access not configured");
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) throw new Error("Missing Access token");
  const [h, p, s] = jwt.split(".");
  const header = JSON.parse(b64urlDecodeText(h));
  const claims = JSON.parse(b64urlDecodeText(p));
  const issuer = "https://" + env.ACCESS_TEAM_DOMAIN;
  if (claims.iss !== issuer) throw new Error("Bad issuer");
  const allowed = env.ACCESS_AUD.split(",").map(a => a.trim()).filter(Boolean);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some(a => allowed.includes(a))) throw new Error("Bad audience");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Expired");
  let jwk = (await accessCerts(issuer)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await accessCerts(issuer, true)).find(k => k.kid === header.kid); // key rotation
  if (!jwk) throw new Error("Unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(s), new TextEncoder().encode(h + "." + p));
  if (!ok) throw new Error("Bad signature");
}

async function accessCerts(issuer, refresh = false) {
  if (!refresh && cachedCerts && cachedCerts.exp > Date.now()) return cachedCerts.keys;
  const res = await fetch(issuer + "/cdn-cgi/access/certs");
  if (!res.ok) throw new Error("Access certs HTTP " + res.status);
  const { keys } = await res.json();
  cachedCerts = { keys: keys || [], exp: Date.now() + 3600 * 1000 };
  return cachedCerts.keys;
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(str + "=".repeat((4 - str.length % 4) % 4)), c => c.charCodeAt(0));
}

function b64urlDecodeText(str) {
  return new TextDecoder().decode(b64urlDecode(str));
}
