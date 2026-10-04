const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { OrderError } = require('../repo');
const { whatsappLink, formatPrice, signSession, readSession, parseCookies, verifyPassword, hashPassword } = require('../lib');

const COOKIE = 'ss_admin';
const SESSION_HOURS = 12;
const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const isSlug = (list, value) => list.some((x) => x.slug === value);

// "38, 39:2, 40:0" -> [{ size: '38', stock: null }, { size: '39', stock: 2 }, { size: '40', stock: 0 }]
// Sans ":quantité", la pointure est simplement disponible (quantité inconnue).
function parseSizes(text) {
  const seen = new Set();
  const sizes = [];
  for (const part of String(text || '').split(/[,;\n]+/)) {
    const [rawSize, rawStock] = part.split(':');
    const size = clean(rawSize, 10);
    if (!size || seen.has(size)) continue;
    seen.add(size);
    const hasStock = rawStock !== undefined && rawStock.trim() !== '';
    sizes.push({ size, stock: hasStock ? Math.max(0, Math.floor(Number(rawStock) || 0)) : null });
  }
  return sizes;
}

module.exports = function adminRoutes({ repo, secret, uploadsDir, notifier }) {
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
    fileFilter: (req, file, cb) => {
      const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
      if (!ok && file.originalname) req.rejectedFiles = (req.rejectedFiles || 0) + 1;
      cb(null, ok);
    },
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
    res.locals.badges = repo.orderCounts();
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
    res.render('admin/dashboard', {
      title: 'Tableau de bord',
      stats: repo.stats(),
      orders: repo.listOrders().slice(0, 8),
      notify: { enabled: Boolean(notifier?.enabled), to: notifier?.to, result: req.query.email || null },
    });
  });

  router.post('/test-email', async (req, res) => {
    try {
      await notifier.test();
      res.redirect('/admin?email=ok');
    } catch (err) {
      console.error('E-mail de test échoué :', err.message);
      res.redirect('/admin?email=erreur');
    }
  });

  router.get('/a-preparer', (req, res) => {
    const groups = repo.toPrepare().map((g) => {
      const lines = g.items.map((i) => `• ${i.name} — pointure ${i.size} × ${i.qty} (commande ${i.ref})`);
      const text = `Salam, voici les articles à préparer pour ${config.shop.name} :\n${lines.join('\n')}\nMerci !`;
      return { ...g, whatsapp: g.supplier ? whatsappLink(g.supplier.whatsapp || g.supplier.phone, text) : '' };
    });
    res.render('admin/prepare', { title: 'À préparer', groups });
  });

  // --- Produits ---
  router.get('/produits', (req, res) => {
    const result = repo.listProducts({
      includeInactive: true,
      q: clean(req.query.q, 80),
      gender: isSlug(config.genders, req.query.genre) ? req.query.genre : '',
      category: isSlug(config.categories, req.query.type) ? req.query.type : '',
      supplierId: Number(req.query.fournisseur) || '',
      page: req.query.page,
      perPage: 50,
    });
    res.render('admin/products', { title: 'Produits', suppliers: repo.listSuppliers(), ...result });
  });

  const emptyProduct = {
    name: '', description: '', brand: '', gender: 'homme', category: 'baskets', color: '', price: '', old_price: '',
    supplier_id: '', commission_type: 'percent', commission_value: '', featured: 0, active: 1, images: [], sizes: [],
  };
  const renderProductForm = (res, locals) =>
    res.render('admin/product-form', { suppliers: repo.listSuppliers(), ...locals });

  router.get('/produits/nouveau', (req, res) => {
    renderProductForm(res, { title: 'Nouveau produit', product: emptyProduct, sizesText: '', errors: [] });
  });

  router.get('/produits/:id', (req, res, next) => {
    const product = repo.getProduct(Number(req.params.id));
    if (!product) return next();
    const sizesText = product.sizes.map((s) => (s.stock === null ? s.size : `${s.size}:${s.stock}`)).join(', ');
    renderProductForm(res, { title: product.name, product, sizesText, errors: [] });
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
      supplier_id: Number(b.supplier_id) || null,
      commission_type: b.commission_type === 'fixed' ? 'fixed' : 'percent',
      commission_value: Math.round(Number(b.commission_value) || 0),
      featured: b.featured === '1',
      active: b.active === '1',
      sizes: parseSizes(b.sizes),
      newImages: (req.files || []).map((f) => f.filename),
    };
    const errors = [];
    if (req.rejectedFiles) errors.push(`${req.rejectedFiles} fichier(s) ignoré(s) : seules les photos JPG, PNG ou WebP sont acceptées.`);
    if (data.name.length < 2) errors.push('Le nom est obligatoire.');
    if (!isSlug(config.genders, data.gender)) errors.push('Rayon invalide.');
    if (!isSlug(config.categories, data.category)) errors.push('Type invalide.');
    if (!(data.price > 0)) errors.push('Le prix doit être supérieur à 0.');
    if (data.old_price !== null && !(data.old_price > data.price)) errors.push("L'ancien prix doit être supérieur au prix actuel.");
    if (!data.sizes.length) errors.push('Indiquez au moins une pointure / taille.');
    if (data.supplier_id && !repo.getSupplier(data.supplier_id)) errors.push('Fournisseur inconnu.');
    if (data.commission_value < 0) errors.push('La commission ne peut pas être négative.');
    if (data.commission_type === 'percent' && data.commission_value > 100) errors.push('La commission ne peut pas dépasser 100 %.');
    if (data.commission_type === 'fixed' && data.commission_value > data.price) errors.push('La commission ne peut pas dépasser le prix de vente.');
    if (errors.length) {
      data.newImages.forEach(removeUpload);
      res.status(400);
      return renderProductForm(res, {
        title: existing ? existing.name : 'Nouveau produit',
        product: { ...emptyProduct, ...existing, ...data, id, featured: data.featured ? 1 : 0, active: data.active ? 1 : 0 },
        sizesText: b.sizes || '',
        errors,
      });
    }
    const savedId = repo.saveProduct(data, id);
    res.redirect(`/admin/produits/${savedId}?ok=1`);
  }

  const uploadImages = (req, res, next) =>
    upload.array('images', 8)(req, res, (err) => {
      if (!err) return next();
      if (!(err instanceof multer.MulterError)) return next(err);
      for (const f of req.files || []) removeUpload(f.filename);
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Une photo dépasse 5 Mo.' : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? '8 photos maximum à la fois.' : 'Envoi des photos impossible.';
      res.status(400).render('error', { title: 'Photos refusées', message: `${message} Revenez en arrière et réessayez.` });
    });

  router.post('/produits', uploadImages, checkCsrf, saveProduct);
  router.post('/produits/:id', uploadImages, checkCsrf, saveProduct);

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
    // Un message WhatsApp prêt à envoyer à chaque fournisseur concerné par la commande.
    const bySupplier = new Map();
    for (const it of order.items) {
      if (!it.supplier_id) continue;
      if (!bySupplier.has(it.supplier_id)) bySupplier.set(it.supplier_id, []);
      bySupplier.get(it.supplier_id).push(it);
    }
    const suppliers = [...bySupplier].map(([id, items]) => {
      const supplier = repo.getSupplier(id);
      const lines = items.map((i) => `• ${i.name} — pointure ${i.size} × ${i.qty}`).join('\n');
      const dest = order.delivered_by === 'moi'
        ? 'Je passe la récupérer.'
        : `À envoyer à : ${order.customer_name}, ${order.phone}, ${order.wilaya}${order.commune ? ' / ' + order.commune : ''}` +
          `${order.address ? ', ' + order.address : ''} (${order.delivery_mode === 'stopdesk' ? 'stop desk' : 'domicile'}). ` +
          `Montant à encaisser : ${formatPrice(items.reduce((s, i) => s + i.price * i.qty, 0))}`;
      const text = `Salam, nouvelle commande ${order.ref} (${config.shop.name}) :\n${lines}\n${dest}`;
      return { name: supplier?.name || items[0].supplier_name, whatsapp: supplier ? whatsappLink(supplier.whatsapp || supplier.phone, text) : '' };
    });
    res.render('admin/order', { title: `Commande ${order.ref}`, order, suppliers });
  });

  router.post('/commandes/:id/livraison', (req, res) => {
    repo.setOrderHandling(Number(req.params.id), req.body.delivered_by, req.body.collected_by);
    res.redirect(`/admin/commandes/${Number(req.params.id)}`);
  });

  router.post('/commandes/:id/statut', (req, res) => {
    try {
      repo.setOrderStatus(Number(req.params.id), String(req.body.status));
    } catch (err) {
      if (!(err instanceof OrderError)) throw err;
    }
    res.redirect(`/admin/commandes/${Number(req.params.id)}`);
  });

  // --- Fournisseurs ---
  router.get('/fournisseurs', (req, res) =>
    res.render('admin/suppliers', { title: 'Fournisseurs', suppliers: repo.listSuppliers(), error: req.query.erreur || null })
  );

  router.get('/fournisseurs/nouveau', (req, res) =>
    res.render('admin/supplier-form', { title: 'Nouveau fournisseur', supplier: { default_commission_type: 'percent', default_commission_value: 10 }, errors: [] })
  );

  router.get('/fournisseurs/:id', (req, res, next) => {
    const supplier = repo.getSupplier(Number(req.params.id));
    if (!supplier) return next();
    res.render('admin/supplier-form', { title: supplier.name, supplier, errors: [] });
  });

  function saveSupplier(req, res) {
    const id = req.params.id ? Number(req.params.id) : null;
    const b = req.body;
    const supplier = {
      name: clean(b.name, 100),
      city: clean(b.city, 60),
      phone: clean(b.phone, 40),
      whatsapp: clean(b.whatsapp, 40),
      default_commission_type: b.default_commission_type === 'fixed' ? 'fixed' : 'percent',
      default_commission_value: Math.round(Number(b.default_commission_value) || 0),
      notes: clean(b.notes, 1000),
    };
    const errors = [];
    if (!supplier.name) errors.push('Le nom est obligatoire.');
    if (supplier.default_commission_value < 0) errors.push('La commission ne peut pas être négative.');
    if (errors.length) return res.status(400).render('admin/supplier-form', { title: 'Fournisseur', supplier: { ...supplier, id }, errors });
    repo.saveSupplier(supplier, id);
    res.redirect('/admin/fournisseurs');
  }

  router.post('/fournisseurs', saveSupplier);
  router.post('/fournisseurs/:id', saveSupplier);
  router.post('/fournisseurs/:id/supprimer', (req, res) => {
    try {
      repo.deleteSupplier(Number(req.params.id));
      res.redirect('/admin/fournisseurs');
    } catch (err) {
      if (!(err instanceof OrderError)) throw err;
      res.redirect(`/admin/fournisseurs?erreur=${encodeURIComponent(err.message)}`);
    }
  });

  // --- Comptes ---
  router.get('/comptes', (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.mois)) ? req.query.mois : undefined;
    res.render('admin/accounts', {
      title: 'Comptes',
      accounts: repo.accounts(),
      earnings: repo.earnings(month),
      settlements: repo.listSettlements(),
    });
  });

  router.post('/comptes/:supplierId/regler', (req, res) => {
    repo.settle(Number(req.params.supplierId));
    res.redirect('/admin/comptes');
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
