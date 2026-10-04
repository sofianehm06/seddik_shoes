const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

let server;
let base;
let app;
let tmp;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seddik-'));
  app = createApp({ dbFile: ':memory:', uploadsDir: tmp, secret: 'test-secret', adminPassword: 'motdepasse' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const postJson = (url, body) =>
  fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Crée un produit de test avec une pointure à quantité connue.
let counter = 0;
function productWithStock({ price = 5000, stock = 5, supplierId = null, type = 'percent', value = 10 } = {}) {
  const repo = app.locals.repo;
  const id = repo.saveProduct({
    name: `Produit test ${++counter}`,
    gender: 'homme',
    category: 'baskets',
    price,
    active: true,
    supplier_id: supplierId,
    commission_type: type,
    commission_value: value,
    sizes: [{ size: '42', stock }, { size: '43', stock: null }],
  });
  const product = repo.getProduct(id);
  return { product, size: product.sizes[0] };
}

const order = (items, extra = {}) =>
  postJson('/api/commande', { name: 'Client Test', phone: '0555123456', deliveryMode: 'stopdesk', wilaya: 'Oran', items, ...extra });

async function login() {
  const res = await fetch(base + '/admin/connexion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=motdepasse',
    redirect: 'manual',
  });
  assert.equal(res.status, 302);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const html = await (await fetch(base + '/admin', { headers: { cookie } })).text();
  const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  return { cookie, csrf };
}

test('les pages publiques répondent', async () => {
  for (const url of ['/', '/boutique', '/boutique?genre=femme&type=sandales', '/panier', '/commande', '/suivi', '/boutiques']) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
  }
  assert.equal((await fetch(base + '/produit/inexistant')).status, 404);
});

test('le catalogue filtre par rayon et par recherche', async () => {
  const html = await (await fetch(base + '/boutique?genre=fille')).text();
  assert.match(html, /Basket Paillettes/);
  assert.doesNotMatch(html, /Mocassin Florence/);
  const search = await (await fetch(base + '/boutique?q=mocassin')).text();
  assert.match(search, /Mocassin Florence/);
});

test('une commande recalcule les prix côté serveur et décrémente le stock', async () => {
  const { product, size } = productWithStock();
  const res = await postJson('/api/commande', {
    name: 'Karim Test',
    phone: '0555 12 34 56',
    deliveryMode: 'domicile',
    wilaya: 'Oran',
    address: '10 rue de la Paix',
    items: [{ productId: product.id, size: size.size, qty: 2, price: 1 }],
  });
  assert.equal(res.status, 200);
  const { ref } = await res.json();
  const order = app.locals.repo.findOrder(ref, '0555123456');
  const fee = product.price * 2 >= 15000 ? 0 : 600;
  assert.equal(order.subtotal, product.price * 2);
  assert.equal(order.total, product.price * 2 + fee);
  const after = app.locals.repo.getProduct(product.id).sizes.find((s) => s.size === size.size);
  assert.equal(after.stock, size.stock - 2);

  const page = await fetch(`${base}/commande/confirmation?ref=${ref}&tel=0555123456`);
  assert.equal(page.status, 200);
  assert.equal((await fetch(`${base}/commande/confirmation?ref=${ref}&tel=0666000000`)).status, 404);
});

test('une commande au-delà du stock est refusée', async () => {
  const { product, size } = productWithStock();
  const res = await postJson('/api/commande', {
    name: 'Amina Test',
    phone: '0661223344',
    deliveryMode: 'stopdesk',
    wilaya: 'Alger',
    items: [{ productId: product.id, size: size.size, qty: size.stock + 1 }],
  });
  assert.equal(res.status, 409);
  assert.equal(app.locals.repo.getProduct(product.id).sizes.find((s) => s.size === size.size).stock, size.stock);
});

test('les champs obligatoires sont validés', async () => {
  const res = await postJson('/api/commande', { name: 'A', phone: '123', deliveryMode: 'domicile', items: [] });
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.ok(errors.length >= 3);
});

