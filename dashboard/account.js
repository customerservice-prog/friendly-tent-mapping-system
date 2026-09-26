(function () {
  'use strict';
  var session = window.RentSketchDashboardSession;
  var form = document.getElementById('f'), button = document.getElementById('save'), message = document.getElementById('msg');
  function lock() { form.reset(); button.disabled = true; form.querySelectorAll('input').forEach(function(input){input.disabled=true;}); }
  function show(text, ok) { message.textContent = text; message.className = 'msg ' + (ok ? 'ok' : 'err'); }
  if (!session.getToken()) { lock(); location.replace('/dashboard/#/login'); return; }
  window.addEventListener('rentsketch:dashboardSessionChanged', function (event) {
    if (event.detail?.reason === 'signed-in') return;
    lock(); show('Your session changed. Sign in again before changing your password.', false);
  });
  window.addEventListener('pagehide', lock);
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var token = session.getToken();
    if (!token || button.disabled) return;
    var currentPassword = document.getElementById('current').value;
    var newPassword = document.getElementById('next').value;
    if (newPassword !== document.getElementById('confirm').value) { show('New passwords do not match.', false); return; }
    button.disabled = true;
    try {
      var response = await fetch((window.RENTSKETCH_API_URL || 'https://rentsketch-api-production.up.railway.app') + '/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }), cache: 'no-store'
      });
      var data = await response.json().catch(function () { return {}; });
      if (session.getToken() !== token) return;
      if (!response.ok) throw new Error(data.error || 'Password change failed');
      session.clear('password-changed', false);
      lock(); show('Password changed. All dashboard sessions have ended. Sign in again to continue.', true);
    } catch (error) { if (session.getToken() === token) show(error.message, false); }
    finally { if (session.getToken() === token) button.disabled = false; }
  });
})();
