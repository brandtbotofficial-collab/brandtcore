/* Brandt Core — admin dashboard
   Edits /content.json: page texts and media, blog posts, settings.
   Drafts live in this browser (localStorage + IndexedDB for new files).
   Publishing commits content.json and new media to GitHub (Netlify redeploys),
   or you download them and replace the files yourself. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ORIGIN = location.origin === 'null' ? '*' : location.origin;
  var debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
  var slugify = function (s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ë/g, 'e').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var uid = function () { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
  var fmtSize = function (b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };

  function toast(msg, err) {
    var t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, err ? 5200 : 3000);
  }

  /* ---------- IndexedDB for new (unpublished) media files ---------- */
  var idb = null;
  function openDB() {
    return new Promise(function (res) {
      if (!('indexedDB' in window)) return res(null);
      var r = indexedDB.open('bc-admin', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('files'); };
      r.onsuccess = function () { idb = r.result; res(idb); };
      r.onerror = function () { res(null); };
    });
  }
  function dbOp(mode, fn) {
    return new Promise(function (res, rej) {
      if (!idb) return res(null);
      var tx = idb.transaction('files', mode); var st = tx.objectStore('files');
      var req = fn(st);
      tx.oncomplete = function () { res(req && req.result); };
      tx.onerror = function () { rej(tx.error); };
    });
  }
  var putFile = function (name, blob) { return dbOp('readwrite', function (s) { return s.put(blob, name); }); };
  var delFile = function (name) { return dbOp('readwrite', function (s) { return s.delete(name); }); };
  var allFiles = function () {
    return new Promise(function (res) {
      if (!idb) return res({});
      var out = {}; var tx = idb.transaction('files'); var st = tx.objectStore('files');
      st.openCursor().onsuccess = function (e) { var c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } };
      tx.oncomplete = function () { res(out); };
    });
  };
  var clearFiles = function () { return dbOp('readwrite', function (s) { return s.clear(); }); };

  /* ---------- state ---------- */
  var EMPTY = { version: 1, updatedAt: null, settings: {}, pages: {}, media: [], posts: [] };
  var base = clone(EMPTY);      // what is published
  var draft = clone(EMPTY);     // what you are editing
  var pending = {};             // name -> Blob (new files)
  var blobUrls = {};            // src -> object URL
  var PAGES = [];
  var gh = {};
  try { gh = JSON.parse(localStorage.getItem('bc-admin-gh') || '{}'); } catch (e) { gh = {}; }

  function normalize(c) {
    c = c && typeof c === 'object' ? c : {};
    var o = Object.assign(clone(EMPTY), c);
    o.settings = o.settings || {}; o.pages = o.pages || {}; o.media = o.media || []; o.posts = o.posts || [];
    return o;
  }
  function isPending(src) { return !!pending[(src || '').split('/').pop()] && /^assets\/uploads\//.test(src || ''); }
  function resolveSrc(src) {
    if (!src) return '';
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    var name = src.split('/').pop();
    if (pending[name]) {
      if (!blobUrls[src]) blobUrls[src] = URL.createObjectURL(pending[name]);
      return blobUrls[src];
    }
    return '../' + src.replace(/^\//, '');
  }
  // copy of the draft where unpublished files point to blob URLs (for previews)
  function resolvedDraft() {
    var c = clone(draft);
    Object.keys(c.pages).forEach(function (p) {
      var m = c.pages[p].media || {};
      Object.keys(m).forEach(function (k) { if (m[k] && isPending(m[k].src)) m[k].src = resolveSrc(m[k].src); });
    });
    c.posts.forEach(function (p) {
      if (p.cover && isPending(p.cover)) p.cover = resolveSrc(p.cover);
      p.body = (p.body || '').replace(/(src=")(assets\/uploads\/[^"]+)"/g, function (all, a, src) { return isPending(src) ? a + resolveSrc(src) + '"' : all; });
    });
    return c;
  }

  var saveDraft = debounce(function () {
    try {
      localStorage.setItem('bc-admin-draft', JSON.stringify(draft));
      localStorage.setItem('bc-admin-preview', JSON.stringify(resolvedDraft()));
    } catch (e) { toast('Could not save the draft on this device: ' + e.message, true); }
    refreshStatus();
  }, 250);

  /* ---------- diff ---------- */
  function pageTitle(path) {
    if (path === '_global') return 'Header & footer';
    var p = PAGES.filter(function (x) { return x.path === path; })[0];
    return p ? p.title : path;
  }
  function changes() {
    var out = [];
    var keys = {};
    Object.keys(draft.pages).concat(Object.keys(base.pages)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (p) {
      var d = draft.pages[p] || {}, b = base.pages[p] || {};
      var dt = d.text || {}, bt = b.text || {}, dm = d.media || {}, bm = b.media || {};
      var tk = {}; Object.keys(dt).concat(Object.keys(bt)).forEach(function (k) { tk[k] = 1; });
      Object.keys(tk).forEach(function (k) { if (dt[k] !== bt[k]) out.push({ page: p, tag: pageTitle(p), kind: 'text', text: dt[k] == null ? '(restored original text)' : dt[k] }); });
      var mk = {}; Object.keys(dm).concat(Object.keys(bm)).forEach(function (k) { mk[k] = 1; });
      Object.keys(mk).forEach(function (k) { if (JSON.stringify(dm[k] || null) !== JSON.stringify(bm[k] || null)) out.push({ page: p, tag: pageTitle(p), kind: 'media', text: dm[k] ? 'Media: ' + dm[k].src.split('/').pop() : 'Media removed' }); });
    });
    var sk = {}; Object.keys(draft.settings).concat(Object.keys(base.settings)).forEach(function (k) { sk[k] = 1; });
    Object.keys(sk).forEach(function (k) { if ((draft.settings[k] || '') !== (base.settings[k] || '')) out.push({ page: 'settings', tag: 'Settings', kind: 'setting', text: k + ': ' + (draft.settings[k] || '—') }); });
    var bp = {}; base.posts.forEach(function (p) { bp[p.id] = p; });
    var dp = {}; draft.posts.forEach(function (p) {
      dp[p.id] = p;
      if (!bp[p.id]) out.push({ page: 'blog', tag: 'Blog', kind: 'post', text: 'New article: ' + (p.title || 'Untitled') });
      else if (JSON.stringify(bp[p.id]) !== JSON.stringify(p)) out.push({ page: 'blog', tag: 'Blog', kind: 'post', text: 'Edited: ' + (p.title || 'Untitled') });
    });
    base.posts.forEach(function (p) { if (!dp[p.id]) out.push({ page: 'blog', tag: 'Blog', kind: 'post', text: 'Deleted: ' + (p.title || 'Untitled') }); });
    var bmed = {}; base.media.forEach(function (m) { bmed[m.src] = 1; });
    draft.media.forEach(function (m) { if (!bmed[m.src]) out.push({ page: 'media', tag: 'Media', kind: 'file', text: 'New file: ' + m.name }); });
    var dmed = {}; draft.media.forEach(function (m) { dmed[m.src] = 1; });
    base.media.forEach(function (m) { if (!dmed[m.src]) out.push({ page: 'media', tag: 'Media', kind: 'file', text: 'Removed from library: ' + m.name }); });
    return out;
  }

  function refreshStatus() {
    var ch = changes();
    var st = $('#status');
    st.classList.toggle('dirty', ch.length > 0);
    $('span', st).textContent = ch.length ? ch.length + ' unpublished change' + (ch.length === 1 ? '' : 's') : 'All changes published';
    $('#st-changes').textContent = ch.length;
    var pub = draft.posts.filter(function (p) { return p.published; }).length;
    $('#st-posts').textContent = draft.posts.length;
    $('#st-posts-sub').textContent = pub + ' published · ' + (draft.posts.length - pub) + ' drafts';
    $('#st-media').textContent = draft.media.length;
    var np = Object.keys(pending).length;
    $('#st-media-sub').textContent = np ? np + ' new, not yet published' : 'Images and videos';
    var last = localStorage.getItem('bc-admin-last');
    $('#st-last').textContent = last ? new Date(last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
    $('#st-last-sub').textContent = last ? new Date(last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Not yet from this device';
    var pc = ch.filter(function (c) { return c.kind === 'text' || c.kind === 'media'; }).length;
    setCount('pages', pc); setCount('posts', draft.posts.length, false); setCount('media', draft.media.length, false);
    var rc = $('#recent-changes');
    rc.innerHTML = ch.length ? ch.slice(0, 14).map(function (c) {
      return '<li><span class="tag">' + esc(c.tag) + '</span><span class="txt">' + esc(c.text) + '</span></li>';
    }).join('') + (ch.length > 14 ? '<li class="empty">and ' + (ch.length - 14) + ' more…</li>' : '') : '<li class="empty">No unpublished changes.</li>';
    // page badges
    $$('.pg').forEach(function (b) {
      var path = b.getAttribute('data-path');
      var n = ch.filter(function (c) { return c.page === path; }).length;
      var badge = $('.badge', b);
      if (n && !badge) { badge = document.createElement('span'); badge.className = 'badge'; b.appendChild(badge); }
      if (badge) { if (n) badge.textContent = n; else badge.remove(); }
    });
    var gc = ch.filter(function (c) { return c.page === '_global'; }).length;
    var pcount = ch.filter(function (c) { return c.page === currentPage || (c.page === '_global'); }).length;
    $('#ed-count').textContent = pcount + ' change' + (pcount === 1 ? '' : 's') + (gc ? ' (incl. header/footer)' : '');
  }
  function setCount(name, n, hot) {
    var el = $('[data-count="' + name + '"]'); if (!el) return;
    el.textContent = n ? n : '';
    el.classList.toggle('hot', hot !== false && n > 0);
  }

  /* ---------- views / routing ---------- */
  var TITLES = { overview: 'Overview', pages: 'Pages', blog: 'Blog', post: 'Edit article', media: 'Media', settings: 'Settings' };
  function show(view) {
    $$('.view').forEach(function (v) { v.classList.toggle('on', v.getAttribute('data-view') === view); });
    $$('.nav-item').forEach(function (n) { n.classList.toggle('on', n.getAttribute('data-view') === (view === 'post' ? 'blog' : view)); });
    $('#view-title').textContent = TITLES[view] || '';
    $('#crumb').textContent = view === 'post' ? 'Blog' : 'Admin';
    $('#app').classList.remove('nav-open');
    window.scrollTo(0, 0);
  }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    var v = parts[0] || 'overview';
    if (v === 'pages') { show('pages'); openPage(parts.slice(1).join('/') || currentPage || 'index.html'); }
    else if (v === 'post') { var p = findPost(parts[1]); if (p) { show('post'); openPost(p); } else location.hash = '#/blog'; }
    else if (v === 'blog') { show('blog'); renderPosts(); }
    else if (v === 'media') { show('media'); renderMedia(); }
    else if (v === 'settings') { show('settings'); fillSettings(); }
    else show('overview');
  }
  window.addEventListener('hashchange', route);
  $$('.nav-item').forEach(function (n) { n.addEventListener('click', function () { location.hash = '#/' + n.getAttribute('data-view'); }); });
  $$('.qcard').forEach(function (q) {
    q.addEventListener('click', function () {
      var g = q.getAttribute('data-go');
      if (g === 'blog-new') newPost(); else location.hash = '#/' + g;
    });
  });
  $('#side-toggle').addEventListener('click', function () { $('#app').classList.toggle('nav-open'); });
  $('#scrim').addEventListener('click', function () { $('#app').classList.remove('nav-open'); });

  /* ==========================================================
     PAGES — visual editor
     ========================================================== */
  var frame = $('#frame');
  var currentPage = null;
  function renderPageList() {
    var groups = {};
    PAGES.forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });
    $('#page-list').innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="mono grp">' + esc(g) + '</div>' + groups[g].map(function (p) {
        return '<button class="pg" data-path="' + esc(p.path) + '">' + esc(p.title) + '</button>';
      }).join('');
    }).join('');
    $$('.pg').forEach(function (b) { b.addEventListener('click', function () { location.hash = '#/pages/' + b.getAttribute('data-path'); }); });
  }
  function openPage(path) {
    if (!PAGES.some(function (p) { return p.path === path; })) path = 'index.html';
    $$('.pg').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-path') === path); });
    $('#ed-title').textContent = pageTitle(path);
    $('#ed-path').textContent = path;
    $('#ed-open').href = '../' + path + '?preview=1';
    if (currentPage === path && frame.src) { refreshStatus(); return; }
    currentPage = path;
    $('#frame-loading').classList.remove('off');
    frame.src = '../' + path + '?edit=1';
    refreshStatus();
  }
  $$('.seg [data-dev]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.seg [data-dev]').forEach(function (x) { x.classList.toggle('on', x === b); });
      var box = $('#frame-box'); box.classList.remove('tablet', 'mobile');
      var d = b.getAttribute('data-dev'); if (d !== 'desktop') box.classList.add(d);
    });
  });
  $('#ed-reset').addEventListener('click', function () {
    if (!currentPage) return;
    if (!confirm('Reset all unpublished changes on “' + pageTitle(currentPage) + '”? Header and footer changes are kept.')) return;
    if (base.pages[currentPage]) draft.pages[currentPage] = clone(base.pages[currentPage]); else delete draft.pages[currentPage];
    saveDraft(); reloadFrame(); toast('Page reset');
  });
  function reloadFrame() { $('#frame-loading').classList.remove('off'); frame.src = '../' + currentPage + '?edit=1&r=' + Date.now(); }

  function bucket(scope) {
    var k = scope === 'global' ? '_global' : currentPage;
    draft.pages[k] = draft.pages[k] || {};
    draft.pages[k].text = draft.pages[k].text || {};
    draft.pages[k].media = draft.pages[k].media || {};
    return { key: k, b: draft.pages[k] };
  }
  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow) return;
    var m = e.data || {};
    if (m.type === 'ready') {
      frame.contentWindow.postMessage({ type: 'load', content: resolvedDraft() }, ORIGIN);
      setTimeout(function () { $('#frame-loading').classList.add('off'); }, 120);
    } else if (m.type === 'text') {
      var t = bucket(m.scope);
      var baseVal = ((base.pages[t.key] || {}).text || {})[m.key];
      if (baseVal === undefined && t.b.text[m.key] === undefined && m.value === undefined) return;
      t.b.text[m.key] = m.value;
      if (baseVal !== undefined && baseVal === m.value) { /* same as published */ }
      saveDraft();
    } else if (m.type === 'pick') {
      openPicker({ mode: 'slot', scope: m.scope, key: m.key });
    }
  });

  /* ==========================================================
     MEDIA — library, upload, picker
     ========================================================== */
  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return Promise.resolve([]);
    return Promise.all(list.map(prepareFile)).then(function (items) {
      items = items.filter(Boolean);
      items.forEach(function (it) { draft.media.unshift(it.meta); pending[it.meta.name] = it.blob; putFile(it.meta.name, it.blob); });
      saveDraft();
      if (items.length) toast(items.length === 1 ? 'Uploaded ' + items[0].meta.name : items.length + ' files uploaded');
      return items.map(function (i) { return i.meta; });
    });
  }
  function prepareFile(file) {
    var isVideo = /^video\//.test(file.type);
    var isImg = /^image\//.test(file.type);
    if (!isVideo && !isImg) { toast(file.name + ': only images and videos are supported', true); return null; }
    if (file.size > 95 * 1048576) { toast(file.name + ' is larger than 95 MB — please compress it first.', true); return null; }
    if (isVideo && file.size > 30 * 1048576) toast(file.name + ' is ' + fmtSize(file.size) + ' — consider compressing it so the page loads fast.', true);
    var dot = file.name.lastIndexOf('.');
    var stem = slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || 'file';
    var ext = (dot > 0 ? file.name.slice(dot + 1) : '').toLowerCase();
    var keep = isVideo || /svg|gif/.test(file.type);
    var finish = function (blob, outExt, w, h) {
      var name = stem + '-' + uid().slice(0, 5) + '.' + outExt;
      return { blob: blob, meta: { src: 'assets/uploads/' + name, name: name, type: isVideo ? 'video' : 'image', size: blob.size, w: w || null, h: h || null, added: new Date().toISOString() } };
    };
    if (keep) return Promise.resolve(finish(file, ext || (isVideo ? 'mp4' : 'svg')));
    return new Promise(function (res) {
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2400, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * s), ch = Math.round(h * s);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        var png = file.type === 'image/png';
        c.toBlob(function (b) {
          if (!b || (b.size > file.size && s === 1)) res(finish(file, ext || 'jpg', w, h));
          else res(finish(b, png ? 'png' : 'jpg', cw, ch));
        }, png ? 'image/png' : 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(finish(file, ext || 'jpg')); };
      img.src = url;
    });
  }
  function mediaCard(m, pick) {
    var src = resolveSrc(m.src);
    var visual = m.type === 'video'
      ? '<div class="img"><video src="' + esc(src) + '" muted loop playsinline preload="metadata"></video><span class="kind">Video</span></div>'
      : '<div class="img" style="background-image:url(\'' + esc(src) + '\')"></div>';
    return '<div class="mcard" data-src="' + esc(m.src) + '"' + (pick ? ' tabindex="0" role="button"' : '') + '>' + visual +
      '<div class="meta"><span title="' + esc(m.name) + '">' + esc(m.name) + '</span>' + (isPending(m.src) ? '<em>NEW</em>' : '') + '</div>' +
      (pick ? '' : '<button class="del" aria-label="Remove ' + esc(m.name) + '"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg></button>') + '</div>';
  }
  function hoverPlay(grid) {
    $$('video', grid).forEach(function (v) {
      var card = v.closest('.mcard');
      card.addEventListener('mouseenter', function () { v.play().catch(function () {}); });
      card.addEventListener('mouseleave', function () { v.pause(); });
    });
  }
  function renderMedia() {
    var g = $('#media-grid');
    g.innerHTML = draft.media.length ? draft.media.map(function (m) { return mediaCard(m, false); }).join('') :
      '<div class="empty-state" style="grid-column:1/-1"><b>No media yet</b>Upload photos and videos above. You can also upload straight from any page or article.</div>';
    hoverPlay(g);
    $$('.del', g).forEach(function (b) {
      b.addEventListener('click', function () {
        var src = b.closest('.mcard').getAttribute('data-src');
        var used = JSON.stringify(draft.pages).indexOf(src) > -1 || JSON.stringify(draft.posts).indexOf(src) > -1;
        if (!confirm(used ? 'This file is used on the site. Remove it from the library anyway? (Pages keep showing it until you replace it.)' : 'Remove this file from the library?')) return;
        draft.media = draft.media.filter(function (m) { return m.src !== src; });
        var name = src.split('/').pop();
        if (pending[name] && !used) { delete pending[name]; delFile(name); }
        saveDraft(); renderMedia();
      });
    });
  }
  var drop = $('#drop');
  $('#file-in').addEventListener('change', function (e) { addFiles(e.target.files).then(renderMedia); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files).then(renderMedia); });

  // picker
  var pickTarget = null;
  function currentSlotMedia() {
    if (!pickTarget || pickTarget.mode !== 'slot') return null;
    var k = pickTarget.scope === 'global' ? '_global' : currentPage;
    return ((draft.pages[k] || {}).media || {})[pickTarget.key] || null;
  }
  function openPicker(target) {
    pickTarget = target;
    var cur = target.mode === 'slot' ? currentSlotMedia() : (target.mode === 'cover' ? { src: editingPost && editingPost.cover } : null);
    $('#picker-alt').value = (cur && cur.alt) || '';
    $('#picker-alt').closest('.field').style.display = target.mode === 'slot' ? '' : 'none';
    $('#picker-remove').style.display = target.mode === 'body' ? 'none' : '';
    renderPicker(cur && cur.src);
    openModal('#picker');
  }
  function renderPicker(sel) {
    var g = $('#picker-grid');
    var list = pickTarget && (pickTarget.mode === 'cover' || pickTarget.mode === 'body-img') ? draft.media.filter(function (m) { return m.type === 'image'; }) : draft.media;
    g.innerHTML = list.length ? list.map(function (m) { return mediaCard(m, true); }).join('') : '<div class="empty-state" style="grid-column:1/-1"><b>No files yet</b>Upload one above.</div>';
    $$('.mcard', g).forEach(function (c) {
      if (c.getAttribute('data-src') === sel) c.classList.add('sel');
      var choose = function () { choosePick(draft.media.filter(function (m) { return m.src === c.getAttribute('data-src'); })[0]); };
      c.addEventListener('click', choose);
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });
    hoverPlay(g);
  }
  $('#picker-file').addEventListener('change', function (e) {
    addFiles(e.target.files).then(function (metas) { e.target.value = ''; if (metas[0]) choosePick(metas[0]); });
  });
  function choosePick(m) {
    if (!m || !pickTarget) return;
    var alt = $('#picker-alt').value.trim();
    if (pickTarget.mode === 'slot') {
      var t = bucket(pickTarget.scope);
      t.b.media[pickTarget.key] = { src: m.src, type: m.type, alt: alt };
      frame.contentWindow && frame.contentWindow.postMessage({ type: 'media', key: pickTarget.key, media: { src: resolveSrc(m.src), type: m.type, alt: alt } }, ORIGIN);
      toast('Media placed — remember to publish');
    } else if (pickTarget.mode === 'cover' && editingPost) {
      editingPost.cover = m.src; paintCover(); savePost();
    } else if (pickTarget.mode === 'body-img' && editingPost) {
      insertMedia(m);
    }
    saveDraft(); closeModal('#picker');
  }
  $('#picker-remove').addEventListener('click', function () {
    if (!pickTarget) return;
    if (pickTarget.mode === 'slot') {
      var t = bucket(pickTarget.scope);
      var baseHas = ((base.pages[t.key] || {}).media || {})[pickTarget.key];
      if (baseHas) t.b.media[pickTarget.key] = null; else delete t.b.media[pickTarget.key];
      frame.contentWindow && frame.contentWindow.postMessage({ type: 'media', key: pickTarget.key, media: null }, ORIGIN);
    } else if (pickTarget.mode === 'cover' && editingPost) { editingPost.cover = ''; paintCover(); savePost(); }
    saveDraft(); closeModal('#picker');
  });

  /* ---------- modals ---------- */
  function openModal(sel) { var m = $(sel); m.classList.add('on'); m.setAttribute('aria-hidden', 'false'); setTimeout(function () { var f = $('button, input', m); if (f) f.focus(); }, 60); }
  function closeModal(sel) { var m = $(sel); m.classList.remove('on'); m.setAttribute('aria-hidden', 'true'); }
  $$('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeModal('#' + m.id); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.modal.on').forEach(function (m) { closeModal('#' + m.id); }); });

  /* ==========================================================
     BLOG
     ========================================================== */
  var filter = 'all';
  var editingPost = null;
  var slugTouched = false;
  function findPost(id) { return draft.posts.filter(function (p) { return p.id === id; })[0]; }
  function renderPosts() {
    var q = ($('#post-search').value || '').toLowerCase();
    var list = draft.posts.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).filter(function (p) {
      if (filter === 'pub' && !p.published) return false;
      if (filter === 'draft' && p.published) return false;
      return !q || (p.title + ' ' + (p.category || '') + ' ' + (p.excerpt || '')).toLowerCase().indexOf(q) > -1;
    });
    var box = $('#post-list');
    if (!draft.posts.length) {
      box.innerHTML = '<div class="empty-state"><b>No articles yet</b>Your Journal shows “coming soon” cards until you publish the first article.<br><button class="btn" id="first-post">Write the first article</button></div>';
      $('#first-post').addEventListener('click', newPost);
      return;
    }
    box.innerHTML = list.length ? list.map(function (p) {
      var cover = p.cover ? ' style="background-image:url(\'' + esc(resolveSrc(p.cover)) + '\')"' : '';
      return '<button class="prow" data-id="' + esc(p.id) + '"><span class="thumb"' + cover + '>' + (p.cover ? '' : 'NO COVER') + '</span>' +
        '<span class="info"><b>' + esc(p.title || 'Untitled') + '</b><p>' + esc((p.category || 'Journal') + ' · ' + (p.date || '') + (p.excerpt ? ' — ' + p.excerpt : '')) + '</p></span>' +
        '<span class="pill' + (p.published ? ' pub' : '') + '">' + (p.published ? 'Published' : 'Draft') + '</span></button>';
    }).join('') : '<div class="empty-state"><b>No matches</b>Try another search or filter.</div>';
    $$('.prow', box).forEach(function (r) { r.addEventListener('click', function () { location.hash = '#/post/' + r.getAttribute('data-id'); }); });
  }
  $('#post-search').addEventListener('input', renderPosts);
  $$('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () { filter = b.getAttribute('data-filter'); $$('[data-filter]').forEach(function (x) { x.classList.toggle('on', x === b); }); renderPosts(); });
  });
  function newPost() {
    var p = { id: uid(), slug: '', title: '', category: '', date: today(), excerpt: '', cover: '', body: '', published: false };
    draft.posts.unshift(p); saveDraft();
    location.hash = '#/post/' + p.id;
  }
  $('#new-post').addEventListener('click', newPost);
  $('#post-back').addEventListener('click', function () { location.hash = '#/blog'; });

  var rt = $('#rt');
  function bodyToEditor(html) {
    rt.innerHTML = html || '';
    $$('img, video', rt).forEach(function (n) {
      var src = n.getAttribute('src') || '';
      n.setAttribute('data-src', src);
      n.setAttribute('src', resolveSrc(src));
    });
  }
  function editorToBody() {
    var c = rt.cloneNode(true);
    $$('img, video', c).forEach(function (n) {
      if (n.hasAttribute('data-src')) { n.setAttribute('src', n.getAttribute('data-src')); n.removeAttribute('data-src'); }
      n.classList.remove('sel'); if (!n.className) n.removeAttribute('class');
    });
    $$('[style]', c).forEach(function (n) { n.removeAttribute('style'); });
    return c.innerHTML.replace(/<p><br><\/p>/g, '').trim();
  }
  function paintCover() {
    var b = $('#pe-cover');
    if (editingPost && editingPost.cover) { b.style.backgroundImage = 'url("' + resolveSrc(editingPost.cover) + '")'; b.classList.add('has'); $('span', b).textContent = 'Change cover'; }
    else { b.style.backgroundImage = ''; b.classList.remove('has'); $('span', b).textContent = 'Choose cover'; }
  }
  function openPost(p) {
    editingPost = p;
    slugTouched = !!p.slug;
    $('#pe-title').value = p.title || '';
    $('#pe-excerpt').value = p.excerpt || '';
    $('#pe-date').value = p.date || today();
    $('#pe-cat').value = p.category || '';
    $('#pe-slug').value = p.slug || '';
    $('#pe-pub').checked = !!p.published;
    $('#pe-pub-label').textContent = p.published ? 'Published' : 'Draft';
    bodyToEditor(p.body);
    paintCover();
    updatePreviewLink();
    if (!p.title) setTimeout(function () { $('#pe-title').focus(); }, 80);
  }
  function updatePreviewLink() { $('#pe-preview').href = '../post.html?slug=' + encodeURIComponent((editingPost && editingPost.slug) || '') + '&preview=1'; }
  function uniqueSlug(s, id) {
    var base0 = s || 'article', out = base0, n = 2;
    while (draft.posts.some(function (p) { return p.slug === out && p.id !== id; })) out = base0 + '-' + (n++);
    return out;
  }
  var savePost = debounce(function () {
    if (!editingPost) return;
    editingPost.title = $('#pe-title').value.trim();
    editingPost.excerpt = $('#pe-excerpt').value.trim();
    editingPost.date = $('#pe-date').value || today();
    editingPost.category = $('#pe-cat').value.trim();
    if (!slugTouched) $('#pe-slug').value = slugify(editingPost.title);
    editingPost.slug = uniqueSlug(slugify($('#pe-slug').value) || slugify(editingPost.title), editingPost.id);
    editingPost.published = $('#pe-pub').checked;
    editingPost.body = editorToBody();
    updatePreviewLink();
    saveDraft();
  }, 350);
  ['#pe-title', '#pe-excerpt', '#pe-date', '#pe-cat'].forEach(function (s) { $(s).addEventListener('input', savePost); });
  $('#pe-slug').addEventListener('input', function () { slugTouched = true; savePost(); });
  $('#pe-pub').addEventListener('change', function () {
    $('#pe-pub-label').textContent = this.checked ? 'Published' : 'Draft';
    if (this.checked && !$('#pe-title').value.trim()) { toast('Give the article a title first', true); this.checked = false; $('#pe-pub-label').textContent = 'Draft'; return; }
    savePost(); toast(this.checked ? 'Will be visible after you publish' : 'Article set to draft');
  });
  rt.addEventListener('input', savePost);
  rt.addEventListener('paste', function (e) {
    var html = (e.clipboardData || window.clipboardData).getData('text/html');
    if (!html) return;
    e.preventDefault();
    var tpl = document.createElement('template'); tpl.innerHTML = html;
    $$('script, style, meta, link, iframe', tpl.content).forEach(function (n) { n.remove(); });
    $$('*', tpl.content).forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) { if (!/^(href|src|alt)$/.test(a.name)) n.removeAttribute(a.name); });
      if (/^(SPAN|FONT|DIV)$/.test(n.tagName)) n.replaceWith.apply(n, Array.prototype.slice.call(n.childNodes));
    });
    document.execCommand('insertHTML', false, tpl.innerHTML);
  });
  $('#pe-cover').addEventListener('click', function () { openPicker({ mode: 'cover' }); });
  $('#pe-cover-rm').addEventListener('click', function () { if (editingPost) { editingPost.cover = ''; paintCover(); savePost(); } });
  $('#pe-delete').addEventListener('click', function () {
    if (!editingPost || !confirm('Delete “' + (editingPost.title || 'Untitled') + '”? This removes it from the site when you publish.')) return;
    draft.posts = draft.posts.filter(function (p) { return p !== editingPost; });
    editingPost = null; saveDraft(); toast('Article deleted'); location.hash = '#/blog';
  });
  var savedRange = null;
  rt.addEventListener('blur', function () { var s = window.getSelection(); if (s.rangeCount) savedRange = s.getRangeAt(0).cloneRange(); });
  function restoreRange() { rt.focus(); if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
  function insertMedia(m) {
    restoreRange();
    var src = resolveSrc(m.src);
    var html = m.type === 'video'
      ? '<video controls muted playsinline data-src="' + esc(m.src) + '" src="' + esc(src) + '"></video><p><br></p>'
      : '<img alt="" data-src="' + esc(m.src) + '" src="' + esc(src) + '"><p><br></p>';
    document.execCommand('insertHTML', false, html);
    savePost();
  }
  $$('#rt-bar button').forEach(function (b) {
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () {
      var cmd = b.getAttribute('data-cmd'), val = b.getAttribute('data-val');
      if (cmd === 'image') { var s = window.getSelection(); if (s.rangeCount && rt.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); openPicker({ mode: 'body-img' }); return; }
      rt.focus();
      if (cmd === 'link') {
        var url = prompt('Link address (https://…)', 'https://');
        if (url && url !== 'https://') document.execCommand('createLink', false, url);
      } else if (cmd === 'formatBlock') {
        document.execCommand('formatBlock', false, '<' + val + '>');
      } else {
        document.execCommand(cmd, false, null);
      }
      savePost();
    });
  });

  /* ==========================================================
     SETTINGS
     ========================================================== */
  function fillSettings() {
    $$('[data-setting]').forEach(function (i) { i.value = draft.settings[i.getAttribute('data-setting')] || ''; });
    $$('[data-gh]').forEach(function (i) { i.value = gh[i.getAttribute('data-gh')] || (i.getAttribute('data-gh') === 'branch' ? 'main' : ''); });
    paintGh();
  }
  $$('[data-setting]').forEach(function (i) {
    i.addEventListener('input', function () { draft.settings[i.getAttribute('data-setting')] = i.value.trim(); saveDraft(); });
  });
  function readGh() {
    $$('[data-gh]').forEach(function (i) { gh[i.getAttribute('data-gh')] = i.value.trim(); });
    if (!gh.branch) gh.branch = 'main';
    localStorage.setItem('bc-admin-gh', JSON.stringify(gh));
  }
  function ghReady() { return gh.owner && gh.repo && gh.token; }
  function paintGh(ok) {
    var label = ghReady() ? (ok === false ? 'Check failed' : gh.owner + '/' + gh.repo) : 'Not connected';
    $('#gh-badge').textContent = label;
    $('#gh-badge').classList.toggle('ok', !!ghReady() && ok !== false);
    $('#gh-state').textContent = 'Publishing: ' + (ghReady() ? 'GitHub · ' + gh.repo : 'not connected');
  }
  function api(path, opts) {
    opts = opts || {};
    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: { 'Authorization': 'Bearer ' + gh.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 404 && opts.allow404) return null;
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || ('GitHub error ' + r.status));
        return j;
      });
    });
  }
  $('#gh-test').addEventListener('click', function () {
    readGh();
    if (!ghReady()) { toast('Fill in user, repository and token', true); return; }
    var b = this; b.classList.add('busy');
    api('/repos/' + gh.owner + '/' + gh.repo).then(function (r) {
      if (r.permissions && !r.permissions.push) throw new Error('The token can read but not write this repository.');
      return api('/repos/' + gh.owner + '/' + gh.repo + '/branches/' + encodeURIComponent(gh.branch));
    }).then(function () { paintGh(true); toast('Connected to ' + gh.owner + '/' + gh.repo); })
      .catch(function (e) { paintGh(false); toast('Connection failed: ' + e.message, true); })
      .then(function () { b.classList.remove('busy'); });
  });
  $('#gh-forget').addEventListener('click', function () { gh.token = ''; localStorage.setItem('bc-admin-gh', JSON.stringify(gh)); $('#g-token').value = ''; paintGh(); toast('Token removed from this browser'); });

  function download(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function finalContent() {
    var c = clone(draft);
    // drop nulls (removed media that existed before) and empty buckets
    Object.keys(c.pages).forEach(function (p) {
      var m = c.pages[p].media || {};
      Object.keys(m).forEach(function (k) { if (!m[k]) delete m[k]; });
    });
    c.updatedAt = new Date().toISOString();
    return c;
  }
  $('#dl-json').addEventListener('click', function () {
    download('content.json', new Blob([JSON.stringify(finalContent(), null, 2)], { type: 'application/json' }));
    toast('content.json downloaded');
  });
  $('#dl-media').addEventListener('click', function () {
    var names = Object.keys(pending);
    if (!names.length) { toast('No new media to download'); return; }
    names.forEach(function (n, i) { setTimeout(function () { download(n, pending[n]); }, i * 400); });
    toast(names.length + ' file(s) — put them in assets/uploads/');
  });
  $('#imp-json').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    f.text().then(function (t) {
      draft = normalize(JSON.parse(t)); saveDraft(); fillSettings(); toast('Imported — review and publish'); reloadFrame && currentPage && reloadFrame();
    }).catch(function () { toast('That file is not a valid content.json', true); });
    e.target.value = '';
  });
  function discard() {
    if (!confirm('Discard every unpublished change and new upload on this device?')) return;
    draft = clone(base); pending = {}; clearFiles(); saveDraft(); fillSettings(); renderMedia();
    if (currentPage) reloadFrame();
    toast('Draft discarded');
  }
  $('#discard').addEventListener('click', discard);
  $('#discard-all').addEventListener('click', discard);

  /* ==========================================================
     PUBLISH
     ========================================================== */
  $('#publish-btn').addEventListener('click', function () {
    savePost.flush && savePost.flush();
    var ch = changes();
    var body = $('#pub-body');
    if (!ch.length) { toast('Nothing to publish — the site is up to date'); return; }
    var files = Object.keys(pending).filter(function (n) {
      var src = 'assets/uploads/' + n;
      return JSON.stringify(draft).indexOf(src) > -1;
    });
    if (!ghReady()) {
      body.innerHTML = '<p class="note">You have <b>' + ch.length + ' change' + (ch.length === 1 ? '' : 's') + '</b> ready. Publishing is not connected yet, so either:</p>' +
        '<ul class="pub-list"><li><b>Connect GitHub</b><span class="s">recommended · 1 click to publish</span></li><li><b>Publish manually</b><span class="s">download + redeploy</span></li></ul>' +
        '<div class="row gap wrap"><button class="btn" id="go-settings">Connect GitHub</button><button class="btn ghost" id="manual-dl">Download files</button></div>';
      openModal('#pubdlg');
      $('#go-settings').addEventListener('click', function () { closeModal('#pubdlg'); location.hash = '#/settings'; });
      $('#manual-dl').addEventListener('click', function () { $('#dl-json').click(); if (files.length) $('#dl-media').click(); });
      return;
    }
    var rows = files.map(function (n) { return '<li data-f="' + esc(n) + '">assets/uploads/' + esc(n) + '<span class="s">waiting</span></li>'; }).join('') +
      '<li data-f="content.json">content.json<span class="s">waiting</span></li>';
    body.innerHTML = '<p class="note"><b>' + ch.length + ' change' + (ch.length === 1 ? '' : 's') + '</b> will go live on <b>' + esc(gh.owner + '/' + gh.repo) + '</b> (' + esc(gh.branch) + '). Netlify updates the site about a minute later.</p>' +
      '<ul class="pub-list">' + rows + '</ul><div class="row gap"><button class="btn" id="do-publish">Publish now</button><button class="btn ghost" data-close>Cancel</button></div>';
    openModal('#pubdlg');
    $('#do-publish').addEventListener('click', function () { doPublish(files, this); });
  });
  function setRow(f, txt, cls) { var li = $('#pub-body li[data-f="' + f + '"] .s'); if (li) { li.textContent = txt; li.className = 's ' + (cls || ''); } }
  function repoPath(p) { var d = (gh.dir || '').replace(/^\/+|\/+$/g, ''); return (d ? d + '/' : '') + p; }
  function putToGitHub(path, b64, message) {
    var url = '/repos/' + gh.owner + '/' + gh.repo + '/contents/' + repoPath(path).split('/').map(encodeURIComponent).join('/');
    return api(url + '?ref=' + encodeURIComponent(gh.branch), { allow404: true }).then(function (cur) {
      return api(url, { method: 'PUT', body: { message: message, content: b64, branch: gh.branch, sha: cur && cur.sha ? cur.sha : undefined } });
    });
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(blob); });
  }
  function doPublish(files, btn) {
    btn.classList.add('busy'); btn.textContent = 'Publishing';
    var chain = Promise.resolve();
    files.forEach(function (n) {
      chain = chain.then(function () {
        setRow(n, 'uploading…');
        return blobToB64(pending[n]).then(function (b64) { return putToGitHub('assets/uploads/' + n, b64, 'Upload ' + n + ' via admin'); })
          .then(function () { setRow(n, 'done', 'ok'); });
      });
    });
    var content = finalContent();
    chain.then(function () {
      setRow('content.json', 'saving…');
      var json = JSON.stringify(content, null, 2);
      return putToGitHub('content.json', btoa(unescape(encodeURIComponent(json))), 'Update site content via admin');
    }).then(function () {
      setRow('content.json', 'done', 'ok');
      base = clone(content); draft = clone(content);
      files.forEach(function (n) { delete pending[n]; delFile(n); });
      localStorage.setItem('bc-admin-last', new Date().toISOString());
      saveDraft();
      btn.classList.remove('busy'); btn.textContent = 'Published';
      toast('Published — the live site updates in about a minute');
      setTimeout(function () { closeModal('#pubdlg'); }, 1200);
    }).catch(function (e) {
      btn.classList.remove('busy'); btn.textContent = 'Try again';
      $$('#pub-body .s').forEach(function (s) { if (/…|waiting/.test(s.textContent)) { s.textContent = 'not sent'; s.className = 's err'; } });
      toast('Publishing stopped: ' + e.message, true);
    });
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  function boot() {
    if (location.protocol === 'file:') {
      document.body.insertAdjacentHTML('afterbegin', '<div style="background:#FCF4E6;color:#7A4F12;padding:10px 16px;font-size:13px;text-align:center">The admin needs a web server. Run <b>python -m http.server</b> in the website folder and open <b>http://localhost:8000/admin/</b>.</div>');
    }
    Promise.all([
      fetch('pages.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch('../content.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      openDB().then(allFiles)
    ]).then(function (res) {
      PAGES = res[0]; base = normalize(res[1]); pending = res[2] || {};
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem('bc-admin-draft') || 'null'); } catch (e) { saved = null; }
      draft = saved ? normalize(saved) : clone(base);
      if (!draft.settings.email && base.settings.email) draft.settings.email = base.settings.email;
      renderPageList(); paintGh(); refreshStatus(); route();
    });
  }
  boot();
})();
