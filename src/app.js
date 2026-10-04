const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { open } = require('./db');
const { createRepo } = require('./repo');
const { seedDemo } = require('./seed');
const { createNotifier } = require('./notify');
const { formatPrice, label, hashPassword } = require('./lib');
const { icon } = require('./icons');
const shopRoutes = require('./routes/shop');
const adminRoutes = require('./routes/admin');

const ROOT = path.join(__dirname, '..');

function imageUrl(product, index = 0) {
  const img = product.images && product.images[index];
  if (img) return `/uploads/${img.path}`;
  return `/placeholder.svg?c=${encodeURIComponent(product.category)}&color=${encodeURIComponent(product.color || '')}&bg=none`;
}

function createApp(options = {}) {
  const dbFile = options.dbFile || process.env.DB_FILE || path.join(ROOT, 'data', 'boutique.db');
  const uploadsDir = options.uploadsDir || process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const db = open(dbFile);
  const repo = createRepo(db);
  const seed = options.seed ?? process.env.SEED_DEMO !== '0';
  if (seed) seedDemo(repo);

  // Secret de session : variable d'environnement, sinon généré une fois et conservé en base.
  let secret = options.secret || process.env.SESSION_SECRET || repo.getSetting('session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    repo.setSetting('session_secret', secret);
  }

  if (!repo.getSetting('admin_password')) {
    let password = options.adminPassword || process.env.ADMIN_PASSWORD;
    if (!password) {
      password = crypto.randomBytes(6).toString('base64url');
      console.log(`\n  Mot de passe admin généré : ${password}\n  (changez-le dans Admin > Mot de passe)\n`);
    }
    repo.setSetting('admin_password', hashPassword(password));
  }

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '100kb' }));

  app.locals.config = config;
  app.locals.formatPrice = formatPrice;
  app.locals.label = label;
  app.locals.imageUrl = imageUrl;
  app.locals.icon = icon;
  app.use((req, res, next) => {
    res.locals.path = req.path;
    res.locals.query = req.query;
    res.locals.title = null;
    next();
  });

  const notifier = createNotifier({ transport: options.mailTransport });
  if (!notifier.enabled && !options.dbFile) console.log('  Notifications e-mail désactivées (SMTP_USER / SMTP_PASS non définis).');
  app.use('/admin', adminRoutes({ repo, db, secret, uploadsDir, notifier }));
  app.use(shopRoutes({ repo, notifier }));

  app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas (ou plus)." }));
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue. Réessayez dans un instant.' });
  });

  app.locals.db = db;
  app.locals.repo = repo;
  return app;
}

module.exports = { createApp };
