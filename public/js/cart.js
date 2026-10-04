// Panier stocké dans le navigateur (localStorage). Les prix sont toujours revérifiés par le serveur.
window.Cart = (function () {
  var KEY = 'cart';
  function read() {
    try { var items = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(items) ? items : []; } catch (e) { return []; }
  }
  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    updateBadge();
  }
  function add(productId, size, qty) {
    var items = read();
    var line = items.find(function (i) { return i.productId === productId && i.size === size; });
    if (line) line.qty += qty; else items.push({ productId: productId, size: size, qty: qty });
    write(items);
  }
  function setQty(productId, size, qty) {
    var items = read().map(function (i) {
      if (i.productId === productId && i.size === size) i.qty = qty;
      return i;
    }).filter(function (i) { return i.qty > 0; });
    write(items);
  }
  function count() { return read().reduce(function (n, i) { return n + i.qty; }, 0); }
  function updateBadge() {
    var n = count();
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
  }
  // Récupère les infos à jour (prix, stock, image) auprès du serveur et nettoie le panier.
  function refresh() {
    return fetch('/api/panier', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: read() })
    }).then(function (r) { return r.json(); }).then(function (data) {
      var valid = data.items.filter(function (i) { return i.stock > 0; });
      write(valid.map(function (i) { return { productId: i.productId, size: i.size, qty: i.qty }; }));
      return { items: valid };
    });
  }
  document.addEventListener('DOMContentLoaded', updateBadge);
  return { read: read, add: add, setQty: setQty, count: count, refresh: refresh, clear: function () { write([]); } };
})();
