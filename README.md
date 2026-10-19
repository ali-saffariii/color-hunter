# Color Hunter 2.1.0

A camera colorimeter that runs entirely in the browser. It samples colour under
real light, classifies the scene light, matches against Pantone and RAL
approximations, and can fit a correction for your phone's camera from a 24-patch
chart. No server, no uploads, no account.

Version 2.1 adds a professional workspace around the camera: **Projects** to
keep a job's colors, palettes and notes together, a **Color Studio** to build
palettes and UI color systems and check them, **Export** to hand work to a client
(PDF, PNG, SVG, CSS, design tokens), and **Color Hunter Pro** with a Free/Pro split
that is ready for a payment gateway later. See "What is new in 2.1" below.

**What it is not:** a spectrophotometer. A phone camera, even calibrated, gives
you a good guide and a repeatable one — not an instrument-grade measurement.
The app now reports what it can actually defend: how good the capture conditions
were, and, where a calibration has been validated on patches it was not fitted
to, how large the remaining error was.

## Files

| File | Purpose |
|---|---|
| `index.html` | The app: camera, markup, styles, UI logic |
| `workspace.css` | Styles for Projects, Studio, Export and Pro |
| `color-engine.js` | Colour science: conversions, ΔE, contrast, calibration maths |
| `i18n.js` | English and Persian copy, and the right-to-left switch |
| `storage.js` | IndexedDB store (schema 3), migration from v1, backup and restore |
| `projects.js` | Pure rules for projects: duplicate, delete, move, restore, identity colors |
| `studio.js` | Pure color work: palette extraction, harmonies, scales, UI color systems, auto-fix |
| `exporter.js` | Pure file builders: CSS variables, design tokens, SVG swatches |
| `sheets.js` | Pure sheet builders: palette card, spec sheet, brand sheet, board, UI system sheet (SVG) |
| `pro.js` | Free/Pro limits, feature gates, offline license-key check |
| `pro-config.js` | **The one place Pro is configured** (ships with sales closed) |
| `ui.js`, `ws-data.js`, `ws.js` | Shared UI kit, data layer with atomic writes, workspace shell |
| `ws-projects.js`, `ws-studio.js`, `ws-export.js`, `ws-pro.js` | The four workspace screens |
| `sw.js` | Offline cache and update flow |
| `manifest.webmanifest` | Install to home screen |
| `color-hunter.html` | Forwards old links to the app |
| `icon-180.png`, `icon-192.png`, `icon-512.png` | App icons (you supply these) |
| `fa.*`, `en.*` | Your Persian and English fonts (you supply these) |
| `tools/license.js` | Owner-only: make a signing key, issue and verify license keys. Never deploy. |
| `tests/` | Unit tests (Node) and browser tests (Playwright) |
| `AUDIT.md` | Code audit, what changed, and the honest limits |
| `CHANGELOG.md` | Release notes and deploy steps |

All app files must sit **side by side in the same folder**. `index.html` loads
its scripts and `workspace.css` with relative paths; if any is
missing the app says so on the start screen, in both languages, instead of
failing silently.

## What is new in 2.1

**Projects.** Create, edit, duplicate, archive and delete projects. Each holds
colors and several palettes, notes, reference images, a client and a logo, and a
"project identity" strip taken from its colors. Colors carry a use (primary,
background, text, accent, …); search and sort them, move colors and palettes
between projects, and export the whole project as one file. Choose where the
camera saves: pick a project and every color you hold goes straight into it —
the camera screen always shows the destination. Colors saved without a project
collect in the Inbox, exactly as before. Everything is written in one atomic
step, so a failed save never leaves a half-saved project.

**Color Studio.** Start from a camera color, a photo, a project or a code. Build a
palette from a harmony (complementary, analogous, triadic, split, square,
monochrome), lock the colors you like, and edit any color in lightness, chroma and
hue. Read every code (HEX, RGB, HSL, OKLCH, Lab, CMYK, nearest Pantone and RAL).
Make light and dark scales, design a **UI color system** with roles and separate
Light and Dark sets, check every role pair against WCAG 2.2, and let the Studio
fix failures with the smallest change that passes (shown with its ΔE). The
Contrast tool checks any two colors and suggests fixes; Compare shows ΔE between
colors. Unsaved work is kept as a draft and restored after a reload.

