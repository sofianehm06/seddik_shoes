const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { OrderError } = require('../repo');
const { signSession, readSession, parseCookies, verifyPassword, hashPassword } = require('../lib');

const COOKIE = 'ss_admin';
const SESSION_HOURS = 12;
const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const isSlug = (list, value) => list.some((x) => x.slug === value);

// "38:4, 39:2, 40" -> [{ size: '38', stock: 4 }, ...]
function parseSizes(text) {
  const seen = new Set();
  const sizes = [];
  for (const part of String(text || '').split(/[,;\n]+/)) {
    const [rawSize, rawStock] = part.split(':');
    const size = clean(rawSize, 10);
    if (!size || seen.has(size)) continue;
    seen.add(size);
    sizes.push({ size, stock: Math.max(0, Math.floor(Number(rawStock) || 0)) });
  }
  return sizes;
}

module.exports = function adminRoutes({ repo, secret, uploadsDir }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => {
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 8 },
    fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
  });

  const removeUpload = (file) => {
    if (file) fs.rm(path.join(uploadsDir, path.basename(file)), { force: true }, () => {});
  };

  // Limite simple des tentatives de connexion par IP.
  const attempts = new Map();
  const tooManyAttempts = (ip) => {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || entry.until < now) return false;
    return entry.count >= 10;
  };
  const recordFailure = (ip) => {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || entry.until < now) attempts.set(ip, { count: 1, until: now + 15 * 60 * 1000 });
    else entry.count++;
  };

  router.use((req, res, next) => {
    res.locals.layout = 'admin';
    req.session = readSession(parseCookies(req.headers.cookie)[COOKIE], secret);
    res.locals.csrf = req.session?.csrf || '';
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/connexion', (req, res) => {
    if (req.session) return res.redirect('/admin');
    res.render('admin/login', { title: 'Connexion', error: null });
  });

  router.post('/connexion', (req, res) => {
    if (tooManyAttempts(req.ip)) {
      return res.status(429).render('admin/login', { title: 'Connexion', error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }
    if (!verifyPassword(String(req.body.password || ''), repo.getSetting('admin_password'))) {
      recordFailure(req.ip);
      return res.status(401).render('admin/login', { title: 'Connexion', error: 'Mot de passe incorrect.' });
    }
    attempts.delete(req.ip);
    const token = signSession(
      { csrf: crypto.randomBytes(16).toString('hex'), exp: Date.now() + SESSION_HOURS * 3600 * 1000 },
      secret
    );
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: SESSION_HOURS * 3600 * 1000,
      path: '/admin',
    });
    res.redirect('/admin');
  });

  // Tout ce qui suit nécessite d'être connecté.
  router.use((req, res, next) => {
    if (!req.session) return res.redirect('/admin/connexion');
    next();
  });

  // Protection CSRF : jeton dans le formulaire (ou dans l'URL pour les envois de fichiers).
  const checkCsrf = (req, res, next) => {
    const token = String(req.body?._csrf || req.query._csrf || '');
    const a = Buffer.from(token);
    const b = Buffer.from(req.session.csrf);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      for (const f of req.files || []) removeUpload(f.filename);
      return res.status(403).render('error', { title: 'Session expirée', message: 'Rechargez la page et réessayez.' });
    }
    next();
  };
  router.post(/.*/, (req, res, next) => (req.is('multipart/form-data') ? next() : checkCsrf(req, res, next)));

  router.post('/deconnexion', (req, res) => {
    res.clearCookie(COOKIE, { path: '/admin' });
    res.redirect('/admin/connexion');
  });

  router.get('/', (req, res) => {
    res.render('admin/dashboard', { title: 'Tableau de bord', stats: repo.stats(), orders: repo.listOrders().slice(0, 8) });
  });

  // --- Produits ---
  router.get('/produits', (req, res) => {
    const result = repo.listProducts({
      includeInactive: true,
      q: clean(req.query.q, 80),
      gender: isSlug(config.genders, req.query.genre) ? req.query.genre : '',
      category: isSlug(config.categories, req.query.type) ? req.query.type : '',
      page: req.query.page,
      perPage: 50,
    });
    res.render('admin/products', { title: 'Produits', ...result });
  });

  const emptyProduct = { name: '', description: '', brand: '', gender: 'homme', category: 'baskets', color: '', price: '', old_price: '', featured: 0, active: 1, images: [], sizes: [] };

  router.get('/produits/nouveau', (req, res) => {
    res.render('admin/product-form', { title: 'Nouveau produit', product: emptyProduct, sizesText: '', errors: [] });
  });

  router.get('/produits/:id', (req, res, next) => {
    const product = repo.getProduct(Number(req.params.id));
    if (!product) return next();
    const sizesText = product.sizes.map((s) => `${s.size}:${s.stock}`).join(', ');
    res.render('admin/product-form', { title: product.name, product, sizesText, errors: [] });
  });

  function saveProduct(req, res) {
    const id = req.params.id ? Number(req.params.id) : null;
    const existing = id ? repo.getProduct(id) : null;
    if (id && !existing) return res.status(404).render('error', { title: 'Introuvable', message: 'Produit introuvable.' });
    const b = req.body;
    const data = {
      name: clean(b.name, 120),
      description: clean(b.description, 3000),
      brand: clean(b.brand, 60),
      gender: b.gender,
      category: b.category,
      color: clean(b.color, 40),
      price: Math.round(Number(b.price)),
      old_price: b.old_price ? Math.round(Number(b.old_price)) : null,
      featured: b.featured === '1',
      active: b.active === '1',
      sizes: parseSizes(b.sizes),
      newImages: (req.files || []).map((f) => f.filename),
    };
    const errors = [];
    if (data.name.length < 2) errors.push('Le nom est obligatoire.');
    if (!isSlug(config.genders, data.gender)) errors.push('Rayon invalide.');
    if (!isSlug(config.categories, data.category)) errors.push('Type invalide.');
    if (!(data.price > 0)) errors.push('Le prix doit être supérieur à 0.');
    if (data.old_price !== null && !(data.old_price > data.price)) errors.push("L'ancien prix doit être supérieur au prix actuel.");
    if (!data.sizes.length) errors.push('Indiquez au moins une pointure / taille.');
    if (errors.length) {
      data.newImages.forEach(removeUpload);
      return res.status(400).render('admin/product-form', {
        title: existing ? existing.name : 'Nouveau produit',
        product: { ...emptyProduct, ...existing, ...data, id, featured: data.featured ? 1 : 0, active: data.active ? 1 : 0 },
        sizesText: b.sizes || '',
        errors,
      });
    }
    const savedId = repo.saveProduct(data, id);
    res.redirect(`/admin/produits/${savedId}?ok=1`);
  }

  router.post('/produits', upload.array('images', 8), checkCsrf, saveProduct);
  router.post('/produits/:id', upload.array('images', 8), checkCsrf, saveProduct);

  router.post('/produits/:id/supprimer', (req, res) => {
    repo.deleteProduct(Number(req.params.id)).forEach(removeUpload);
    res.redirect('/admin/produits');
  });

  router.post('/produits/:id/images/:imageId/supprimer', (req, res) => {
    removeUpload(repo.deleteImage(Number(req.params.id), Number(req.params.imageId)));
    res.redirect(`/admin/produits/${Number(req.params.id)}`);
  });

  // --- Commandes ---
  router.get('/commandes', (req, res) => {
    const status = isSlug(config.orderStatuses, req.query.statut) ? req.query.statut : '';
    res.render('admin/orders', { title: 'Commandes', orders: repo.listOrders({ status, q: clean(req.query.q, 60) }), status });
  });

  router.get('/commandes/:id', (req, res, next) => {
    const order = repo.getOrder(Number(req.params.id));
    if (!order) return next();
    res.render('admin/order', { title: `Commande ${order.ref}`, order });
  });

  router.post('/commandes/:id/statut', (req, res) => {
    try {
      repo.setOrderStatus(Number(req.params.id), String(req.body.status));
    } catch (err) {
      if (!(err instanceof OrderError)) throw err;
    }
    res.redirect(`/admin/commandes/${Number(req.params.id)}`);
  });

  // --- Boutiques physiques ---
  router.get('/boutiques', (req, res) => res.render('admin/stores', { title: 'Boutiques', stores: repo.listStores() }));

  router.get('/boutiques/nouvelle', (req, res) =>
    res.render('admin/store-form', { title: 'Nouvelle boutique', store: {}, errors: [] })
  );

  router.get('/boutiques/:id', (req, res, next) => {
    const store = repo.getStore(Number(req.params.id));
    if (!store) return next();
    res.render('admin/store-form', { title: store.name, store, errors: [] });
  });

  function saveStore(req, res) {
    const id = req.params.id ? Number(req.params.id) : null;
    const b = req.body;
    const store = {
      name: clean(b.name, 100),
      city: clean(b.city, 60),
      address: clean(b.address),
      phone: clean(b.phone, 40),
      hours: clean(b.hours, 120),
      map_url: /^https:\/\//.test(clean(b.map_url, 500)) ? clean(b.map_url, 500) : '',
    };
    const errors = [];
    if (!store.name) errors.push('Le nom est obligatoire.');
    if (!store.city) errors.push('La ville est obligatoire.');
    if (!store.address) errors.push("L'adresse est obligatoire.");
    if (errors.length) return res.status(400).render('admin/store-form', { title: 'Boutique', store: { ...store, id }, errors });
    repo.saveStore(store, id);
    res.redirect('/admin/boutiques');
  }

  router.post('/boutiques', saveStore);
  router.post('/boutiques/:id', saveStore);
  router.post('/boutiques/:id/supprimer', (req, res) => {
    repo.deleteStore(Number(req.params.id));
    res.redirect('/admin/boutiques');
  });

  // --- Mot de passe ---
  router.get('/mot-de-passe', (req, res) => res.render('admin/password', { title: 'Mot de passe', message: null, error: null }));

  router.post('/mot-de-passe', (req, res) => {
    const { current, next: newPassword, confirm } = req.body;
    let error = null;
    if (!verifyPassword(String(current || ''), repo.getSetting('admin_password'))) error = 'Mot de passe actuel incorrect.';
    else if (String(newPassword || '').length < 8) error = 'Le nouveau mot de passe doit faire au moins 8 caractères.';
    else if (newPassword !== confirm) error = 'Les deux mots de passe ne correspondent pas.';
    if (error) return res.status(400).render('admin/password', { title: 'Mot de passe', message: null, error });
    repo.setSetting('admin_password', hashPassword(String(newPassword)));
    res.render('admin/password', { title: 'Mot de passe', message: 'Mot de passe modifié.', error: null });
  });

  return router;
};
