const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      default_commission_type TEXT NOT NULL DEFAULT 'percent',
      default_commission_value INTEGER NOT NULL DEFAULT 10,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      old_price INTEGER,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      commission_type TEXT NOT NULL DEFAULT 'percent',
      commission_value INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS product_sizes (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      stock INTEGER, -- NULL = disponible sans quantité connue
      UNIQUE (product_id, size)
    );
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      hours TEXT NOT NULL DEFAULT '',
      map_url TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      ref TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      wilaya TEXT NOT NULL DEFAULT '',
      commune TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      delivery_mode TEXT NOT NULL,
      store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL,
      delivery_fee INTEGER NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'nouvelle',
      delivered_by TEXT NOT NULL DEFAULT 'fournisseur', -- 'moi' ou 'fournisseur'
      collected_by TEXT NOT NULL DEFAULT 'fournisseur', -- qui a encaissé l'argent
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL DEFAULT '',
      commission INTEGER NOT NULL DEFAULT 0, -- ta commission par paire, figée au moment de la commande
      settled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      amount INTEGER NOT NULL, -- > 0 : tu as payé le fournisseur ; < 0 : il t'a payé
      items INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { open, transaction };
