(function () {
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var money = function (n) { return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' DA'; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var svg = function (d, w) { return '<svg class="icon" viewBox="0 0 24 24" width="' + (w || 18) + '" height="' + (w || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICON = {
    minus: svg('<path d="M5 12h14"/>'),
    plus: svg('<path d="M5 12h14M12 5v14"/>'),
    trash: svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 20),
    bag: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>', 56),
    arrow: svg('<path d="M5 12h14M12 5l7 7-7 7"/>')
  };

  /* ---------- En-tête : ombre au défilement ---------- */
  var header = $('[data-header]');
  var onScroll = function () { if (header) header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Recherche ---------- */
  var searchBtn = $('[data-search-toggle]');
  var searchPanel = $('[data-search-panel]');
  if (searchBtn && searchPanel) {
    searchBtn.addEventListener('click', function () {
      var open = searchPanel.classList.toggle('open');
      if (open) setTimeout(function () { $('input', searchPanel).focus(); }, 150);
    });
    document.addEventListener('click', function (e) {
      if (searchPanel.classList.contains('open') && !searchPanel.contains(e.target) && !searchBtn.contains(e.target)) searchPanel.classList.remove('open');
    });
  }

  /* ---------- Tiroirs (menu, panier, filtres) ---------- */
  var overlay = $('[data-overlay]');
  var openPanel = null;
  function openDrawer(el) {
    if (!el) return;
    closeDrawer();
    el.classList.add('open');
    overlay.classList.add('open');
    document.body.classList.add('no-scroll');
    openPanel = el;
  }
  function closeDrawer() {
    if (!openPanel) return;
    openPanel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    openPanel = null;
  }
  $$('[data-open]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var name = btn.dataset.open;
      if (name === 'cart' && /^\/(panier|commande)/.test(location.pathname)) return; // déjà sur la page panier
      e.preventDefault();
      if (name === 'cart') renderMiniCart();
      openDrawer($('[data-drawer="' + name + '"]'));
    });
  });
  if (overlay) overlay.addEventListener('click', closeDrawer);
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeDrawer); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); if (searchPanel) searchPanel.classList.remove('open'); }
  });
  var filtersToggle = $('[data-filters-toggle]');
  if (filtersToggle) filtersToggle.addEventListener('click', function () { openDrawer($('[data-filters]')); });
  $$('[data-filters-close]').forEach(function (b) { b.addEventListener('click', closeDrawer); });
  $$('[data-autosubmit]').forEach(function (el) { el.addEventListener('change', function () { el.form.submit(); }); });

  /* ---------- Notifications ---------- */
  function toast(html) {
    var zone = $('[data-toasts]');
    if (!zone) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = ICON.check + '<span>' + html + '</span>';
    zone.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 2600);
  }

  /* ---------- Apparition au défilement ---------- */
  var revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Compteurs animés ---------- */
  $$('[data-count]').forEach(function (el) {
    if (reduceMotion) return;
    var target = Number(el.dataset.count), suffix = el.dataset.suffix || '', start = null;
    el.textContent = '0' + suffix;
    var step = function (ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / 1600);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    setTimeout(function () { requestAnimationFrame(step); }, 500);
  });

  /* ---------- Vitrine du héros ---------- */
  var showcase = $('[data-showcase]');
  if (showcase) {
    var slides = $$('.slide', showcase), dots = $$('.showcase-dots button', showcase), idx = 0, timer;
    var show = function (i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('active', k === idx); s.tabIndex = k === idx ? 0 : -1; });
      dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
    };
    var play = function () { clearInterval(timer); if (slides.length > 1 && !reduceMotion) timer = setInterval(function () { show(idx + 1); }, 4200); };
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); play(); }); });
    showcase.addEventListener('mouseenter', function () { clearInterval(timer); });
    showcase.addEventListener('mouseleave', play);
    play();
  }

  /* ---------- Carrousels horizontaux ---------- */
  $$('[data-rail]').forEach(function (rail) {
    var section = rail.closest('section');
    var prev = $('[data-rail-prev]', section), next = $('[data-rail-next]', section);
    var update = function () {
      if (prev) prev.disabled = rail.scrollLeft < 8;
      if (next) next.disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 8;
    };
    var by = function (dir) { rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: 'smooth' }); };
    if (prev) prev.addEventListener('click', function () { by(-1); });
    if (next) next.addEventListener('click', function () { by(1); });
    rail.addEventListener('scroll', update, { passive: true });
    update();
  });

  /* ---------- Galerie produit : miniatures + zoom ---------- */
  $$('[data-gallery-thumb]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var main = $('[data-gallery-main]');
      main.style.opacity = 0;
      setTimeout(function () { main.src = btn.dataset.galleryThumb; main.style.opacity = 1; }, 150);
      $$('[data-gallery-thumb]').forEach(function (b) { b.classList.toggle('active', b === btn); });
    });
  });
  var zoom = $('[data-zoom]');
  if (zoom && window.matchMedia('(hover: hover)').matches) {
    var zimg = $('img', zoom);
    zoom.addEventListener('mousemove', function (e) {
      var r = zoom.getBoundingClientRect();
      zimg.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
    });
    zoom.addEventListener('mouseenter', function () { zoom.classList.add('zooming'); });
    zoom.addEventListener('mouseleave', function () { zoom.classList.remove('zooming'); });
  }

  /* ---------- Ajout au panier ---------- */
  var buy = $('[data-add-to-cart]');
  if (buy) {
    var hint = $('[data-stock-hint]', buy);
    var qtyInput = buy.elements.qty;
    var msg = $('[data-cart-msg]', buy);
    var wa = $('[data-wa-order]', buy);
    var selected = function () { return buy.querySelector('input[name=size]:checked'); };
    var maxQty = function () { var s = selected(); return s ? Math.min(10, Number(s.dataset.stock)) : 10; };
    var updateWa = function () {
      if (!wa) return;
      var s = selected();
      var text = wa.dataset.waBase + (s ? ', pointure ' + s.value : '') + ', quantité ' + (qtyInput.value || 1) + '.';
      wa.href = wa.href.split('?')[0] + '?text=' + encodeURIComponent(text);
    };
    $$('input[name=size]', buy).forEach(function (r) {
      r.addEventListener('change', function () {
        var stock = Number(r.dataset.stock);
        qtyInput.max = Math.min(10, stock);
        if (Number(qtyInput.value) > stock) qtyInput.value = stock;
        hint.textContent = r.dataset.known === '1' && stock <= 2 ? 'Vite ! Plus que ' + stock + ' paire(s) dans cette pointure.' : 'Disponible — expédié sous 24 à 48 h';
        msg.textContent = '';
        updateWa();
      });
    });
    $$('[data-qty]', buy).forEach(function (b) {
      b.addEventListener('click', function () {
        qtyInput.value = Math.max(1, Math.min(maxQty(), (Number(qtyInput.value) || 1) + Number(b.dataset.qty)));
        updateWa();
      });
    });
    qtyInput.addEventListener('change', updateWa);
    if (wa) wa.addEventListener('click', function (e) {
      if (!selected()) { e.preventDefault(); msg.textContent = 'Choisissez d\'abord votre pointure.'; msg.className = 'form-msg error'; }
    });
    updateWa();
    buy.addEventListener('submit', function (e) {
      e.preventDefault();
      var size = selected();
      if (!size) {
        msg.textContent = 'Choisissez votre pointure.';
        msg.className = 'form-msg error';
        $('.sizes', buy).animate && $('.sizes', buy).animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 320 });
        return;
      }
      var id = Number(buy.dataset.productId);
      var qty = Math.max(1, Math.min(Number(qtyInput.value) || 1, Number(size.dataset.stock)));
      var already = Cart.read().filter(function (i) { return i.productId === id && i.size === size.value; }).reduce(function (n, i) { return n + i.qty; }, 0);
      if (already + qty > Number(size.dataset.stock)) {
        msg.textContent = 'Stock insuffisant : vous avez déjà ' + already + ' paire(s) dans le panier.';
        msg.className = 'form-msg error';
        return;
      }
      Cart.add(id, size.value, qty);
      msg.textContent = '';
      toast('<b>' + esc(buy.dataset.productName) + '</b> ajouté au panier');
      setTimeout(function () { renderMiniCart(); openDrawer($('[data-drawer="cart"]')); }, 250);
    });

    // Barre d'achat fixe sur mobile quand le formulaire n'est plus visible
    var sticky = $('[data-sticky-buy]');
    if (sticky && 'IntersectionObserver' in window) {
      document.body.classList.add('has-sticky');
      new IntersectionObserver(function (en) { sticky.classList.toggle('show', !en[0].isIntersecting); }).observe(buy);
      $('[data-sticky-btn]', sticky).addEventListener('click', function () {
        if (selected()) buy.requestSubmit ? buy.requestSubmit() : buy.dispatchEvent(new Event('submit', { cancelable: true }));
        else { buy.scrollIntoView({ behavior: 'smooth', block: 'center' }); msg.textContent = 'Choisissez votre pointure.'; msg.className = 'form-msg error'; }
      });
    }
  }

  /* ---------- Mini-panier (tiroir) ---------- */
  var mini = $('[data-mini-cart]');
  var miniFoot = $('[data-mini-foot]');
  function freeShipHtml(subtotal) {
    var limit = window.SHOP && window.SHOP.freeAbove;
    if (!limit) return '';
    var left = limit - subtotal;
    var pct = Math.min(100, Math.round(subtotal / limit * 100));
    return '<div class="free-ship">' + (left > 0 ? 'Plus que <b>' + money(left) + '</b> pour la livraison offerte 🚚' : '🎉 <b>Bravo !</b> La livraison vous est offerte.') +
      '<div class="bar"><span style="width:' + pct + '%"></span></div></div>';
  }
  function renderMiniCart() {
    if (!mini) return;
    if (!Cart.read().length) {
      mini.innerHTML = '<div class="empty-state">' + ICON.bag + '<h3>Votre panier est vide</h3><p class="muted">Découvrez nos nouveautés et trouvez la paire parfaite.</p><a class="btn btn-primary" href="/boutique">Voir la boutique</a></div>';
      miniFoot.hidden = true;
      return;
    }
    Cart.refresh().then(function (data) {
      if (!data.items.length) return renderMiniCart();
      var subtotal = 0;
      mini.innerHTML = data.items.map(function (i, k) {
        subtotal += i.price * i.qty;
        var key = i.productId + '|' + esc(i.size);
        return '<div class="mini-line" style="animation-delay:' + (k * 0.05) + 's">' +
          '<a href="' + esc(i.url) + '"><img src="' + esc(i.image) + '" alt=""></a>' +
          '<div><a href="' + esc(i.url) + '"><strong>' + esc(i.name) + '</strong></a><span class="muted small">Pointure ' + esc(i.size) + ' · ' + money(i.price) + '</span>' +
          '<div class="qty-stepper"><button data-dec="' + key + '" aria-label="Moins">' + ICON.minus + '</button><span>' + i.qty + '</span><button data-inc="' + key + '" ' + (i.qty >= i.stock ? 'disabled' : '') + ' aria-label="Plus">' + ICON.plus + '</button></div></div>' +
          '<button class="mini-remove" data-remove="' + key + '" aria-label="Retirer">' + ICON.trash + '</button></div>';
      }).join('');
      miniFoot.hidden = false;
      miniFoot.innerHTML = freeShipHtml(subtotal) +
        '<div class="mini-total"><span>Sous-total</span><strong>' + money(subtotal) + '</strong></div>' +
        '<div class="drawer-actions"><a class="btn btn-accent btn-lg btn-block" href="/commande">Commander ' + ICON.arrow + '</a><a class="btn btn-ghost btn-block" href="/panier">Voir le panier</a></div>' +
        '<p class="trust-line">' + svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>') + 'Paiement à la livraison</p>';
    });
  }
  function cartAction(e, after) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var key = btn.dataset.inc || btn.dataset.dec || btn.dataset.remove;
    if (!key) return;
    var parts = key.split('|'), id = Number(parts[0]), size = parts[1];
    var line = Cart.read().find(function (i) { return i.productId === id && i.size === size; });
    if (!line) return;
    Cart.setQty(id, size, btn.dataset.remove ? 0 : line.qty + (btn.dataset.inc ? 1 : -1));
    after();
  }
  if (mini) mini.addEventListener('click', function (e) { cartAction(e, renderMiniCart); });

  /* ---------- Page panier ---------- */
  var cartPage = $('[data-cart-page]');
  function renderCart() {
    if (!Cart.read().length) {
      cartPage.innerHTML = '<div class="panel empty-state">' + ICON.bag + '<h3>Votre panier est vide</h3><p class="muted">Il n\'attend que vous !</p><a class="btn btn-primary" href="/boutique">Découvrir nos produits</a></div>';
      return;
    }
    Cart.refresh().then(function (data) {
      if (!data.items.length) return renderCart();
      var subtotal = 0;
      var rows = data.items.map(function (i, k) {
        subtotal += i.price * i.qty;
        var key = i.productId + '|' + esc(i.size);
        return '<div class="cart-line" style="animation-delay:' + (k * 0.05) + 's">' +
          '<a href="' + esc(i.url) + '"><img src="' + esc(i.image) + '" alt=""></a>' +
          '<div class="cart-line-info"><a href="' + esc(i.url) + '"><strong>' + esc(i.name) + '</strong></a><span class="muted small">Pointure ' + esc(i.size) + '</span><span>' + money(i.price) + '</span></div>' +
          '<div class="cart-line-qty"><button data-dec="' + key + '" aria-label="Moins">' + ICON.minus + '</button><span>' + i.qty + '</span>' +
          '<button data-inc="' + key + '" ' + (i.qty >= i.stock ? 'disabled' : '') + ' aria-label="Plus">' + ICON.plus + '</button></div>' +
          '<strong class="cart-line-total">' + money(i.price * i.qty) + '</strong>' +
          '<button class="cart-line-remove" data-remove="' + key + '" aria-label="Retirer">' + ICON.trash + '</button></div>';
      }).join('');
      cartPage.innerHTML = '<div class="panel">' + rows + '</div>' + '<div class="panel">' + freeShipHtml(subtotal) +
        '<div class="cart-footer"><div>Sous-total : <strong style="font-size:1.3rem;font-family:var(--font-display)">' + money(subtotal) + '</strong><br><span class="muted small">Frais de livraison calculés à l\'étape suivante</span></div>' +
        '<a class="btn btn-accent btn-lg" href="/commande">Commander ' + ICON.arrow + '</a></div></div>';
    });
  }
  if (cartPage) {
    cartPage.addEventListener('click', function (e) { cartAction(e, renderCart); });
    renderCart();
  }

  /* ---------- Page commande ---------- */
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