test('retrait en boutique : livraison gratuite', async () => {
  const { product, size } = productWithStock();
  const storeId = app.locals.repo.saveStore({ name: 'Point Béjaïa', city: 'Béjaïa', address: 'Rue de la Liberté' });
  const store = app.locals.repo.getStore(storeId);
  assert.match(await (await fetch(base + '/commande')).text(), /Retrait sur place/);
  const res = await postJson('/api/commande', {
    name: 'Yacine Test',
    phone: '+213 770 11 22 33',
    deliveryMode: 'boutique',
    storeId: store.id,
    items: [{ productId: product.id, size: size.size, qty: 1 }],
  });
  assert.equal(res.status, 200);
  const order = app.locals.repo.findOrder((await res.json()).ref, '0770112233');
  assert.equal(order.delivery_fee, 0);
  assert.equal(order.store_id, store.id);
});

test("l'admin est protégé par mot de passe", async () => {
  assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 302);
  const bad = await fetch(base + '/admin/connexion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=faux',
  });
  assert.equal(bad.status, 401);
  const { cookie } = await login();
  assert.equal((await fetch(base + '/admin/commandes', { headers: { cookie } })).status, 200);
});

test("l'admin refuse les requêtes sans jeton CSRF et annuler remet en stock", async () => {
  const { product, size } = productWithStock();
  const { ref } = await (
    await postJson('/api/commande', {
      name: 'Sara Test',
      phone: '0550998877',
      deliveryMode: 'stopdesk',
      wilaya: 'Sétif',
      items: [{ productId: product.id, size: size.size, qty: 1 }],
    })
  ).json();
  const order = app.locals.repo.findOrder(ref, '0550998877');
  const { cookie, csrf } = await login();
  const form = (body) => ({
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });

  assert.equal((await fetch(`${base}/admin/commandes/${order.id}/statut`, form('status=annulee'))).status, 403);
  const ok = await fetch(`${base}/admin/commandes/${order.id}/statut`, form(`status=annulee&_csrf=${csrf}`));
  assert.equal(ok.status, 302);
  assert.equal(app.locals.repo.getOrder(order.id).status, 'annulee');
  assert.equal(app.locals.repo.getProduct(product.id).sizes.find((s) => s.size === size.size).stock, size.stock);
});

