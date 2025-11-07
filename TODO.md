# TODO - Extension 654

## Setup initial (à faire une seule fois)

### Extension Chrome (mode développeur)

- [ ] **IMPORTANT** : Générer une clé stable pour l'extension
  ```bash
  cd /data/dev/654-extension
  ./generate-key.sh
  ```
  Puis copier la clé générée dans `manifest.json` (voir output du script).

  **Pourquoi ?** En mode développeur, l'ID de l'extension change à chaque rechargement, ce qui empêche `chrome.identity` de fonctionner. Une clé fixe résout ce problème.

- [ ] Recharger l'extension dans `chrome://extensions/` après avoir ajouté la clé

### Backend (webapp 654-memento)

- [ ] Créer les migrations Django
  ```bash
  cd /data/assistants/654-memento/webapp
  python manage.py makemigrations authentication
  python manage.py migrate
  ```

- [ ] Vérifier les variables d'environnement `.env`
  ```
  GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
  GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
  ```

- [ ] Vérifier que le endpoint est accessible
  ```bash
  curl https://memento.vercel.app/api/auth/extension
  # Devrait retourner un JSON d'erreur (pas 404)
  ```

### Google Cloud Console

- [ ] Ajouter l'URL de redirect de l'extension dans Google OAuth
  1. Console: https://console.cloud.google.com/apis/credentials
  2. Éditer le Client ID OAuth
  3. Ajouter: `https://[extension-id].chromiumapp.org/`
  4. L'extension-id est visible dans `chrome://extensions/` après installation

## Développement

### Extension

- [ ] Implémenter l'endpoint `/api/browser/session` pour recevoir les cookies
  - Actuellement le backend accepte les cookies mais ne fait rien avec
  - Décider du stockage (BDD, fichier, cache Redis, etc.)
  - Format pour PhantomBuster

- [ ] Implémenter l'endpoint `/api/browser/session/check` pour valider les sessions
  - Vérifier si les cookies sont toujours valides
  - Retourner `{valid: true/false}`
  - Logique de validation à définir

- [ ] Ajouter gestion d'expiration des tokens
  - Actuellement les tokens sont persistants (pas d'expiration)
  - Option 1: Expiration automatique après X jours
  - Option 2: Refresh token system
  - Option 3: Garder persistant, révocation manuelle seulement

### UI/UX

- [ ] Améliorer les messages d'erreur dans le modal
  - Différencier "jamais envoyé" vs "session invalide" vs "erreur API"
  - Ajouter bouton "Réessayer" en cas d'erreur

- [ ] Ajouter indicateur visuel dans l'icône extension
  - Badge rouge si session invalide
  - Badge vert si tout OK
  - Utiliser `chrome.action.setBadgeText()`

- [ ] Popup: ajouter infos de debug
  - Date du dernier envoi
  - Nombre de cookies envoyés
  - Statut du token (actif/expiré)

## Tests

- [ ] Tester le flow OAuth complet
  - Login Google
  - Échange code → token
  - Stockage local
  - Envoi cookies avec token

- [ ] Tester la révocation de token
  - Supprimer le token dans l'admin Django
  - Vérifier que l'extension détecte le 401
  - Vérifier la déconnexion automatique

- [ ] Tester la vérification périodique (15 min)
  - Attendre 15 minutes
  - Vérifier l'appel à `/api/browser/session/check`
  - Vérifier le comportement si invalide

- [ ] Tester sur plusieurs navigateurs/profils
  - Chaque profil Chrome = user différent
  - Vérifier l'isolation des tokens

## Sécurité

- [ ] Review des permissions manifest
  - Vérifier qu'on ne demande que le nécessaire
  - Documenter pourquoi chaque permission

- [ ] Audit du stockage des tokens
  - `chrome.storage.local` est-il sécurisé ?
  - Considérer encryption ?

- [ ] Rate limiting côté backend
  - Limiter le nombre de tokens par user
  - Limiter les requêtes `/api/browser/session`

- [ ] Validation des cookies reçus
  - Vérifier que ce sont bien des cookies LinkedIn
  - Détecter les cookies expirés
  - Sanitize les valeurs

## Documentation

- [ ] Créer un guide d'installation pour l'équipe
  - Étapes détaillées
  - Screenshots
  - Troubleshooting

- [ ] Documenter l'API pour PhantomBuster
  - Format des cookies attendu
  - Comment récupérer les cookies via l'API
  - Exemples de requêtes

- [ ] Créer un changelog
  - Versionning semantic
  - Liste des changes par version

## Déploiement

- [ ] Packager l'extension pour distribution
  ```bash
  cd /data/dev/654-extension
  zip -r 654-extension.zip . -x "*.git*" "*.md" "TODO.md" "TROUBLESHOOTING.md"
  ```

- [ ] Distribuer à l'équipe 321
  - Via Drive partagé ?
  - Via Chrome Web Store (privé) ?
  - Installation manuelle

- [ ] Setup CI/CD
  - Auto-build sur push
  - Tests automatiques
  - Déploiement automatique du backend

## Améliorations futures

- [ ] Support multi-sites
  - Actuellement LinkedIn only
  - Généraliser à d'autres sites (Twitter, Facebook, etc.)

- [ ] Dashboard admin
  - Vue des tokens actifs
  - Statistiques d'utilisation
  - Révocation en masse

- [ ] Notifications
  - Notifier l'user quand les cookies vont expirer
  - Notifier les admins en cas de problème

- [ ] Synchronisation automatique
  - Auto-refresh des cookies avant expiration
  - Background sync

## Bugs connus

### RÉSOLU
- ✅ "Cannot access 'REDIRECT_URI' before initialization"
  - Fix: Déplacer `chrome.identity.getRedirectURL()` dans la fonction
  - Commit: auth.js ligne 16

- ✅ "Cannot read properties of undefined (reading 'getRedirectURL')"
  - Cause: Extension en mode développeur sans ID stable
  - Fix: Script `generate-key.sh` pour générer une clé stable
  - Documentation: INSTALL.md, TROUBLESHOOTING.md section 1

### EN COURS
- Aucun bug connu actuellement

### À VÉRIFIER
- [ ] Comportement si l'extension est désactivée puis réactivée
- [ ] Comportement si LinkedIn change son domaine de cookies
- [ ] Performance avec beaucoup de cookies (>100)

## Notes

- Garder ce fichier à jour au fur et à mesure de l'avancement
- Marquer les tâches complétées avec `[x]`
- Ajouter les nouveaux bugs découverts
