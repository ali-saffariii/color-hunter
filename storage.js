/*! Color Hunter — storage, migration and backup
 *
 *  Layout:
 *    localStorage 'chunt-en'      legacy v1 blob. READ ONLY from v2 onward.
 *                                 Never written to, never deleted: it is the
 *                                 rollback path if a user downgrades.
 *    localStorage 'ch.settings.v2' small settings object (no colours, no images)
 *    IndexedDB 'color-hunter'      stores: colors, meta, backups
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
  var DB_VERSION = 1;
  var LEGACY_KEY = 'chunt-en';
  var SETTINGS_KEY = 'ch.settings.v2';
  var SCHEMA = 2;

  var MAX_NOTE = 500;
  var MAX_STR = 120;
  var MAX_IMPORT_ENTRIES = 20000;
  var MAX_IMPORT_BYTES = 64 * 1024 * 1024;

  /* ================= pure helpers ================= */

  function isHex(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s); }

  function str(v, max) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    // strip control characters; they have no business in a colour name or note
    s = s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return s.slice(0, max || MAX_STR);
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
  function safeImage(v) {
    if (!v) return null;
    if (typeof Blob !== 'undefined' && v instanceof Blob) {
      return v.size > 0 && v.size <= 2 * 1024 * 1024 && /^image\//.test(v.type) ? v : null;
    }
    if (typeof v === 'string') {
      return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 3e6 ? v : null;
    }
    return null;
  }

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
      prof: !!raw.prof
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

  /* Settings are small and must survive even if IndexedDB is unavailable. */
  var SETTING_DEFAULTS = {
    mute: false, ap: 2, sys: 'P', prof: {}, useProf: true,
    speak: false, huntBest: 0, frames: 0, auto: true, onb: 0,
    calRef: 'print', lang: '', schema: SCHEMA
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

  function makeBackup(settings, entries, appVersion) {
    return {
      format: 'color-hunter-backup',
      schema: SCHEMA,
      app: appVersion || '',
      created: new Date().toISOString(),
      settings: normalizeSettings(settings),
      colors: entries.map(function (e) { return normalizeColor(e); }).filter(Boolean)
    };
  }

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

    var colors = [], seen = Object.create(null), dropped = 0, dupes = 0;
    for (var i = 0; i < obj.colors.length; i++) {
      var e = normalizeColor(obj.colors[i], { salt: 'import' });
      if (!e) { dropped++; continue; }
      if (seen[e.id]) { dupes++; continue; }
      seen[e.id] = 1;
      colors.push(e);
    }
    if (dropped) warnings.push(dropped + ' entr' + (dropped === 1 ? 'y was' : 'ies were') + ' unreadable and skipped.');
    if (dupes) warnings.push(dupes + ' duplicate entr' + (dupes === 1 ? 'y' : 'ies') + ' collapsed.');
    if (!colors.length && !obj.settings) errors.push('The backup contains nothing to restore.');

    return {
      ok: !errors.length, errors: errors, warnings: warnings,
      schema: schema,
      settings: obj.settings ? normalizeSettings(obj.settings) : null,
      colors: colors
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
    legacyToEntries: legacyToEntries, makeBackup: makeBackup,
    validateBackup: validateBackup, mergeEntries: mergeEntries,
    hashId: hashId, isQuotaError: quotaError,
    // browser
    open: open, loadSettings: loadSettings, saveSettings: saveSettings, readLegacy: readLegacy,
    allColors: allColors, putColor: putColor, putColors: putColors,
    deleteColor: deleteColor, clearColors: clearColors, countColors: countColors,
    getMeta: getMeta, setMeta: setMeta, keepBackup: keepBackup, listBackups: listBackups,
    migrate: migrate, estimate: estimate
  };
}));
