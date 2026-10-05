/* Shared helpers for the website editor's two endpoints (functions/api/save.js and functions/api/content.js). */

/* The editor can only ever read or write these files – nothing else in the repository. */
export const ALLOWED = new Set([
  "content/events.json",
  "content/gallery.json",
  "content/contact.json",
  "content/giving.json",
  "content/watch.json",
  "content/services.json",
  "content/story.json",
  "content/visit-steps.json",
  "content/events-section.json",
  "content/family.json",
  "content/visit.json",
]);

export const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export function settings(env) {
  return {
    token: env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO || "fromtheheartgr/fth-website",
    branch: env.GITHUB_BRANCH || "main",
    api: env.GITHUB_API || "https://api.github.com",   // only overridden for local testing
  };
}

/* UTF-8 safe base64, both directions (church text has curly quotes, accents, emoji…) */
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* Compare passwords without leaking timing information */
export async function samePassword(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function gh(cfg, method, apiPath, body) {
  const res = await fetch(cfg.api + apiPath, {
    method,
    headers: {
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      "User-Agent": "fth-admin/1.0",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: data };
}

export const ghError = (r) => `${r.status}${r.body && r.body.message ? ": " + r.body.message : ""}`;
