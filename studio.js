/*! Color Hunter — colour studio engine
 *
 *  Pure functions: no DOM, no storage, no app state. Every function takes and
 *  returns plain values (hex strings, arrays) so the whole studio can be tested
 *  in Node against known properties — a locked colour never moves, a scale gets
 *  darker at every step, a "fixed" pair really does reach the contrast it claims.
 *
 *  Colour work is done in OKLCh (Ottosson). Lightness there tracks perception
 *  closely enough that equal steps look equal, and changing chroma or hue does
 *  not drag lightness with it, which is exactly what a contrast fix needs: move
 *  lightness, keep the colour's identity. Results are gamut-mapped to sRGB by
 *  reducing chroma at constant lightness and hue, never by clipping channels.
 *
 *  Words the interface needs (harmony names, role names) are exported as data
 *  so the translation test can see every one of them.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./color-engine.js') : root.CH);
  if (isNode) module.exports = api;
  root.CHStudio = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (CH) {
  'use strict';

  /* ---------- OKLCh <-> hex, with gamut mapping ---------- */

  function hexToOk(hex) { return CH.oklab2lch(CH.rgb2oklab(CH.h2r(hex))); }

  function okToHex(L, C, h) {
    if (L <= 0) return '#000000';
    if (L >= 1) return '#FFFFFF';
    C = Math.max(0, C);
    var r = CH.oklch2rgb([L, C, h]);
    if (!r.oog) return CH.hex(r.rgb);
    var lo = 0, hi = C;
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      if (CH.oklch2rgb([L, mid, h]).oog) hi = mid; else lo = mid;
    }
    return CH.hex(CH.oklch2rgb([L, lo, h]).rgb);
  }

  var norm = function (h) { return ((h % 360) + 360) % 360; };
  var isHex = function (s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s); };
  var up = function (s) { return s.toUpperCase(); };

  // small seeded generator so "regenerate" is repeatable and testable
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- formats ---------- */

  function formats(hex) {
    var rgb = CH.h2r(hex), hsl = CH.rgb2hsl(rgb), ok = hexToOk(hex), lab = CH.lab8(rgb), cmyk = CH.cmykApprox(rgb);
    var r1 = function (v) { return Math.round(v); }, r3 = function (v) { return Math.round(v * 1000) / 1000; };
    return {
      hex: up(hex),
      rgb: 'rgb(' + rgb.join(', ') + ')',
      hsl: 'hsl(' + r1(hsl[0]) + ', ' + r1(hsl[1]) + '%, ' + r1(hsl[2]) + '%)',
      oklch: 'oklch(' + r3(ok[0]) + ' ' + r3(ok[1]) + ' ' + r1(ok[2]) + ')',
      lab: 'lab(' + (Math.round(lab[0] * 10) / 10) + ' ' + (Math.round(lab[1] * 10) / 10) + ' ' + (Math.round(lab[2] * 10) / 10) + ')',
      cmyk: 'cmyk(' + cmyk.join('% ') + '%)'    // an estimate; there is no ICC profile behind it
    };
  }

  /* ---------- harmonies ---------- */

  // Hue offsets are in OKLCh degrees, so they are perceptual angles on this
  // wheel, not the painter's red-yellow-blue wheel.
  var HARMONIES = [
    { id: 'complementary', label: 'Complementary', hues: [0, 180] },
    { id: 'analogous', label: 'Analogous', hues: [-30, 0, 30] },
    { id: 'triadic', label: 'Triadic', hues: [0, 120, 240] },
    { id: 'split', label: 'Split complementary', hues: [0, 150, 210] },
    { id: 'tetradic', label: 'Square', hues: [0, 90, 180, 270] },
    { id: 'monochrome', label: 'Monochrome', hues: [0] }
  ];
  function harmonyDef(id) {
    for (var i = 0; i < HARMONIES.length; i++) if (HARMONIES[i].id === id) return HARMONIES[i];
    return HARMONIES[0];
  }

  /* The colours of one harmony from a base colour. Asking for more colours than
     the harmony has anchors repeats the anchors at alternating lighter and darker
     steps, so the palette keeps its hue structure instead of drifting.
     A grey base has no hue to rotate, so derived anchors get a modest chroma
     floor; the base itself is never altered. */
  function harmony(baseHex, id, n) {
    var def = harmonyDef(id), ok = hexToOk(baseHex), k = def.hues.length, out = [];
    n = Math.max(1, Math.min(16, n || k));
    if (def.id === 'monochrome') {
      // light to dark through the base's hue; the step nearest the base's own
      // lightness is the base itself, so the colour you asked about is in the set
      var near = 0, nearD = 9, ls = [];
      for (var m = 0; m < n; m++) {
        ls.push(n === 1 ? ok[0] : 0.92 - (m / (n - 1)) * 0.67);
        if (Math.abs(ls[m] - ok[0]) < nearD) { nearD = Math.abs(ls[m] - ok[0]); near = m; }
      }
      for (var q = 0; q < n; q++) {
        var t = n === 1 ? 0.5 : q / (n - 1);
        out.push(q === near ? up(baseHex) : okToHex(ls[q], ok[1] * (0.55 + 0.45 * Math.sin(Math.PI * t)), ok[2]));
      }
      return out;
    }
    for (var i = 0; i < n; i++) {
      var anchor = def.hues[i % k], round = Math.floor(i / k);
      if (round === 0 && anchor === 0) { out.push(up(baseHex)); continue; }
      var dL = round === 0 ? 0 : (round % 2 ? 1 : -1) * 0.12 * Math.ceil(round / 2);
      var C = anchor === 0 ? ok[1] : Math.max(ok[1], 0.06);
      out.push(okToHex(clamp01(ok[0] + dL), C, norm(ok[2] + anchor)));
    }
    return out;
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* Regenerate the unlocked slots of a palette.
       current  [{h, lock}] — locked slots are returned untouched, in place
       base     hex used when nothing is locked; it appears in the palette exactly
       seed     integer; the same inputs and seed always give the same palette
       variation 0..1  how far unlocked colours wander from the pure harmony
     The first locked colour becomes the harmony's base, so locking a colour you
     like and pressing generate builds the rest of the palette around it. */
  function generate(opts) {
    var cur = (opts.current || []).filter(function (c) { return c && isHex(c.h); });
    var n = typeof opts.n === 'number' && isFinite(opts.n) ? opts.n : (cur.length || 5);
    n = Math.max(1, Math.min(16, Math.round(n)));
    while (cur.length < n) cur.push({ h: '', lock: false });
    cur = cur.slice(0, n);
    var firstLocked = null;
    for (var i = 0; i < cur.length; i++) if (cur[i].lock && isHex(cur[i].h)) { firstLocked = cur[i].h; break; }
    var base = firstLocked || (isHex(opts.base) ? opts.base : '#3366CC');
    var rand = rng(opts.seed || 1), v = opts.variation === undefined ? 0.5 : opts.variation;
    var anchors = harmony(base, opts.harmony || 'analogous', n);
    var baseSlot = firstLocked ? -1 : anchors.indexOf(up(base));   // with nothing locked, the base itself is kept
    return cur.map(function (c, idx) {
      if (c.lock && isHex(c.h)) return { h: up(c.h), lock: true };
      var a = hexToOk(anchors[idx]);
      var exact = idx === baseSlot;
      var L = exact ? a[0] : clamp01(a[0] + (rand() - 0.5) * 0.22 * v);
      var C = exact ? a[1] : Math.max(0, a[1] * (1 + (rand() - 0.5) * 0.5 * v));
      var H = exact ? a[2] : norm(a[2] + (rand() - 0.5) * 16 * v);
      return { h: exact ? anchors[idx] : okToHex(L, C, H), lock: false };
    });
  }

  /* ---------- tint and shade scale ---------- */

  var SCALE_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  var SCALE_L = [0.975, 0.94, 0.88, 0.80, 0.71, 0.62, 0.53, 0.44, 0.36, 0.28, 0.20];

  /* Eleven steps from near-white to near-black around one colour. The step whose
     target lightness is closest to the input is replaced by the input itself, so
     the colour you started from is always in the scale, exactly. Chroma follows a
     gentle bell, fullest in the middle, so the ends do not turn neon or muddy. */
  function scale(baseHex) {
    var ok = hexToOk(baseHex), best = 0, bestD = 9;
    SCALE_L.forEach(function (L, i) { var d = Math.abs(L - ok[0]); if (d < bestD) { bestD = d; best = i; } });
    var steps = SCALE_STEPS.map(function (name, i) {
      if (i === best) return { step: name, h: up(baseHex), base: true };
      var L = SCALE_L[i], bell = 1 - Math.pow((L - 0.6) / 0.5, 2) * 0.55;
      return { step: name, h: okToHex(L, ok[1] * Math.max(0.25, bell), ok[2]), base: false };
    });
    return steps;
  }

  /* ---------- contrast ---------- */

  function contrastReport(fgHex, bgHex) {
    var r = CH.contrast(CH.h2r(fgHex), CH.h2r(bgHex));
    return {
      ratio: r,
      aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7, aaaLarge: r >= 4.5,
      ui: r >= 3                      // WCAG 2.2 1.4.11, non-text contrast
    };
  }

  /* Move a foreground colour's lightness, as little as possible, until it reaches
     `target` against the background. Hue and chroma are kept (chroma only gives
     way where the sRGB gamut forces it). Both directions are tried and the
     smaller move wins. If neither direction can get there, black or white is the
     fallback and `pass` says whether even that was enough. */
  function ensureContrast(fgHex, bgHex, target) {
    var bg = CH.h2r(bgHex), cur = CH.contrast(CH.h2r(fgHex), bg);
    if (cur >= target) return { hex: up(fgHex), ratio: cur, changed: false, pass: true };
    var ok = hexToOk(fgHex), best = null;
    [1, -1].forEach(function (dir) {
      for (var d = 0.004; d <= 1; d += 0.004) {
        var L = ok[0] + dir * d;
        if (L < 0 || L > 1) break;
        var hx = okToHex(L, ok[1], ok[2]), r = CH.contrast(CH.h2r(hx), bg);
        if (r >= target) { if (!best || d < best.d) best = { d: d, hex: hx, ratio: r }; break; }
      }
    });
    if (!best) {
      var bk = CH.contrast([0, 0, 0], bg), wt = CH.contrast([255, 255, 255], bg);
      best = bk >= wt ? { hex: '#000000', ratio: bk } : { hex: '#FFFFFF', ratio: wt };
    }
    return { hex: best.hex, ratio: best.ratio, changed: true, pass: best.ratio >= target };
  }

  /* Ways out of a failing pair: change the text, or change the background. Each
     suggestion is the closest colour (by lightness) that reaches the target, and
     carries the ΔE00 it moves from the original so the person can see how far
     the fix strays. */
  function suggest(fgHex, bgHex, target) {
    target = target || 4.5;
    var out = [];
    var fgFix = ensureContrast(fgHex, bgHex, target);
    if (fgFix.pass && fgFix.changed) out.push({ kind: 'fg', hex: fgFix.hex, ratio: fgFix.ratio });
    var bgFix = ensureContrast(bgHex, fgHex, target);
    if (bgFix.pass && bgFix.changed) out.push({ kind: 'bg', hex: bgFix.hex, ratio: bgFix.ratio });
    ['#000000', '#FFFFFF'].forEach(function (hx) {
      var r = CH.contrast(CH.h2r(hx), CH.h2r(bgHex));
      if (r >= target && up(hx) !== up(fgHex) && !out.some(function (o) { return o.kind === 'fg' && o.hex === hx; })) {
        out.push({ kind: 'fg', hex: hx, ratio: r });
      }
    });
    out.forEach(function (o) {
      var from = o.kind === 'fg' ? fgHex : bgHex;
      o.dE = CH.de00(CH.lab8(CH.h2r(from)), CH.lab8(CH.h2r(o.hex)));
    });
    return out.sort(function (a, b) { return a.dE - b.dE; });
  }

  /* ---------- UI colour system ---------- */

  var ROLES = [
    { id: 'primary', label: 'Primary' },
    { id: 'onPrimary', label: 'Text on primary' },
    { id: 'secondary', label: 'Secondary' },
    { id: 'accent', label: 'Accent' },
    { id: 'background', label: 'Background' },
    { id: 'surface', label: 'Surface' },
    { id: 'text', label: 'Text' },
    { id: 'muted', label: 'Muted text' },
    { id: 'border', label: 'Border' },
    { id: 'success', label: 'Success' },
    { id: 'warning', label: 'Warning' },
    { id: 'error', label: 'Error' }
  ];

  /* The pairs a UI colour system has to get right, with the WCAG 2.2 minimum for
     each: 4.5 for text, 3 for the parts of a control that must be seen. */
  var CHECKS = [
    ['text', 'background', 4.5, 'text'], ['text', 'surface', 4.5, 'text'],
    ['muted', 'background', 4.5, 'text'], ['muted', 'surface', 4.5, 'text'],
    ['onPrimary', 'primary', 4.5, 'text'],
    ['primary', 'background', 3, 'ui'], ['secondary', 'background', 3, 'ui'], ['accent', 'background', 3, 'ui'],
    ['success', 'background', 3, 'ui'], ['warning', 'background', 3, 'ui'], ['error', 'background', 3, 'ui']
  ];

  function systemChecks(set) {
    return CHECKS.map(function (c) {
      var fg = set[c[0]], bg = set[c[1]];
      if (!fg || !bg) return { fg: c[0], bg: c[1], need: c[2], kind: c[3], ratio: 0, pass: false, missing: true };
      var r = CH.contrast(CH.h2r(fg), CH.h2r(bg));
      return { fg: c[0], bg: c[1], need: c[2], kind: c[3], ratio: r, pass: r >= c[2] };
    });
  }

  /* A light and a dark role set from a handful of brand colours.
       brand[0] primary, brand[1] secondary, brand[2] accent. Missing ones come
       from the primary: secondary is a calm analogous neighbour, accent the
       complement.
     Light uses the brand colours exactly as given (changing a brand colour is the
     person's call, so a failing pair is reported, not silently repaired). Dark is
     a derivation, so its colours are lifted until they read on the dark ground.
     Neutrals are tinted a hair toward the primary's hue so they sit with it. */
  function buildSystem(brand) {
    var list = (brand || []).filter(isHex).map(up);
    if (!list.length) list = ['#3366CC'];
    var pOk = hexToOk(list[0]);
    var secondary = list[1] || okToHex(pOk[0], pOk[1], norm(pOk[2] + 30));
    var accent = list[2] || okToHex(clamp01(pOk[0] + 0.04), Math.max(pOk[1], 0.1), norm(pOk[2] + 180));
    var nh = pOk[2], nc = Math.min(pOk[1] * 0.12, 0.02);
    var neutral = function (L) { return okToHex(L, nc, nh); };

    var light = {
      primary: list[0], secondary: secondary, accent: accent,
      background: neutral(0.97), surface: neutral(0.995), border: neutral(0.88)
    };
    light.text = ensureContrast(neutral(0.2), light.surface, 7).hex;
    light.muted = ensureContrast(neutral(0.5), light.background, 4.5).hex;
    var sem = { success: [0.62, 0.16, 150], warning: [0.78, 0.15, 80], error: [0.58, 0.2, 27] };
    ['success', 'warning', 'error'].forEach(function (k) {
      light[k] = ensureContrast(okToHex(sem[k][0], sem[k][1], sem[k][2]), light.background, 3).hex;
    });
    light.onPrimary = up(CH.hex(CH.inkOn(CH.h2r(light.primary))));

    var dark = { background: neutral(0.17), surface: neutral(0.215), border: neutral(0.32) };
    dark.text = ensureContrast(neutral(0.95), dark.surface, 7).hex;
    dark.muted = ensureContrast(neutral(0.72), dark.surface, 4.5).hex;
    ['primary', 'secondary', 'accent'].forEach(function (k) {
      dark[k] = ensureContrast(light[k], dark.background, 4.5).hex;
    });
    ['success', 'warning', 'error'].forEach(function (k) {
      dark[k] = ensureContrast(okToHex(Math.max(sem[k][0], 0.7), sem[k][1], sem[k][2]), dark.background, 4.5).hex;
    });
    dark.onPrimary = up(CH.hex(CH.inkOn(CH.h2r(dark.primary))));
    return { light: light, dark: dark };
  }

  /* Repair every failing pair with the smallest lightness move on the foreground,
     and return exactly what changed so the interface can show it. Background and
     surface are never touched — they define the ground the others are judged on.
     "Text on primary" is recomputed from the primary rather than nudged. */
  function autoFix(system) {
    var out = { light: Object.assign({}, system.light), dark: Object.assign({}, system.dark) };
    var changes = [];
    ['light', 'dark'].forEach(function (mode) {
      var set = out[mode];
      for (var pass = 0; pass < 4; pass++) {
        var moved = false;
        systemChecks(set).forEach(function (c) {
          if (c.pass || c.missing) return;
          var role = c.fg, from = set[role], to;
          if (role === 'onPrimary') to = up(CH.hex(CH.inkOn(CH.h2r(set.primary))));
          else {
            var fix = ensureContrast(from, set[c.bg], c.need);
            to = fix.hex;
          }
          if (to !== from) { set[role] = to; moved = true; changes.push({ mode: mode, role: role, from: from, to: to }); }
        });
        // primary may have moved, so its label colour has to follow
        var ink = up(CH.hex(CH.inkOn(CH.h2r(set.primary))));
        if (set.onPrimary !== ink && systemChecks(set).filter(function (c) { return c.fg === 'onPrimary'; })[0].pass === false) {
          changes.push({ mode: mode, role: 'onPrimary', from: set.onPrimary, to: ink }); set.onPrimary = ink; moved = true;
        }
        if (!moved) break;
      }
    });
    return { system: out, changes: changes };
  }

  /* ---------- comparing colours ---------- */

  function compare(hexes) {
    var list = hexes.filter(isHex).map(up), pairs = [];
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      pairs.push({
        a: list[i], b: list[j],
        dE: CH.de00(CH.lab8(CH.h2r(list[i])), CH.lab8(CH.h2r(list[j]))),
        contrast: CH.contrast(CH.h2r(list[i]), CH.h2r(list[j]))
      });
    }
    var sorted = pairs.slice().sort(function (x, y) { return x.dE - y.dE; });
    return { colors: list, pairs: pairs, closest: sorted[0] || null, farthest: sorted[sorted.length - 1] || null };
  }

  /* How colour B differs from colour A, in the same terms the Compare mode uses.
     Returns keys, not sentences: the interface translates them. */
  function shift(hexA, hexB) {
    var A = CH.lab8(CH.h2r(hexA)), B = CH.lab8(CH.h2r(hexB));
    var C1 = Math.hypot(A[1], A[2]), C2 = Math.hypot(B[1], B[2]), changes = [], hue = null;
    if (Math.abs(B[0] - A[0]) > 1.5) changes.push(B[0] > A[0] ? 'lighter' : 'darker');
    if (Math.abs(C2 - C1) > 2) changes.push(C2 > C1 ? 'more saturated' : 'more muted');
    var h1 = Math.atan2(A[2], A[1]) * 180 / Math.PI, h2 = Math.atan2(B[2], B[1]) * 180 / Math.PI, dh = h2 - h1;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    if (Math.min(C1, C2) > 8 && Math.abs(dh) > 4) {
      hue = dh > 0 ? (h1 < 70 || h1 > 330 ? 'yellow' : h1 < 200 ? 'blue' : 'red')
                   : (h1 < 70 || h1 > 330 ? 'purple' : h1 < 200 ? 'yellow' : 'blue');
    }
    return { changes: changes, hue: hue, dE: CH.de00(A, B) };
  }

  /* ---------- palette from an image ---------- */

  /* Dominant colours of an RGBA pixel buffer.
     k-means in OKLab from a seeded k-means++ start, on at most ~6000 sampled
     pixels, so the same image always gives the same palette and a large photo
     costs the same as a small one. Near-duplicate clusters (ΔE00 under 6) merge.
     Returns [{h, share}] by share, largest first; shares sum to 1. */
  function extractPalette(data, w, h, k, opts) {
    opts = opts || {};
    k = Math.max(1, Math.min(12, k || 5));
    var total = w * h, stride = Math.max(1, Math.floor(total / 6000)), px = [];
    for (var p = 0; p < total; p += stride) {
      var o = p * 4;
      if (data[o + 3] < 128) continue;
      px.push(CH.rgb2oklab([data[o], data[o + 1], data[o + 2]]));
    }
    if (!px.length) return [];
    var rand = rng(opts.seed || 7), cents = [px[Math.floor(rand() * px.length)].slice()];
    while (cents.length < Math.min(k, px.length)) {
      var d2 = px.map(function (v) {
        var m = Infinity;
        cents.forEach(function (c) { m = Math.min(m, sq(v, c)); });
        return m;
      });
      var sum = d2.reduce(function (a, b) { return a + b; }, 0);
      if (sum === 0) break;
      var r = rand() * sum, pick = 0;
      for (; pick < d2.length - 1; pick++) { r -= d2[pick]; if (r <= 0) break; }
      cents.push(px[pick].slice());
    }
    var assign = new Array(px.length);
    for (var it = 0; it < 14; it++) {
      var sums = cents.map(function () { return [0, 0, 0, 0]; }), changed = false;
      px.forEach(function (v, i) {
        var bi = 0, bd = Infinity;
        for (var c = 0; c < cents.length; c++) { var d = sq(v, cents[c]); if (d < bd) { bd = d; bi = c; } }
        if (assign[i] !== bi) { assign[i] = bi; changed = true; }
        sums[bi][0] += v[0]; sums[bi][1] += v[1]; sums[bi][2] += v[2]; sums[bi][3]++;
      });
      cents = cents.map(function (c, i) {
        return sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c;
      });
      if (!changed) break;
    }
    var counts = cents.map(function () { return 0; });
    assign.forEach(function (a) { counts[a]++; });
    var out = cents.map(function (c, i) {
      var lin = CH.oklab2lin(c);
      return { h: CH.hex(lin.map(CH.enc)), share: counts[i] / px.length, lab: CH.labLin(lin.map(function (v) { return Math.max(0, Math.min(1, v)); })) };
    }).filter(function (c) { return c.share > 0; }).sort(function (a, b) { return b.share - a.share; });
    var merged = [];
    out.forEach(function (c) {
      var near = null;
      merged.forEach(function (m) { if (!near && CH.de00(m.lab, c.lab) < 6) near = m; });
      if (near) near.share += c.share; else merged.push(c);
    });
    var res = merged.map(function (m) { return { h: m.h, share: m.share }; });
    if (opts.sort === 'light') res.sort(function (a, b) { return hexToOk(b.h)[0] - hexToOk(a.h)[0]; });
    else if (opts.sort === 'hue') res.sort(function (a, b) { return hexToOk(a.h)[2] - hexToOk(b.h)[2]; });
    return res;
  }
  function sq(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; }

  /* ---------- naming ---------- */

  // [name, modifiers] in the engine's own vocabulary, e.g. ['Blue', 'dark, muted']
  function nameOf(hex) { return CH.describe(CH.lab8(CH.h2r(hex))); }

  return {
    hexToOk: hexToOk, okToHex: okToHex, formats: formats,
    HARMONIES: HARMONIES, harmony: harmony, generate: generate,
    SCALE_STEPS: SCALE_STEPS, scale: scale,
    contrastReport: contrastReport, ensureContrast: ensureContrast, suggest: suggest,
    ROLES: ROLES, CHECKS: CHECKS, systemChecks: systemChecks, buildSystem: buildSystem, autoFix: autoFix,
    compare: compare, shift: shift, extractPalette: extractPalette, nameOf: nameOf
  };
}));
