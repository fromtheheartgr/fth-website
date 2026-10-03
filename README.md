# From the Heart Christian Community Church

The church website for **fromtheheartgr.com**.

## How this is put together

The website is plain HTML, CSS and JavaScript. There is no framework and nothing
to learn. The words and photos live in small text files so the church can change
them through a web page instead of touching any code.

```
content/     the words and photos  <- this is what the church edits
src/
  template.html   the page layout, with {{slots}} where content drops in
  assets/         photos, the logo, the hero video
admin/       the editor the church logs into
build.js     pours content into the template and writes dist/
dist/        the finished website (generated, never edited by hand)
```

## Changing the website

**The church does this:** go to `fromtheheartgr.com/admin`, sign in with the
church GitHub account, change what you need, press Publish. The live site
updates by itself a minute or so later.

**A developer can also do it:** edit the files in `content/`, commit, push.
Same result.

Nothing in `src/` or `build.js` needs touching to change words or pictures.

## Running it on your own computer

```bash
node build.js        # writes dist/
npm start            # builds, then serves it at http://localhost:8080
```

You need Node.js installed. Nothing else, and there are no packages to install.

## How it gets published

Netlify watches the GitHub repository. On every change it runs `node build.js`
and publishes the `dist` folder. Settings are in `netlify.toml`.

## Things worth knowing

- **Events remove themselves.** Each event has a date. Once that date has
  passed it stops appearing on the website, so nobody has to remember to take
  it down. If every event has passed, a friendly message appears instead.
- **The Cash App link is worked out from the tag**, so there is only one field
  to change and the two can never disagree.
- **Empty links hide their button.** If the Facebook links are blank, no dead
  buttons appear on the page.
- **Photos are escaped and path-corrected** on the way in, so an uploaded file
  cannot break the layout.
- **The site still reads correctly with JavaScript turned off**, and the
  scroll animation is skipped for visitors who have asked their device to
  reduce motion.

## Still to do

- Put the church Facebook page link into the Watch section.
- Replace the photo of Pastor George and Sis. Deb when the new one arrives.
- Point fromtheheartgr.com at Netlify.
