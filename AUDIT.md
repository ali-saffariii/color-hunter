# Color Hunter — code audit and Phase A report

Audited: `index.html` (1024 lines, v1.2), `sw.js`, `manifest.webmanifest`,
`color-hunter.html`, `README.md`, as supplied on 2026-10-19.

I did not have write access to `github.com/ali-saffariii/color-hunter`. Everything
below was done on the files as given; the result is a complete drop-in replacement
set, not a patch series. See `CHANGELOG.md` for the file-by-file swap.

---

## 1. What the app was

A single 110 KB HTML file holding the entire product: markup, CSS, and ~550 lines
of dense JavaScript. No build step, no dependencies, no framework. Two external
requests (Google Fonts stylesheet and font files); everything else local.

**Architecture.** One global `S` object for state, persisted as a single JSON
string in `localStorage['chunt-en']`. A `requestAnimationFrame` loop drives
sampling, scene analysis, reticle placement and rendering, gated by timers
(45 ms frame grab, 350 ms scene analysis, 700 ms sensor read, 90 ms UI update).
Four view modes (Measure / Compare / Hunt / Calibrate) share one bottom panel.

**Features found, all genuinely implemented:** live camera with torch and
front/rear switching, photo loading with EXIF exposure parsing, hold-to-sample
with frame averaging, auto-capture with a steadiness detector, a magnifier, a
variable sample aperture on a rotary dial, scene-light classification with a
colour-temperature gauge, white-reference measurement, 24-patch camera
calibration, Pantone (≈300) and RAL (≈210) nearest-match lists, descriptive
colour naming from LCh, 5-colour k-means palette extraction, a colour book with
notes and thumbnails, PNG book export, print/PDF output, a story-format share
card, speech output, haptics, a first-run tour, and an offline service worker.

**Colour pipeline.** 8-bit sRGB → linearised via a lookup table → trimmed-mean
over the sample patch → optional 3×3 camera profile → XYZ → Bradford adaptation
to D65 → CIELAB → CIEDE2000 against the reference lists.

**The maths was the strongest part of the codebase.** I extracted it unchanged
into `color-engine.js` and tested it against the Sharma, Wu & Dalal (2005)
CIEDE2000 reference set and the published sRGB→CIELAB values. All 30 reference
pairs match to within 1e-4, and the sRGB primaries and neutrals to within 0.01
ΔL*a*b*. **No correction to the colour maths was needed.** What needed
correcting was everything the app *claimed* about those numbers.

---

## 2. P0 — critical

Security, data loss, misleading scientific claims, broken core function.
All nine are fixed and covered by tests.

### P0-1 — Stored text was executed as markup (XSS)
`renderBook()` built every card with a template literal into `innerHTML`,
interpolating `x.note`, `x.n`, `x.p`, `x.r` and `x.h` raw. The note is free text
the user types; `src="${x.img}"` accepted any string. The print/PDF export did
the same. A note of `<img src=x onerror=...>` ran on every open of the sheet.
Self-inflicted today, but it becomes a real attack surface the moment colours
can be shared or imported — which Phase A now adds.

*Fixed.* All dynamic rows are built with an `el()` DOM helper that writes through
`textContent`. The seven remaining `innerHTML` assignments interpolate nothing but
numbers and constants, and a unit test fails if a new one appears.

### P0-2 — Old colours were deleted without telling anyone
`addBook()` ended with `S.book = S.book.slice(0,120)`. Save colour 121 and your
first one was gone, silently, with no warning and no way back.

*Fixed.* No cap. A test asserts the trim cannot come back.

### P0-3 — The storage ceiling was reachable, and failure looked like success
Everything — settings, 120 colours, and a base64 JPEG thumbnail per colour
(~2–5 KB each) — lived in one `localStorage` key. A full book is 0.5–2 MB of
JSON against a ~5 MB per-origin budget shared with anything else on
`github.io`. Past the limit `setItem` throws; the old `save()` caught it, showed
a toast, and carried on. The colour was already in `S.book`, so the UI showed it
saved while nothing had been written — and every later settings change failed too.

*Fixed.* Colours moved to IndexedDB, one record each, written before the
in-memory list is updated. A refused write reports the real reason and the colour
does not appear in the library. Settings stay in `localStorage` under a new key —
small, synchronous, and still working if IndexedDB is unavailable. Verified in the
browser by forcing a `QuotaExceededError`.

