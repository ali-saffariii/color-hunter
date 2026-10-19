/*! Color Hunter — Free and Pro
 *
 *  What this file is: the single place that knows which features and limits belong
 *  to which tier, and how an entitlement is proven. The rest of the app asks
 *  `gate(...)`; it never looks at a flag itself.
 *
 *  What this file is NOT: a payment system. There is no server here, so nothing
 *  can be bought from inside the app yet. The ready-made provider checks offline
 *  license keys that you sign yourself (tools/license.js) with a private key that
 *  never ships; the app only holds the matching public key. A payment gateway
 *  later replaces `provider` and nothing else has to change. Because the code runs
 *  on the user's device, any client-side gate can be removed by someone who edits
 *  their own copy — it keeps honest users honest, which is all a static site can do.
 *
 *  Rules this file keeps:
 *    - Limits only ever stop *creating* more. Nothing a user already made is hidden,
 *      locked or deleted when a license lapses, and backups/project files are free.
 *    - A preview is labelled as a preview. It is never reported as a purchase.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory();
  if (isNode) module.exports = api;
  root.CHPro = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PRODUCT = 'color-hunter-pro';
  var PREFIX = 'CH1';
  var STORE_KEY = 'ch.pro.v1';
  var PREVIEW_KEY = 'ch.pro.preview';
  var PLANS = ['lifetime', 'year'];

  /* ---------- what is limited ---------- */

  var FREE_LIMITS = { projects: 3, palettesPerProject: 3, compareColors: 2 };
  var PRO_LIMITS = { projects: Infinity, palettesPerProject: Infinity, compareColors: 8 };

  /* Features that need Pro. Anything not listed here is free. */
  var PRO_FEATURES = {
    'studio.scales': 'Light and dark scales',
    'studio.system': 'UI color system',
    'studio.autofix': 'Fix a color system automatically',
    'export.tokens': 'Design tokens (JSON)',
    'export.systemCss': 'CSS for a light and dark system',
    'export.sheet.brand': 'Brand sheet',
    'export.sheet.board': 'Presentation board',
    'export.sheet.system': 'UI system sheet'
  };

  function limitsFor(state) { return isPro(state) ? PRO_LIMITS : FREE_LIMITS; }

  function isPro(state) { return !!state && state.tier === 'pro'; }

  /* { ok:true } or { ok:false, need:'pro', feature } */
  function gate(state, feature) {
    if (!PRO_FEATURES[feature] || isPro(state)) return { ok: true };
    return { ok: false, need: 'pro', feature: feature };
  }

  /* Creating one more project / palette. `used` is how many exist now. Existing
     data above the limit is left alone; only the next one is refused. */
  function canCreate(state, what, used) {
    var key = what === 'palette' ? 'palettesPerProject' : 'projects';
    var limit = limitsFor(state)[key];
    return used < limit ? { ok: true, limit: limit, used: used } : { ok: false, need: 'pro', feature: what === 'palette' ? 'palettes' : 'projects', limit: limit, used: used };
  }

  /* How many colours the compare view may show. */
  function compareLimit(state) { return limitsFor(state).compareColors; }

  /* The sheet template ids that are Pro, taken from the sheet list itself so a new
     template cannot be added without deciding which side it is on. */
  function sheetFeature(templateId) { return 'export.sheet.' + templateId; }

  /* The Free-versus-Pro table. Built from the limits above, so the page can never
     promise something the gate does not do. Cells are `true`, `false`, or
     [text, params] for a translated string with numbers in it. */
  function comparison() {
    return [
      { label: 'Color detection, color book and backup', free: true, pro: true },
      { label: 'Active projects', free: ['Up to {n}', { n: FREE_LIMITS.projects }], pro: 'Unlimited' },
      { label: 'Palettes per project', free: ['Up to {n}', { n: FREE_LIMITS.palettesPerProject }], pro: 'Unlimited' },
      { label: 'Harmonies, contrast checks and palettes from images', free: true, pro: true },
      { label: 'Compare colors', free: ['Up to {n}', { n: FREE_LIMITS.compareColors }], pro: ['Up to {n}', { n: PRO_LIMITS.compareColors }] },
      { label: 'Light and dark scales', free: false, pro: true },
      { label: 'UI color system with automatic fixes', free: false, pro: true },
      { label: 'Palette card and spec sheet', free: true, pro: true },
      { label: 'CSS variables and SVG swatches', free: true, pro: true },
      { label: 'Design tokens and system CSS', free: false, pro: true },
      { label: 'Brand sheet with your logo, presentation board and UI system sheet', free: false, pro: true }
    ];
  }

  /* ---------- license keys ---------- */

  /* CH1.<payload>.<signature>
       payload    base64url of JSON { v, product, id, plan, holder?, iat, exp? }
       signature  base64url of ECDSA P-256 / SHA-256 over "CH1.<payload>" (r||s) */

  function b64uEncode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) return null;
    try {
      var s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
      var out = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }
  function utf8(s) { return new TextEncoder().encode(s); }

  function defaultSubtle() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto.subtle;
    if (typeof require === 'function') { try { return require('crypto').webcrypto.subtle; } catch (e) { /* none */ } }
    return null;
  }

  function validPayload(p) {
    if (!p || typeof p !== 'object') return false;
    if (p.v !== 1 || p.product !== PRODUCT) return false;
    if (typeof p.id !== 'string' || !p.id || p.id.length > 64) return false;
    if (PLANS.indexOf(p.plan) < 0) return false;
    if (typeof p.iat !== 'number' || !isFinite(p.iat)) return false;
    if (p.plan === 'year' && !(typeof p.exp === 'number' && isFinite(p.exp))) return false;
    if (p.holder !== undefined && (typeof p.holder !== 'string' || p.holder.length > 120)) return false;
    return true;
  }

  /* -> Promise<{ ok:true, payload } | { ok:false, reason }>
     reasons: unconfigured, unsupported, format, signature, product, expired */
  function verifyLicense(key, publicJwk, nowMs, subtle) {
    subtle = subtle || defaultSubtle();
    if (!publicJwk || typeof publicJwk !== 'object') return Promise.resolve({ ok: false, reason: 'unconfigured' });
    if (!subtle) return Promise.resolve({ ok: false, reason: 'unsupported' });
    var parts = String(key || '').trim().replace(/\s+/g, '').split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) return Promise.resolve({ ok: false, reason: 'format' });
    var sig = b64uDecode(parts[2]), body = b64uDecode(parts[1]);
    if (!sig || !body || sig.length !== 64) return Promise.resolve({ ok: false, reason: 'format' });
    var payload;
    try { payload = JSON.parse(new TextDecoder().decode(body)); } catch (e) { return Promise.resolve({ ok: false, reason: 'format' }); }
    return subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      .then(function (pub) { return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, utf8(parts[0] + '.' + parts[1])); })
      .then(function (good) {
        if (!good) return { ok: false, reason: 'signature' };
        if (!validPayload(payload)) return { ok: false, reason: payload && payload.product && payload.product !== PRODUCT ? 'product' : 'format' };
        if (payload.exp !== undefined && nowMs >= payload.exp) return { ok: false, reason: 'expired', payload: payload };
        return { ok: true, payload: payload };
      }, function () { return { ok: false, reason: 'unconfigured' }; });
  }

  /* ---------- entitlement state ---------- */

  function freeState(lapsed) {
    var s = { tier: 'free', source: 'none' };
    if (lapsed) s.lapsed = lapsed;
    return s;
  }

  function stateFromPayload(p) {
    return { tier: 'pro', source: 'license', plan: p.plan, id: p.id, holder: p.holder || '', since: p.iat, until: p.exp === undefined ? null : p.exp };
  }

  /* A manager owns the current state and the one place it is stored.
     opts: { storage, config:{ publicKey, checkoutUrl, productName, priceLabel }, now, subtle }
     `storage` is anything with getItem/setItem/removeItem (localStorage in the
     app, a plain object in tests). The *key* is stored, never the tier: the tier
     is re-proven from the key on every start, so a stored "pro" flag means nothing. */
  function createManager(opts) {
    opts = opts || {};
    var storage = opts.storage || null, config = opts.config || {};
    var now = opts.now || function () { return Date.now(); };
    var state = freeState(), listeners = [];

    function get(k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
    function set(k, v) { try { if (storage) storage.setItem(k, v); return true; } catch (e) { return false; } }
    function del(k) { try { if (storage) storage.removeItem(k); } catch (e) { /* ignore */ } }
    function change(next) {
      var same = JSON.stringify(next) === JSON.stringify(state);
      state = next;
      if (!same) listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* a listener must not break the others */ } });
      return state;
    }

    function refresh() {
      if (get(PREVIEW_KEY) === '1') return Promise.resolve(change({ tier: 'pro', source: 'preview' }));
      var key = get(STORE_KEY);
      if (!key) return Promise.resolve(change(freeState()));
      return verifyLicense(key, config.publicKey, now(), opts.subtle).then(function (r) {
        if (r.ok) return change(stateFromPayload(r.payload));
        return change(freeState({ reason: r.reason, plan: r.payload && r.payload.plan, until: r.payload && r.payload.exp }));
      });
    }

    /* Resolves { ok:true, state } or { ok:false, reason }. The key is stored only
       after it has been proven, so a wrong key never replaces a working one. */
    function activate(key) {
      return verifyLicense(key, config.publicKey, now(), opts.subtle).then(function (r) {
        if (!r.ok) return { ok: false, reason: r.reason };
        var clean = String(key).trim().replace(/\s+/g, '');
        if (!set(STORE_KEY, clean)) return { ok: false, reason: 'storage' };
        return { ok: true, state: change(stateFromPayload(r.payload)) };
      });
    }

    function deactivate() { del(STORE_KEY); return refresh(); }

    return {
      state: function () { return state; },
      refresh: refresh, activate: activate, deactivate: deactivate,
      gate: function (feature) { return gate(state, feature); },
      canCreate: function (what, used) { return canCreate(state, what, used); },
      compareLimit: function () { return compareLimit(state); },
      isPro: function () { return isPro(state); },
      isPreview: function () { return state.source === 'preview'; },
      // can this build activate anything at all? (a public key is configured)
      canActivate: function () { return !!config.publicKey; },
      // can this build send someone to buy? (a checkout address is configured)
      checkoutUrl: function () { return /^https:\/\//.test(config.checkoutUrl || '') ? config.checkoutUrl : ''; },
      priceLabel: function () { return String(config.priceLabel || ''); },
      onChange: function (fn) { listeners.push(fn); }
    };
  }

  return {
    PRODUCT: PRODUCT, PREFIX: PREFIX, STORE_KEY: STORE_KEY, PREVIEW_KEY: PREVIEW_KEY, PLANS: PLANS,
    FREE_LIMITS: FREE_LIMITS, PRO_LIMITS: PRO_LIMITS, PRO_FEATURES: PRO_FEATURES,
    gate: gate, canCreate: canCreate, compareLimit: compareLimit, limitsFor: limitsFor, isPro: isPro,
    sheetFeature: sheetFeature, comparison: comparison,
    verifyLicense: verifyLicense, createManager: createManager, freeState: freeState,
    b64uEncode: b64uEncode, b64uDecode: b64uDecode
  };
}));
