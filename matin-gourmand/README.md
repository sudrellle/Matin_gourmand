# Matin Gourmand

Plateforme e-commerce de pâtisserie avec boutique client, panier, checkout, suivi privé des commandes et back-office protégé.

## Prérequis

- Node.js 20.9 ou plus récent
- npm
- Un serveur SMTP pour l’envoi des codes OTP et des emails transactionnels

## Installation

```powershell
npm install
Copy-Item .env.example .env
```

Renseignez les variables dans `.env`. Ne partagez pas et ne publiez jamais ce fichier. Il est ignoré par Git.

Les variables requises pour la connexion administrateur sont :

- `APP_ORIGIN` : origine exacte de l’application, par exemple `http://127.0.0.1:3000` en local
- `DATABASE_PATH` : chemin vers la base SQLite locale
- `SESSION_SECRET` et `OTP_SECRET` : secrets aléatoires d’au moins 32 caractères chacun
- `ADMIN_EMAIL` et `ADMIN_PASSWORD` : compte initial ; mot de passe d’au moins 8 caractères avec majuscule, minuscule, chiffre et caractère spécial
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` : paramètres du serveur email, nécessaires à l’OTP

Générez une valeur aléatoire pour les secrets avec Node.js :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Créez ensuite le premier administrateur :

```powershell
npm run admin:create
```

La commande hache le mot de passe avant de le stocker. Elle ne crée pas de compte par défaut et ne modifie pas un compte existant.

## Développement

```powershell
npm run dev
```

La boutique est disponible sur `http://127.0.0.1:3000` et la connexion d’administration sur `/admin/connexion`.

Commandes de vérification :

```powershell
npm run lint
npm run build
```

## Sécurité

- Les opérations sensibles sont vérifiées côté serveur avec des rôles, une session en cookie HttpOnly, des contrôles CSRF, une limitation de débit et une journalisation d’audit.
- Les totaux, frais, acomptes et stocks sont recalculés depuis SQLite au moment de la commande.
- Les OTP sont à usage unique, expirent après deux minutes et ne sont pas stockés en clair.
- Les secrets locaux (`.env`) et les bases de données (`data/`, `*.db`) ne sont pas destinés au dépôt Git.
- HTTPS, une base de données persistante adaptée à l’hébergement choisi, la sauvegarde et les fournisseurs transactionnels doivent être configurés avant la production.

## Intégrations

Les emails transactionnels sont envoyés via SMTP. L’email de nouvelle commande contient le logo et le récapitulatif complet.

Le paiement Mobile Money et WhatsApp sont prévus côté serveur. Ils nécessitent les identifiants d’un fournisseur compatible ; aucun PIN Mobile Money n’est demandé ou stocké par l’application.
