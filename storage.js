/*! Color Hunter — storage, migration and backup
 *
 *  Layout:
 *    localStorage 'chunt-en'      legacy v1 blob. READ ONLY from v2 onward.
 *                                 Never written to, never deleted: it is the
 *                                 rollback path if a user downgrades.
 *    localStorage 'ch.settings.v2' small settings object (no colours, no images)
 *    IndexedDB 'color-hunter'      stores: colors, projects, palettes, meta, backups
 *
 *  Rules this module enforces:
 *    - colours are never dropped to make room; a failed write reports an error
 *      and the caller must not claim success;
 *    - migration takes a verbatim backup of the legacy blob first, writes the
 *      colours, verifies the count, and only then marks itself done;
 *    - migration ids are derived from the legacy content, so running it twice
 *      overwrites the same rows instead of duplicating them.
 *
 *  The pure functions (normalizeColor, legacyToEntries, validateBackup,
 *  mergeEntries) hold the risky logic and are unit-tested in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CHStore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DB_NAME = 'color-hunter';
  var DB_VERSION = 2;          // 2 adds the projects and palettes stores; v1 data is untouched
  var LEGACY_KEY = 'chunt-en';
  var SETTINGS_KEY = 'ch.settings.v2';
  var SCHEMA = 3;

  var MAX_NOTE = 500;
  var MAX_STR = 120;
  var MAX_IMPORT_ENTRIES = 20000;
  var MAX_IMPORT_BYTES = 64 * 1024 * 1024;
  var MAX_LOGO = 400 * 1000;            // characters of a data: URL
  var MAX_REF = 900 * 1000;
  var MAX_REFS = 12;
  var MAX_PALETTE_COLORS = 16;

  // What a colour is *for*, and the roles of a UI colour system. Both are closed
  // lists: anything else in an imported file is dropped, never stored.
  var CATEGORIES = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'border',
                    'success', 'warning', 'error', 'neutral', 'other'];
  var ROLE_IDS = ['primary', 'onPrimary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted',
                  'border', 'success', 'warning', 'error'];
  var PALETTE_KINDS = ['manual', 'harmony', 'image', 'scale', 'system'];

  /* ================= pure helpers ================= */

  function isHex(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s); }

  function str(v, max) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    // strip control characters; they have no business in a colour name or note
    s = s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return s.slice(0, max || MAX_STR);
  }

  // Like str() but keeps line breaks and tabs: project notes are written by hand.
  function text(v, max) {
    if (v === null || v === undefined) return '';
    var s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
    return s.trim().slice(0, max || MAX_STR);
  }

  function num(v, lo, hi, dflt) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  function triple(v, lo, hi) {
    if (!Array.isArray(v) || v.length !== 3) return null;
    var out = [];
    for (var i = 0; i < 3; i++) {
      var n = typeof v[i] === 'number' ? v[i] : parseFloat(v[i]);
      if (!isFinite(n) || n < lo || n > hi) return null;
      out.push(n);
    }
    return out;
  }

  // A thumbnail is either a Blob (new captures) or a data: image URL (legacy).
  // Anything else — an http(s) URL, a javascript: URL, a stray string — is dropped.
  function safeImage(v, maxChars) {
    if (!v) return null;
    if (typeof Blob !== 'undefined' && v instanceof Blob) {
      return v.size > 0 && v.size <= 2 * 1024 * 1024 && /^image\//.test(v.type) ? v : null;
    }
    if (typeof v === 'string') {
      return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= (maxChars || 3e6) ? v : null;
    }
    return null;
  }

  // Data-URL only: projects travel inside JSON backups, which cannot hold a Blob.
  function dataImage(v, maxChars) {
    return typeof v === 'string' ? safeImage(v, maxChars) : null;
  }

  function oneOf(v, list, dflt) { return list.indexOf(v) >= 0 ? v : dflt; }

  // Deterministic id so a repeated migration or import updates rather than duplicates.
  function hashId(parts) {
    var s = parts.join('\u0001'), h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i); h1 = (h1 * 0x01000193) >>> 0;
      h2 = ((h2 << 5) - h2 + s.charCodeAt(i)) >>> 0;
    }
    return h1.toString(36) + h2.toString(36);
  }

  /* Canonical colour entry. Returns null for anything that is not a usable colour,
     rather than storing a half-record that breaks rendering later. */
  function normalizeColor(raw, opts) {
    if (!raw || typeof raw !== 'object') return null;
    var h = typeof raw.h === 'string' ? raw.h.trim().toUpperCase() : '';
    if (!isHex(h)) return null;
    var t = num(raw.t, 0, 4102444800000, 0) || Date.now();
    var e = {
      v: SCHEMA,
      id: str(raw.id, 64) || hashId([h, t, str(raw.p, 40), str(raw.note, 40), (opts && opts.salt) || '']),
      t: Math.round(t),
      h: h,
      rgb: triple(raw.rgb, 0, 255),
      lab: triple(raw.lab, -200, 200),
      raw: isHex(raw.raw) ? raw.raw.toUpperCase() : h,
      p: str(raw.p, 40),
      r: str(raw.r, 40),
      n: str(raw.n, 80),
      l: str(raw.l, 40),
      k: Math.round(num(raw.k, 0, 20000, 0)),
      q: Math.round(num(raw.q !== undefined ? raw.q : raw.a, 0, 100, 0)),
      no: Math.round(num(raw.no, 0, 1e9, 0)),
      note: str(raw.note, MAX_NOTE),
      img: safeImage(raw.img),
      mode: Math.round(num(raw.mode, 0, 2, 1)),
      prof: !!raw.prof,
      pid: str(raw.pid, 64),             // owning project; '' means the Inbox
      cat: oneOf(raw.cat, CATEGORIES, '') // what the colour is used for
    };
    if (!e.rgb) {
      e.rgb = [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
    }
    return e;
  }

  /* Legacy v1 state -> canonical entries. Index is part of the id so two
     identical saves from the same millisecond stay two rows. */
  function legacyToEntries(state) {
    if (!state || !Array.isArray(state.book)) return [];
    var out = [];
    for (var i = 0; i < state.book.length; i++) {
      var x = state.book[i];
      if (!x || typeof x !== 'object') continue;
      var e = normalizeColor({
        id: 'v1-' + hashId([String(x.h || ''), String(x.t || 0), String(i)]),
        t: x.t, h: x.h, rgb: x.rgb, lab: x.lab, raw: x.raw,
        p: x.p, r: x.r, n: x.n, l: x.l, k: x.k, q: x.a, no: x.no,
        note: x.note, img: x.img
      });
      if (e) out.push(e);
    }
    return out;
  }

  /* ================= projects and palettes ================= */

  function normalizeProject(raw, opts) {
    if (!raw || typeof raw !== 'object') return null;
    var t = Math.round(num(raw.t, 0, 4102444800000, 0)) || Date.now();
    var name = str(raw.name, 80) || 'Untitled project';
    var refs = [];
    if (Array.isArray(raw.refs)) {
      for (var i = 0; i < raw.refs.length && refs.length < MAX_REFS; i++) {
        var r = raw.refs[i];
        var im = r && typeof r === 'object' ? dataImage(r.img, MAX_REF) : null;
        if (!im) continue;
        refs.push({ id: str(r.id, 32) || hashId(['ref', i, im.length, t]), img: im, cap: str(r.cap, 80) });
      }
    }
    return {
      v: SCHEMA,
      id: str(raw.id, 64) || hashId(['project', name, t, (opts && opts.salt) || '']),
      name: name,
      client: str(raw.client, 80),
      desc: text(raw.desc, 500),
      notes: text(raw.notes, 2000),
      logo: dataImage(raw.logo, MAX_LOGO) || '',
      refs: refs,
      archived: !!raw.archived,
      t: t,
      u: Math.round(num(raw.u, 0, 4102444800000, 0)) || t
    };
  }

  function normalizeRoleSet(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var out = {}, n = 0;
    for (var i = 0; i < ROLE_IDS.length; i++) {
      var h = typeof raw[ROLE_IDS[i]] === 'string' ? raw[ROLE_IDS[i]].trim().toUpperCase() : '';
      if (isHex(h)) { out[ROLE_IDS[i]] = h; n++; }
    }
    return n ? out : null;
  }

  function normalizeRoles(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var light = normalizeRoleSet(raw.light), dark = normalizeRoleSet(raw.dark);
    if (!light && !dark) return null;
    return { light: light || {}, dark: dark || {} };
  }

  function normalizePalette(raw, opts) {
    if (!raw || typeof raw !== 'object') return null;
    var roles = normalizeRoles(raw.roles);
    var kind = oneOf(raw.kind, PALETTE_KINDS, roles ? 'system' : 'manual');
    if (kind === 'system' && !roles) kind = 'manual';
    var colors = [];
    if (kind === 'system') {
      var seen = {};
      ROLE_IDS.forEach(function (rid) {
        var h = roles.light[rid] || roles.dark[rid];
        if (h && !seen[h]) { seen[h] = 1; colors.push({ h: h, name: rid, lock: false, cat: oneOf(rid, CATEGORIES, '') }); }
      });
    } else if (Array.isArray(raw.colors)) {
      for (var i = 0; i < raw.colors.length && colors.length < MAX_PALETTE_COLORS; i++) {
        var c = raw.colors[i], obj = c && typeof c === 'object';
        var h = (typeof c === 'string' ? c : obj ? c.h : '');
        h = typeof h === 'string' ? h.trim().toUpperCase() : '';
        if (!isHex(h)) continue;
        colors.push({ h: h, name: obj ? str(c.name, 40) : '', lock: obj ? !!c.lock : false,
                      cat: obj ? oneOf(c.cat, CATEGORIES, '') : '' });
      }
    }
    if (!colors.length) return null;
    var t = Math.round(num(raw.t, 0, 4102444800000, 0)) || Date.now();
    var name = str(raw.name, 60) || 'Palette';
    var base = typeof raw.base === 'string' && isHex(raw.base.trim()) ? raw.base.trim().toUpperCase() : '';
    return {
      v: SCHEMA,
      id: str(raw.id, 64) || hashId(['palette', name, t, colors.length, (opts && opts.salt) || '']),
      pid: str(raw.pid, 64),
      name: name,
      kind: kind,
      harmony: str(raw.harmony, 24),
      base: base,
      colors: colors,
      roles: kind === 'system' ? roles : null,
      t: t,
      u: Math.round(num(raw.u, 0, 4102444800000, 0)) || t
    };
  }

  /* Anything pointing at a project that does not exist goes back to the Inbox
     instead of vanishing. Returns how many records were re-homed. */
  function repairOwnership(colors, palettes, projects) {
    var ids = {};
    projects.forEach(function (p) { ids[p.id] = 1; });
    var moved = 0;
    colors.forEach(function (c) { if (c.pid && !ids[c.pid]) { c.pid = ''; moved++; } });
    palettes.forEach(function (p) { if (p.pid && !ids[p.pid]) { p.pid = ''; moved++; } });
    return moved;
  }

  /* Settings are small and must survive even if IndexedDB is unavailable. */
  var SETTING_DEFAULTS = {
    mute: false, ap: 2, sys: 'P', prof: {}, useProf: true,
    speak: false, huntBest: 0, frames: 0, auto: true, onb: 0,
    calRef: 'print', lang: '', theme: 'auto', activePid: '', schema: SCHEMA
  };

  function normalizeSettings(raw) {
    var s = {};
    for (var k in SETTING_DEFAULTS) if (Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, k)) s[k] = SETTING_DEFAULTS[k];
    if (!raw || typeof raw !== 'object') return s;
    s.mute = !!raw.mute;
    s.auto = raw.auto === undefined ? true : !!raw.auto;
    s.speak = !!raw.speak;
    s.useProf = raw.useProf === undefined ? true : !!raw.useProf;
    s.sys = raw.sys === 'R' ? 'R' : 'P';
    s.ap = Math.round(num(raw.ap, 0, 5, 2));
    s.huntBest = Math.round(num(raw.huntBest, 0, 1e6, 0));
    s.frames = Math.round(num(raw.frames, 0, 1e9, 0));
    s.onb = raw.onb ? 1 : 0;
    s.calRef = raw.calRef === 'checker' ? 'checker' : 'print';
    s.lang = raw.lang === 'fa' || raw.lang === 'en' ? raw.lang : '';
    s.theme = oneOf(raw.theme, ['auto', 'light', 'dark'], 'auto');
    s.activePid = str(raw.activePid, 64);
    s.prof = {};
    if (raw.prof && typeof raw.prof === 'object') {
      for (var key in raw.prof) {
        if (!Object.prototype.hasOwnProperty.call(raw.prof, key)) continue;
        var p = raw.prof[key];
        if (!p || !Array.isArray(p.M) || p.M.length !== 3) continue;
        var M = [];
        var bad = false;
        for (var r = 0; r < 3; r++) {
          var row = triple(p.M[r], -20, 20);
          if (!row) { bad = true; break; }
          M.push(row);
        }
        if (bad) continue;
        s.prof[str(key, 200)] = {
          M: M,
          before: num(p.before, 0, 200, 0),
          after: num(p.after, 0, 200, 0),
          cv: p.cv ? {
            mean: num(p.cv.mean, 0, 200, 0), median: num(p.cv.median, 0, 200, 0),
            p95: num(p.cv.p95, 0, 200, 0), max: num(p.cv.max, 0, 200, 0),
            n: Math.round(num(p.cv.n, 0, 1000, 0))
          } : null,
          ref: p.ref === 'checker' ? 'checker' : 'print',
          t: Math.round(num(p.t, 0, 4102444800000, 0))
        };
      }
    }
    return s;
  }

  /* ---- backup file ---- */

  function normList(list, fn) {
    return (list || []).map(function (e) { return fn(e); }).filter(Boolean);
  }

  // extra = { projects: [...], palettes: [...] } (optional, for schema 3)
  function makeBackup(settings, entries, appVersion, extra) {
    return {
      format: 'color-hunter-backup',
      schema: SCHEMA,
      app: appVersion || '',
      created: new Date().toISOString(),
      settings: normalizeSettings(settings),
      colors: normList(entries, normalizeColor),
      projects: normList(extra && extra.projects, normalizeProject),
      palettes: normList(extra && extra.palettes, normalizePalette)
    };
  }

  // Rebuild a list of untrusted records, dropping the unreadable and collapsing duplicate ids.
  function rebuildList(list, fn, salt) {
    var out = [], seen = Object.create(null), dropped = 0, dupes = 0;
    for (var i = 0; i < list.length; i++) {
      var e = fn(list[i], { salt: salt });
      if (!e) { dropped++; continue; }
      if (seen[e.id]) { dupes++; continue; }
      seen[e.id] = 1;
      out.push(e);
    }
    return { list: out, dropped: dropped, dupes: dupes };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Validates an imported file. Returns {ok, errors, warnings, settings, colors}.
     Every field is rebuilt from scratch; nothing from the file is trusted as-is. */
  function validateBackup(obj) {
    var errors = [], warnings = [];
    if (typeof obj === 'string') {
      if (obj.length > MAX_IMPORT_BYTES) return { ok: false, errors: ['File is too large to import.'] };
      try { obj = JSON.parse(obj); }
      catch (e) { return { ok: false, errors: ['Not a valid JSON file.'] }; }
    }
    if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Not a Color Hunter backup.'] };
    if (obj.format !== 'color-hunter-backup') return { ok: false, errors: ['Not a Color Hunter backup file.'] };
    var schema = Math.round(num(obj.schema, 0, 99, 0));
    if (!schema) return { ok: false, errors: ['The backup has no schema version.'] };
    if (schema > SCHEMA) return { ok: false, errors: ['This backup was made by a newer version of Color Hunter. Update the app first.'] };
    if (!Array.isArray(obj.colors)) return { ok: false, errors: ['The backup has no colour list.'] };
    if (obj.colors.length > MAX_IMPORT_ENTRIES) return { ok: false, errors: ['The backup holds too many colours to import safely.'] };

    var rc = rebuildList(obj.colors, normalizeColor, 'import');
    var colors = rc.list, dropped = rc.dropped, dupes = rc.dupes;
    var projects = [], palettes = [];
    if (Array.isArray(obj.projects)) {
      if (obj.projects.length > MAX_IMPORT_ENTRIES) return { ok: false, errors: ['The backup holds too many projects to import safely.'] };
      var rp = rebuildList(obj.projects, normalizeProject, 'import');
      projects = rp.list; dropped += rp.dropped; dupes += rp.dupes;
    }
    if (Array.isArray(obj.palettes)) {
      if (obj.palettes.length > MAX_IMPORT_ENTRIES) return { ok: false, errors: ['The backup holds too many palettes to import safely.'] };
      var rq = rebuildList(obj.palettes, normalizePalette, 'import');
      palettes = rq.list; dropped += rq.dropped; dupes += rq.dupes;
    }
    // Inside one backup, a colour that points at a project the file does not
    // carry goes back to the Inbox. (Against the local library that is decided
    // at merge time, where local projects count too.)
    var orphans = repairOwnership(colors, palettes, projects);
    if (dropped) warnings.push(plural(dropped, 'entry was', 'entries were') + ' unreadable and skipped.');
    if (dupes) warnings.push(plural(dupes, 'duplicate entry', 'duplicate entries') + ' collapsed.');
    if (orphans) warnings.push(plural(orphans, 'item', 'items') + ' belonged to a project that is not in the file and was moved to the Inbox.');
    if (!colors.length && !projects.length && !palettes.length && !obj.settings) errors.push('The backup contains nothing to restore.');

    return {
      ok: !errors.length, errors: errors, warnings: warnings,
      schema: schema,
      settings: obj.settings ? normalizeSettings(obj.settings) : null,
      colors: colors, projects: projects, palettes: palettes
    };
  }

  /* mode 'merge' keeps what is already stored and adds what is new;
     mode 'replace' swaps the library for the backup. Both are explicit choices
     made by the user, never a default. */
  function mergeEntries(existing, incoming, mode) {
    if (mode === 'replace') return { entries: incoming.slice(), added: incoming.length, updated: 0, kept: 0 };
    var byId = Object.create(null), out = [];
    existing.forEach(function (e) { byId[e.id] = e; out.push(e); });
    var added = 0, updated = 0;
    incoming.forEach(function (e) {
      var prev = byId[e.id];
      if (!prev) { byId[e.id] = e; out.push(e); added++; return; }
      // same id, newer content wins, but a note already written locally is not erased
      if ((e.t || 0) >= (prev.t || 0)) {
        var merged = {};
        for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) merged[k] = e[k];
        if (!merged.note && prev.note) merged.note = prev.note;
        if (!merged.img && prev.img) merged.img = prev.img;
        out[out.indexOf(prev)] = merged;
        byId[e.id] = merged;
        updated++;
      }
    });
    out.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    return { entries: out, added: added, updated: updated, kept: existing.length };
  }

  /* Projects and palettes merge the same way colours do: same id, newer wins.
     'replace' swaps the whole list. */
  function mergeById(existing, incoming, mode) {
    if (mode === 'replace') return { entries: incoming.slice(), added: incoming.length, updated: 0, kept: 0 };
    var byId = Object.create(null), out = [];
    existing.forEach(function (e) { byId[e.id] = e; out.push(e); });
    var added = 0, updated = 0;
    incoming.forEach(function (e) {
      var prev = byId[e.id];
      if (!prev) { byId[e.id] = e; out.push(e); added++; return; }
      if ((e.u || e.t || 0) >= (prev.u || prev.t || 0)) {
        out[out.indexOf(prev)] = e; byId[e.id] = e; updated++;
      }
    });
    return { entries: out, added: added, updated: updated, kept: existing.length };
  }

  /* ---- one project as a file ----
     A bundle carries a project with its colours and palettes, so a project can
     be handed to someone else or moved to another device on its own. */

  function makeProjectBundle(project, colors, palettes, appVersion) {
    var p = normalizeProject(project);
    return {
      format: 'color-hunter-project',
      schema: SCHEMA,
      app: appVersion || '',
      created: new Date().toISOString(),
      project: p,
      colors: p ? normList(colors, normalizeColor).filter(function (c) { return c.pid === p.id; }) : [],
      palettes: p ? normList(palettes, normalizePalette).filter(function (q) { return q.pid === p.id; }) : []
    };
  }

  function validateBundle(obj) {
    var warnings = [];
    if (typeof obj === 'string') {
      if (obj.length > MAX_IMPORT_BYTES) return { ok: false, errors: ['File is too large to import.'] };
      try { obj = JSON.parse(obj); } catch (e) { return { ok: false, errors: ['Not a valid JSON file.'] }; }
    }
    if (!obj || typeof obj !== 'object' || obj.format !== 'color-hunter-project') {
      return { ok: false, errors: ['Not a Color Hunter project file.'] };
    }
    var schema = Math.round(num(obj.schema, 0, 99, 0));
    if (!schema) return { ok: false, errors: ['The project file has no schema version.'] };
    if (schema > SCHEMA) return { ok: false, errors: ['This project was made by a newer version of Color Hunter. Update the app first.'] };
    var project = normalizeProject(obj.project, { salt: 'import' });
    if (!project) return { ok: false, errors: ['The project file has no readable project in it.'] };
    var rc = rebuildList(Array.isArray(obj.colors) ? obj.colors : [], normalizeColor, 'import');
    var rq = rebuildList(Array.isArray(obj.palettes) ? obj.palettes : [], normalizePalette, 'import');
    var skipped = rc.dropped + rq.dropped, dupes = rc.dupes + rq.dupes;
    if (skipped) warnings.push(plural(skipped, 'entry was', 'entries were') + ' unreadable and skipped.');
    if (dupes) warnings.push(plural(dupes, 'duplicate entry', 'duplicate entries') + ' collapsed.');
    // everything in a bundle belongs to its project, whatever the file claims
    rc.list.forEach(function (c) { c.pid = project.id; });
    rq.list.forEach(function (q) { q.pid = project.id; });
    return { ok: true, errors: [], warnings: warnings, project: project, colors: rc.list, palettes: rq.list };
  }

  /* ================= browser side ================= */

  var hasIDB = typeof indexedDB !== 'undefined';
  var hasLS = (function () {
    try { var k = '__ch'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  })();

  function idbReq(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('IndexedDB request failed')); };
    });
  }

  var dbPromise = null;
  function open() {
    if (!hasIDB) return Promise.reject(new Error('no-indexeddb'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (res, rej) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { rej(e); return; }
      req.onupgradeneeded = function (ev) {
        var db = req.result;
        if (!db.objectStoreNames.contains('colors')) {
          var s = db.createObjectStore('colors', { keyPath: 'id' });
          s.createIndex('t', 't');
        }
        if (!db.objectStoreNames.contains('projects')) {
          var ps = db.createObjectStore('projects', { keyPath: 'id' });
          ps.createIndex('u', 'u');
        }
        if (!db.objectStoreNames.contains('palettes')) {
          var qs = db.createObjectStore('palettes', { keyPath: 'id' });
          qs.createIndex('pid', 'pid');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id' });
        void ev;
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (e) {} dbPromise = null; };
        res(db);
      };
      req.onerror = function () { rej(req.error || new Error('IndexedDB could not be opened')); };
      req.onblocked = function () { rej(new Error('IndexedDB is blocked by another tab')); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out;
        try { out = fn(s); } catch (e) { rej(e); return; }
        t.oncomplete = function () { res(out && out.__req ? out.value : out); };
        t.onerror = function () { rej(t.error || new Error('Transaction failed')); };
        t.onabort = function () { rej(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  function quotaError(e) {
    var n = e && (e.name || '');
    return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED';
  }

  /* ---- settings (localStorage, small) ---- */

  function loadSettings() {
    if (!hasLS) return { settings: normalizeSettings(null), source: 'defaults' };
    var rawNew = null, rawOld = null;
    try { rawNew = localStorage.getItem(SETTINGS_KEY); } catch (e) {}
    if (rawNew) {
      try { return { settings: normalizeSettings(JSON.parse(rawNew)), source: 'v2' }; } catch (e) {}
    }
    try { rawOld = localStorage.getItem(LEGACY_KEY); } catch (e) {}
    if (rawOld) {
      try { return { settings: normalizeSettings(JSON.parse(rawOld)), source: 'legacy' }; } catch (e) {}
    }
    return { settings: normalizeSettings(null), source: 'defaults' };
  }

  function saveSettings(s) {
    if (!hasLS) return { ok: false, reason: 'no-localstorage' };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(s)));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: quotaError(e) ? 'quota' : 'error', error: e };
    }
  }

  function readLegacy() {
    if (!hasLS) return null;
    var raw = null;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try { return { raw: raw, state: JSON.parse(raw) }; } catch (e) { return { raw: raw, state: null }; }
  }

  /* ---- colours ---- */

  function allColors() {
    return tx('colors', 'readonly', function (s) {
      var out = { value: [], __req: true };
      var req = s.getAll ? s.getAll() : null;
      if (req) { req.onsuccess = function () { out.value = req.result || []; }; return out; }
      var cur = s.openCursor();
      cur.onsuccess = function () {
        var c = cur.result;
        if (c) { out.value.push(c.value); c.continue(); }
      };
      return out;
    }).then(function (list) {
      return (list || []).sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    });
  }

  function putColor(entry) {
    var e = normalizeColor(entry);
    if (!e) return Promise.reject(new Error('invalid-color'));
    return tx('colors', 'readwrite', function (s) { s.put(e); return e; });
  }

  function putColors(entries) {
    var list = entries.map(function (e) { return normalizeColor(e); }).filter(Boolean);
    return tx('colors', 'readwrite', function (s) {
      list.forEach(function (e) { s.put(e); });
      return list.length;
    });
  }

  function deleteColor(id) {
    return tx('colors', 'readwrite', function (s) { s.delete(id); return true; });
  }

  function clearColors() {
    return tx('colors', 'readwrite', function (s) { s.clear(); return true; });
  }

  function countColors() {
    return tx('colors', 'readonly', function (s) {
      var out = { value: 0, __req: true }, req = s.count();
      req.onsuccess = function () { out.value = req.result; };
      return out;
    });
  }

  /* ---- projects and palettes ---- */

  function allOf(store) {
    return tx(store, 'readonly', function (s) {
      var out = { value: [], __req: true }, req = s.getAll();
      req.onsuccess = function () { out.value = req.result || []; };
      return out;
    }).then(function (list) {
      return (list || []).sort(function (a, b) { return (b.u || b.t || 0) - (a.u || a.t || 0); });
    });
  }
  function allProjects() { return allOf('projects'); }
  function allPalettes() { return allOf('palettes'); }

  /* One atomic write across colours, projects and palettes.
       ops = { clear:['colors',...], put:{colors:[],projects:[],palettes:[]}, del:{colors:[ids],...} }
     Either every part lands or none does, so duplicating a project, deleting one
     with its contents, or restoring a backup can never leave half a project.
     Records are normalised first; one that does not validate rejects the whole
     batch rather than being silently dropped. Resolves with what was written. */
  var BATCH_STORES = ['colors', 'projects', 'palettes'];
  var NORMALIZERS = { colors: normalizeColor, projects: normalizeProject, palettes: normalizePalette };
  function applyBatch(ops) {
    ops = ops || {};
    var put = {}, del = {}, i, n;
    for (i = 0; i < BATCH_STORES.length; i++) {
      n = BATCH_STORES[i];
      put[n] = [];
      var src = (ops.put && ops.put[n]) || [];
      for (var j = 0; j < src.length; j++) {
        var rec = NORMALIZERS[n](src[j]);
        if (!rec) return Promise.reject(new Error('invalid-record'));
        put[n].push(rec);
      }
      del[n] = ((ops.del && ops.del[n]) || []).slice();
    }
    var clear = (ops.clear || []).filter(function (c) { return BATCH_STORES.indexOf(c) >= 0; });
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(BATCH_STORES, 'readwrite');
        try {
          clear.forEach(function (c) { t.objectStore(c).clear(); });
          BATCH_STORES.forEach(function (name) {
            var s = t.objectStore(name);
            put[name].forEach(function (r) { s.put(r); });
            del[name].forEach(function (id) { s.delete(id); });
          });
        } catch (e) { try { t.abort(); } catch (_) {} rej(e); return; }
        t.oncomplete = function () { res({ put: put, del: del, clear: clear }); };
        t.onerror = function () { rej(t.error || new Error('Transaction failed')); };
        t.onabort = function () { rej(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  /* ---- meta ---- */

  function getMeta(key) {
    return tx('meta', 'readonly', function (s) {
      var out = { value: null, __req: true }, req = s.get(key);
      req.onsuccess = function () { out.value = req.result === undefined ? null : req.result; };
      return out;
    });
  }
  function setMeta(key, value) {
    return tx('meta', 'readwrite', function (s) { s.put(value, key); return value; });
  }

  /* ---- backups store (verbatim copies, kept before destructive steps) ---- */

  function keepBackup(id, payload) {
    return tx('backups', 'readwrite', function (s) {
      s.put({ id: id, t: Date.now(), payload: payload });
      return id;
    });
  }
  function listBackups() {
    return tx('backups', 'readonly', function (s) {
      var out = { value: [], __req: true }, req = s.getAll();
      req.onsuccess = function () { out.value = req.result || []; };
      return out;
    });
  }

  /* ---- migration ----
     Order matters: back up, write, verify, only then mark done. If the tab dies
     anywhere before the mark, the next run repeats the same work with the same
     ids and nothing is lost or doubled. */
  function migrate() {
    return getMeta('migratedV1').then(function (done) {
      var legacy = readLegacy();
      if (done) return { status: 'already', moved: 0, legacyPresent: !!legacy };
      if (!legacy) return setMeta('migratedV1', { t: Date.now(), moved: 0, empty: true })
        .then(function () { return { status: 'nothing', moved: 0, legacyPresent: false }; });
      if (!legacy.state) {
        return keepBackup('legacy-unparsable', legacy.raw).then(function () {
          return { status: 'unreadable', moved: 0, legacyPresent: true,
                   message: 'The old saved data could not be read. A copy has been kept; nothing was deleted.' };
        });
      }
      var entries = legacyToEntries(legacy.state);
      return keepBackup('legacy-v1', legacy.raw)
        .then(function () { return entries.length ? putColors(entries) : 0; })
        .then(function () { return countColors(); })
        .then(function (count) {
          if (entries.length && count < entries.length) {
            throw new Error('verify-failed: expected ' + entries.length + ', found ' + count);
          }
          return setMeta('migratedV1', { t: Date.now(), moved: entries.length });
        })
        .then(function () {
          return { status: 'migrated', moved: entries.length, legacyPresent: true };
        });
    });
  }

  function estimate() {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return Promise.resolve(null);
    }
    return navigator.storage.estimate().catch(function () { return null; });
  }

  return {
    SCHEMA: SCHEMA, DB_NAME: DB_NAME, LEGACY_KEY: LEGACY_KEY, SETTINGS_KEY: SETTINGS_KEY,
    hasIDB: hasIDB, hasLS: hasLS,
    // pure
    normalizeColor: normalizeColor, normalizeSettings: normalizeSettings,
    normalizeProject: normalizeProject, normalizePalette: normalizePalette,
    repairOwnership: repairOwnership, mergeById: mergeById,
    makeProjectBundle: makeProjectBundle, validateBundle: validateBundle,
    CATEGORIES: CATEGORIES, ROLE_IDS: ROLE_IDS, PALETTE_KINDS: PALETTE_KINDS,
    legacyToEntries: legacyToEntries, makeBackup: makeBackup,
    validateBackup: validateBackup, mergeEntries: mergeEntries,
    hashId: hashId, isQuotaError: quotaError,
    // browser
    open: open, loadSettings: loadSettings, saveSettings: saveSettings, readLegacy: readLegacy,
    allColors: allColors, putColor: putColor, putColors: putColors,
    allProjects: allProjects, allPalettes: allPalettes, applyBatch: applyBatch,
    deleteColor: deleteColor, clearColors: clearColors, countColors: countColors,
    getMeta: getMeta, setMeta: setMeta, keepBackup: keepBackup, listBackups: listBackups,
    migrate: migrate, estimate: estimate
  };
}));
