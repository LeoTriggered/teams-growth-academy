(function () {
  var KEY = 'tga-audience';

  function normalize(value) {
    return value === 'student' ? 'student' : 'parent';
  }
  function safeGet() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function safeSet(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
  }
  function queryAudience() {
    try { return new URLSearchParams(location.search).get('audience'); } catch (e) { return null; }
  }
  function homeFor(audience) {
    return audience === 'student' ? 'student_homepage.html' : 'parent_first_homepage.html';
  }
  function fileName() {
    var parts = location.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || '');
  }
  function isParentHome(name) {
    return name === '' || name === 'index.html' || name === 'parent_first_homepage.html' || name === 'Home.html';
  }
  function isStudentHome(name) {
    return name === 'student_homepage.html';
  }

  var query = queryAudience();
  var name = fileName();
  var audience;
  if (query === 'parent' || query === 'student') {
    audience = query;
  } else if (isStudentHome(name)) {
    audience = 'student';
  } else if (isParentHome(name)) {
    audience = 'parent';
  } else {
    audience = normalize(safeGet());
  }
  safeSet(audience);
  document.documentElement.setAttribute('data-audience', audience);

  if (!document.getElementById('tga-audience-css')) {
    var css = document.createElement('style');
    css.id = 'tga-audience-css';
    css.textContent = [
      'html:not([data-audience="student"]) .tga-for-student{display:none!important;}',
      'html[data-audience="student"] .tga-for-parent{display:none!important;}',
      '.tga-audience{display:inline-flex;align-items:center;gap:14px;flex-shrink:0;}',
      '.tga-audience__btn{font-family:"Open Sans",sans-serif!important;font-size:13px!important;font-weight:400!important;letter-spacing:normal!important;text-transform:uppercase!important;line-height:1.2!important;padding:0!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#595959!important;text-decoration:none!important;white-space:nowrap;cursor:pointer;}',
      '.tga-audience__btn:hover{color:#39B2B9!important;}',
      '.tga-audience__btn.is-active{color:#39B2B9!important;font-weight:700!important;}',
      'html[data-audience="student"] .tga-th-together{background:#39B2B9!important;}',
      'html[data-audience="student"] .tga-th-together .tga-start-here{background:rgba(255,255,255,.22);}',
      'html[data-audience="student"] .tga-price-cell--together{background:#f3fbfc;}',
      'html[data-audience="parent"] .tga-pricing-layout--simple .tga-ptable col.tga-col-offer{width:42%;}',
      'html[data-audience="parent"] .tga-pricing-layout--simple .tga-ptable col.tga-col-parent,',
      'html[data-audience="parent"] .tga-pricing-layout--simple .tga-ptable col.tga-col-combined{width:29%;}',
      'html[data-audience="student"] .tga-pricing-layout--simple .tga-ptable{min-width:640px;}',
      'html[data-audience="student"] .tga-pricing-layout--simple .tga-ptable col.tga-col-offer{width:42%;}',
      'html[data-audience="student"] .tga-pricing-layout--simple .tga-ptable col.tga-col-student,',
      'html[data-audience="student"] .tga-pricing-layout--simple .tga-ptable col.tga-col-combined{width:29%;}',
      '@media (min-width:768px){html[data-audience="parent"] #tga-includes-grid{grid-template-columns:repeat(5,minmax(0,1fr));}html[data-audience="student"] #tga-includes-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}',
      '@media (max-width:767px){.tga-audience{gap:10px;}.tga-audience__btn{font-size:12px!important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(css);
  }

  function apply() {
    if (document.body) document.body.setAttribute('data-audience', audience);
    document.querySelectorAll('.tga-audience__btn').forEach(function (btn) {
      var active = btn.getAttribute('data-tga-audience') === audience;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var home = homeFor(audience);
    document.querySelectorAll('a[data-tga-home], header a[href="Home.html"], header a[href="parent_first_homepage.html"], header a[href="student_homepage.html"]').forEach(function (link) {
      if (link.hasAttribute('data-tga-audience')) return;
      link.setAttribute('href', home);
    });
    document.querySelectorAll('footer a').forEach(function (link) {
      if (link.hasAttribute('data-tga-audience')) return;
      var href = link.getAttribute('href') || '';
      if (href === 'Home.html' || href === 'parent_first_homepage.html' || href === 'student_homepage.html') {
        if (/home/i.test((link.textContent || '').trim()) || link.querySelector('img')) {
          link.setAttribute('href', home);
        }
      }
    });
  }

  function go(next) {
    next = normalize(next);
    safeSet(next);
    var name = fileName();
    if (next === 'student' && isParentHome(name)) {
      location.href = 'student_homepage.html';
      return;
    }
    if (next === 'parent' && isStudentHome(name)) {
      location.href = 'parent_first_homepage.html';
      return;
    }
    try {
      var url = new URL(location.href);
      url.searchParams.set('audience', next);
      location.href = url.toString();
    } catch (e) {
      location.reload();
    }
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-tga-audience]');
    if (!btn) return;
    event.preventDefault();
    go(btn.getAttribute('data-tga-audience'));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
