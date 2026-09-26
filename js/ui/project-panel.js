// Customer projects and authorized installation handoff. Private staff notes
// are fetched on demand and never copied into the scene or public share URL.
(function () {
  'use strict';
  var panel, lastFocus, busy = false, data = {}, message = '', generation = 0;
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bridge() { return window.FriendlyBridge || {}; }
  function auto() { return window.RentSketchAutosave || window.RentSketchStartAutosave?.(); }
  function staff() { return !!window.RentSketchDashboardSession?.identity?.(); }
  function allowed() { return !window.RENTSKETCH_SHARED_READONLY && auto()?.getState?.().readOnly !== true; }
  function date(value) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function button(action, label, extra) { return '<button type="button" data-action="' + action + '" ' + (extra || '') + (busy ? ' disabled' : '') + '>' + label + '</button>'; }
  function state() { return auto()?.getState?.() || {}; }
  function close() { generation++; panel?.remove(); panel = null; data = {}; message = ''; lastFocus?.focus?.(); }
  function updateStatus() {
    if (!panel) return;
    var current = state(), badge = panel.querySelector('[data-save-status]');
    if (badge) { badge.textContent = current.message || 'Ready to save'; badge.dataset.state = current.status || 'local'; }
    var conflict = panel.querySelector('[data-conflict]');
    if (conflict) conflict.hidden = !current.conflict;
  }
  function render() {
    if (!panel) return;
    var current = state(), project = data.project || current.project || {}, readonly = !allowed();
    var revisions = data.revisions || [], alternatives = data.alternatives || [], shares = data.shares || [];
    panel.innerHTML = '<div class="rs-project-dialog" role="dialog" aria-modal="true" aria-labelledby="rsProjectTitle" tabindex="-1">' +
      '<header><div><p class="rs-project-eyebrow">YOUR EVENT WORKSPACE</p><h2 id="rsProjectTitle">Projects &amp; sharing</h2></div>' + button('close', '×', 'class="rs-project-close" aria-label="Close projects"') + '</header>' +
      '<div class="rs-project-status" role="status" aria-live="polite" data-save-status></div>' +
      '<p class="rs-project-message" role="alert">' + esc(message) + '</p>' +
      (readonly ? '<section><h3>' + esc(window.RENTSKETCH_SHARED_PROJECT?.projectName || 'Shared preview') + '</h3><p class="rs-crew-notes">' + esc(window.RENTSKETCH_SHARED_PROJECT?.siteNotes || '') + '</p><p>This layout is read-only. Return to your private event access to save versions, change notes or manage links.</p></section>' :
      '<div class="rs-project-content">' +
      '<section class="rs-project-conflict" data-conflict hidden><h3>Keep both layouts safe</h3><p>Another session saved this project. Your changes are still on this device. Save them as an alternative, or reopen the latest cloud layout.</p>' + button('conflict-copy', 'Keep my work as an alternative') + button('reload', 'Open latest saved layout') + '</section>' +
      '<section><form data-form="details"><h3>Current project</h3><label>Project name<input name="projectName" maxlength="120" value="' + esc(project.projectName) + '" placeholder="Backyard graduation" required></label><label>Site notes <span>Visible to people you share this plan with</span><textarea name="siteNotes" rows="3" maxlength="4000" placeholder="Gate access, setup area, or details to confirm">' + esc(project.siteNotes) + '</textarea></label><div class="rs-project-actions"><button type="submit"' + (busy ? ' disabled' : '') + '>Save project details</button>' + button('sync', 'Save layout now') + '</div></form></section>' +
      '<section><h3>Named versions</h3><p>Keep a checkpoint before trying a different arrangement.</p><form data-form="version" class="rs-project-inline"><label class="rs-project-sr" for="rsVersionName">Version name</label><input id="rsVersionName" name="name" maxlength="120" required placeholder="Approved layout"><button' + (busy ? ' disabled' : '') + '>Save version</button></form><ul class="rs-project-list">' + (revisions.length ? revisions.map(function (v) { return '<li><div><strong>' + esc(v.name) + '</strong><small>Revision ' + esc(v.sourceRevision) + ' · ' + esc(date(v.createdAt)) + '</small></div>' + button('restore', 'Restore', 'data-id="' + esc(v.id) + '"') + '</li>'; }).join('') : '<li class="rs-project-empty">No named versions yet.</li>') + '</ul></section>' +
      '<section><h3>Alternative layouts</h3><p>Compare a ceremony, reception or rain plan without replacing this layout.</p><form data-form="alternative" class="rs-project-inline"><label class="rs-project-sr" for="rsAlternativeName">Alternative name</label><input id="rsAlternativeName" name="name" maxlength="120" required placeholder="Rain plan"><button' + (busy ? ' disabled' : '') + '>Create alternative</button></form><ul class="rs-project-list">' + (alternatives.length ? alternatives.map(function (v) { return '<li><div><strong>' + esc(v.projectName || v.name || 'Untitled layout') + '</strong><small>' + esc(date(v.updatedAt || v.createdAt)) + '</small></div>' + button('open-alternative', v.id === current.id ? 'Current layout' : 'Open', 'data-id="' + esc(v.id) + '"' + (v.id === current.id ? ' disabled' : '')) + '</li>'; }).join('') : '<li class="rs-project-empty">Your alternatives will appear here.</li>') + '</ul></section>' +
      '<section><h3>View-only sharing</h3><p>Anyone with the link can view the layout, site notes and venue photos until it expires. Contact information and private crew notes are excluded.</p><form data-form="share" class="rs-project-inline"><label>Link expires<select name="days"><option value="1">After 1 day</option><option value="7">After 7 days</option><option value="30" selected>After 30 days</option><option value="180">After 180 days</option></select></label><button' + (busy ? ' disabled' : '') + '>Create view-only link</button></form>' +
      (data.newShare ? '<label class="rs-project-link">New private viewing link<input readonly data-share-url value="' + esc(data.newShare) + '"></label>' + button('copy-share', 'Copy link') : '') +
      '<ul class="rs-project-list">' + (shares.length ? shares.map(function (s) { var ended = !!s.revokedAt || Date.parse(s.expiresAt) <= Date.now(); return '<li><div><strong>' + (s.revokedAt ? 'Revoked' : ended ? 'Expired' : 'Active view-only link') + '</strong><small>Expires ' + esc(date(s.expiresAt)) + '</small></div>' + (ended ? '' : button('revoke', 'Revoke', 'data-id="' + esc(s.id) + '"')) + '</li>'; }).join('') : '<li class="rs-project-empty">No managed links created yet.</li>') + '</ul>' +
      (data.legacySharesEnabled ? '<p class="rs-project-fine">Older viewing links may still work.</p>' + button('revoke-legacy', 'Revoke older viewing links') : '') + '</section>' +
      '<section><h3>Installation handoff</h3><p>Print the rental quantities, planned dimensions and unresolved site checks. This is a planning sheet; staff must confirm installation requirements.</p>' +
      (staff() ? '<form data-form="crew"><label>Private crew notes <span>Staff only; excluded from viewing links</span><textarea name="crewNotes" rows="4" maxlength="8000" placeholder="Crew instructions, loading order, or items to verify">' + esc(project.crewNotes) + '</textarea></label><button' + (busy ? ' disabled' : '') + '>Save crew notes</button></form>' : '') +
      '<label class="rs-project-check"><input type="checkbox" data-include-photo> Include the venue photo in the printed sheet</label>' + button('print', 'Print installation sheet') + '</section></div>') + '</div>';
    updateStatus();
  }
  async function refresh() {
    var a = auto(), epoch = generation;
    if (!allowed()) { render(); return; }
    if (!a.getDesignId()) await a.flush();
    if (!a.getDesignId()) throw new Error('Start a layout before saving a project.');
    var results = await Promise.all([a.fetchLatest(), a.request(a.projectPath('/revisions')), a.request(a.projectPath('/alternatives')), a.request(a.projectPath('/shares'))]);
    if (!panel || epoch !== generation) return;
    data = Object.assign({}, data, { project: results[0], revisions: results[1].revisions || [], alternatives: results[2].alternatives || [], shares: results[3].shares || [], legacySharesEnabled: results[3].legacySharesEnabled });
    render();
  }
  async function run(work) {
    if (busy || !allowed()) return;
    var epoch = generation; busy = true; message = ''; render();
    try { await work(); if (panel && epoch === generation) await refresh(); }
    catch (error) { if (panel && epoch === generation) message = error.message || 'Please try again.'; }
    finally { busy = false; if (panel && epoch === generation) render(); }
  }
  async function mutate(suffix, method, body, skipFlush) {
    if (!allowed()) throw new Error('This layout is read-only.');
    var a = auto(); if (!skipFlush) await a.flush();
    body = Object.assign({ expectedRevision: a.getRevision(), anonymousSessionId: a.getSessionId() }, body || {});
    return a.request(a.projectPath(suffix), { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function adopt(saved) { if (saved.scene && !bridge().loadScene(saved.scene)) throw new Error('This saved layout could not be displayed.'); auto().adopt(saved); }
  async function open() {
    if (panel) { panel.querySelector('.rs-project-dialog').focus(); return; }
    lastFocus = document.activeElement; generation++; data = {}; message = ''; bridge().closeDrawer?.();
    panel = document.createElement('div'); panel.className = 'rs-project-panel'; document.body.appendChild(panel); render();
    panel.addEventListener('click', function (event) {
      if (event.target === panel) { close(); return; }
      var target = event.target.closest('[data-action]'); if (!target) return;
      var action = target.dataset.action, id = target.dataset.id;
      if (action === 'close') return close();
      if (!allowed()) return;
      if (action === 'copy-share') { var input = panel.querySelector('[data-share-url]'); input?.select(); navigator.clipboard?.writeText(input.value).catch(function () {}); return; }
      if (action === 'print') return printCrewSheet({ includePhoto: panel.querySelector('[data-include-photo]').checked });
      run(async function () {
        if (action === 'sync') await auto().flush();
        if (action === 'restore') { if (!window.confirm('Restore this version? Your current layout will be replaced. Save a named version first if you want to keep it.')) return; adopt(await mutate('/revisions/' + encodeURIComponent(id) + '/restore')); }
        if (action === 'reload') { if (!window.confirm('Open the latest cloud layout? Unsynced changes on this device will be replaced.')) return; await auto().reloadLatest(); }
        if (action === 'conflict-copy') { var name = window.prompt('Name this alternative', 'My local layout'); if (!name?.trim()) return; adopt(await mutate('/alternatives', 'POST', { name: name.trim(), scene: bridge().getScene(), expectedRevision: state().conflict?.currentRevision }, true)); }
        if (action === 'open-alternative') { await auto().flush(); adopt(await auto().request(auto().projectPath('', id))); data.newShare = null; }
        if (action === 'revoke') { await mutate('/shares/' + encodeURIComponent(id), 'DELETE', {}, true); data.newShare = null; }
        if (action === 'revoke-legacy') await mutate('/shares/revoke-legacy', 'POST', {}, true);
      });
    });
    panel.addEventListener('submit', function (event) {
      event.preventDefault(); var form = event.target; if (!form.reportValidity() || !allowed()) return;
      var fields = Object.fromEntries(new FormData(form));
      run(async function () {
        if (form.dataset.form === 'details') { var saved = await mutate('', 'PATCH', fields); auto().adopt(saved); }
        if (form.dataset.form === 'crew') { if (!staff()) throw new Error('Staff sign-in is required.'); auto().adopt(await mutate('', 'PATCH', fields)); }
        if (form.dataset.form === 'version') await mutate('/revisions', 'POST', { name: fields.name });
        if (form.dataset.form === 'alternative') { adopt(await mutate('/alternatives', 'POST', { name: fields.name })); data.newShare = null; }
        if (form.dataset.form === 'share') { var shared = await mutate('/share', 'POST', { expiresInDays: Number(fields.days) }); data.newShare = shared.url; }
      });
    });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      var focusable = Array.from(panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')).filter(function (el) { return !el.closest('[hidden]'); });
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    panel.querySelector('.rs-project-dialog').focus();
    try { await refresh(); } catch (error) { message = error.message; render(); }
  }
  function dimensionRow(item, catalogs) {
    var product = catalogs.find(function (p) { return [item.tableId, item.chairId, item.inflatableId, item.equipmentId, item.accessoryId, item.productId].includes(p.id) || item.productId && p.productId === item.productId; }) || {};
    return { label: product.name || item.name || item.kind || 'Rental', width: item.modelWidthFt || item.widthFt || product.widthFt, depth: item.modelDepthFt || item.depthFt || product.depthFt || product.lengthFt, height: item.heightFt || product.heightFt, confirmed: product.dimensionsConfirmed === true || item.dimensionsConfirmed === true, x: item.photoPlacement?.x ?? item.x, y: item.photoPlacement?.y ?? item.y };
  }
  function venuePhotoUrl(photo) {
    var value = photo?.url || photo?.path;
    if (typeof value !== 'string' || !value.trim()) return null;
    try { var url = new URL(value.trim(), window.RENTSKETCH_API_URL || location.origin); return /^https?:$/.test(url.protocol) ? url.href : null; }
    catch (_) { return null; }
  }
  function crewHtml(project, options) {
    var b = bridge(), s = b.getScene?.() || {}, tent = (b.TENTS || []).find(function (t) { return t.id === s.tentId; }), lines = b.computeLineItems?.() || [];
    var catalogs = [].concat(b.TABLES || [], b.CHAIRS || [], b.INFLATABLES || [], b.ACCESSORIES || [], b.EQUIPMENT || []), plan = b.getPropertyPlan?.(), checks = b.getChecks?.() || [];
    var dimensions = (s.objects || []).map(function (item) { return dimensionRow(item, catalogs); });
    var risks = checks.map(function (c) { return c.message || c.description; }).filter(Boolean);
    (plan?.tent?.reasons || []).forEach(function (r) { risks.push(r.message); });
    (plan?.rentals || []).forEach(function (r) { (r.result?.reasons || []).forEach(function (reason) { risks.push(reason.message); }); });
    var fmt = function (value) { return value != null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 'Not recorded'; };
    var photo = options?.includePhoto ? venuePhotoUrl(s.backgroundPhoto) : null;
    return '<article class="rs-crew-sheet"><header><p>RENTSKETCH · INSTALLATION PLANNING SHEET</p><h1>' + esc(project.projectName || s.eventName || 'Event layout') + '</h1><p>Revision ' + esc(state().revision || 'Local draft') + ' · Printed ' + esc(date(new Date())) + '</p></header>' +
      '<p class="rs-crew-warning">Planning draft. Confirm booked inventory, manufacturer clearances, utilities, anchoring, weather and actual site measurements before installation.</p>' +
      '<h2>Rental inventory</h2><table><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>' + (lines.length ? lines.map(function (line) { return '<tr><td>' + esc(line.label) + '</td><td>' + esc(line.qty) + '</td></tr>'; }).join('') : '<tr><td colspan="2">No inventory recorded.</td></tr>') + '</tbody></table>' +
      '<h2>Dimensions recorded in this plan</h2>' + (tent ? '<p>' + esc(tent.name) + ': ' + fmt(tent.widthFt) + ' × ' + fmt(tent.lengthFt) + ' ft. Installation clearance modeled: ' + fmt(tent.installationClearanceFt) + ' ft around the tent. ' + (tent.poleLayoutEstimated ? 'Pole positions and clearance are estimated.' : '') + '</p>' : '') +
      '<table><thead><tr><th>Placed rental</th><th>Footprint (ft)</th><th>Height (ft)</th><th>Position X/Y (ft)</th></tr></thead><tbody>' + dimensions.map(function (d) { return '<tr><td>' + esc(d.label) + (d.confirmed ? '' : '<small>Confirm actual dimensions</small>') + '</td><td>' + fmt(d.width) + ' × ' + fmt(d.depth) + '</td><td>' + fmt(d.height) + '</td><td>' + fmt(d.x) + ' / ' + fmt(d.y) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Site and clearance checks</h2><p>' + (plan?.active ? 'Checks use the current traced model; they do not certify real-world fit.' : 'Site fit is unverified. Calibrate measurements, mark boundaries and check obstacles on site.') + '</p><ul>' + Array.from(new Set(risks)).map(function (risk) { return '<li>' + esc(risk) + '</li>'; }).join('') + '<li>Verify underground and overhead utilities before staking or placing tall rentals.</li><li>Confirm electrical supply, water access, delivery path and emergency exits.</li></ul>' +
      '<h2>Site notes</h2><p class="rs-crew-notes">' + esc(project.siteNotes || 'No site notes recorded.') + '</p>' +
      (staff() && project.crewNotes ? '<h2>Private crew notes</h2><p class="rs-crew-notes">' + esc(project.crewNotes) + '</p>' : '') +
      (photo ? '<h2>Venue reference photo</h2><img alt="Uploaded venue reference" src="' + esc(photo) + '"><p>A single photo is a reference view, not a surveyed reconstruction.</p>' : '') + '</article>';
  }
  async function preparePrintImages(print) {
    await Promise.all(Array.from(print.querySelectorAll('img')).map(function (img) {
      return new Promise(function (resolve) {
        var settled = false, timer = setTimeout(function () { finish(false); }, 6000);
        function finish(ok) {
          if (settled) return; settled = true; clearTimeout(timer);
          if (!ok) { var note = document.createElement('p'); note.textContent = 'The venue photo could not be loaded for printing. Open the saved project to view its reference photo.'; img.replaceWith(note); }
          resolve();
        }
        if (img.complete && img.naturalWidth > 0) return finish(true);
        if (typeof img.decode === 'function') img.decode().then(function () { finish(true); }, function () { finish(false); });
        else { img.addEventListener('load', function () { finish(true); }, { once: true }); img.addEventListener('error', function () { finish(false); }, { once: true }); }
      });
    }));
  }
  async function printCrewSheet(options) {
    if (!allowed()) return;
    try {
      var identity = window.RentSketchDashboardSession?.identity?.() || '';
      await auto().flush(); var project = await auto().fetchLatest();
      var existing = document.getElementById('rsCrewPrint'); existing?.remove();
      var print = document.createElement('div'); print.id = 'rsCrewPrint'; print.innerHTML = crewHtml(project, options); document.body.appendChild(print);
      document.body.classList.add('rs-print-crew');
      var clear = function () { document.body.classList.remove('rs-print-crew'); print.remove(); window.removeEventListener('afterprint', clear); };
      await preparePrintImages(print);
      if (!print.isConnected || !allowed() || identity !== (window.RentSketchDashboardSession?.identity?.() || '')) { clear(); return; }
      window.addEventListener('afterprint', clear, { once: true }); window.print();
    } catch (error) { message = error.message; if (!panel) await open(); render(); }
  }
  window.addEventListener('rentsketch:saveStatus', updateStatus);
  window.addEventListener('rentsketch:dashboardSessionChanged', function () { if (panel) close(); document.getElementById('rsCrewPrint')?.remove(); document.body.classList.remove('rs-print-crew'); });
  window.addEventListener('pagehide', close);
  window.RentSketchProjects = { open: open, close: close, share: open, printCrewSheet: printCrewSheet, crewHtml: crewHtml };
})();
