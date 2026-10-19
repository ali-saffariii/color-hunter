# Changelog

## 2.1.0 — Projects, Color Studio, Export and Pro

A professional workspace around the camera. Nothing from 2.0 was removed:
detection, calibration, the color book, backup/restore, both languages and both
themes behave as before, and existing data is read, not rewritten.

### How to deploy

| Action | File |
|---|---|
| Replace | `index.html`, `sw.js`, `i18n.js`, `storage.js`, `package.json`, `README.md`, `CHANGELOG.md`, `AUDIT.md`, `tests/` |
| Add | `workspace.css`, `projects.js`, `studio.js`, `exporter.js`, `sheets.js`, `pro.js`, `pro-config.js`, `ui.js`, `ws-data.js`, `ws.js`, `ws-projects.js`, `ws-studio.js`, `ws-export.js`, `ws-pro.js` |
| Keep out of the site | `tools/license.js` (owner-only), any `private-key*.json` |
| Keep as-is | `color-engine.js`, `manifest.webmanifest`, `color-hunter.html`, your icons and `fa.*` / `en.*` fonts |

**Upgrading is automatic.** The first launch moves the database from schema 2 to 3
(adds projects and palettes; existing colors stay in the Inbox). Old v1 data and the
verbatim pre-migration copy are untouched. Because `sw.js` has a new version, installed
copies show the update prompt and apply it on request — without clearing data.

### What is new

- **Projects:** create, edit, duplicate, archive, delete; colors with uses, several
  palettes, notes, reference images, client, logo, identity strip; search, sort,
  filter by use; move colors and palettes; whole-project file export/import; the
  camera can save straight into a chosen project (always shown on screen).
- **Color Studio:** palettes from a color, photo, project or code (k-means in OKLab);
  six harmonies with locking; OKLCh editing; all codes with nearest Pantone/RAL;
  light/dark scales; UI color systems with Light and Dark roles; WCAG 2.2 checks;
  auto-fix with minimal change; contrast tool with suggestions; ΔE compare; undo;
  drafts restored after a reload; save to a project, or as colors.
- **Export:** five sheet templates with project name, client, logo, description;
  PDF (print), PNG, SVG; CSS variables in four notations, W3C design tokens, system
  CSS, SVG swatches; locked exports show a real preview with a "Pro preview" mark.
- **Pro:** Free/Pro limits and gates, comparison table, real previews, honest
  "not open yet" state, offline license verification, `tools/license.js`,
  `pro-config.js`. No payment gateway or backend is included.
- **UI:** one design system for camera and workspace, bottom navigation (Projects,
  Studio, Export, Pro), designed empty/loading/error/success states, Persian and
  English, Light and Dark.

### Fixed in this release

- The camera destination project was forgotten on every launch (settings were
  bound before the data loaded, so the project looked missing and the choice was
  cleared). Now it is only judged once the data is known; a unit test covers it.
- The color-code field stretched past the screen edge (the picker swatch inherited
  `width:100%`).
- The Pro preview ribbon covered the workspace header.
- Persian: letter-spacing split words in the Pro table; two sort labels were English.
- A locked template's badge collided with its title.
- "licence" → "license" everywhere, to match the rest of the interface.

### Known limits

See `AUDIT.md` section 8: client-side Pro gating is bypassable; no payment backend;
PDF uses the browser's print dialog; PNG/SVG embed your fonts only if `fa.*`/`en.*`
sit beside the app; Pantone/RAL names are approximations; camera behavior and the PWA
on real phones are not covered by automated tests.

## 2.0.0-b — Phase B (start): bilingual interface

Adds a full Persian interface alongside English. Nothing from Phase A was
removed or reworked to make room for it — the translation layer sits on top
of the existing markup and logic.

### How to deploy

| Action | File |
|---|---|
| Replace | `index.html`, `sw.js`, `manifest.webmanifest`, `README.md`, `CHANGELOG.md`, `package.json` |
| Add | `i18n.js`, `tests/i18n.test.js` |
| Add yourself | `fa.woff2` (or `.woff`/`.ttf`/`.otf`) and `en.woff2` (or `.woff`/`.ttf`/`.otf`), in the repository root next to `index.html` |
| Keep as-is | `color-engine.js`, `storage.js`, `color-hunter.html`, the icons, everything under `tests/` from Phase A |

