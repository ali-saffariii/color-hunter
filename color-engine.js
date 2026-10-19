/*! Color Hunter — colour science engine
 *  Pure, side-effect-free colour maths. No DOM, no storage, no app state.
 *  Loaded in the browser as a classic script (window.CH) and in Node for tests.
 *
 *  Assumptions, stated once and relied on everywhere below:
 *   - Working RGB space is sRGB (IEC 61966-2-1), white point D65 (2° observer).
 *   - Transfer function is the piecewise sRGB curve, not a pure 2.2 gamma.
 *   - CIELAB/LCh use D65 as reference white, so no adaptation to D50 is applied.
 *   - CMYK is a naive device-independent approximation with no ICC profile and
 *     must never be presented as a print-accurate value.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CH = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '2.0.0-b';
  var R = Math.PI / 180;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- sRGB transfer function ---------- */
  // Lookup table for 8-bit -> linear. Exact same curve as srgbToLinear below.
  var LIN = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var v = i / 255;
    LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function linearToSrgb(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055; }
  // linear 0..1 -> 8-bit, clipped
  function enc(v) { return Math.round(clamp(linearToSrgb(v), 0, 1) * 255); }

  /* ---------- matrices ---------- */
  var M_XYZ = [[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]];
  var M_RGB = [[3.2404542, -1.5371385, -0.4985314],
               [-0.9692660, 1.8760108, 0.0415560],
               [0.0556434, -0.2040259, 1.0572252]];
  // Bradford cone response, for chromatic adaptation
  var BR = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
  var BRi = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
  var D65 = [0.95047, 1, 1.08883];
  var D50 = [0.96422, 1, 0.82521];

  function mul(M, v) { return M.map(function (r) { return r[0] * v[0] + r[1] * v[1] + r[2] * v[2]; }); }

  function inv3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2],
        d = m[1][0], e = m[1][1], f = m[1][2],
        g = m[2][0], h = m[2][1], i = m[2][2];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
            [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
            [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }

  /* ---------- hex / rgb ---------- */
  function h2r(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function hex(a) { return '#' + a.map(function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
  // Accepts #rgb, #rrggbb, rrggbb. Returns [r,g,b] 0..255 or null.
  function parseHex(s) {
    if (typeof s !== 'string') return null;
    var t = s.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(t)) t = t[0] + t[0] + t[1] + t[1] + t[2] + t[2];
    if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
    return h2r('#' + t);
  }

  /* ---------- XYZ / Lab / LCh ---------- */
  function fy(t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; }
  function fyInv(t) { return Math.pow(t, 3) > 216 / 24389 ? Math.pow(t, 3) : (116 * t - 16) / (24389 / 27); }

  function xyz2lab(X, W) {
    var w = W || D65;
    var f = X.map(function (v, i) { return fy(v / w[i]); });
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
  }
  function lab2xyz(L, W) {
    var w = W || D65;
    var fy_ = (L[0] + 16) / 116, fx = L[1] / 500 + fy_, fz = fy_ - L[2] / 200;
    return [fyInv(fx) * w[0], fyInv(fy_) * w[1], fyInv(fz) * w[2]];
  }
  function lab2lch(L) {
    var C = Math.hypot(L[1], L[2]);
    var h = Math.atan2(L[2], L[1]) / R;
    if (h < 0) h += 360;
    return [L[0], C, h];
  }
  function lch2lab(L) { return [L[0], L[1] * Math.cos(L[2] * R), L[1] * Math.sin(L[2] * R)]; }

  // 8-bit sRGB triple -> linear triple
  function rgb2lin(c) { return [LIN[c[0]], LIN[c[1]], LIN[c[2]]]; }
  // linear triple -> Lab
  function labLin(l) { return xyz2lab(mul(M_XYZ, l)); }
  // 8-bit sRGB triple -> Lab
  function lab8(c) { return labLin(rgb2lin(c)); }
  // Lab -> 8-bit sRGB (clipped). oog tells you it was out of gamut.
  function lab2rgb(L) {
    var lin = mul(M_RGB, lab2xyz(L));
    return { rgb: lin.map(enc), oog: lin.some(function (v) { return v < -0.004 || v > 1.004; }) };
  }

  /* ---------- HSL / HSV (display helpers, 8-bit in) ---------- */
  function rgb2hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2, h = 0, s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function rgb2hsv(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
      h *= 60;
    }
    return [h, mx ? (d / mx) * 100 : 0, mx * 100];
  }

  /* ---------- OKLab / OKLCh (Björn Ottosson), from linear sRGB ---------- */
  function lin2oklab(l) {
    var L = 0.4122214708 * l[0] + 0.5363325363 * l[1] + 0.0514459929 * l[2];
    var M = 0.2119034982 * l[0] + 0.6806995451 * l[1] + 0.1073969566 * l[2];
    var S = 0.0883024619 * l[0] + 0.2817188376 * l[1] + 0.6299787005 * l[2];
    var l_ = Math.cbrt(L), m_ = Math.cbrt(M), s_ = Math.cbrt(S);
    return [0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_];
  }
  function oklab2lin(o) {
    var l_ = o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2];
    var m_ = o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2];
    var s_ = o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2];
    var L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_;
    return [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
            -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
            -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S];
  }
  function rgb2oklab(c) { return lin2oklab(rgb2lin(c)); }
  function oklab2lch(o) {
    var C = Math.hypot(o[1], o[2]), h = Math.atan2(o[2], o[1]) / R;
    if (h < 0) h += 360;
    return [o[0], C, h];
  }
  function oklch2lab(o) { return [o[0], o[1] * Math.cos(o[2] * R), o[1] * Math.sin(o[2] * R)]; }
  function oklch2rgb(o) {
    var lin = oklab2lin(oklch2lab(o));
    return { rgb: lin.map(enc), oog: lin.some(function (v) { return v < -0.004 || v > 1.004; }) };
  }

  /* ---------- CMYK: naive, no ICC profile, never print-accurate ---------- */
  function cmykApprox(c) {
    var k = 1 - Math.max(c[0], c[1], c[2]) / 255;
    if (k >= 1) return [0, 0, 0, 100];
    return [Math.round((1 - c[0] / 255 - k) / (1 - k) * 100),
            Math.round((1 - c[1] / 255 - k) / (1 - k) * 100),
            Math.round((1 - c[2] / 255 - k) / (1 - k) * 100),
            Math.round(k * 100)];
  }

  /* ---------- relative luminance + WCAG contrast ---------- */
  function lum(c) { var l = rgb2lin(c); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; }
  function contrast(a, b) {
    var la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // WCAG 2.2 minimums: 4.5:1 normal text, 3:1 large text (AA); 7:1 / 4.5:1 (AAA).
  function wcag(a, b) {
    var r = contrast(a, b);
    return { ratio: r, aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7, aaaLarge: r >= 4.5 };
  }
  // Which of black/white reads better on this background.
  function inkOn(c) { return contrast(c, [0, 0, 0]) >= contrast(c, [255, 255, 255]) ? [0, 0, 0] : [255, 255, 255]; }

  /* ---------- chromatic adaptation + CCT ---------- */
  // Bradford adaptation from measured white W to D65. D = degree of adaptation 0..1.
  function adapt(X, W, D) {
    var s = mul(BR, W), d = mul(BR, D65), c = mul(BR, X);
    return mul(BRi, c.map(function (v, i) { return v * (D * d[i] / s[i] + 1 - D); }));
  }
  // McCamy's approximation. Valid roughly 2000-12500K and only near the Planckian locus.
  function cct(X) {
    var t = X[0] + X[1] + X[2], x = X[0] / t, y = X[1] / t, n = (x - 0.332) / (0.1858 - y);
    return 449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33;
  }

  /* ---------- colour difference ---------- */
  function de76(A, B) { return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); }

  // CIEDE2000 (Sharma, Wu & Dalal 2005 formulation), kL=kC=kH=1.
  function de00(A, B) {
    var L1 = A[0], a1 = A[1], b1 = A[2], L2 = B[0], a2 = B[1], b2 = B[2];
    var C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
    var G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    var a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    var C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    var hp = function (x, y) { if (!x && !y) return 0; var h = Math.atan2(y, x) / R; return h < 0 ? h + 360 : h; };
    var h1 = hp(a1p, b1), h2 = hp(a2p, b2);
    var dL = L2 - L1, dC = C2p - C1p, dh = 0;
    if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    var dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * R / 2);
    var Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hb = h1 + h2;
    if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hb += hb < 360 ? 360 : -360; hb /= 2; }
    var T = 1 - 0.17 * Math.cos((hb - 30) * R) + 0.24 * Math.cos(2 * hb * R)
            + 0.32 * Math.cos((3 * hb + 6) * R) - 0.20 * Math.cos((4 * hb - 63) * R);
    var dT = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2));
    var RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    var SL = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
    var SC = 1 + 0.045 * Cbp;
    var SH = 1 + 0.015 * Cbp * T;
    var RT = -Math.sin(2 * dT * R) * RC;
    return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2)
                     + RT * (dC / SC) * (dH / SH));
  }

  /* Wording for a ΔE2000 value. Deliberately hedged: these are rules of thumb from
     the literature for flat patches side by side, not laws of human vision. */
  function deText(d) {
    return d < 1 ? 'usually indistinguishable side by side'
         : d < 2.3 ? 'very close (around the usual just-noticeable step)'
         : d < 5 ? 'close, a difference most people can see'
         : 'clearly different — no near match in this list';
  }

  /* ---------- descriptive name, derived from measured LCh (not a lookup) ---------- */
  function describe(Lab) {
    var L = Lab[0], a = Lab[1], b = Lab[2];
    var C = Math.hypot(a, b), h = Math.atan2(b, a) / R;
    if (h < 0) h += 360;
    if (C < 6) return [L > 93 ? 'White' : L > 80 ? 'Pale Grey' : L > 62 ? 'Light Grey' : L > 40 ? 'Grey' : L > 18 ? 'Charcoal' : 'Black', ''];
    var n = h < 15 || h >= 334 ? 'Magenta' : h < 42 ? 'Red' : h < 68 ? 'Orange' : h < 82 ? 'Amber'
          : h < 108 ? 'Yellow' : h < 125 ? 'Lime' : h < 170 ? 'Green' : h < 228 ? 'Teal'
          : h < 310 ? 'Blue' : 'Violet';
    var fixedL = false;
    if (/Red|Orange|Amber/.test(n) && L < 52 && C < 60) { n = 'Brown'; }
    else if (/Orange|Amber|Yellow/.test(n) && L > 72 && C < 32) { n = h < 85 ? 'Beige' : 'Cream'; fixedL = true; }
    else if (/Yellow|Lime/.test(n) && L < 62) { n = 'Olive'; }
    else if (/Magenta|Red/.test(n) && L > 70 && C < 55) { n = 'Pink'; fixedL = true; }
    else if (n === 'Blue' && L < 30) { n = 'Navy'; fixedL = true; }
    else if (n === 'Red' && L < 36 && h < 30) { n = 'Crimson'; fixedL = true; }
    var m = [];
    if (!fixedL) {
      if (L > 82) m.push('very light');
      else if (L > 66) m.push('light');
      else if (L < 22) m.push('very dark');
      else if (L < 38) m.push('dark');
    }
    if (C < 14) m.push('muted'); else if (C > 70) m.push('vivid');
    return [n, m.join(', ')];
  }

  /* ---------- least-squares 3x3 fit, used by camera calibration ----------
     Solves for P minimising sum_i w_i * || P*meas_i - ref_i ||^2 with a small
     ridge term so a degenerate capture cannot produce a wild matrix. */
  function fitP(meas, ref, w) {
    var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Y = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    meas.forEach(function (m, i) {
      for (var r = 0; r < 3; r++) for (var k = 0; k < 3; k++) A[r][k] += w[i] * m[r] * m[k];
      for (var c = 0; c < 3; c++) for (var k2 = 0; k2 < 3; k2++) Y[c][k2] += w[i] * ref[i][c] * m[k2];
    });
    var lam = 0.003;
    for (var r2 = 0; r2 < 3; r2++) { A[r2][r2] += lam; Y[r2][r2] += lam; }
    var iv = inv3(A);
    if (!iv) return null;
    return [0, 1, 2].map(function (c) {
      return [0, 1, 2].map(function (k) {
        return iv[k][0] * Y[c][0] + iv[k][1] * Y[c][1] + iv[k][2] * Y[c][2];
      });
    });
  }

  /* ---------- error statistics for a calibration ---------- */
  function errorStats(deltas) {
    var s = deltas.slice().sort(function (x, y) { return x - y; });
    var n = s.length;
    if (!n) return null;
    var mean = s.reduce(function (a, b) { return a + b; }, 0) / n;
    var q = function (p) {
      var idx = (n - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
      return s[lo] + (s[hi] - s[lo]) * (idx - lo);
    };
    return { n: n, mean: mean, median: q(0.5), p95: q(0.95), max: s[n - 1] };
  }

  /* k-fold cross-validation of the 3x3 fit: the error is measured only on patches
     the matrix was not fitted on, so it is an honest generalisation estimate and
     not the residual of fitting a model to its own training data. */
  function crossValidate(meas, ref, w, k) {
    var folds = k || 4, n = meas.length;
    if (n < folds * 2) return null;
    var deltas = [];
    for (var f = 0; f < folds; f++) {
      var trM = [], trR = [], trW = [], teIdx = [];
      for (var i = 0; i < n; i++) {
        if (i % folds === f) teIdx.push(i);
        else { trM.push(meas[i]); trR.push(ref[i]); trW.push(w ? w[i] : 1); }
      }
      var P = fitP(trM, trR, trW);
      if (!P) return null;
      for (var j = 0; j < teIdx.length; j++) {
        var t = teIdx[j];
        var pred = mul(P, meas[t]).map(function (v) { return Math.max(v, 0); });
        deltas.push(de00(labLin(pred), labLin(ref[t])));
      }
    }
    return errorStats(deltas);
  }

  /* ---------- ColorChecker Classic, 24 patches, published sRGB approximations ---------- */
  var CC_HEX = ['735244', 'C29682', '627A9D', '576C43', '8580B1', '67BDAA',
                'D67E2C', '505BA6', 'C15A63', '5E3C6C', '9DBC40', 'E0A32E',
                '383D96', '469449', 'AF363C', 'E7C71F', 'BB5695', '0885A1',
                'F3F3F2', 'C8C8C8', 'A0A0A0', '7A7A79', '555555', '343434'];

  return {
    VERSION: VERSION, DEG: R, clamp: clamp,
    LIN: LIN, srgbToLinear: srgbToLinear, linearToSrgb: linearToSrgb, enc: enc,
    M_XYZ: M_XYZ, M_RGB: M_RGB, D65: D65, D50: D50, mul: mul, inv3: inv3,
    h2r: h2r, hex: hex, parseHex: parseHex,
    fy: fy, xyz2lab: xyz2lab, lab2xyz: lab2xyz, lab2lch: lab2lch, lch2lab: lch2lab,
    rgb2lin: rgb2lin, labLin: labLin, lab8: lab8, lab2rgb: lab2rgb,
    rgb2hsl: rgb2hsl, rgb2hsv: rgb2hsv,
    lin2oklab: lin2oklab, oklab2lin: oklab2lin, rgb2oklab: rgb2oklab,
    oklab2lch: oklab2lch, oklch2lab: oklch2lab, oklch2rgb: oklch2rgb,
    cmykApprox: cmykApprox,
    lum: lum, contrast: contrast, wcag: wcag, inkOn: inkOn,
    adapt: adapt, cct: cct,
    de76: de76, de00: de00, deText: deText, describe: describe,
    fitP: fitP, errorStats: errorStats, crossValidate: crossValidate,
    CC_HEX: CC_HEX
  };
}));
