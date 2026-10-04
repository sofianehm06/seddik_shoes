const crypto = require('node:crypto');
const config = require('./config');

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'produit';
}

function formatPrice(amount) {
  return `${Math.round(amount).toLocaleString('fr-FR').replace(/ | /g, ' ')} ${config.currency}`;
}

function label(list, slug) {
  const item = list.find((x) => x.slug === slug);
  return item ? item.label : slug;
}

function deliveryFee(mode, wilaya, subtotal) {
  if (mode === 'boutique') return 0;
  const { delivery } = config;
  if (delivery.freeAbove && subtotal >= delivery.freeAbove) return 0;
  const override = delivery.overrides[wilaya] || {};
  if (mode === 'stopdesk') return override.desk ?? delivery.deskFee;
  return override.home ?? delivery.homeFee;
}

// Mots de passe : scrypt avec sel aléatoire, stocké "sel:hash".
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

// Session admin dans un cookie signé (HMAC) : pas de stockage serveur nécessaire.
function signSession(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function readSession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[key] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function orderRef() {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `SS-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Numéros algériens : 05/06/07 + 8 chiffres (mobile) ou fixe 0XX XX XX XX.
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+213')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('00213')) digits = '0' + digits.slice(5);
  else if (digits.startsWith('213') && digits.length === 12) digits = '0' + digits.slice(3);
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

module.exports = {
  slugify,
  formatPrice,
  label,
  deliveryFee,
  hashPassword,
  verifyPassword,
  signSession,
  readSession,
  parseCookies,
  orderRef,
  normalizePhone,
};
