(function () {
  'use strict';
  var session = window.RentSketchDashboardSession;
  var byId = function (id) { return document.getElementById(id); };
  var mode = '', busy = false, recoveryCodes = [], generation = 0;
  var form = byId('mfa-form'), message = byId('mfa-message'), status = byId('mfa-status');
  function notice(node, text, ok) { node.textContent = text; node.className = 'msg ' + (ok ? 'ok' : 'err'); }
  function resetSensitive() {
    generation++; mode = ''; busy = false; recoveryCodes = [];
    form.reset(); form.hidden = true; byId('mfa-setup').hidden = true;
    byId('mfa-code-wrap').hidden = true; byId('mfa-code').required = false;
    byId('mfa-secret').value = ''; byId('mfa-open-app').removeAttribute('href'); byId('mfa-open-app').hidden = true;
    byId('mfa-recovery-codes').textContent = ''; byId('mfa-recovery').hidden = true;
    message.textContent = ''; message.className = 'msg';
    byId('mfa-copy-secret').textContent = 'Copy'; byId('mfa-copy-codes').textContent = 'Copy codes';
    form.querySelectorAll('button,input').forEach(function (el) { el.disabled = false; });
  }
  function lock() {
    resetSensitive(); byId('mfa-actions').hidden = true; byId('mfa-badge').textContent = 'Sign in required';
    byId('sessions-list').replaceChildren(); byId('sessions-signout-others').hidden = true;
    byId('sessions-refresh').disabled = true;
    byId('security-session-message').textContent = 'Your session has ended. Sign in again to manage account security.';
    byId('security-session-message').hidden = false;
  }
  async function api(path, options) {
    var identity = session.identity();
    if (!identity) throw new Error('Sign in again to continue.');
    var response = await session.request('/api/auth' + path, options);
    var data = await response.json().catch(function () { return {}; });
    if (identity !== session.identity()) { var error = new Error('Your session changed.'); error.sessionChanged = true; throw error; }
    if (!response.ok) throw new Error(data.error || 'Could not update account security. Please try again.');
    return data;
  }
  function post(path, body) { return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  function renderMfa(data) {
    var mfa = data.mfa || {}, enabled = !!mfa.enabled;
    byId('mfa-badge').textContent = enabled ? 'On' : 'Off'; byId('mfa-badge').className = 'badge' + (enabled ? ' enabled' : '');
    status.textContent = enabled ? 'Authenticator verification is on. ' + (Number(mfa.recoveryCodesRemaining) || 0) + ' recovery codes remain.' : 'Two-step verification is optional and is currently off.';
    byId('mfa-enable').hidden = enabled; byId('mfa-replace-codes').hidden = !enabled; byId('mfa-disable').hidden = !enabled;
    byId('mfa-actions').hidden = false;
  }
  function when(value) { var d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable'; }
  async function loadSessions() {
    var data = await api('/sessions'), list = byId('sessions-list'); list.replaceChildren();
    var sessions = Array.isArray(data.sessions) ? data.sessions : [];
    sessions.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'session-row';
      var info = document.createElement('div'), title = document.createElement('strong'); title.textContent = 'Browser session';
      if (item.current) { var badge = document.createElement('span'); badge.className = 'badge enabled'; badge.textContent = 'This session'; title.appendChild(badge); }
      info.appendChild(title);
      ['Signed in ' + when(item.createdAt), 'Last active ' + when(item.lastSeenAt)].forEach(function (text) { var p = document.createElement('p'); p.textContent = text; info.appendChild(p); });
      var button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = 'Sign out';
      button.addEventListener('click', async function () {
        button.disabled = true;
        try {
          var result = await api('/sessions/' + encodeURIComponent(item.id), { method: 'DELETE' });
          if (result.current) { session.clear('signed-out', false); lock(); }
          else { await loadSessions(); notice(byId('sessions-message'), 'That session has been signed out.', true); }
        } catch (error) { if (!error.sessionChanged && session.identity()) notice(byId('sessions-message'), error.message, false); }
        finally { button.disabled = false; }
      });
      row.append(info, button); list.appendChild(row);
    });
    if (!sessions.length) { var empty = document.createElement('p'); empty.className = 'micro'; empty.textContent = 'No active sessions found.'; list.appendChild(empty); }
    byId('sessions-signout-others').hidden = !sessions.some(function (item) { return !item.current; });
  }
  function begin(nextMode) {
    if (!session.identity()) return;
    resetSensitive(); mode = nextMode; byId('mfa-actions').hidden = true; form.hidden = false;
    byId('mfa-form-title').textContent = nextMode === 'enroll' ? 'Set up your authenticator' : nextMode === 'disable' ? 'Turn off two-step verification' : 'Replace your recovery codes';
    byId('mfa-form-help').textContent = nextMode === 'enroll' ? 'Confirm your password, then add the setup key to your authenticator app.' : nextMode === 'disable' ? 'Your next sign-in will use only your password. Confirm your password and a current authenticator or unused recovery code.' : 'Your old recovery codes will stop working. Confirm your password and a current authenticator or unused recovery code.';
    byId('mfa-code-wrap').hidden = nextMode === 'enroll'; byId('mfa-code').required = nextMode !== 'enroll';
    byId('mfa-code').inputMode = 'text'; byId('mfa-code').setAttribute('aria-label', 'Authenticator or recovery code');
    byId('mfa-submit').textContent = nextMode === 'enroll' ? 'Continue' : nextMode === 'disable' ? 'Turn off and sign out' : 'Create new codes';
    byId('mfa-password').focus();
  }
  byId('mfa-enable').addEventListener('click', function () { begin('enroll'); });
  byId('mfa-disable').addEventListener('click', function () { begin('disable'); });
  byId('mfa-replace-codes').addEventListener('click', function () { begin('recovery-codes'); });
  byId('mfa-cancel').addEventListener('click', function () { resetSensitive(); byId('mfa-actions').hidden = !session.identity(); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); if (busy || !mode || !session.identity()) return;
    var activeGeneration = generation, activeIdentity = session.identity(), activeMode = mode;
    busy = true; byId('mfa-submit').disabled = true; byId('mfa-cancel').disabled = true;
    message.textContent = ''; message.className = 'msg';
    try {
      var body = { currentPassword: byId('mfa-password').value, code: byId('mfa-code').value.trim() };
      var data = await post('/security/mfa/' + activeMode, body);
      if (activeGeneration !== generation || activeIdentity !== session.identity()) return;
      if (activeMode === 'enroll') {
        mode = 'confirm'; byId('mfa-setup').hidden = false; byId('mfa-secret').value = data.secret || '';
        var link = byId('mfa-open-app');
        if (/^otpauth:\/\/totp\//.test(data.otpauthUri || '')) { link.href = data.otpauthUri; link.hidden = false; }
        byId('mfa-code-wrap').hidden = false; byId('mfa-code').required = true; byId('mfa-code').inputMode = 'numeric';
        byId('mfa-code').setAttribute('aria-label', 'Six-digit authenticator code');
        byId('mfa-code-help').textContent = 'Enter the six-digit code shown in your authenticator to finish setup.';
        byId('mfa-submit').textContent = 'Turn on and get recovery codes'; byId('mfa-code').focus();
      } else {
        // The server revoked all sessions. Deliberately clear local private UI
        // before presenting this one-time result; unrelated session changes erase it.
        session.clear('security-updated', false, activeIdentity); resetSensitive();
        byId('mfa-actions').hidden = true; byId('mfa-badge').textContent = activeMode === 'disable' ? 'Off' : 'On';
        byId('security-session-message').textContent = 'Security settings updated. All dashboard sessions have ended. Sign in again to continue.';
        byId('security-session-message').hidden = false;
        if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length) {
          recoveryCodes = data.recoveryCodes.filter(function (code) { return typeof code === 'string'; });
          byId('mfa-recovery-codes').textContent = recoveryCodes.join('\n'); byId('mfa-recovery').hidden = false; byId('mfa-recovery').focus();
          status.textContent = 'Two-step verification is on. Save your new recovery codes below.';
        } else { status.textContent = 'Two-step verification is off. Sign in again to continue.'; }
      }
    } catch (error) { if (activeGeneration === generation && session.identity() === activeIdentity && !error.sessionChanged) notice(message, error.message, false); }
    finally { if (activeGeneration === generation) { busy = false; byId('mfa-submit').disabled = false; byId('mfa-cancel').disabled = false; } }
  });
  async function copy(text, button) {
    try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; }
    catch (_) { button.textContent = 'Select and copy manually'; }
  }
  byId('mfa-copy-secret').addEventListener('click', function () { copy(byId('mfa-secret').value, this); });
  byId('mfa-copy-codes').addEventListener('click', function () { if (recoveryCodes.length) copy(recoveryCodes.join('\n'), this); });
  byId('mfa-download-codes').addEventListener('click', function () {
    if (!recoveryCodes.length) return;
    var blob = new Blob(['RentSketch one-time recovery codes\nKeep these private. Each code can be used once.\n\n' + recoveryCodes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'rentsketch-recovery-codes.txt';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  byId('mfa-finish').addEventListener('click', resetSensitive);
  byId('sessions-refresh').addEventListener('click', function () { loadSessions().catch(function (error) { if (!error.sessionChanged && session.identity()) notice(byId('sessions-message'), error.message, false); }); });
  byId('sessions-signout-others').addEventListener('click', async function () {
    var button = this; button.disabled = true;
    try { await post('/sessions/revoke-others'); await loadSessions(); notice(byId('sessions-message'), 'Other sessions have been signed out.', true); }
    catch (error) { if (!error.sessionChanged && session.identity()) notice(byId('sessions-message'), error.message, false); }
    finally { button.disabled = false; }
  });
  window.addEventListener('rentsketch:dashboardSessionChanged', function (event) { if (event.detail?.reason !== 'signed-in') lock(); });
  window.addEventListener('pagehide', lock);
  session.ready().then(async function () {
    if (!session.identity()) { lock(); return; }
    byId('sessions-refresh').disabled = false;
    await Promise.all([
      api('/security').then(renderMfa).catch(function (error) { if (!error.sessionChanged && session.identity()) status.textContent = error.message; }),
      loadSessions().catch(function (error) { if (!error.sessionChanged && session.identity()) notice(byId('sessions-message'), error.message, false); })
    ]);
  }).catch(function () { lock(); });
})();