### P0-4 — "Accuracy" was not accuracy
The HUD showed `ACC 87`, titled "Measurement accuracy", and the figure was stored
with every saved colour. It came from `accuracy()`: start at 100, subtract 40 for
raw mode, 32 for auto white balance, add 10 if a camera profile exists, subtract
for clipping, darkness, patch variance, frame count. That is a blend of *how the
app was configured* and *how good the sampling conditions were*. It contains no
information about how close the reading is to the object's true colour, because
nothing in the app can know that without a reference.

*Fixed.* Two separate figures, as specified in §06 of the brief:
- **Capture Quality** — conditions only (light level, clipping, patch evenness,
  mixed light, frames averaged, gamut), each with the issue named and a fix
  offered: *"Clipped highlight. Strong reflection detected. Move the camera
  slightly, or shade the surface."*
- **Validated accuracy** — shows a number only when a calibration was validated
  on patches the matrix was not fitted to, *and* against a real ColorChecker.
  Otherwise it reads "Not validated" or "Approximate", and says why.

### P0-5 — Calibration error was measured on its own training data
`calFit()` fitted a 3×3 matrix to all 24 patches, then computed the mean ΔE of
those same 24 patches through that matrix and reported it: *"Average error went
from ΔE 5.2 to 1.8."* A model scored on the data it was fitted to always looks
good; with 9 free parameters and 24 points the flattery is substantial. The README
then told users to expect "average ΔE under ~2" as a success criterion, so the
check was circular.

*Fixed.* `crossValidate()` runs 4-fold cross-validation: every patch is scored by
a matrix fitted without it. That held-out figure is what the app shows, stores and
calls the honest one; the training residual is still reported, labelled as such.
The distribution is kept too (median, 95th percentile, max), not just the mean,
because one badly-wrong patch matters and a mean hides it.

### P0-6 — A home-printed chart was treated as a colour reference
The printed chart and a real ColorChecker were interchangeable in the code and in
the README's acceptance criterion. An inkjet chart's patches differ from the
reference by an unknown amount, so fitting to it bakes the printer's error into
every later measurement.

*Fixed.* The user states which reference they used before calibrating. A printed
chart can never produce a "validated" claim — it is recorded as an approximate
correction, and the copy says so.

### P0-7 — The camera was never released
The only lifecycle handler restarted an already-dead track. Switching apps left
the stream open: battery drain, a hot sensor, and on iOS the well-known path to a
camera that never comes back after a few switches.

*Fixed.* The stream is stopped on `visibilitychange`, `pagehide` and `freeze`, and
restored on return only if it was running. The render loop also idles while the
page is hidden, so no sampling or scene analysis runs off-screen.

### P0-8 — Updates could swap files under a running session
`sw.js` called `skipWaiting()` during install and `clients.claim()` on activate.
A new worker therefore took over a page that was still running the old JavaScript,
which could then fetch new assets mid-measurement. Non-navigation requests were
cache-first with no revalidation, so a stale sub-resource could outlive the
update. The README's fix for this was to tell users to delete their website data
— which also deletes their colour book.

*Fixed.* The worker installs and waits. The page is told, shows "A new version is
ready", and swaps only when the user taps Reload. Same-origin assets are
stale-while-revalidate, so a stale file cannot survive a single visit. Verified in
the browser: shipping a new worker mid-session raises the prompt, the session
keeps working, and the prompt can be dismissed.

> **A bug I introduced and the tests caught.** My first version of this reloaded
> the page on `controllerchange` whenever a swap had *not* been requested — the
> condition was inverted. Because the first registration also fires
> `controllerchange` via `clients.claim()`, every first-time visitor would have
> been reloaded once on arrival. The browser test asserts the first visit is not a
> reload; it failed, and the logic was fixed.

### P0-9 — No backup, no restore, one copy of everything
Data existed in exactly one place. iOS Safari evicts site data after a period of
disuse, the README itself instructed users to clear website data, and there was no
export.

*Fixed.* Export to a JSON file and restore with merge or replace, with schema
validation, duplicate collapsing, and a snapshot taken inside the app before any
destructive step (restore, clear). Imported files are rebuilt field by field, not
trusted: a remote image URL, an over-long note or a malformed entry is dropped,
and a duplicate id collapses instead of doubling the library.

---

## 3. P1 — important