test("l'admin crée un produit avec photo", async () => {
  const { cookie, csrf } = await login();
  const fd = new FormData();
  fd.set('name', 'Claquette Test');
  fd.set('gender', 'homme');
  fd.set('category', 'claquettes');
  fd.set('price', '2500');
  fd.set('sizes', '40:3, 41:0, 42:5');
  fd.set('active', '1');
  fd.set('images', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'photo.png');
  const res = await fetch(`${base}/admin/produits?_csrf=${csrf}`, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
  assert.equal(res.status, 302);
  const id = Number(res.headers.get('location').match(/produits\/(\d+)/)[1]);
  const product = app.locals.repo.getProduct(id);
  assert.equal(product.slug, 'claquette-test');
  assert.deepEqual(product.sizes.map((s) => [s.size, s.stock]), [['40', 3], ['41', 0], ['42', 5]]);
  assert.equal(product.images.length, 1);
  assert.ok(fs.existsSync(path.join(tmp, product.images[0].path)));

  const noCsrf = new FormData();
  noCsrf.set('name', 'Pirate');
  const rejected = await fetch(`${base}/admin/produits`, { method: 'POST', headers: { cookie }, body: noCsrf, redirect: 'manual' });
  assert.equal(rejected.status, 403);
});

test('une pointure sans quantité connue reste commandable', async () => {
  const { product } = productWithStock();
  const res = await order([{ productId: product.id, size: '43', qty: 3 }]);
  assert.equal(res.status, 200);
  assert.equal(app.locals.repo.getProduct(product.id).sizes.find((s) => s.size === '43').stock, null);
});

test('commission figée sur la commande et comptes fournisseur', async () => {
  const repo = app.locals.repo;
  const supplierId = repo.saveSupplier({ name: 'Fournisseur Comptes', phone: '0555000111' });
  const a = productWithStock({ price: 4000, supplierId, type: 'percent', value: 10 }).product; // 400 DA / paire
  const b = productWithStock({ price: 3000, supplierId, type: 'fixed', value: 500 }).product; // 500 DA / paire

  // Commande à Béjaïa : livrée et encaissée par moi par défaut.
  const r1 = await order([{ productId: a.id, size: '42', qty: 2 }], { wilaya: 'Béjaïa', phone: '0550000001' });
  const o1 = repo.findOrder((await r1.json()).ref, '0550000001');
  assert.equal(o1.delivered_by, 'moi');
  assert.equal(o1.collected_by, 'moi');
  assert.equal(o1.items[0].commission, 400);
  assert.equal(o1.items[0].supplier_name, 'Fournisseur Comptes');

  // Commande à Alger : le fournisseur livre et encaisse.
  const r2 = await order([{ productId: b.id, size: '42', qty: 1 }], { wilaya: 'Alger', phone: '0550000002' });
  const o2 = repo.findOrder((await r2.json()).ref, '0550000002');
  assert.equal(o2.collected_by, 'fournisseur');

  // Changer la commission après coup ne change pas les commandes passées.
  repo.saveProduct({ ...a, commission_value: 50, sizes: null }, a.id);
  assert.equal(repo.getOrder(o1.id).items[0].commission, 400);

  // Pas encore livrées : rien à régler.
  assert.equal(repo.accounts().suppliers.find((s) => s.id === supplierId), undefined);

  repo.setOrderStatus(o1.id, 'livree');
  repo.setOrderStatus(o2.id, 'livree');
  const acc = repo.accounts().suppliers.find((s) => s.id === supplierId);
  // J'ai encaissé 8000, je lui dois 8000 - 800 = 7200 ; il a encaissé 3000, il me doit 500. Solde : 6700 pour lui.
  assert.equal(acc.sales, 11000);
  assert.equal(acc.commission, 1300);
  assert.equal(acc.balance, 6700);

  const month = new Date().toISOString().slice(0, 7);
  const e = repo.earnings(month);
  assert.ok(e.commission >= 1300);
  assert.ok(e.delivery >= o1.delivery_fee);

  repo.settle(supplierId);
  assert.equal(repo.accounts().suppliers.find((s) => s.id === supplierId), undefined);
  assert.equal(repo.listSettlements()[0].amount, 6700);

  // Une commande retournée ne compte pas.
  const r3 = await order([{ productId: a.id, size: '42', qty: 1 }], { phone: '0550000003' });
  const o3 = repo.findOrder((await r3.json()).ref, '0550000003');
  repo.setOrderStatus(o3.id, 'retour');
  assert.equal(repo.accounts().suppliers.find((s) => s.id === supplierId), undefined);
});

test('pages admin fournisseurs, à préparer et comptes', async () => {
  const { cookie, csrf } = await login();
  for (const url of ['/admin/fournisseurs', '/admin/fournisseurs/nouveau', '/admin/a-preparer', '/admin/comptes', '/admin/produits/nouveau']) {
    assert.equal((await fetch(base + url, { headers: { cookie } })).status, 200, url);
  }
  const res = await fetch(base + '/admin/fournisseurs', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `_csrf=${csrf}&name=Ahmed+Chaussures&city=Akbou&phone=0661000000&default_commission_type=fixed&default_commission_value=700`,
    redirect: 'manual',
  });
  assert.equal(res.status, 302);
  const s = app.locals.repo.listSuppliers().find((x) => x.name === 'Ahmed Chaussures');
  assert.equal(s.default_commission_value, 700);

  // Une commande confirmée apparaît dans "À préparer" avec le lien WhatsApp du fournisseur.
  const { product } = productWithStock({ supplierId: s.id });
  const r = await order([{ productId: product.id, size: '43', qty: 1 }], { phone: '0550000004' });
  const o = app.locals.repo.findOrder((await r.json()).ref, '0550000004');
  app.locals.repo.setOrderStatus(o.id, 'confirmee');
  const html = await (await fetch(base + '/admin/a-preparer', { headers: { cookie } })).text();
  assert.match(html, /Ahmed Chaussures/);
  assert.match(html, /wa\.me\/213661000000/);
  const orderPage = await (await fetch(`${base}/admin/commandes/${o.id}`, { headers: { cookie } })).text();
  assert.match(orderPage, /WhatsApp → Ahmed Chaussures/);
});

