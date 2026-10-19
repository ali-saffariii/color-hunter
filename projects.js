/*! Color Hunter — project logic
 *
 *  Pure functions over plain records: no DOM, no storage, no app state. Every
 *  operation that changes data returns a *plan* (the records to write and the
 *  ids to remove) and CHStore.applyBatch commits that plan in one transaction.
 *  Keeping "decide" and "write" apart is what makes the risky operations —
 *  duplicate, delete with contents, restore — unit-testable without a browser.
 *
 *  Vocabulary:
 *    Inbox     colours and palettes with pid '' — the colour book as it was
 *              before projects existed. Nothing is moved into a project unless
 *              the user moves it.
 *    identity  the colours a project is recognised by, taken from its newest
 *              palette, else from its newest colours.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(
    isNode ? require('./color-engine.js') : root.CH,
    isNode ? require('./storage.js') : root.CHStore
  );
  if (isNode) module.exports = api;
  root.CHProjects = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (CH, Store) {
  'use strict';

  /* What each "use" is called on screen. Data, so the translation test sees every word. */
  var CATEGORY_LABELS = {
    primary: 'Primary', secondary: 'Secondary', accent: 'Accent', background: 'Background', surface: 'Surface',
    text: 'Text', border: 'Border', success: 'Success', warning: 'Warning', error: 'Error', neutral: 'Neutral', other: 'Other'
  };

  function ts(x) { return x.u || x.t || 0; }
  function lc(s) { return String(s || '').toLowerCase(); }

  /* ---------- counts and identity ---------- */

  function counts(projects, colors, palettes) {
    var out = { '': { colors: 0, palettes: 0 } };
    projects.forEach(function (p) { out[p.id] = { colors: 0, palettes: 0 }; });
    colors.forEach(function (c) { (out[c.pid] || out['']).colors++; });
    palettes.forEach(function (q) { (out[q.pid] || out['']).palettes++; });
    return out;
  }

  /* The colours a project is recognised by, up to n. A palette is a deliberate
     choice, so the newest real palette wins; a UI-system palette is skipped
     because its list is the role colours, not a design colour story. */
  function identityOf(pid, colors, palettes, n) {
    n = n || 5;
    var pals = palettes.filter(function (q) { return q.pid === pid && q.kind !== 'system'; })
      .sort(function (a, b) { return ts(b) - ts(a); });
    var out = [], seen = {};
    function add(h) { if (!seen[h] && out.length < n) { seen[h] = 1; out.push(h); } }
    if (pals.length) pals[0].colors.forEach(function (c) { add(c.h); });
    if (out.length < n) {
      colors.filter(function (c) { return c.pid === pid; })
        .sort(function (a, b) { return ts(b) - ts(a); })
        .forEach(function (c) { add(c.h); });
    }
    return out;
  }

  /* ---------- search, sort, filter ---------- */

  function hueOf(c) {
    var lab = c.lab || CH.lab8(c.rgb || CH.h2r(c.h));
    var lch = CH.lab2lch(lab);
    return lch[1] < 6 ? 400 + lch[0] : lch[2];     // greys sort after the hues, light to dark
  }

  var COLOR_SORTS = {
    new: function (a, b) { return ts(b) - ts(a); },
    old: function (a, b) { return ts(a) - ts(b); },
    hue: function (a, b) { return hueOf(a) - hueOf(b); },
    light: function (a, b) {
      return (b.lab || CH.lab8(b.rgb || CH.h2r(b.h)))[0] - (a.lab || CH.lab8(a.rgb || CH.h2r(a.h)))[0];
    },
    name: function (a, b) { return lc(a.p || a.n || a.h).localeCompare(lc(b.p || b.n || b.h)); }
  };

  function colorMatches(c, q) {
    q = lc(q).trim().replace(/^#/, '');
    if (!q) return true;
    var hay = [c.h.slice(1), c.p, c.r, c.n, c.note, c.cat, c.l].map(lc).join('\n');
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  /* opts: { pid ('' Inbox, undefined = every project), q, cat, sort } */
  function filterColors(colors, opts) {
    opts = opts || {};
    var out = colors.filter(function (c) {
      if (opts.pid !== undefined && c.pid !== opts.pid) return false;
      if (opts.cat && c.cat !== opts.cat) return false;
      return colorMatches(c, opts.q);
    });
    return out.sort(COLOR_SORTS[opts.sort] || COLOR_SORTS.new);
  }

  var PROJECT_SORTS = {
    recent: function (a, b) { return ts(b) - ts(a); },
    name: function (a, b) { return lc(a.name).localeCompare(lc(b.name)); },
    created: function (a, b) { return b.t - a.t; }
  };

  /* opts: { q, archived (true = only archived, false = only active), sort } */
  function filterProjects(projects, opts) {
    opts = opts || {};
    var q = lc(opts.q).trim();
    var out = projects.filter(function (p) {
      if (opts.archived !== undefined && !!p.archived !== !!opts.archived) return false;
      if (!q) return true;
      var hay = [p.name, p.client, p.desc].map(lc).join('\n');
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    });
    return out.sort(PROJECT_SORTS[opts.sort] || PROJECT_SORTS.recent);
  }

  /* ---------- plans ---------- */

  function fresh(salt, parts) { return Store.hashId(parts.concat([salt])); }

  function newProject(fields, now) {
    now = now || Date.now();
    var p = Store.normalizeProject({
      name: fields && fields.name, client: fields && fields.client, desc: fields && fields.desc,
      notes: fields && fields.notes, logo: fields && fields.logo, refs: fields && fields.refs, t: now, u: now
    }, { salt: String(now) + ':' + Math.random() });
    return p;
  }

  function touch(p, now) { var o = JSON.parse(JSON.stringify(p)); o.u = now || Date.now(); return o; }

  /* A copy is fully independent: new ids all round, so deleting a colour in the
     copy never touches the original. `suffix` is the localised word for "copy". */
  function planDuplicate(project, colors, palettes, salt, suffix, now) {
    now = now || Date.now();
    var pid = fresh(salt, ['project', project.id]);
    var p = JSON.parse(JSON.stringify(project));
    p.id = pid; p.name = (project.name + ' ' + (suffix || 'copy')).slice(0, 80);
    p.archived = false; p.t = now; p.u = now;
    var cs = colors.filter(function (c) { return c.pid === project.id; }).map(function (c, i) {
      var o = Object.assign({}, c); o.id = fresh(salt, ['color', c.id, i]); o.pid = pid; return o;
    });
    var qs = palettes.filter(function (q) { return q.pid === project.id; }).map(function (q, i) {
      var o = JSON.parse(JSON.stringify(q)); o.id = fresh(salt, ['palette', q.id, i]); o.pid = pid; o.t = now; o.u = now; return o;
    });
    return { put: { projects: [p], colors: cs, palettes: qs }, project: p };
  }

  /* keepColours true  -> contents go back to the Inbox
     keepColours false -> contents are deleted with the project
     Palettes follow the same choice. */
  function planDelete(pid, colors, palettes, keepColours) {
    var cs = colors.filter(function (c) { return c.pid === pid; });
    var qs = palettes.filter(function (q) { return q.pid === pid; });
    var ops = { put: { colors: [], palettes: [] }, del: { projects: [pid], colors: [], palettes: [] } };
    if (keepColours) {
      ops.put.colors = cs.map(function (c) { return Object.assign({}, c, { pid: '' }); });
      ops.put.palettes = qs.map(function (q) { return Object.assign({}, q, { pid: '', u: Date.now() }); });
    } else {
      ops.del.colors = cs.map(function (c) { return c.id; });
      ops.del.palettes = qs.map(function (q) { return q.id; });
    }
    return ops;
  }

  function planMoveColors(colors, ids, pid) {
    var set = {}; ids.forEach(function (i) { set[i] = 1; });
    return { put: { colors: colors.filter(function (c) { return set[c.id] && c.pid !== pid; })
      .map(function (c) { return Object.assign({}, c, { pid: pid }); }) } };
  }

  function planCategorise(colors, ids, cat) {
    var set = {}; ids.forEach(function (i) { set[i] = 1; });
    return { put: { colors: colors.filter(function (c) { return set[c.id] && c.cat !== cat; })
      .map(function (c) { return Object.assign({}, c, { cat: cat }); }) } };
  }

  function planMovePalette(palette, pid) {
    return { put: { palettes: [Object.assign({}, palette, { pid: pid, u: Date.now() })] } };
  }

  /* A bundle is always imported as a *copy*: importing a file must never
     overwrite a project the user already has, even if the ids collide. */
  function planImportBundle(bundle, salt, now) {
    now = now || Date.now();
    var pid = fresh(salt, ['bundle-project', bundle.project.id]);
    var p = Object.assign({}, bundle.project, { id: pid, archived: false, u: now });
    return {
      project: p,
      put: {
        projects: [p],
        colors: bundle.colors.map(function (c, i) { return Object.assign({}, c, { id: fresh(salt, ['bundle-color', c.id, i]), pid: pid }); }),
        palettes: bundle.palettes.map(function (q, i) { return Object.assign({}, q, { id: fresh(salt, ['bundle-palette', q.id, i]), pid: pid }); })
      }
    };
  }

  /* Restoring a whole backup. local and incoming are {colors, projects, palettes}.
     Returns the batch plus the merged lists, so the caller can mirror the result
     in memory without re-reading the database. */
  function planRestore(local, incoming, mode) {
    var cs = Store.mergeEntries(local.colors, incoming.colors, mode);
    var ps = Store.mergeById(local.projects, incoming.projects || [], mode);
    var qs = Store.mergeById(local.palettes, incoming.palettes || [], mode);
    // repair works on copies: the merge hands back the very objects the app is
    // showing, and nothing should change on screen before the write succeeds
    cs.entries = cs.entries.map(function (c) { return Object.assign({}, c); });
    qs.entries = qs.entries.map(function (q) { return Object.assign({}, q); });
    var moved = Store.repairOwnership(cs.entries, qs.entries, ps.entries);
    var ops = { put: { colors: cs.entries, projects: ps.entries, palettes: qs.entries } };
    if (mode === 'replace') ops.clear = ['colors', 'projects', 'palettes'];
    return {
      ops: ops, colors: cs.entries, projects: ps.entries, palettes: qs.entries, rehomed: moved,
      added: cs.added + ps.added + qs.added, updated: cs.updated + ps.updated + qs.updated
    };
  }

  return {
    CATEGORY_LABELS: CATEGORY_LABELS, counts: counts, identityOf: identityOf,
    filterColors: filterColors, filterProjects: filterProjects,
    COLOR_SORTS: Object.keys(COLOR_SORTS), PROJECT_SORTS: Object.keys(PROJECT_SORTS),
    newProject: newProject, touch: touch,
    planDuplicate: planDuplicate, planDelete: planDelete, planMoveColors: planMoveColors,
    planCategorise: planCategorise, planMovePalette: planMovePalette,
    planImportBundle: planImportBundle, planRestore: planRestore
  };
}));
