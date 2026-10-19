/*! Color Hunter — Pro screens
 *
 *  What Pro is, what Free keeps, real previews of the paid tools, activation of a
 *  license key, and the upgrade sheet any locked feature opens.
 *
 *  This build sells nothing and says so. Buying needs a payment provider and a
 *  server that issues license keys; neither lives in this repository. When no
 *  checkout address is configured the screen explains that plainly instead of
 *  showing a button that goes nowhere, and when no public key is configured it
 *  says activation is not set up. See pro-config.js and tools/license.js.
 */
(function (root, factory) {
  factory(root.CHUI, root.CHI18N, root.CHData, root.CHWS, root.CHPro, root.CHStudio, root.CHExport, root.CHSheets);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (UI, I18N, Data, WS, Pro, Studio, Exp, Sheets) {
  'use strict';

  var el = UI.el, fill = UI.fill, icon = UI.icon;
  var t = function (k, v) { return I18N.t(k, v); };
  var app = function () { return WS.app(); };

  var SAMPLE = ['#2F5BEA', '#12B5A0', '#F2A93B'];
  var st = { busy: false, note: null };

  function manager() { return app().pro; }
  function previewAllowed() {
    try {
      var h = location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || /[?&]pro-preview=1\b/.test(location.search);
    } catch (e) { return false; }
  }
  function setPreview(on) {
    try { if (on) localStorage.setItem(Pro.PREVIEW_KEY, '1'); else localStorage.removeItem(Pro.PREVIEW_KEY); } catch (e) { /* ignore */ }
    return manager().refresh();
  }

  var REASONS = {
    format: 'That is not a Color Hunter license key. Paste the whole key, including the letters at the start.',
    signature: 'This key is not valid for this app.',
    product: 'This key is for a different product.',
    expired: 'This license has expired.',
    unsupported: 'This browser cannot check license keys.',
    unconfigured: 'License activation is not set up in this build.',
    storage: 'The key is valid but this browser would not store it.'
  };

  /* ---------- the upgrade sheet ---------- */

  var LIMIT_TEXT = {
    projects: ['More projects', 'Free includes up to {n} active projects. Archive one you are done with, or go Pro for unlimited projects.', Pro.FREE_LIMITS.projects],
    palettes: ['More palettes in this project', 'Free includes up to {n} palettes in each project. Pro has no limit.', Pro.FREE_LIMITS.palettesPerProject],
    compare: ['Compare more colors', 'Free compares up to {n} colors at once. Pro compares up to {m}.', Pro.FREE_LIMITS.compareColors]
  };
  function upsell(feature) {
    var lim = LIMIT_TEXT[feature], label, text;
    if (lim) { label = t(lim[0]); text = t(lim[1], { n: lim[2], m: Pro.PRO_LIMITS.compareColors }); }
    else { label = t(Pro.PRO_FEATURES[feature] || 'Pro feature'); text = t('This is part of Color Hunter Pro. You can preview it, but keeping, saving or exporting the result needs Pro.'); }
    var sh = UI.sheet({
      title: label, sub: t('Color Hunter Pro'),
      body: [el('p', { cls: 'hintx', style: 'margin-top:0', text: text }),
        el('p', { cls: 'hintx', text: t('Your colors, projects and backups always stay yours: nothing you made is ever hidden or deleted.') })],
      actions: [UI.button({ label: t('Not now'), onclick: function () { sh.close(); } }),
        UI.button({ label: t('See what Pro includes'), kind: 'primary', onclick: function () { sh.close(); WS.open('pro'); } })]
    });
  }
  WS.setUpsell(upsell);

  /* ---------- pieces ---------- */

  function statusCard() {
    var m = manager(), s = m.state(), cls = 'status', title, small, extra = null;
    if (s.tier === 'pro' && s.source === 'preview') {
      cls += ' preview'; title = t('Previewing Pro'); small = t('This device is previewing Pro features. It is not a purchase and not a license.');
      extra = UI.button({ label: t('Turn off'), cls: 'sm', onclick: function () { setPreview(false); } });
    } else if (s.tier === 'pro') {
      title = t('Pro is active');
      var plan = s.plan === 'year' ? t('Yearly') : t('Lifetime');
      small = [plan, s.holder, s.until ? t('valid until {date}', { date: UI.date(s.until) }) : ''].filter(Boolean).join(' · ');
      extra = UI.button({ label: t('Remove from this device'), cls: 'sm', onclick: function () {
        app().ask(t('Remove the license from this device?'), t('Pro tools lock again here. Your colors and projects stay. You can paste the key in again at any time.'),
          [{ label: t('Remove'), value: true }, { label: t('Cancel'), value: null }]).then(function (ok) { if (ok) m.deactivate().then(function () { app().toast(t('License removed from this device.')); }); });
      } });
    } else if (s.lapsed) {
      title = t('Your license has ended');
      small = s.lapsed.reason === 'expired' ? t('It expired on {date}. Everything you made is still here; Pro tools stay locked until you renew.', { date: s.lapsed.until ? UI.date(s.lapsed.until) : '' })
        : t('The stored key could not be verified. Everything you made is still here.');
    } else {
      title = t('You are on Free'); small = t('Everything on the Free side works fully and stays that way.');
    }
    return el('div', { cls: cls, role: 'status' }, [icon(s.tier === 'pro' ? 'check' : 'info', 20), el('div', { cls: 'sd' }, [el('b', { text: title }), el('small', { text: small })]), extra]);
  }

  function cell(v) {
    if (v === true) return el('div', { cls: 'v', 'aria-label': t('Included') }, icon('check', 16));
    if (v === false) return el('div', { cls: 'v', 'aria-label': t('Not included'), text: '—' });
    if (Array.isArray(v)) return el('div', { cls: 'v', text: t(v[0], v[1]) });
    return el('div', { cls: 'v', text: t(v) });
  }
  function table() {
    var rows = [el('div', { cls: 'h', text: t('Feature') }), el('div', { cls: 'h v', text: t('Free') }), el('div', { cls: 'h v', text: t('Pro') })];
    Pro.comparison().forEach(function (r) {
      rows.push(el('div', { text: t(r.label) }));
      rows.push(cell(r.free));
      var p = cell(r.pro); p.classList.add('pro'); rows.push(p);
    });
    return el('div', { cls: 'ctab', role: 'table', 'aria-label': t('Free and Pro compared') }, rows);
  }

  function previews() {
    var list = [];
    // 1. a real brand sheet
    var brand = null;
    try {
      var r = Sheets.render('brand', { title: t('Sample brand'), subtitle: t('Sample palette'), client: t('Your client'), desc: t('A hand-over page with a logo, a client and the palette.'),
        colors: SAMPLE.map(function (h) { return { h: h, name: app().tName(app().describe(h).name) }; }) }, { t: t, dir: I18N.get() === 'fa' ? 'rtl' : 'ltr', today: '' });
      brand = el('div', { cls: 'page' }, UI.svgNode(r.pages[0]));
    } catch (e) { brand = null; }
    if (brand) list.push(el('div', { cls: 'pvc' }, [el('div', { cls: 'ph' }, [el('span', { text: t('Brand sheet') }), icon('layers', 16)]), el('div', { cls: 'pbody' }, [
      el('div', { cls: 'stage', style: 'margin:0 -12px' }, brand), el('p', { cls: 'hintx', text: t('Your logo, client and description on a page ready to hand over. Exported as PDF, PNG or SVG.') })])]));
    // 2. a light and dark system
    var sys = Studio.buildSystem(SAMPLE);
    function mock(set) {
      return el('div', { cls: 'mock', style: '--m-bg:' + set.background + ';--m-surface:' + set.surface + ';--m-text:' + set.text + ';--m-muted:' + set.muted + ';--m-border:' + set.border + ';--m-primary:' + set.primary + ';--m-on:' + set.onPrimary + ';--m-secondary:' + set.secondary, 'aria-hidden': 'true' }, [
        el('div', { cls: 'mc' }, [el('h4', { text: t('Welcome back') }), el('p', { text: t('Your project has three new palettes waiting.') }), el('span', { cls: 'mb', text: t('Continue') })])]);
    }
    var fails = Studio.systemChecks(sys.light).filter(function (c) { return !c.pass; }).length + Studio.systemChecks(sys.dark).filter(function (c) { return !c.pass; }).length;
    list.push(el('div', { cls: 'pvc' }, [el('div', { cls: 'ph' }, [el('span', { text: t('UI color system') }), icon('system', 16)]), el('div', { cls: 'pbody' }, [
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, [mock(sys.light), mock(sys.dark)]),
      el('p', { cls: 'hintx', text: t('Light and dark roles from your palette, every pair checked against WCAG, with one tap to fix the ones that fail.') + ' ' + (fails ? '' : t('This sample passes every check.')) })])]));
    // 3. design tokens
    var tok = Exp.designTokens({ title: t('Sample palette'), colors: SAMPLE.map(function (h, i) { return { h: h, name: ['brand', 'teal', 'amber'][i] }; }) }).split('\n').slice(0, 9).join('\n') + '\n…';
    list.push(el('div', { cls: 'pvc' }, [el('div', { cls: 'ph' }, [el('span', { text: t('Design tokens') }), icon('link', 16)]), el('div', { cls: 'pbody' }, [
      el('pre', { cls: 'codebox ltr', text: tok }), el('p', { cls: 'hintx', text: t('W3C design-token JSON and CSS for a light and dark system, ready for your build.') })])]));
    return el('div', { cls: 'pvcards' }, list);
  }

  function activation() {
    var m = manager(), s = m.state();
    if (s.tier === 'pro' && s.source === 'license') return null;
    var out = [];
    var url = m.checkoutUrl();
    if (url) {
      out.push(el('a', { cls: 'wb primary', href: url, target: '_blank', rel: 'noopener noreferrer' }, [icon('link', 18), el('span', { text: m.priceLabel() ? t('Get Pro · {price}', { price: m.priceLabel() }) : t('Get Pro') })]));
      out.push(el('p', { cls: 'hintx', text: t('Checkout opens in your browser. After you pay you receive a license key to paste below.') }));
    } else {
      out.push(el('div', { cls: 'note' }, [el('b', { text: t('Buying is not open yet.') }), ' ', t('This version of the app has no checkout connected, so there is nothing to buy and nothing is charged. Free works fully in the meantime.')]));
    }
    if (m.canActivate()) {
      var key = UI.field({ label: t('License key'), type: 'textarea', rows: 3, placeholder: 'CH1.…', dir: 'ltr', hint: t('Paste the key you received. It is checked on this device and never sent anywhere.') });
      var note = el('div', { role: 'status', 'aria-live': 'polite' });
      if (st.note) fill(note, el('p', { cls: 'note warn', text: st.note }));
      out.push(key.root, note, el('div', { cls: 'wrow', style: 'margin-top:10px' }, [UI.button({ label: st.busy ? t('Checking…') : t('Activate'), kind: 'primary', disabled: st.busy, onclick: function () {
        var v = key.get().trim();
        if (!v) { st.note = t('Paste your license key first.'); return WS.refresh({ keepScroll: true }); }
        st.busy = true; st.note = null; WS.refresh({ keepScroll: true });
        m.activate(v).then(function (r) {
          st.busy = false;
          if (r.ok) { st.note = null; app().toast(t('Pro is active on this device.'), 3200); app().snd('lock'); }
          else st.note = t(REASONS[r.reason] || 'That key could not be used.');
          WS.refresh({ keepScroll: true });
        });
      } })]));
    } else {
      out.push(el('p', { cls: 'hintx', text: t('License activation is not set up in this build, so there is no place to paste a key yet.') }));
    }
    if (previewAllowed() && !(s.tier === 'pro' && s.source === 'preview')) {
      out.push(el('div', { cls: 'wrow', style: 'margin-top:14px' }, [UI.button({ label: t('Developer: preview Pro features'), cls: 'sm quiet', onclick: function () { setPreview(true).then(function () { app().toast(t('Previewing Pro on this device. Not a purchase.'), 3200); }); } })]));
    }
    return el('div', null, out);
  }

  /* ---------- the screen ---------- */

  function view() {
    var m = manager(), isPro = m.isPro();
    var hero = el('div', { cls: 'hero' }, [el('i', { cls: 'orb', 'aria-hidden': 'true' }),
      el('span', { cls: 'badge' }, [icon('pro', 12), el('span', { text: isPro ? t('Pro') : t('Color Hunter Pro') })]),
      el('h2', { text: t('Take a color from the camera to a finished brand sheet.') }),
      el('p', { text: t('Pro adds the professional tools: UI color systems with automatic fixes, scales, design tokens, and branded sheets for clients.') })]);
    return { key: 'pro', title: t('Pro'), body: [hero, statusCard(),
      el('h3', { cls: 'wh2' }, [el('span', { text: t('Free and Pro') })]), table(),
      el('p', { cls: 'hintx', text: t('Free is not a trial. Colors you saved above a limit are never hidden or deleted; the limits only stop you creating more.') }),
      el('h3', { cls: 'wh2' }, [el('span', { text: t('See it for real') })]), previews(),
      el('h3', { cls: 'wh2' }, [el('span', { text: isPro ? t('Your license') : t('Get Pro') })]), activation() ] };
  }

  WS.register('pro', { enter: function () { st.note = null; }, view: view, back: function () { return false; } });
}));
