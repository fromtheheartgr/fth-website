/*
 * From the Heart - site builder
 *
 * Reads the plain content files in /content, pours them into src/template.html,
 * and writes the finished website to /dist. Nothing here needs to be edited to
 * change the website's words or pictures - edit the content files instead, or
 * use the admin page at /admin.
 *
 * Run with:  node build.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const read = (p) => fs.readFileSync(p, "utf8");
const readJSON = (name) => JSON.parse(read(path.join(ROOT, "content", name)));

/* Each content file becomes one branch of the page's content, named after the
   file. Splitting them up keeps each screen of the admin page short. */
const site = {
  contact:     readJSON("contact.json"),
  services:    readJSON("services.json"),
  story:       readJSON("story.json"),
  visit_steps: readJSON("visit-steps.json").steps,
  family:      readJSON("family.json"),
  watch:       readJSON("watch.json"),
  giving:      readJSON("giving.json"),
  events:      readJSON("events-section.json"),
  visit:       readJSON("visit.json")
};
const events = readJSON("events.json");
const gallery = readJSON("gallery.json");

/* Anything typed into the admin page is escaped before it reaches the HTML,
   so an ampersand or a stray bracket can never break the page. */
/* The editor may store an uploaded image as "/assets/x.jpg" or "assets/x.jpg".
   Both must work, so a leading slash is dropped. */
const assetPath = (v) => String(v == null ? "" : v).replace(/^\/+/, "");

const esc = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------- repeating blocks ---------- */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function buildEvents() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const live = (events.items || [])
    .filter((e) => { const d = parseDate(e.date); return d && d >= today; })
    .sort((a, b) => a.date.localeCompare(b.date));

  return live.map((e) => {
    const d = parseDate(e.date);
    const meta = [e.time, e.place].filter(Boolean).map(esc).join(" &middot; ");
    return `      <div class="card event" data-date="${esc(e.date)}">
        <div class="event__date"><span class="event__day">${String(d.getDate()).padStart(2, "0")}</span><span class="event__mon">${MONTHS[d.getMonth()]}</span><span class="event__wd">${DAYS[d.getDay()]}</span></div>
        <h3>${esc(e.title)}</h3>
        <p class="event__meta">${meta}</p>
        <p class="event__note">${esc(e.note)}</p>
      </div>`;
  }).join("\n");
}

function buildEventSchema() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const place = {
    "@type": "Place",
    name: "From the Heart Christian Community Church",
    address: {
      "@type": "PostalAddress",
      streetAddress: site.contact.address_line1,
      addressLocality: "Grand Rapids",
      addressRegion: "MI",
      postalCode: "49508",
      addressCountry: "US"
    }
  };
  const list = (events.items || [])
    .filter((e) => { const d = parseDate(e.date); return d && d >= today; })
    .map((e) => {
      const t = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(e.time || "");
      let hhmm = "10:00";
      if (t) {
        let h = Number(t[1]) % 12;
        if (/pm/i.test(t[3])) h += 12;
        hhmm = `${String(h).padStart(2, "0")}:${t[2]}`;
      }
      return {
        "@context": "https://schema.org",
        "@type": "Event",
        name: e.title,
        startDate: `${e.date}T${hhmm}`,
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: place,
        organizer: { "@type": "Church", name: "From the Heart Christian Community Church" }
      };
    });
  if (!list.length) return "";
  const body = list.map((e) => JSON.stringify(e)).join(",\n");
  return `<script type="application/ld+json">\n[\n${body}\n]\n</script>`;
}

function buildWatchButtons() {
  const w = site.watch;
  const btn = (url, cls, label) => url && url.trim()
    ? `        <a class="${cls}" href="${esc(url.trim())}" target="_blank" rel="noopener">${label}</a>`
    : null;
  const parts = [
    btn(w.live_url, "btn", "Watch live"),
    btn(w.page_url, "btn btn--ghost", "Most recent service")
  ].filter(Boolean);
  if (!parts.length) return "";   /* no links set yet: show no dead buttons at all */
  return `      <p style="margin:2rem 0 0;display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center">\n${parts.join("\n")}\n      </p>`;
}

/* The panorama keeps its real pixel size in the HTML so the page does not
   jump while it loads. Read from the file itself, so a replacement photo of a
   different shape still gets the right numbers. */
