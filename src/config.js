// Paramètres de la boutique : à adapter au client (nom, contacts, livraison...).
module.exports = {
  shop: {
    name: process.env.SHOP_NAME || 'Bougie Shoes',
    slogan: 'Chaussures pour toute la famille, depuis Béjaïa vers les 58 wilayas.',
    city: 'Béjaïa',
    phones: (process.env.SHOP_PHONES || '0562 08 95 92,0674 90 83 55,0779 22 38 50').split(',').map((p) => p.trim()),
    whatsapp: process.env.SHOP_WHATSAPP || '213562089592', // bouton WhatsApp du site : format international, sans "+"
    email: process.env.SHOP_EMAIL || 'shoesbougie@gmail.com',
    facebook: process.env.SHOP_FACEBOOK || '',
    instagram: process.env.SHOP_INSTAGRAM || '',
  },

  // E-mail envoyé à chaque nouvelle commande (voir README > Notifications par e-mail).
  notifications: {
    to: process.env.NOTIFY_EMAIL || process.env.SHOP_EMAIL || 'shoesbougie@gmail.com',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    // Adresse du site, pour le lien vers la commande dans l'e-mail (ex : https://bougieshoes.com).
    siteUrl: (process.env.SITE_URL || '').replace(/\/$/, ''),
  },

  currency: 'DA',

  // Genres (rayons) affichés dans le menu.
  genders: [
    { slug: 'homme', label: 'Homme' },
    { slug: 'femme', label: 'Femme' },
    { slug: 'garcon', label: 'Garçon' },
    { slug: 'fille', label: 'Fille' },
    { slug: 'bebe', label: 'Bébé' },
  ],

  // Types de produits.
  categories: [
    { slug: 'baskets', label: 'Baskets' },
    { slug: 'chaussures-ville', label: 'Chaussures de ville' },
    { slug: 'mocassins', label: 'Mocassins' },
    { slug: 'sandales', label: 'Sandales' },
    { slug: 'claquettes', label: 'Claquettes' },
    { slug: 'tongs', label: 'Tongs' },
    { slug: 'escarpins', label: 'Escarpins' },
    { slug: 'ballerines', label: 'Ballerines' },
    { slug: 'bottes', label: 'Bottes & bottines' },
    { slug: 'pantoufles', label: 'Pantoufles' },
    { slug: 'sport', label: 'Chaussures de sport' },
    { slug: 'accessoires', label: 'Chaussettes & accessoires' },
  ],

  delivery: {
    homeFee: 600, // frais de livraison à domicile par défaut
    deskFee: 400, // frais "stop desk" (point relais du livreur)
    freeAbove: 0, // livraison offerte à partir de ce montant (0 = jamais, offre désactivée)
    // Tarifs particuliers par wilaya : { 'Alger': { home: 400, desk: 250 } }
    // Wilayas où tu livres toi-même : la livraison est marquée "par moi" par défaut.
    localWilayas: ['Béjaïa'],
    overrides: {
      Béjaïa: { home: 300, desk: 300 },
      Alger: { home: 400, desk: 250 },
      Blida: { home: 500, desk: 300 },
      Boumerdès: { home: 500, desk: 300 },
      Tipaza: { home: 500, desk: 300 },
      Adrar: { home: 1200, desk: 800 },
      Tamanrasset: { home: 1500, desk: 1000 },
      Illizi: { home: 1500, desk: 1000 },
      Tindouf: { home: 1500, desk: 1000 },
    },
  },

  wilayas: [
    'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Béjaïa', 'Biskra', 'Béchar',
    'Blida', 'Bouira', 'Tamanrasset', 'Tébessa', 'Tlemcen', 'Tiaret', 'Tizi Ouzou', 'Alger',
    'Djelfa', 'Jijel', 'Sétif', 'Saïda', 'Skikda', 'Sidi Bel Abbès', 'Annaba', 'Guelma',
    'Constantine', 'Médéa', 'Mostaganem', "M'Sila", 'Mascara', 'Ouargla', 'Oran', 'El Bayadh',
    'Illizi', 'Bordj Bou Arréridj', 'Boumerdès', 'El Tarf', 'Tindouf', 'Tissemsilt', 'El Oued',
    'Khenchela', 'Souk Ahras', 'Tipaza', 'Mila', 'Aïn Defla', 'Naâma', 'Aïn Témouchent',
    'Ghardaïa', 'Relizane', 'Timimoun', 'Bordj Badji Mokhtar', 'Ouled Djellal', 'Béni Abbès',
    'In Salah', 'In Guezzam', 'Touggourt', 'Djanet', "El M'Ghair", 'El Meniaa',
  ],

  // Statuts où les articles ne sont pas vendus (remis en disponibilité, pas comptés dans les comptes).
  cancelledStatuses: ['annulee', 'retour'],

  orderStatuses: [
    { slug: 'nouvelle', label: 'Nouvelle' },
    { slug: 'confirmee', label: 'Confirmée' },
    { slug: 'expediee', label: 'Expédiée' },
    { slug: 'livree', label: 'Livrée' },
    { slug: 'retour', label: 'Retournée' },
    { slug: 'annulee', label: 'Annulée' },
  ],
};
