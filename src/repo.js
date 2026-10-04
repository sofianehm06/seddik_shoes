const config = require('./config');
const { transaction } = require('./db');
const { slugify, deliveryFee, orderRef } = require('./lib');

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
    product.totalStock = product.sizes.reduce((sum, s) => sum + s.stock, 0);
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
    if (filters.size) {
      where.push('EXISTS (SELECT 1 FROM product_sizes s WHERE s.product_id = p.id AND s.size = ? AND s.stock > 0)');
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
      .prepare(`SELECT p.* FROM products p ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
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
         WHERE p.active = 1 AND s.stock > 0 ORDER BY CAST(s.size AS REAL), s.size`
      )
      .all()
      .map((r) => r.size);
  }

  function getProduct(id) {
    return hydrate(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
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
        data.featured ? 1 : 0,
        data.active ? 1 : 0,
      ];
      if (id) {
        db.prepare(
          `UPDATE products SET name=?, description=?, brand=?, gender=?, category=?, color=?, price=?,
           old_price=?, featured=?, active=?, slug=? WHERE id=?`
        ).run(...fields, uniqueSlug(data.name, id), id);
      } else {
        id = Number(
          db
            .prepare(
              `INSERT INTO products (name, description, brand, gender, category, color, price, old_price,
               featured, active, slug) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
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

  // --- Commandes ---
  // Les prix sont recalculés côté serveur : on ne fait jamais confiance au panier du navigateur.
  function createOrder(input) {
    return transaction(db, () => {
      const lines = [];
      for (const item of input.items) {
        const product = db.prepare('SELECT id, name, price FROM products WHERE id = ? AND active = 1').get(item.productId);
        if (!product) throw new OrderError("Un article de votre panier n'est plus disponible.");
        const size = db
          .prepare('SELECT stock FROM product_sizes WHERE product_id = ? AND size = ?')
          .get(product.id, String(item.size));
        if (!size) throw new OrderError(`La pointure ${item.size} n'existe pas pour « ${product.name} ».`);
        const already = lines.filter((l) => l.productId === product.id && l.size === String(item.size))
          .reduce((n, l) => n + l.qty, 0);
        if (size.stock < item.qty + already) {
          throw new OrderError(
            size.stock - already > 0
              ? `Il ne reste que ${size.stock - already} paire(s) de « ${product.name} » en ${item.size}.`
              : `« ${product.name} » en ${item.size} est en rupture de stock.`
          );
        }
        lines.push({ productId: product.id, name: product.name, size: String(item.size), price: product.price, qty: item.qty });
      }
      if (!lines.length) throw new OrderError('Votre panier est vide.');

      const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const fee = deliveryFee(input.deliveryMode, input.wilaya, subtotal);
      const ref = orderRef();
      const orderId = Number(
        db
          .prepare(
            `INSERT INTO orders (ref, customer_name, phone, wilaya, commune, address, delivery_mode, store_id, note,
             subtotal, delivery_fee, total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
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
            subtotal + fee
          ).lastInsertRowid
      );
      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, name, size, price, qty) VALUES (?,?,?,?,?,?)'
      );
      const destock = db.prepare('UPDATE product_sizes SET stock = stock - ? WHERE product_id = ? AND size = ?');
      for (const l of lines) {
        insertItem.run(orderId, l.productId, l.name, l.size, l.price, l.qty);
        destock.run(l.qty, l.productId, l.size);
      }
      return { id: orderId, ref, total: subtotal + fee };
    });
  }

  function getOrder(id) {
    const order = db
      .prepare('SELECT o.*, s.name AS store_name, s.city AS store_city FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = ?')
      .get(id);
    if (order) order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
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

  // Annuler une commande remet les articles en stock ; la réactiver les retire à nouveau.
  function setOrderStatus(id, status) {
    if (!config.orderStatuses.some((s) => s.slug === status)) throw new OrderError('Statut inconnu.');
    return transaction(db, () => {
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
      if (!order) return false;
      const wasCancelled = order.status === 'annulee';
      const isCancelled = status === 'annulee';
      if (wasCancelled !== isCancelled) {
        const sign = isCancelled ? 1 : -1;
        const items = db.prepare('SELECT product_id, size, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').all(id);
        const update = db.prepare('UPDATE product_sizes SET stock = MAX(0, stock + ?) WHERE product_id = ? AND size = ?');
        for (const it of items) update.run(sign * it.qty, it.product_id, it.size);
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
      return true;
    });
  }

  function stats() {
    const one = (sql) => db.prepare(sql).get().n;
    return {
      newOrders: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'nouvelle'"),
      ordersToday: one("SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = date('now')"),
      revenueMonth: one(
        "SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status = 'livree' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
      ),
      products: one('SELECT COUNT(*) AS n FROM products WHERE active = 1'),
      lowStock: db
        .prepare(
          `SELECT p.id, p.name, s.size, s.stock FROM product_sizes s JOIN products p ON p.id = s.product_id
           WHERE p.active = 1 AND s.stock <= 2 ORDER BY s.stock, p.name LIMIT 15`
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
    stats,
    getSetting,
    setSetting,
  };
}

module.exports = { createRepo, OrderError };
