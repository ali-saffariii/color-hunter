/*! Color Hunter — Projects screens
 *
 *  The list of projects, one project's colours / palettes / notes, and every
 *  action on them. All changes go through CHData, which plans them, writes them
 *  in one transaction and only then tells the screen; this file never touches
 *  storage itself and never decides whether something is allowed — a refusal
 *  comes back as { ok:false } and CHWS.fail turns it into words (or the upgrade
 *  sheet, for a free-tier limit).
 */
(function (root, factory) {
  factory(root.CHUI, root.CHI18N, root.CHData, root.CHWS, root.CHStore, root.CHProjects, root.CHStudio, root.CHExport);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (UI, I18N, Data, WS, Store, Projects, Studio, Exp) {
  'use strict';

  var el = UI.el, fill = UI.fill, icon = UI.icon;
  var t = function (k, v) { return I18N.t(k, v); };
  var app = function () { return WS.app(); };

  var st = { screen: 'list', pid: null, q: '', sort: 'recent', archived: false, seg: 'colors', cq: '', csort: 'new', ccat: '', sel: null, quiet: false };
  var host = {};          // live containers a search box or toggle redraws without rebuilding the screen
  var pendingNotes = null;

  /* ---------- small words ---------- */

  function cn(n) { return t(n === 1 ? '{n} color' : '{n} colors', { n: n }); }
  function pn(n) { return t(n === 1 ? '{n} palette' : '{n} palettes', { n: n }); }
  function catLabel(id) { return id ? t(Projects.CATEGORY_LABELS[id] || 'Other') : t('No use set'); }
  var KINDS = { manual: 'Manual', harmony: 'Harmony', image: 'From a photo', scale: 'Scale', system: 'UI system' };
  function kindLabel(k) { return t(KINDS[k] || 'Manual'); }
  function nameOfPid(pid) { var p = pid ? Data.project(pid) : null; return p ? p.name : t('Inbox'); }
  function button(o) { return UI.button(o); }

  /* ---------- entry points ---------- */

  function enter(p) {
    if (p.pid !== undefined) { st.screen = 'detail'; st.pid = p.pid; st.seg = p.seg || 'colors'; st.sel = null; st.cq = ''; st.ccat = ''; }
    else if (p.list) { st.screen = 'list'; st.sel = null; }
    if (st.screen === 'detail' && st.pid && !Data.project(st.pid)) st.screen = 'list';
    if (p.create) setTimeout(function () { projectForm(null); }, 60);
  }
  function back() {
    flushNotes();
    if (st.screen === 'detail') { st.screen = 'list'; st.sel = null; return true; }
    return false;
  }

  Data.onChange(function (kind) {
    if (kind === 'active' && WS.isOpen() && WS.tab() === 'projects') { WS.refresh(); return; }
    if (WS.isOpen() && WS.tab() === 'projects' && !st.quiet) WS.refresh();
  });

  function view() {
    if (app().storageProblem && app().storageProblem())
      return { key: 'nostore', title: t('Projects'), body: UI.error({ title: t('Projects need storage on this device'), text: app().storageProblem() }) };
    if (!Data.isReady()) return { key: 'loading', title: t('Projects'), body: UI.loading(t('Opening your saved colors…')) };
    return st.screen === 'detail' ? detailView() : listView();
  }

  /* =====================================================================
     the list
     ===================================================================== */

  function listView() {
    var counts = Data.counts();
    var search = el('input', { type: 'search', placeholder: t('Search projects'), 'aria-label': t('Search projects'), autocomplete: 'off' });
    search.value = st.q;
    var chips = el('div', { cls: 'chips', role: 'group', 'aria-label': t('Sort') });
    var list = el('div');
    host.list = list; host.chips = chips;
    search.addEventListener('input', function () { st.q = search.value; drawList(); });

    function drawChips() {
      var nArch = Data.projects().filter(function (p) { return p.archived; }).length;
      var items = [['recent', 'Recent'], ['name', 'Name'], ['created', 'Created']].map(function (s) {
        return UI.chip({ label: t(s[1]), on: st.sort === s[0], onclick: function () { st.sort = s[0]; drawChips(); drawList(); } });
      });
      items.push(UI.chip({ label: t('Archived') + (nArch ? ' · ' + nArch : ''), icon: 'archive', on: st.archived, onclick: function () { st.archived = !st.archived; drawChips(); drawList(); } }));
      fill(chips, items);
    }
    function drawList() { fill(list, listItems(counts)); }
    drawChips(); drawList();

    var free = app().pro && !app().pro.isPro();
    var lim = app().pro ? app().pro.canCreate('project', Data.activeCount()) : { ok: true };
    var limitLine = null;
    if (free) {
      limitLine = lim.ok
        ? el('p', { cls: 'hintx', text: t('{used} of {limit} active projects on Free.', { used: Data.activeCount(), limit: lim.limit }) })
        : el('div', { cls: 'limitbar' }, [el('span', { text: t('You have {n} active projects, the most Free allows. Archive one, or go Pro for no limit.', { n: lim.used }) }), button({ label: t('Go Pro'), kind: 'primary', cls: 'sm', onclick: function () { WS.go('pro'); } })]);
    }

    return {
      key: 'projects:list', title: t('Projects'),
      actions: [
        button({ icon: 'upload', title: t('Open a project file'), onclick: importFile }),
        button({ icon: WS.resolveTheme(app().settings.theme) === 'dark' ? 'moon' : 'sun', title: t('Appearance'), onclick: WS.appearanceSheet })],
      body: [
        el('div', { cls: 'bar2' }, [el('div', { cls: 'sch' }, [icon('search', 18), search]), button({ label: t('New'), icon: 'plus', kind: 'primary', onclick: function () { projectForm(null); } })]),
        chips, limitLine, list]
    };
  }

  function listItems(counts) {
    var q = st.q.trim(), all = Data.projects();
    var shown = Projects.filterProjects(all, { q: q, archived: st.archived, sort: st.sort });
    var items = [];
    var inboxN = (counts[''] || { colors: 0 }).colors;
    var showInbox = !st.archived && (!q || /inbox/i.test(q) || t('Inbox').toLowerCase().indexOf(q.toLowerCase()) >= 0) && (inboxN || all.length);
    if (showInbox) items.push(inboxCard(counts['']));
    shown.forEach(function (p) { items.push(projectCard(p, counts[p.id] || { colors: 0, palettes: 0 })); });
    if (!shown.length && !showInbox) {
      if (q) return UI.empty({ title: t('Nothing matches'), text: t('Try a different word, or clear the search.') });
      if (st.archived) return UI.empty({ art: 'projects', title: t('No archived projects'), text: t('Projects you archive wait here with everything in them, and can be restored any time.') });
      return UI.empty({
        art: 'projects', title: t('Your first project'),
        text: t('A project keeps the colors, palettes and notes for one job together, so you can find them again and hand them over.'),
        actions: [button({ label: t('New project'), icon: 'plus', kind: 'primary', onclick: function () { projectForm(null); } }), button({ label: t('Open a project file'), icon: 'upload', onclick: importFile })]
      });
    }
    return el('div', { cls: 'plist' }, items);
  }

  function metaLine(n, extra) {
    return [cn(n.colors), pn(n.palettes)].concat(extra || []).join('  ·  ');
  }
  function projectCard(p, n) {
    var rec = Data.active() === p.id;
    return el('button', { type: 'button', cls: 'pcard' + (p.archived ? ' arch' : ''), onclick: function () { openProject(p.id); }, 'aria-label': p.name }, [
      UI.strip(Data.identity(p.id, 5)),
      el('div', { cls: 'pb' }, [
        el('b', { cls: 'nm', text: p.name }),
        el('span', { cls: 'meta', text: metaLine(n) }),
        p.client ? el('span', { cls: 'sub', text: p.client }) : null,
        el('span', { cls: 'sub', text: t('Updated {date}', { date: UI.date(p.u) }) }),
        rec ? el('span', { cls: 'rec' }, [el('i'), el('span', { text: t('Saving camera colors here') })]) : null])]);
  }
  function inboxCard(n) {
    n = n || { colors: 0, palettes: 0 };
    var rec = Data.active() === '';
    return el('button', { type: 'button', cls: 'pcard inbox', onclick: function () { openProject(''); }, 'aria-label': t('Inbox') }, [
      UI.strip(Data.identity('', 5)),
      el('div', { cls: 'pb' }, [
        el('b', { cls: 'nm', text: t('Inbox') }),
        el('span', { cls: 'meta', text: metaLine(n) }),
        el('span', { cls: 'sub', text: t('Colors saved without a project') }),
        rec ? el('span', { cls: 'rec' }, [el('i'), el('span', { text: t('Saving camera colors here') })]) : null])]);
  }
  function openProject(pid) { st.screen = 'detail'; st.pid = pid; st.seg = 'colors'; st.sel = null; st.cq = ''; st.ccat = ''; WS.refresh({ keepScroll: false }); }

  /* ---------- create and edit ---------- */

  function projectForm(p) {
    var editing = !!p, logo = p ? p.logo : '';
    var name = UI.field({ label: t('Project name'), value: p ? p.name : '', max: 80, placeholder: t('Brand refresh, kitchen, spring catalogue…') });
    var client = UI.field({ label: t('Client'), value: p ? p.client : '', max: 80 });
    var desc = UI.field({ label: t('Description'), type: 'textarea', value: p ? p.desc : '', max: 500, rows: 3, hint: t('Shown on brand sheets and exports.') });
    var logoBox = el('div', { cls: 'wfield' });
    var fileIn = el('input', { type: 'file', accept: 'image/*', cls: 'hid', 'aria-hidden': 'true', tabindex: '-1' });
    function drawLogo() {
      fill(logoBox, [el('label', { text: t('Logo') }), el('div', { cls: 'logo' }, [
        logo ? el('img', { src: logo, alt: '' }) : icon('image', 26),
        el('div', { cls: 'lt', text: logo ? t('Used on the brand sheet.') : t('Optional. A PNG with a transparent background works best.') }),
        button({ label: logo ? t('Change') : t('Choose'), cls: 'sm', onclick: function () { fileIn.click(); } }),
        logo ? button({ icon: 'trash', title: t('Remove logo'), cls: 'sm only', onclick: function () { logo = ''; drawLogo(); } }) : null])]);
    }
    drawLogo();
    fileIn.addEventListener('change', function () {
      var f = fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      UI.readImage(f, { max: 360, limit: 380000, alpha: true }).then(function (u) { logo = u; drawLogo(); },
        function () { app().toast(t('That image could not be used. Pick a PNG or JPG.')); });
    });
    var sh = UI.sheet({
      title: editing ? t('Project info') : t('New project'),
      body: [name.root, client.root, desc.root, logoBox, fileIn],
      actions: [
        button({ label: t('Cancel'), onclick: function () { sh.close(); } }),
        button({ label: editing ? t('Save') : t('Create project'), kind: 'primary', onclick: save })]
    });
    setTimeout(function () { if (!editing) name.input.focus(); }, 280);
    name.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
    function save() {
      var nm = name.get().trim();
      if (!nm) { name.input.setAttribute('aria-invalid', 'true'); name.input.focus(); app().toast(t('Give the project a name.')); return; }
      var fields = { name: nm, client: client.get().trim(), desc: desc.get().trim(), logo: logo };
      if (editing) {
        Data.updateProject(p.id, fields).then(function (r) { if (!r.ok) return WS.fail(r); sh.close(); app().toast(t('Saved.')); });
      } else {
        Data.createProject(fields).then(function (r) {
          if (!r.ok) { if (r.reason === 'limit') sh.close(); return WS.fail(r); }
          sh.close();
          var pid = r.project.id, msg = t('Project created.');
          if (Data.active() === '' && Data.setActive(pid)) msg = t('Project created. Camera colors now save to it.');
          app().toast(msg, 3400); app().snd('lock');
          openProject(pid);
        });
      }
    }
  }

  function importFile() {
    var inp = el('input', { type: 'file', accept: 'application/json,.json', cls: 'hid', 'aria-hidden': 'true', tabindex: '-1' });
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files[0]; inp.remove();
      if (!f) return;
      if (f.size > 64 * 1024 * 1024) return app().toast(t('That file is too large to be a Color Hunter project.'));
      f.text().then(function (text) {
        return Data.importBundle(text).then(function (r) {
          if (!r.ok) return WS.fail(r);
          app().toast(t('Project “{name}” added as a copy.', { name: r.project.name }), 3600);
          openProject(r.project.id);
        });
      }, function () { app().toast(t('That file could not be read.')); });
    });
    inp.click();
  }

  /* =====================================================================
     one project
     ===================================================================== */

  function detailView() {
    var pid = st.pid, isInbox = pid === '', p = isInbox ? null : Data.project(pid);
    if (!isInbox && !p) { st.screen = 'list'; return listView(); }
    var identity = Data.identity(pid, 5), n = Data.counts()[pid] || { colors: 0, palettes: 0 };
    var content = el('div');
    host.content = content;

    var segs = [{ id: 'colors', label: t('Colors') + ' · ' + n.colors }, { id: 'palettes', label: t('Palettes') + ' · ' + n.palettes }];
    if (!isInbox) segs.push({ id: 'notes', label: t('Notes') });
    if (!segs.some(function (s) { return s.id === st.seg; })) st.seg = 'colors';
    var seg = UI.seg({ options: segs, value: st.seg, aria: t('Project sections'), onChange: function (v) { flushNotes(); st.seg = v; st.sel = null; drawContent(); } });

    function drawContent() {
      host.sel = null;
      if (st.seg === 'colors') fill(content, colorsContent(pid, isInbox));
      else if (st.seg === 'palettes') fill(content, palettesContent(pid));
      else fill(content, notesContent(pid));
    }
    drawContent();

    var body = [el('div', { cls: 'bleed' }, UI.strip(identity, { cls: 'tall' }))];
    if (p && (p.desc || p.client)) {
      body.push(el('div', { cls: 'pinfo', style: '--proj:' + (identity[0] || 'var(--ink)') }, [
        p.client ? el('small', { text: t('Client') + ': ' + p.client }) : null,
        p.desc ? el('p', { text: p.desc }) : null,
        el('small', { text: t('Updated {date}', { date: UI.date(p.u) }) })]));
    }
    if (!p || !p.archived) body.push(destination(pid, isInbox));
    else body.push(el('p', { cls: 'hintx', text: t('This project is archived. Restore it from the menu to save camera colors here.') }));
    body.push(el('div', { style: 'margin-top:14px' }, seg.root), content);

    return {
      key: 'projects:' + pid, back: true, title: isInbox ? t('Inbox') : p.name,
      sub: isInbox ? t('Colors saved without a project') : [p.archived ? t('Archived') : '', p.client].filter(Boolean).join(' · '),
      actions: [
        button({ icon: 'export', title: t('Export'), onclick: function () { WS.go('export', { pid: pid }); } }),
        isInbox ? null : button({ icon: 'more', title: t('More'), onclick: function () { projectMenu(p); } })],
      body: body
    };
  }

  /* where camera colours go */
  function destination(pid, isInbox) {
    var on = Data.active() === pid;
    return el('div', { cls: 'dest' + (on ? ' on' : '') }, [
      icon('camera', 22),
      el('div', { cls: 'dt' }, [el('b', { text: on ? t('Camera saves here') : t('Camera saves elsewhere') }),
        el('small', { text: on ? (isInbox ? t('New colors go to the Inbox.') : t('New colors from the camera go into this project.')) : t('Currently saving to {name}.', { name: nameOfPid(Data.active()) }) })]),
      on && isInbox ? null : button({
        label: on ? t('Stop') : t('Save here'), cls: 'sm', kind: 'ghost',
        onclick: function () { Data.setActive(on ? '' : pid); app().snd('tick'); app().toast(on ? t('Camera colors now go to the Inbox.') : t('Camera colors now save to “{name}”.', { name: nameOfPid(pid) })); }
      })]);
  }

  /* ---------- the menu ---------- */

  function projectMenu(p) {
    var items = [
      { value: 'edit', label: t('Edit info'), icon: 'pencil' },
      { value: 'duplicate', label: t('Duplicate'), sub: t('A full independent copy'), icon: 'copy' },
      { value: 'archive', label: p.archived ? t('Restore from archive') : t('Archive'), sub: p.archived ? null : t('Hide it from the list; nothing is deleted'), icon: 'archive' },
      { value: 'file', label: t('Save project file'), sub: t('Everything in this project, to share or keep'), icon: 'download' },
      { value: 'delete', label: t('Delete…'), icon: 'trash' }];
    UI.pick({ title: p.name, items: items }).then(function (v) {
      if (v === 'edit') projectForm(p);
      else if (v === 'duplicate') Data.duplicateProject(p.id, t('copy')).then(function (r) { if (!r.ok) return WS.fail(r); app().toast(t('Duplicated.')); openProject(r.project.id); });
      else if (v === 'archive') Data.archiveProject(p.id, !p.archived).then(function (r) {
        if (!r.ok) return WS.fail(r);
        app().toast(p.archived ? t('Restored.') : t('Archived.'));
        if (!p.archived) { st.screen = 'list'; WS.refresh({ keepScroll: false }); }
      });
      else if (v === 'file') saveFile(p);
      else if (v === 'delete') deleteFlow(p);
    });
  }

  function saveFile(p) {
    var b = Data.bundleOf(p.id, app().version);
    if (!b) return app().toast(t('That item no longer exists.'));
    app().download(Exp.fileName(p.name, 'project', 'json'), new Blob([JSON.stringify(b)], { type: 'application/json' }));
    app().toast(t('Project file saved.'));
  }

  function deleteFlow(p) {
    var n = Data.colorsOf(p.id).length, q = Data.palettesOf(p.id).length, has = n || q;
    app().ask(t('Delete “{name}”?', { name: p.name }),
      has ? t('It holds {colors} and {palettes}. Keep them in the Inbox, or delete them with the project.', { colors: cn(n), palettes: pn(q) }) : t('This project is empty.'),
      has ? [{ label: t('Keep in Inbox'), value: 'keep' }, { label: t('Delete everything'), value: 'all' }, { label: t('Cancel'), value: null }]
          : [{ label: t('Delete project'), value: 'all' }, { label: t('Cancel'), value: null }]).then(function (how) {
      if (!how) return;
      Data.deleteProject(p.id, how === 'keep').then(function (r) {
        if (!r.ok) return WS.fail(r);
        st.screen = 'list'; st.sel = null;
        app().toast(how === 'keep' && has ? t('Project deleted. Its colors are in the Inbox.') : t('Project deleted.'), 3600);
        WS.refresh({ keepScroll: false });
      });
    });
  }

  /* where to? — a project, or the Inbox */
  function chooseProject(o) {
    var items = [];
    if (o.inbox !== false && o.exclude !== '') items.push({ value: '', label: t('Inbox'), sub: t('Colors saved without a project'), icon: 'folder', on: o.current === '' });
    Projects.filterProjects(Data.projects(), { archived: false, sort: 'recent' }).forEach(function (p) {
      if (p.id === o.exclude) return;
      items.push({ value: p.id, label: p.name, sub: p.client || null, colors: Data.identity(p.id, 5), on: o.current === p.id });
    });
    if (!items.length) { app().toast(t('There is nowhere else to move it. Create a project first.')); return Promise.resolve(undefined); }
    return UI.pick({ title: o.title, items: items });
  }

  /* =====================================================================
     colours
     ===================================================================== */

  function colorsContent(pid, isInbox) {
    var all = Data.colorsOf(pid);
    if (!all.length) {
      return UI.empty({
        art: 'palette', title: t('No colors yet'),
        text: isInbox ? t('Colors you save from the camera without a project collect here.') : t('Save colors from the camera into this project, or add one by its code.'),
        actions: [
          button({ label: t('Use the camera'), icon: 'camera', kind: 'primary', onclick: function () { var pr = pid && Data.project(pid); if (pr && !pr.archived) Data.setActive(pid); WS.close(); app().toast(pid ? t('Camera colors now save to “{name}”.', { name: nameOfPid(pid) }) : t('Hold your finger on a color to measure it.')); } }),
          button({ label: t('Add by code'), icon: 'plus', onclick: function () { addByCode(pid); } })]
      });
    }
    var counts = {};
    all.forEach(function (c) { counts[c.cat || ''] = (counts[c.cat || ''] || 0) + 1; });
    if (st.ccat && !counts[st.ccat]) st.ccat = '';
    var search = el('input', { type: 'search', placeholder: t('Search colors'), 'aria-label': t('Search colors'), autocomplete: 'off' });
    search.value = st.cq;
    var sort = el('select', { 'aria-label': t('Sort'), cls: 'sortsel' }, [['new', 'Newest'], ['hue', 'Hue'], ['light', 'Lightness'], ['name', 'Name']].map(function (s) { return el('option', { value: s[0], text: t(s[1]) }); }));
    sort.value = st.csort;
    var chips = el('div', { cls: 'chips', role: 'group', 'aria-label': t('Filter by use') });
    var grid = el('div', { cls: 'sgrid' });
    var selBar = el('div');
    host.grid = grid;
    function visible() { return Projects.filterColors(Data.colorsOf(pid), { pid: pid, q: st.cq, cat: st.ccat, sort: st.csort }); }
    function drawChips() {
      var keys = Object.keys(counts).filter(function (k) { return k; });
      if (!keys.length) { fill(chips, []); chips.hidden = true; return; }
      chips.hidden = false;
      var items = [UI.chip({ label: t('All') + ' · ' + all.length, on: !st.ccat, onclick: function () { st.ccat = ''; drawChips(); drawGrid(); } })];
      Store.CATEGORIES.forEach(function (k) {
        if (counts[k]) items.push(UI.chip({ label: catLabel(k) + ' · ' + counts[k], on: st.ccat === k, onclick: function () { st.ccat = k; drawChips(); drawGrid(); } }));
      });
      fill(chips, items);
    }
    function drawGrid() {
      var list = visible();
      if (!list.length) fill(grid, el('div', { style: 'grid-column:1/-1' }, UI.empty({ title: t('Nothing matches'), text: t('Try a different word, or clear the filter.') })));
      else fill(grid, list.map(tile));
    }
    function tile(c) {
      var sel = st.sel && st.sel[c.id];
      return el('button', {
        type: 'button', cls: 'sw1' + (sel ? ' sel' : ''), 'aria-pressed': st.sel ? (sel ? 'true' : 'false') : null,
        'aria-label': [c.p || c.h, c.note || app().tName(c.n)].filter(Boolean).join(', '),
        onclick: function () { if (st.sel) { toggle(c.id); } else colorSheet(c); }
      }, [
        el('span', { cls: 'blk', bg: c.h }, [c.img ? el('img', { src: c.img, alt: '' }) : null, el('span', { cls: 'mark' }, icon('check', 14)), c.cat ? el('span', { cls: 'cat', text: catLabel(c.cat) }) : null]),
        el('b', { cls: 'ltr', text: c.p || c.h }), el('small', { text: c.note || app().tName(c.n) || '' })]);
    }
    function toggle(id) { if (st.sel[id]) delete st.sel[id]; else st.sel[id] = true; drawGrid(); drawSel(); }
    function selIds() { return Object.keys(st.sel || {}); }
    function drawSel() {
      if (!st.sel) { fill(selBar, []); return; }
      var ids = selIds();
      var has = ids.length > 0;
      fill(selBar, el('div', { cls: 'selbar' }, [
        el('b', { text: has ? cn(ids.length) : t('Tap colors to select them') }),
        button({ label: t('All'), cls: 'sm', onclick: function () { visible().forEach(function (c) { st.sel[c.id] = true; }); drawGrid(); drawSel(); } }),
        has ? button({ icon: 'move', title: t('Move to…'), cls: 'sm only', onclick: function () { bulkMove(ids, pid); } }) : null,
        has ? button({ icon: 'tag', title: t('Set use'), cls: 'sm only', onclick: function () { bulkUse(ids); } }) : null,
        has ? button({ icon: 'studio', title: t('Open in Studio'), cls: 'sm only', onclick: function () { bulkStudio(ids, pid); } }) : null,
        has ? button({ icon: 'trash', title: t('Delete'), cls: 'sm only danger', onclick: function () { bulkDelete(ids); } }) : null,
        button({ label: t('Done'), cls: 'sm', onclick: function () { st.sel = null; drawGrid(); drawSel(); drawTools(); } })]));
    }
    var tools = el('div', { cls: 'wrow' });
    function drawTools() {
      fill(tools, [
        button({ label: t('Select'), icon: 'check', cls: 'sm', onclick: function () { st.sel = {}; drawGrid(); drawSel(); fill(tools, []); } }),
        button({ label: t('Add by code'), icon: 'plus', cls: 'sm', onclick: function () { addByCode(pid); } })]);
      tools.hidden = !!st.sel;
    }
    search.addEventListener('input', function () { st.cq = search.value; drawGrid(); });
    sort.addEventListener('change', function () { st.csort = sort.value; drawGrid(); });
    drawChips(); drawGrid(); drawSel(); drawTools();
    return [
      el('div', { cls: 'bar2', style: 'margin-top:14px' }, [el('div', { cls: 'sch' }, [icon('search', 18), search]), sort]),
      tools, chips, el('div', { style: 'margin-top:10px' }, grid), selBar];
  }

  function bulkMove(ids, from) {
    chooseProject({ title: t('Move {n} to…', { n: ids.length }), exclude: from }).then(function (to) {
      if (to === undefined) return;
      Data.moveColors(ids, to).then(function (r) {
        if (!r.ok) return WS.fail(r);
        st.sel = null; app().toast(t('Moved to {name}.', { name: nameOfPid(to) }));
      });
    });
  }
  function bulkUse(ids) {
    var items = [{ value: '', label: t('No use set') }].concat(Store.CATEGORIES.map(function (k) { return { value: k, label: catLabel(k) }; }));
    UI.pick({ title: t('What are these for?'), items: items }).then(function (v) {
      if (v === undefined) return;
      Data.categorise(ids, v).then(function (r) { if (!r.ok) return WS.fail(r); st.sel = null; app().toast(t('Saved.')); });
    });
  }
  function bulkStudio(ids, pid) {
    var hexes = ids.map(function (i) { var c = Data.color(i); return c && c.h; }).filter(Boolean);
    WS.go('studio', { colors: hexes, pid: pid, source: 'colors' });
  }
  function bulkDelete(ids) {
    app().ask(t(ids.length === 1 ? 'Delete this color?' : 'Delete {n} colors?', { n: ids.length }), t('They are removed from this device. This cannot be undone.'),
      [{ label: t('Delete'), value: true }, { label: t('Cancel'), value: null }]).then(function (ok) {
      if (!ok) return;
      Data.deleteColors(ids).then(function (r) { if (!r.ok) return WS.fail(r); st.sel = null; app().toast(t('Deleted.')); });
    });
  }

  function addByCode(pid) {
    var hex = UI.hexField({ label: t('Color code'), value: '#3366CC' });
    var note = UI.field({ label: t('Note'), value: '', max: 120, placeholder: t('Where is it from? What is it for?') });
    var sh = UI.sheet({
      title: t('Add a color'), sub: pid ? t('To {name}', { name: nameOfPid(pid) }) : t('To the Inbox'),
      body: [hex.root, note.root, el('p', { cls: 'hintx', text: t('Type a code like #3366CC or pick one. The nearest Pantone and RAL are worked out for you.') })],
      actions: [button({ label: t('Cancel'), onclick: function () { sh.close(); } }),
        button({ label: t('Add'), kind: 'primary', onclick: function () {
          var h = hex.get();
          if (!h) return app().toast(t('That is not a color code. Use six digits, like #3366CC.'));
          var e = app().makeEntry(h, { note: note.get().trim() });
          if (!e) return app().toast(t('That color could not be saved.'));
          Data.addColor(e, pid).then(function (r) { if (!r.ok) return WS.fail(r); sh.close(); app().snd('lock'); app().toast(t('Color added.')); });
        } })]
    });
  }

  function colorSheet(c) {
    var f = Studio.formats(c.h), ink = UI.inkOf(c.h);
    var rows = [['HEX', f.hex], ['RGB', f.rgb], ['HSL', f.hsl], ['OKLCH', f.oklch], ['Lab', f.lab], ['CMYK (estimate, no ICC profile)', f.cmyk]];
    if (c.p) rows.unshift(['Pantone', c.p]);
    if (c.r) rows.splice(c.p ? 1 : 0, 0, ['RAL', c.r.replace(/^RAL\s*/, '')]);
    var note = UI.field({ label: t('Note'), type: 'textarea', value: c.note || '', max: 500, rows: 2 });
    var use = UI.field({ label: t('Use'), type: 'select', value: c.cat || '', options: [{ id: '', label: t('No use set') }].concat(Store.CATEGORIES.map(function (k) { return { id: k, label: catLabel(k) }; })) });
    var head = el('div', { style: 'background:' + c.h + ';color:' + ink + ';padding:18px 16px;margin:0 -18px;display:grid;gap:2px' }, [
      el('b', { cls: 'mi ltr', style: 'font-size:15px', text: c.p ? 'Pantone ' + c.p : c.h }),
      el('span', { text: app().tName(c.n) || '' }),
      el('small', { style: 'opacity:.8', text: nameOfPid(c.pid) + (c.l ? '  ·  ' + t(c.l) : '') })]);
    var sh = UI.sheet({
      title: t('Color'), wide: false,
      body: [head, el('div', { cls: 'codes' }, rows.map(function (r) {
        return el('button', { type: 'button', cls: 'code', onclick: function () { app().copy(r[1]); } }, [el('span', { text: t(r[0]) }), el('b', { cls: 'ltr', text: r[1] })]);
      })), el('p', { cls: 'hintx', text: t('Tap any row to copy it.') }), note.root, use.root],
      actions: [
        button({ icon: 'trash', title: t('Delete'), cls: 'only danger', onclick: function () { sh.close(); bulkDelete([c.id]); } }),
        button({ icon: 'move', title: t('Move to…'), cls: 'only', onclick: function () { sh.close(); bulkMove([c.id], c.pid); } }),
        button({ icon: 'studio', label: t('Studio'), onclick: function () { sh.close(); WS.go('studio', { colors: [c.h], pid: c.pid, source: 'color' }); } }),
        button({ label: t('Save'), kind: 'primary', onclick: function () {
          Data.updateColor(Object.assign({}, c, { note: note.get().trim().slice(0, 500), cat: use.get() })).then(function (r) { if (!r.ok) return WS.fail(r); sh.close(); app().toast(t('Saved.')); });
        } })]
    });
  }

  /* =====================================================================
     palettes
     ===================================================================== */

  function palettesContent(pid) {
    var list = Data.palettesOf(pid).slice().sort(function (a, b) { return (b.u || b.t) - (a.u || a.t); });
    var make = button({ label: t('New palette'), icon: 'plus', kind: 'primary', onclick: function () { newPalette(pid); } });
    if (!list.length) {
      return UI.empty({ art: 'palette', title: t('No palettes yet'), text: t('Build one in the Studio from a color, a photo or a harmony, then save it here.'), actions: [make] });
    }
    var free = app().pro && !app().pro.isPro() && pid;
    var lim = app().pro ? app().pro.canCreate('palette', list.length) : { ok: true };
    return [
      el('div', { cls: 'wrow between', style: 'margin-top:14px' }, [free ? el('span', { cls: 'hintx', style: 'margin:0', text: t('{used} of {limit} palettes on Free.', { used: list.length, limit: lim.limit || list.length }) }) : el('span'), make]),
      el('div', { cls: 'plist', style: 'margin-top:12px' }, list.map(function (q) {
        return el('button', { type: 'button', cls: 'pcard', onclick: function () { paletteSheet(q); }, 'aria-label': q.name }, [
          UI.strip(q.colors.map(function (c) { return c.h; })),
          el('div', { cls: 'pb' }, [el('b', { cls: 'nm', text: q.name }), el('span', { cls: 'meta', text: kindLabel(q.kind) + '  ·  ' + cn(q.colors.length) }),
            el('span', { cls: 'sub', text: t('Updated {date}', { date: UI.date(q.u) }) })])]);
      }))];
  }

  function newPalette(pid) {
    var hexes = [];
    Data.colorsOf(pid).forEach(function (c) { if (hexes.indexOf(c.h) < 0 && hexes.length < 8) hexes.push(c.h); });
    WS.go('studio', { colors: hexes, pid: pid, source: 'project', fresh: true });
  }

  function paletteSheet(q) {
    var head = el('div', null, [UI.strip(q.colors.map(function (c) { return c.h; }), { cls: 'tall' }),
      el('p', { cls: 'hintx', text: kindLabel(q.kind) + '  ·  ' + cn(q.colors.length) + '  ·  ' + nameOfPid(q.pid) })]);
    UI.pick({
      title: q.name, head: head, items: [
        { value: 'studio', label: t('Edit in Studio'), icon: 'studio' },
        { value: 'export', label: t('Export'), sub: t('Sheets, CSS, tokens, SVG'), icon: 'export' },
        { value: 'rename', label: t('Rename'), icon: 'pencil' },
        { value: 'duplicate', label: t('Duplicate'), icon: 'copy' },
        { value: 'move', label: t('Move to…'), icon: 'move' },
        { value: 'delete', label: t('Delete'), icon: 'trash' }]
    }).then(function (v) {
      if (v === 'studio') WS.go('studio', { palette: q.id });
      else if (v === 'export') WS.go('export', { pid: q.pid, palette: q.id });
      else if (v === 'rename') renamePalette(q);
      else if (v === 'duplicate') Data.duplicatePalette(q.id, t('copy')).then(function (r) { if (!r.ok) return WS.fail(r); app().toast(t('Duplicated.')); });
      else if (v === 'move') chooseProject({ title: t('Move palette to…'), exclude: q.pid, current: q.pid }).then(function (to) {
        if (to === undefined) return;
        Data.movePalette(q.id, to).then(function (r) { if (!r.ok) return WS.fail(r); app().toast(t('Moved to {name}.', { name: nameOfPid(to) })); });
      });
      else if (v === 'delete') app().ask(t('Delete “{name}”?', { name: q.name }), t('The palette is removed. The colors saved in the project stay.'), [{ label: t('Delete'), value: true }, { label: t('Cancel'), value: null }]).then(function (ok) {
        if (ok) Data.deletePalette(q.id).then(function (r) { if (!r.ok) return WS.fail(r); app().toast(t('Deleted.')); });
      });
    });
  }
  function renamePalette(q) {
    var name = UI.field({ label: t('Palette name'), value: q.name, max: 60 });
    var sh = UI.sheet({ title: t('Rename'), body: name.root, actions: [button({ label: t('Cancel'), onclick: function () { sh.close(); } }), button({ label: t('Save'), kind: 'primary', onclick: function () {
      var nm = name.get().trim();
      if (!nm) return app().toast(t('Give it a name.'));
      Data.savePalette(Object.assign({}, q, { name: nm })).then(function (r) { if (!r.ok) return WS.fail(r); sh.close(); app().toast(t('Saved.')); });
    } })] });
  }

  /* =====================================================================
     notes and references
     ===================================================================== */

  function flushNotes() {
    if (!pendingNotes) return;
    var n = pendingNotes; pendingNotes = null;
    st.quiet = true;
    Data.updateProject(n.pid, { notes: n.value }).then(function () { st.quiet = false; });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushNotes(); });
  addEventListener('pagehide', flushNotes);

  function notesContent(pid) {
    var p = Data.project(pid);
    if (!p) return [];
    var status = el('small', { cls: 'hintx', style: 'margin:0', 'aria-live': 'polite' });
    var area = UI.field({ label: t('Notes'), type: 'textarea', value: p.notes, max: 2000, rows: 7, hint: t('Saved as you type.') });
    var save = UI.debounce(function () {
      var value = area.get(); pendingNotes = null; st.quiet = true;
      Data.updateProject(pid, { notes: value }).then(function (r) { st.quiet = false; status.textContent = r.ok ? t('Saved') : t('Not saved'); if (!r.ok) WS.fail(r); });
    }, 700);
    area.input.addEventListener('input', function () { pendingNotes = { pid: pid, value: area.get() }; status.textContent = ''; save(); });

    var refsBox = el('div');
    var fileIn = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', cls: 'hid', 'aria-hidden': 'true', tabindex: '-1' });
    function drawRefs() {
      var cur = Data.project(pid), refs = cur ? cur.refs : [];
      fill(refsBox, [
        refs.length ? el('div', { cls: 'refs' }, refs.map(function (r) {
          return el('figure', null, el('button', { type: 'button', 'aria-label': t('View reference image'), onclick: function () { viewRef(r); } }, el('img', { src: r.img, alt: '' })));
        })) : UI.empty({ art: 'image', title: t('No reference images'), text: t('Add a moodboard, a logo, a photo of the room — anything this palette has to live with.') }),
        el('div', { cls: 'wrow', style: 'margin-top:10px' }, [button({ label: t('Add images'), icon: 'image', onclick: function () { fileIn.click(); } }),
          el('span', { cls: 'hintx', style: 'margin:0', text: t('{n} of 12', { n: refs.length }) })])]);
    }
    function viewRef(r) {
      var sh = UI.sheet({ title: t('Reference image'), body: el('img', { src: r.img, alt: '', style: 'width:100%;max-height:62dvh;object-fit:contain;background:var(--card)' }),
        actions: [button({ label: t('Remove'), icon: 'trash', kind: 'danger', onclick: function () {
          var cur = Data.project(pid); if (!cur) return;
          st.quiet = true;
          Data.updateProject(pid, { refs: cur.refs.filter(function (x) { return x.id !== r.id; }) }).then(function (res) { st.quiet = false; if (!res.ok) return WS.fail(res); sh.close(); drawRefs(); });
        } }), button({ label: t('Close'), onclick: function () { sh.close(); } })] });
    }
    fileIn.addEventListener('change', function () {
      var files = [].slice.call(fileIn.files); fileIn.value = '';
      var cur = Data.project(pid); if (!cur || !files.length) return;
      var room = 12 - cur.refs.length;
      if (room <= 0) return app().toast(t('A project holds up to 12 reference images.'));
      var take = files.slice(0, room), added = [];
      take.reduce(function (chain, f) {
        return chain.then(function () { return UI.readImage(f, { max: 1000, limit: 850000 }).then(function (u) { added.push({ id: '', img: u, cap: '' }); }, function () { /* skip unreadable */ }); });
      }, Promise.resolve()).then(function () {
        if (!added.length) return app().toast(t('Those images could not be used. Pick JPG or PNG files.'));
        st.quiet = true;
        return Data.updateProject(pid, { refs: cur.refs.concat(added) }).then(function (r) {
          st.quiet = false;
          if (!r.ok) return WS.fail(r);
          drawRefs();
          app().toast(files.length > take.length ? t('Added {n}. A project holds up to 12.', { n: added.length }) : t('Added.'));
        });
      });
    });
    drawRefs();
    return [el('div', { style: 'margin-top:6px' }, area.root), status, el('h3', { cls: 'wh2', text: t('Reference images') }), refsBox, fileIn];
  }

  WS.register('projects', { enter: enter, view: view, back: back });
  return { state: st };
}));
