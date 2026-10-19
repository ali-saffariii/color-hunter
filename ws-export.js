/*! Color Hunter — Export screens
 *
 *  Two kinds of output from the same source (a project, a palette, the Inbox, or
 *  the palette open in the Studio):
 *    Sheets   a palette card, spec sheet, brand sheet, presentation board and UI
 *             system sheet — previewed live, downloaded as PDF, PNG or SVG.
 *    Files    CSS variables, design tokens, system CSS, SVG swatches and the whole
 *             project as a file.
 *  The preview is the real layout (the same SVG that gets printed or rasterised).
 *  A Pro-only choice still previews, marked as a preview; only the download is held
 *  back, and what holds it back is a plain gate, not a hidden file.
 */
(function (root, factory) {
  factory(root.CHUI, root.CHI18N, root.CHData, root.CHWS, root.CHSheets, root.CHExport, root.CHPro, root.CH);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (UI, I18N, Data, WS, Sheets, Exp, Pro, CH) {
  'use strict';

  var el = UI.el, fill = UI.fill, icon = UI.icon;
  var t = function (k, v) { return I18N.t(k, v); };
  var app = function () { return WS.app(); };

  var FILES = [
    { id: 'css', label: 'CSS variables', note: 'Custom properties to paste into a stylesheet', ext: 'css', mime: 'text/css', kind: 'css-variables' },
    { id: 'tokens', label: 'Design tokens', note: 'JSON in the W3C design-token format', ext: 'json', mime: 'application/json', kind: 'design-tokens', pro: 'export.tokens' },
    { id: 'systemCss', label: 'System CSS', note: 'Light and dark roles, following the device or a data-theme switch', ext: 'css', mime: 'text/css', kind: 'system-css', pro: 'export.systemCss', needs: 'roles' },
    { id: 'svg', label: 'SVG swatches', note: 'A row of labelled swatches as a vector file', ext: 'svg', mime: 'image/svg+xml', kind: 'swatches' }
  ];
  var NOTATIONS = [['hex', 'HEX'], ['rgb', 'RGB'], ['hsl', 'HSL'], ['oklch', 'OKLCH']];

  var st = { src: null, mode: 'sheet', tpl: 'card', file: 'css', fmt: 'hex', over: {}, overKey: '', studio: null, busy: false };
  var host = {};
  var fontCache = null;

  function pro() { return app().pro; }
  function allowed(feature) { return !feature || pro().gate(feature).ok; }
  function cn(n) { return t(n === 1 ? '{n} color' : '{n} colors', { n: n }); }
  function nameOfHex(h) { return app().tName(app().describe(h).name); }

  /* ---------- sources ---------- */

  function pidOf(src) {
    if (!src) return '';
    if (src.kind === 'proj') return src.id;
    if (src.kind === 'pal') { var q = Data.palette(src.id); return q ? q.pid : ''; }
    if (src.kind === 'studio') return st.studio && st.studio.pid || '';
    return '';
  }
  function describeColor(h) { var d = app().describe(h); return { p: d.p, r: d.r }; }

  /* Everything a sheet or file needs, assembled from the current source. */
  function build() {
    var src = st.src, out = { title: '', subtitle: '', client: '', desc: '', logo: '', colors: [], roles: null, key: '', label: '' };
    if (!src) return null;
    var proj = null;
    if (src.kind === 'studio' && st.studio) {
      var s = st.studio;
      proj = s.pid ? Data.project(s.pid) : null;
      out.title = s.name; out.roles = s.roles;
      out.colors = s.colors.map(function (c) { var d = describeColor(c.h); return { h: c.h, name: nameOfHex(c.h), p: d.p, r: d.r }; });
      out.label = t('Studio palette') + ' · ' + s.name; out.key = 'studio';
    } else if (src.kind === 'pal') {
      var q = Data.palette(src.id);
      if (!q) return null;
      proj = q.pid ? Data.project(q.pid) : null;
      out.title = q.name; out.roles = q.roles;
      out.colors = q.colors.map(function (c) {
        var d = describeColor(c.h);
        return { h: c.h, name: q.kind === 'system' ? '' : nameOfHex(c.h), p: d.p, r: d.r, cat: c.cat || '' };
      });
      out.label = t('Palette') + ' · ' + q.name; out.key = 'pal:' + q.id;
    } else if (src.kind === 'proj') {
      proj = Data.project(src.id);
      if (!proj) return null;
      out.title = proj.name;
      out.colors = Data.colorsOf(proj.id).map(function (c) { return { h: c.h, name: app().tName(c.n), p: c.p, r: c.r, note: c.note, cat: c.cat }; });
      var sysPal = Data.palettesOf(proj.id).filter(function (q) { return q.kind === 'system' && q.roles; })[0];
      if (sysPal) out.roles = sysPal.roles;
      out.label = t('Project') + ' · ' + proj.name; out.key = 'proj:' + proj.id;
    } else {
      out.title = t('Inbox');
      out.colors = Data.inbox().map(function (c) { return { h: c.h, name: app().tName(c.n), p: c.p, r: c.r, note: c.note, cat: c.cat }; });
      out.label = t('Inbox'); out.key = 'inbox';
    }
    if (proj) { out.subtitle = src.kind === 'proj' ? '' : proj.name; out.client = proj.client; out.desc = proj.desc; out.logo = proj.logo; }
    if (st.overKey !== out.key) { st.over = {}; st.overKey = out.key; }
    ['title', 'subtitle', 'client', 'desc', 'logo'].forEach(function (k) { if (st.over[k] !== undefined) out[k] = st.over[k]; });
    out.hasProject = !!proj; out.pid = proj ? proj.id : '';
    return out;
  }

  function defaultSource() {
    var a = Data.active();
    if (a && Data.project(a)) return { kind: 'proj', id: a };
    var live = Data.projects().filter(function (p) { return !p.archived; });
    if (Data.inbox().length || !live.length) return { kind: 'inbox' };
    return { kind: 'proj', id: live[0].id };
  }
  function valid(src) {
    if (!src) return false;
    if (src.kind === 'proj') return !!Data.project(src.id);
    if (src.kind === 'pal') return !!Data.palette(src.id);
    if (src.kind === 'studio') return !!st.studio;
    return true;
  }

  function enter(p) {
    if (p.studio) { st.studio = p.studio; st.src = { kind: 'studio' }; }
    else if (p.palette && Data.palette(p.palette)) st.src = { kind: 'pal', id: p.palette };
    else if (p.pid !== undefined && p.pid) st.src = { kind: 'proj', id: p.pid };
    else if (p.pid === '') st.src = { kind: 'inbox' };
    if (!valid(st.src)) st.src = defaultSource();
    if (p.mode) st.mode = p.mode;
  }

  function pickSource() {
    var items = [];
    if (st.studio) items.push({ value: 'studio', label: t('Studio palette'), sub: st.studio.name + ' · ' + cn(st.studio.colors.length), colors: st.studio.colors.map(function (c) { return c.h; }), on: st.src && st.src.kind === 'studio' });
    items.push({ value: 'inbox', label: t('Inbox'), sub: cn(Data.inbox().length), icon: 'layers', on: st.src && st.src.kind === 'inbox', disabled: !Data.inbox().length });
    Data.projects().filter(function (p) { return !p.archived; }).forEach(function (p) {
      items.push({ value: 'proj:' + p.id, label: p.name, sub: t('All colors') + ' · ' + cn(Data.colorsOf(p.id).length), colors: Data.identity(p.id, 3), on: st.src && st.src.kind === 'proj' && st.src.id === p.id });
      Data.palettesOf(p.id).forEach(function (q) {
        items.push({ value: 'pal:' + q.id, label: q.name, sub: t('Palette') + ' · ' + p.name, colors: q.colors.map(function (c) { return c.h; }).slice(0, 5), on: st.src && st.src.kind === 'pal' && st.src.id === q.id });
      });
    });
    Data.palettes().filter(function (q) { return !q.pid; }).forEach(function (q) {
      items.push({ value: 'pal:' + q.id, label: q.name, sub: t('Palette') + ' · ' + t('Inbox'), colors: q.colors.map(function (c) { return c.h; }).slice(0, 5), on: st.src && st.src.kind === 'pal' && st.src.id === q.id });
    });
    UI.pick({ title: t('What to export'), items: items }).then(function (v) {
      if (v === undefined) return;
      st.src = v === 'studio' ? { kind: 'studio' } : v === 'inbox' ? { kind: 'inbox' } : v.indexOf('proj:') === 0 ? { kind: 'proj', id: v.slice(5) } : { kind: 'pal', id: v.slice(4) };
      WS.refresh({ keepScroll: false });
    });
  }

  /* ---------- fonts for rasterised files ---------- */

  /* An SVG drawn as an image cannot load the page's fonts. The two files the
     person put beside the app (fa.* and en.*) are read here and embedded in the
     SVG, so a PNG or SVG file looks like the preview. Without them the file uses
     the device's own fonts, and the screen says so. */
  function loadFonts() {
    if (fontCache) return fontCache;
    var tasks = ['fa', 'en'].map(function (fam) {
      var exts = [['woff2', 'font/woff2'], ['woff', 'font/woff'], ['ttf', 'font/ttf'], ['otf', 'font/otf']];
      function tryAt(i) {
        if (i >= exts.length) return Promise.resolve('');
        return fetch(fam + '.' + exts[i][0], { cache: 'force-cache' }).then(function (r) {
          var ct = r.headers.get('content-type') || '';
          if (!r.ok || /text\/html/i.test(ct)) return tryAt(i + 1);
          return r.arrayBuffer().then(function (buf) {
            if (buf.byteLength < 200 || buf.byteLength > 6 * 1024 * 1024) return tryAt(i + 1);
            var bytes = new Uint8Array(buf), s = '';
            for (var k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
            return '@font-face{font-family:CH' + fam + ';font-weight:100 900;src:url(data:' + exts[i][1] + ';base64,' + btoa(s) + ')}';
          });
        }, function () { return tryAt(i + 1); });
      }
      return tryAt(0);
    });
    fontCache = Promise.all(tasks).then(function (r) { return { css: r.join(''), has: r.some(Boolean) }; });
    return fontCache;
  }

  /* ---------- sheet rendering ---------- */

  var measureCtx = null;
  function measurer() {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    var rtl = I18N.get() === 'fa';
    var fam = rtl ? 'CHfa, Tahoma, Arial, sans-serif' : 'CHen, Archivo, Helvetica, Arial, sans-serif';
    return function (text, size, weight) {
      measureCtx.font = (weight || 400) + ' 100px ' + fam;
      return measureCtx.measureText(String(text)).width / 100 * size;
    };
  }
  function sheetCtx(extra) {
    var rtl = I18N.get() === 'fa';
    return Object.assign({
      t: t, dir: rtl ? 'rtl' : 'ltr', today: UI.date(Date.now()), measure: measurer(),
      nameOf: function (h) { return nameOfHex(h); }
    }, extra || {});
  }
  function renderSheet(data, extra) { return Sheets.render(st.tpl, data, sheetCtx(extra)); }

  var svgNode = UI.svgNode;

  function drawStage() {
    if (!host.stage) return;
    var data = build();
    if (!data) { fill(host.stage, UI.error({ title: t('Nothing to export here'), text: t('Pick another source.') })); return; }
    var locked = !allowed(Pro.sheetFeature(st.tpl));
    var res;
    try { res = renderSheet(data); }
    catch (e) {
      var needs = e && e.message === 'needs-system';
      fill(host.stage, el('div', { style: 'padding:0 16px;width:100%' }, UI.empty({
        art: 'palette', title: needs ? t('This sheet needs a UI color system') : t('There are no colors to export'),
        text: needs ? t('Build one in the Studio, save it, then come back. Light and dark roles are what this sheet shows.') : t('Add colors to this source first.'),
        actions: needs ? [UI.button({ icon: 'system', label: t('Open the Studio'), kind: 'primary', onclick: function () { WS.go('studio', { fresh: false }); } })] : [] })));
      return;
    }
    var pages;
    try { pages = res.pages.map(function (s) { return svgNode(s); }); }
    catch (e2) { fill(host.stage, UI.error({ title: t('This preview could not be drawn.'), text: t('Nothing was changed.') })); return; }
    fill(host.stage, el('div', { cls: 'pages' }, pages.map(function (n, i) {
      return el('div', { cls: 'page' + (locked ? ' pvmark' : ''), 'data-mark': locked ? t('Pro preview') : null, role: 'group', 'aria-label': t('Page {n} of {total}', { n: i + 1, total: pages.length }) }, n);
    })));
    if (host.pages) host.pages.textContent = res.pages.length > 1 ? t('{n} pages', { n: res.pages.length }) : t('1 page');
  }
  var drawStageSoon = UI.debounce(drawStage, 220);

  /* ---------- downloads ---------- */

  function gateTpl() {
    var f = Pro.sheetFeature(st.tpl);
    if (allowed(f)) return true;
    WS.upsell(f);
    return false;
  }
  function baseName(data) { return data.title || t('Palette'); }

  function downloadPdf() {
    if (!gateTpl()) return;
    var data = build(), res;
    try { res = renderSheet(data); } catch (e) { return app().toast(t('That could not be prepared.')); }
    var page;
    try { page = res.pages.map(function (s) { return el('div', { cls: 'sheetpage' }, svgNode(s)); }); } catch (e2) { return app().toast(t('That could not be prepared.')); }
    fill(document.getElementById('print'), page);
    app().toast(t('Choose “Save as PDF” in the print window.'), 3600);
    setTimeout(function () { window.print(); }, 160);
  }

  function rasterise(svg, w, h) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
          c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('blob')); }, 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('image')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function sequence(items, fn) {
    return items.reduce(function (p, it, i) { return p.then(function () { return fn(it, i); }); }, Promise.resolve());
  }
  function downloadImages(kind) {
    if (!gateTpl() || st.busy) return;
    var data = build(), res, tpl = Sheets.template(st.tpl);
    st.busy = true; WS.refresh({ keepScroll: true });
    loadFonts().then(function (f) {
      try { res = renderSheet(data, { embedCss: f.css }); } catch (e) { throw new Error('render'); }
      var W = tpl.unit === 'mm' ? 1654 : tpl.w, H = tpl.unit === 'mm' ? Math.round(1654 * tpl.h / tpl.w) : tpl.h;
      var total = res.pages.length;
      return sequence(res.pages, function (svg, i) {
        var suffix = total > 1 ? '-' + (i + 1) : '';
        var name = Exp.slug(baseName(data) + '-' + st.tpl + suffix, 'color-hunter') + '.' + kind;
        var done = kind === 'svg'
          ? Promise.resolve(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg], { type: 'image/svg+xml' }))
          : rasterise(svg, W, H);
        return done.then(function (blob) {
          app().download(name, blob);
          return new Promise(function (r) { setTimeout(r, total > 1 ? 320 : 0); });
        });
      }).then(function () {
        app().toast(total > 1 ? t('{n} files saved.', { n: total }) : t('File saved.'), 3200);
        if (!f.has) app().toast(t('Your own font files (fa and en) were not found beside the app, so this file uses the device’s fonts.'), 5200);
        app().snd('lock');
      });
    }).catch(function () { app().toast(t('That file could not be made. Try SVG or PDF instead.'), 4200); })
      .then(function () { st.busy = false; if (WS.isOpen() && WS.tab() === 'export') WS.refresh({ keepScroll: true }); });
  }

  /* ---------- files ---------- */

  function fileText(f, data) {
    var colors = data.colors.map(function (c) { return { h: c.h, name: c.note ? String(c.note).slice(0, 40) : '' }; });
    if (f.id === 'css') return Exp.cssVariables({ title: data.title, colors: colors, format: st.fmt });
    if (f.id === 'systemCss') return Exp.cssVariables({ title: data.title, colors: colors, roles: data.roles, format: st.fmt });
    if (f.id === 'tokens') return Exp.designTokens({ title: data.title, colors: colors, roles: data.roles });
    return Exp.svgSwatches({ title: data.title, colors: colors });
  }
  function fileFor(id) { return FILES.filter(function (f) { return f.id === id; })[0]; }
  function fileAvailable(f, data) { return !(f.needs === 'roles' && !(data.roles && Object.keys(data.roles.light || {}).length)); }

  function filesBody(data) {
    var avail = FILES.filter(function (f) { return fileAvailable(f, data); });
    if (!avail.some(function (f) { return f.id === st.file; })) st.file = avail[0].id;
    var f = fileFor(st.file), locked = !allowed(f.pro);
    var cards = el('div', { cls: 'tpl' }, FILES.map(function (x) {
      var ok = fileAvailable(x, data), lk = !allowed(x.pro);
      return el('button', { type: 'button', cls: 'tplc' + (x.id === st.file ? ' on' : ''), disabled: ok ? null : 'disabled', 'aria-pressed': x.id === st.file ? 'true' : 'false',
        onclick: function () { st.file = x.id; WS.refresh({ keepScroll: true }); } },
        [el('b', { text: t(x.label) }), el('small', { text: ok ? t(x.note) : t('Needs a UI color system') }), lk ? el('span', { cls: 'lockb' }, [icon('lock', 10), el('span', { text: t('Pro') })]) : null]);
    }));
    var text = fileText(f, data);
    var shown = locked ? text.split('\n').slice(0, 7).join('\n') + '\n…' : text;
    var notation = (f.id === 'css' || f.id === 'systemCss') ? el('div', { cls: 'wfield' }, [el('label', { text: t('Color notation') }),
      UI.seg({ aria: t('Color notation'), value: st.fmt, options: NOTATIONS.map(function (n) { return { id: n[0], label: n[1] }; }), onChange: function (v) { st.fmt = v; WS.refresh({ keepScroll: true }); } }).root]) : null;
    return [
      cards, notation,
      locked ? el('div', { cls: 'status' }, [icon('lock', 18), el('div', { cls: 'sd' }, [el('b', { text: t('Pro feature') }), el('small', { text: t('This is the start of the real file. Copying and downloading it needs Pro.') })]),
        UI.button({ label: t('See Pro'), cls: 'sm', onclick: function () { WS.upsell(f.pro); } })]) : null,
      el('pre', { cls: 'codebox ltr', tabindex: '0', 'aria-label': t(f.label), text: shown }),
      el('div', { cls: 'wrow', style: 'margin-top:12px' }, [
        UI.button({ icon: 'copy', label: t('Copy'), cls: 'grow', onclick: function () { if (locked) return WS.upsell(f.pro); app().copy(text); } }),
        UI.button({ icon: 'download', label: t('Download'), kind: 'primary', cls: 'grow', onclick: function () {
          if (locked) return WS.upsell(f.pro);
          app().download(Exp.fileName(data.title, f.kind, f.ext), new Blob([text], { type: f.mime + ';charset=utf-8' }));
          app().toast(t('File saved.'), 2400); app().snd('lock');
        } })]),
      data.pid ? projectFileCard(data) : null
    ];
  }
  function projectFileCard(data) {
    var p = Data.project(data.pid);
    if (!p) return null;
    return el('div', null, [
      el('h3', { cls: 'wh2' }, [el('span', { text: t('The whole project') })]),
      el('p', { cls: 'hintx', style: 'margin-top:0', text: t('Every color, palette, note and reference image in one file. It can be opened again in Color Hunter on any device, and it is always added as a copy.') }),
      UI.button({ icon: 'download', label: t('Download the project file'), onclick: function () {
        var b = Data.bundleOf(p.id, app().version);
        if (!b) return app().toast(t('That item no longer exists.'));
        app().download(Exp.fileName(p.name, 'project', 'json'), new Blob([JSON.stringify(b)], { type: 'application/json' }));
        app().toast(t('Project file saved.'), 2600);
      } })]);
  }

  /* ---------- sheets ---------- */

  var logoInput = null;
  function chooseLogo(onDone) {
    if (!logoInput) {
      logoInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none', 'aria-hidden': 'true', tabindex: '-1' });
      document.body.appendChild(logoInput);
    }
    logoInput.onchange = function () {
      var f = logoInput.files && logoInput.files[0];
      logoInput.value = '';
      if (!f) return;
      UI.readImage(f, { max: 360, limit: 380000, alpha: true }).then(onDone, function () { app().toast(t('That image could not be used. Pick a PNG or JPG.')); });
    };
    logoInput.click();
  }

  function detailsBlock(data) {
    var onTpl = st.tpl;
    function setOver(k, v) { st.over[k] = v; drawStageSoon(); }
    var title = UI.field({ label: t('Title'), value: data.title, max: 80, onInput: function (v) { setOver('title', v); } });
    var sub = UI.field({ label: t('Subtitle'), value: data.subtitle, max: 80, onInput: function (v) { setOver('subtitle', v); } });
    var client = UI.field({ label: t('Client'), value: data.client, max: 80, onInput: function (v) { setOver('client', v); } });
    var desc = UI.field({ label: t('Description'), type: 'textarea', value: data.desc, max: 500, rows: 3, onInput: function (v) { setOver('desc', v); } });
    var logoBox = el('div', { cls: 'wfield' });
    function drawLogo() {
      var logo = st.over.logo !== undefined ? st.over.logo : data.logo;
      fill(logoBox, [el('label', { text: t('Logo') }), el('div', { cls: 'logo' }, [
        logo ? el('img', { src: logo, alt: '' }) : icon('image', 26),
        el('div', { cls: 'lt', text: onTpl === 'brand' ? (logo ? t('Drawn on the brand sheet.') : t('Optional. A PNG with a transparent background works best.')) : t('Only the brand sheet shows the logo.') }),
        UI.button({ label: logo ? t('Change') : t('Choose'), cls: 'sm', onclick: function () { chooseLogo(function (u) { st.over.logo = u; drawLogo(); drawStage(); }); } }),
        logo ? UI.button({ icon: 'trash', title: t('Remove logo'), cls: 'sm only', onclick: function () { st.over.logo = ''; drawLogo(); drawStage(); } }) : null])]);
    }
    drawLogo();
    var save = null;
    if (data.pid) {
      save = UI.button({ icon: 'check', label: t('Save these details to the project'), cls: 'sm', onclick: function () {
        var p = Data.project(data.pid);
        if (!p) return;
        var f = { name: st.src.kind === 'proj' && st.over.title !== undefined ? String(st.over.title).trim() || p.name : p.name,
          client: st.over.client !== undefined ? st.over.client : p.client, desc: st.over.desc !== undefined ? st.over.desc : p.desc,
          logo: st.over.logo !== undefined ? st.over.logo : p.logo };
        Data.updateProject(p.id, f).then(function (r) { if (!r.ok) return WS.fail(r); st.over = {}; app().toast(t('Saved to the project.')); });
      } });
    }
    return el('div', null, [title.root, sub.root, client.root, desc.root, logoBox, save ? el('div', { cls: 'wrow', style: 'margin-top:12px' }, [save]) : null,
      el('p', { cls: 'hintx', text: t('Changes here affect only this export until you save them to the project.') })]);
  }

  function sheetBody(data) {
    var hasRoles = !!(data.roles && Object.keys(data.roles.light || {}).length);
    var cards = el('div', { cls: 'tpl', role: 'group', 'aria-label': t('Template') }, Sheets.TEMPLATES.map(function (x) {
      var lk = !allowed(Pro.sheetFeature(x.id)), off = x.needs === 'system' && !hasRoles;
      return el('button', { type: 'button', cls: 'tplc' + (x.id === st.tpl ? ' on' : ''), 'aria-pressed': x.id === st.tpl ? 'true' : 'false',
        onclick: function () { st.tpl = x.id; WS.refresh({ keepScroll: true }); } },
        [el('b', { text: t(x.label) }), el('small', { text: off ? t('Needs a UI color system') : t(x.note) }), lk ? el('span', { cls: 'lockb' }, [icon('lock', 10), el('span', { text: t('Pro') })]) : null]);
    }));
    host.stage = el('div', { cls: 'stage' });
    host.pages = el('small', { cls: 'ltr' });
    drawStage();
    var locked = !allowed(Pro.sheetFeature(st.tpl));
    var lockNote = locked ? el('div', { cls: 'status' }, [icon('lock', 18), el('div', { cls: 'sd' }, [el('b', { text: t('Pro preview') }), el('small', { text: t('This is the real layout. Downloading this template needs Pro.') })]),
      UI.button({ label: t('See Pro'), cls: 'sm', onclick: function () { WS.upsell(Pro.sheetFeature(st.tpl)); } })]) : null;
    return [
      cards,
      el('h3', { cls: 'wh2' }, [el('span', { text: t('Preview') }), host.pages]),
      host.stage, lockNote,
      el('div', { cls: 'expgrid', style: 'margin-top:12px' }, [
        UI.button({ icon: 'print', label: t('PDF'), kind: 'primary', onclick: downloadPdf }),
        UI.button({ icon: 'image', label: st.busy ? t('Working…') : t('PNG'), disabled: st.busy, onclick: function () { downloadImages('png'); } }),
        UI.button({ icon: 'download', label: t('SVG'), disabled: st.busy, onclick: function () { downloadImages('svg'); } })]),
      el('p', { cls: 'hintx', text: t('PDF opens the print window: choose “Save as PDF”. PNG and SVG use your own fa and en font files when they sit beside the app.') }),
      el('h3', { cls: 'wh2' }, [el('span', { text: t('Details on the sheet') })]),
      detailsBlock(data)];
  }

  /* ---------- the screen ---------- */

  function view() {
    if (!valid(st.src)) st.src = defaultSource();
    var data = build();
    var empty = !data || !data.colors.length;
    var srcRow = el('div', { cls: 'dest' }, [
      data && data.colors.length ? UI.strip(data.colors.slice(0, 5).map(function (c) { return c.h; }), { cls: 'mini' }) : icon('export', 20),
      el('div', { cls: 'dt' }, [el('b', { text: t('Exporting') }), el('small', { text: data ? data.label + ' · ' + cn(data.colors.length) : t('Nothing selected') })]),
      UI.button({ label: t('Change'), cls: 'sm', onclick: pickSource })]);
    if (empty && !(data && data.roles)) {
      return { key: 'export-empty', title: t('Export'), body: [srcRow, UI.empty({ art: 'palette', title: t('Nothing to export yet'),
        text: t('Save a few colors or build a palette in the Studio, then export it as a sheet, CSS, tokens or a vector file.'),
        actions: [UI.button({ icon: 'studio', label: t('Open the Studio'), kind: 'primary', onclick: function () { WS.go('studio', {}); } }),
          UI.button({ icon: 'camera', label: t('Use the camera'), onclick: function () { WS.close(); } })] })] };
    }
    var seg = UI.seg({ aria: t('Kind of export'), value: st.mode, options: [{ id: 'sheet', label: t('Sheets'), icon: 'layers' }, { id: 'files', label: t('Code and files'), icon: 'link' }],
      onChange: function (v) { st.mode = v; WS.refresh({ keepScroll: false }); } });
    host = {};
    return { key: 'export-' + st.mode, title: t('Export'), sub: data.title, body: [srcRow, seg.root].concat(st.mode === 'sheet' ? sheetBody(data) : filesBody(data)) };
  }

  WS.register('export', { enter: enter, view: view, back: function () { return false; } });
}));
