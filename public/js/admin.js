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

// Menu de l'admin sur téléphone.
(function () {
  var toggle = document.querySelector('[data-admin-menu-toggle]');
  if (!toggle) return;
  toggle.addEventListener('click', function () {
    var open = document.querySelector('[data-admin-menu]').classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = open ? '✕' : '☰';
  });
})();

// Photos : redimensionnées dans le navigateur avant l'envoi (photos de téléphone souvent > 5 Mo).
(function () {
  var input = document.querySelector('input[type=file][name=images]');
  if (!input || typeof DataTransfer === 'undefined') return;
  var MAX = 1600;
  var hint = document.createElement('small');
  input.insertAdjacentElement('afterend', hint);
  function resize(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type)) return resolve(null);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1.5 * 1024 * 1024 && /jpeg|png|webp/.test(file.type)) { URL.revokeObjectURL(url); return resolve(file); }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call(input.files);
    if (!files.length) return;
    hint.textContent = 'Préparation des photos…';
    Promise.all(files.map(resize)).then(function (out) {
      var dt = new DataTransfer();
      var skipped = 0;
      out.forEach(function (f) { if (f) dt.items.add(f); else skipped++; });
      input.files = dt.files;
      hint.textContent = dt.files.length + ' photo(s) prête(s)' + (skipped ? ' — ' + skipped + ' fichier(s) ignoré(s) (format non reconnu)' : '') + '.';
    });
  });
})();
