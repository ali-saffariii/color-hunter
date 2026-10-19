/*! Color Hunter — interface kit
 *
 *  The small set of building blocks the workspace screens share: safe DOM
 *  construction, the icon set, buttons, fields, a segmented control, bottom
 *  sheets and the three designed states (empty, loading, error).
 *
 *  Everything is built with createElement and textContent. Nothing here ever
 *  assigns innerHTML, so text a person typed — a project name, a note, a client —
 *  or text from an imported file cannot become markup.
 */
(function (root, factory) {
  var api = factory(root.CH, root.CHI18N);
  root.CHUI = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (CH, I18N) {
  'use strict';

  var t = function (k, v) { return I18N.t(k, v); };
  var doc = document;

  /* ---------- DOM ---------- */

  function el(tag, props, kids) {
    var n = doc.createElement(tag);
    if (props) for (var k in props) {
      var v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'cls') n.className = v;
      else if (k === 'bg') n.style.background = v;
      else if (k === 'fg') n.style.color = v;
      else if (k === 'flex') n.style.flex = v;
      else if (k.slice(0, 2) === 'on') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return n;
  }
  function fill(node, kids) {
    node.textContent = '';
    (Array.isArray(kids) ? kids : [kids]).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return node;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, kids) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function debounce(fn, ms) {
    var h = 0;
    function d() { var a = arguments; clearTimeout(h); h = setTimeout(function () { fn.apply(null, a); }, ms); }
    d.flush = function () { clearTimeout(h); };
    return d;
  }

  /* ---------- icons ----------
     One 24-unit grid, 1.7 stroke, square ends: the same technical hand as the
     icons already in the camera bar. Shapes are [tag, attributes]. */

  var P = function (d, extra) { return ['path', Object.assign({ d: d }, extra || {})]; };
  var C = function (cx, cy, r, extra) { return ['circle', Object.assign({ cx: cx, cy: cy, r: r }, extra || {})]; };
  var R = function (x, y, w, h, extra) { return ['rect', Object.assign({ x: x, y: y, width: w, height: h }, extra || {})]; };
  var F = { fill: 'currentColor', stroke: 'none' };
  var ICONS = {
    back: [P('M15 5l-7 7 7 7')],
    close: [P('M5 5l14 14M19 5L5 19')],
    plus: [P('M12 4v16M4 12h16')],
    check: [P('M4 12l5 5L20 6')],
    search: [C(10.5, 10.5, 6.5), P('M15.5 15.5L20 20')],
    more: [C(5, 12, 1.7, F), C(12, 12, 1.7, F), C(19, 12, 1.7, F)],
    folder: [P('M3 6h6l2 2h10v11H3z')],
    studio: [C(9, 9, 5), C(15, 9, 5), C(12, 14.5, 5)],
    export: [P('M12 15V3M7 8l5-5 5 5M5 12v8h14v-8')],
    pro: [P('M12 3l8 6-8 12L4 9z'), P('M4 9h16')],
    camera: [R(3, 7, 18, 13), P('M8 7l1.5-3h5L16 7'), C(12, 13.5, 3.5)],
    trash: [P('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6')],
    copy: [R(8, 8, 12, 12), P('M16 8V4H4v12h4')],
    archive: [P('M3 5h18v4H3zM5 9v10h14V9M10 13h4')],
    move: [P('M3 6h6l2 2h10v11H3z'), P('M9 14h7M13 11l3 3-3 3')],
    lock: [R(5, 11, 14, 9), P('M8 11V8a4 4 0 0 1 8 0v3')],
    unlock: [R(5, 11, 14, 9), P('M8 11V8a4 4 0 0 1 7.6-1.7')],
    image: [R(3, 5, 18, 14), P('M3 16l5-5 4 4 3-3 6 6')],
    pencil: [P('M4 20l1-5L16 4l4 4L9 19z'), P('M14 6l4 4')],
    sun: [C(12, 12, 4), P('M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2')],
    moon: [P('M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z')],
    download: [P('M12 3v12M7 10l5 5 5-5M5 20h14')],
    upload: [P('M12 15V3M7 8l5-5 5 5M5 20h14')],
    warn: [P('M12 3l10 18H2z'), P('M12 10v5M12 18v1')],
    info: [C(12, 12, 9), P('M12 11v6M12 7v1')],
    dice: [R(4, 4, 16, 16), C(9, 9, 1.4, F), C(15, 15, 1.4, F), C(15, 9, 1.4, F), C(9, 15, 1.4, F)],
    sort: [P('M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4')],
    link: [P('M14 4h6v6M20 4l-9 9M18 14v6H4V6h6')],
    undo: [P('M9 8L4 13l5 5M4 13h11a5 5 0 0 0 0-10h-3')],
    wand: [P('M5 19L17 7M17 7l2 2M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 13l.7 1.3 1.3.7-1.3.7L19 17l-.7-1.3L17 15l1.3-.7z')],
    contrast: [C(12, 12, 9), ['path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor', stroke: 'none' }]],
    ramp: [P('M4 20v-6M9 20v-10M14 20V6M19 20V3')],
    wheel: [C(12, 12, 9), C(12, 5, 1.6, F), C(18.5, 15.5, 1.6, F), C(5.5, 15.5, 1.6, F)],
    system: [R(4, 4, 7, 7), R(13, 4, 7, 7), R(4, 13, 7, 7), R(13, 13, 7, 7)],
    compare: [R(3, 6, 11, 11), R(10, 9, 11, 11)],
    note: [P('M5 5h14M5 10h14M5 15h9')],
    tag: [P('M3 12V4h8l10 10-8 8z'), C(7.5, 8.5, 1.2, F)],
    eye: [P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'), C(12, 12, 3)],
    star: [P('M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9z')],
    share: [P('M12 15V3M7 8l5-5 5 5M5 12v8h14v-8')],
    layers: [P('M12 3l9 5-9 5-9-5zM3 13l9 5 9-5')],
    pin: [P('M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.500-7 12-7 12z'), C(12, 9, 2.5)],
    print: [P('M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7z')],
    dropper: [P('M14 4l6 6M16 6l-9 9-3 5 5-3 9-9M13 7l4 4')],
    palette: [P('M12 3a9 9 0 1 0 0 18c1.6 0 2.2-1.1 1.6-2.2-.6-1.2.2-2.6 1.7-2.6H17a4 4 0 0 0 4-4c0-4.4-4-9.2-9-9.2z'), C(7.8, 11.4, 1.1, F), C(10.6, 7.4, 1.1, F), C(15.4, 8.2, 1.1, F)],
    grid: [R(4, 4, 6, 6), R(14, 4, 6, 6), R(4, 14, 6, 6), R(14, 14, 6, 6)]
  };

  /* An icon is decoration beside a visible label, so it is hidden from assistive
     technology; a button that is icon-only carries its own aria-label. */
  function icon(name, size) {
    var shapes = ICONS[name] || ICONS.info;
    var s = svg('svg', { viewBox: '0 0 24 24', width: size || 20, height: size || 20, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'aria-hidden': 'true', focusable: 'false' },
      shapes.map(function (sh) { return svg(sh[0], sh[1]); }));
    return el('span', { cls: 'ico' + (name === 'back' ? ' ico-dir' : ''), 'aria-hidden': 'true' }, s);
  }

  /* ---------- colour helpers ---------- */

  function inkOf(hex) { return CH.hex(CH.inkOn(CH.h2r(hex))); }
  function normHex(s) {
    s = String(s || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/(.)/g, '$1$1');
    return /^[0-9a-fA-F]{6}$/.test(s) ? '#' + s.toUpperCase() : '';
  }
  /* A row of swatches that fills its box. */
  function strip(colors, opts) {
    opts = opts || {};
    var list = colors && colors.length ? colors : [];
    return el('div', { cls: 'strip' + (opts.cls ? ' ' + opts.cls : ''), 'aria-hidden': 'true' },
      list.length ? list.map(function (h) { return el('i', { bg: h }); }) : [el('i', { cls: 'none' })]);
  }

  /* ---------- buttons, chips, segmented control ---------- */

  function button(o) {
    var kids = [];
    if (o.icon) kids.push(icon(o.icon, o.size));
    if (o.label) kids.push(el('span', { text: o.label }));
    return el('button', {
      type: 'button', cls: 'wb ' + (o.kind || 'ghost') + (o.icon && !o.label ? ' only' : '') + (o.cls ? ' ' + o.cls : ''),
      'aria-label': o.aria || (o.icon && !o.label ? o.title : null), title: o.title || null, disabled: o.disabled ? 'disabled' : null,
      onclick: o.onclick
    }, kids);
  }
  function chip(o) {
    return el('button', { type: 'button', cls: 'chip' + (o.on ? ' on' : ''), 'aria-pressed': o.on ? 'true' : 'false', onclick: o.onclick },
      [o.icon ? icon(o.icon, 14) : null, el('span', { text: o.label })]);
  }
  /* options: [{ id, label, icon }]. Returns { root, set(id), get() }. */
  function seg(o) {
    var cur = o.value, root = el('div', { cls: 'wseg' + (o.scroll ? ' scroll' : ''), role: 'group', 'aria-label': o.aria || null });
    function paint() {
      fill(root, o.options.map(function (op) {
        return el('button', { type: 'button', cls: op.id === cur ? 'on' : '', 'aria-pressed': op.id === cur ? 'true' : 'false',
          onclick: function () { if (cur === op.id) return; cur = op.id; paint(); if (o.onChange) o.onChange(cur); } },
          [op.icon ? icon(op.icon, 16) : null, el('span', { text: op.label })]);
      }));
    }
    paint();
    return { root: root, get: function () { return cur; }, set: function (id) { cur = id; paint(); } };
  }

  /* ---------- fields ---------- */

  var fieldN = 0;
  /* o: { label, value, type: text|textarea|select|number, options:[{id,label}], placeholder, max, rows, hint, onInput, dir } */
  function field(o) {
    var id = 'wf' + (++fieldN), input;
    if (o.type === 'select') {
      input = el('select', { id: id }, (o.options || []).map(function (op) { return el('option', { value: op.id, text: op.label }); }));
      input.value = o.value === undefined ? '' : o.value;
    } else if (o.type === 'textarea') {
      input = el('textarea', { id: id, rows: o.rows || 3, maxlength: o.max || null, placeholder: o.placeholder || null });
      input.value = o.value || '';
    } else {
      input = el('input', { id: id, type: o.type || 'text', maxlength: o.max || null, placeholder: o.placeholder || null, autocomplete: 'off', spellcheck: 'false', inputmode: o.inputmode || null });
      input.value = o.value === undefined || o.value === null ? '' : o.value;
    }
    if (o.dir) input.setAttribute('dir', o.dir);
    if (o.onInput) input.addEventListener('input', function () { o.onInput(input.value); });
    var root = el('div', { cls: 'wfield' + (o.cls ? ' ' + o.cls : '') }, [
      el('label', { 'for': id, text: o.label }), input, o.hint ? el('small', { text: o.hint }) : null]);
    return { root: root, input: input, get: function () { return input.value; }, set: function (v) { input.value = v; } };
  }

  /* A colour field: typed hex plus the device's own colour picker. Typing is
     forgiving (#abc, abc, ABCDEF) and only a complete valid colour is reported. */
  function hexField(o) {
    var cur = normHex(o.value) || '', id = 'wf' + (++fieldN);
    var sw = el('input', { type: 'color', cls: 'hexpick', 'aria-label': o.pickLabel || t('Pick a color'), value: cur || '#000000' });
    var tx = el('input', { id: id, type: 'text', cls: 'hextx ltr', maxlength: 7, autocomplete: 'off', spellcheck: 'false', placeholder: '#RRGGBB', 'aria-invalid': 'false' });
    tx.value = cur;
    function show() { sw.style.setProperty('--sw', cur || 'transparent'); }
    tx.addEventListener('input', function () {
      var h = normHex(tx.value);
      tx.setAttribute('aria-invalid', tx.value && !h ? 'true' : 'false');
      if (h && h !== cur) { cur = h; sw.value = h.toLowerCase(); show(); if (o.onChange) o.onChange(h); }
    });
    tx.addEventListener('blur', function () { tx.value = cur; tx.setAttribute('aria-invalid', 'false'); });
    sw.addEventListener('input', function () {
      var h = normHex(sw.value);
      if (h && h !== cur) { cur = h; tx.value = h; show(); if (o.onChange) o.onChange(h); }
    });
    show();
    var root = el('div', { cls: 'wfield hexf' + (o.cls ? ' ' + o.cls : '') }, [
      o.label ? el('label', { 'for': id, text: o.label }) : null,
      el('div', { cls: 'hexrow' }, [sw, tx])]);
    return { root: root, get: function () { return cur; }, set: function (h) { cur = normHex(h) || cur; tx.value = cur; if (cur) sw.value = cur.toLowerCase(); show(); } };
  }

  /* ---------- bottom sheets ---------- */

  var stack = [];
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && stack.length) { e.stopPropagation(); stack[stack.length - 1].close(); }
  });

  /* o: { title, sub, body (node or nodes), actions: [button nodes], onClose, wide }
     Returns { close, root, body }. Focus moves into the sheet and comes back to
     what opened it. */
  function sheet(o) {
    var opener = doc.activeElement;
    var body = el('div', { cls: 'wsm-b' }, o.body);
    var box = el('div', { cls: 'wsm-box' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, tabindex: '-1' }, [
      el('div', { cls: 'wsm-h' }, [
        el('div', null, [el('b', { cls: 'mi', text: o.title }), o.sub ? el('small', { text: o.sub }) : null]),
        el('button', { type: 'button', cls: 'wb ghost only', 'aria-label': t('Close'), onclick: function () { api.close(); } }, icon('close', 18))]),
      body,
      o.actions && o.actions.length ? el('div', { cls: 'wsm-f' }, o.actions) : null]);
    var back = el('div', { cls: 'wsm', onclick: function (e) { if (e.target === back) api.close(); } }, box);
    var closed = false;
    var api = {
      root: back, body: body,
      close: function () {
        if (closed) return; closed = true;
        stack.splice(stack.indexOf(api), 1);
        back.classList.remove('on');
        setTimeout(function () { back.remove(); }, 200);
        if (opener && opener.focus && doc.contains(opener)) try { opener.focus(); } catch (e) { /* ignore */ }
        if (o.onClose) o.onClose();
      }
    };
    stack.push(api);
    doc.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('on'); box.focus(); });
    return api;
  }

  /* A list to choose from. Resolves with the chosen value, or undefined if the
     sheet was dismissed. items: [{ value, label, sub, colors, icon, disabled }] */
  function pick(o) {
    return new Promise(function (resolve) {
      var done = false, sh;
      function finish(v) { if (done) return; done = true; resolve(v); sh.close(); }
      var list = el('div', { cls: 'pick' }, o.items.map(function (it) {
        return el('button', { type: 'button', cls: 'pickrow' + (it.on ? ' on' : ''), disabled: it.disabled ? 'disabled' : null, onclick: function () { finish(it.value); } }, [
          it.colors ? strip(it.colors, { cls: 'mini' }) : it.icon ? icon(it.icon, 18) : null,
          el('span', { cls: 'pt' }, [el('b', { text: it.label }), it.sub ? el('small', { text: it.sub }) : null]),
          it.on ? icon('check', 16) : null]);
      }));
      sh = sheet({ title: o.title, sub: o.sub, body: [o.head || null, o.intro ? el('p', { cls: 'hintx', text: o.intro }) : null, list], onClose: function () { if (!done) { done = true; resolve(undefined); } } });
    });
  }

  /* ---------- designed states ---------- */

  var ART = {
    projects: function () {
      return svg('svg', { viewBox: '0 0 160 110', width: 160, height: 110, 'aria-hidden': 'true' }, [
        svg('rect', { x: 14, y: 30, width: 92, height: 64, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
        svg('path', { d: 'M14 30h30l8 9h54', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
        svg('rect', { x: 62, y: 14, width: 30, height: 40, fill: 'currentColor', opacity: '.14' }),
        svg('rect', { x: 78, y: 22, width: 30, height: 40, fill: 'currentColor', opacity: '.3' }),
        svg('rect', { x: 94, y: 30, width: 30, height: 40, fill: 'currentColor', opacity: '.55' }),
        svg('path', { d: 'M126 94h22M137 83v22', stroke: 'currentColor', 'stroke-width': 2 })]);
    },
    palette: function () {
      var cells = [];
      for (var i = 0; i < 5; i++) cells.push(svg('rect', { x: 14 + i * 27, y: 34, width: 24, height: 44, fill: 'currentColor', opacity: String(0.12 + i * 0.16) }));
      cells.push(svg('path', { d: 'M14 90h132', stroke: 'currentColor', 'stroke-width': 2 }));
      return svg('svg', { viewBox: '0 0 160 110', width: 160, height: 110, 'aria-hidden': 'true' }, cells);
    },
    image: function () {
      return svg('svg', { viewBox: '0 0 160 110', width: 160, height: 110, 'aria-hidden': 'true' }, [
        svg('rect', { x: 20, y: 18, width: 120, height: 74, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
        svg('path', { d: 'M20 78l32-30 26 24 20-18 42 36', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
        svg('circle', { cx: 112, cy: 40, r: 7, fill: 'currentColor', opacity: '.4' })]);
    }
  };
  function empty(o) {
    return el('div', { cls: 'wstate empty' }, [
      o.art ? el('div', { cls: 'art' }, (ART[o.art] || ART.projects)()) : null,
      el('b', { cls: 'mi', text: o.title }), o.text ? el('p', { text: o.text }) : null,
      o.actions ? el('div', { cls: 'wrow center' }, o.actions) : null]);
  }
  function loading(text) {
    return el('div', { cls: 'wstate loading', role: 'status' }, [el('i', { cls: 'spin', 'aria-hidden': 'true' }), el('p', { text: text || t('Loading…') })]);
  }
  function error(o) {
    return el('div', { cls: 'wstate error', role: 'alert' }, [
      icon('warn', 26), el('b', { cls: 'mi', text: o.title }), o.text ? el('p', { text: o.text }) : null,
      o.actions ? el('div', { cls: 'wrow center' }, o.actions) : null]);
  }


  /* An SVG string becomes DOM without innerHTML: it is parsed as XML, anything that
     could run or load is removed, and the result is imported. Used for the sheet
     previews, which are built from text a person typed. */
  function svgNode(str) {
    var d = new DOMParser().parseFromString(str, 'image/svg+xml');
    if (!d.documentElement || d.querySelector('parsererror')) throw new Error('bad-svg');
    var all = d.querySelectorAll('*');
    for (var i = all.length - 1; i >= 0; i--) {
      var n = all[i], tag = n.localName.toLowerCase();
      if (tag === 'script' || tag === 'foreignobject' || tag === 'iframe' || tag === 'object' || tag === 'embed') { n.parentNode.removeChild(n); continue; }
      for (var a = n.attributes.length - 1; a >= 0; a--) {
        var at = n.attributes[a], nm = at.name.toLowerCase();
        if (nm.indexOf('on') === 0) n.removeAttribute(at.name);
        else if ((nm === 'href' || nm === 'xlink:href') && !/^(data:image\/(png|jpeg|webp);base64,|#)/.test(at.value)) n.removeAttribute(at.name);
      }
    }
    return doc.importNode(d.documentElement, true);
  }

  /* ---------- images ----------
     A picked image is shrunk before it is kept: a phone photo is megabytes, and
     everything kept lives in the person's browser storage. Resolves a data: URL
     no longer than `limit` characters, or rejects with 'unreadable' / 'too-big'.
     Transparent logos stay PNG; photos become JPEG. */
  function readImage(file, o) {
    o = o || {};
    var max = o.max || 1000, limit = o.limit || 800000, keepAlpha = !!o.alpha;
    return createImageBitmap(file).then(function (bm) {
      var scale = Math.min(1, max / Math.max(bm.width, bm.height)), out = '';
      for (var round = 0; round < 6 && !out; round++) {
        var w = Math.max(1, Math.round(bm.width * scale)), h = Math.max(1, Math.round(bm.height * scale));
        var c = doc.createElement('canvas'); c.width = w; c.height = h;
        var g = c.getContext('2d');
        if (!keepAlpha) { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); }
        g.drawImage(bm, 0, 0, w, h);
        var url = c.toDataURL(keepAlpha && round < 2 ? 'image/png' : 'image/jpeg', o.quality || 0.78);
        if (url.length <= limit) out = url; else scale *= 0.75;
      }
      if (bm.close) bm.close();
      if (!out) throw new Error('too-big');
      return out;
    }, function () { throw new Error('unreadable'); });
  }

  /* Pixels of an image file or canvas, shrunk to at most `max` on the long side,
     for colour extraction. */
  function pixelsOf(source, max) {
    function fromBitmap(bm) {
      var s = Math.min(1, (max || 160) / Math.max(bm.width, bm.height)), w = Math.max(1, Math.round(bm.width * s)), h = Math.max(1, Math.round(bm.height * s));
      var c = doc.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0, w, h);
      if (bm.close) bm.close();
      var d = g.getImageData(0, 0, w, h);
      return { data: d.data, w: w, h: h };
    }
    if (source && source.getContext) return Promise.resolve(fromBitmap(source));
    return createImageBitmap(source).then(fromBitmap, function () { throw new Error('unreadable'); });
  }

  /* ---------- text from storage ----------
     The storage layer reports problems in English. These are the sentences it
     can produce; each is translated here, with counts filled in. */
  var STORAGE_TEXT = [
    'File is too large to import.', 'Not a valid JSON file.', 'Not a Color Hunter backup.', 'Not a Color Hunter backup file.',
    'The backup has no schema version.', 'This backup was made by a newer version of Color Hunter. Update the app first.',
    'The backup has no colour list.', 'The backup holds too many colours to import safely.',
    'The backup holds too many projects to import safely.', 'The backup holds too many palettes to import safely.',
    'The backup contains nothing to restore.', 'Not a Color Hunter project file.', 'The project file has no schema version.',
    'This project was made by a newer version of Color Hunter. Update the app first.',
    'The project file has no readable project in it.'
  ];
  var STORAGE_COUNTED = [
    [/^(\d+) entry was unreadable and skipped\.$/, '{n} entry was unreadable and skipped.'],
    [/^(\d+) entries were unreadable and skipped\.$/, '{n} entries were unreadable and skipped.'],
    [/^(\d+) duplicate entry collapsed\.$/, '{n} duplicate entry was merged into one.'],
    [/^(\d+) duplicate entries collapsed\.$/, '{n} duplicate entries were merged into one.'],
    [/^(\d+) item belonged to a project that is not in the file and was moved to the Inbox\.$/, '{n} item belonged to a project that is not in the file and was moved to the Inbox.'],
    [/^(\d+) items belonged to a project that is not in the file and was moved to the Inbox\.$/, '{n} items belonged to a project that is not in the file and was moved to the Inbox.']
  ];
  function tm(msg) {
    msg = String(msg || '');
    for (var i = 0; i < STORAGE_COUNTED.length; i++) {
      var m = STORAGE_COUNTED[i][0].exec(msg);
      if (m) return t(STORAGE_COUNTED[i][1], { n: m[1] });
    }
    return t(msg);
  }

  /* ---------- dates ---------- */

  function date(ts) {
    try {
      var loc = I18N.get() === 'fa' ? 'fa-IR-u-nu-latn' : 'en-GB';
      return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ts));
    } catch (e) { return new Date(ts).toISOString().slice(0, 10); }
  }

  var api = {
    el: el, fill: fill, svg: svg, debounce: debounce, icon: icon, ICONS: ICONS,
    inkOf: inkOf, normHex: normHex, strip: strip,
    button: button, chip: chip, seg: seg, field: field, hexField: hexField,
    sheet: sheet, pick: pick, empty: empty, loading: loading, error: error,
    readImage: readImage, pixelsOf: pixelsOf, svgNode: svgNode,
    tm: tm, STORAGE_TEXT: STORAGE_TEXT, STORAGE_COUNTED: STORAGE_COUNTED.map(function (x) { return x[1]; }), date: date
  };
  return api;
}));