No data migration is needed for this release — colour records are untouched;
only how the interface reads changes.

### What's new

- **English and Persian**, chosen automatically from the browser's language on
  first run, switchable any time in Details → Language. The choice is saved
  and survives a reload.
- **Right-to-left layout for Persian.** `<html dir>` and `lang` switch with the
  language. Technical tokens — HEX, RGB, Lab, LCh, ΔE00, WB, Pantone and RAL
  codes, and all digits — stay left-to-right inside Persian text, so a colour
  code is never reversed or reflowed.
- **Translation is layered on, not rewritten in.** `i18n.js` holds the
  dictionary and the switching logic as a self-contained module; `index.html`
  marks translatable text with `data-i18n` / `data-i18n-attr` and calls
  `I18N.applyDom()`. The English string already in the markup is the
  dictionary key, so a missing Persian entry shows the English text instead of
  a blank or an identifier, and a unit test fails if the dictionary and the
  app's actual strings ever drift apart in either direction.
- **Saved colours stay in English on disk.** Names are translated only at
  render time, so switching language relabels the whole colour book without
  rewriting a single stored record, and a backup file restores correctly
  regardless of which language made it.
- **Your own font files.** `index.html` declares `@font-face` rules for two
  families, `CHfa` and `CHen`, each accepting `fa.woff2`/`fa.woff`/`fa.ttf`/
  `fa.otf` and `en.woff2`/`en.woff`/`en.ttf`/`en.otf` respectively — drop in
  whichever one format you have per language. If neither is present the app
  falls back to the web fonts it already used, so nothing breaks before you
  add them. See the Fonts section of `README.md`.
- Persian copy is written for a working designer, not machine-translated: it
  uses the verbs Persian software actually uses, and keeps the Capture
  Quality / Validated Accuracy distinction from Phase A distinct in Persian
  too («کیفیت ثبت» vs «دقت تأییدشده»), rather than collapsing both into one
  word for "accuracy."
- Letter-spacing is removed for Persian text (it breaks joined script), and
  the layout was checked for horizontal overflow at 320px width in both
  languages.

### Tests

- `tests/i18n.test.js` — 10 checks: every on-screen string has a Persian
  entry and every Persian entry is used somewhere real; placeholders match
  between languages; technical tokens are not translated; language
  fallback/detection; the font-face and letter-spacing rules exist.
- `tests/browser/run.py` gained a "bilingual" section: switching to Persian
  sets `dir="rtl"` and translates real UI text (not just a flag), colour
  codes keep LTR direction inside Persian, nothing overflows sideways, saved
  colour names relabel without touching the stored record, the choice
  survives a reload, and switching back to English restores both direction
  and copy.
- Total: 67 Node unit checks (was 56; +11 across `i18n.test.js` and the
  updated `markup.test.js`), 47 Playwright checks (was 36; +11 bilingual
  checks, net of two combined into the reload scenario).

### Known limitations after this release

- No Persian font file ships with the code — the app looks correct and
  functional with the web-font fallback, but the final Persian typography has
  not been checked with the font you intend to use until you add `fa.*`.
- Everything else listed as a limitation after Phase A still applies (real
  devices, calibration profile collisions on iOS, main-thread palette
  extraction, base64 thumbnails, Pantone/RAL licensing) — see below.
- The rest of Phase B — four-section navigation, Projects, the broader
  visual redesign — has not started.

## 2.0.0-a — Phase A: foundation and reliability

Replaces v1.2. No feature was removed. Measure, Compare, Hunt, Calibration,
Colour Book, Image Palette, Share and PWA all still work, and the visual
identity is unchanged — Phase A deliberately touches reliability and honesty,
not the design.

### How to deploy

| Action | File |
|---|---|
| Replace | `index.html`, `sw.js`, `manifest.webmanifest`, `README.md` |
| Add | `color-engine.js`, `storage.js`, `AUDIT.md`, `CHANGELOG.md`, `tests/` |
| Keep as-is | `color-hunter.html`, `icon-180.png`, `icon-192.png`, `icon-512.png` |

All files go in the repository root, side by side. Users do not need to
reinstall, clear data, or do anything at all.

### Data migration

