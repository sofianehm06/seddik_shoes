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

function productWithStock() {
  const { products } = app.locals.repo.listProducts({ perPage: 100 });
  for (const p of products) {
    const size = p.sizes.find((s) => s.stock >= 2);
    if (size) return { product: p, size };
  }
  throw new Error('aucun produit en stock');
}

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
  const store = app.locals.repo.listStores()[0];
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
