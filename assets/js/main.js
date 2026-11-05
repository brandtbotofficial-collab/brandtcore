/* Brandt Core — site scripts (no dependencies)
   - mobile menu, hero tabs, scroll reveal, contact form
   - loads /content.json (edited in /admin) and applies text, images and settings
   - renders the journal and blog posts
   - edit mode used by the admin's visual editor (?edit=1) */
(function () {
  'use strict';

  var body = document.body;
  var ROOT = body.getAttribute('data-root') || '';
  var PAGE = body.getAttribute('data-page') || 'index.html';
  var params = new URLSearchParams(location.search);
  var EDIT = params.get('edit') === '1' && window.parent !== window;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Mobile menu ---------- */
  var docEl = document.documentElement;
  var menu = document.getElementById('mmenu');
  var openBtn = document.querySelector('.menu-btn');
  var closeBtn = document.querySelector('.mmenu-close');
  function setMenu(open) {
    docEl.classList.toggle('menu-open', open);
    if (menu) menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && closeBtn) setTimeout(function () { closeBtn.focus(); }, 50);
    if (!open && openBtn) openBtn.focus();
  }
  if (menu && openBtn) {
    openBtn.addEventListener('click', function () { setMenu(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { docEl.classList.remove('menu-open'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && docEl.classList.contains('menu-open')) setMenu(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && docEl.classList.contains('menu-open')) docEl.classList.remove('menu-open');
    });
  }

  /* ---------- Hero system tabs ---------- */
  var SYSTEMS = [
    { label: 'Machine Learning', slug: 'predict', model: 'model v2', fig: 'prediction',
      inputs: [['Customer data', 'clients, orders'], ['Live data', 'real-time sales'], ['Documents', 'invoices, quotes']],
      outputs: [['Predictions', "next week's demand"], ['Automated decisions', 'stock and pricing']] },
    { label: 'AI Agents', slug: 'agents', model: 'agent', fig: 'agents',
      inputs: [['WhatsApp', 'customer messages'], ['Email', 'requests, quotes'], ['Instagram', 'DMs and comments']],
      outputs: [['Replies 24/7', 'in English, German, Albanian'], ['Bookings', 'straight into your calendar']] },
    { label: 'Data & Analytics', slug: 'insights', model: 'insights', fig: 'analytics',
      inputs: [['CRM', 'leads and clients'], ['Analytics', 'website traffic'], ['Finance', 'sales and costs']],
      outputs: [['Live dashboard', 'the numbers that matter'], ['Weekly report', 'sent every Monday']] }
  ];
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  var inBox = document.querySelector('[data-inputs]');
  var outBox = document.querySelector('[data-outputs]');
  var current = 0, timer = null;
  function showTab(i) {
    current = i;
    var s = SYSTEMS[i];
    tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
    var slugEl = document.querySelector('[data-slug]'); if (slugEl) slugEl.textContent = 'core / ' + s.slug;
    var modelEl = document.querySelector('[data-model]'); if (modelEl) modelEl.textContent = s.model;
    var figEl = document.querySelector('[data-fig]'); if (figEl) figEl.textContent = 'fig. 01 — ' + s.fig;
    inBox.innerHTML = s.inputs.map(function (n, k) {
      return '<div class="node-in swap" style="animation-delay:' + (k * 0.08) + 's"><b>' + esc(n[0]) + '</b><span>' + esc(n[1]) + '</span></div>';
    }).join('');
    outBox.innerHTML = s.outputs.map(function (n, k) {
      return '<div class="node-out swap" style="animation-delay:' + (0.25 + k * 0.08) + 's"><b>' + esc(n[0]) + '</b><span>' + esc(n[1]) +
        '</span><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i></div></div>';
    }).join('');
  }
  if (tabs.length && inBox && outBox) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { clearInterval(timer); showTab(i); });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        clearInterval(timer);
        var n = (current + (e.key === 'ArrowRight' ? 1 : SYSTEMS.length - 1)) % SYSTEMS.length;
        showTab(n); tabs[n].focus();
      });
    });
    showTab(0);
    if (!reduce && !EDIT) timer = setInterval(function () { showTab((current + 1) % SYSTEMS.length); }, 6000);
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add('in'); });
  }

  /* ---------- Contact form ---------- */
  var form = document.querySelector('form[data-mailto]');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = new FormData(form);
      var services = data.getAll('service').join(', ') || '—';
      var text = 'Name: ' + (data.get('name') || '') + '\nCompany: ' + (data.get('company') || '') +
        '\nEmail: ' + (data.get('email') || '') + '\nServices: ' + services + '\nBudget: ' + (data.get('budget') || '') +
        '\n\n' + (data.get('message') || '');
      var subject = 'New project — ' + (data.get('company') || data.get('name') || 'Website');
      location.href = 'mailto:' + form.getAttribute('data-mailto') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
      var ok = document.querySelector('.form-ok'); if (ok) ok.style.display = 'block';
    });
  }

  document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });

  /* ==========================================================
     Content (content.json) — text, media, settings, posts
     ========================================================== */
  var CONTENT = null;

  function mediaUrl(src) {
    if (!src) return '';
    if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
    return ROOT + src;
  }

  function setMedia(el, m) {
    var old = el.querySelector(':scope > .slot-media');
    if (old) old.remove();
    el.classList.remove('has-media');
    if (!m || !m.src) return;
    var node;
    if (m.type === 'video') {
      node = document.createElement('video');
      node.muted = true; node.loop = true; node.autoplay = true; node.playsInline = true;
      node.setAttribute('muted', ''); node.setAttribute('playsinline', '');
      node.src = mediaUrl(m.src);
    } else {
      node = document.createElement('img');
      node.src = mediaUrl(m.src);
      node.alt = m.alt || '';
      node.loading = 'lazy';
    }
    node.className = 'slot-media';
    el.appendChild(node);
    el.classList.add('has-media');
  }

  function applyPage(pageData) {
    if (!pageData) return;
    var text = pageData.text || {};
    Object.keys(text).forEach(function (k) {
      document.querySelectorAll('[data-k="' + k + '"]').forEach(function (el) { el.textContent = text[k]; });
    });
    var media = pageData.media || {};
    Object.keys(media).forEach(function (k) {
      document.querySelectorAll('[data-img="' + k + '"]').forEach(function (el) { setMedia(el, media[k]); });
    });
  }

  function applySettings(s) {
    if (!s) return;
    var map = {
      email: function (v) { return 'mailto:' + v; },
      booking: function (v) { return v; },
      instagram: null, linkedin: null, tiktok: null, behance: null
    };
    Object.keys(map).forEach(function (key) {
      var v = s[key];
      if (!v) return;
      document.querySelectorAll('[data-href="' + key + '"]').forEach(function (a) {
        a.setAttribute('href', map[key] ? map[key](v) : v);
        if (a.hasAttribute('data-href-text')) a.textContent = v;
      });
      if (key === 'email') document.querySelectorAll('form[data-mailto]').forEach(function (f) { f.setAttribute('data-mailto', v); });
    });
  }

  function apply(content) {
    CONTENT = content || {};
    var pages = CONTENT.pages || {};
    applyPage(pages._global);
    applyPage(pages[PAGE]);
    applySettings(CONTENT.settings);
    renderJournal();
    renderPost();
  }

  /* ---------- Journal + posts ---------- */
  function publishedPosts() {
    var list = (CONTENT && CONTENT.posts) || [];
    return list.filter(function (p) { return p.published !== false; })
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }
  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function clean(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html || '';
    tpl.content.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(function (n) { n.remove(); });
    tpl.content.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
      });
    });
    return tpl.innerHTML;
  }
  function renderJournal() {
    var box = document.querySelector('[data-posts]');
    if (!box) return;
    var posts = publishedPosts();
    if (!posts.length) return; // keep the static "coming soon" cards
    box.innerHTML = posts.map(function (p) {
      var cover = p.cover ? ' style="background-image:url(\'' + esc(mediaUrl(p.cover)) + '\')"' : '';
      return '<a class="post" href="' + ROOT + 'post.html?slug=' + encodeURIComponent(p.slug) + '">' +
        '<div class="ph"' + cover + '>' + (p.cover ? '' : '<span class="mono muted">' + esc(p.category || 'Journal') + '</span>') + '</div>' +
        '<span class="meta">' + esc(p.category || 'Journal') + (p.date ? ' · ' + esc(fmtDate(p.date)) : '') + '</span>' +
        '<h3>' + esc(p.title) + '</h3>' + (p.excerpt ? '<p>' + esc(p.excerpt) + '</p>' : '') + '</a>';
    }).join('');
  }
  function renderPost() {
    var box = document.querySelector('[data-article]');
    if (!box) return;
    var slug = params.get('slug');
    var all = (CONTENT && CONTENT.posts) || [];
    var p = all.filter(function (x) { return x.slug === slug && (x.published !== false || EDIT || params.get('preview') === '1'); })[0];
    if (!p) {
      box.innerHTML = '<span class="meta">Journal</span><h1>Article not found.</h1><p class="excerpt">It may have been moved or unpublished.</p>' +
        '<p style="margin-top:24px"><a class="btn" href="' + ROOT + 'journal.html">Back to the journal <span class="arr">→</span></a></p>';
      return;
    }
    document.title = p.title + ' | Brandt Core';
    var md = document.querySelector('meta[name="description"]'); if (md && p.excerpt) md.setAttribute('content', p.excerpt);
    box.innerHTML = '<nav class="crumbs mono" aria-label="Breadcrumb"><a href="' + ROOT + 'index.html">Home</a><span>/</span><a href="' + ROOT + 'journal.html">Journal</a></nav>' +
      '<p class="meta" style="margin-top:20px">' + esc(p.category || 'Journal') + (p.date ? ' · ' + esc(fmtDate(p.date)) : '') + '</p>' +
      '<h1>' + esc(p.title) + '</h1>' + (p.excerpt ? '<p class="excerpt">' + esc(p.excerpt) + '</p>' : '') +
      (p.cover ? '<div class="cover"><img src="' + esc(mediaUrl(p.cover)) + '" alt=""></div>' : '<div style="height:28px"></div>') +
      '<div class="body">' + clean(p.body) + '</div>' +
      '<p style="margin-top:40px"><a class="btn btn-ghost" href="' + ROOT + 'journal.html">← All articles</a></p>';
  }

  /* ---------- Load content ---------- */
  if (EDIT) {
    initEditMode();
  } else {
    var draft = null;
    if (params.get('preview') === '1') {
      try { draft = JSON.parse(localStorage.getItem('bc-admin-preview') || 'null'); } catch (e) { draft = null; }
    }
    if (draft) apply(draft);
    else {
      fetch(ROOT + 'content.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) { if (c) apply(c); else { renderJournal(); renderPost(); } })
        .catch(function () { CONTENT = {}; renderJournal(); renderPost(); });
    }
  }

  /* ==========================================================
     Edit mode — page runs inside the admin, every [data-k] text
     becomes editable and every [data-img] can be replaced.
     ========================================================== */
  function initEditMode() {
    docEl.classList.add('editing');
    var target = location.origin === 'null' ? '*' : location.origin;
    var send = function (msg) { msg.page = PAGE; window.parent.postMessage(msg, target); };

    // links and forms must not navigate inside the editor
    document.addEventListener('click', function (e) {
      var img = e.target.closest('[data-img]');
      if (img && !e.target.closest('[data-k]')) {
        e.preventDefault(); e.stopPropagation();
        send({ type: 'pick', key: img.getAttribute('data-img'), scope: img.getAttribute('data-scope') || 'page' });
        return;
      }
      var a = e.target.closest('a');
      if (a) e.preventDefault();
    }, true);
    document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

    var plain = (function () { var d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; })();
    document.querySelectorAll('[data-k]').forEach(function (el) {
      el.setAttribute('contenteditable', plain ? 'plaintext-only' : 'true');
      el.setAttribute('spellcheck', 'true');
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
        if (e.key === ' ' && el.closest('summary')) e.stopPropagation();
      });
      el.addEventListener('keyup', function (e) { if (e.key === ' ' && el.closest('summary')) e.preventDefault(); });
      el.addEventListener('paste', function (e) {
        e.preventDefault();
        var t = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t.replace(/\s+/g, ' '));
      });
      el.addEventListener('input', function () {
        el.classList.add('changed');
        var key = el.getAttribute('data-k');
        var v = el.textContent;
        document.querySelectorAll('[data-k="' + key + '"]').forEach(function (o) { if (o !== el) o.textContent = v; });
        send({ type: 'text', key: key, value: v, scope: el.getAttribute('data-scope') || 'page' });
      });
    });

    window.addEventListener('message', function (e) {
      if (e.source !== window.parent) return;
      var m = e.data || {};
      if (m.type === 'load') {
        apply(m.content);
      } else if (m.type === 'media') {
        document.querySelectorAll('[data-img="' + m.key + '"]').forEach(function (el) { setMedia(el, m.media); });
      }
    });
    send({ type: 'ready', title: document.title });
  }
})();
