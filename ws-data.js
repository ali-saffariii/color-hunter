/*! Color Hunter — workspace data
 *
 *  The one place the app changes projects, palettes and saved colours.
 *
 *  Every change is planned with CHProjects (pure), written with one atomic
 *  CHStore.applyBatch, and only then mirrored in memory. So the screen can never
 *  show something the database refused, and a half-finished operation — a
 *  project deleted but its colours not moved, a restore that stopped in the
 *  middle — cannot exist.
 *
 *  Free-tier limits are applied here, at the point of creation, because this is
 *  the only door new projects and palettes come through. Nothing here ever
 *  removes or hides something the person already has.
 *
 *  Every method resolves { ok:true, ... } or { ok:false, reason, ... }; none of
 *  them throws and none of them leaves the screen to guess what happened.
 *  reasons: limit, missing, invalid, quota, write, storage, file
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(
    isNode ? require('./storage.js') : root.CHStore,
    isNode ? require('./projects.js') : root.CHProjects
  );
  if (isNode) module.exports = api;
  root.CHData = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Store, Projects) {
  'use strict';

  var st = { colors: [], projects: [], palettes: [], ready: false };
  var listeners = [], pro = null, settings = null, persist = function () {};

  function emit(kind) { listeners.slice().forEach(function (fn) { try { fn(kind); } catch (e) { /* one listener must not stop the rest */ } }); }
  function salt() { return String(Math.random()) + ':' + Date.now(); }
  function fail(reason, extra) { return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- reading ---------- */

  function load() {
    return Promise.all([Store.allColors(), Store.allProjects(), Store.allPalettes()]).then(function (r) {
      st.colors = r[0]; st.projects = r[1]; st.palettes = r[2]; st.ready = true;
      repairActive();
      emit('load');
      return { ok: true };
    });
  }

  /* Mirror the records a batch really wrote (normalised by the store), in order:
     clear, then replace-or-add, then remove. New records go to the front so the
     newest colour is first. */
  function mirror(r) {
    ['colors', 'projects', 'palettes'].forEach(function (n) {
      var base = r.clear.indexOf(n) >= 0 ? [] : st[n];
      var gone = {}, upd = {}, seen = {};
      r.del[n].forEach(function (id) { gone[id] = 1; });
      r.put[n].forEach(function (x) { upd[x.id] = x; });
      var kept = base.filter(function (x) { return !gone[x.id]; }).map(function (x) {
        if (upd[x.id]) { seen[x.id] = 1; return upd[x.id]; }
        return x;
      });
      st[n] = r.put[n].filter(function (x) { return !seen[x.id]; }).concat(kept);
    });
  }

  function commit(ops) {
    return Store.applyBatch(ops).then(function (r) {
      mirror(r);
      repairActive();
      emit('change');
      return { ok: true, result: r };
    }, function (err) {
      if (err && err.message === 'invalid-record') return fail('invalid');
      return fail(Store.isQuotaError(err) ? 'quota' : 'write', { error: err });
    });
  }

  /* ---------- the project new colours go to ---------- */

  function bindSettings(s, save) { settings = s; persist = save || persist; repairActive(); }
  function repairActive() {
    /* Before the first load there are no projects to compare with: judging then
       would forget the saved choice on every launch. */
    if (!st.ready || !settings || !settings.activePid) return;
    var p = find(st.projects, settings.activePid);
    if (!p || p.archived) { settings.activePid = ''; persist(); }
  }
  function active() { return settings && settings.activePid && find(st.projects, settings.activePid) ? settings.activePid : ''; }
  function setActive(pid) {
    if (!settings) return false;
    var p = pid ? find(st.projects, pid) : null;
    if (pid && (!p || p.archived)) return false;
    settings.activePid = pid || '';
    persist();
    emit('active');
    return true;
  }

  /* ---------- limits ---------- */

  function activeCount() { return st.projects.filter(function (p) { return !p.archived; }).length; }
  function gate(what, used) {
    if (!pro) return { ok: true };
    var g = pro.canCreate(what, used);
    return g.ok ? g : fail('limit', { need: g.need, feature: g.feature, limit: g.limit, used: g.used });
  }

  /* ---------- projects ---------- */

  function createProject(fields) {
    var g = gate('project', activeCount());
    if (!g.ok) return Promise.resolve(g);
    var p = Projects.newProject(fields || {});
    if (!p) return Promise.resolve(fail('invalid'));
    return commit({ put: { projects: [p] } }).then(function (r) {
      return r.ok ? { ok: true, project: find(st.projects, p.id) } : r;
    });
  }

  var PROJECT_FIELDS = ['name', 'client', 'desc', 'notes', 'logo', 'refs'];
  function updateProject(id, fields) {
    var p = find(st.projects, id);
    if (!p) return Promise.resolve(fail('missing'));
    var next = clone(p);
    PROJECT_FIELDS.forEach(function (k) { if (fields && fields[k] !== undefined) next[k] = fields[k]; });
    next.u = Date.now();
    return commit({ put: { projects: [next] } }).then(function (r) { return r.ok ? { ok: true, project: find(st.projects, id) } : r; });
  }

  function duplicateProject(id, suffix) {
    var p = find(st.projects, id);
    if (!p) return Promise.resolve(fail('missing'));
    var g = gate('project', activeCount());
    if (!g.ok) return Promise.resolve(g);
    var plan = Projects.planDuplicate(p, st.colors, st.palettes, salt(), suffix);
    return commit({ put: plan.put }).then(function (r) { return r.ok ? { ok: true, project: find(st.projects, plan.project.id) } : r; });
  }

  function archiveProject(id, flag) {
    var p = find(st.projects, id);
    if (!p) return Promise.resolve(fail('missing'));
    flag = flag !== false;
    if (!flag && p.archived) {
      var g = gate('project', activeCount());
      if (!g.ok) return Promise.resolve(g);
    }
    var next = clone(p); next.archived = flag; next.u = Date.now();
    return commit({ put: { projects: [next] } }).then(function (r) { return r.ok ? { ok: true, project: find(st.projects, id) } : r; });
  }

  /* keepColours true: contents go back to the Inbox. false: they go with it. */
  function deleteProject(id, keepColours) {
    var p = find(st.projects, id);
    if (!p) return Promise.resolve(fail('missing'));
    var plan = Projects.planDelete(id, st.colors, st.palettes, !!keepColours);
    return commit({ put: plan.put, del: plan.del });
  }

  /* A project file is always imported as a copy, never over an existing project. */
  function importBundle(text) {
    var v = Store.validateBundle(text);
    if (!v.ok) return Promise.resolve(fail('file', { errors: v.errors }));
    var g = gate('project', activeCount());
    if (!g.ok) return Promise.resolve(g);
    var plan = Projects.planImportBundle(v.bundle || v, salt());
    return commit({ put: plan.put }).then(function (r) {
      return r.ok ? { ok: true, project: find(st.projects, plan.project.id), warnings: v.warnings || [] } : r;
    });
  }

  function bundleOf(id, appVersion) {
    var p = find(st.projects, id);
    return p ? Store.makeProjectBundle(p, st.colors, st.palettes, appVersion) : null;
  }

  /* ---------- colours ---------- */

  /* `entry` has been through CHStore.normalizeColor by the caller; it lands in
     `pid`, which defaults to the project camera colours are being saved to. */
  function addColor(entry, pid) {
    var e = Object.assign({}, entry, { pid: pid === undefined ? active() : pid });
    if (e.pid && !find(st.projects, e.pid)) e.pid = '';
    return commit({ put: { colors: [e] } }).then(function (r) { return r.ok ? { ok: true, color: find(st.colors, e.id) } : r; });
  }
  function updateColor(entry) {
    if (!find(st.colors, entry.id)) return Promise.resolve(fail('missing'));
    return commit({ put: { colors: [entry] } });
  }
  function deleteColors(ids) {
    return commit({ del: { colors: ids.filter(function (i) { return find(st.colors, i); }) } });
  }
  function moveColors(ids, pid) {
    if (pid && !find(st.projects, pid)) return Promise.resolve(fail('missing'));
    var plan = Projects.planMoveColors(st.colors, ids, pid || '');
    return plan.put.colors.length ? commit(plan) : Promise.resolve({ ok: true, result: null });
  }
  function categorise(ids, cat) {
    var plan = Projects.planCategorise(st.colors, ids, cat);
    return plan.put.colors.length ? commit(plan) : Promise.resolve({ ok: true, result: null });
  }
  /* The whole Inbox, for "Clear book". Other projects are never touched. */
  function clearInbox() {
    var ids = st.colors.filter(function (c) { return !c.pid; }).map(function (c) { return c.id; });
    return commit({ del: { colors: ids } });
  }

  /* ---------- palettes ---------- */

  /* A palette with an id that exists is updated in place and keeps its project;
     one without is created in `pid` (default: the active project) and counts
     against the free limit. */
  function savePalette(palette, pid) {
    var existing = palette.id ? find(st.palettes, palette.id) : null;
    var rec = Object.assign({}, palette);
    if (existing) {
      rec.pid = existing.pid; rec.t = existing.t; rec.u = Date.now();
    } else {
      rec.id = ''; rec.t = Date.now(); rec.u = rec.t;
      rec.pid = pid === undefined ? active() : pid;
      if (rec.pid && !find(st.projects, rec.pid)) rec.pid = '';
      var g = gate('palette', st.palettes.filter(function (q) { return q.pid === rec.pid; }).length);
      if (!g.ok) return Promise.resolve(g);
    }
    var norm = Store.normalizePalette(rec, { salt: salt() });
    if (!norm) return Promise.resolve(fail('invalid'));
    return commit({ put: { palettes: [norm] } }).then(function (r) { return r.ok ? { ok: true, palette: find(st.palettes, norm.id) } : r; });
  }
  function deletePalette(id) {
    return find(st.palettes, id) ? commit({ del: { palettes: [id] } }) : Promise.resolve(fail('missing'));
  }
  function duplicatePalette(id, suffix) {
    var q = find(st.palettes, id);
    if (!q) return Promise.resolve(fail('missing'));
    var g = gate('palette', st.palettes.filter(function (x) { return x.pid === q.pid; }).length);
    if (!g.ok) return Promise.resolve(g);
    var copy = clone(q); copy.id = ''; copy.name = (q.name + ' ' + (suffix || 'copy')).slice(0, 60);
    copy.t = copy.u = Date.now();
    var norm = Store.normalizePalette(copy, { salt: salt() });
    return commit({ put: { palettes: [norm] } }).then(function (r) { return r.ok ? { ok: true, palette: find(st.palettes, norm.id) } : r; });
  }
  function movePalette(id, pid) {
    var q = find(st.palettes, id);
    if (!q) return Promise.resolve(fail('missing'));
    if (pid && !find(st.projects, pid)) return Promise.resolve(fail('missing'));
    if (q.pid === (pid || '')) return Promise.resolve({ ok: true, result: null });
    var g = gate('palette', st.palettes.filter(function (x) { return x.pid === (pid || ''); }).length);
    if (!g.ok) return Promise.resolve(g);
    return commit(Projects.planMovePalette(q, pid || ''));
  }

  /* ---------- whole-library backup and restore ---------- */

  function backupFile(appSettings, appVersion) {
    return Store.makeBackup(appSettings || settings, st.colors, appVersion, { projects: st.projects, palettes: st.palettes });
  }

  /* mode: 'merge' keeps everything here and adds what is new; 'replace' swaps.
     A verbatim copy of what is on the device is kept inside the app first. */
  function restore(text, mode, appVersion) {
    var v = Store.validateBackup(text);
    if (!v.ok) return Promise.resolve(fail('file', { errors: v.errors }));
    var plan = Projects.planRestore({ colors: st.colors, projects: st.projects, palettes: st.palettes },
      { colors: v.colors, projects: v.projects, palettes: v.palettes }, mode === 'replace' ? 'replace' : 'merge');
    return Store.keepBackup('before-restore-' + Date.now(), JSON.stringify(backupFile(settings, appVersion)))
      .then(function () { return Store.applyBatch(plan.ops); })
      .then(function () { return load(); })
      .then(function () {
        return { ok: true, added: plan.added, updated: plan.updated, rehomed: plan.rehomed, settings: v.settings || null, warnings: v.warnings || [] };
      }, function (err) { return fail(Store.isQuotaError(err) ? 'quota' : 'write', { error: err }); });
  }

  /* ---------- drafts (Studio work in progress) ---------- */

  function saveDraft(key, value) { return Store.setMeta('draft.' + key, value).then(function () { return { ok: true }; }, function () { return fail('storage'); }); }
  function loadDraft(key) { return Store.getMeta('draft.' + key).catch(function () { return null; }); }

  return {
    load: load, onChange: function (fn) { listeners.push(fn); },
    isReady: function () { return st.ready; },
    colors: function () { return st.colors; }, projects: function () { return st.projects; }, palettes: function () { return st.palettes; },
    inbox: function () { return st.colors.filter(function (c) { return !c.pid; }); },
    project: function (id) { return find(st.projects, id); },
    palette: function (id) { return find(st.palettes, id); },
    color: function (id) { return find(st.colors, id); },
    colorsOf: function (pid) { return st.colors.filter(function (c) { return c.pid === pid; }); },
    palettesOf: function (pid) { return st.palettes.filter(function (q) { return q.pid === pid; }); },
    counts: function () { return Projects.counts(st.projects, st.colors, st.palettes); },
    identity: function (pid, n) { return Projects.identityOf(pid, st.colors, st.palettes, n); },
    activeCount: activeCount,
    bindSettings: bindSettings, active: active, setActive: setActive,
    setPro: function (manager) { pro = manager; },
    createProject: createProject, updateProject: updateProject, duplicateProject: duplicateProject,
    archiveProject: archiveProject, deleteProject: deleteProject, importBundle: importBundle, bundleOf: bundleOf,
    addColor: addColor, updateColor: updateColor, deleteColors: deleteColors, moveColors: moveColors,
    categorise: categorise, clearInbox: clearInbox,
    savePalette: savePalette, deletePalette: deletePalette, duplicatePalette: duplicatePalette, movePalette: movePalette,
    backupFile: backupFile, restore: restore, saveDraft: saveDraft, loadDraft: loadDraft
  };
}));
