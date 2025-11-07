# Extension Chrome 654 - LinkedIn Session Extractor

Extension interne 321 pour extraire cookies et user agent LinkedIn vers l'API 654-memento avec authentification OAuth Google.

## Documentation

- **[README.md](README.md)** (ce fichier) - Vue d'ensemble et utilisation
- **[INSTALL.md](INSTALL.md)** - 📘 **Guide d'installation étape par étape**
- **[TODO.md](TODO.md)** - Checklist setup initial et tâches à faire
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Solutions aux erreurs communes

## Installation

1. Chrome → `chrome://extensions/`
2. Activer "Mode développeur"
3. "Charger l'extension non empaquetée"
4. Sélectionner le dossier `/data/dev/654-extension/`

### ⚠️ IMPORTANT - Mode développeur

En mode développeur, vous devez générer une **clé stable** pour que `chrome.identity` fonctionne correctement :

```bash
cd /data/dev/654-extension
./generate-key.sh
```

Puis copier la clé générée dans `manifest.json` comme indiqué par le script. **Sans cette étape, vous obtiendrez l'erreur** : `Cannot read properties of undefined (reading 'getRedirectURL')`.

Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md#1-cannot-read-properties-of-undefined-reading-getredirecturl) pour plus de détails.

L'extension utilise le logo 654 (dégradé violet/cyan) pour ses icônes.

## Authentification

### Première utilisation

1. Cliquer sur l'icône de l'extension
2. Cliquer sur "Se connecter avec Google"
3. Authentification Google OAuth (écran de connexion Google)
4. Autoriser l'accès (profile + email)
5. L'extension récupère automatiquement un token API unique

### Avantages du système OAuth

- **Token individuel par utilisateur** : Chaque membre de l'équipe a son propre token
- **Traçabilité** : L'API sait quel utilisateur envoie ses cookies
- **Révocable** : Les tokens peuvent être révoqués individuellement
- **Pas d'API key partagée** : Plus sécurisé qu'une clé commune

### Déconnexion

Cliquer sur "Se déconnecter" dans la popup pour supprimer le token local.

## Utilisation

1. Aller sur LinkedIn
2. Au premier usage ou si la session est invalide, un **modal fullpage bloquant** apparaît
3. Cliquer sur "Envoyer mes informations" pour transmettre cookies + user agent
4. Le modal disparaît après envoi réussi
5. L'extension vérifie automatiquement la validité toutes les **15 minutes**
6. Si la session devient invalide côté serveur, le modal réapparaît automatiquement

## Architecture

```
654-extension/
├── manifest.json       # Manifest V3, permissions (identity, cookies, storage)
├── background.js       # Service worker, récupération cookies
├── auth.js             # OAuth flow Google + échange code → token API
├── api_client.js       # Client API avec Bearer token
├── content.js          # Modal fullpage bloquant + vérification périodique
├── styles.css          # Styles modal
├── popup.html          # Interface login/logout
├── popup.js            # Gestion authentification utilisateur
└── icon*.png           # Icônes 16x16, 48x48, 128x128
```

## API Backend

L'extension communique avec deux endpoints:

### 1. Authentification OAuth (POST)

**Endpoint**: `POST /api/auth/extension`

Échange un code d'autorisation Google OAuth contre un token API unique.

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "code": "4/0AfJ...",
  "redirect_uri": "https://..."
}
```

**Response**:
```json
{
  "success": true,
  "token": "uuid-token",
  "email": "prenom.nom@321.com",
  "name": "Prénom Nom"
}
```

### 2. Profil utilisateur (GET/PATCH)

**Endpoint**: `/api/me`

Endpoint unifié pour gérer le profil utilisateur et sa session LinkedIn.

#### PATCH - Mise à jour de la session LinkedIn

**Headers**:
```
Content-Type: application/json
Authorization: Bearer {token}
```

**Body**:
```json
{
  "linkedin": {
    "cookie": "AQEDAT...",
    "user_agent": "Mozilla/5.0..."
  }
}
```

L'utilisateur est identifié via le Bearer token. Seul le cookie `li_at` est envoyé.

**Response**:
```json
{
  "success": true,
  "message": "Profil mis à jour"
}
```

#### GET - Vérification de validité

**Headers**:
```
Authorization: Bearer {token}
```

**Response**:
```json
{
  "valid": true,
  "linkedin_session": {
    "cookie": "AQEDAT...",
    "user_agent": "Mozilla/5.0...",
    "valid": true,
    "date": "2025-11-06T..."
  },
  "updated_at": "2025-11-06T..."
}
```

Si `valid: false`, l'extension réaffiche automatiquement le modal bloquant.

## Flow d'authentification

### 1. Login initial

```
User clique "Se connecter"
    ↓
chrome.identity.launchWebAuthFlow()
    ↓
Écran Google OAuth (login + autorisation)
    ↓
Google redirige avec code d'autorisation
    ↓
Extension → POST /api/auth/extension {code}
    ↓
Backend échange code avec Google
    ↓
Backend crée/récupère user Django
    ↓
Backend génère token API (UUID)
    ↓
Extension stocke token + email localement
```

### 2. Utilisation de l'API

```
Extension → PATCH /api/me
Headers: Authorization: Bearer {token}
Body: {linkedin: {cookie, user_agent}}
    ↓
Middleware valide token
    ↓
Récupère user depuis APIToken model
    ↓
Définit request.user
    ↓
View crée/met à jour UserProfile avec linkedin_session
```

### 3. Expiration/Révocation

- Token invalide → API retourne 401
- Extension détecte 401 → déconnecte automatiquement
- User doit se reconnecter

## Fonctionnement du système de validation

1. **Premier usage**: Modal affiché automatiquement
2. **Après envoi réussi**: Timestamp enregistré localement
3. **Vérification périodique**: Toutes les 15 minutes
   - Si < 15 min depuis dernière validation: pas de check serveur
   - Si ≥ 15 min: appel à `GET /api/me`
   - Si `valid: false`: modal réaffiché automatiquement
4. **Modal bloquant**: L'utilisateur ne peut pas fermer le modal sans envoyer ses infos

## Backend Setup

> **Note**: Voir aussi [TODO.md](TODO.md) pour la checklist complète du setup initial.

### 1. Créer les migrations Django

```bash
cd /data/assistants/654-memento/webapp
python manage.py makemigrations authentication
python manage.py migrate
```

Ceci crée les tables:
- `APIToken` pour stocker les tokens utilisateurs
- `UserProfile` pour stocker les sessions LinkedIn (cookie li_at + user agent)

### 2. Vérifier les OAuth credentials

Fichier `.env` doit contenir:
```
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

### 3. Admin Django

L'admin Django permet de gérer:
- `/admin/authentication/apitoken/` - Voir/révoquer les tokens par utilisateur
- `/admin/authentication/userprofile/` - Voir les sessions LinkedIn et leur validité

## Notes

- Extension interne, ne pas publier sur le Chrome Web Store
- Utilise le même Client ID OAuth que la webapp (django-allauth)
- Tokens persistants (pas d'expiration automatique)
- Révocation manuelle via admin Django ou déconnexion de l'extension
- Utilisation pour PhantomBuster
- Le modal utilise le dégradé 654 (violet/cyan)