| # | Finding | Status |
|---|---|---|
| P1-1 | No Content Security Policy: any injected script could reach any origin | **Fixed.** `default-src 'none'`, `connect-src 'self'`; fonts are the only third party. The policy is strict enough that it blocks `eval`, which is how the test harness discovered it was live. |
| P1-2 | Text colour on measured swatches chosen by `lum(c) > .4`, not contrast; mid-tone colours got unreadable text | **Fixed.** WCAG contrast ratio decides, via `inkOn()`. |
| P1-3 | ΔE thresholds stated as fact ("identical to the eye") | **Fixed.** Presented as rules of thumb for flat patches side by side, with the caveat. |
| P1-4 | CMYK labelled "approx." with no explanation; easy to send to print | **Fixed.** Labelled an estimate with no ICC profile, with a warning not to print from it. |
| P1-5 | Calibration profiles keyed on `track.label \|\| facing`; iOS withholds labels until permission, so front and rear can collide | **Open.** Needs a capability fingerprint (resolution, zoom range, torch) folded into the key, plus a migration for existing keys. Phase B. |
| P1-6 | Palette extraction runs k-means on the main thread: ~7 000 pixels × 5 clusters × 10 iterations, with an array filter per cluster per iteration | **Open.** Correct but janky on a mid-range phone. Move to a Worker in Phase B. |
| P1-7 | Thumbnails stored as base64 data URLs (~33 % larger than binary) | **Open by choice.** Blobs are cheaper, but the change touches the share card and PNG export; deferred to Phase B rather than risked here. IndexedDB has the headroom in the meantime. |
| P1-8 | No zoom control; no Display-P3 or ICC handling for imported photos | **Open.** Phase B/C. |
| P1-9 | English only | **Open.** Phase B (§11). |
| P1-10 | PDF output is the browser print dialog: no page size, no multi-page layout control | **Open.** Phase C (§10). |
| P1-11 | Manifest has no description, categories or screenshots; no iOS splash | **Partly fixed** (description and categories added). Screenshots need real device captures. |
| P1-12 | No empty/loading state for the colour book while storage opens | **Fixed.** The book says it is opening, then either shows colours or says the library is empty. |

---

## 4. P2 — enhancement

Projects, colour harmony, the colour-system builder, design-token export,
contrast checker UI, onboarding beyond the tour, landing page, analytics and
licensing are all absent by design — they are Phases B, C and D of the brief. The
groundwork laid in Phase A that they will use: `color-engine.js` already exports
OKLab/OKLCh, HSL/HSV, WCAG contrast helpers and error statistics, and the storage
layer's schema is versioned so projects can be added without another migration.

---

## 5. Legal

The Pantone and RAL tables are hard-coded sRGB approximations, compiled from
published values, not licensed colour data. The About section and README already
disclaim affiliation and state that codes are nearest matches; that text has been
kept and tightened, and the same caveat now appears next to every match list.

This is adequate for a free tool. **It is not clearance to sell.** Before any paid
release, the use of the marks "PANTONE" and "RAL" in a commercial product, and the
provenance of the colour tables themselves, need a lawyer's opinion in the target
market. That is flagged, not solved, and no code change can solve it. A licensed
alternative, or matching restricted to the app's own named colour descriptions,
is the fallback if clearance does not come.

---

## 6. Tests actually run

```
node --test "tests/*.test.js"      56 passed, 0 failed
python3 tests/browser/run.py       36 passed, 0 failed   (Chromium 141, headless)
```

**Unit (Node, no dependencies):** all 30 CIEDE2000 reference pairs from Sharma,
Wu & Dalal; sRGB→CIELAB against published values; Lab↔XYZ↔RGB round trips;
out-of-gamut flagging; LCh wrap-around; WCAG contrast against the #767676 /
#777777 and #949494 / #959595 boundary pairs; OKLab round trips; HSL/HSV; CMYK;
CCT of D65 and illuminant A; Bradford adaptation; `fitP` recovering a known
matrix; cross-validation exceeding the training residual on a non-linear camera;
colour-entry validation; legacy conversion and its determinism; backup
validation and merge rules; IndexedDB migration, repeat migration, interrupted
migration, and quota failure.

**Browser (Chromium, real DOM, real IndexedDB, real service worker):** a seeded
v1 install upgrading in place; the v1 key surviving untouched; a hostile note
rendering as text and not executing; no duplication across reloads; a photo
sampled to the exact pixel value in Raw mode; save, note, reload; backup export
and restore of a hostile file; a forced quota error not being reported as a save;
the update prompt appearing without taking over the session; Compare and Hunt;
and a clean first run for a new user.

