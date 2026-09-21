(function () {
  'use strict';
  function connectionMessage(error, fallback) {
    if (error.name === 'AbortError') return 'The connection took too long. Please try again. Your order has not been changed.';
    if (error instanceof TypeError || error instanceof SyntaxError) return fallback;
    return error.message || fallback;
  }
  var tenant = new URLSearchParams(location.search).get('tenant');
  if (!['friendly', 'generic'].includes(tenant)) tenant = null;
  var query = new URLSearchParams(location.search);
  var orderPanel = document.getElementById('orderAccess');
  if (query.get('mode') === 'order') {
    document.body.classList.add('order-access-page');
    orderPanel.open = true;
    document.getElementById('paidAccess').hidden = true;
    document.getElementById('paidAccessLink').hidden = false;
    document.querySelector('h1').textContent = 'Design your booked event.';
    document.querySelector('.eyebrow').textContent = 'Included with Friendly';
    document.querySelector('.intro').textContent = 'Enter your first name and order number to open your included event designer.';
    document.querySelector('.details strong').textContent = 'Open here. No email or code needed.';
    document.querySelector('.details p').textContent = 'We check your active booking and open its event layout immediately. Use the same name and order number to return on another device.';
    document.getElementById('emailHelp').hidden = true;
    document.getElementById('orderNumber').value = (query.get('order') || '').slice(0,80);
  }
  var orderForm = document.getElementById('orderAccessForm');
  orderForm.addEventListener('submit', async function (event) {
    event.preventDefault(); var submit = orderForm.querySelector('button'), message = document.getElementById('orderAccessStatus');
    if (submit.disabled || !orderForm.reportValidity()) return;
    submit.disabled = true; submit.textContent = 'Checking your booking…'; message.textContent = ''; message.className = '';
    var continueLink = document.getElementById('orderContinue'); continueLink.hidden = true;
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 45000);
    try {
      var response = await fetch('https://rentsketch-api-production.up.railway.app/api/consumer/order-access/request', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, signal: controller.signal,
        body: JSON.stringify({ orderNumber: document.getElementById('orderNumber').value.trim(), firstName: document.getElementById('orderFirstName').value.trim() }),
      });
      var result = await response.json(); if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
      var destination;
      try { destination = new URL(result.accessUrl); } catch (_) {}
      if (!destination || destination.origin !== 'https://rentsketch.com' || destination.pathname !== '/designer/' || destination.searchParams.get('tenant') !== 'friendly' || !new URLSearchParams(destination.hash.slice(1)).get('recoveryToken')) throw new Error('Your event could not be opened. Please try again.');
      message.textContent = 'Booking verified. Opening your event…';
      submit.textContent = 'Opening your event…';
      continueLink.href = destination.href; continueLink.hidden = false;
      location.assign(destination.href);
    } catch (error) { message.className = 'error'; message.textContent = connectionMessage(error, 'We couldn’t check your booking right now. Please try again. Your order has not been changed.'); submit.disabled = false; submit.textContent = 'Open my event'; }
    finally { clearTimeout(timer); }
  });
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
      status.textContent = 'If a saved event matches this email, its private link will arrive shortly. Check your inbox and spam folder.';
      button.textContent = 'Link requested';
      setTimeout(function () { button.disabled = false; button.textContent = 'Email my event link again'; }, 60000);
    } catch (error) {
      status.className = 'error'; status.textContent = connectionMessage(error, 'We couldn’t request your link right now. Please try again.');
      button.disabled = false; button.textContent = 'Email my event link';
    } finally { clearTimeout(timer); }
  });
})();
