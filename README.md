# Bougie Shoes — boutique en ligne

Site e-commerce basé à Béjaïa pour vendre en ligne les chaussures de plusieurs fournisseurs
(homme, femme, garçon, fille, bébé : baskets, sandales, claquettes, mocassins, bottes, escarpins,
pantoufles, chaussettes…), avec une **commission par produit**.

## Comment ça marche

1. Tu mets les produits en ligne, chacun rattaché à son **fournisseur** avec **ta commission**
   (en % du prix ou en DA par paire). Tu indiques seulement les pointures disponibles :
   c'est le fournisseur qui connaît son stock.
2. Une commande arrive → tu appelles le client et tu la passes en **Confirmée**.
3. Page **À préparer** : les articles sont regroupés par fournisseur, un bouton envoie la liste
   sur **WhatsApp** au fournisseur, qui prépare la commande.
4. Sur chaque commande, tu notes **qui livre** (toi, par ex. à Béjaïa, ou le fournisseur via la
   société de livraison) et **qui encaisse** l'argent. Béjaïa = « moi » par défaut, le reste = « fournisseur ».
5. Commande **Livrée** (ou **Retournée** si le client refuse) → page **Comptes** :
   pour chaque fournisseur, ce que tu lui dois ou ce qu'il te doit, tes commissions et tes
   frais de livraison. Bouton « Marquer comme réglé » une fois l'argent échangé.

La commission est figée au moment de la commande : la modifier ensuite ne change pas les comptes passés.

## Fonctionnalités

**Côté client**
- Catalogue avec filtres : rayon, type, pointure disponible, prix, promotions, recherche, tri
- Fiche produit : photos, choix de la pointure (les pointures épuisées sont barrées), stock restant
- Panier (conservé dans le navigateur, prix toujours revérifiés par le serveur)
- Commande sans compte, **paiement à la livraison** : à domicile, en point relais (stop desk) ou retrait gratuit en boutique
- Frais de livraison par wilaya (58 wilayas) + livraison offerte au-delà d'un montant
- Page de confirmation et **suivi de commande** (n° de commande + téléphone)
- Points de retrait (optionnels), bouton WhatsApp, site adapté au mobile
- Le site n'affiche jamais le nom des fournisseurs aux clients

**Administration** (`/admin`)
- Tableau de bord : commandes à confirmer, à faire préparer, tes gains du mois
- Commandes : statut (nouvelle → confirmée → expédiée → livrée / retournée / annulée), qui livre, qui encaisse,
  message WhatsApp prêt pour chaque fournisseur, détail commission / part fournisseur
- À préparer : articles des commandes confirmées regroupés par fournisseur
- Produits : fournisseur, commission, photos, pointures disponibles (quantité facultative), promo, mise en avant
- Fournisseurs : coordonnées, WhatsApp, commission par défaut
- Comptes : gains par mois (commissions + livraisons faites par toi), soldes par fournisseur, historique des règlements
- Points de retrait (facultatif) : si tu en ajoutes, le client peut choisir le retrait gratuit
- Changement du mot de passe

## Sur PC et sur téléphone

Tout le site (boutique **et** administration) s'utilise aussi bien sur PC que sur téléphone, à la même adresse.
Sur téléphone, l'admin a une barre d'onglets en bas (Accueil, Commandes, À préparer, Produits, Comptes),
les tableaux s'affichent en cartes, et les photos prises avec le téléphone sont réduites automatiquement avant l'envoi.

**Installer l'admin comme une appli** : ouvre `https://ton-site/admin` sur le téléphone, puis
- Android (Chrome) : menu ⋮ → « Ajouter à l'écran d'accueil » / « Installer l'application »
- iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil »

## Lancer le site

Prérequis : **Node.js 22.5 ou plus récent** (la base SQLite est intégrée à Node, rien d'autre à installer).

```bash
npm install
ADMIN_PASSWORD=unMotDePasseSolide npm start
```

- Site : http://localhost:3000
- Admin : http://localhost:3000/admin

Si `ADMIN_PASSWORD` n'est pas défini au premier démarrage, un mot de passe est généré et affiché dans la console.

Des produits et fournisseurs de démonstration sont créés au premier démarrage (désactivable avec `SEED_DEMO=0`).
Supprimez-les depuis l'admin et ajoutez les vrais produits avec leurs photos.

## Personnalisation

Tout se règle dans [`src/config.js`](src/config.js) : nom de la boutique, téléphone, WhatsApp, e-mail,
réseaux sociaux, rayons, types de produits, frais de livraison par wilaya, seuil de livraison gratuite, wilayas où tu livres toi-même (`localWilayas`).

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