test('un e-mail est envoyé à chaque nouvelle commande', async () => {
  const sent = [];
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'seddik-mail-'));
  const app2 = createApp({
    dbFile: ':memory:',
    uploadsDir: tmp2,
    secret: 's',
    adminPassword: 'motdepasse',
    mailTransport: { sendMail: async (m) => sent.push(m) },
  });
  const srv = await new Promise((resolve) => {
    const s = app2.listen(0, () => resolve(s));
  });
  try {
    const repo = app2.locals.repo;
    const supplierId = repo.saveSupplier({ name: 'Fournisseur Mail' });
    const id = repo.saveProduct({
      name: 'Sandale <Test>', gender: 'femme', category: 'sandales', price: 3000, active: true,
      supplier_id: supplierId, commission_type: 'percent', commission_value: 10, sizes: [{ size: '38', stock: null }],
    });
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/commande`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nadia Test', phone: '0770123456', deliveryMode: 'domicile', wilaya: 'Béjaïa', address: 'Rue A', items: [{ productId: id, size: '38', qty: 2 }] }),
    });
    const { ref } = await res.json();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'shoesbougie@gmail.com');
    assert.match(sent[0].subject, new RegExp(ref));
    assert.match(sent[0].text, /Nadia Test/);
    assert.match(sent[0].text, /Ta commission : 600 DA/);
    assert.match(sent[0].html, /Sandale &lt;Test&gt;/);
  } finally {
    srv.close();
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
});

test("une panne d'envoi d'e-mail ne bloque pas la commande", async () => {
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'seddik-mail-'));
  const app3 = createApp({
    dbFile: ':memory:', uploadsDir: tmp3, secret: 's', adminPassword: 'x',
    mailTransport: { sendMail: async () => { throw new Error('SMTP down'); } },
  });
  const srv = await new Promise((resolve) => {
    const s = app3.listen(0, () => resolve(s));
  });
  const errorLog = console.error;
  console.error = () => {};
  try {
    const p = app3.locals.repo.listProducts().products.find((x) => x.available);
    const size = p.sizes.find((s) => s.stock !== 0).size;
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/commande`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Omar Test', phone: '0770123457', deliveryMode: 'stopdesk', wilaya: 'Oran', items: [{ productId: p.id, size, qty: 1 }] }),
    });
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    console.error = errorLog;
    srv.close();
    fs.rmSync(tmp3, { recursive: true, force: true });
  }
});

test("la sauvegarde télécharge un zip avec la base et les photos", async () => {
  const { cookie } = await login();
  fs.writeFileSync(path.join(tmp, 'photo-test.jpg'), 'fausse photo');
  const res = await fetch(base + '/admin/sauvegarde/telecharger', { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  const zip = Buffer.from(await res.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const names = [];
  // Lecture du répertoire central pour lister les fichiers.
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const len = zip.readUInt16LE(p + 28);
    names.push(zip.subarray(p + 46, p + 46 + len).toString());
    p += 46 + len;
  }
  assert.ok(names.includes('boutique.db'));
  assert.ok(names.includes('uploads/photo-test.jpg'));
  // La base sauvegardée est une vraie base SQLite lisible.
  const dbStart = 30 + 'boutique.db'.length;
  assert.equal(zip.subarray(dbStart, dbStart + 15).toString(), 'SQLite format 3');
  assert.ok(app.locals.repo.getSetting('last_backup'));
  assert.equal((await fetch(base + '/admin/sauvegarde/telecharger', { redirect: 'manual' })).status, 302);
});

test("l'admin choisit la photo d'un rayon de l'accueil", async () => {
  const { cookie, csrf } = await login();
  const fd = new FormData();
  fd.set('tile_femme', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'femme.png');
  const res = await fetch(`${base}/admin/apparence?_csrf=${csrf}`, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
  assert.equal(res.status, 302);
  const file = app.locals.repo.getSetting('tile_femme');
  assert.ok(file && fs.existsSync(path.join(tmp, file)));
  const home = await (await fetch(base + '/')).text();
  assert.ok(home.includes(`/uploads/${file}`));
  assert.equal((await fetch(`${base}/admin/apparence`, { method: 'POST', headers: { cookie }, body: new FormData(), redirect: 'manual' })).status, 403);
  await fetch(`${base}/admin/apparence/femme/supprimer`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `_csrf=${csrf}`, redirect: 'manual',
  });
  assert.equal(app.locals.repo.getSetting('tile_femme'), '');
  await new Promise((r) => setTimeout(r, 50)); // la suppression du fichier se fait en arrière-plan
  assert.ok(!fs.existsSync(path.join(tmp, file)));
});
