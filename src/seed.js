// Données de démonstration : à supprimer / remplacer par les vrais produits depuis l'admin.
const ADULT_M = ['39', '40', '41', '42', '43', '44', '45'];
const ADULT_F = ['36', '37', '38', '39', '40', '41'];
const KIDS = ['28', '29', '30', '31', '32', '33', '34', '35'];
const BABY = ['18', '19', '20', '21', '22', '23', '24'];

const PRODUCTS = [
  ['Basket Urban Run', 'homme', 'baskets', 'Noir', 'Stride', 6900, 8500, true, ADULT_M, 'Basket légère avec semelle amortissante, idéale pour la ville et la marche quotidienne.'],
  ['Basket Classic Cuir', 'homme', 'baskets', 'Blanc', 'Stride', 7900, null, true, ADULT_M, 'Le grand classique en cuir blanc, facile à porter avec tout.'],
  ['Mocassin Florence', 'homme', 'mocassins', 'Marron', 'Milano', 9500, null, false, ADULT_M, 'Mocassin en cuir souple, cousu main, pour les grandes occasions comme pour le bureau.'],
  ['Derby Business', 'homme', 'chaussures-ville', 'Noir', 'Milano', 11500, 13000, false, ADULT_M, 'Chaussure de ville élégante, semelle antidérapante.'],
  ['Claquette Comfort', 'homme', 'claquettes', 'Noir', 'Aqua', 1900, null, false, ADULT_M, 'Claquette moelleuse pour la plage, la piscine ou la maison.'],
  ['Sandale Sahara', 'homme', 'sandales', 'Camel', 'Atlas', 4500, null, false, ADULT_M, 'Sandale en cuir avec brides réglables, parfaite pour l’été.'],
  ['Bottine Chelsea', 'homme', 'bottes', 'Marron', 'Atlas', 12900, null, true, ADULT_M, 'Bottine Chelsea en daim avec élastiques latéraux.'],
  ['Running Pro', 'homme', 'sport', 'Bleu', 'Stride', 9900, 11900, false, ADULT_M, 'Chaussure de running respirante pour vos entraînements.'],

  ['Escarpin Soirée', 'femme', 'escarpins', 'Noir', 'Bella', 7500, null, true, ADULT_F, 'Escarpin verni talon 8 cm, chic et confortable.'],
  ['Ballerine Rosa', 'femme', 'ballerines', 'Rose', 'Bella', 3900, 4900, false, ADULT_F, 'Ballerine souple avec petit nœud, idéale au quotidien.'],
  ['Sandale Dorée', 'femme', 'sandales', 'Doré', 'Bella', 5200, null, true, ADULT_F, 'Sandale à brides fines dorées pour les fêtes et mariages.'],
  ['Basket Cloud', 'femme', 'baskets', 'Blanc', 'Stride', 6500, null, false, ADULT_F, 'Basket à semelle épaisse, ultra confortable.'],
  ['Claquette Plage', 'femme', 'claquettes', 'Beige', 'Aqua', 1700, null, false, ADULT_F, 'Claquette légère et résistante à l’eau.'],
  ['Bottes Hiver', 'femme', 'bottes', 'Camel', 'Atlas', 13500, 15900, false, ADULT_F, 'Bottes hautes doublées, chaudes pour l’hiver.'],
  ['Pantoufle Douceur', 'femme', 'pantoufles', 'Gris', 'Home', 1500, null, false, ADULT_F, 'Pantoufle en fausse fourrure pour la maison.'],

  ['Basket Lumineuse', 'garcon', 'baskets', 'Bleu', 'Kids', 4200, null, true, KIDS, 'Basket à scratch avec semelle lumineuse, les enfants adorent !'],
  ['Sandale Aventure', 'garcon', 'sandales', 'Kaki', 'Kids', 2900, null, false, KIDS, 'Sandale fermée à l’avant pour protéger les orteils.'],
  ['Basket Paillettes', 'fille', 'baskets', 'Rose', 'Kids', 4200, 4900, true, KIDS, 'Basket à paillettes avec fermeture scratch.'],
  ['Ballerine Princesse', 'fille', 'ballerines', 'Argent', 'Kids', 3200, null, false, KIDS, 'Ballerine brillante pour les fêtes.'],
  ['Claquette Licorne', 'fille', 'claquettes', 'Violet', 'Kids', 1500, null, false, KIDS, 'Claquette colorée motif licorne.'],
  ['Premiers Pas', 'bebe', 'baskets', 'Blanc', 'Kids', 2900, null, false, BABY, 'Chaussure souple spéciale premiers pas, recommandée pour bien marcher.'],

  ['Chaussettes Coton x5', 'homme', 'accessoires', 'Multicolore', 'Home', 1200, null, false, ['39-42', '43-46'], 'Lot de 5 paires de chaussettes en coton.'],
  ['Socquettes Femme x3', 'femme', 'accessoires', 'Blanc', 'Home', 800, null, false, ['35-38', '39-42'], 'Lot de 3 paires de socquettes invisibles.'],
];

const STORES = [
  ['Seddik Shoes — Centre-ville', 'Alger', '12 rue Didouche Mourad, Alger Centre', '0555 11 11 11', 'Sam–Jeu : 9h – 20h', ''],
  ['Seddik Shoes — Bab Ezzouar', 'Alger', 'Centre commercial, Bab Ezzouar', '0555 22 22 22', 'Tous les jours : 10h – 21h', ''],
  ['Seddik Shoes — Blida', 'Blida', 'Boulevard Larbi Tebessi, Blida', '0555 33 33 33', 'Sam–Jeu : 9h – 19h', ''],
];

function seedDemo(repo) {
  if (repo.listProducts({ includeInactive: true, perPage: 1 }).total > 0) return false;
  PRODUCTS.forEach(([name, gender, category, color, brand, price, oldPrice, featured, sizes, description], i) => {
    repo.saveProduct({
      name,
      gender,
      category,
      color,
      brand,
      price,
      old_price: oldPrice,
      featured,
      active: true,
      description,
      sizes: sizes.map((size, j) => ({ size, stock: (i + j) % 7 === 0 ? 0 : ((i * 3 + j) % 6) + 1 })),
    });
  });
  if (repo.listStores().length === 0) {
    for (const [name, city, address, phone, hours, map_url] of STORES) {
      repo.saveStore({ name, city, address, phone, hours, map_url });
    }
  }
  return true;
}

module.exports = { seedDemo };
