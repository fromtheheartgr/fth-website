/*
 * From the Heart – website editor: SAVE PHOTOS   (Cloudflare Pages Function)
 * POST /api/photos
 *
 * Body: {
 *   password,
 *   gallery: { items: [ { image, caption, alt, focus } ] },   // the full new list, in display order
 *   family:  { label, heading_plain, heading_accent, intro },  // the section's text
 *   uploads: [ { name: "family-20261005-ab12cd.jpg", data: "<base64 JPEG>" } ]
 * }
 *
 * The browser has already resized and compressed every new photo to a web-ready JPEG.
 * Here we only check it, then publish everything in ONE commit:
 *   - new photos → src/assets/gallery/<name>        (served at /assets/gallery/<name>)
 *   - content/gallery.json and content/family.json
 *   - photos in src/assets/gallery/ that are no longer used are removed (original photos elsewhere are never touched)
 */
import { json, settings, samePassword, gh, ghError, fromBase64, commitFiles, listRepoFiles } from "../../lib/github.js";

const UPLOAD_DIR   = "src/assets/gallery/";
const NAME_OK      = /^[a-z0-9][a-z0-9-]{0,62}\.jpg$/;            // our own generated names only
const IMAGE_OK     = /^assets\/(?:gallery\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:jpg|jpeg|png|webp)$/;
const FOCUS_OK     = /^(\d{1,3})% (\d{1,3})%$/;
const MAX_ITEMS    = 24;
const MAX_UPLOADS  = 16;
const MAX_BYTES    = 3 * 1024 * 1024;      // per photo (the editor produces ~150–450 KB)
const MAX_TOTAL    = 20 * 1024 * 1024;     // per save

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  let req;
  try { req = await request.json(); }
  catch { return json(400, { error: "Invalid request (could not read it)" }); }

  if (!(await samePassword(req.password, env.ADMIN_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 500));
    return json(401, { error: "Wrong password" });
  }
  const cfg = settings(env);
  if (!cfg.token) return json(500, { error: "GITHUB_TOKEN is not set in Cloudflare (Settings → Variables and Secrets)" });

  /* ── New photos: names, size, and that each really is a JPEG ─────────────────── */
  const uploads = Array.isArray(req.uploads) ? req.uploads : [];
  if (uploads.length > MAX_UPLOADS) return json(400, { error: `Please add at most ${MAX_UPLOADS} new photos per save` });
  const blobs = [], uploadNames = new Set();
  let total = 0;
  for (const u of uploads) {
    const name = String(u && u.name || "");
    if (!NAME_OK.test(name)) return json(400, { error: `Invalid photo name: ${name.slice(0, 40)}` });
    if (uploadNames.has(name)) return json(400, { error: `Photo sent twice: ${name}` });
    const b64 = String(u.data || "").replace(/\s/g, "");
    let bin;
    try { bin = atob(b64); } catch { return json(400, { error: `Photo ${name} is damaged` }); }
    if (bin.length > MAX_BYTES) return json(400, { error: `Photo ${name} is too large` });
    if (!(bin.charCodeAt(0) === 0xff && bin.charCodeAt(1) === 0xd8 && bin.charCodeAt(2) === 0xff))
      return json(400, { error: `Photo ${name} is not a JPEG` });
    total += bin.length;
    if (total > MAX_TOTAL) return json(400, { error: "Too many photos in one save – please save in smaller batches" });
    uploadNames.add(name);
    blobs.push({ path: UPLOAD_DIR + name, base64: b64 });
  }

  /* ── The photo list ───────────────────────────────────────────────────────────── */
  const rawItems = req.gallery && Array.isArray(req.gallery.items) ? req.gallery.items : null;
  if (!rawItems) return json(400, { error: "No photo list sent" });
  if (rawItems.length > MAX_ITEMS) return json(400, { error: `At most ${MAX_ITEMS} photos can be shown` });

  let repoFiles;
  try { repoFiles = await listRepoFiles(cfg); }
  catch (e) { return json(502, { error: e.message }); }

  const items = [];
  for (const it of rawItems) {
    const image = String(it && it.image || "");
    if (!IMAGE_OK.test(image)) return json(400, { error: `Invalid photo reference: ${image.slice(0, 60)}` });
    const isNew = image.startsWith("assets/gallery/") && uploadNames.has(image.slice("assets/gallery/".length));
    if (!isNew && !repoFiles.has("src/" + image)) return json(400, { error: `Photo not found: ${image}` });
    const item = { image, caption: clean(it.caption, 80), alt: clean(it.alt, 160) };
    const f = FOCUS_OK.exec(String(it.focus || ""));
    if (f) item.focus = `${Math.min(100, +f[1])}% ${Math.min(100, +f[2])}%`;
    items.push(item);
  }

  /* ── Section text: only these four fields may change; everything else is kept ──── */
  const famCur = await gh(cfg, "GET", `/repos/${cfg.repo}/contents/content/family.json?ref=${encodeURIComponent(cfg.branch)}`);
  if (famCur.status !== 200) return json(502, { error: `Could not load family.json (${ghError(famCur)})` });
  let family;
  try { family = JSON.parse(fromBase64(famCur.body.content)); }
  catch { return json(502, { error: "family.json on GitHub is not valid JSON" }); }
  const fam = req.family || {};
  for (const [k, max] of [["label", 60], ["heading_plain", 80], ["heading_accent", 80], ["intro", 400]]) {
    if (fam[k] !== undefined) family[k] = clean(fam[k], max);
  }

  /* ── Tidy up: our uploaded photos that nothing uses any more ─────────────────── */
  const used = new Set(items.map((i) => "src/" + i.image));
  const deletes = [...repoFiles].filter((p) => p.startsWith(UPLOAD_DIR) && !used.has(p));
  /* only commit uploads that are actually used */
  const usedBlobs = blobs.filter((b) => used.has(b.path));

  try {
    const sha = await commitFiles(cfg, {
      blobs: usedBlobs,
      texts: [
        { path: "content/gallery.json", text: JSON.stringify({ items }, null, 2) + "\n" },
        { path: "content/family.json",  text: JSON.stringify(family, null, 2) + "\n" },
      ],
      deletes,
    }, `Update church family photos via website editor (${items.length} photos)`);
    return json(200, { ok: true, ref: sha ? sha.slice(0, 7) : null, items, added: usedBlobs.length, removed: deletes.length });
  } catch (e) {
    return json(502, { error: e.message });
  }
}

export async function onRequest() {
  return json(405, { error: "POST only" });
}
