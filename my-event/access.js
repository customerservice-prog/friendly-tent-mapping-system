(function () {
  'use strict';
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
    document.querySelector('.intro').textContent = 'Enter your first name and order number. We’ll find your booking and email your private link. No design fee.';
    document.getElementById('orderNumber').value = (query.get('order') || '').slice(0,80);
  }
  var orderForm = document.getElementById('orderAccessForm');
  orderForm.addEventListener('submit', async function (event) {
    event.preventDefault(); var submit = orderForm.querySelector('button'), message = document.getElementById('orderAccessStatus');
    if (submit.disabled || !orderForm.reportValidity()) return;
    submit.disabled = true; submit.textContent = 'Checking your booking…'; message.textContent = '';
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 45000);
    try {
      var response = await fetch('https://rentsketch-api-production.up.railway.app/api/consumer/order-access/request', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, signal: controller.signal,
        body: JSON.stringify({ orderNumber: document.getElementById('orderNumber').value.trim(), firstName: document.getElementById('orderFirstName').value.trim() }),
      });
      var result = await response.json(); if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
      message.textContent = 'If these details match a qualifying Friendly booking, we’ll send its private access link to the email already on your order. Check that inbox and spam folder. No payment is needed to request the link.';
      submit.textContent = 'Link requested';
      setTimeout(function () { submit.disabled = false; submit.textContent = 'Send my access link again'; }, 60000);
    } catch (error) { message.textContent = error.name === 'AbortError' ? 'The booking check took too long. Please try again shortly.' : error.message; submit.disabled = false; submit.textContent = 'Find my booking & send access'; }
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
      status.className = 'error'; status.textContent = error.name === 'AbortError' ? 'The request took too long. Please try again shortly.' : error.message;
      button.disabled = false; button.textContent = 'Email my event link';
    } finally { clearTimeout(timer); }
  });
})();
