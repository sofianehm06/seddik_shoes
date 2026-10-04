document.addEventListener('click', function (e) {
  var row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a, button')) window.location.href = row.dataset.href;
});
document.addEventListener('submit', function (e) {
  var msg = (e.submitter && e.submitter.dataset.confirm) || e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});

// Fiche produit : commission proposée selon le fournisseur + aperçu du calcul.
(function () {
  var form = document.querySelector('[data-commission]');
  if (!form) return;
  var f = form.closest('form');
  var supplier = f.querySelector('[data-supplier]');
  var preview = f.querySelector('[data-commission-preview]');
  function money(n) { return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' DA'; }
  function update() {
    var hasSupplier = !!supplier.value;
    form.hidden = !hasSupplier;
    var price = Number(f.elements.price.value) || 0;
    var value = Number(f.elements.commission_value.value) || 0;
    var c = f.elements.commission_type.value === 'fixed' ? Math.min(value, price) : Math.round(price * value / 100);
    preview.textContent = price ? 'Sur ' + money(price) + ' : tu gagnes ' + money(c) + ', le fournisseur reçoit ' + money(price - c) + '.' : '';
  }
  supplier.addEventListener('change', function () {
    var opt = supplier.selectedOptions[0];
    if (opt && opt.dataset.type) {
      f.elements.commission_type.value = opt.dataset.type;
      f.elements.commission_value.value = opt.dataset.value;
    }
    update();
  });
  f.addEventListener('input', update);
  update();
})();

// Commande : "livrée par moi" implique en général "encaissé par moi".
(function () {
  var f = document.querySelector('[data-handling]');
  if (!f) return;
  f.elements.delivered_by.addEventListener('change', function () { f.elements.collected_by.value = f.elements.delivered_by.value; });
})();
