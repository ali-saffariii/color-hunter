# Color Hunter 2.0.0-b

A camera colorimeter that runs entirely in the browser. It samples colour under
real light, classifies the scene light, matches against Pantone and RAL
approximations, and can fit a correction for your phone's camera from a 24-patch
chart. No server, no uploads, no account.

**What it is not:** a spectrophotometer. A phone camera, even calibrated, gives
you a good guide and a repeatable one — not an instrument-grade measurement.
The app now reports what it can actually defend: how good the capture conditions
were, and, where a calibration has been validated on patches it was not fitted
to, how large the remaining error was.

## Files

| File | Purpose |
|---|---|
| `index.html` | The app: markup, styles, UI logic |
| `color-engine.js` | Colour science: conversions, ΔE, contrast, calibration maths |
| `i18n.js` | English and Persian copy, and the right-to-left switch |
| `storage.js` | IndexedDB store, migration from v1, backup and restore |
| `sw.js` | Offline cache and update flow |
| `manifest.webmanifest` | Install to home screen |
| `color-hunter.html` | Forwards old links to the app |
| `icon-180.png`, `icon-192.png`, `icon-512.png` | App icons |
| `tests/` | Unit tests (Node) and browser tests (Playwright) |
| `AUDIT.md` | Code audit and what changed in this release |
| `CHANGELOG.md` | File-by-file replacement notes |

All app files must sit **side by side in the same folder**. `index.html` loads
`color-engine.js`, `i18n.js` and `storage.js` with relative paths; if any is
missing the app says so on the start screen, in both languages, instead of
failing silently.

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
node --test "tests/*.test.js"    # 67 checks, no dependencies
python3 tests/browser/run.py     # 47 checks, needs Playwright + Chromium
```

The browser suite starts its own web server, drives a real Chromium, and covers
migration, stored-text safety, the photo → measure → save path, backup and
restore, the update prompt, a clean first run, and the Persian interface.

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

## Data and privacy

Images are read into a canvas and never leave the device. Colours, notes and
thumbnails are stored in this browser only, in IndexedDB; settings are in
`localStorage`. There is no network call anywhere except the Google Fonts
stylesheet, and the Content Security Policy in the page blocks any other origin.
Deleting the app's site data deletes your colour book, so back up to a file
first — that file is plain JSON and is yours.

## Legal

PANTONE® is a registered trademark of Pantone LLC; RAL is a trademark of RAL
gGmbH. Color Hunter is not affiliated with either. The codes shown are nearest
matches to published sRGB approximations, not licensed colour data; confirm
against a physical guide before ordering paint or print.

**Before selling this app or using those marks in marketing, get legal advice.**
The colour tables and the use of the brand names both need clearance in your
target market, and nothing in the code resolves that.
