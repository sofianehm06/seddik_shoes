const express = require('express');
const config = require('../config');
const { OrderError } = require('../repo');
const { normalizePhone, label } = require('../lib');
const { placeholderSvg } = require('../placeholder');

const isSlug = (list, value) => list.some((x) => x.slug === value);
const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

module.exports = function shopRoutes({ repo }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.render('home', {
      featured: repo.listProducts({ featured: true, perPage: 8 }).products,
      promos: repo.listProducts({ promo: true, perPage: 4 }).products,
      latest: repo.listProducts({ perPage: 8 }).products,
      stores: repo.listStores(),
    });
  });

  router.get('/boutique', (req, res) => {
    const filters = {
      gender: isSlug(config.genders, req.query.genre) ? req.query.genre : '',
      category: isSlug(config.categories, req.query.type) ? req.query.type : '',
      size: clean(req.query.pointure, 10),
      q: clean(req.query.q, 80),
      min: Number(req.query.min) || '',
      max: Number(req.query.max) || '',
      promo: req.query.promo === '1',
      sort: clean(req.query.tri, 20),
      page: req.query.page,
    };
    const result = repo.listProducts(filters);
    const parts = [];
    if (filters.category) parts.push(label(config.categories, filters.category));
    if (filters.gender) parts.push(label(config.genders, filters.gender));
    if (filters.promo) parts.push('Promotions');
    res.render('catalog', {
      title: parts.join(' — ') || (filters.q ? `Recherche « ${filters.q} »` : 'Tous nos produits'),
      filters,
      sizes: repo.listSizes(),
      ...result,
    });
  });

  router.get('/produit/:slug', (req, res, next) => {
    const product = repo.getProductBySlug(req.params.slug);
    if (!product) return next();
    const similar = repo
      .listProducts({ category: product.category, perPage: 5 })
      .products.filter((p) => p.id !== product.id)
      .slice(0, 4);
    res.render('product', { title: product.name, product, similar });
  });

  router.get('/panier', (req, res) => res.render('cart', { title: 'Mon panier' }));

  router.get('/commande', (req, res) =>
    res.render('checkout', { title: 'Finaliser ma commande', stores: repo.listStores() })
  );

  // Renvoie les infos à jour (prix, stock) des articles du panier stocké dans le navigateur.
  router.post('/api/panier', (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    const out = [];
    for (const item of items) {
      const product = repo.getProduct(Number(item.productId));
      if (!product || !product.active) continue;
      const size = product.sizes.find((s) => s.size === String(item.size));
      if (!size) continue;
      out.push({
        productId: product.id,
        size: size.size,
        qty: Math.max(1, Math.min(Number(item.qty) || 1, size.stock || 1)),
        stock: size.stock,
        name: product.name,
        price: product.price,
        image: req.app.locals.imageUrl(product),
        url: `/produit/${product.slug}`,
      });
    }
    res.json({ items: out });
  });

  router.post('/api/commande', (req, res) => {
    const body = req.body || {};
    const errors = [];
    const name = clean(body.name, 100);
    const phone = normalizePhone(body.phone);
    const deliveryMode = ['domicile', 'stopdesk', 'boutique'].includes(body.deliveryMode) ? body.deliveryMode : null;
    const wilaya = clean(body.wilaya, 60);
    const store = deliveryMode === 'boutique' ? repo.getStore(Number(body.storeId)) : null;

    if (name.length < 3) errors.push('Indiquez votre nom complet.');
    if (!phone) errors.push('Numéro de téléphone invalide (ex : 0555 12 34 56).');
    if (!deliveryMode) errors.push('Choisissez un mode de livraison.');
    if (deliveryMode && deliveryMode !== 'boutique' && !config.wilayas.includes(wilaya)) errors.push('Choisissez votre wilaya.');
    if (deliveryMode === 'domicile' && clean(body.address).length < 5) errors.push('Indiquez votre adresse de livraison.');
    if (deliveryMode === 'boutique' && !store) errors.push('Choisissez la boutique où retirer votre commande.');

    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 50)
      .map((i) => ({ productId: Number(i.productId), size: clean(i.size, 10), qty: Math.floor(Number(i.qty)) }))
      .filter((i) => i.productId > 0 && i.size && i.qty > 0 && i.qty <= 20);
    if (!items.length) errors.push('Votre panier est vide.');
    if (errors.length) return res.status(400).json({ errors });

    try {
      const order = repo.createOrder({
        name,
        phone,
        deliveryMode,
        wilaya: deliveryMode === 'boutique' ? store.city : wilaya,
        commune: clean(body.commune, 80),
        address: deliveryMode === 'domicile' ? clean(body.address) : '',
        storeId: store ? store.id : null,
        note: clean(body.note, 500),
        items,
      });
      res.json({ ref: order.ref, redirect: `/commande/confirmation?ref=${order.ref}&tel=${phone}` });
    } catch (err) {
      if (err instanceof OrderError) return res.status(409).json({ errors: [err.message] });
      throw err;
    }
  });

  router.get('/commande/confirmation', (req, res, next) => {
    const order = repo.findOrder(clean(req.query.ref, 30), normalizePhone(req.query.tel) || '');
    if (!order) return next();
    res.render('confirmation', { title: 'Merci pour votre commande !', order });
  });

  router.get('/suivi', (req, res) => {
    let order = null;
    let searched = false;
    if (req.query.ref) {
      searched = true;
      order = repo.findOrder(clean(req.query.ref, 30).toUpperCase(), normalizePhone(req.query.tel) || '');
    }
    res.render('tracking', { title: 'Suivre ma commande', order, searched });
  });

  router.get('/boutiques', (req, res) => res.render('stores', { title: 'Nos boutiques', stores: repo.listStores() }));

  router.get('/placeholder.svg', (req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(placeholderSvg(clean(req.query.c, 30), clean(req.query.color, 30)));
  });

  return router;
};
