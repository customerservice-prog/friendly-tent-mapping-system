(function () {
  'use strict';
  var session = window.RentSketchDashboardSession;
  var form = document.getElementById('f'), button = document.getElementById('save'), message = document.getElementById('msg');
  function lock() { form.reset(); button.disabled = true; form.querySelectorAll('input').forEach(function (input) { input.disabled = true; }); }
  function show(text, ok) { message.textContent = text; message.className = 'msg ' + (ok ? 'ok' : 'err'); }
  lock();
  session.ready().then(function () {
    if (!session.identity()) { location.replace('/dashboard/#/login'); return; }
    button.disabled = false; form.querySelectorAll('input').forEach(function (input) { input.disabled = false; });
  }).catch(function () { show('Could not check your session. Refresh to try again.', false); });
  window.addEventListener('rentsketch:dashboardSessionChanged', function (event) {
    if (event.detail?.reason === 'signed-in') return;
    lock(); show('Your session changed. Sign in again before changing your password.', false);
  });
  window.addEventListener('pagehide', lock);
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var identity = session.identity();
    if (!identity || button.disabled) return;
    var currentPassword = document.getElementById('current').value;
    var newPassword = document.getElementById('next').value;
    if (newPassword !== document.getElementById('confirm').value) { show('New passwords do not match.', false); return; }
    button.disabled = true;
    try {
      var response = await session.request('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })
      });
      var data = await response.json().catch(function () { return {}; });
      if (session.identity() !== identity) return;
      if (!response.ok) throw new Error(data.error || 'Password change failed');
      session.clear('password-changed', false, identity);
      lock(); show('Password changed. All dashboard sessions have ended. Sign in again to continue.', true);
    } catch (error) { if (session.identity() === identity) show(error.message, false); }
    finally { if (session.identity() === identity) button.disabled = false; }
  });
})();
