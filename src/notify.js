const nodemailer = require('nodemailer');
const config = require('./config');
const { formatPrice } = require('./lib');

const MODES = { domicile: 'À domicile', stopdesk: 'Stop desk', boutique: 'Retrait sur place' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function orderEmail(order) {
  const { siteUrl } = config.notifications;
  const link = siteUrl ? `${siteUrl}/admin/commandes/${order.id}` : '';
  const commission = order.items.reduce((s, i) => s + i.commission * i.qty, 0);
  const where =
    order.delivery_mode === 'boutique'
      ? `${MODES.boutique} : ${order.store_name || ''}`
      : `${MODES[order.delivery_mode]} — ${order.wilaya}${order.commune ? ', ' + order.commune : ''}${order.address ? ', ' + order.address : ''}`;

  const lines = order.items.map(
    (i) => `• ${i.name} — pointure ${i.size} × ${i.qty} — ${formatPrice(i.price * i.qty)}${i.supplier_name ? ` (${i.supplier_name})` : ''}`
  );
  const text = [
    `Nouvelle commande ${order.ref}`,
    '',
    `Client : ${order.customer_name}`,
    `Téléphone : ${order.phone}`,
    `Livraison : ${where}`,
    order.note ? `Remarque : ${order.note}` : null,
    '',
    ...lines,
    '',
    `Livraison : ${order.delivery_fee ? formatPrice(order.delivery_fee) : 'gratuite'}`,
    `Total à encaisser : ${formatPrice(order.total)}`,
    `Ta commission : ${formatPrice(commission)}`,
    link ? `\nVoir la commande : ${link}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(i.name)}<br><small style="color:#78716c">${esc(i.supplier_name || '')}</small></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center"><b>${esc(i.size)}</b></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatPrice(i.price * i.qty)}</td>
      </tr>`
    )
    .join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1c1917">
    <h2 style="color:#c2410c;margin-bottom:4px">🛒 Nouvelle commande</h2>
    <p style="margin-top:0;color:#78716c">${esc(order.ref)}</p>
    <p><b>${esc(order.customer_name)}</b><br>
      📞 <a href="tel:${esc(order.phone)}">${esc(order.phone)}</a><br>
      🚚 ${esc(where)}${order.note ? `<br>📝 <i>${esc(order.note)}</i>` : ''}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f5f5f4"><th style="padding:6px 8px;text-align:left">Article</th><th style="padding:6px 8px">Pointure</th><th style="padding:6px 8px">Qté</th><th style="padding:6px 8px;text-align:right">Prix</th></tr>
      ${rows}
      <tr><td colspan="3" style="padding:6px 8px">Livraison</td><td style="padding:6px 8px;text-align:right">${order.delivery_fee ? formatPrice(order.delivery_fee) : 'Gratuite'}</td></tr>
      <tr><td colspan="3" style="padding:6px 8px"><b>Total à encaisser</b></td><td style="padding:6px 8px;text-align:right"><b>${formatPrice(order.total)}</b></td></tr>
      <tr><td colspan="3" style="padding:6px 8px;color:#15803d">Ta commission</td><td style="padding:6px 8px;text-align:right;color:#15803d">${formatPrice(commission)}</td></tr>
    </table>
    ${link ? `<p style="margin-top:20px"><a href="${esc(link)}" style="background:#ea580c;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Ouvrir la commande</a></p>` : ''}
  </div>`;

  return {
    subject: `🛒 Nouvelle commande ${order.ref} — ${order.customer_name} (${formatPrice(order.total)})`,
    text,
    html,
  };
}

// Sans identifiants SMTP, les notifications sont simplement désactivées (le site fonctionne quand même).
function createNotifier(options = {}) {
  const { smtp, to } = config.notifications;
  let transport = options.transport;
  if (!transport && smtp.user && smtp.pass) {
    transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }
  return {
    enabled: Boolean(transport),
    to,
    async test() {
      if (!transport) throw new Error('SMTP_USER / SMTP_PASS non configurés.');
      return transport.sendMail({
        from: `"${config.shop.name}" <${smtp.user || config.shop.email}>`,
        to,
        subject: `✅ Test des notifications ${config.shop.name}`,
        text: 'Les notifications de commande fonctionnent. Tu recevras un e-mail comme celui-ci à chaque nouvelle commande.',
      });
    },
    async newOrder(order) {
      if (!transport || !to) return null;
      const mail = orderEmail(order);
      return transport.sendMail({
        from: `"${config.shop.name}" <${smtp.user || config.shop.email}>`,
        to,
        ...mail,
      });
    },
  };
}

module.exports = { createNotifier, orderEmail };
