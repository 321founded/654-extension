# Troubleshooting - Extension 654

## Erreurs communes et solutions

### 1. "Cannot read properties of undefined (reading 'getRedirectURL')"

**Erreur complète**:
```
Uncaught TypeError: Cannot read properties of undefined (reading 'getRedirectURL')
```

**Cause**:
L'API `chrome.identity` n'est pas disponible. Plusieurs raisons possibles :
1. Extension chargée en mode développeur sans ID stable
2. Permission `identity` manquante dans le manifest
3. Chrome n'a pas encore initialisé les APIs

**Solutions** :

**A. Recharger l'extension** (solution la plus simple)
1. Aller dans `chrome://extensions/`
2. Trouver l'extension "654 LinkedIn Session Extractor"
3. Cliquer sur le bouton circulaire de rechargement
4. Rouvrir la popup et réessayer

**B. Vérifier les permissions**
```json
// manifest.json doit contenir :
"permissions": [
  "identity"
]
```

**C. Extension ID instable (mode développeur)**

En mode développeur, l'ID de l'extension peut changer à chaque rechargement, ce qui peut causer des problèmes avec `chrome.identity`.

Solution : Ajouter une clé fixe dans le manifest
1. Générer une clé :
   ```bash
   # Dans le dossier de l'extension
   openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
   openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A > key.txt
   ```

2. Ajouter dans `manifest.json` :
   ```json
   {
     "key": "contenu de key.txt ici...",
     "manifest_version": 3,
     ...
   }
   ```

**D. Utiliser Chrome Web Store (production)**

En production, publier l'extension sur Chrome Web Store (mode privé) élimine ces problèmes car l'ID est stable.

### 2. "Cannot access 'REDIRECT_URI' before initialization" (RÉSOLU)

**Erreur complète**:
```
Uncaught ReferenceError: Cannot access 'REDIRECT_URI' before initialization
```

**Cause**:
Appel à `chrome.identity.getRedirectURL()` au niveau top-level du module, avant que le contexte Chrome soit initialisé.

**Solution appliquée**:
Déplacer l'appel `chrome.identity.getRedirectURL()` à l'intérieur de la fonction `login()` pour générer l'URL dynamiquement.

### 2. Erreur "Non authentifié" sur LinkedIn

**Symptôme**: Le modal apparaît mais affiche "Non authentifié. Veuillez vous connecter via la popup."

**Cause**: L'utilisateur n'a pas encore fait le login OAuth Google.

**Solution**:
1. Cliquer sur l'icône de l'extension
2. Cliquer sur "Se connecter avec Google"
3. Autoriser l'accès dans l'écran Google OAuth
4. Vérifier que l'email s'affiche dans la popup

### 3. Erreur 401 "Token expiré"

**Symptôme**: Après un certain temps, les requêtes API échouent avec 401.

**Cause**: Token révoqué côté serveur ou supprimé de la base.

**Solution**:
1. Se déconnecter de l'extension (bouton dans la popup)
2. Se reconnecter (nouveau token sera généré)
3. Vérifier dans l'admin Django que le token existe: `/admin/authentication/apitoken/`

### 4. OAuth redirect ne fonctionne pas

**Symptôme**: Après l'autorisation Google, rien ne se passe.

**Cause**: L'URL de redirect n'est pas configurée dans Google Cloud Console.

**Solution**:
1. Aller sur https://console.cloud.google.com/
2. Projet : Memento (ou celui avec le Client ID)
3. APIs & Services → Credentials
4. Éditer le OAuth 2.0 Client ID
5. Ajouter l'URL de redirect de l'extension (visible dans les logs)
6. Format: `https://[extension-id].chromiumapp.org/`

### 5. "Failed to exchange code for token"

**Symptôme**: Erreur lors de l'échange du code OAuth.

**Causes possibles**:
- Backend pas déployé
- Endpoint `/api/auth/extension` non accessible
- Client Secret incorrect dans `.env`
- Migrations Django non appliquées

**Solutions**:
1. Vérifier que le backend est accessible: `curl https://memento.vercel.app/api/health`
2. Vérifier les variables d'environnement dans `.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=221322494211-...
   GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
   ```
3. Appliquer les migrations:
   ```bash
   cd /data/assistants/654-memento/webapp
   python manage.py migrate
   ```

### 6. Modal n'apparaît pas sur LinkedIn

**Causes possibles**:
- Extension non chargée
- Content script non injecté
- Erreur JavaScript dans la console

**Solutions**:
1. Vérifier que l'extension est activée dans `chrome://extensions/`
2. Recharger l'extension (bouton circulaire)
3. Recharger la page LinkedIn (F5)
4. Ouvrir la console (F12) et chercher les logs `[654 Extension]`

### 7. Cookies non envoyés

**Symptôme**: Le modal se ferme mais les cookies n'arrivent pas au backend.

**Causes possibles**:
- Erreur réseau (CORS, firewall)
- Token invalide
- Endpoint backend non configuré

**Debug**:
1. Ouvrir la console (F12)
2. Onglet Network
3. Chercher la requête `POST /api/browser/session`
4. Vérifier le status code et la réponse
5. Vérifier le header `Authorization: Bearer ...`

## Logs et Debug

### Activer les logs détaillés

Dans la console Chrome (F12), chercher les messages préfixés par `[654 Extension]`:

```
[654 Extension] Initialisation...
[654 Extension] Jamais envoyé, affichage overlay
[654 Extension] Overlay ajouté au DOM
[654 Extension] Login error: ...
```

### Vérifier le storage local

Dans la console:
```javascript
chrome.storage.local.get(null, (data) => console.log(data));
```

Devrait afficher:
```javascript
{
  apiToken: "uuid-here",
  userEmail: "prenom.nom@321.com",
  userName: "Prénom Nom",
  loginTimestamp: 1234567890,
  lastValidation: 1234567890,
  sessionValid: true
}
```

### Tester manuellement l'API

```bash
# Test authentification
curl -X POST https://memento.vercel.app/api/auth/extension \
  -H "Content-Type: application/json" \
  -d '{"code": "test", "redirect_uri": "https://test"}'

# Test envoi cookies (avec token)
curl -X POST https://memento.vercel.app/api/browser/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"cookies": [], "userAgent": "test", "domain": "linkedin.com", "timestamp": "2025-11-06T10:00:00Z"}'
```

## Contact

Pour les problèmes non listés, créer un issue dans le repo ou contacter l'équipe 321.