**Export.** Palette card, spec sheet, brand sheet, presentation board and UI system
sheet, with your project's name, client, logo and description. Download as PDF
(the browser's print window, "Save as PDF"), PNG or SVG. For developers: CSS
variables (HEX, RGB, HSL or OKLCH), W3C design tokens (JSON), light/dark system
CSS and SVG swatches.

**Color Hunter Pro.** Free keeps everything that existed before and the core of the
new tools: 3 active projects, 3 palettes per project, palettes, harmonies,
contrast, palette card and spec sheet, CSS variables and SVG swatches. Pro adds
unlimited projects and palettes, light/dark scales, UI color systems with
auto-fix, design tokens, system CSS, the brand sheet, board and UI system sheet.
Limits only stop you *creating more*: nothing you made is ever hidden or deleted,
and backups and project files are always free. Locked tools show a real preview
and say what is locked.

### Pro: what exists, and what needs infrastructure

There is **no payment gateway and no backend in this repository**, and the app
does not pretend otherwise. As shipped, `pro-config.js` has no public key and no
checkout address, so Pro cannot be bought or activated and the Pro screen says
"Buying is not open yet". Nothing is shown as a purchase unless a license key
really verifies.

What is built and tested: the Free/Pro split, every gate, a license-key format
(`CH1.<payload>.<ECDSA P-256 signature>`) verified offline in the browser, a
`tools/license.js` for you to sign keys, and a provider interface in `pro.js` so a
real gateway replaces one object and nothing else.

To open sales you need, outside this repository: a payment provider (hosted
checkout), and a small server (or a manual process) that issues a key after a
payment. Then:

```bash
node tools/license.js keygen                       # private key stays with you; prints the public key
# put the public key in pro-config.js `publicKey`, your https checkout page in `checkoutUrl`
node tools/license.js issue --key private-key.json --plan lifetime --holder "Name"
```

The buyer pastes the key into Pro → Activate. A **preview** exists for you to see
Pro: on `localhost`, or with `?pro-preview=1`, the Pro screen offers a developer
toggle. A preview shows a yellow "not a purchase" ribbon on every screen.

Because the app is static and runs on the user's device, **client-side gating can
be bypassed by anyone who edits their own copy**. It keeps honest users honest;
if Pro must resist copying, license checks have to move to a server.

## Languages and fonts

The interface is English and Persian. It picks your browser's language on first
run, and the switch is in Details → Language. Persian is fully right-to-left:
the layout mirrors, and technical tokens — HEX, RGB, Lab, LCh, ΔE00, Pantone and
RAL codes — stay left-to-right inside Persian sentences so a colour code is
never reordered. Digits stay Latin in both languages, because mixing numeral
systems inside a measurement readout is harder to read, not easier.

Colour names are stored in English and translated when they are displayed, so
switching language relabels the whole library without rewriting a single saved
record — and a backup file restores correctly whichever language made it.

**Your fonts.** Drop two font files next to `index.html`:

| File | Used for |
|---|---|
| `fa.woff2` (or `fa.woff`, `fa.ttf`, `fa.otf`) | the Persian interface |
| `en.woff2` (or `en.woff`, `en.ttf`, `en.otf`) | the English interface |

Any one of those four formats works — the browser takes the first it can load
and ignores the rest, so you only need to supply one per language. `woff2` is
the smallest and is what a phone should get if you have the choice. If a file
is absent the app falls back to the web fonts it already used, so nothing
breaks while you are still choosing.

Two things to check in whatever Persian font you pick: it needs the Persian
forms of ک and ی (not the Arabic ones), and it should carry at least a regular
and a bold weight, since the interface leans on weight for hierarchy. The
numeric readouts stay on the built-in dot-matrix face by design; they are
Latin digits in both languages.

## Publish on GitHub Pages

1. Put the files in the repository root (replace the old ones — see
   `CHANGELOG.md` for what changes).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<user>.github.io/<repo>/` on your phone — the folder address,
   ending in `/`.

Existing users do **not** need to delete the app or clear anything. The first
launch after the update moves their saved colours into the new storage, keeps a
verbatim copy of the old data, and leaves the old `chunt-en` key untouched so a
rollback to v1.2 still finds its data.

## Run locally

```bash
python3 -m http.server 8000      # then open http://localhost:8000/
```

The camera needs https or `localhost`. Opened as a `file://` URL, only "Open a
photo" works, and the service worker will not register.

## Tests

```bash
node --test "tests/*.test.js"    # 211 checks, no dependencies
python3 tests/browser/run.py     # 97 checks, needs Playwright + Chromium
```

The browser suite starts its own web server, drives a real Chromium, and covers
migration, stored-text safety, the photo → measure → save path, backup and
restore, the update prompt, a clean first run, the Persian interface, and the
whole 2.1 journey: camera color → project → Studio palette → UI color system →
export (real PNG/SVG/JSON downloads), in Free, in a Pro preview, and in Persian
dark at 360 px, plus Pro activation with a really signed key (valid, forged and
tampered).

The unit suite also checks the translation both ways: every string the app can
put on screen must have a Persian entry, and every Persian entry must match a
string the app really uses — so the dictionary cannot drift as the copy changes.

```bash
python3 -m pip install playwright && python3 -m playwright install chromium
```

Neither suite can test the camera: a headless browser has no sensor. That is
what the device checklist below is for.

## Device checklist (not yet run — needs real phones)

Camera behaviour, white balance and colour under real light cannot be verified
in CI. Work through this on hardware before calling a release ready, and record
what failed.

- [ ] Android Chrome: camera starts; HUD shows `WB 5500K lock` if the phone supports it
- [ ] iPhone Safari: camera starts (WB lock and sensor metadata are unavailable on iOS; expected)
- [ ] Switch away from the app and back, five times: the camera comes back every time
- [ ] Leave the app backgrounded for a minute: no battery or heat from a stream left open
- [ ] Auto-capture locks on a steady surface and re-arms when you move
- [ ] Upgrade path: install v1.2, save a few colours, deploy this version, reopen — every colour is still there, exactly once
- [ ] Back up to a file, clear the book, restore, and check the count and notes
- [ ] Calibrate with a printed chart: the result must say "Approximate", never "Validated"
- [ ] Calibrate with a real ColorChecker if you have one: note the held-out ΔE
- [ ] Measure a known object in sun and in shade: same code or a neighbour both times
- [ ] Measure a glossy surface: Capture Quality should fall and name the reflection
- [ ] Measure in low light: it should tell you there is not enough light, not guess
- [ ] Share card opens the system share sheet
- [ ] Install to home screen, reopen in airplane mode
- [ ] Deploy a change, reopen the installed app: the update prompt appears and reloading applies it — without clearing data
- [ ] Fill the device storage and try to save: the app must say it failed, not show "Saved"
- [ ] 320 px-wide screen: nothing overflows horizontally
- [ ] Persian: your `fa` font loads, and ک and ی render in their Persian forms
- [ ] Persian: words are joined, not spaced out letter by letter
- [ ] Persian: HEX, ΔE and Pantone codes read left-to-right and are not reversed
- [ ] Persian: the dial, light meter and colour panel sit on the mirrored side and nothing is cut off
- [ ] Persian: speech output reads in Persian if the device has a Persian voice
- [ ] Switch language with a colour open: the name and light class relabel without losing the reading
- [ ] Create a project, choose it as the camera destination, save three colors: all three are in the project, none in the Inbox
- [ ] Studio on a phone: sliders, color picker and the palette strip are comfortable with a thumb
- [ ] Export PNG on a phone and open it: sizes, colors and text are right (and Persian text is right with your `fa` font next to the app)
- [ ] Export PDF: the print window opens, "Save as PDF" gives one sheet per page with no browser header or footer (turn those off in the print dialog)
- [ ] Dark and Light themes: both readable outdoors
- [ ] Installed PWA: the workspace, Studio drafts and projects work in airplane mode
- [ ] Pro screen: with no key configured it says buying is not open; with a test public key and an issued key, activation works and a tampered key is refused

## Data and privacy

Images are read into a canvas and never leave the device. Colours, notes, projects,
palettes, reference images, logos and thumbnails are stored in this browser only,
in IndexedDB; settings are in
`localStorage`. There is no network call anywhere except the Google Fonts
stylesheet, and the Content Security Policy in the page blocks any other origin.
Deleting the app's site data deletes your colour book, so back up to a file
first — that file is plain JSON and is yours.

## Legal

PANTONE® is a registered trademark of Pantone LLC; RAL is a trademark of RAL
gGmbH. Color Hunter is not affiliated with either. The codes shown are nearest
matches to published sRGB approximations, not licensed colour data; confirm
against a physical guide before ordering paint or print.

The nearest-Pantone and RAL names in the Studio and on sheets are the same
approximations: label them as such with clients, and do not present them as
Pantone Matching System values.

**Before selling this app or using those marks in marketing, get legal advice.**
The colour tables and the use of the brand names both need clearance in your
target market, and nothing in the code resolves that.
