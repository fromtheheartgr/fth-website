/*
 * From the Heart – website editor: SAVE   (Cloudflare Pages Function)
 * POST /api/save
 *   { password, action: "verify" }   – only checks the password (login screen)
 *   { password, file, content }      – saves one content file to GitHub
 *
 * Cloudflare: Workers & Pages → this project → Settings → Variables and Secrets
 *   ADMIN_PASSWORD  – the one password church staff type to edit the site        (Secret)
 *   GITHUB_TOKEN    – GitHub token with "Contents: Read and write" on this repo   (Secret)
 *   GITHUB_REPO / GITHUB_BRANCH – optional (defaults: fromtheheartgr/fth-website, main)
 *
 * A save commits the file to GitHub; Cloudflare sees the commit and rebuilds the site (~1 minute).
 */
import { ALLOWED, json, settings, toBase64, samePassword, gh, ghError } from "../../lib/github.js";

export async function onRequestPost({ request, env }) {
  let req;
  try { req = await request.json(); }
  catch { return json(400, { error: "Invalid JSON body" }); }

  if (!(await samePassword(req.password, env.ADMIN_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 500));   // slows down guessing
    return json(401, { error: "Wrong password" });
  }
  if (req.action === "verify") return json(200, { ok: true });

  if (!req.file || !ALLOWED.has(req.file)) return json(400, { error: "Invalid or disallowed file path" });
  if (req.content === undefined || req.content === null) return json(400, { error: "No content provided" });

  const cfg = settings(env);
  if (!cfg.token) return json(500, { error: "GITHUB_TOKEN is not set in Cloudflare (Settings → Variables and Secrets)" });

  /* GitHub needs the file's current version id (sha) before it accepts an update */
  const cur = await gh(cfg, "GET", `/repos/${cfg.repo}/contents/${req.file}?ref=${encodeURIComponent(cfg.branch)}`);
  if (cur.status !== 200) return json(502, { error: `Could not read file from GitHub (${ghError(cur)})` });

  const put = await gh(cfg, "PUT", `/repos/${cfg.repo}/contents/${req.file}`, {
    message: `Update ${req.file} via website editor`,
    content: toBase64(JSON.stringify(req.content, null, 2) + "\n"),
    sha: cur.body.sha,
    branch: cfg.branch,
  });
  if (put.status !== 200 && put.status !== 201) return json(502, { error: `GitHub write failed (${ghError(put)})` });

  return json(200, { ok: true, ref: put.body?.commit?.sha ? put.body.commit.sha.slice(0, 7) : null });
}

export async function onRequest() {
  return json(405, { error: "POST only" });
}
