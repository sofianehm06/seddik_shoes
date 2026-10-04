# Seddik Shoes — boutique en ligne

Site e-commerce pour vendre des chaussures (homme, femme, garçon, fille, bébé : baskets, sandales,
claquettes, mocassins, bottes, escarpins, pantoufles, chaussettes…).

## Fonctionnalités

**Côté client**
- Catalogue avec filtres : rayon, type, pointure disponible, prix, promotions, recherche, tri
- Fiche produit : photos, choix de la pointure (les pointures épuisées sont barrées), stock restant
- Panier (conservé dans le navigateur, prix toujours revérifiés par le serveur)
- Commande sans compte, **paiement à la livraison** : à domicile, en point relais (stop desk) ou retrait gratuit en boutique
- Frais de livraison par wilaya (58 wilayas) + livraison offerte au-delà d'un montant
- Page de confirmation et **suivi de commande** (n° de commande + téléphone)
- Page « Nos boutiques », bouton WhatsApp, site adapté au mobile

**Administration** (`/admin`)
- Tableau de bord : nouvelles commandes, CA du mois, alertes de stock faible
- Commandes : recherche, filtre par statut, changement de statut (nouvelle → confirmée → expédiée → livrée / annulée).
  Annuler une commande remet les articles en stock automatiquement.
- Produits : ajout / modification / suppression, photos (plusieurs par produit), pointures et stock, promo (ancien prix), mise en avant
- Boutiques physiques : adresses, horaires, téléphone, lien Google Maps
- Changement du mot de passe

## Lancer le site

Prérequis : **Node.js 22.5 ou plus récent** (la base SQLite est intégrée à Node, rien d'autre à installer).

```bash
npm install
ADMIN_PASSWORD=unMotDePasseSolide npm start
```

- Site : http://localhost:3000
- Admin : http://localhost:3000/admin

Si `ADMIN_PASSWORD` n'est pas défini au premier démarrage, un mot de passe est généré et affiché dans la console.

Des produits et boutiques de démonstration sont créés au premier démarrage (désactivable avec `SEED_DEMO=0`).
Supprimez-les depuis l'admin et ajoutez les vrais produits avec leurs photos.

## Personnalisation

Tout se règle dans [`src/config.js`](src/config.js) : nom de la boutique, téléphone, WhatsApp, e-mail,
réseaux sociaux, rayons, types de produits, frais de livraison par wilaya, seuil de livraison gratuite.

Variables d'environnement utiles :

| Variable | Rôle |
|---|---|
| `PORT` | Port HTTP (3000 par défaut) |
| `ADMIN_PASSWORD` | Mot de passe admin initial |
| `SESSION_SECRET` | Secret de signature des sessions (généré automatiquement sinon) |
| `DB_FILE` | Chemin de la base SQLite (`data/boutique.db` par défaut) |
| `UPLOADS_DIR` | Dossier des photos produits (`uploads/` par défaut) |
| `SHOP_NAME`, `SHOP_PHONE`, `SHOP_WHATSAPP`, `SHOP_EMAIL`, `SHOP_FACEBOOK`, `SHOP_INSTAGRAM` | Infos de la boutique |
| `SEED_DEMO=0` | Ne pas créer les données de démonstration |

## Mise en ligne

N'importe quel hébergeur Node.js (VPS, Render, Railway, Hostinger VPS…) avec un **disque persistant**
pour `data/` (la base) et `uploads/` (les photos). Mettez le site derrière HTTPS (Nginx/Caddy ou l'hébergeur).
Sauvegardez régulièrement ces deux dossiers.

## Tests

```bash
npm test
```

## Structure

```
server.js            démarrage
src/app.js           configuration Express
src/config.js        paramètres de la boutique
src/db.js            schéma SQLite
src/repo.js          accès aux données (produits, commandes, stock…)
src/routes/shop.js   pages publiques + API panier/commande
src/routes/admin.js  administration
views/               pages (EJS)
public/              CSS, JavaScript, images
```
