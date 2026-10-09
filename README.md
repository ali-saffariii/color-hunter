# Color Hunter v1.1

A camera colorimeter that runs entirely in the browser. It measures color under real light, tells sun from shade, matches Pantone and RAL, and calibrates the phone camera with a 24-patch chart. No server, no uploads.

## Files

| File | Purpose |
|---|---|
| `color-hunter.html` | The whole app |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install to home screen |
| `icon-192.png`, `icon-512.png` | App icons |

Keep all five in the same folder.

## Publish on GitHub Pages (free, https)

1. Create a public repository and upload the five files.
2. Rename `color-hunter.html` to `index.html` **and** change `start_url` in `manifest.webmanifest` and the first entry of `CORE` in `sw.js` to `./index.html` (or keep the name and share the full link).
3. Settings → Pages → Deploy from branch → `main` / root.
4. Open `https://<user>.github.io/<repo>/` on your phone.

The camera only works over https or localhost. Opened as a local file, only "Open a photo" works.

## Pre-launch checklist (on real phones)

- [ ] Android Chrome: camera starts, HUD shows `WB 5500K LOCK` if the phone supports it
- [ ] iPhone Safari: camera starts (WB lock and sensor data are not available on iOS; expected)
- [ ] Auto-capture locks on a steady surface and re-arms when you move
- [ ] Calibrate with the printed chart: the result should report average ΔE under ~2
- [ ] Measure a known Pantone/RAL object in sun and in shade: same code or a neighbour both times
- [ ] Share card opens the system share sheet
- [ ] Install to home screen, then reopen in airplane mode

## Legal

PANTONE® is a registered trademark of Pantone LLC; RAL is a trademark of RAL gGmbH. The app is not affiliated with either and states this in About. Codes are nearest matches to published sRGB approximations, not licensed color data. If you plan to sell the app or use the brand names in marketing, get legal advice first.