**What these tests do not cover, and why:** a headless browser has no camera. No
automated test here says anything about the camera path, white-balance locking,
sensor metadata, torch, iOS Safari behaviour, or colour accuracy under real light.
That is the device checklist in the README, and it has not been run — I have no
phone. Nothing in this report should be read as a claim that the camera works on
iOS; it is unchanged in logic from v1.2 apart from the lifecycle fix, which itself
needs confirming on a real device.

---

## 7. Phase A exit criteria

| Criterion from §23 | Status |
|---|---|
| Runs without data loss | Met. Migration verified; v1 data left intact as a rollback. |
| More stable operation | Met for storage, updates and the camera lifecycle. Camera stability on iOS is unverified without a device. |
| Correct scientific claims | Met. Capture Quality and validated accuracy are separated; calibration reports held-out error; no "trust it forever". |
| Audit | This document. |
| Security | Met. XSS paths closed, CSP added, imports validated. |
| Storage migration | Met and tested, including the interrupted and repeated cases. |
| Backup/restore | Met and tested. |
| PWA fixes | Met and tested in Chromium; iOS Safari unverified. |
| Automated tests | Met: 92 checks across two suites, all passing, all runnable by you. |

Phase B (product experience: navigation, projects, Capture redesign, bilingual,
accessibility) has not been started.

## 8. Release 2.1 — what was reviewed, and the honest limits

### Security and data safety

- **No `innerHTML` anywhere in the new modules.** Names, notes, clients and logos are
  always `textContent`. SVG sheets are parsed as XML into DOM (`UI.svgNode`), which
  strips `script`, `foreignObject`, `on*` handlers and non-`data:` links. A unit test
  (`markup.test.js`) fails if any module starts writing markup.
- **No network** in the new code. The only `fetch` is a same-origin read of the user's own
  `fa.*`/`en.*` font files to embed them in PNG/SVG; the CSP still allows only `'self'`.
- **Atomic writes.** Every multi-record operation (create/duplicate/delete project,
  move, restore, import) is planned first and committed in one IndexedDB transaction;
  the in-memory copy is updated only after the commit. A refused write (quota, error)
  leaves both unchanged and tells the person.
- **Files in are untrusted.** Backups and project files are validated record by record:
  remote images dropped, text truncated, duplicate ids collapsed, newer schemas refused.
  A verbatim copy of the device's data is kept before any restore.
- **License keys:** ECDSA P-256 over the encoded payload, verified with WebCrypto against a
  public key in `pro-config.js`. The private key never ships (`.gitignore` excludes it).
  A key for another product, a tampered payload and an expired key are each refused with
  their own message.
- **Bug found and fixed in test:** the active project was cleared at every start (see
  CHANGELOG). Covered by a unit test that fails without the fix.

### What is NOT solved, and needs something outside this repository

1. **Payments.** No gateway, no checkout, no order → key issuing. `pro-config.js` ships
   closed; the app says so. Opening sales needs a payment provider plus a small server or a
   manual process to issue keys (steps in `README.md`).
2. **Pro cannot resist a determined user.** The app is static and runs on the user's device,
   so anyone can edit their copy and unlock features. Gating keeps honest users honest.
   Stronger protection means server-side license checks.
3. **PDF** is produced with the browser's print dialog ("Save as PDF") so that text stays
   vector and selectable; there is no PDF library. Page margins and headers/footers are
   the browser's to apply unless the person turns them off.
4. **PNG/SVG fonts.** Persian text in PNG/SVG uses your `fa.*` font only if the file sits
   beside the app; otherwise the device's font is used and the app says so.
5. **Pantone/RAL** are approximations of published sRGB values, not licensed data (section 5).
6. **Real devices.** Camera, white balance, PWA install and offline behavior on phones are
   not testable in CI. The device checklist in `README.md` lists what to verify.
7. **Icons and fonts** are supplied by the owner and are not part of this repository.

### Tests run for this release

- 211 unit checks (`node --test "tests/*.test.js"`): color science, storage, the data
  layer against an IndexedDB double (mirror compared with the database after each
  scenario), projects, Studio algorithms, exporters and sheets, Pro limits/gates/keys,
  translation completeness in both directions, and static checks over every module.
- 97 browser checks (`python3 tests/browser/run.py`, Chromium): v1 → v2 migration,
  hostile text, photo → measure → save, backup/restore with hostile files, refused writes,
  the update prompt, first run, Persian, and the 2.1 journey end to end in Free, in a Pro
  preview with real PNG/SVG/JSON downloads, and in Persian dark at 360 px.
- Visual checks of every workspace screen at 360–390 px, light and dark, English and Persian.