On first launch the app moves the v1 colour book from
`localStorage['chunt-en']` into IndexedDB. It takes a verbatim copy of the old
blob into the database first, writes the colours, verifies the count, and only
then marks the migration done — so a tab that dies halfway repeats the work
safely with the same record ids rather than duplicating. **The `chunt-en` key is
never written to and never deleted**, which means rolling back to v1.2 still
finds its data. Settings move to `ch.settings.v2`.

### Security

- All dynamic rows — colour cards, value rows, match lists, palettes, the PDF
  export — are built as DOM nodes through `textContent`. Notes and names can no
  longer execute. A unit test fails if a new unreviewed `innerHTML` sink appears.
- Content Security Policy added: `default-src 'none'`, `connect-src 'self'`,
  no third-party scripts, no `eval`. Google Fonts is the only external origin.
- Imported backup files are rebuilt field by field. Remote image URLs,
  over-long notes, malformed entries and duplicate ids are dropped or collapsed.

### Data reliability

- Colours live in IndexedDB, one record each, written before the in-memory list
  updates. The 120-colour silent trim is gone.
- A failed write is reported with its real cause and the colour is not shown as
  saved.
- Backup to JSON and restore with merge or replace, with a snapshot taken before
  any destructive step.
- Storage usage and colour count shown in the Colour Book section.

### Colour science

- Maths extracted unchanged into `color-engine.js` and verified against the
  Sharma/Wu/Dalal CIEDE2000 reference set and published sRGB→CIELAB values. No
  correction to the maths was needed.
- Added for later phases and already tested: OKLab/OKLCh, HSL/HSV, WCAG contrast
  helpers, error statistics.
- **"Accuracy" is now two things.** *Capture Quality* reports sampling
  conditions and names each problem with a fix. *Validated accuracy* reports a
  number only when a calibration was validated on held-out patches against a
  real ColorChecker, and otherwise says "Not validated" or "Approximate".
- Calibration reports **4-fold cross-validated** error — every patch scored by a
  matrix fitted without it — instead of the residual of fitting a matrix to its
  own training data. Median, 95th percentile and max are kept, not just the mean.
- The calibration reference (printed chart vs ColorChecker) is recorded. A
  printed chart can never produce a "validated" claim.
- ΔE guidance reworded as rules of thumb rather than laws of perception; CMYK
  labelled an estimate with no ICC profile.
- Text colour on measured swatches now chosen by WCAG contrast, not a luminance
  guess.

### Camera and performance

- The camera stream is released on `visibilitychange`, `pagehide` and `freeze`,
  and restored on return only if it was running.
- The render loop idles while the page is hidden: no sampling, no scene
  analysis, no gauge animation off-screen.

### PWA

- A new version installs and **waits**. The page shows "A new version is ready"
  and swaps only when the user taps Reload. No more taking over a live session,
  and no more telling users to clear website data.
- Same-origin assets are stale-while-revalidate, so a stale file cannot outlive
  one visit. A broken cache falls through to the network, and a genuinely
  offline navigation with no cached copy gets a readable page rather than a dead
  one.
- The worker registers on `localhost` as well as https, so offline behaviour can
  be tested locally.

### Tests

- `tests/color-engine.test.js`, `tests/storage.test.js`, `tests/markup.test.js`
  — 56 checks, Node's own test runner, no dependencies.
- `tests/browser/run.py` — 36 checks in real Chromium: migration, hostile text,
  measure and save, backup and restore, quota failure, the update prompt,
  Compare, Hunt, and a clean first run.
- `tests/helpers/fake-idb.js` — a small IndexedDB double so migration logic can
  be tested in Node. Test fixture only; never loaded by the app.

### Known limitations after Phase A

- Nothing here has been run on a real phone. The camera path cannot be tested in
  a headless browser; the device checklist in the README is not ticked.
- Calibration profiles are keyed on the camera label, which iOS withholds until
  permission is granted, so front and rear profiles can still collide on some
  devices.
- Palette extraction still runs on the main thread.
- Thumbnails are still base64 data URLs rather than Blobs.
- English only as of this release — Persian landed in 2.0.0-b, above.
  Projects, colour harmony, the colour-system builder, token export, PDF
  templates, licensing, analytics and the landing page are still Phases B–D
  and are not present.
- Pantone and RAL data and marks are not cleared for commercial use.
