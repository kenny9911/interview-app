/* ============================================================
   viva prototype runtime
   - Injects the iOS chrome (dynamic island, status bar, home
     indicator) into every .device so the screen markup stays
     focused on content.
   - Gallery view: every screen laid out like the design canvas.
   - Prototype view: one centered device; data-goto targets walk
     the flow; prev/next + a dropdown jump between screens.
   ============================================================ */
(function () {
  'use strict';

  var SCREEN_ORDER = [
    'welcome', 'signin', 'signup',
    'home', 'choosemode', 'setup', 'live', 'results',
    'plans', 'payment', 'live-night'
  ];

  var SCREEN_LABELS = {
    welcome: 'Welcome', signin: 'Sign in', signup: 'Create account',
    home: 'Home', choosemode: 'Choose a mode', setup: 'Set up',
    live: 'Live interview', results: 'Results',
    plans: 'Plans', payment: 'Payment', 'live-night': 'Live · deep night'
  };

  // ---- status-bar glyphs (signal / wifi / battery), color-aware ----
  function statusGlyphs() {
    return (
      '<svg width="19" height="12" viewBox="0 0 19 12">' +
        '<rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill="currentColor"/>' +
        '<rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill="currentColor"/>' +
        '<rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill="currentColor"/>' +
        '<rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill="currentColor"/>' +
      '</svg>' +
      '<svg width="17" height="12" viewBox="0 0 17 12">' +
        '<path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill="currentColor"/>' +
        '<path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill="currentColor"/>' +
        '<circle cx="8.5" cy="10.5" r="1.5" fill="currentColor"/>' +
      '</svg>' +
      '<svg width="27" height="13" viewBox="0 0 27 13">' +
        '<rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" stroke-opacity="0.35" fill="none"/>' +
        '<rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"/>' +
        '<path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill="currentColor" fill-opacity="0.4"/>' +
      '</svg>'
    );
  }

  function decorateDevice(device) {
    var dark = device.classList.contains('dark');

    var island = document.createElement('div');
    island.className = 'island';

    var statusbar = document.createElement('div');
    statusbar.className = 'statusbar';
    statusbar.innerHTML =
      '<div class="time">9:41</div>' +
      '<div class="glyphs" style="color:' + (dark ? '#fff' : '#000') + '">' + statusGlyphs() + '</div>';

    var home = document.createElement('div');
    home.className = 'home-indicator';
    home.innerHTML = '<i></i>';

    device.insertBefore(island, device.firstChild);
    device.insertBefore(statusbar, device.firstChild);
    device.appendChild(home);
  }

  // ---- state ----
  var body = document.body;
  var cells = {};            // id -> .cell element
  var current = SCREEN_ORDER[0];

  function cellFor(id) { return cells[id]; }

  function setActiveScreen(id, scrollIntoView) {
    if (!cells[id]) id = SCREEN_ORDER[0];
    current = id;
    SCREEN_ORDER.forEach(function (sid) {
      var c = cells[sid];
      if (c) c.classList.toggle('is-active', sid === id);
    });
    var sel = document.getElementById('screenSelect');
    if (sel) sel.value = id;
    updateNavButtons();
    // reset the inner scroll of the now-active screen to the top
    var active = cells[id];
    if (active) {
      var content = active.querySelector('.device-content');
      if (content) content.scrollTop = 0;
    }
    if (scrollIntoView && body.classList.contains('view-prototype')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function updateNavButtons() {
    var i = SCREEN_ORDER.indexOf(current);
    var prev = document.getElementById('prevBtn');
    var next = document.getElementById('nextBtn');
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i >= SCREEN_ORDER.length - 1;
  }

  function setView(view) {
    if (view === 'prototype') {
      body.classList.remove('view-gallery');
      body.classList.add('view-prototype');
      setActiveScreen(current, true);
    } else {
      body.classList.remove('view-prototype');
      body.classList.add('view-gallery');
    }
    document.querySelectorAll('#viewSeg button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
  }

  // ---- wire up ----
  document.querySelectorAll('.cell[data-id]').forEach(function (cell) {
    cells[cell.getAttribute('data-id')] = cell;
  });
  document.querySelectorAll('.device').forEach(decorateDevice);

  // view toggle
  document.querySelectorAll('#viewSeg button').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
  });

  // screen dropdown
  var sel = document.getElementById('screenSelect');
  SCREEN_ORDER.forEach(function (id) {
    var opt = document.createElement('option');
    opt.value = id;
    opt.textContent = SCREEN_LABELS[id] || id;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function () { setActiveScreen(sel.value, true); });

  // prev / next
  document.getElementById('prevBtn').addEventListener('click', function () {
    var i = SCREEN_ORDER.indexOf(current);
    if (i > 0) setActiveScreen(SCREEN_ORDER[i - 1], true);
  });
  document.getElementById('nextBtn').addEventListener('click', function () {
    var i = SCREEN_ORDER.indexOf(current);
    if (i < SCREEN_ORDER.length - 1) setActiveScreen(SCREEN_ORDER[i + 1], true);
  });

  // clicks: data-goto navigates in prototype; clicking a device in
  // gallery opens the prototype at that screen.
  document.addEventListener('click', function (e) {
    var goto = e.target.closest('[data-goto]');
    if (goto && body.classList.contains('view-prototype')) {
      e.preventDefault();
      setActiveScreen(goto.getAttribute('data-goto'), true);
      return;
    }
    if (body.classList.contains('view-gallery')) {
      var device = e.target.closest('.device[data-screen]');
      if (device) {
        setView('prototype');
        setActiveScreen(device.getAttribute('data-screen'), true);
      }
    }
  });

  // keyboard arrows in prototype mode
  document.addEventListener('keydown', function (e) {
    if (!body.classList.contains('view-prototype')) return;
    if (e.key === 'ArrowRight') document.getElementById('nextBtn').click();
    if (e.key === 'ArrowLeft') document.getElementById('prevBtn').click();
  });

  // start in gallery, primed to welcome
  setActiveScreen('welcome', false);
  updateNavButtons();
})();
