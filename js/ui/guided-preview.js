// Quick watch-only public demo. Never imports the layout store or autosave, and never
// grants an entitlement. The real designer/paywall retain all access authority.
(function () {
  'use strict';
  var current = null;
  var stages = [
    [0, 'Watch an event come together', 'Follow the demonstration pointer. We will build a sample reception; you do not need to click or move any rentals.', 'tent'],
    [5, 'Start with an event space', 'Our example uses a 40 × 60 pole tent. Your own design can use your selected rental instead.', 'tent'],
    [11, 'Add tables and chairs', 'Eight round tables, each with eight chairs, create seating for 64 guests. Watch the pointer place each table.', 'tables'],
    [25, 'Adjust the arrangement', 'Move a table to explore spacing. In your own unlocked design, you control where each rental goes.', 'tables'],
    [33, 'Leave room for dancing', 'Add sixteen 3 × 3 sections to make a 12 × 12 dance floor. This is a sample, not a confirmed installation plan.', 'dance'],
    [42, 'See the same layout in 3D', 'Switch from the overhead plan to the same furnished tent in 3D, then look inside the reception.', '3d'],
    [53, 'Try a different style', 'Change the tables to sage linens and gold Chiavari chairs. Compare a new look without rebuilding your layout.', 'style'],
    [63, 'Preview the evening atmosphere', 'See the same reception at night with bistro lighting. Decorative scene details are previews, not rental selections.', 'night'],
    [73, 'Review your plan', 'With paid or included access, save your own design, return to edit, and print or share it. This demonstration is not saved or sent.', 'review'],
    [84, 'Ready to make it your event?', 'Start your own layout with a 30-day Event Pass, or open the access included with your active confirmed Friendly order.', 'review'],
  ];
  var duration = 84;
  function open(options) {
    if (current) return current;
    if (!options || options.hasAccess() || document.body.classList.contains('rs-preview-expired')) return null;
    var root = document.createElement('section'); root.className = 'guided-preview';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'guided-preview-title');
    root.innerHTML = '<div class="gp-shell"><header class="gp-header"><div><p class="gp-eyebrow">RentSketch · watch-only walkthrough</p><h2 id="guided-preview-title" tabindex="-1">Watch us design an event</h2></div><button type="button" class="gp-close" aria-label="Close walkthrough and return to rental preview">×</button></header>' +
      '<div class="gp-workspace"><div class="gp-tools" aria-label="Demonstration steps"><span data-tool="tent">Tent</span><span data-tool="tables">Tables</span><span data-tool="dance">Dance floor</span><span data-tool="3d">3D view</span><span data-tool="style">Styling</span><span data-tool="night">Night</span><span data-tool="review">Review</span></div>' +
      '<div class="gp-stage" aria-label="Watch-only example; editing is locked"><div class="gp-scene" inert><div class="gp-plan"></div><div class="gp-3d" hidden></div></div><div class="gp-summary" hidden><p>Sample rental summary</p><strong>64 seats</strong><span>40 × 60 pole tent</span><span>8 round tables + 64 chairs</span><span>12 × 12 dance floor</span><span>Bistro lighting</span><small>Example only · nothing saved or submitted</small></div><p class="gp-example">Sample reception · not your saved event</p><p class="gp-fallback" hidden>3D is unavailable in this browser. The guided 2D example continues.</p></div>' +
      '<div class="gp-pointer" aria-hidden="true"><svg viewBox="0 0 28 34"><path d="M3 2 L24 21 L15 22 L12 31 L3 2Z"/></svg><span>Demo</span></div></div>' +
      '<section class="gp-explanation"><p class="gp-step"></p><h3></h3><p class="gp-caption" aria-live="polite" aria-atomic="true"></p><div class="gp-progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin="0" aria-valuemax="84"><span></span></div><div class="gp-player"><button type="button" data-pause>Pause</button><button type="button" data-replay>Replay</button><button type="button" data-narration aria-pressed="false">Narration off</button><span class="gp-time"></span></div></section>' +
      '<footer class="gp-footer"><button type="button" class="gp-buy"></button><a class="gp-booking" href="https://rentsketch.com/my-event/?tenant=friendly&mode=order">Existing order? Open for FREE</a><p><strong>Quick Demo · watch-only sample.</strong> One event access is separate; rentals are separate.</p></footer></div>';
    document.body.appendChild(root);
    var q = function (selector) { return root.querySelector(selector); };
    var reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    var paused = reduced, narration = false, closed = false, elapsed = 0, last = performance.now(), raf, sample, view, loading, failure = false;
    var step = -1, lastRender = '', renderingKey = '', generation = 0, voiceOwned = false, lastPaint = -Infinity;
    var priorFocus = document.activeElement, oldOverflow = document.body.style.overflow;
    var app = document.getElementById('designerApp'), priorInert = app?.hasAttribute('inert');
    if (app) app.setAttribute('inert', '');
    document.body.classList.add('rs-guided-open'); document.body.style.overflow = 'hidden';
    q('.gp-buy').textContent = 'Start designing — ' + options.price() + ' / ' + options.days() + ' days';
    q('[data-narration]').hidden = !('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    q('#guided-preview-title').focus({ preventScroll: true });
    function canContinue() { return !closed && !options.hasAccess() && !document.body.classList.contains('rs-preview-expired'); }
    function stopVoice() { if (voiceOwned && window.speechSynthesis) window.speechSynthesis.cancel(); voiceOwned = false; }
    function speak() {
      stopVoice();
      if (!narration || paused || document.hidden || step < 0) return;
      try { var utterance = new SpeechSynthesisUtterance(stages[step][1] + '. ' + stages[step][2]); utterance.lang = 'en-US'; utterance.rate = 1; voiceOwned = true; window.speechSynthesis.speak(utterance); } catch (_) { narration = false; q('[data-narration]').textContent = 'Narration unavailable'; }
    }
    function close() {
      if (closed) return; closed = true; generation++; cancelAnimationFrame(raf); clearInterval(guard);
      stopVoice(); resize?.disconnect(); view?.destroy(); view = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', close); window.removeEventListener('rentsketch:accessChanged', accessChanged); window.removeEventListener('rentsketch:previewExpired', close);
      document.body.classList.remove('rs-guided-open'); document.body.style.overflow = oldOverflow;
      if (app && !priorInert && !document.body.classList.contains('rs-preview-expired')) app.removeAttribute('inert');
      root.remove(); current = null;
      if (priorFocus && priorFocus.isConnected && !document.body.classList.contains('rs-preview-expired')) priorFocus.focus({ preventScroll: true });
      options.onClose?.();
    }
    function accessChanged() { if (options.hasAccess()) close(); }
    function visibility() { last = performance.now(); if (document.hidden) stopVoice(); else if (!paused) speak(); }
    function updatePlayer() {
      q('[data-pause]').textContent = elapsed >= duration ? 'Play again' : paused ? 'Play walkthrough' : 'Pause';
      q('[data-pause]').setAttribute('aria-pressed', String(paused));
      q('[data-narration]').setAttribute('aria-pressed', String(narration));
      q('[data-narration]').textContent = narration ? 'Narration on' : 'Narration off';
    }
    function replay() { if (!canContinue()) { close(); return; } elapsed = 0; step = -1; lastRender = ''; renderingKey = ''; paused = false; last = performance.now(); updatePlayer(); render(); }
    q('.gp-close').onclick = close;
    q('.gp-buy').onclick = function () { close(); options.purchase(); };
    q('.gp-booking').onclick = function (event) {
      if (window.parent !== window) { event.currentTarget.target = '_blank'; event.currentTarget.rel = 'noopener'; }
    };
    q('[data-pause]').onclick = function () { if (elapsed >= duration) return replay(); paused = !paused; last = performance.now(); if (paused) stopVoice(); else speak(); updatePlayer(); render(); };
    q('[data-replay]').onclick = replay;
    q('[data-narration]').onclick = function () { narration = !narration; updatePlayer(); if (narration) speak(); else stopVoice(); };
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      var controls = Array.from(root.querySelectorAll('button:not([disabled]),a[href]')).filter(function (el) { return !el.hidden && el.getClientRects().length; });
      var first = controls[0], lastControl = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === q('#guided-preview-title'))) { event.preventDefault(); lastControl.focus(); }
      else if (!event.shiftKey && document.activeElement === lastControl) { event.preventDefault(); first.focus(); }
    });
    // Only player/purchase controls receive input. No demonstration action is
    // dispatched to the real designer, including synthetic pointer events.
    q('.gp-workspace').addEventListener('pointerdown', function (event) { event.preventDefault(); });
    function point(tool, x, y) {
      var workspace = q('.gp-workspace').getBoundingClientRect(), rect;
      if (tool) rect = q('[data-tool="' + tool + '"]').getBoundingClientRect();
      else { var plan = q('.gp-plan svg'); if (!plan) return; var p = plan.createSVGPoint(); p.x = x; p.y = y; var matrix = plan.querySelector('.gp-geometry').getScreenCTM(); if (!matrix) return; var at = p.matrixTransform(matrix); rect = { x: at.x, y: at.y, width: 0, height: 0 }; }
      var px = rect.x + rect.width / 2 - workspace.x, py = rect.y + rect.height / 2 - workspace.y;
      q('.gp-pointer').style.transform = 'translate(' + px + 'px,' + py + 'px)';
    }
    function sceneForTime() {
      var scene = JSON.parse(JSON.stringify(sample));
      var count = elapsed < 11 ? 0 : Math.min(8, Math.floor((elapsed - 11) / 1.65));
      var tables = scene.objects.filter(function (item) { return item.kind === 'table'; }).slice(0, count);
      if (elapsed >= 25 && tables[0]) { var k = Math.max(0, Math.min(1, (elapsed - 26) / 3)); tables[0].x += 2 * k; tables[0].y += 2 * k; }
      if (elapsed >= 53) tables.forEach(function (table) { table.linenColor = 'Sage Green'; table.chairId = 'chiavari-gold'; });
      var floors = elapsed < 34 ? [] : scene.objects.filter(function (item) { return item.kind === 'dance'; }).slice(0, Math.min(16, Math.floor((elapsed - 34) / .4)));
      scene.objects = tables.concat(floors); if (elapsed < 63) scene.lightingId = 'lighting-none';
      return scene;
    }
    function planMarkup(scene) {
      var tables = scene.objects.filter(function (item) { return item.kind === 'table'; });
      var floor = scene.objects.filter(function (item) { return item.kind === 'dance'; });
      var landscape = q('.gp-stage').clientWidth > q('.gp-stage').clientHeight;
      var svg = '<svg viewBox="' + (landscape ? '-6 -6 72 52' : '-6 -6 52 72') + '" role="img" aria-label="Sample reception floor plan"><defs><pattern id="gp-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#d4ded5" stroke-width=".15"/></pattern></defs><rect x="-6" y="-6" width="72" height="72" fill="url(#gp-grid)"/><g class="gp-geometry" transform="' + (landscape ? 'translate(60 0) rotate(90)' : '') + '">';
      if (elapsed >= 6) svg += '<rect class="gp-tent" width="40" height="60" rx=".5" fill="#fffdfa" stroke="#739a84" stroke-width=".45"/><path d="M20 0V60M0 30H40" stroke="#e9ede8" stroke-dasharray="1 1" stroke-width=".2"/><text x="20" y="-2" text-anchor="middle">40 ft</text><text x="43" y="30" text-anchor="middle" transform="rotate(90 43 30)">60 ft</text>';
      floor.forEach(function (item) { svg += '<rect x="' + item.x + '" y="' + item.y + '" width="3" height="3" fill="#ccac77" stroke="#ac895a" stroke-width=".12"/>'; });
      tables.forEach(function (table, index) { var x = table.x + 2.5, y = table.y + 2.5; svg += '<g data-sample-table="' + index + '">'; for (var seat = 0; seat < 8; seat++) { var angle = seat * Math.PI / 4, cx = x + Math.cos(angle) * 3.65, cy = y + Math.sin(angle) * 3.65; svg += '<rect x="' + (cx - .55) + '" y="' + (cy - .55) + '" width="1.1" height="1.1" rx=".2" fill="' + (elapsed >= 53 ? '#bd9251' : '#d8e1d9') + '"/>'; } svg += '<circle cx="' + x + '" cy="' + y + '" r="2.5" fill="' + (elapsed >= 53 ? '#a5b89f' : '#fff') + '" stroke="#739a84" stroke-width=".2"/><text x="' + x + '" y="' + (y + .6) + '" text-anchor="middle">' + (index + 1) + '</text></g>'; });
      if (elapsed >= 6) svg += '<circle cx="20" cy="20" r=".5" fill="#9eaba4"/><circle cx="20" cy="40" r=".5" fill="#9eaba4"/>';
      return svg + '</g></svg>';
    }
    async function ensure3d() {
      if (view || loading || failure || !sample || !canContinue()) return;
      var ticket = ++generation;
      loading = import('/js/ui/view3d.js').then(function (renderer) {
        if (closed || ticket !== generation) return;
        // Do not replace view3d's active editor singleton with this sample.
        view = renderer.init(q('.gp-3d'), { registerActive: false });
        view.setScene({ motion: false, guests: false, styling: true, night: elapsed >= 63 });
        q('.gp-3d canvas').setAttribute('aria-label', 'Watch-only 3D reception example');
        q('.gp-3d canvas').addEventListener('webglcontextlost', function (event) { event.preventDefault(); failure = true; q('.gp-fallback').hidden = false; q('.gp-3d').hidden = true; q('.gp-plan').hidden = false; });
        renderingKey = ''; render();
      }).catch(function () { if (!closed) { failure = true; q('.gp-fallback').hidden = false; render(); } }).finally(function () { loading = null; });
    }
    function render() {
      if (closed) return;
      var index = stages.length - 1; while (index > 0 && elapsed < stages[index][0]) index--;
      if (index !== step) { step = index; root.dataset.step = String(index); q('.gp-step').textContent = elapsed >= duration ? 'Walkthrough complete' : 'Step ' + (index + 1) + ' of 9'; q('.gp-explanation h3').textContent = stages[index][1]; q('.gp-caption').textContent = stages[index][2]; root.querySelectorAll('[data-tool]').forEach(function (el) { el.classList.toggle('active', el.dataset.tool === stages[index][3]); }); point(stages[index][3]); speak(); }
      var progress = q('.gp-progress'); progress.setAttribute('aria-valuenow', String(Math.floor(elapsed))); progress.firstChild.style.width = elapsed / duration * 100 + '%';
      q('.gp-time').textContent = Math.floor(elapsed / 60) + ':' + String(Math.floor(elapsed % 60)).padStart(2, '0') + ' / 1:24';
      if (!sample) return;
      var scene = sceneForTime(), key = (elapsed >= 6 ? 'tent:' : 'space:') + JSON.stringify(scene);
      if (key !== lastRender) { q('.gp-plan').innerHTML = planMarkup(scene); lastRender = key; }
      var show3d = elapsed >= 42 && elapsed < 73 && !failure;
      q('.gp-3d').hidden = !show3d; q('.gp-plan').hidden = show3d && !!view;
      q('.gp-summary').hidden = elapsed < 73;
      if (show3d) {
        ensure3d();
        if (view) { var camera = elapsed < 47 ? 'outside' : 'reception'; var renderKey = key + camera; if (renderKey !== renderingKey) { view.rebuild(scene); view.setScene({ motion: false, guests: false, styling: true, night: elapsed >= 63 }); if (camera === 'outside') view.fitCamera(); else view.reception(); renderingKey = renderKey; } }
      }
      if (elapsed >= 11 && elapsed < 25) { var which = Math.min(7, Math.floor((elapsed - 11) / 1.65)), table = sample.objects.filter(function (item) { return item.kind === 'table'; })[which]; point(null, table.x + 2.5, table.y + 2.5); }
      else if (elapsed >= 26 && elapsed < 33 && scene.objects[0]) point(null, scene.objects[0].x + 2.5, scene.objects[0].y + 2.5);
      else if (elapsed >= 34 && elapsed < 42) point(null, 20, 30);
    }
    function tick(now) {
      if (!canContinue()) { close(); return; }
      if (!paused && !document.hidden) elapsed = Math.min(duration, elapsed + Math.max(0, Math.min((now - last) / 1000, .2)));
      last = now;
      if (now - lastPaint >= 100) { lastPaint = now; render(); }
      if (elapsed >= duration && !paused) { paused = true; updatePlayer(); }
      raf = requestAnimationFrame(tick);
    }
    var resize = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { lastRender = ''; render(); }) : null;
    resize?.observe(q('.gp-stage'));
    var guard = setInterval(function () { if (!canContinue()) close(); }, 250);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', close); window.addEventListener('rentsketch:accessChanged', accessChanged); window.addEventListener('rentsketch:previewExpired', close);
    updatePlayer(); render();
    import('/js/data/marketing-reception.js').then(function (data) { if (closed) return; sample = data.marketingReception(); render(); }).catch(function () { if (!closed) { paused = true; q('.gp-caption').textContent = 'The sample could not load. Close this walkthrough and try again. Your design has not been changed.'; updatePlayer(); } });
    current = { close: close }; raf = requestAnimationFrame(tick); return current;
  }
  window.RentSketchGuidedPreview = { open: open, close: function () { current?.close(); } };
})();