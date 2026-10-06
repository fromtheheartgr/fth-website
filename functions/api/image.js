/*
 * From the Heart – website editor: PHOTO PREVIEW   (Cloudflare Pages Function)
 * GET /api/image?path=assets/gallery/family-20261005-ab12cd.jpg
 *
 * Right after a save, new photos are already in GitHub but the website takes about a minute to rebuild.
 * The editor falls back to this endpoint so thumbnails show immediately, straight from GitHub.
 * Only image files under assets/ can be read (they are public on the website anyway).
 */
import { json, settings, gh, ghError } from "../../lib/github.js";

const IMAGE_OK = /^assets\/(?:gallery\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$/;
const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function onRequestGet({ request, env }) {
  const rel = new URL(request.url).searchParams.get("path") || "";
  const m = IMAGE_OK.exec(rel);
  if (!m) return json(400, { error: "Invalid image path" });

  const cfg = settings(env);
  const r = await gh(cfg, "GET", `/repos/${cfg.repo}/contents/src/${rel}?ref=${encodeURIComponent(cfg.branch)}`);
  if (r.status !== 200 || !r.body || !r.body.content) return json(r.status === 404 ? 404 : 502, { error: `Could not load image (${ghError(r)})` });

  const bin = atob(String(r.body.content).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { "Content-Type": TYPES[m[1].toLowerCase()], "Cache-Control": "private, max-age=300" } });
}

export async function onRequest() {
  return json(405, { error: "GET only" });
}
