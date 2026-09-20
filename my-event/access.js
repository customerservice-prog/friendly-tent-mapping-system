(function () {
  'use strict';
  var tenant = new URLSearchParams(location.search).get('tenant');
  if (!['friendly', 'generic'].includes(tenant)) tenant = null;
  document.querySelectorAll('[data-preview]').forEach(function (link) { link.href = '/designer/' + (tenant ? '?tenant=' + encodeURIComponent(tenant) : ''); });
  var form = document.getElementById('accessForm'), status = document.getElementById('accessStatus'), button = form.querySelector('button');
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); if (button.disabled || !form.reportValidity()) return;
    button.disabled = true; button.textContent = 'Requesting your link…'; status.textContent = ''; status.className = '';
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 25000);
    try {
      var response = await fetch('https://rentsketch-api-production.up.railway.app/api/consumer/designs/recovery-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ email: document.getElementById('accessEmail').value.trim(), tenant: tenant }),
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Please try again in a moment.');
      status.textContent = 'If a paid event matches this email, its private link will arrive shortly. Check your inbox and spam folder.';
      button.textContent = 'Link requested';
      setTimeout(function () { button.disabled = false; button.textContent = 'Email my event link again'; }, 60000);
    } catch (error) {
      status.className = 'error'; status.textContent = error.name === 'AbortError' ? 'The request took too long. Please try again shortly.' : error.message;
      button.disabled = false; button.textContent = 'Email my event link';
    } finally { clearTimeout(timer); }
  });
})();
