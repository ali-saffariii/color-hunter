# Color Hunter v1.2

A camera colorimeter that runs entirely in the browser. It measures color under real light, tells sun from shade, matches Pantone and RAL, and calibrates the phone camera with a 24-patch chart. No server, no uploads.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app |
| `color-hunter.html` | Forwards old links to the app |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install to home screen |
| `icon-180.png`, `icon-192.png`, `icon-512.png` | App icons |

Upload all files to the **root** of the repository, side by side. Delete any older copies first.

## Publish on GitHub Pages (free, https)

1. Upload the files to the repository root.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<user>.github.io/<repo>/` on your phone (the folder address, ending in `/`).

## Installing on iPhone

1. Open the site in **Safari** (not Chrome or an in-app browser) and let it load fully once.
2. Share → Add to Home Screen.
3. If an old broken icon exists, delete it first. If Safari still shows an old version: Settings → Safari → Advanced → Website Data → remove `github.io`, then reopen.

The camera only works over https. Opened as a local file, only "Open a photo" works.

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
