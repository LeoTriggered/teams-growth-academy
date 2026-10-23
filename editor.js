(function () {
  var APPROVE_ID = 'teams';
  var APPROVE_PASSWORD = 'kajabi';
  var STORAGE_KEY = 'tga-content';
  var AUTH_KEY = 'tga-reviewer';
  var GITHUB_FILE = 'https://api.github.com/repos/LeoTriggered/teams-growth-academy/contents/tga-content.json';
  var GIST_URL = 'https://api.github.com/gists/7fef17de4247b60c4892c88e071e9528';
  var SHARED_URLS = [
    'https://crudcrud.com/api/0019de36b53f4bbb86c17f903957ab2b/tga/6ad9c38a871dae03e85004b9',
    'https://json.extendsclass.com/bin/caabdca',
    'https://extendsclass.com/api/json-storage/bin/caabdca'
  ];
  var NTFY_TOPIC = 'https://ntfy.sh/tga-copy-7fef17de4247b60c4892c88e071e9528';
  var NTFY_LATEST = NTFY_TOPIC + '/json?poll=1&since=latest';
  var TAGS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,button,a,span,td,th,label,figcaption,dt,dd,summary';

  var state = {
    approved: {},
    draft: {},
    history: [],
    updatedAt: null,
    editing: false,
    snapshot: {},
    loggedIn: false,
    pendingDeleteId: null
  };

  var PAGE_LABELS = {
    'Home.html': 'Home',
    'parent_first_homepage.html': 'For Parents',
    'student_homepage.html': 'For Students',
    'Series and Labs.html': 'Series & Labs',
    'meet_coach_walker_t.e.a.m.s._growth_academy.html': 'Meet Coach Walker',
    'contact_t.e.a.m.s._growth_academy.html': 'Contact',
    'about_t.e.a.m.s._growth_academy.html': 'About T.E.A.M.S.'
  };

  function pageKey() {
    try {
      var parts = location.pathname.split('/');
      return decodeURIComponent(parts[parts.length - 1] || 'Home.html') || 'Home.html';
    } catch (e) {
      return 'Home.html';
    }
  }

  function dirUrl(file) {
    return new URL(file, location.href.replace(/[^/]*$/, ''));
  }

  function apiUrl() {
    return location.origin + '/api/tga-content';
  }

  function cssPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var tag = node.tagName.toLowerCase();
      var n = 1;
      var sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName === node.tagName) n += 1;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + n + ')');
      node = node.parentElement;
    }
    return parts.join('>');
  }

  function editId(el) {
    return pageKey() + '::' + cssPath(el);
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function pageLabel(name) {
    return PAGE_LABELS[name] || name.replace(/\.html$/i, '').replace(/_/g, ' ');
  }

  function pageFromId(id) {
    return String(id || '').split('::')[0] || pageKey();
  }

  function hrefForPage(name) {
    try {
      return new URL(name, location.href.replace(/[^/]*$/, '')).href;
    } catch (e) {
      return name;
    }
  }

  function hasDirectText(el) {
    var node;
    for (node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 && node.textContent.trim()) return true;
    }
    return false;
  }

  function collect() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(TAGS));
    nodes = nodes.filter(function (el) {
      if (el.closest('#tga-editor-root')) return false;
      if (el.closest('script,style,noscript,svg,code,pre')) return false;
      if (el.classList.contains('material-symbols-outlined')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (!textOf(el)) return false;
      return true;
    });
    nodes = nodes.filter(function (el) {
      if (hasDirectText(el)) return true;
      return !nodes.some(function (other) {
        return other !== el && el.contains(other);
      });
    });
    return nodes.filter(function (el) {
      return !nodes.some(function (other) {
        return other !== el && other.contains(el) && hasDirectText(other);
      });
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tokens(s) {
    return String(s || '').split(/(\s+)/).filter(function (part) {
      return part.length > 0;
    });
  }

  function diffTokens(a, b) {
    var n = a.length;
    var m = b.length;
    var dp = new Array(n + 1);
    var i;
    var j;
    for (i = 0; i <= n; i += 1) {
      dp[i] = new Array(m + 1);
      dp[i][m] = 0;
    }
    for (j = 0; j <= m; j += 1) dp[n][j] = 0;
    for (i = n - 1; i >= 0; i -= 1) {
      for (j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        out.push({ t: 'eq', v: a[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({ t: 'del', v: a[i] });
        i += 1;
      } else {
        out.push({ t: 'ins', v: b[j] });
        j += 1;
      }
    }
    while (i < n) {
      out.push({ t: 'del', v: a[i] });
      i += 1;
    }
    while (j < m) {
      out.push({ t: 'ins', v: b[j] });
      j += 1;
    }
    return out;
  }

  function renderDiff(oldText, newText) {
    if (oldText === newText) return esc(newText);
    var parts = diffTokens(tokens(oldText), tokens(newText));
    return parts.map(function (part) {
      var value = esc(part.v);
      if (part.t === 'del') return '<span class="tga-del">' + value + '</span>';
      if (part.t === 'ins') return '<span class="tga-ins">' + value + '</span>';
      return value;
    }).join('');
  }

  function payload() {
    var approved = {};
    var draft = {};
    var history = state.history || [];
    function keep(id) {
      if (!id) return;
      if (Object.prototype.hasOwnProperty.call(state.approved, id)) approved[id] = state.approved[id];
      if (Object.prototype.hasOwnProperty.call(state.draft, id)) draft[id] = state.draft[id];
    }
    history.forEach(function (item) { keep(item.fieldId); });
    Object.keys(state.draft || {}).forEach(function (id) {
      if ((state.draft[id] || '') !== (state.approved[id] || '')) keep(id);
    });
    return {
      approved: approved,
      draft: draft,
      history: history,
      updatedAt: state.updatedAt
    };
  }

  function mergeStore(data) {
    if (!data || typeof data !== 'object') return;
    if (data.approved && typeof data.approved === 'object') {
      Object.keys(data.approved).forEach(function (id) { state.approved[id] = data.approved[id]; });
    }
    if (data.draft && typeof data.draft === 'object') {
      Object.keys(data.draft).forEach(function (id) { state.draft[id] = data.draft[id]; });
    }
    if (Array.isArray(data.history)) state.history = data.history;
    if (data.updatedAt) state.updatedAt = data.updatedAt;
  }

  function fromLocal() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function toLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload()));
    } catch (e) {}
  }

  function cleanStore(data) {
    if (!data || typeof data !== 'object') return null;
    var copy = JSON.parse(JSON.stringify(data));
    delete copy._id;
    if (!copy.updatedAt) return null;
    if (!copy.approved && !copy.draft && !copy.history) return null;
    return copy;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function fetchJson(url) {
    return withTimeout(fetch(url, { cache: 'no-store' }), 8000)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return cleanStore(data); })
      .catch(function () { return null; });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function putShared(url, body) {
    return withTimeout(fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: body
    }), 8000).then(function (res) { return !!res.ok; }).catch(function () { return false; });
  }

  function postNtfy(body) {
    return withTimeout(fetch(NTFY_TOPIC + '?priority=min', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      cache: 'no-store',
      body: body
    }), 8000).then(function (res) { return !!res.ok; }).catch(function () { return false; });
  }

  function saveShared(body) {
    function attempt() {
      return Promise.all([postNtfy(body)].concat(SHARED_URLS.map(function (url) {
        return putShared(url, body);
      }))).then(function (results) {
        return results.some(Boolean);
      });
    }
    return attempt().then(function (ok) {
      if (ok) return true;
      return wait(700).then(attempt).then(function (retry) {
        if (retry) return true;
        return wait(1400).then(attempt);
      });
    });
  }

  function fetchNtfy() {
    return withTimeout(fetch(NTFY_LATEST, { cache: 'no-store' }), 8000)
      .then(function (res) { return res.ok ? res.text() : ''; })
      .then(function (text) {
        if (!text) return null;
        var msg = JSON.parse(text);
        var att = msg && msg.attachment && msg.attachment.url;
        if (att) return fetchJson(att);
        if (msg && typeof msg.message === 'string') {
          try {
            return cleanStore(JSON.parse(msg.message));
          } catch (err) {
            return null;
          }
        }
        return null;
      }).catch(function () { return null; });
  }

  function fetchGithubFile() {
    return fetch(GITHUB_FILE + '?ref=main&t=' + Date.now(), {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (file) {
        if (!file || !file.content) return null;
        var raw = file.content.replace(/\n/g, '');
        try {
          return cleanStore(JSON.parse(atob(raw)));
        } catch (err) {
          return null;
        }
      }).catch(function () { return null; });
  }

  function fetchGist() {
    return fetch(GIST_URL + '?t=' + Date.now(), {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (gist) {
        var file = gist && gist.files && gist.files['tga-content.json'];
        if (!file || !file.content) return null;
        try {
          return cleanStore(JSON.parse(file.content));
        } catch (err) {
          return null;
        }
      }).catch(function () { return null; });
  }

  function isNewer(candidate, current) {
    if (!candidate || !candidate.updatedAt) return false;
    if (!current || !current.updatedAt) return true;
    return candidate.updatedAt > current.updatedAt;
  }

  function loadStore() {
    var remote = SHARED_URLS.map(fetchJson);
    return Promise.all(remote.concat([
      fetchNtfy(),
      fetchGist(),
      fetchGithubFile(),
      fetchJson('https://gist.githubusercontent.com/LeoTriggered/7fef17de4247b60c4892c88e071e9528/raw/tga-content.json?t=' + Date.now()),
      fetchJson(dirUrl('tga-content.json').href),
      fetchJson(apiUrl()),
      Promise.resolve(fromLocal()).then(cleanStore)
    ])).then(function (sources) {
      var best = null;
      sources.forEach(function (data) {
        if (isNewer(data, best)) best = data;
      });
      if (best) {
        mergeStore(best);
        toLocal();
      }
    }).catch(function () {});
  }

  function saveStore() {
    state.updatedAt = new Date().toISOString();
    toLocal();
    var body = JSON.stringify(payload());
    var localSave = fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
    return Promise.all([localSave, saveShared(body)]).then(function (results) {
      return { local: results[0], shared: results[1] };
    });
  }

  function applyView() {
    collect().forEach(function (el) {
      var id = editId(el);
      var live = textOf(el);
      if (!Object.prototype.hasOwnProperty.call(state.approved, id)) state.approved[id] = live;
      if (!Object.prototype.hasOwnProperty.call(state.draft, id)) state.draft[id] = state.approved[id];
      var approved = state.approved[id] || '';
      var draft = state.draft[id] || '';
      el.setAttribute('data-tga-edit', id);
      el.classList.remove('tga-editing-el');
      el.removeAttribute('contenteditable');
      if (state.editing) {
        el.textContent = draft;
        el.setAttribute('contenteditable', 'true');
        el.classList.add('tga-editing-el');
      } else if (draft !== approved) {
        el.innerHTML = renderDiff(approved, draft);
      } else if (live !== draft) {
        el.textContent = draft;
      }
    });
    renderChanges();
  }

  function isLoggedIn() {
    return !!state.loggedIn;
  }

  function setLoggedIn(on) {
    state.loggedIn = !!on;
    try {
      if (on) localStorage.setItem(AUTH_KEY, '1');
      else localStorage.removeItem(AUTH_KEY);
    } catch (e) {}
  }

  function restoreLogin() {
    try {
      state.loggedIn = localStorage.getItem(AUTH_KEY) === '1';
    } catch (e) {
      state.loggedIn = false;
    }
  }

  function formatWhen(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
    } catch (e) {
      return iso || '';
    }
  }

  function pendingCount() {
    return (state.history || []).filter(function (item) {
      return item.status !== 'approved';
    }).length;
  }

  function renderAuth() {
    var el = document.getElementById('tga-changes-auth');
    if (!el) return;
    if (isLoggedIn()) {
      el.innerHTML = '<p class="tga-changes-auth">Logged in. Approve or delete each change one at a time. <button type="button" id="tga-logout">Log out</button></p>';
    } else {
      el.innerHTML = '<p class="tga-changes-auth">Log in to approve changes one at a time. <button type="button" id="tga-login">Log in</button></p>';
    }
  }

  function renderChanges() {
    var list = document.getElementById('tga-changes-list');
    var count = document.getElementById('tga-changes-count');
    if (!list || !count) return;
    renderAuth();
    var items = state.history || [];
    var waiting = pendingCount();
    count.textContent = String(waiting);
    count.hidden = waiting === 0;
    if (!items.length) {
      list.innerHTML = '<p class="tga-changes-empty">No saved changes yet. Click the pencil, edit text, then Save.</p>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var page = pageLabel(item.page || pageFromId(item.fieldId));
      var href = hrefForPage(item.page || pageFromId(item.fieldId));
      var approved = item.status === 'approved';
      var status = approved ? 'Approved' : 'Waiting on Kajabi';
      var statusClass = approved ? 'is-approved' : 'is-pending';
      var actions = '';
      if (isLoggedIn()) {
        actions = '<div class="tga-change-actions">';
        if (!approved) {
          actions += '<button type="button" class="tga-change-approve" data-approve-id="' + esc(item.id || '') + '">Approve</button>';
        }
        actions += '<button type="button" class="tga-change-delete" data-delete-id="' + esc(item.id || '') + '">Delete</button></div>';
      }
      return [
        '<article class="tga-change" data-page="' + esc(item.page || '') + '" data-field="' + esc(item.fieldId || '') + '">',
        '<div class="tga-change__meta"><a href="' + esc(href) + '">' + esc(page) + '</a><span class="tga-change__status ' + statusClass + '">' + status + '</span></div>',
        '<p class="tga-change__when">' + esc(formatWhen(item.at)) + '</p>',
        '<p class="tga-change__diff">' + renderDiff(item.before || '', item.after || '') + '</p>',
        actions,
        '</article>'
      ].join('');
    }).join('');
  }

  function enterEdit() {
    state.editing = true;
    state.snapshot = JSON.parse(JSON.stringify(state.draft));
    document.getElementById('tga-edit-bar').hidden = false;
    document.getElementById('tga-edit').hidden = true;
    document.documentElement.classList.add('tga-editing');
    applyView();
  }

  function leaveEdit() {
    state.editing = false;
    document.getElementById('tga-edit-bar').hidden = true;
    document.getElementById('tga-edit').hidden = false;
    document.documentElement.classList.remove('tga-editing');
  }

  function readDraftFromDom() {
    collect().forEach(function (el) {
      var id = el.getAttribute('data-tga-edit') || editId(el);
      state.draft[id] = textOf(el);
    });
  }

  function recordSaveHistory() {
    var before = state.snapshot || {};
    var after = state.draft || {};
    var at = new Date().toISOString();
    var id;
    for (id in after) {
      if (!Object.prototype.hasOwnProperty.call(after, id)) continue;
      var prev = before[id] != null ? before[id] : (state.approved[id] || '');
      var next = after[id] || '';
      if (prev === next) continue;
      state.history.unshift({
        id: at + '::' + id,
        at: at,
        page: pageFromId(id),
        fieldId: id,
        before: prev,
        after: next,
        status: 'pending'
      });
    }
    if (state.history.length > 300) state.history = state.history.slice(0, 300);
  }

  function saveEdits() {
    readDraftFromDom();
    recordSaveHistory();
    leaveEdit();
    applyView();
    return saveStore().then(function (where) {
      toast(where && where.shared
        ? 'Saved. Anyone who opens the site can see this after a refresh.'
        : 'Saved on this computer only. Try Save again to publish.');
    });
  }

  function cancelEdits() {
    state.draft = state.snapshot;
    leaveEdit();
    applyView();
  }

  function toast(message) {
    var el = document.getElementById('tga-toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function openLogin() {
    document.getElementById('tga-approve-modal').hidden = false;
    document.getElementById('tga-approve-error').hidden = true;
    document.getElementById('tga-approve-id').value = '';
    document.getElementById('tga-approve-pw').value = '';
    document.getElementById('tga-approve-id').focus();
  }

  function closeLogin() {
    document.getElementById('tga-approve-modal').hidden = true;
  }

  function approveOne(historyId) {
    if (!isLoggedIn()) {
      openLogin();
      return;
    }
    var item = null;
    var i;
    for (i = 0; i < state.history.length; i += 1) {
      if (state.history[i].id === historyId) {
        item = state.history[i];
        break;
      }
    }
    if (!item || item.status === 'approved') return;
    item.status = 'approved';
    if (item.fieldId) state.approved[item.fieldId] = item.after || '';
    applyView();
    saveStore().then(function () {
      toast('Approved that change.');
    });
  }

  function latestForField(fieldId) {
    var i;
    for (i = 0; i < state.history.length; i += 1) {
      if (state.history[i].fieldId === fieldId) return state.history[i];
    }
    return null;
  }

  function findHistory(historyId) {
    var i;
    for (i = 0; i < state.history.length; i += 1) {
      if (state.history[i].id === historyId) return { item: state.history[i], index: i };
    }
    return { item: null, index: -1 };
  }

  function askDelete(historyId) {
    if (!isLoggedIn()) {
      openLogin();
      return;
    }
    var found = findHistory(historyId);
    if (!found.item) return;
    state.pendingDeleteId = historyId;
    document.getElementById('tga-delete-preview').innerHTML = renderDiff(found.item.before || '', found.item.after || '');
    document.getElementById('tga-delete-modal').hidden = false;
  }

  function closeDelete() {
    state.pendingDeleteId = null;
    document.getElementById('tga-delete-modal').hidden = true;
  }

  function confirmDelete() {
    var id = state.pendingDeleteId;
    closeDelete();
    if (id) deleteOne(id);
  }

  function deleteOne(historyId) {
    if (!isLoggedIn()) {
      openLogin();
      return;
    }
    var found = findHistory(historyId);
    var index = found.index;
    if (index < 0) return;
    var item = found.item;
    state.history.splice(index, 1);
    if (item.status !== 'approved' && item.fieldId) {
      var latest = latestForField(item.fieldId);
      if ((state.draft[item.fieldId] || '') === (item.after || '')) {
        state.draft[item.fieldId] = latest ? latest.after : (state.approved[item.fieldId] || item.before || '');
      }
    }
    applyView();
    saveStore().then(function () {
      toast('Deleted that change.');
    });
  }

  function toggleChanges(forceOpen) {
    var panel = document.getElementById('tga-changes-panel');
    if (!panel) return;
    panel.hidden = forceOpen === true ? false : forceOpen === false ? true : !panel.hidden;
    if (!panel.hidden) renderChanges();
  }

  function submitLogin(event) {
    event.preventDefault();
    var id = document.getElementById('tga-approve-id').value.trim();
    var pw = document.getElementById('tga-approve-pw').value;
    if (id !== APPROVE_ID || pw !== APPROVE_PASSWORD) {
      document.getElementById('tga-approve-error').hidden = false;
      return;
    }
    setLoggedIn(true);
    closeLogin();
    toggleChanges(true);
    renderChanges();
    toast('Logged in. Approve each change in the list.');
  }

  function mount() {
    if (document.getElementById('tga-editor-root')) return;
    var css = document.createElement('style');
    css.textContent = [
      '#tga-editor-root{position:fixed;z-index:2147483000;font-family:"Open Sans",Archivo,sans-serif;}',
      '#tga-changes{position:fixed;left:16px;top:96px;display:inline-flex;align-items:center;gap:8px;border-radius:999px;background:#fff;color:#13151A;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:12px 16px;cursor:pointer;border:1px solid #d7dcde;box-shadow:0 8px 24px rgba(19,21,26,.12);}',
      '#tga-changes-count{min-width:18px;height:18px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;background:#39B2B9;color:#fff;font-size:11px;border-radius:999px;}',
      '#tga-edit{position:fixed;right:16px;top:96px;width:48px;height:48px;border:0;border-radius:50%;background:#39B2B9;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(57,178,185,.35);display:flex;align-items:center;justify-content:center;}',
      '#tga-edit-bar{position:fixed;right:16px;top:96px;display:flex;gap:8px;}',
      '#tga-edit-bar[hidden],#tga-changes-count[hidden],#tga-toast[hidden],#tga-approve-modal[hidden],#tga-delete-modal[hidden],#tga-changes-panel[hidden]{display:none !important;}',
      '#tga-changes-panel{position:fixed;left:16px;top:148px;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 168px);overflow:auto;background:#fff;border-radius:20px;box-shadow:0 20px 50px rgba(19,21,26,.2);padding:18px;border:1px solid #e8ecef;}',
      '.tga-changes-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 4px;}',
      '#tga-changes-panel h2{margin:0;font-size:18px;}',
      '#tga-changes-close,#tga-login,#tga-logout{border:0;background:transparent;color:#4A4A4A;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}',
      '#tga-login,#tga-logout{color:#1B878D;}',
      '#tga-changes-panel .tga-changes-lead{margin:0 0 10px;color:#4A4A4A;font-size:13px;line-height:1.45;}',
      '.tga-changes-auth{margin:0 0 14px;color:#4A4A4A;font-size:13px;line-height:1.45;}',
      '.tga-changes-empty{margin:0;color:#4A4A4A;font-size:14px;line-height:1.5;}',
      '.tga-change{padding:12px 0;border-top:1px solid #eef1f2;}',
      '.tga-change:first-child{border-top:0;}',
      '.tga-change__meta{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}',
      '.tga-change__meta a{color:#1B878D;text-decoration:none;}',
      '.tga-change__status{font-size:10px;border-radius:999px;padding:3px 8px;letter-spacing:.04em;}',
      '.tga-change__status.is-pending{background:#E6F6F7;color:#1B878D;}',
      '.tga-change__status.is-approved{background:#eef7ee;color:#188038;}',
      '.tga-change__when{margin:6px 0 8px;color:#6d797b;font-size:12px;}',
      '.tga-change__diff{margin:0 0 10px;font-size:14px;line-height:1.45;color:#13151A;}',
      '.tga-change-actions{display:flex;gap:8px;flex-wrap:wrap;}',
      '.tga-change-approve,.tga-change-delete{border:0;border-radius:999px;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}',
      '.tga-change-approve{background:#39B2B9;color:#fff;}',
      '.tga-change-delete{background:#fff;color:#c0392b;border:1px solid #e3b6b2;}',
      '#tga-save,#tga-cancel{border:0;border-radius:999px;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}',
      '#tga-save{background:#39B2B9;color:#fff;}',
      '#tga-cancel{background:#fff;color:#13151A;border:1px solid #d7dcde;}',
      '#tga-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#13151A;color:#fff;padding:12px 18px;border-radius:999px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.2);}',
      '#tga-approve-modal,#tga-delete-modal{position:fixed;inset:0;background:rgba(19,21,26,.55);display:flex;align-items:center;justify-content:flex-start;padding-left:24px;}',
      '#tga-approve-card,#tga-delete-card{background:#fff;width:min(360px,calc(100vw - 48px));border-radius:24px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.25);}',
      '#tga-approve-card h2,#tga-delete-card h2{margin:0 0 8px;font-size:22px;}',
      '#tga-approve-card p,#tga-delete-card p{margin:0 0 18px;color:#4A4A4A;font-size:14px;line-height:1.5;}',
      '#tga-delete-preview{margin:0 0 18px;font-size:14px;line-height:1.45;color:#13151A;background:#f6f8f8;border-radius:12px;padding:12px;}',
      '#tga-delete-confirm{border:0;border-radius:999px;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#c0392b;color:#fff;}',
      '#tga-delete-cancel{border:1px solid #d7dcde;border-radius:999px;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#fff;}',
      '#tga-delete-actions{display:flex;gap:8px;}',
      '#tga-approve-card label{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin:0 0 6px;}',
      '#tga-approve-card input{width:100%;border:1px solid #d7dcde;border-radius:14px;padding:12px 14px;margin:0 0 14px;font-size:15px;}',
      '#tga-approve-error{color:#c0392b;font-size:13px;margin:0 0 12px;}',
      '#tga-approve-actions{display:flex;gap:8px;}',
      '#tga-approve-submit{border:0;border-radius:999px;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#39B2B9;color:#fff;}',
      '#tga-approve-close{border:1px solid #d7dcde;border-radius:999px;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:#fff;}',
      '.tga-editing-el{outline:2px dashed #39B2B9 !important;outline-offset:4px;cursor:text !important;}',
      'html.tga-editing a,html.tga-editing button{pointer-events:none;}',
      '#tga-editor-root,#tga-editor-root *{pointer-events:auto !important;}',
      'html.tga-editing .tga-editing-el{pointer-events:auto !important;}',
      '.tga-del{color:#c0392b;text-decoration:line-through;text-decoration-thickness:2px;background:rgba(192,57,43,.08);}',
      '.tga-ins{color:#188038;background:rgba(24,128,56,.12);font-weight:700;}'
    ].join('');
    document.head.appendChild(css);

    var root = document.createElement('div');
    root.id = 'tga-editor-root';
    root.innerHTML = [
      '<button type="button" id="tga-changes">Changes <span id="tga-changes-count" hidden>0</span></button>',
      '<aside id="tga-changes-panel" hidden>',
      '<div class="tga-changes-head"><h2>Website changes</h2><button type="button" id="tga-changes-close">Close</button></div>',
      '<p class="tga-changes-lead">Every save is listed here, across Home, For Parents, For Students, and the rest of the site.</p>',
      '<div id="tga-changes-auth"></div>',
      '<div id="tga-changes-list"></div>',
      '</aside>',
      '<button type="button" id="tga-edit" aria-label="Edit text">',
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4.6L19.2 9.4a1.5 1.5 0 0 0 0-2.1L16.7 4.8a1.5 1.5 0 0 0-2.1 0L4 15.4V20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.1 17.9 10.5" stroke="currentColor" stroke-width="1.8"/></svg>',
      '</button>',
      '<div id="tga-edit-bar" hidden>',
      '<button type="button" id="tga-save">Save</button>',
      '<button type="button" id="tga-cancel">Cancel</button>',
      '</div>',
      '<div id="tga-toast" hidden></div>',
      '<div id="tga-approve-modal" hidden>',
      '<form id="tga-approve-card">',
      '<h2>Log in to approve</h2>',
      '<p>After you paste a change into Kajabi, log in here and approve that one line in the list. Nothing is approved all at once.</p>',
      '<label for="tga-approve-id">ID</label>',
      '<input id="tga-approve-id" name="id" autocomplete="username" required>',
      '<label for="tga-approve-pw">Password</label>',
      '<input id="tga-approve-pw" name="password" type="password" autocomplete="current-password" required>',
      '<p id="tga-approve-error" hidden>That ID or password is not right.</p>',
      '<div id="tga-approve-actions">',
      '<button type="submit" id="tga-approve-submit">Log in</button>',
      '<button type="button" id="tga-approve-close">Cancel</button>',
      '</div></form></div>',
      '<div id="tga-delete-modal" hidden>',
      '<div id="tga-delete-card">',
      '<h2>Delete this change?</h2>',
      '<p>This removes it from the list. Cancel if you did not mean to delete it.</p>',
      '<div id="tga-delete-preview"></div>',
      '<div id="tga-delete-actions">',
      '<button type="button" id="tga-delete-confirm">Delete</button>',
      '<button type="button" id="tga-delete-cancel">Cancel</button>',
      '</div></div></div>'
    ].join('');
    document.body.appendChild(root);

    document.getElementById('tga-edit').addEventListener('click', enterEdit);
    document.getElementById('tga-save').addEventListener('click', function () { saveEdits(); });
    document.getElementById('tga-cancel').addEventListener('click', cancelEdits);
    document.getElementById('tga-changes').addEventListener('click', function () { toggleChanges(); });
    document.getElementById('tga-changes-close').addEventListener('click', function () { toggleChanges(false); });
    document.getElementById('tga-changes-panel').addEventListener('click', function (event) {
      if (event.target.id === 'tga-login') {
        openLogin();
        return;
      }
      if (event.target.id === 'tga-logout') {
        setLoggedIn(false);
        renderChanges();
        toast('Logged out.');
        return;
      }
      var approveBtn = event.target.closest('.tga-change-approve');
      if (approveBtn) {
        event.preventDefault();
        approveOne(approveBtn.getAttribute('data-approve-id'));
        return;
      }
      var deleteBtn = event.target.closest('.tga-change-delete');
      if (deleteBtn) {
        event.preventDefault();
        askDelete(deleteBtn.getAttribute('data-delete-id'));
        return;
      }
      var card = event.target.closest('.tga-change');
      if (!card) return;
      var field = card.getAttribute('data-field');
      var page = card.getAttribute('data-page');
      if (page && page !== pageKey()) {
        location.href = hrefForPage(page);
        return;
      }
      if (event.target.closest('a')) return;
      var el = document.querySelector('[data-tga-edit="' + String(field || '').replace(/"/g, '') + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('tga-approve-close').addEventListener('click', closeLogin);
    document.getElementById('tga-approve-card').addEventListener('submit', submitLogin);
    document.getElementById('tga-approve-modal').addEventListener('click', function (event) {
      if (event.target.id === 'tga-approve-modal') closeLogin();
    });
    document.getElementById('tga-delete-confirm').addEventListener('click', confirmDelete);
    document.getElementById('tga-delete-cancel').addEventListener('click', closeDelete);
    document.getElementById('tga-delete-modal').addEventListener('click', function (event) {
      if (event.target.id === 'tga-delete-modal') closeDelete();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !document.getElementById('tga-delete-modal').hidden) {
        closeDelete();
        return;
      }
      if (!state.editing) return;
      if (event.key === 'Escape') cancelEdits();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveEdits();
      }
    });
    document.addEventListener('click', function (event) {
      if (!state.editing) return;
      var link = event.target.closest('a');
      if (link && !link.closest('#tga-editor-root')) event.preventDefault();
    }, true);
  }

  function start() {
    mount();
    restoreLogin();
    loadStore().then(function () {
      applyView();
      if (location.hash === '#changes') toggleChanges(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
