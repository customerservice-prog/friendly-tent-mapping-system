(function () {
  'use strict';
  var form = document.getElementById('business-signup');
  var error = document.getElementById('signup-error');
  var requested = new URLSearchParams(location.search).get('plan');
  if (['starter', 'pro', 'commerce'].includes(requested)) form.elements.plan.value = requested;
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); error.hidden = true;
    if (!form.reportValidity()) return;
    var button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true; button.textContent = 'Creating your workspace…';
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var response = await window.RentSketchDashboardSession.request('/api/business/signup', {
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({businessName:form.elements.businessName.value.trim(),contactEmail:form.elements.contactEmail.value.trim(),password:form.elements.password.value,plan:form.elements.plan.value})
      });
      var data = await response.json();
      if (!response.ok) throw Error(data.error || 'Your workspace could not be created. Please try again.');
      try {
        window.RentSketchDashboardSession.accept(data.session);
        localStorage.setItem('rentsketch_dashboard_tenant',data.tenant.slug);
      } catch (_) {
        // Account creation succeeded even if browser storage is unavailable.
        // Offer sign-in rather than prompting a duplicate signup.
        document.querySelector('#signup-success p').textContent = 'Your account was created. This browser could not keep you signed in. Open the dashboard and log in with the email and password you just chose.';
      }
      if (window.RentSketchAnalytics && typeof window.RentSketchAnalytics.track === 'function') {
        window.RentSketchAnalytics.track('sign_up', { method: 'business_trial', plan: form.elements.plan.value });
      } else if (typeof window.gtag === 'function') {
        window.gtag('event', 'sign_up', { method: 'business_trial', plan: form.elements.plan.value });
      }
      form.hidden=true; form.elements.password.value='';
      document.getElementById('signup-success').hidden=false;
      document.querySelector('#signup-success a').focus();
    } catch (err) {
      error.textContent = err.name === 'AbortError' ? 'The request took too long. Your account may have been created. Try logging in before signing up again.' : err.message;
      error.hidden=false; button.disabled=false; button.textContent='Create my free workspace ↗';
    } finally { clearTimeout(timeout); }
  });
})();
