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

/* ── One atomic commit with several files (Git Data API) ────────────────────────
   changes = { texts: [{path, text}], blobs: [{path, base64}], deletes: [path] }
   Everything lands in ONE commit (so the site rebuilds once, and a save is all-or-nothing).
   If someone else committed in the meantime, GitHub refuses the fast-forward and we retry once
   on top of the newer commit. */
export async function commitFiles(cfg, changes, message) {
  const base = `/repos/${cfg.repo}/git`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await gh(cfg, "GET", `${base}/ref/heads/${encodeURIComponent(cfg.branch)}`);
    if (ref.status !== 200) throw new Error(`Could not read branch (${ghError(ref)})`);
    const headSha = ref.body.object.sha;
    const head = await gh(cfg, "GET", `${base}/commits/${headSha}`);
    if (head.status !== 200) throw new Error(`Could not read latest commit (${ghError(head)})`);

    const tree = [];
    for (const b of changes.blobs || []) {
      const blob = await gh(cfg, "POST", `${base}/blobs`, { content: b.base64, encoding: "base64" });
      if (blob.status !== 201) throw new Error(`Could not upload ${b.path} (${ghError(blob)})`);
      tree.push({ path: b.path, mode: "100644", type: "blob", sha: blob.body.sha });
    }
    for (const t of changes.texts || []) tree.push({ path: t.path, mode: "100644", type: "blob", content: t.text });
    for (const p of changes.deletes || []) tree.push({ path: p, mode: "100644", type: "blob", sha: null });

    const newTree = await gh(cfg, "POST", `${base}/trees`, { base_tree: head.body.tree.sha, tree });
    if (newTree.status !== 201) throw new Error(`Could not build the update (${ghError(newTree)})`);
    const commit = await gh(cfg, "POST", `${base}/commits`, { message, tree: newTree.body.sha, parents: [headSha] });
    if (commit.status !== 201) throw new Error(`Could not create the commit (${ghError(commit)})`);
    const upd = await gh(cfg, "PATCH", `${base}/refs/heads/${encodeURIComponent(cfg.branch)}`, { sha: commit.body.sha, force: false });
    if (upd.status === 200) return commit.body.sha;
    if (upd.status !== 422 || attempt === 1) throw new Error(`Could not publish the update (${ghError(upd)})`);
    /* 422 = someone else saved at the same moment: loop and rebuild on top of their commit */
  }
}

/* Every file path in the repository at the branch head (small repo, so one call is fine) */
export async function listRepoFiles(cfg) {
  const base = `/repos/${cfg.repo}/git`;
  const ref = await gh(cfg, "GET", `${base}/ref/heads/${encodeURIComponent(cfg.branch)}`);
  if (ref.status !== 200) throw new Error(`Could not read branch (${ghError(ref)})`);
  const head = await gh(cfg, "GET", `${base}/commits/${ref.body.object.sha}`);
  if (head.status !== 200) throw new Error(`Could not read latest commit (${ghError(head)})`);
  const t = await gh(cfg, "GET", `${base}/trees/${head.body.tree.sha}?recursive=1`);
  if (t.status !== 200) throw new Error(`Could not list files (${ghError(t)})`);
  return new Set((t.body.tree || []).filter((e) => e.type === "blob").map((e) => e.path));
}
