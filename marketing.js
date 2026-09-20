(function () {
  'use strict';
  var menu = document.querySelector('.menu-toggle');
  var links = document.getElementById('navlinks');
  function closeMenu() { links.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', function () {
    var open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open)); links.classList.toggle('open', open);
  });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  var annual = false;
  function renderPrices() {
    document.querySelectorAll('[data-monthly]').forEach(function (node) {
      node.textContent = '$' + Number(node.dataset[annual ? 'annual' : 'monthly']).toLocaleString('en-US');
      node.closest('.price-card').querySelector('[data-period]').textContent = annual ? '/year' : '/month';
      node.closest('.price-card').querySelector('[data-annual-note]').textContent = annual ? 'Billed yearly. Renews annually until canceled.' : '$' + Number(node.dataset.annual).toLocaleString('en-US') + ' billed yearly if you choose annual';
    });
  }
  document.querySelectorAll('[data-billing]').forEach(function (button) {
    button.addEventListener('click', function () {
      annual = button.dataset.billing === 'annual';
      document.querySelectorAll('[data-billing]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
      renderPrices();
    });
  });
  // The page remains useful without JavaScript or API availability. Hydrate
  // the visible catalog from the same amounts the checkout server validates.
  if (document.querySelector('[data-monthly]')) {
    fetch('https://rentsketch-api-production.up.railway.app/api/business/plans')
      .then(function (r) { if (!r.ok) throw Error('Catalog unavailable'); return r.json(); })
      .then(function (data) {
        (data.plans || []).forEach(function (plan) {
          var node = document.querySelector('[data-plan="' + plan.id + '"] [data-monthly]');
          if (node && Number.isFinite(plan.monthlyCents) && Number.isFinite(plan.annualCents)) {
            node.dataset.monthly = String(plan.monthlyCents / 100); node.dataset.annual = String(plan.annualCents / 100);
          }
        }); renderPrices();
      }).catch(function () {});
  }
})();
