const config = require('./config');
const { transaction } = require('./db');
const { slugify, deliveryFee, orderRef, commissionAmount } = require('./lib');

const SORTS = {
  recent: 'p.created_at DESC, p.id DESC',
  'prix-asc': 'p.price ASC',
  'prix-desc': 'p.price DESC',
  nom: 'p.name COLLATE NOCASE ASC',
};

class OrderError extends Error {}

function createRepo(db) {
  function hydrate(product) {
    if (!product) return null;
    product.images = db
      .prepare('SELECT id, path FROM product_images WHERE product_id = ? ORDER BY position, id')
      .all(product.id);
    product.sizes = db
      .prepare('SELECT size, stock FROM product_sizes WHERE product_id = ? ORDER BY CAST(size AS REAL), size')
      .all(product.id);
    // stock NULL = pointure disponible mais quantité inconnue (c'est le fournisseur qui la connaît).
    product.available = product.sizes.some((s) => s.stock === null || s.stock > 0);
    product.commission = commissionAmount(product.price, product.commission_type, product.commission_value);
    return product;
  }

  function listProducts(filters = {}) {
    const where = [];
    const params = [];
    if (!filters.includeInactive) where.push('p.active = 1');
    if (filters.gender) {
      where.push('p.gender = ?');
      params.push(filters.gender);
    }
    if (filters.category) {
      where.push('p.category = ?');
      params.push(filters.category);
    }
    if (filters.supplierId) {
      where.push('p.supplier_id = ?');
      params.push(Number(filters.supplierId));
    }
    if (filters.size) {
      where.push('EXISTS (SELECT 1 FROM product_sizes s WHERE s.product_id = p.id AND s.size = ? AND (s.stock IS NULL OR s.stock > 0))');
      params.push(String(filters.size));
    }
    if (filters.q) {
      where.push("(p.name LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
      const like = `%${String(filters.q).replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like, like);
    }
    if (filters.min) {
      where.push('p.price >= ?');
      params.push(Number(filters.min));
    }
    if (filters.max) {
      where.push('p.price <= ?');
      params.push(Number(filters.max));
    }
    if (filters.promo) where.push('p.old_price IS NOT NULL AND p.old_price > p.price');
    if (filters.featured) where.push('p.featured = 1');

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = SORTS[filters.sort] || SORTS.recent;
    const perPage = filters.perPage || 24;
    const page = Math.max(1, Number(filters.page) || 1);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM products p ${clause}`).get(...params).n;
    const rows = db
      .prepare(`SELECT p.*, sp.name AS supplier_name FROM products p LEFT JOIN suppliers sp ON sp.id = p.supplier_id
        ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, perPage, (page - 1) * perPage);
    return {
      products: rows.map(hydrate),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  function listSizes() {
    return db
      .prepare(
        `SELECT DISTINCT s.size FROM product_sizes s JOIN products p ON p.id = s.product_id
         WHERE p.active = 1 AND (s.stock IS NULL OR s.stock > 0) ORDER BY CAST(s.size AS REAL), s.size`
      )
      .all()
      .map((r) => r.size);
  }

  function getProduct(id) {
    return hydrate(
      db.prepare('SELECT p.*, sp.name AS supplier_name FROM products p LEFT JOIN suppliers sp ON sp.id = p.supplier_id WHERE p.id = ?').get(id)
    );
  }

  function getProductBySlug(slug) {
    return hydrate(db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(slug));
  }

  function uniqueSlug(name, exceptId = 0) {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; db.prepare('SELECT 1 FROM products WHERE slug = ? AND id != ?').get(slug, exceptId); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  function saveProduct(data, id = null) {
    return transaction(db, () => {
      const fields = [
        data.name,
        data.description || '',
        data.brand || '',
        data.gender,
        data.category,
        data.color || '',
        data.price,
        data.old_price || null,
        data.supplier_id || null,
        data.commission_type === 'fixed' ? 'fixed' : 'percent',
        Math.max(0, Math.round(Number(data.commission_value) || 0)),
        data.featured ? 1 : 0,
        data.active ? 1 : 0,
      ];
      if (id) {
        db.prepare(
          `UPDATE products SET name=?, description=?, brand=?, gender=?, category=?, color=?, price=?,
           old_price=?, supplier_id=?, commission_type=?, commission_value=?, featured=?, active=?, slug=? WHERE id=?`
        ).run(...fields, uniqueSlug(data.name, id), id);
      } else {
        id = Number(
          db
            .prepare(
              `INSERT INTO products (name, description, brand, gender, category, color, price, old_price,
               supplier_id, commission_type, commission_value, featured, active, slug) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            )
            .run(...fields, uniqueSlug(data.name)).lastInsertRowid
        );
      }
      if (data.sizes) {
        db.prepare('DELETE FROM product_sizes WHERE product_id = ?').run(id);
        const insert = db.prepare('INSERT INTO product_sizes (product_id, size, stock) VALUES (?,?,?)');
        for (const s of data.sizes) insert.run(id, s.size, s.stock);
      }
      for (const file of data.newImages || []) {
        const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM product_images WHERE product_id = ?').get(id).p;
        db.prepare('INSERT INTO product_images (product_id, path, position) VALUES (?,?,?)').run(id, file, pos);
      }
      return id;
    });
  }

  function deleteImage(productId, imageId) {
    const img = db.prepare('SELECT path FROM product_images WHERE id = ? AND product_id = ?').get(imageId, productId);
    if (img) db.prepare('DELETE FROM product_images WHERE id = ?').run(imageId);
    return img ? img.path : null;
  }

  function deleteProduct(id) {
    const paths = db.prepare('SELECT path FROM product_images WHERE product_id = ?').all(id).map((r) => r.path);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return paths;
  }

  // --- Boutiques physiques ---
  const listStores = () => db.prepare('SELECT * FROM stores ORDER BY city, name').all();
  const getStore = (id) => db.prepare('SELECT * FROM stores WHERE id = ?').get(id);

  function saveStore(data, id = null) {
    const fields = [data.name, data.city, data.address, data.phone || '', data.hours || '', data.map_url || ''];
    if (id) {
      db.prepare('UPDATE stores SET name=?, city=?, address=?, phone=?, hours=?, map_url=? WHERE id=?').run(...fields, id);
      return id;
    }
    return Number(
      db.prepare('INSERT INTO stores (name, city, address, phone, hours, map_url) VALUES (?,?,?,?,?,?)').run(...fields)
        .lastInsertRowid
    );
  }

  const deleteStore = (id) => db.prepare('DELETE FROM stores WHERE id = ?').run(id);

  // --- Fournisseurs ---
  const listSuppliers = () =>
    db
      .prepare(
        `SELECT sp.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = sp.id) AS products
         FROM suppliers sp ORDER BY sp.name COLLATE NOCASE`
      )
      .all();
  const getSupplier = (id) => db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);

  function saveSupplier(data, id = null) {
    const fields = [
      data.name,
      data.city || '',
      data.phone || '',
      data.whatsapp || '',
      data.default_commission_type === 'fixed' ? 'fixed' : 'percent',
      Math.max(0, Math.round(Number(data.default_commission_value) || 0)),
      data.notes || '',
    ];
    if (id) {
      db.prepare(
        `UPDATE suppliers SET name=?, city=?, phone=?, whatsapp=?, default_commission_type=?, default_commission_value=?, notes=?
         WHERE id=?`
      ).run(...fields, id);
      return id;
    }
    return Number(
      db
        .prepare(
          `INSERT INTO suppliers (name, city, phone, whatsapp, default_commission_type, default_commission_value, notes)
           VALUES (?,?,?,?,?,?,?)`
        )
        .run(...fields).lastInsertRowid
    );
  }

  // On ne supprime pas un fournisseur qui a des produits ou des ventes : ça fausserait les comptes.
  function deleteSupplier(id) {
    const used =
      db.prepare('SELECT 1 FROM products WHERE supplier_id = ? LIMIT 1').get(id) ||
      db.prepare('SELECT 1 FROM order_items WHERE supplier_id = ? LIMIT 1').get(id);
    if (used) throw new OrderError('Ce fournisseur a des produits ou des ventes : il ne peut pas être supprimé.');
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  }

  // --- Commandes ---
  // Les prix sont recalculés côté serveur : on ne fait jamais confiance au panier du navigateur.
  function createOrder(input) {
    return transaction(db, () => {
      const lines = [];
      for (const item of input.items) {
        const product = db
          .prepare(
            `SELECT p.id, p.name, p.price, p.supplier_id, p.commission_type, p.commission_value, sp.name AS supplier_name
             FROM products p LEFT JOIN suppliers sp ON sp.id = p.supplier_id WHERE p.id = ? AND p.active = 1`
          )
          .get(item.productId);
        if (!product) throw new OrderError("Un article de votre panier n'est plus disponible.");
        const size = db
          .prepare('SELECT stock FROM product_sizes WHERE product_id = ? AND size = ?')
          .get(product.id, String(item.size));
        if (!size) throw new OrderError(`La pointure ${item.size} n'existe pas pour « ${product.name} ».`);
        if (size.stock !== null) {
          const already = lines
            .filter((l) => l.productId === product.id && l.size === String(item.size))
            .reduce((n, l) => n + l.qty, 0);
          if (size.stock < item.qty + already) {
            throw new OrderError(
              size.stock - already > 0
                ? `Il ne reste que ${size.stock - already} paire(s) de « ${product.name} » en ${item.size}.`
                : `« ${product.name} » en ${item.size} n'est plus disponible.`
            );
          }
        }
        lines.push({
          productId: product.id,
          name: product.name,
          size: String(item.size),
          price: product.price,
          qty: item.qty,
          supplierId: product.supplier_id,
          supplierName: product.supplier_name || '',
          commission: product.supplier_id ? commissionAmount(product.price, product.commission_type, product.commission_value) : product.price,
        });
      }
      if (!lines.length) throw new OrderError('Votre panier est vide.');

      const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const fee = deliveryFee(input.deliveryMode, input.wilaya, subtotal);
      const ref = orderRef();
      // Dans tes wilayas (Béjaïa), c'est toi qui livres et encaisses par défaut ; ailleurs, le fournisseur.
      const handler = config.delivery.localWilayas.includes(input.wilaya) ? 'moi' : 'fournisseur';
      const orderId = Number(
        db
          .prepare(
            `INSERT INTO orders (ref, customer_name, phone, wilaya, commune, address, delivery_mode, store_id, note,
             subtotal, delivery_fee, total, delivered_by, collected_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            ref,
            input.name,
            input.phone,
            input.wilaya || '',
            input.commune || '',
            input.address || '',
            input.deliveryMode,
            input.storeId || null,
            input.note || '',
            subtotal,
            fee,
            subtotal + fee,
            handler,
            handler
          ).lastInsertRowid
      );
      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, product_id, name, size, price, qty, supplier_id, supplier_name, commission)
         VALUES (?,?,?,?,?,?,?,?,?)`
      );
      const destock = db.prepare(
        'UPDATE product_sizes SET stock = stock - ? WHERE product_id = ? AND size = ? AND stock IS NOT NULL'
      );
      for (const l of lines) {
        insertItem.run(orderId, l.productId, l.name, l.size, l.price, l.qty, l.supplierId, l.supplierName, l.commission);
        destock.run(l.qty, l.productId, l.size);
      }
      return { id: orderId, ref, total: subtotal + fee };
    });
  }

  function getOrder(id) {
    const order = db
      .prepare('SELECT o.*, s.name AS store_name, s.city AS store_city FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = ?')
      .get(id);
    if (order) order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY supplier_name, id').all(id);
    return order;
  }

  function findOrder(ref, phone) {
    const row = db.prepare('SELECT id FROM orders WHERE ref = ? AND phone = ?').get(ref, phone);
    return row ? getOrder(row.id) : null;
  }

  function listOrders({ status, q } = {}) {
    const where = [];
    const params = [];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (q) {
      where.push('(ref LIKE ? OR customer_name LIKE ? OR phone LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM orders ${clause} ORDER BY id DESC LIMIT 500`).all(...params);
  }

  // Annuler / retour remet les pointures suivies en stock ; réactiver la commande les retire à nouveau.
  function setOrderStatus(id, status) {
    if (!config.orderStatuses.some((s) => s.slug === status)) throw new OrderError('Statut inconnu.');
    return transaction(db, () => {
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
      if (!order) return false;
      const wasCancelled = config.cancelledStatuses.includes(order.status);
      const isCancelled = config.cancelledStatuses.includes(status);
      if (wasCancelled !== isCancelled) {
        const sign = isCancelled ? 1 : -1;
        const items = db.prepare('SELECT product_id, size, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').all(id);
        const update = db.prepare(
          'UPDATE product_sizes SET stock = MAX(0, stock + ?) WHERE product_id = ? AND size = ? AND stock IS NOT NULL'
        );
        for (const it of items) update.run(sign * it.qty, it.product_id, it.size);
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
      return true;
    });
  }

  function setOrderHandling(id, deliveredBy, collectedBy) {
    const ok = (v) => (v === 'moi' ? 'moi' : 'fournisseur');
    db.prepare('UPDATE orders SET delivered_by = ?, collected_by = ? WHERE id = ?').run(ok(deliveredBy), ok(collectedBy), id);
  }

  // Articles des commandes confirmées, regroupés par fournisseur : ce qu'il faut lui demander de préparer.
  function toPrepare() {
    const rows = db
      .prepare(
        `SELECT i.*, o.ref, o.customer_name, o.wilaya, o.delivered_by, o.id AS order_id
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status = 'confirmee' ORDER BY i.supplier_name, o.id`
      )
      .all();
    const groups = new Map();
    for (const r of rows) {
      const key = r.supplier_id || 0;
      if (!groups.has(key)) {
        const supplier = r.supplier_id ? getSupplier(r.supplier_id) : null;
        groups.set(key, { supplier, name: supplier?.name || r.supplier_name || 'Mes produits (sans fournisseur)', items: [] });
      }
      groups.get(key).items.push(r);
    }
    return [...groups.values()];
  }

  // --- Comptes avec les fournisseurs ---
  // Pour chaque paire livrée et pas encore réglée :
  //  - si c'est toi qui as encaissé : tu dois au fournisseur (prix - ta commission)
  //  - si c'est le fournisseur qui a encaissé : il te doit ta commission
  function accounts() {
    const rows = db
      .prepare(
        `SELECT i.supplier_id, i.supplier_name, o.collected_by,
                SUM(i.qty) AS pairs, SUM(i.price * i.qty) AS sales, SUM(i.commission * i.qty) AS commission
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status = 'livree' AND i.settled_at IS NULL
         GROUP BY i.supplier_id, o.collected_by`
      )
      .all();
    const bySupplier = new Map();
    let own = { pairs: 0, sales: 0 };
    for (const r of rows) {
      if (!r.supplier_id) {
        own.pairs += r.pairs;
        own.sales += r.sales;
        continue;
      }
      if (!bySupplier.has(r.supplier_id)) {
        const supplier = getSupplier(r.supplier_id);
        bySupplier.set(r.supplier_id, {
          id: r.supplier_id,
          name: supplier?.name || r.supplier_name,
          supplier,
          pairs: 0,
          sales: 0,
          commission: 0,
          collectedByMe: 0,
          collectedBySupplier: 0,
          balance: 0, // > 0 : tu lui dois ; < 0 : il te doit
        });
      }
      const a = bySupplier.get(r.supplier_id);
      a.pairs += r.pairs;
      a.sales += r.sales;
      a.commission += r.commission;
      if (r.collected_by === 'moi') {
        a.collectedByMe += r.sales;
        a.balance += r.sales - r.commission;
      } else {
        a.collectedBySupplier += r.sales;
        a.balance -= r.commission;
      }
    }
    return { suppliers: [...bySupplier.values()], own };
  }

  function settle(supplierId) {
    return transaction(db, () => {
      const a = accounts().suppliers.find((s) => s.id === supplierId);
      if (!a) return null;
      db.prepare(
        `UPDATE order_items SET settled_at = datetime('now')
         WHERE supplier_id = ? AND settled_at IS NULL AND order_id IN (SELECT id FROM orders WHERE status = 'livree')`
      ).run(supplierId);
      db.prepare('INSERT INTO settlements (supplier_id, supplier_name, amount, items) VALUES (?,?,?,?)').run(
        supplierId,
        a.name,
        a.balance,
        a.pairs
      );
      return a;
    });
  }

  const listSettlements = () => db.prepare('SELECT * FROM settlements ORDER BY id DESC LIMIT 50').all();

  // Tes gains sur une période (format 'AAAA-MM') : commissions + frais des livraisons que tu as faites toi-même.
  function earnings(month) {
    const m = month || new Date().toISOString().slice(0, 7);
    const commission = db
      .prepare(
        `SELECT COALESCE(SUM(i.commission * i.qty), 0) AS n FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status = 'livree' AND strftime('%Y-%m', o.created_at) = ?`
      )
      .get(m).n;
    const delivery = db
      .prepare(
        `SELECT COALESCE(SUM(delivery_fee), 0) AS n, COUNT(*) AS c FROM orders
         WHERE status = 'livree' AND delivered_by = 'moi' AND strftime('%Y-%m', created_at) = ?`
      )
      .get(m);
    const sales = db
      .prepare(`SELECT COALESCE(SUM(subtotal), 0) AS n, COUNT(*) AS c FROM orders WHERE status = 'livree' AND strftime('%Y-%m', created_at) = ?`)
      .get(m);
    return {
      month: m,
      commission,
      delivery: delivery.n,
      deliveries: delivery.c,
      sales: sales.n,
      orders: sales.c,
      total: commission + delivery.n,
    };
  }

  // Compteurs affichés dans le menu de l'admin.
  const orderCounts = () =>
    db.prepare(
      `SELECT SUM(status = 'nouvelle') AS nouvelle, SUM(status = 'confirmee') AS confirmee FROM orders`
    ).get();

  function stats() {
    const one = (sql) => db.prepare(sql).get().n;
    return {
      newOrders: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'nouvelle'"),
      toPrepare: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'confirmee'"),
      ordersToday: one("SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = date('now')"),
      earnings: earnings(),
      products: one('SELECT COUNT(*) AS n FROM products WHERE active = 1'),
      lowStock: db
        .prepare(
          `SELECT p.id, p.name, s.size, s.stock FROM product_sizes s JOIN products p ON p.id = s.product_id
           WHERE p.active = 1 AND s.stock IS NOT NULL AND s.stock <= 2 ORDER BY s.stock, p.name LIMIT 15`
        )
        .all(),
    };
  }

  const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  const setSetting = (key, value) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

  return {
    listProducts,
    listSizes,
    getProduct,
    getProductBySlug,
    saveProduct,
    deleteImage,
    deleteProduct,
    listStores,
    getStore,
    saveStore,
    deleteStore,
    createOrder,
    getOrder,
    findOrder,
    listOrders,
    setOrderStatus,
    setOrderHandling,
    orderCounts,
    toPrepare,
    listSuppliers,
    getSupplier,
    saveSupplier,
    deleteSupplier,
    accounts,
    settle,
    listSettlements,
    earnings,
    stats,
    getSetting,
    setSetting,
  };
}

module.exports = { createRepo, OrderError };
