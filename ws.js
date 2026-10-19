/*! Color Hunter — workspace shell
 *
 *  A full-screen layer over the camera with four places to be: Projects, Studio,
 *  Export and Pro. The shell owns only what they share — the header, the tab bar,
 *  history (so the phone's back gesture steps out of the workspace instead of
 *  closing the app), appearance, and the way a screen asks to be drawn again. Each
 *  tab is a controller registered with CHWS.register and keeps its own state.
 *
 *  A controller provides
 *    enter(params)   called when someone navigates to it with a purpose
 *    view()          { key, title, sub, back, actions, body } — what to draw now
 *    back()          step up one level; true if it did
 *  and calls CHWS.refresh() whenever its state changes. Screens that hold a text
 *  box redraw only the part below it, so typing is never interrupted.
 */
(function (root, factory) {
  root.CHWS = factory(root.CHUI, root.CHI18N, root.CHData);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (UI, I18N, Data) {
  'use strict';

  var el = UI.el, fill = UI.fill, icon = UI.icon;
  var t = function (k, v) { return I18N.t(k, v); };

  var TABS = [
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'studio', label: 'Studio', icon: 'studio' },
    { id: 'export', label: 'Export', icon: 'export' },
    { id: 'pro', label: 'Pro', icon: 'pro' }
  ];

  var app = null, ctls = {}, tab = 'projects', isOpen = false, lastKey = '', lastTab = '', hist = false, built = false;
  var host, hBack, hTitle, hActions, body, col, tabsEl, tabBtns = {};

  function register(id, ctl) { ctls[id] = ctl; }

  /* ---------- building ---------- */

  function build() {
    if (built) return;
    built = true;
    hBack = el('button', { type: 'button', cls: 'wb ghost only', onclick: onBack });
    hTitle = el('h1');
    hActions = el('div', { cls: 'wrow' });
    col = el('div', { cls: 'wcol screen' });
    body = el('div', { cls: 'wbody' }, col);
    tabsEl = el('nav', { cls: 'wtabs', 'aria-label': t('Workspace') });
    TABS.forEach(function (tb) {
      var b = el('button', { type: 'button', 'data-tab': tb.id, onclick: function () { go(tb.id); } }, [icon(tb.icon, 20), el('span', { 'data-l': '1' }), el('i', { cls: 'tag', 'data-pro': '1', hidden: 'hidden' })]);
      tabBtns[tb.id] = b; tabsEl.appendChild(b);
    });
    host = el('div', { id: 'ws', role: 'dialog', 'aria-modal': 'true' }, [el('header', { cls: 'wh' }, [hBack, hTitle, hActions]), body, tabsEl]);
    document.body.appendChild(host);
  }

  function labels() {
    host.setAttribute('aria-label', t('Workspace'));
    tabsEl.setAttribute('aria-label', t('Workspace'));
    TABS.forEach(function (tb) {
      var b = tabBtns[tb.id];
      b.querySelector('[data-l]').textContent = t(tb.label);
      var tag = b.querySelector('[data-pro]');
      if (tb.id === 'pro') { tag.hidden = !(app && app.pro && !app.pro.isPro()); tag.textContent = t('PRO'); }
    });
  }

  /* ---------- drawing ---------- */

  function render(opts) {
    if (!isOpen) return;
    var ctl = ctls[tab];
    if (!ctl) return;
    var v;
    try { v = ctl.view(); }
    catch (e) {
      v = { key: 'error', title: t(TABS.filter(function (x) { return x.id === tab; })[0].label), body: UI.error({ title: t('This screen could not be drawn.'), text: t('Nothing was lost. Go back and try again.') }) };
    }
    labels();
    fill(hTitle, [v.title, v.sub ? el('small', { text: v.sub }) : null]);
    fill(hBack, icon(v.back ? 'back' : 'camera', 20));
    hBack.setAttribute('aria-label', v.back ? t('Back') : t('Back to camera'));
    fill(hActions, v.actions || []);
    var keep = !(opts && opts.keepScroll === false) && v.key === lastKey && tab === lastTab ? body.scrollTop : 0;
    var fresh = v.key !== lastKey || tab !== lastTab;
    fill(col, v.body);
    col.classList.remove('screen');
    if (fresh) { void col.offsetWidth; col.classList.add('screen'); }
    body.scrollTop = keep;
    lastKey = v.key; lastTab = tab;
    TABS.forEach(function (tb) {
      var on = tb.id === tab;
      tabBtns[tb.id].classList.toggle('on', on);
      tabBtns[tb.id].setAttribute('aria-current', on ? 'page' : 'false');
    });
  }

  function refresh(opts) { render(opts); }

  /* ---------- navigation ---------- */

  function onBack() {
    var ctl = ctls[tab];
    if (ctl && ctl.back && ctl.back()) { render({ keepScroll: false }); return; }
    close();
  }

  function go(id, params) {
    if (!ctls[id]) return;
    tab = id;
    if (ctls[id].enter) ctls[id].enter(params || {});
    render({ keepScroll: false });
    body.scrollTop = 0;
    if (app && app.snd) app.snd('tick');
  }

  function open(id, params) {
    build();
    if (!isOpen) {
      isOpen = true;
      if (app && app.onWorkspace) app.onWorkspace(true);
      document.body.classList.add('ws-open');
      host.classList.add('on');
      try { history.pushState({ ws: 1 }, ''); hist = true; } catch (e) { hist = false; }
    }
    go(id || tab, params);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    host.classList.remove('on');
    document.body.classList.remove('ws-open');
    if (hist) { hist = false; try { history.back(); } catch (e) { /* ignore */ } }
    if (app && app.onWorkspace) app.onWorkspace(false);
  }

  addEventListener('popstate', function () {
    if (!isOpen) return;
    hist = false;
    var ctl = ctls[tab];
    if (ctl && ctl.back && ctl.back()) {
      try { history.pushState({ ws: 1 }, ''); hist = true; } catch (e) { /* ignore */ }
      render({ keepScroll: false });
    } else close();
  });

  /* ---------- appearance ---------- */

  function resolveTheme(pref) {
    if (pref === 'dark' || pref === 'light') return pref;
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(pref) { document.documentElement.setAttribute('data-theme', resolveTheme(pref)); }
  if (typeof matchMedia === 'function') {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var follow = function () { if (app && app.settings && (app.settings.theme || 'auto') === 'auto') applyTheme('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
  }

  /* Theme and language, in one small sheet reachable from the Projects header. */
  function appearanceSheet() {
    var S = app.settings;
    var th = UI.seg({ aria: t('Theme'), value: S.theme || 'auto', options: [
      { id: 'auto', label: t('Auto'), icon: 'wand' }, { id: 'light', label: t('Light'), icon: 'sun' }, { id: 'dark', label: t('Dark'), icon: 'moon' }],
      onChange: function (v) { S.theme = v; app.save(); applyTheme(v); app.snd('tick'); } });
    var lg = UI.seg({ aria: t('Language'), value: I18N.get(), options: [{ id: 'en', label: 'English' }, { id: 'fa', label: 'فارسی' }],
      onChange: function (v) { sh.close(); app.setLanguage(v); } });
    var sh = UI.sheet({ title: t('Appearance'), body: [
      el('div', { cls: 'wfield' }, [el('label', { text: t('Theme') }), th.root]),
      el('div', { cls: 'wfield' }, [el('label', { text: t('Language') }), lg.root]),
      el('p', { cls: 'hintx', text: t('Auto follows your device. Dark is easier on the eyes at night and in dim rooms; light is better in sun.') })] });
  }


  /* ---------- one answer to "that did not work" ----------
     Every data operation resolves { ok:false, reason }. This turns the reason
     into what the person sees, so no screen has to reinvent it. */
  var upsellFn = null;
  function setUpsell(fn) { upsellFn = fn; }
  function upsell(feature) { if (upsellFn) upsellFn(feature); }
  function fail(r) {
    var say = function (m, ms) { if (app) app.toast(m, ms || 4200); };
    if (!r || r.ok) return;
    if (r.reason === 'limit') upsell(r.feature);
    else if (r.reason === 'quota') say(t('Not saved: this device is out of storage. Back up to a file, then clear some colors.'), 5200);
    else if (r.reason === 'write') say(t('Not saved: the browser refused to write to storage.'), 4600);
    else if (r.reason === 'missing') say(t('That item no longer exists.'));
    else if (r.reason === 'invalid') say(t('That could not be saved: some of the data was not valid.'));
    else if (r.reason === 'file') say(UI.tm((r.errors && r.errors[0]) || ''), 5200);
    else say(t('That did not work. Nothing was changed.'));
  }

  /* ---------- the bridge to the camera app ---------- */

  function init(bridge) { app = bridge; build(); labels(); }

  return {
    TABS: TABS, init: init, register: register, open: open, close: close, go: go, refresh: refresh,
    isOpen: function () { return isOpen; }, tab: function () { return tab; },
    app: function () { return app; }, applyTheme: applyTheme, resolveTheme: resolveTheme,
    fail: fail, setUpsell: setUpsell, upsell: upsell, appearanceSheet: appearanceSheet, labels: function () { if (built) labels(); }
  };
}));
