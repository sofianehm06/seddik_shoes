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
| `SHOP_NAME`, `SHOP_PHONES` (séparés par des virgules), `SHOP_WHATSAPP`, `SHOP_EMAIL`, `SHOP_FACEBOOK`, `SHOP_INSTAGRAM` | Infos de la boutique |
| `SMTP_USER`, `SMTP_PASS` | Compte Gmail qui envoie les notifications de commande (voir ci-dessous) |
| `NOTIFY_EMAIL` | Adresse qui reçoit les notifications (par défaut `shoesbougie@gmail.com`) |
| `SITE_URL` | Adresse du site, ex. `https://bougieshoes.com` (pour le lien « Ouvrir la commande » dans l'e-mail) |
| `SMTP_HOST`, `SMTP_PORT` | Autre serveur d'envoi si besoin (par défaut `smtp.gmail.com`, `465`) |
| `SEED_DEMO=0` | Ne pas créer les données de démonstration |

## Notifications par e-mail

À chaque nouvelle commande, un e-mail part vers `shoesbougie@gmail.com` avec le client, le téléphone,
l'adresse, les articles (et leur fournisseur), le total et ta commission, plus un bouton « Ouvrir la commande ».
Sur le téléphone, active les notifications de l'appli Gmail pour être prévenu tout de suite.

Gmail n'accepte pas le mot de passe normal pour envoyer depuis un site : il faut un **mot de passe d'application**.

1. Connecte-toi à `shoesbougie@gmail.com` → https://myaccount.google.com/security
2. Active la **validation en deux étapes** (obligatoire).
3. Va sur https://myaccount.google.com/apppasswords → nom : « Site Bougie Shoes » → **Créer**.
4. Google affiche 16 lettres : copie-les.
5. Chez l'hébergeur, ajoute les variables :
   `SMTP_USER=shoesbougie@gmail.com`, `SMTP_PASS=les16lettres` (sans espaces), `SITE_URL=https://ton-domaine`
6. Redémarre l'application, va dans l'admin → bouton **« Envoyer un e-mail de test »**.

Si l'e-mail n'arrive pas : regarde dans les spams, et vérifie que l'hébergeur autorise l'envoi vers
`smtp.gmail.com` (sinon, utilise l'e-mail de l'hébergeur avec `SMTP_HOST` / `SMTP_PORT`).
Si l'envoi échoue, la commande est quand même enregistrée normalement.

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
