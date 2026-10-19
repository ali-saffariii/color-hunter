/*! Color Hunter — sheet templates
 *
 *  Every sheet is built as SVG text from plain data, once, and that one layout
 *  serves three outputs:
 *    - the preview shown in the app (inlined),
 *    - PDF, by printing the same inline SVG with an A4 @page,
 *    - PNG and SVG files (the SVG is rasterised on a canvas for PNG).
 *  Because it is a pure string builder it runs in Node, so layout rules —
 *  pagination, truncation, escaping, mirrored right-to-left placement — are
 *  tested without a browser.
 *
 *  Layout units: A4 pages are in millimetres (viewBox 210 x 297), the palette
 *  card is in pixels (1080 x 1350).
 *
 *  Right-to-left: positions are *logical*. "start" is the leading edge — left in
 *  English, right in Persian — and every offset is measured from it. Hex codes,
 *  ratios and other technical tokens are drawn left-to-right even inside a
 *  right-to-left page, so a colour code is never reversed.
 *
 *  Text never overflows its box: it is measured (by ctx.measure when the app
 *  supplies the loaded font, by a width estimate otherwise) and ellipsised.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./color-engine.js') : root.CH, isNode ? require('./studio.js') : root.CHStudio,
                    isNode ? require('./exporter.js') : root.CHExport);
  if (isNode) module.exports = api;
  root.CHSheets = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (CH, Studio, Exp) {
  'use strict';

  var esc = Exp.esc;
  var isHex = function (s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s); };
  var up = function (s) { return s.toUpperCase(); };
  var inkOf = function (h) { return CH.hex(CH.inkOn(CH.h2r(h))); };
  var LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  var TEMPLATES = [
    { id: 'card', label: 'Palette card', note: 'A square card to share as an image', pro: false, w: 1080, h: 1350, unit: 'px' },
    { id: 'spec', label: 'Spec sheet', note: 'Every color with its codes and contrast, one row each', pro: false, w: 210, h: 297, unit: 'mm' },
    { id: 'brand', label: 'Brand sheet', note: 'Logo, client and a hero palette, ready to hand over', pro: true, w: 210, h: 297, unit: 'mm' },
    { id: 'board', label: 'Presentation board', note: 'Full-page color fields for a client meeting', pro: true, w: 210, h: 297, unit: 'mm' },
    { id: 'system', label: 'UI system sheet', note: 'Light and dark roles with their contrast checked', pro: true, w: 210, h: 297, unit: 'mm', needs: 'system' }
  ];
  function template(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return null;
  }

  /* ---------- drawing context ---------- */

  function makeCtx(ctx) {
    ctx = ctx || {};
    var dir = ctx.dir === 'rtl' ? 'rtl' : 'ltr';
    var c = {
      dir: dir,
      font: ctx.font || (dir === 'rtl' ? 'CHfa, Tahoma, Arial, sans-serif' : 'CHen, Archivo, Helvetica, Arial, sans-serif'),
      today: String(ctx.today || ''),
      embedCss: String(ctx.embedCss || ''),
      t: function (k, v) {
        var s = ctx.t ? ctx.t(k, v) : k;
        if (!ctx.t && v) s = String(s).replace(/\{(\w+)\}/g, function (m, n) { return v[n] === undefined ? m : v[n]; });
        return s;
      },
      nameOf: ctx.nameOf || function (hex) {
        var n = Studio.nameOf(hex);
        return (n[1] ? n[1] + ' ' : '') + n[0];
      },
      // width of a string at a font size, in layout units; the app passes a real measurer
      measure: ctx.measure || function (text, size, weight) {
        var w = 0;
        for (var i = 0; i < text.length; i++) {
          var code = text.charCodeAt(i);
          w += code >= 0x0600 && code <= 0x06ff ? 0.52 : code === 32 ? 0.28 : /[A-Z0-9W@%]/.test(text[i]) ? 0.64 : 0.54;
        }
        return w * size * (weight >= 700 ? 1.06 : 1);
      }
    };
    return c;
  }

  /* ---------- text, with logical placement and fitting ---------- */

  function fit(c, str, size, weight, maxW) {
    str = String(str === undefined || str === null ? '' : str).replace(/\s+/g, ' ').trim();
    if (c.measure(str, size, weight) <= maxW) return str;
    var lo = 0, hi = str.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (c.measure(str.slice(0, mid) + '…', size, weight) <= maxW) lo = mid; else hi = mid - 1;
    }
    return str.slice(0, lo).trim() + '…';
  }

  function wrap(c, str, size, weight, maxW, maxLines) {
    var words = String(str === undefined || str === null ? '' : str).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var tryLine = cur ? cur + ' ' + words[i] : words[i];
      if (c.measure(tryLine, size, weight) <= maxW || !cur) cur = tryLine;
      else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = fit(c, lines[maxLines - 1] + ' …', size, weight, maxW);
    }
    return lines.map(function (l) { return fit(c, l, size, weight, maxW); });
  }

  /* Logical edge helpers for a content box [x0, x0 + w]:
       sx(off)  x of a point `off` in from the start edge
       ex(off)  x of a point `off` in from the end edge */
  function box(c, x0, w) {
    var rtl = c.dir === 'rtl';
    return {
      sx: function (off) { return rtl ? x0 + w - off : x0 + off; },
      ex: function (off) { return rtl ? x0 + off : x0 + w - off; },
      // left x of a rectangle `wd` wide placed `off` in from the start edge
      rx: function (off, wd) { return rtl ? x0 + w - off - wd : x0 + off; }
    };
  }

  /* o: size, weight, fill, op, logical ('start' | 'end' | 'middle'), ltr (technical token),
        spacing (letter-spacing, ignored for right-to-left script) */
  function text(c, x, y, str, o) {
    o = o || {};
    var logical = o.logical || 'start', rtl = c.dir === 'rtl';
    var tokenDir = o.ltr ? 'ltr' : c.dir;
    var wantRight = logical === 'start' ? rtl : logical === 'end' ? !rtl : null;
    var anchor = wantRight === null ? 'middle' : wantRight ? (tokenDir === 'ltr' ? 'end' : 'start') : (tokenDir === 'ltr' ? 'start' : 'end');
    var s = String(str === undefined || str === null ? '' : str);
    if (!s) return '';
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + r2(o.size || 3) + '" font-weight="' + (o.weight || 400) + '" fill="' + (o.fill || '#111') + '"' +
      (o.op !== undefined ? ' opacity="' + o.op + '"' : '') +
      ' text-anchor="' + anchor + '" direction="' + tokenDir + '"' +
      (o.spacing && !rtl ? ' letter-spacing="' + o.spacing + '"' : '') + '>' + esc(s) + '</text>';
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function line(x1, y1, x2, y2, stroke, sw, op) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (op !== undefined ? ' opacity="' + op + '"' : '') + '/>';
  }

  function svgPage(c, tpl, body, label) {
    var size = tpl.unit === 'mm' ? ' width="' + tpl.w + 'mm" height="' + tpl.h + 'mm"' : ' width="' + tpl.w + '" height="' + tpl.h + '"';
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + tpl.w + ' ' + tpl.h + '"' + size +
      ' font-family="' + esc(c.font) + '" role="img" aria-label="' + esc(label) + '">' +
      (c.embedCss ? '<style>' + c.embedCss.replace(/[<&\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') + '</style>' : '') +
      rect(0, 0, tpl.w, tpl.h, '#FFFFFF') + body + '</svg>';
  }

  function logoImage(logo, x, y, w, h) {
    if (typeof logo !== 'string' || !LOGO_RE.test(logo)) return '';
    return '<image x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" preserveAspectRatio="xMidYMid meet" href="' + logo + '"/>';
  }

  /* ---------- shared pieces ---------- */

  function cleanColors(data) {
    return (data.colors || []).filter(function (c) { return c && isHex(c.h); }).map(function (c) {
      return { h: up(c.h), name: c.name || '', p: c.p || '', r: c.r || '', note: c.note || '', cat: c.cat || '' };
    });
  }

  function footer(c, tpl, b, y, page, pages) {
    var t = function (k, v) { return c.t(k, v); };
    return line(b.sx(0), y - 5, b.ex(0), y - 5, '#111', 0.15, 0.5) +
      text(c, b.sx(0), y, t('Prepared with Color Hunter'), { size: 2.6, fill: '#111', op: 0.55 }) +
      text(c, b.ex(0), y, (c.today ? c.today + '   ' : '') + t('Page {n} of {total}', { n: page, total: pages }), { logical: 'end', size: 2.6, fill: '#111', op: 0.55 });
  }

  function ratioLabel(r) { return (Math.round(r * 10) / 10).toFixed(1); }
  function grade(r) { return r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA Large' : ''; }

  /* ---------- Spec sheet ---------- */

  function specSheet(data, c) {
    var tpl = template('spec'), t = function (k, v) { return c.t(k, v); };
    var colors = cleanColors(data), M = 16, W = tpl.w - M * 2, b = box(c, M, W);
    var ROW = 19, TOP = 52, BOTTOM = 270, per = Math.floor((BOTTOM - TOP) / ROW);
    var total = Math.max(1, Math.ceil(colors.length / per)), pages = [];
    for (var p = 0; p < total; p++) {
      var s = '';
      s += text(c, b.sx(0), 24, fit(c, data.title || t('Palette'), 9, 800, W * 0.7), { size: 9, weight: 800 });
      var sub = [data.subtitle, data.client].filter(Boolean).join('  ·  ');
      if (sub) s += text(c, b.sx(0), 31, fit(c, sub, 3.6, 500, W * 0.7), { size: 3.6, weight: 500, op: 0.7 });
      s += text(c, b.ex(0), 24, t('Spec sheet'), { logical: 'end', size: 3, weight: 700, spacing: 0.4, op: 0.6 });
      s += line(b.sx(0), 38, b.ex(0), 38, '#111', 0.5);
      // column heads
      var heads = [[22, 'Name'], [70, 'Code'], [108, 'Closest match'], [140, 'Contrast']];
      heads.forEach(function (h) { s += text(c, b.sx(h[0]), 46, t(h[1]), { size: 2.5, weight: 700, spacing: 0.3, op: 0.55 }); });
      s += line(b.sx(0), 49, b.ex(0), 49, '#111', 0.15);
      var slice = colors.slice(p * per, (p + 1) * per);
      slice.forEach(function (col, i) {
        var y = TOP + i * ROW, rgb = CH.h2r(col.h);
        s += rect(b.rx(0, 15), y, 15, 15, col.h, ' stroke="#111" stroke-opacity=".25" stroke-width=".2"');
        var nm = col.name || c.nameOf(col.h);
        s += text(c, b.sx(22), y + 5.5, fit(c, nm, 3.8, 700, 46), { size: 3.8, weight: 700 });
        var sec = col.cat ? t(catLabel(col.cat)) : (col.note || '');
        if (sec) s += text(c, b.sx(22), y + 10.5, fit(c, sec, 2.8, 400, 46), { size: 2.8, op: 0.6 });
        s += text(c, b.sx(70), y + 5.5, col.h, { ltr: true, size: 3.8, weight: 700 });
        s += text(c, b.sx(70), y + 10.5, 'RGB ' + rgb.join(' '), { ltr: true, size: 2.7, op: 0.65 });
        var cm = CH.cmykApprox(rgb);
        s += text(c, b.sx(70), y + 14, 'CMYK~ ' + cm.join(' '), { ltr: true, size: 2.4, op: 0.5 });
        if (col.p || col.r) {
          if (col.p) s += text(c, b.sx(108), y + 5.5, fit(c, 'Pantone ' + col.p, 3.2, 600, 31), { ltr: true, size: 3.2, weight: 600 });
          if (col.r) s += text(c, b.sx(108), y + 10.5, fit(c, col.r, 3, 500, 31), { ltr: true, size: 3, op: 0.75 });
        } else s += text(c, b.sx(108), y + 5.5, '—', { size: 3.2, op: 0.4 });
        [['#FFFFFF', 0], ['#000000', 1]].forEach(function (bgc) {
          var ratio = CH.contrast(rgb, CH.h2r(bgc[0])), x = 140 + bgc[1] * 18;
          s += rect(b.rx(x, 7.4), y + 0.5, 7.4, 7.4, bgc[0], ' stroke="#111" stroke-opacity=".3" stroke-width=".2"');
          s += text(c, b.sx(x + 3.7), y + 5.9, 'A', { logical: 'middle', size: 4, weight: 800, fill: col.h });
          s += text(c, b.sx(x + 8.4), y + 3.6, ratioLabel(ratio), { ltr: true, size: 2.9, weight: 700 });
          s += text(c, b.sx(x + 8.4), y + 7, grade(ratio) || '—', { ltr: true, size: 2, op: 0.6 });
        });
        s += line(b.sx(0), y + ROW - 2, b.ex(0), y + ROW - 2, '#111', 0.1, 0.35);
      });
      s += footer(c, tpl, b, 288, p + 1, total);
      pages.push(svgPage(c, tpl, s, (data.title || t('Palette')) + ' — ' + t('Spec sheet')));
    }
    return pages;
  }

  function catLabel(id) {
    return { primary: 'Primary', secondary: 'Secondary', accent: 'Accent', background: 'Background', surface: 'Surface', text: 'Text',
             border: 'Border', success: 'Success', warning: 'Warning', error: 'Error', neutral: 'Neutral', other: 'Other' }[id] || 'Other';
  }

  /* ---------- Brand sheet ---------- */

  function brandSheet(data, c) {
    var tpl = template('brand'), t = function (k, v) { return c.t(k, v); };
    var colors = cleanColors(data), M = 16, W = tpl.w - M * 2, b = box(c, M, W);
    var s = '';
    // identity block
    var hasLogo = typeof data.logo === 'string' && LOGO_RE.test(data.logo);
    if (hasLogo) s += logoImage(data.logo, b.rx(0, 40), 16, 40, 22);
    var tx = hasLogo ? 48 : 0, tw = W - tx;
    s += text(c, b.sx(tx), 26, fit(c, data.title || t('Palette'), 11, 800, tw), { size: 11, weight: 800 });
    if (data.subtitle) s += text(c, b.sx(tx), 33, fit(c, data.subtitle, 4, 500, tw), { size: 4, weight: 500, op: 0.7 });
    if (data.client) s += text(c, b.sx(tx), 40, fit(c, t('Client') + ': ' + data.client, 3.8, 600, tw), { size: 3.8, weight: 600 });
    s += line(b.sx(0), 46, b.ex(0), 46, '#111', 0.5);
    var y = 54;
    if (data.desc) {
      var dl = wrap(c, data.desc, 3.4, 400, W, 4);
      dl.forEach(function (l, i) { s += text(c, b.sx(0), y + i * 5, l, { size: 3.4, op: 0.85 }); });
      y += dl.length * 5 + 6;
    }
    // hero swatches: up to six, three per row
    var hero = colors.slice(0, 6), rest = colors.slice(6, 22), cw = (W - 8) / 3, chh = hero.length > 3 ? 54 : 74;
    hero.forEach(function (col, i) {
      var col0 = i % 3, row0 = Math.floor(i / 3), x = col0 * (cw + 4), yy = y + row0 * (chh + 4), ink = inkOf(col.h);
      s += rect(b.rx(x, cw), yy, cw, chh, col.h, ' stroke="#111" stroke-opacity=".15" stroke-width=".2"');
      s += text(c, b.sx(x + 4), yy + chh - 14, fit(c, col.name || c.nameOf(col.h), 3.6, 700, cw - 8), { size: 3.6, weight: 700, fill: ink });
      s += text(c, b.sx(x + 4), yy + chh - 8, col.h, { ltr: true, size: 4.4, weight: 800, fill: ink });
      var rgb = CH.h2r(col.h);
      s += text(c, b.sx(x + 4), yy + chh - 3.6, 'RGB ' + rgb.join(' '), { ltr: true, size: 2.6, fill: ink, op: 0.8 });
    });
    y += Math.ceil(hero.length / 3) * (chh + 4) + 4;
    // proportion bar
    if (colors.length > 1) {
      var n = Math.min(colors.length, 22), bw = W / n;
      colors.slice(0, n).forEach(function (col, i) { s += rect(b.rx(i * bw, bw + 0.05), y, bw + 0.05, 8, col.h); });
      y += 14;
    }
    // remaining colours as chips
    if (rest.length) {
      s += text(c, b.sx(0), y, t('Supporting colors'), { size: 2.6, weight: 700, spacing: 0.3, op: 0.55 });
      y += 5;
      rest.forEach(function (col, i) {
        var x = (i % 4) * (W / 4), yy = y + Math.floor(i / 4) * 11;
        s += rect(b.rx(x, 8), yy, 8, 8, col.h, ' stroke="#111" stroke-opacity=".25" stroke-width=".2"');
        s += text(c, b.sx(x + 10.5), yy + 3.6, col.h, { ltr: true, size: 3, weight: 700 });
        s += text(c, b.sx(x + 10.5), yy + 7, fit(c, col.name || c.nameOf(col.h), 2.4, 400, W / 4 - 12), { size: 2.4, op: 0.6 });
      });
    }
    s += footer(c, tpl, b, 288, 1, 1);
    return [svgPage(c, tpl, s, (data.title || t('Palette')) + ' — ' + t('Brand sheet'))];
  }

  /* ---------- Presentation board ---------- */

  function boardSheet(data, c) {
    var tpl = template('board'), t = function (k, v) { return c.t(k, v); };
    var colors = cleanColors(data).slice(0, 12), n = Math.max(colors.length, 1), s = '';
    var bh = tpl.h / n;
    colors.forEach(function (col, i) {
      var y = i * bh, ink = inkOf(col.h), b = box(c, 14, tpl.w - 28);
      s += rect(0, y, tpl.w, bh + 0.05, col.h);
      var base = y + bh - Math.min(bh * 0.28, 9);
      s += text(c, b.sx(0), base - 6.5, fit(c, col.name || c.nameOf(col.h), 4, 700, 110), { size: 4, weight: 700, fill: ink });
      s += text(c, b.sx(0), base, col.h, { ltr: true, size: 6.2, weight: 800, fill: ink });
      var codes = [col.p ? 'Pantone ' + col.p : '', col.r].filter(Boolean).join('   ');
      if (codes) s += text(c, b.ex(0), base, fit(c, codes, 3.2, 600, 70), { logical: 'end', ltr: true, size: 3.2, weight: 600, fill: ink, op: 0.85 });
    });
    // title card in the top corner, on white so it reads over any colour
    var bx = box(c, 14, tpl.w - 28), cardW = 96;
    s += rect(bx.rx(0, cardW), 14, cardW, data.client ? 30 : 24, '#FFFFFF', ' stroke="#111" stroke-width=".3"');
    s += text(c, bx.sx(5), 25, fit(c, data.title || t('Palette'), 6, 800, cardW - 10), { size: 6, weight: 800 });
    var sub = data.subtitle || '';
    if (sub) s += text(c, bx.sx(5), 31, fit(c, sub, 3.2, 500, cardW - 10), { size: 3.2, op: 0.7 });
    if (data.client) s += text(c, bx.sx(5), 38, fit(c, t('Client') + ': ' + data.client, 3.2, 600, cardW - 10), { size: 3.2, weight: 600 });
    s += text(c, bx.ex(0), 290, t('Prepared with Color Hunter'), { logical: 'end', size: 2.4, fill: '#FFFFFF', op: 0.9 });
    return [svgPage(c, tpl, s, (data.title || t('Palette')) + ' — ' + t('Presentation board'))];
  }

  /* ---------- UI system sheet ---------- */

  function systemSheet(data, c) {
    var tpl = template('system'), t = function (k, v) { return c.t(k, v); };
    var roles = data.roles || { light: {}, dark: {} }, M = 14, W = tpl.w - M * 2, b = box(c, M, W), s = '';
    s += text(c, b.sx(0), 22, fit(c, data.title || t('Palette'), 9, 800, W * 0.72), { size: 9, weight: 800 });
    var sub = [data.subtitle, data.client].filter(Boolean).join('  ·  ');
    if (sub) s += text(c, b.sx(0), 28.5, fit(c, sub, 3.6, 500, W * 0.72), { size: 3.6, weight: 500, op: 0.7 });
    s += text(c, b.ex(0), 22, t('UI system sheet'), { logical: 'end', size: 3, weight: 700, spacing: 0.4, op: 0.6 });
    s += line(b.sx(0), 34, b.ex(0), 34, '#111', 0.5);
    var colW = (W - 8) / 2, summary = [];
    ['light', 'dark'].forEach(function (mode, mi) {
      var set = roles[mode] || {}, x0 = mi * (colW + 8), cb = box(c, M + (c.dir === 'rtl' ? W - x0 - colW : x0), colW);
      var checks = Studio.systemChecks(set), misses = checks.filter(function (k) { return !k.pass; }).length;
      summary.push(misses);
      s += text(c, cb.sx(0), 42, t(mode === 'light' ? 'Light' : 'Dark'), { size: 3.2, weight: 800, spacing: 0.5 });
      s += text(c, cb.ex(0), 42, misses ? t('{n} pairs miss the minimum', { n: misses }) : t('Every pair passes'), { logical: 'end', size: 2.6, weight: 600, op: 0.7 });
      // a small mock interface painted with the roles
      var bg = set.background || '#FFFFFF', sf = set.surface || bg, tx = set.text || '#111111', mu = set.muted || tx,
          pr = set.primary || '#3366CC', onp = set.onPrimary || '#FFFFFF', bd = set.border || '#CCCCCC';
      s += rect(cb.rx(0, colW), 46, colW, 52, isHex(bg) ? bg : '#FFFFFF', ' stroke="' + (isHex(bd) ? bd : '#CCCCCC') + '" stroke-width=".3"');
      s += rect(cb.rx(5, colW - 10), 51, colW - 10, 30, isHex(sf) ? sf : '#FFFFFF', ' stroke="' + (isHex(bd) ? bd : '#CCCCCC') + '" stroke-width=".3"');
      s += text(c, cb.sx(9), 59, fit(c, t('Sample heading'), 4, 800, colW - 18), { size: 4, weight: 800, fill: isHex(tx) ? tx : '#111' });
      s += text(c, cb.sx(9), 65, fit(c, t('Supporting text sits in the muted color.'), 2.8, 400, colW - 18), { size: 2.8, fill: isHex(mu) ? mu : '#555' });
      s += rect(cb.rx(9, 26), 69, 26, 8, isHex(pr) ? pr : '#3366CC', ' rx="1.2"');
      s += text(c, cb.sx(9 + 13), 74.2, fit(c, t('Button'), 3, 700, 22), { logical: 'middle', size: 3, weight: 700, fill: isHex(onp) ? onp : '#FFF' });
      [['secondary', 38], ['accent', 48]].forEach(function (sw) {
        if (isHex(set[sw[0]])) s += rect(cb.rx(sw[1] + 4, 8), 69, 8, 8, set[sw[0]], ' rx="1.2"');
      });
      [['success', 0], ['warning', 1], ['error', 2]].forEach(function (sm) {
        if (isHex(set[sm[0]])) s += rect(cb.rx(9 + sm[1] * 12, 9), 86, 9, 5, set[sm[0]], ' rx="1"');
      });
      // role list
      Studio.ROLES.forEach(function (role, i) {
        var y = 106 + i * 8.6, h = set[role.id];
        if (!isHex(h)) return;
        s += rect(cb.rx(0, 6.4), y - 4.6, 6.4, 6.4, h, ' stroke="#111" stroke-opacity=".3" stroke-width=".2"');
        s += text(c, cb.sx(9), y, fit(c, t(role.label), 3, 600, colW - 40), { size: 3, weight: 600 });
        s += text(c, cb.ex(0), y, h, { logical: 'end', ltr: true, size: 3, weight: 700 });
      });
      // checks
      s += text(c, cb.sx(0), 214, t('Contrast checks'), { size: 2.6, weight: 700, spacing: 0.3, op: 0.55 });
      checks.forEach(function (k, i) {
        var y = 220 + i * 5.2, label = t(roleLabel(k.fg)) + ' / ' + t(roleLabel(k.bg));
        s += text(c, cb.sx(0), y, fit(c, label, 2.7, 500, colW - 34), { size: 2.7, weight: 500 });
        s += text(c, cb.ex(11), y, ratioLabel(k.ratio) + ':1', { logical: 'end', ltr: true, size: 2.7, weight: 700 });
        s += text(c, cb.ex(0), y, k.pass ? t('Pass') : t('Miss'), { logical: 'end', size: 2.5, weight: 800, fill: k.pass ? '#111' : '#B00020' });
      });
    });
    s += footer(c, tpl, b, 288, 1, 1);
    return [svgPage(c, tpl, s, (data.title || t('Palette')) + ' — ' + t('UI system sheet'))];
  }
  function roleLabel(id) {
    for (var i = 0; i < Studio.ROLES.length; i++) if (Studio.ROLES[i].id === id) return Studio.ROLES[i].label;
    return id;
  }

  /* ---------- Palette card (1080 x 1350 px) ---------- */

  function cardSheet(data, c) {
    var tpl = template('card'), t = function (k, v) { return c.t(k, v); };
    var colors = cleanColors(data).slice(0, 8), n = Math.max(colors.length, 1), P = 64, W = tpl.w - P * 2, b = box(c, P, W), s = '';
    s += rect(0, 0, tpl.w, tpl.h, '#0A0A0A');
    s += text(c, b.sx(0), 96, 'COLOR HUNTER', { size: 28, weight: 800, fill: '#FFFFFF', spacing: 3, op: 0.7 });
    if (c.today) s += text(c, b.ex(0), 96, c.today, { logical: 'end', ltr: true, size: 28, weight: 600, fill: '#FFFFFF', op: 0.55 });
    s += text(c, b.sx(0), 190, fit(c, data.title || t('Palette'), 80, 800, W), { size: 80, weight: 800, fill: '#FFFFFF' });
    var sub = [data.subtitle, data.client].filter(Boolean).join('  ·  ');
    if (sub) s += text(c, b.sx(0), 244, fit(c, sub, 32, 500, W), { size: 32, weight: 500, fill: '#FFFFFF', op: 0.65 });
    var top = 290, bottom = 1230, gap = 10, cw = (W - gap * (n - 1)) / n;
    colors.forEach(function (col, i) {
      var x = i * (cw + gap), ink = inkOf(col.h);
      s += rect(b.rx(x, cw), top, cw, bottom - top, col.h);
      var big = n <= 4;
      if (big) {
        s += text(c, b.sx(x + 22), bottom - 70, col.h, { ltr: true, size: 38, weight: 800, fill: ink });
        s += text(c, b.sx(x + 22), bottom - 28, fit(c, col.name || c.nameOf(col.h), 28, 500, cw - 44), { size: 28, weight: 500, fill: ink, op: 0.85 });
      } else {
        // narrow strips: the code is written along the strip, start edge up
        var tx = b.sx(x + cw / 2);
        s += '<text transform="translate(' + r2(tx + 11) + ' ' + (bottom - 28) + ') rotate(-90)" font-size="30" font-weight="800" fill="' + ink + '" direction="ltr" text-anchor="start">' + esc(col.h) + '</text>';
      }
    });
    s += text(c, b.sx(0), 1300, t('Prepared with Color Hunter'), { size: 24, weight: 600, fill: '#FFFFFF', op: 0.45 });
    return [svgPage(c, tpl, s, (data.title || t('Palette')) + ' — ' + t('Palette card'))];
  }

  /* ---------- entry points ---------- */

  var BUILDERS = { card: cardSheet, spec: specSheet, brand: brandSheet, board: boardSheet, system: systemSheet };

  /* data: { title, subtitle, client, desc, logo, colors:[{h,name,p,r,note,cat}], roles }
     ctx:  { t, dir, font, today, measure, nameOf, embedCss }
     Returns { template, pages:[svg], w, h, unit }. */
  function render(id, data, ctx) {
    var tpl = template(id);
    if (!tpl) throw new Error('unknown-template');
    var c = makeCtx(ctx), d = data || {};
    if (tpl.needs === 'system') {
      var r = d.roles;
      if (!r || !Object.keys(r.light || {}).length) throw new Error('needs-system');
    } else if (!cleanColors(d).length) throw new Error('no-colors');
    return { template: id, pages: BUILDERS[id](d, c), w: tpl.w, h: tpl.h, unit: tpl.unit };
  }

  return { TEMPLATES: TEMPLATES, template: template, render: render, fit: function (ctx, s, size, weight, w) { return fit(makeCtx(ctx), s, size, weight, w); } };
}));
