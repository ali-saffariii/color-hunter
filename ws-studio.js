/*! Color Hunter — Color Studio screens
 *
 *  One working palette and five tools that act on it: build and edit it
 *  (Palette), tints and shades (Scale), a UI colour system (System), a contrast
 *  checker (Contrast) and a side-by-side comparison (Compare). Every tool reads
 *  and writes the same working palette, so a colour fixed in Contrast is the colour
 *  that gets saved, exported or turned into a system.
 *
 *  The colour maths is in studio.js and is never repeated here. The working state
 *  is autosaved as a draft after every change, so closing the app mid-edit loses
 *  nothing. Pro-gated tools show a real preview and refuse only the action that
 *  would keep or export the result.
 */
(function (root, factory) {
  factory(root.CHUI, root.CHI18N, root.CHData, root.CHWS, root.CHStore, root.CHStudio, root.CH);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (UI, I18N, Data, WS, Store, Studio, CH) {
  'use strict';

  var el = UI.el, fill = UI.fill, icon = UI.icon;
  var t = function (k, v) { return I18N.t(k, v); };
  var app = function () { return WS.app(); };

  var MAX = 12;
  var KINDS = ['manual', 'harmony', 'image', 'scale', 'system'];
  var TARGETS = [['4.5', 'AA text'], ['7', 'AAA text'], ['3', 'Large text and controls']];

  var st = {
    colors: [], sel: 0, tool: 'palette',
    harmony: 'analogous', seed: 1, variation: 0.5,
    pid: null,            // null = follow the project the camera saves to; '' = the Inbox
    paletteId: '', name: '', kind: 'manual', base: '',
    system: null, sysMode: 'light', changes: null, sysBefore: null,
    fg: '', bg: '', target: '4.5',
    stepSel: -1, cmpA: -1, cmpB: -1,
    history: [], dirty: false, loaded: false, busy: ''
  };
  var host = {};
  var fileInput = null;

  /* ---------- small helpers ---------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hexes() { return st.colors.map(function (c) { return c.h; }); }
  function uniq(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (h) { h = UI.normHex(h); if (h && !seen[h]) { seen[h] = 1; out.push(h); } });
    return out;
  }
  function pro() { return app().pro; }
  function allowed(feature) { return pro().gate(feature).ok; }
  function needPro(feature) { WS.upsell(feature); }
  function destPid() {
    var p = st.pid === null ? Data.active() : st.pid;
    return p && Data.project(p) ? p : '';
  }
  function destName() { var p = destPid(); return p ? Data.project(p).name : t('Inbox'); }
  function nameOf(h) { return app().tName(app().describe(h).name); }
  function defaultName() {
    var n = Data.palettes().length + 1;
    return t('Palette {n}', { n: n });
  }
  function sanity() {
    if (st.pid && !Data.project(st.pid)) st.pid = null;
    if (st.paletteId && !Data.palette(st.paletteId)) { st.paletteId = ''; st.dirty = true; }
    if (st.sel >= st.colors.length) st.sel = Math.max(0, st.colors.length - 1);
  }
  function cn(n) { return t(n === 1 ? '{n} color' : '{n} colors', { n: n }); }
  function ratioText(r) { return (Math.round(r * 100) / 100).toFixed(2) + ':1'; }

  /* ---------- history and draft ---------- */

  function remember() {
    st.history.push({ colors: clone(st.colors), system: st.system ? clone(st.system) : null, sel: st.sel });
    if (st.history.length > 40) st.history.shift();
  }
  function undo() {
    var h = st.history.pop();
    if (!h) return;
    st.colors = h.colors; st.system = h.system; st.sel = h.sel; st.changes = null;
    touch(true);
    WS.refresh();
    app().snd('tick');
  }

  var saveDraftSoon = UI.debounce(function () {
    Data.saveDraft('studio', {
      v: 1, colors: st.colors, tool: st.tool, harmony: st.harmony, seed: st.seed, variation: st.variation,
      pid: st.pid, paletteId: st.paletteId, name: st.name, kind: st.kind, base: st.base,
      system: st.system, sysMode: st.sysMode, t: Date.now()
    });
  }, 500);
  function touch(quiet) { st.dirty = true; if (!quiet) st.changes = null; saveDraftSoon(); }

  function restoreDraft(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.colors)) return false;
    var cols = [];
    d.colors.forEach(function (c) {
      var h = c && UI.normHex(c.h);
      if (h && cols.length < MAX) cols.push({ h: h, lock: !!c.lock });
    });
    if (!cols.length) return false;
    st.colors = cols; st.sel = 0;
    st.tool = ['palette', 'scale', 'system', 'contrast', 'compare'].indexOf(d.tool) >= 0 ? d.tool : 'palette';
    st.harmony = Studio.HARMONIES.some(function (x) { return x.id === d.harmony; }) ? d.harmony : 'analogous';
    st.seed = +d.seed || 1;
    st.variation = typeof d.variation === 'number' ? Math.max(0, Math.min(1, d.variation)) : 0.5;
    st.pid = typeof d.pid === 'string' ? d.pid : null;
    st.paletteId = typeof d.paletteId === 'string' ? d.paletteId : '';
    st.name = typeof d.name === 'string' ? d.name.slice(0, 60) : '';
    st.kind = KINDS.indexOf(d.kind) >= 0 ? d.kind : 'manual';
    st.base = UI.normHex(d.base) || '';
    st.system = validSystem(d.system) ? d.system : null;
    st.sysMode = d.sysMode === 'dark' ? 'dark' : 'light';
    st.dirty = true;
    return true;
  }
  function validSystem(s) {
    if (!s || !s.light || !s.dark) return false;
    return Studio.ROLES.every(function (r) { return UI.normHex(s.light[r.id]) && UI.normHex(s.dark[r.id]); });
  }

  /* ---------- changing the palette ---------- */

  function setColors(list, o) {
    o = o || {};
    if (!o.noHistory && st.colors.length) remember();
    st.colors = list.slice(0, MAX).map(function (c) { return { h: c.h, lock: !!c.lock }; });
    if (st.sel >= st.colors.length) st.sel = 0;
    if (o.kind) st.kind = o.kind;
    if (o.system !== undefined) st.system = o.system;
    touch();
  }
  function plain(list, kind) { return list.map(function (h) { return { h: h, lock: false }; }); }

  /* A single starting colour becomes a whole palette around it, with that colour
     locked in place. */
  function grow(h) {
    var g = Studio.generate({ current: [{ h: h, lock: true }], n: 5, harmony: st.harmony, seed: st.seed, variation: st.variation });
    setColors(g, { kind: 'harmony', noHistory: true });
    st.base = h;
  }

  function newPalette() {
    st.colors = []; st.sel = 0; st.paletteId = ''; st.name = ''; st.kind = 'manual'; st.base = '';
    st.system = null; st.changes = null; st.history = []; st.dirty = false; st.tool = 'palette';
    saveDraftSoon();
  }
  function loadPalette(q) {
    st.colors = q.colors.map(function (c) { return { h: c.h, lock: !!c.lock }; });
    st.sel = 0; st.paletteId = q.id; st.name = q.name; st.kind = q.kind; st.pid = q.pid;
    st.harmony = q.harmony && Studio.HARMONIES.some(function (x) { return x.id === q.harmony; }) ? q.harmony : st.harmony;
    st.base = q.base || '';
    st.system = q.roles && validSystem(q.roles) ? clone(q.roles) : null;
    st.tool = q.kind === 'system' && st.system ? 'system' : 'palette';
    st.changes = null; st.history = []; st.dirty = false;
  }

  /* ---------- entry ---------- */

  function enter(p) {
    sanity();
    if (p.palette) {
      var q = Data.palette(p.palette);
      if (q) loadPalette(q);
    } else if (p.colors && p.colors.length) {
      var list = uniq(p.colors).slice(0, MAX);
      if (list.length) {
        newPalette();
        st.pid = p.pid === undefined ? null : p.pid;
        if (list.length === 1) grow(list[0]); else setColors(plain(list), { kind: 'manual', noHistory: true });
      }
    } else if (p.source === 'frame') {
      newPalette();
      fromFrame();
    } else if (p.fresh) {
      newPalette();
    } else if (!st.colors.length && !st.loaded) {
      st.busy = t('Opening your last palette…');
      Data.loadDraft('studio').then(function (d) {
        st.busy = '';
        restoreDraft(d);
        if (WS.isOpen() && WS.tab() === 'studio') WS.refresh();
      });
    }
    st.loaded = true;
  }

  /* ---------- sources ---------- */

  function extract(source, k) {
    st.busy = t('Reading the colors…');
    WS.refresh();
    return UI.pixelsOf(source, 160).then(function (px) {
      var res = Studio.extractPalette(px.data, px.w, px.h, k || 5, { sort: 'light' });
      st.busy = '';
      if (!res.length) { app().toast(t('No colors could be read from that image.')); WS.refresh(); return; }
      newPalette();
      setColors(plain(res.map(function (c) { return c.h; })), { kind: 'image', noHistory: true });
      WS.refresh();
      app().snd('lock');
    }, function () {
      st.busy = '';
      app().toast(t('That image could not be read. Pick a PNG or JPG.'));
      WS.refresh();
    });
  }
  function fromFrame() {
    var f = app().frame();
    if (!f) { app().toast(t('There is no image to read yet. Open the camera or a photo first.')); return; }
    extract(f, 5);
  }
  function fromFile() {
    if (!fileInput) {
      fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none', 'aria-hidden': 'true', tabindex: '-1' });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        if (f.size > 40 * 1024 * 1024) { app().toast(t('That image is too large.')); return; }
        extract(f, 5);
      });
      document.body.appendChild(fileInput);
    }
    fileInput.click();
  }
  function fromCode() {
    var hf = UI.hexField({ label: t('Color code'), value: '#3366CC' });
    var sh = UI.sheet({
      title: t('Start from a color'), body: [hf.root, el('p', { cls: 'hintx', text: t('Type a code like #3366CC or pick a color. The palette is built around it.') })],
      actions: [UI.button({ label: t('Build palette'), kind: 'primary', onclick: function () {
        if (!hf.get()) return app().toast(t('That is not a color code. Use six digits, like #3366CC.'));
        sh.close(); newPalette(); grow(hf.get()); WS.refresh();
      } })]
    });
  }
  function fromProject() {
    var projects = Data.projects().filter(function (p) { return !p.archived; });
    var items = [];
    if (Data.inbox().length) items.push({ value: '', label: t('Inbox'), sub: cn(Data.inbox().length), icon: 'layers' });
    projects.forEach(function (p) {
      var n = Data.colorsOf(p.id).length;
      if (n) items.push({ value: p.id, label: p.name, sub: cn(n), colors: Data.identity(p.id, 3) });
    });
    if (!items.length) return app().toast(t('You have no saved colors yet. Save some from the camera first.'));
    UI.pick({ title: t('Colors from…'), items: items }).then(function (pid) {
      if (pid === undefined) return;
      chooseColors(Data.colorsOf(pid), pid);
    });
  }
  function chooseColors(all, pid) {
    var pickd = {};
    var seen = {};
    var list = all.filter(function (c) { if (seen[c.h]) return false; seen[c.h] = 1; return true; });
    list.slice(0, MAX).forEach(function (c) { pickd[c.h] = true; });
    var count = el('b'), grid = el('div', { cls: 'sgrid' }), go;
    function draw() {
      var n = Object.keys(pickd).length;
      count.textContent = t('{n} of {max} selected', { n: n, max: MAX });
      go.disabled = !n;
      fill(grid, list.map(function (c) {
        var on = !!pickd[c.h];
        return el('button', { type: 'button', cls: 'sw1' + (on ? ' sel' : ''), 'aria-pressed': on ? 'true' : 'false', 'aria-label': c.p || c.h, onclick: function () {
          if (on) delete pickd[c.h]; else if (Object.keys(pickd).length < MAX) pickd[c.h] = true; else app().toast(t('A palette holds up to {max} colors.', { max: MAX }));
          draw();
        } }, [el('span', { cls: 'blk', bg: c.h }, [el('span', { cls: 'mark' }, icon('check', 14))]), el('b', { cls: 'ltr', text: c.h })]);
      }));
    }
    go = UI.button({ label: t('Use these colors'), kind: 'primary', onclick: function () {
      var chosen = list.filter(function (c) { return pickd[c.h]; }).map(function (c) { return c.h; });
      if (!chosen.length) return;
      sh.close(); newPalette();
      if (pid !== undefined && st.pid === null) st.pid = pid;
      if (chosen.length === 1) grow(chosen[0]); else setColors(plain(chosen), { kind: 'manual', noHistory: true });
      WS.refresh();
    } });
    var sh = UI.sheet({ title: t('Choose colors'), body: [el('div', { cls: 'wrow between' }, [count]), grid], actions: [go] });
    draw();
  }
  function surprise() {
    st.seed = Math.floor(Math.random() * 1e9) + 1;
    var ok = [0.45 + Math.random() * 0.3, 0.08 + Math.random() * 0.1, Math.random() * 360];
    newPalette();
    grow(Studio.okToHex(ok[0], ok[1], ok[2]));
    WS.refresh();
  }
  function sources() {
    var cam = app().currentColor && app().currentColor();
    return [
      { id: 'cam', icon: 'dropper', label: t('Color from the camera'), sub: cam ? cam : t('Measure a color first'), off: !cam, run: function () { newPalette(); grow(cam); WS.refresh(); } },
      { id: 'frame', icon: 'camera', label: t('What the camera sees'), sub: app().hasImage() ? t('Dominant colors of the view') : t('Open the camera or a photo first'), off: !app().hasImage(), run: fromFrame },
      { id: 'file', icon: 'image', label: t('A photo from your device'), sub: t('Dominant colors of the image'), run: fromFile },
      { id: 'proj', icon: 'folder', label: t('Colors from a project'), sub: t('Pick from what you saved'), run: fromProject },
      { id: 'code', icon: 'pencil', label: t('A color code'), sub: t('Type or pick one color'), run: fromCode },
      { id: 'rand', icon: 'dice', label: t('Surprise me'), sub: t('A fresh harmony'), run: surprise }
    ];
  }
  function startScreen() {
    return [UI.empty({ art: 'palette', title: t('Start a palette'), text: t('Choose where the colors come from. You can change everything afterwards.') }),
      el('div', { cls: 'srcgrid' }, sources().map(function (s) {
        return el('button', { type: 'button', cls: 'srct', disabled: s.off ? 'disabled' : null, onclick: s.run },
          [icon(s.icon, 22), el('b', { text: s.label }), el('small', { cls: s.id === 'cam' && !s.off ? 'ltr' : '', text: s.sub })]);
      }))];
  }
  function sourcePick() {
    UI.pick({ title: t('Start from…'), intro: t('This replaces the working palette. You can undo it.'),
      items: sources().map(function (s) { return { value: s.id, label: s.label, sub: s.sub, icon: s.icon, disabled: s.off }; }) }).then(function (v) {
      if (!v) return;
      sources().filter(function (s) { return s.id === v; })[0].run();
    });
  }

  /* ---------- the palette strip ---------- */

  function drawEdit() {
    if (!host.edit) return;
    fill(host.edit, st.colors.map(function (c, i) {
      var ink = UI.inkOf(c.h);
      var lock = el('button', { type: 'button', cls: c.lock ? 'lk' : '', 'aria-pressed': c.lock ? 'true' : 'false', 'aria-label': c.lock ? t('Unlock this color') : t('Lock this color'), onclick: function (e) {
        e.stopPropagation(); c.lock = !c.lock; touch(true); app().snd('tick'); drawEdit();
      } }, icon(c.lock ? 'lock' : 'unlock', 18));
      var slot = el('div', { cls: 'slot' + (i === st.sel ? ' sel' : ''), role: 'button', tabindex: '0', bg: c.h, fg: ink,
        'aria-label': c.h + ', ' + nameOf(c.h) + (c.lock ? ', ' + t('locked') : ''), 'aria-pressed': i === st.sel ? 'true' : 'false',
        onclick: function () { if (st.sel !== i) { st.sel = i; WS.refresh({ keepScroll: true }); } },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.click(); } } },
        [lock, el('b', { text: c.h.slice(1) })]);
      return slot;
    }));
    if (host.names) fill(host.names, st.colors.map(function (c) { return el('small', { text: nameOf(c.h).split(',')[0] }); }));
  }

  function slider(o) {
    var out = el('output', { cls: 'ltr', text: o.fmt(o.value) });
    var input = el('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: o.value, 'aria-label': o.label, cls: 'rng' });
    input.addEventListener('pointerdown', function () { if (o.start) o.start(); });
    input.addEventListener('input', function () { out.textContent = o.fmt(+input.value); o.input(+input.value); });
    input.addEventListener('change', function () { if (o.done) o.done(); });
    return { root: el('div', { cls: 'wfield rngf' }, [el('label', { text: o.label }, [out]), input]), input: input, out: out };
  }

  function editPanel() {
    var c = st.colors[st.sel];
    if (!c) return null;
    var ok = Studio.hexToOk(c.h);
    var cur = { L: ok[0], C: ok[1], H: ok[2] };
    var hf = UI.hexField({ label: t('Color code'), value: c.h, onChange: function (h) {
      remember(); c.h = h; touch(); WS.refresh({ keepScroll: true });
    } });
    var started = false;
    function start() { if (!started) { remember(); started = true; } }
    function apply() {
      c.h = Studio.okToHex(cur.L, cur.C, cur.H);
      hf.set(c.h); touch(); drawEdit();
    }
    function done() { started = false; WS.refresh({ keepScroll: true }); }
    var sl = [
      slider({ label: t('Lightness'), min: 0, max: 100, step: 0.5, value: Math.round(cur.L * 1000) / 10, fmt: function (v) { return Math.round(v) + '%'; }, start: start, done: done, input: function (v) { cur.L = v / 100; apply(); } }),
      slider({ label: t('Chroma'), min: 0, max: 40, step: 0.25, value: Math.round(cur.C * 1000) / 10, fmt: function (v) { return (Math.round(v * 10) / 10).toString(); }, start: start, done: done, input: function (v) { cur.C = v / 100; apply(); } }),
      slider({ label: t('Hue'), min: 0, max: 360, step: 1, value: Math.round(cur.H) % 360, fmt: function (v) { return Math.round(v) + '°'; }, start: start, done: done, input: function (v) { cur.H = v; apply(); } })];
    var acts = el('div', { cls: 'wrow' }, [
      UI.button({ icon: c.lock ? 'unlock' : 'lock', label: c.lock ? t('Unlock') : t('Lock'), kind: 'ghost', cls: 'sm', onclick: function () { c.lock = !c.lock; touch(true); WS.refresh({ keepScroll: true }); } }),
      UI.button({ icon: 'copy', label: t('Duplicate'), cls: 'sm', disabled: st.colors.length >= MAX, onclick: function () {
        remember(); st.colors.splice(st.sel + 1, 0, { h: c.h, lock: false }); st.sel++; touch(); WS.refresh({ keepScroll: true });
      } }),
      UI.button({ icon: 'trash', label: t('Remove'), cls: 'sm danger', disabled: st.colors.length <= 1, onclick: function () {
        remember(); st.colors.splice(st.sel, 1); st.sel = Math.max(0, st.sel - 1); touch(); WS.refresh({ keepScroll: true });
      } })]);
    return el('div', null, [hf.root, sl[0].root, sl[1].root, sl[2].root, acts]);
  }

  function codesPanel(h) {
    var f = Studio.formats(h), d = app().describe(h);
    var onW = Studio.contrastReport(h, '#FFFFFF'), onB = Studio.contrastReport(h, '#000000');
    function row(label, value, ltr) {
      return el('button', { type: 'button', cls: 'code', 'data-copy': value, onclick: function () { app().copy(value); } },
        [el('span', { text: label }), el('b', { cls: ltr === false ? '' : 'ltr', text: value })]);
    }
    return el('div', { cls: 'codes' }, [
      row('HEX', f.hex), row('RGB', f.rgb), row('HSL', f.hsl), row('OKLCH', f.oklch), row('Lab', f.lab), row('CMYK', f.cmyk),
      row(t('Nearest Pantone'), d.p), row(t('Nearest RAL'), d.r),
      el('div', { cls: 'code' }, [el('span', { text: t('Contrast on white') }), el('b', { cls: 'ltr', text: ratioText(onW.ratio) })]),
      el('div', { cls: 'code' }, [el('span', { text: t('Contrast on black') }), el('b', { cls: 'ltr', text: ratioText(onB.ratio) })]),
      el('p', { cls: 'hintx', text: t('CMYK is a plain arithmetic estimate with no printer profile. Pantone and RAL are the nearest entries in the built-in tables, not official specifications.') })]);
  }

  /* ---------- tool: Palette ---------- */

  function nextSeed() { st.seed = (Math.imul(st.seed, 1103515245) + 12345 + Math.floor(Math.random() * 99991)) >>> 0 || 1; }
  function regenerate() {
    remember();
    nextSeed();
    var base = st.colors[st.sel] ? st.colors[st.sel].h : undefined;
    var g = Studio.generate({ current: st.colors, n: st.colors.length, base: base, harmony: st.harmony, seed: st.seed, variation: st.variation });
    st.colors = g; st.kind = 'harmony'; st.base = base || ''; touch();
    app().snd('tick');
    WS.refresh({ keepScroll: true });
  }
  function addColor() {
    if (st.colors.length >= MAX) return app().toast(t('A palette holds up to {max} colors.', { max: MAX }));
    remember();
    nextSeed();
    var cur = st.colors.map(function (c) { return { h: c.h, lock: true }; }).concat([{ h: '', lock: false }]);
    var g = Studio.generate({ current: cur, n: cur.length, base: st.colors[0].h, harmony: st.harmony, seed: st.seed, variation: st.variation });
    var fresh = g[g.length - 1];
    st.colors.push({ h: fresh.h, lock: false }); st.sel = st.colors.length - 1; touch();
    WS.refresh({ keepScroll: true });
  }

  function paletteTool() {
    host.edit = el('div', { cls: 'pedit', role: 'group', 'aria-label': t('Working palette') });
    host.names = el('div', { cls: 'pnames', 'aria-hidden': 'true' });
    drawEdit();
    var harm = el('div', { cls: 'chips', role: 'group', 'aria-label': t('Harmony') }, Studio.HARMONIES.map(function (h) {
      return UI.chip({ label: t(h.label), on: st.harmony === h.id, onclick: function () { st.harmony = h.id; touch(true); WS.refresh({ keepScroll: true }); } });
    }));
    var vary = slider({ label: t('Variation'), min: 0, max: 100, step: 1, value: Math.round(st.variation * 100), fmt: function (v) { return Math.round(v) + '%'; }, input: function (v) { st.variation = v / 100; touch(true); } });
    var c = st.colors[st.sel];
    return [
      el('div', { cls: 'wrow between', style: 'margin-bottom:8px' }, [
        el('small', { cls: 'hintx', style: 'margin:0', text: cn(st.colors.length) + (st.colors.some(function (x) { return x.lock; }) ? '  ·  ' + t('locked colors stay put') : '') }),
        UI.button({ icon: 'plus', label: t('Add'), cls: 'sm', onclick: addColor })]),
      host.edit, host.names,
      el('h3', { cls: 'wh2' }, [el('span', { text: t('Generate') })]),
      harm, vary.root,
      el('div', { cls: 'wrow', style: 'margin-top:12px' }, [
        UI.button({ icon: 'dice', label: t('New variation'), kind: 'primary', cls: 'grow', onclick: regenerate }),
        UI.button({ icon: 'wand', label: t('Start from…'), onclick: sourcePick })]),
      el('p', { cls: 'hintx', text: t('Lock the colors you like, then generate again. The first locked color is the base the rest is built around.') }),
      el('h3', { cls: 'wh2' }, [el('span', { text: t('Edit this color') }), el('small', { cls: 'ltr', text: c ? c.h : '' })]),
      editPanel(),
      el('h3', { cls: 'wh2' }, [el('span', { text: t('Codes and specs') })]),
      c ? codesPanel(c.h) : null,
      bottomBar()];
  }

  /* ---------- tool: Scale ---------- */

  function pickRow(current, onPick, label) {
    return el('div', { cls: 'chips', role: 'group', 'aria-label': label }, st.colors.map(function (c, i) {
      return el('button', { type: 'button', cls: 'pk' + (c.h === current ? ' on' : ''), bg: c.h, fg: UI.inkOf(c.h), 'aria-pressed': c.h === current ? 'true' : 'false', 'aria-label': c.h,
        onclick: function () { onPick(c.h, i); } }, c.h === current ? icon('check', 16) : null);
    }));
  }

  function scaleTool() {
    var c = st.colors[st.sel], locked = !allowed('studio.scales');
    var steps = Studio.scale(c.h);
    if (st.stepSel < 0 || st.stepSel >= steps.length) st.stepSel = steps.filter(function (s) { return s.base; }).length ? steps.map(function (s) { return s.base; }).indexOf(true) : 5;
    var cur = steps[st.stepSel];
    var ramp = el('div', { cls: 'ramp', role: 'group', 'aria-label': t('Tints and shades') }, steps.map(function (s, i) {
      return el('button', { type: 'button', cls: (s.base ? 'base ' : '') + (i === st.stepSel ? 'on' : ''), bg: s.h, fg: UI.inkOf(s.h), 'aria-label': s.step + ' ' + s.h, 'aria-pressed': i === st.stepSel ? 'true' : 'false',
        onclick: function () { st.stepSel = i; WS.refresh({ keepScroll: true }); } }, el('span', { text: s.step }));
    }));
    function lockedAction(fn) { return function () { if (locked) return needPro('studio.scales'); fn(); }; }
    return [
      locked ? proNote('studio.scales', t('You are seeing a real preview. Using, saving or exporting a scale needs Pro.')) : null,
      el('p', { cls: 'hintx', style: 'margin-top:0', text: t('Eleven steps from near-white to near-black around one color. The step closest to your color is your color, unchanged.') }),
      pickRow(c.h, function (h, i) { st.sel = i; st.stepSel = -1; WS.refresh({ keepScroll: true }); }, t('Color to build the scale from')),
      ramp,
      el('div', { cls: 'wh2' }, [el('span', { text: t('Step {step}', { step: cur.step }) }), el('small', { cls: 'ltr', text: cur.h })]),
      codesPanel(cur.h),
      el('div', { cls: 'wrow', style: 'margin-top:12px' }, [
        UI.button({ icon: 'plus', label: t('Add this step to the palette'), disabled: st.colors.length >= MAX, onclick: lockedAction(function () {
          remember(); st.colors.push({ h: cur.h, lock: false }); st.sel = st.colors.length - 1; touch(); st.tool = 'palette'; app().toast(t('Added to the palette.')); WS.refresh();
        }) }),
        UI.button({ icon: 'ramp', label: t('Use the whole scale as the palette'), kind: 'primary', onclick: lockedAction(function () {
          remember(); st.base = c.h; st.colors = steps.slice(0, MAX).map(function (s) { return { h: s.h, lock: s.base }; }); st.kind = 'scale'; st.sel = 0; touch(); st.tool = 'palette'; app().toast(t('The palette is now the scale.')); WS.refresh();
        }) })]),
      bottomBar()];
  }

  /* ---------- tool: System ---------- */

  function ensureSystem() {
    if (!st.system) { st.system = Studio.buildSystem(hexes().slice(0, 3)); st.changes = null; touch(true); }
    return st.system;
  }
  function sysFails(mode) { return Studio.systemChecks(ensureSystem()[mode]).filter(function (c) { return !c.pass; }).length; }
  function roleLabel(id) { var r = Studio.ROLES.filter(function (x) { return x.id === id; })[0]; return t(r ? r.label : id); }

  function mockStyle(set) {
    return '--m-bg:' + set.background + ';--m-surface:' + set.surface + ';--m-text:' + set.text + ';--m-muted:' + set.muted + ';--m-border:' + set.border +
      ';--m-primary:' + set.primary + ';--m-on:' + set.onPrimary + ';--m-secondary:' + set.secondary + ';--m-accent:' + set.accent;
  }
  function mock(set) {
    return el('div', { cls: 'mock', style: mockStyle(set), role: 'img', 'aria-label': t('Preview of the interface in these colors') }, [
      el('div', { cls: 'mc' }, [
        el('h4', { text: t('Welcome back') }),
        el('p', { text: t('Your project has three new palettes waiting.') }),
        el('div', { cls: 'wrow' }, [el('span', { cls: 'mb', text: t('Continue') }), el('span', { cls: 'ms', text: t('Later') })])]),
      el('div', { cls: 'tags' }, [
        el('span', { fg: set.success, text: t('Saved') }), el('span', { fg: set.warning, text: t('Check') }), el('span', { fg: set.error, text: t('Error') }),
        el('span', { fg: set.accent, text: t('New') })]),
      el('input', { type: 'text', value: t('Search colors'), readonly: 'readonly', tabindex: '-1', 'aria-hidden': 'true' })]);
  }

  function editRole(role) {
    if (!allowed('studio.system')) return needPro('studio.system');
    var mode = st.sysMode, set = st.system[mode], hf, res = el('div');
    function paint() {
      var tmp = Object.assign({}, set); tmp[role] = hf.get() || set[role];
      fill(res, Studio.systemChecks(tmp).filter(function (c) { return c.fg === role || c.bg === role; }).map(function (c) { return checkRow(c, tmp); }));
    }
    hf = UI.hexField({ label: roleLabel(role), value: set[role], onChange: paint });
    var sh = UI.sheet({ title: roleLabel(role), sub: mode === 'dark' ? t('Dark') : t('Light'), body: [hf.root, el('p', { cls: 'hintx', text: t('Pairs this color takes part in:') }), res],
      actions: [UI.button({ label: t('Apply'), kind: 'primary', onclick: function () {
        var h = hf.get(); if (!h) return;
        remember(); st.system[mode][role] = h; st.changes = null; touch(); sh.close(); WS.refresh({ keepScroll: true });
      } })] });
    paint();
  }
  function checkRow(c, set) {
    return el('div', { cls: 'chk ' + (c.pass ? 'pass' : 'fail') }, [
      el('span', { cls: 'pair', 'aria-hidden': 'true' }, [el('i', { bg: set[c.fg] }), el('i', { bg: set[c.bg] })]),
      el('span', { text: roleLabel(c.fg) + ' / ' + roleLabel(c.bg) }),
      el('span', { cls: 'rr ltr', text: ratioText(c.ratio) }),
      el('span', { cls: 'res', text: c.pass ? t('Pass') : t('Needs {n}', { n: c.need }) })]);
  }

  function systemTool() {
    var locked = !allowed('studio.system'), sys = ensureSystem(), mode = st.sysMode, set = sys[mode];
    var modeSeg = UI.seg({ aria: t('Mode'), value: mode, options: [{ id: 'light', label: t('Light'), icon: 'sun' }, { id: 'dark', label: t('Dark'), icon: 'moon' }], onChange: function (v) { st.sysMode = v; touch(true); WS.refresh({ keepScroll: true }); } });
    var fails = sysFails(mode), other = sysFails(mode === 'light' ? 'dark' : 'light');
    var checks = Studio.systemChecks(set);
    var fixLocked = !allowed('studio.autofix');
    var out = [
      locked ? proNote('studio.system', t('You are seeing a real preview. Editing, saving and exporting a color system needs Pro.')) : null,
      el('p', { cls: 'hintx', style: 'margin-top:0', text: t('A light and a dark set of roles, built from the first three colors of your palette. Light keeps your colors exactly; dark is derived so it reads on a dark background.') }),
      modeSeg.root, mock(set),
      el('div', { cls: 'wh2' }, [el('span', { text: t('Roles') })]),
      el('div', { cls: 'roles' }, Studio.ROLES.map(function (r) {
        return el('div', { cls: 'role' }, [
          el('button', { type: 'button', cls: 'rsw', bg: set[r.id], 'aria-label': roleLabel(r.id) + ' ' + set[r.id], onclick: function () { editRole(r.id); } }),
          el('div', { cls: 'rt' }, [el('b', { text: roleLabel(r.id) }), el('small', { cls: 'ltr', text: set[r.id] })]),
          UI.button({ icon: 'pencil', title: t('Edit'), cls: 'quiet sm', kind: 'ghost', onclick: function () { editRole(r.id); } })]);
      })),
      el('div', { cls: 'wh2' }, [el('span', { text: t('Contrast checks') }), el('small', { text: fails ? t('{n} to fix', { n: fails }) : t('All pass') })]),
      el('div', null, checks.map(function (c) { return checkRow(c, set); })),
      other ? el('p', { cls: 'hintx', text: t('The {mode} set has {n} failing pairs.', { mode: mode === 'light' ? t('dark') : t('light'), n: other }) }) : null,
      el('div', { cls: 'wrow', style: 'margin-top:12px' }, [
        UI.button({ icon: 'wand', label: t('Fix automatically'), kind: 'primary', disabled: !fails && !other, onclick: function () {
          if (fixLocked) return needPro('studio.autofix');
          var r = Studio.autoFix(st.system);
          if (!r.changes.length) return app().toast(t('Nothing needed fixing.'));
          remember(); st.sysBefore = clone(st.system); st.system = r.system; st.changes = r.changes; touch(true);
          app().snd('lock'); WS.refresh({ keepScroll: true });
        } }),
        UI.button({ icon: 'undo', label: t('Rebuild from the palette'), onclick: function () {
          if (locked) return needPro('studio.system');
          remember(); st.system = Studio.buildSystem(hexes().slice(0, 3)); st.changes = null; touch(); WS.refresh({ keepScroll: true });
        } })])
    ];
    if (st.changes && st.changes.length) {
      out.push(el('div', { cls: 'wh2' }, [el('span', { text: t('What was changed') }), el('small', { text: String(st.changes.length) })]));
      out.push(el('div', null, st.changes.map(function (c) {
        return el('div', { cls: 'fixrow' }, [el('i', { cls: 'dot2', bg: c.from }), icon('back', 14), el('i', { cls: 'dot2', bg: c.to }),
          el('div', { cls: 'ft' }, [el('b', { cls: 'ltr', text: c.from + ' → ' + c.to }), el('small', { text: roleLabel(c.role) + ' · ' + (c.mode === 'dark' ? t('Dark') : t('Light')) })])]);
      })));
      out.push(el('p', { cls: 'hintx', text: t('Each fix moves only the lightness of one color, as little as needed. Undo restores the colors from before.') }));
    }
    out.push(bottomBar());
    return out;
  }

  /* ---------- tool: Contrast ---------- */

  function contrastTool() {
    if (!UI.normHex(st.fg)) st.fg = (st.colors[st.sel] || st.colors[0]).h;
    if (!UI.normHex(st.bg)) st.bg = st.colors.length > 1 ? st.colors[(st.sel + 1) % st.colors.length].h : '#FFFFFF';
    var fg = st.fg, bg = st.bg, target = +st.target;
    var rep = Studio.contrastReport(fg, bg);
    var fgHex = UI.hexField({ label: t('Text color'), value: fg, onChange: function (h) { st.fg = h; WS.refresh({ keepScroll: true }); } });
    var bgHex = UI.hexField({ label: t('Background color'), value: bg, onChange: function (h) { st.bg = h; WS.refresh({ keepScroll: true }); } });
    function quick(role, cur) {
      var list = hexes().concat(['#FFFFFF', '#000000']).filter(function (h, i, a) { return a.indexOf(h) === i; });
      return el('div', { cls: 'chips', role: 'group', 'aria-label': role }, list.map(function (h) {
        return el('button', { type: 'button', cls: 'pk' + (h === cur ? ' on' : ''), bg: h, fg: UI.inkOf(h), 'aria-label': h, 'aria-pressed': h === cur ? 'true' : 'false',
          onclick: function () { if (role === t('Text color')) st.fg = h; else st.bg = h; WS.refresh({ keepScroll: true }); } }, h === cur ? icon('check', 16) : null);
      }));
    }
    function grade(label, ok) { return el('div', { cls: 'grade ' + (ok ? 'pass' : 'fail') }, [el('span', { text: label }), el('b', { text: ok ? t('Pass') : t('Fail') })]); }
    var tSeg = UI.seg({ aria: t('Level to reach'), value: st.target, options: TARGETS.map(function (x) { return { id: x[0], label: t(x[1]) }; }), scroll: true, onChange: function (v) { st.target = v; WS.refresh({ keepScroll: true }); } });
    var sug = rep.ratio >= target ? [] : Studio.suggest(fg, bg, target);
    var fixes;
    if (rep.ratio >= target) fixes = el('p', { cls: 'note', text: t('This pair already reaches {n}:1. No change is needed.', { n: target }) });
    else if (!sug.length) fixes = el('p', { cls: 'note warn', text: t('No small change reaches {n}:1 with these colors. Try a much lighter or darker background.', { n: target }) });
    else fixes = el('div', null, sug.slice(0, 4).map(function (s) {
      var isFg = s.kind === 'fg';
      return el('div', { cls: 'fixrow' }, [
        el('i', { cls: 'dot2', bg: s.hex }),
        el('div', { cls: 'ft' }, [el('b', { cls: 'ltr', text: s.hex }), el('small', { text: (isFg ? t('Change the text color') : t('Change the background')) + ' · ' + ratioText(s.ratio) + ' · ΔE ' + (Math.round(s.dE * 10) / 10) })]),
        UI.button({ label: t('Use'), cls: 'sm', onclick: function () { if (isFg) st.fg = s.hex; else st.bg = s.hex; app().snd('tick'); WS.refresh({ keepScroll: true }); } }),
        UI.button({ icon: 'plus', title: t('Add to the palette'), cls: 'sm', kind: 'ghost', disabled: st.colors.length >= MAX, onclick: function () {
          remember(); st.colors.push({ h: s.hex, lock: false }); st.sel = st.colors.length - 1; touch(); app().toast(t('Added to the palette.')); WS.refresh({ keepScroll: true });
        } })]);
    }));
    return [
      el('p', { cls: 'hintx', style: 'margin-top:0', text: t('WCAG 2.2 contrast between two colors. Text needs 4.5:1 (3:1 when it is large), and the visible parts of a control need 3:1.') }),
      fgHex.root, quick(t('Text color'), fg), bgHex.root, quick(t('Background color'), bg),
      el('div', { cls: 'wrow', style: 'margin-top:10px' }, [UI.button({ icon: 'sort', label: t('Swap'), cls: 'sm', onclick: function () { var x = st.fg; st.fg = st.bg; st.bg = x; WS.refresh({ keepScroll: true }); } })]),
      el('div', { cls: 'cprev', style: 'background:' + bg + ';color:' + fg }, [
        el('div', null, [el('b', { text: 'Aa' }), el('span', { text: t('Normal text sample') })]),
        el('div', { style: 'border-inline-start:1.5px solid ' + fg }, [el('b', { text: t('Large') }), el('span', { text: t('Large text sample') })])]),
      el('div', { cls: 'bigratio' }, [el('b', { cls: 'ltr', text: ratioText(rep.ratio) }), el('span', { text: t('Contrast ratio') })]),
      el('div', { cls: 'grades' }, [grade(t('AA text'), rep.aaNormal), grade(t('AA large text'), rep.aaLarge), grade(t('AAA text'), rep.aaaNormal), grade(t('AAA large text'), rep.aaaLarge), grade(t('Controls (3:1)'), rep.ui)]),
      el('div', { cls: 'wh2' }, [el('span', { text: t('Fix suggestions') })]),
      tSeg.root, fixes,
      bottomBar()];
  }

  /* ---------- tool: Compare ---------- */

  function compareTool() {
    var limit = pro().compareLimit(), all = hexes(), list = all.slice(0, limit);
    var over = all.length - list.length;
    if (list.length < 2) return [UI.empty({ art: 'palette', title: t('Add one more color'), text: t('Comparing needs at least two colors in the palette.'),
      actions: [UI.button({ icon: 'plus', label: t('Add a color'), kind: 'primary', onclick: function () { st.tool = 'palette'; addColor(); } })] }), bottomBar()];
    var cmp = Studio.compare(list), n = list.length;
    if (st.cmpA < 0 || st.cmpA >= n) st.cmpA = 0;
    if (st.cmpB < 0 || st.cmpB >= n || st.cmpB === st.cmpA) st.cmpB = st.cmpA === 0 ? 1 : 0;
    function pair(i, j) { return cmp.pairs.filter(function (p) { return (p.a === list[i] && p.b === list[j]) || (p.a === list[j] && p.b === list[i]); })[0]; }
    var grid = el('div', { cls: 'dmatrix', role: 'table', 'aria-label': t('Color differences') });
    var head = el('div', { cls: 'r', style: 'grid-template-columns:repeat(' + (n + 1) + ',minmax(44px,1fr))' }, [el('div', { cls: 'c h' })].concat(list.map(function (h) { return el('div', { cls: 'c h', bg: h }); })));
    grid.appendChild(head);
    list.forEach(function (h, i) {
      var r = el('div', { cls: 'r', style: 'grid-template-columns:repeat(' + (n + 1) + ',minmax(44px,1fr))' }, [el('div', { cls: 'c h', bg: h })]);
      list.forEach(function (g, j) {
        if (i === j) { r.appendChild(el('div', { cls: 'c', text: '—' })); return; }
        var p = pair(i, j), on = (i === st.cmpA && j === st.cmpB) || (i === st.cmpB && j === st.cmpA);
        r.appendChild(el('button', { type: 'button', cls: 'c', style: on ? 'outline:2px solid var(--ink);outline-offset:-2px' : '', 'aria-label': h + ' / ' + g + ' ΔE ' + p.dE.toFixed(1), onclick: function () { st.cmpA = i; st.cmpB = j; WS.refresh({ keepScroll: true }); }, text: p.dE.toFixed(1) }));
      });
      grid.appendChild(r);
    });
    var A = list[st.cmpA], B = list[st.cmpB], pr = pair(st.cmpA, st.cmpB), sh = Studio.shift(A, B);
    var words = sh.changes.map(function (c) { return t(c); });
    if (sh.hue) words.push(t('toward {hue}', { hue: t(sh.hue) }));
    return [
      over > 0 ? el('div', { cls: 'limitbar' }, [el('span', { text: t('Showing the first {n} of {m} colors.', { n: limit, m: all.length }) }),
        UI.button({ label: t('See Pro'), cls: 'sm', onclick: function () { needPro('compare'); } })]) : null,
      UI.strip(list, { cls: 'tall' }),
      el('div', { cls: 'wh2' }, [el('span', { text: t('Closest and farthest') })]),
      el('div', { cls: 'codes' }, [
        el('div', { cls: 'code' }, [el('span', { text: t('Closest pair') }), el('b', { cls: 'ltr', text: cmp.closest.a + ' · ' + cmp.closest.b + ' · ΔE ' + cmp.closest.dE.toFixed(1) })]),
        el('div', { cls: 'code' }, [el('span', { text: t('Farthest pair') }), el('b', { cls: 'ltr', text: cmp.farthest.a + ' · ' + cmp.farthest.b + ' · ΔE ' + cmp.farthest.dE.toFixed(1) })])]),
      el('div', { cls: 'wh2' }, [el('span', { text: t('Differences (ΔE00)') })]),
      grid,
      el('p', { cls: 'hintx', text: t('ΔE00 is a distance in a perceptual color space. Around 1 is the smallest step most people notice side by side, and under 2.3 is a very close match. Tap a cell to look at that pair.') }),
      el('div', { cls: 'wh2' }, [el('span', { text: t('This pair') })]),
      el('div', { cls: 'cprev', style: 'grid-template-columns:1fr 1fr' }, [el('div', { bg: A, fg: UI.inkOf(A) }, [el('b', { cls: 'ltr', text: A }), el('span', { text: nameOf(A) })]), el('div', { bg: B, fg: UI.inkOf(B) }, [el('b', { cls: 'ltr', text: B }), el('span', { text: nameOf(B) })])]),
      el('div', { cls: 'codes' }, [
        el('div', { cls: 'code' }, [el('span', { text: 'ΔE00' }), el('b', { cls: 'ltr', text: pr.dE.toFixed(2) })]),
        el('div', { cls: 'code' }, [el('span', { text: t('Looks') }), el('b', { text: t(CH.deText(pr.dE)) })]),
        el('div', { cls: 'code' }, [el('span', { text: t('Contrast ratio') }), el('b', { cls: 'ltr', text: ratioText(pr.contrast) })]),
        words.length ? el('div', { cls: 'code' }, [el('span', { text: t('Second color is') }), el('b', { text: words.join(I18N.get() === 'fa' ? '، ' : ', ') })]) : null]),
      el('div', { cls: 'wh2' }, [el('span', { text: t('Codes') })]),
      el('div', { cls: 'plist' }, list.map(function (h) {
        var f = Studio.formats(h), d = app().describe(h);
        return el('button', { type: 'button', cls: 'listrow', 'data-copy': h, onclick: function () { app().copy([f.hex, f.rgb, f.oklch].join('  ')); } }, [
          el('i', { cls: 'strip mini', bg: h }),
          el('span', { cls: 'pt' }, [el('b', { cls: 'ltr', text: h }), el('small', { text: nameOf(h) + ' · ' + d.p })])]);
      })),
      bottomBar()];
  }

  /* ---------- upgrade note ---------- */

  function proNote(feature, text) {
    return el('div', { cls: 'status' }, [icon('lock', 18), el('div', { cls: 'sd' }, [el('b', { text: t('Pro feature') }), el('small', { text: text })]),
      UI.button({ label: t('See Pro'), cls: 'sm', onclick: function () { needPro(feature); } })]);
  }

  /* ---------- saving and exporting ---------- */

  function payload(name) {
    var sys = st.tool === 'system' && st.system;
    var kind = sys ? 'system' : (st.kind === 'system' ? 'manual' : st.kind);
    var pl = { name: name, kind: kind, harmony: kind === 'harmony' ? st.harmony : '', base: st.base || '',
      colors: st.colors.map(function (c) { return { h: c.h, lock: !!c.lock }; }) };
    if (sys) pl.roles = clone(st.system);
    return pl;
  }
  function savePalette(name, pid, copy) {
    var pl = payload(name);
    if (st.paletteId && !copy) pl.id = st.paletteId;
    return Data.savePalette(pl, pid).then(function (r) {
      if (!r.ok) { WS.fail(r); return r; }
      st.paletteId = r.palette.id; st.pid = r.palette.pid; st.name = r.palette.name; st.dirty = false; saveDraftSoon();
      var dn = r.palette.pid ? Data.project(r.palette.pid).name : t('Inbox');
      app().toast(t('Saved to “{name}”.', { name: dn }), 2600); app().snd('lock');
      WS.refresh({ keepScroll: true });
      return r;
    });
  }
  function saveSheet() {
    var editing = st.paletteId && Data.palette(st.paletteId);
    var name = UI.field({ label: t('Palette name'), value: st.name || defaultName(), max: 60 });
    var opts = [{ id: '', label: t('Inbox') }].concat(Data.projects().filter(function (p) { return !p.archived; }).map(function (p) { return { id: p.id, label: p.name }; }));
    var dest = UI.field({ label: t('Save to'), type: 'select', options: opts, value: destPid() });
    var go = function (copy) {
      var nm = name.get().trim();
      if (!nm) { name.input.setAttribute('aria-invalid', 'true'); name.input.focus(); return app().toast(t('Give the palette a name.')); }
      sh.close();
      savePalette(nm, editing && !copy ? undefined : dest.get(), copy);
    };
    var sh = UI.sheet({ title: editing ? t('Save changes') : t('Save palette'), sub: st.tool === 'system' && st.system ? t('As a UI color system, light and dark') : cn(st.colors.length),
      body: [name.root, dest.root, editing ? el('p', { cls: 'hintx', text: t('Save changes keeps this palette where it is. Save as a copy puts a new one in the project chosen above.') }) : null],
      actions: editing ? [UI.button({ label: t('Save changes'), kind: 'primary', onclick: function () { go(false); } }), UI.button({ label: t('Save as a copy'), onclick: function () { go(true); } })]
        : [UI.button({ label: t('Save palette'), kind: 'primary', onclick: function () { go(false); } })] });
    setTimeout(function () { name.input.select(); }, 80);
  }
  function saveAsColors() {
    var pid = destPid(), list = hexes(), added = 0, failed = null;
    function next(i) {
      if (i >= list.length) {
        if (failed && !added) return WS.fail(failed);
        app().toast(t('{n} colors saved to “{name}”.', { n: added, name: destName() }), 3000); app().snd('lock');
        return;
      }
      var e = app().makeEntry(list[i], {});
      if (!e) return next(i + 1);
      Data.addColor(e, pid).then(function (r) { if (r.ok) added++; else failed = r; next(i + 1); });
    }
    next(0);
  }

  function exportNow() {
    var sys = st.tool === 'system' && st.system ? clone(st.system) : null;
    WS.go('export', { studio: { name: st.name || defaultName(), colors: st.colors.map(function (c) { return { h: c.h, lock: !!c.lock }; }), roles: sys, pid: destPid(), kind: sys ? 'system' : st.kind, harmony: st.harmony, base: st.base, paletteId: st.paletteId } });
  }

  function bottomBar() {
    return el('div', { cls: 'endbar' }, [
      el('div', { cls: 'dest' }, [UI.strip(destPid() ? Data.identity(destPid(), 3) : [], { cls: 'mini' }),
        el('div', { cls: 'dt' }, [el('b', { text: t('Saving to') }), el('small', { text: destName() })]),
        UI.button({ label: t('Change'), cls: 'sm', onclick: pickDest })]),
      el('div', { cls: 'expgrid', style: 'margin-top:10px' }, [
        UI.button({ icon: 'layers', label: t('Save as colors'), onclick: saveAsColors }),
        UI.button({ icon: 'export', label: t('Export'), onclick: exportNow })])]);
  }
  function pickDest() {
    var cur = destPid();
    var items = [{ value: '', label: t('Inbox'), sub: t('Colors saved without a project'), icon: 'layers', on: !cur }].concat(Data.projects().filter(function (p) { return !p.archived; }).map(function (p) {
      return { value: p.id, label: p.name, sub: cn(Data.colorsOf(p.id).length), colors: Data.identity(p.id, 3), on: cur === p.id };
    }));
    UI.pick({ title: t('Save to'), items: items }).then(function (v) { if (v === undefined) return; st.pid = v; touch(true); WS.refresh({ keepScroll: true }); });
  }

  /* ---------- the screen ---------- */

  var TOOLS = [
    { id: 'palette', label: 'Palette', icon: 'palette' },
    { id: 'scale', label: 'Scale', icon: 'ramp', pro: 'studio.scales' },
    { id: 'system', label: 'System', icon: 'system', pro: 'studio.system' },
    { id: 'contrast', label: 'Contrast', icon: 'contrast' },
    { id: 'compare', label: 'Compare', icon: 'compare' }
  ];

  function view() {
    sanity();
    if (st.busy) return { key: 'busy', title: t('Studio'), body: UI.loading(st.busy) };
    if (!st.colors.length) return { key: 'start', title: t('Studio'), body: startScreen() };
    var seg = UI.seg({ aria: t('Studio tools'), value: st.tool, scroll: true, options: TOOLS.map(function (x) {
      return { id: x.id, label: t(x.label), icon: x.pro && !allowed(x.pro) ? 'lock' : x.icon };
    }), onChange: function (v) { st.tool = v; touch(true); WS.refresh({ keepScroll: false }); } });
    var body = st.tool === 'scale' ? scaleTool() : st.tool === 'system' ? systemTool() : st.tool === 'contrast' ? contrastTool() : st.tool === 'compare' ? compareTool() : paletteTool();
    var undoBtn = UI.button({ icon: 'undo', title: t('Undo'), disabled: !st.history.length, onclick: undo });
    var newBtn = UI.button({ icon: 'plus', title: t('New palette'), onclick: function () {
      var go = function () { newPalette(); WS.refresh({ keepScroll: false }); };
      if (!st.dirty) return go();
      app().ask(t('Start a new palette?'), st.paletteId ? t('Changes you have not saved to this palette will be lost.') : t('This palette has not been saved yet. It will be lost.'), [{ label: t('Start new'), value: true }, { label: t('Keep editing'), value: null }]).then(function (ok) { if (ok) go(); });
    } });
    var saveBtn = UI.button({ icon: !st.dirty && st.paletteId ? 'check' : null, label: !st.dirty && st.paletteId ? t('Saved') : t('Save'), kind: 'primary', cls: 'sm', onclick: saveSheet });
    return { key: 'studio-' + st.tool, title: t('Studio'), sub: st.name || (st.dirty ? t('Not saved yet') : ''), actions: [undoBtn, newBtn, saveBtn], body: [seg.root, el('div', { style: 'height:12px' })].concat(body) };
  }

  WS.register('studio', { enter: enter, view: view, back: function () { return false; } });
}));
