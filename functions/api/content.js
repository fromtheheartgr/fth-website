/*
 * From the Heart – website editor: LOAD   (Cloudflare Pages Function)
 * GET /api/content?file=content/events.json
 *
 * The editor loads the current text of a content file through here (same website, no browser
 * restrictions, always the latest version straight from GitHub – never a cached copy).
 * Only the files in the allow-list can be read, and they are the same text the public site shows.
 */
import { ALLOWED, json, settings, fromBase64, gh, ghError } from "../../lib/github.js";

export async function onRequestGet({ request, env }) {
  const file = new URL(request.url).searchParams.get("file") || "";
  if (!ALLOWED.has(file)) return json(400, { error: "Invalid or disallowed file path" });

  const cfg = settings(env);
  const r = await gh(cfg, "GET", `/repos/${cfg.repo}/contents/${file}?ref=${encodeURIComponent(cfg.branch)}`);
  if (r.status !== 200) return json(502, { error: `Could not load ${file} from GitHub (${ghError(r)})` });

  let data;
  try { data = JSON.parse(fromBase64(r.body.content)); }
  catch { return json(502, { error: `${file} on GitHub is not valid JSON` }); }
  return json(200, data);
}

export async function onRequest() {
  return json(405, { error: "GET only" });
}