function buildPanorama() {
  const rel = site.family.panorama_image;
  let dims = "";
  try {
    const buf = fs.readFileSync(path.join(SRC, assetPath(rel)));
    for (let i = 2; i < buf.length - 9; ) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        dims = ` width="${buf.readUInt16BE(i + 7)}" height="${buf.readUInt16BE(i + 5)}"`;
        break;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch (err) { /* unreadable or not a JPEG: ship without dimensions */ }
  return `<div class="panoscroll"><img src="${esc(assetPath(rel))}" alt="${esc(site.family.panorama_alt)}" loading="lazy"${dims}></div>`;
}

function buildGallery() {
  return (gallery.items || []).map((g) =>
    `      <figure><img src="${esc(assetPath(g.image))}" alt="${esc(g.alt || g.caption)}" loading="lazy"><figcaption>${esc(g.caption)}</figcaption></figure>`
  ).join("\n");
}

function serviceCard(label, note, rows, footnote) {
  const lines = (rows || []).map((r) =>
    `        <div class="row"><b>${esc(r.name)}</b><span>${esc(r.time)}</span></div>`
  ).join("\n");
  const foot = footnote ? `\n        <p class="note">${esc(footnote)}</p>` : "";
  return `      <div class="card">
        <h3>${esc(label)}</h3><p class="when">${esc(note)}</p>
${lines}${foot}
      </div>`;
}

function buildServiceCards() {
  const s = site.services;
  return [
    serviceCard(s.sunday_label, s.sunday_note, s.sunday_rows),
    serviceCard(s.wednesday_label, s.wednesday_note, s.wednesday_rows),
    serviceCard(s.monthly_label, s.monthly_note, s.monthly_rows, s.monthly_footnote)
  ].join("\n");
}

function buildWalkSteps() {
  const steps = site.visit_steps || [];
  const tabs = steps.map((st, i) =>
    `        <button class="walk__tab" role="tab" aria-selected="${i === 0 ? "true" : "false"}" aria-controls="w${i + 1}" id="t${i + 1}">${esc(st.tab)}</button>`
  ).join("\n");
  const panels = steps.map((st, i) =>
    `      <div class="walk__panel${i === 0 ? " on" : ""}" role="tabpanel" id="w${i + 1}" aria-labelledby="t${i + 1}"${i === 0 ? "" : " hidden"}>
        <h3>${esc(st.heading)}</h3>
        <p>${esc(st.body)}</p>
      </div>`
  ).join("\n");
  return `      <div class="walk__tabs" role="tablist" aria-label="What happens when you visit">\n${tabs}\n      </div>\n${panels}`;
}

function buildStoryParagraphs() {
  return (site.story.paragraphs || []).map((p, i) =>
    `        <p class="${i === 0 ? "lead" : "dim"}">${esc(p)}</p>`
  ).join("\n");
}

/* ---------- render ---------- */

let html = read(path.join(SRC, "template.html"));

const BLOCKS = {
  eventschema: buildEventSchema,
  storyparagraphs: buildStoryParagraphs,
  servicecards: buildServiceCards,
  walksteps: buildWalkSteps,
  gallery: buildGallery,
  watchbuttons: buildWatchButtons,
  panorama: buildPanorama,
  events: buildEvents
};
for (const [name, fn] of Object.entries(BLOCKS)) {
  html = html.replace(`<!--BLOCK:${name}-->`, fn());
}

/* The Cash App link is always cash.app/<tag>, so it is worked out from the tag
   rather than typed twice and left to drift out of step. */
{
  const tag = String(site.giving.cashapp_tag || "").trim().replace(/^\$+/, "");
  site.giving.cashapp_tag = tag ? "$" + tag : "";
  site.giving.cashapp_url = tag ? "https://cash.app/$" + tag : "";
}

const missing = [];
html = html.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, (whole, key) => {
  const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), site);
  if (value === undefined) { missing.push(key); return whole; }
  return esc(/_image$/.test(key) ? assetPath(value) : value);
});

const leftoverBlocks = html.match(/<!--BLOCK:\w+-->/g) || [];
if (missing.length) { console.error("MISSING content fields:", [...new Set(missing)]); process.exit(1); }
if (leftoverBlocks.length) { console.error("UNFILLED blocks:", leftoverBlocks); process.exit(1); }

/* ---------- write ---------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(SRC, "assets"), path.join(DIST, "assets"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "admin"))) {
  fs.cpSync(path.join(ROOT, "admin"), path.join(DIST, "admin"), { recursive: true });
  wireAdminToRepo();
}
fs.writeFileSync(path.join(DIST, "index.html"), html);

/* The admin page has to know which repository it is saving into. Rather than
   having someone type it in and keep it in step, it is read from the host at
   build time: Netlify sets REPOSITORY_URL and BRANCH on every build. This means
   the repository can be renamed, moved, or handed to the church later and the
   editor keeps working with nothing to change by hand. */
function wireAdminToRepo() {
  const cfgPath = path.join(DIST, "admin", "config.yml");
  if (!fs.existsSync(cfgPath)) return;

  const url = process.env.REPOSITORY_URL || "";
  /* https://github.com/owner/repo(.git)  or  git@github.com:owner/repo(.git) */
  const m = /github\.com[:/]+([^/]+)\/([^/.]+)/.exec(url);
  if (!m) {
    console.log("  admin/config.yml: no REPOSITORY_URL, left as written in the file");
    return;
  }
  const slug = `${m[1]}/${m[2]}`;
  const branch = process.env.BRANCH || "main";

  let cfg = fs.readFileSync(cfgPath, "utf8");
  /* Check the lines are there to fill, rather than checking the text changed:
     when the repository matches what is already written the result is correctly
     identical, and that must not count as a failure. */
  for (const key of ["repo", "branch"]) {
    if (!new RegExp(`^\\s*${key}:\\s*\\S`, "m").test(cfg)) {
      console.error(`admin/config.yml has no ${key}: line to fill in`);
      process.exit(1);
    }
  }
  cfg = cfg.replace(/^(\s*repo:\s*).*$/m, `$1${slug}`)
           .replace(/^(\s*branch:\s*).*$/m, `$1${branch}`);
  fs.writeFileSync(cfgPath, cfg);
  console.log(`  admin/config.yml -> ${slug} (${branch})`);
}

const liveEvents = buildEvents() ? buildEvents().split("card event").length - 1 : 0;
console.log(`Built dist/index.html  (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`  ${(gallery.items || []).length} gallery photos, ${liveEvents} upcoming events`);
