(function () {
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var money = function (n) { return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' DA'; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // Menu mobile et filtres
  var toggle = $('[data-menu-toggle]');
  if (toggle) toggle.addEventListener('click', function () {
    var open = $('[data-menu]').classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  var filtersToggle = $('[data-filters-toggle]');
  if (filtersToggle) filtersToggle.addEventListener('click', function () { $('[data-filters]').classList.toggle('open'); });

  // Galerie produit
  $$('[data-gallery-thumb]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $('[data-gallery-main]').src = btn.dataset.galleryThumb;
      $$('[data-gallery-thumb]').forEach(function (b) { b.classList.toggle('active', b === btn); });
    });
  });

  // Ajout au panier
  var buy = $('[data-add-to-cart]');
  if (buy) {
    var hint = $('[data-stock-hint]', buy);
    var qtyInput = buy.elements.qty;
    $$('input[name=size]', buy).forEach(function (r) {
      r.addEventListener('change', function () {
        var stock = Number(r.dataset.stock);
        qtyInput.max = Math.min(10, stock);
        if (Number(qtyInput.value) > stock) qtyInput.value = stock;
        hint.textContent = r.dataset.known === '1' && stock <= 2 ? 'Plus que ' + stock + ' paire(s) disponible(s) !' : 'Disponible';
      });
    });
    buy.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('[data-cart-msg]', buy);
      var size = buy.querySelector('input[name=size]:checked');
      if (!size) { msg.textContent = 'Choisissez votre pointure.'; msg.className = 'form-msg error'; return; }
      var qty = Math.max(1, Math.min(Number(qtyInput.value) || 1, Number(size.dataset.stock)));
      var already = Cart.read().filter(function (i) { return i.productId === Number(buy.dataset.productId) && i.size === size.value; })
        .reduce(function (n, i) { return n + i.qty; }, 0);
      if (already + qty > Number(size.dataset.stock)) {
        msg.textContent = 'Stock insuffisant : vous avez déjà ' + already + ' paire(s) dans le panier.';
        msg.className = 'form-msg error';
        return;
      }
      Cart.add(Number(buy.dataset.productId), size.value, qty);
      msg.innerHTML = 'Ajouté au panier ✔ <a href="/panier">Voir le panier</a> · <a href="/commande">Commander</a>';
      msg.className = 'form-msg ok';
    });
  }

  // Page panier
  var cartPage = $('[data-cart-page]');
  function renderCart() {
    Cart.refresh().then(function (data) {
      if (!data.items.length) {
        cartPage.innerHTML = '<div class="empty"><p>Votre panier est vide.</p><a class="btn btn-primary" href="/boutique">Découvrir nos produits</a></div>';
        return;
      }
      var subtotal = 0;
      var rows = data.items.map(function (i) {
        subtotal += i.price * i.qty;
        return '<div class="cart-line">' +
          '<a href="' + esc(i.url) + '"><img src="' + esc(i.image) + '" alt=""></a>' +
          '<div class="cart-line-info"><a href="' + esc(i.url) + '"><strong>' + esc(i.name) + '</strong></a><span class="muted">Pointure ' + esc(i.size) + '</span><span>' + money(i.price) + '</span></div>' +
          '<div class="cart-line-qty"><button data-dec="' + i.productId + '|' + esc(i.size) + '" aria-label="Moins">−</button><span>' + i.qty + '</span>' +
          '<button data-inc="' + i.productId + '|' + esc(i.size) + '" ' + (i.qty >= i.stock ? 'disabled' : '') + ' aria-label="Plus">+</button></div>' +
          '<strong class="cart-line-total">' + money(i.price * i.qty) + '</strong>' +
          '<button class="cart-line-remove" data-remove="' + i.productId + '|' + esc(i.size) + '" aria-label="Retirer">✕</button>' +
          '</div>';
      }).join('');
      cartPage.innerHTML = '<div class="panel">' + rows + '</div>' +
        '<div class="cart-footer"><div>Sous-total : <strong>' + money(subtotal) + '</strong><br><span class="muted small">Frais de livraison calculés à l\'étape suivante</span></div>' +
        '<a class="btn btn-primary btn-lg" href="/commande">Commander</a></div>';
    });
  }
  if (cartPage) {
    cartPage.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var key = btn.dataset.inc || btn.dataset.dec || btn.dataset.remove;
      if (!key) return;
      var parts = key.split('|');
      var id = Number(parts[0]), size = parts[1];
      var line = Cart.read().find(function (i) { return i.productId === id && i.size === size; });
      if (!line) return;
      Cart.setQty(id, size, btn.dataset.remove ? 0 : line.qty + (btn.dataset.inc ? 1 : -1));
      renderCart();
    });
    renderCart();
  }

  // Page commande
  var form = $('[data-checkout]');
  if (form) {
    var items = [];
    var subtotal = 0;
    var D = window.DELIVERY;
    var fee = function () {
      var mode = form.elements.deliveryMode.value;
      if (mode === 'boutique') return 0;
      if (D.freeAbove && subtotal >= D.freeAbove) return 0;
      var wilaya = form.elements.wilaya.value;
      if (!wilaya) return null;
      var o = D.overrides[wilaya] || {};
      return mode === 'stopdesk' ? (o.desk != null ? o.desk : D.deskFee) : (o.home != null ? o.home : D.homeFee);
    };
    var updateTotals = function () {
      var mode = form.elements.deliveryMode.value;
      $$('[data-when]', form).forEach(function (el) { el.hidden = el.dataset.when.split(' ').indexOf(mode) < 0; });
      var f = fee();
      $('[data-subtotal]').textContent = money(subtotal);
      $('[data-fee]').textContent = f === null ? 'Choisissez la wilaya' : f === 0 ? 'Gratuite' : money(f);
      $('[data-total]').textContent = money(subtotal + (f || 0));
    };
    form.addEventListener('change', updateTotals);
    Cart.refresh().then(function (data) {
      items = data.items;
      if (!items.length) { window.location.href = '/panier'; return; }
      subtotal = items.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
      $('[data-summary]').innerHTML = items.map(function (i) {
        return '<div class="summary-line"><img src="' + esc(i.image) + '" alt=""><div><strong>' + esc(i.name) + '</strong><span class="muted small">Pointure ' + esc(i.size) + ' × ' + i.qty + '</span></div><span>' + money(i.price * i.qty) + '</span></div>';
      }).join('');
      updateTotals();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errorsBox = $('[data-errors]');
      var submit = $('[data-submit]');
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function (v, k) { payload[k] = v; });
      payload.items = Cart.read();
      submit.disabled = true;
      submit.textContent = 'Envoi en cours…';
      fetch('/api/commande', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (res.ok) { Cart.clear(); window.location.href = res.data.redirect; return; }
          errorsBox.innerHTML = (res.data.errors || ['Erreur inconnue.']).map(function (m) { return '<div>' + esc(m) + '</div>'; }).join('');
          errorsBox.hidden = false;
          errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(function () {
          errorsBox.innerHTML = '<div>Connexion impossible. Vérifiez votre internet et réessayez.</div>';
          errorsBox.hidden = false;
        })
        .finally(function () { submit.disabled = false; submit.textContent = 'Confirmer la commande'; });
    });
  }
})();
