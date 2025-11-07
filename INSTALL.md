# Guide d'installation - Extension 654

Guide étape par étape pour installer l'extension Chrome 654 en mode développeur.

## Prérequis

- Google Chrome (dernière version)
- Accès au dossier `/data/dev/654-extension/`
- Terminal avec `openssl` installé

## Étapes d'installation

### 1. Générer une clé stable pour l'extension

**Pourquoi ?** En mode développeur, l'ID de l'extension change à chaque rechargement. Chrome.identity nécessite un ID stable pour fonctionner.

```bash
cd /data/dev/654-extension
./generate-key.sh
```

Vous verrez un output comme :
```
🔑 Génération d'une clé pour l'extension Chrome 654...

✅ Clé privée générée: key.pem
✅ Clé publique générée: key.txt

📋 Clé publique à ajouter dans manifest.json:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. Ajouter la clé dans manifest.json

Ouvrir `manifest.json` et ajouter la ligne `"key": "..."` en **deuxième position** :

**Avant** :
```json
{
  "manifest_version": 3,
  "name": "654 LinkedIn Session Extractor",
  ...
}
```

**Après** :
```json
{
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
  "manifest_version": 3,
  "name": "654 LinkedIn Session Extractor",
  ...
}
```

⚠️ **Important** : Copier TOUTE la clé (elle est très longue).

### 3. Charger l'extension dans Chrome

1. Ouvrir Chrome
2. Aller sur `chrome://extensions/`
3. Activer **"Mode développeur"** (toggle en haut à droite)
4. Cliquer sur **"Charger l'extension non empaquetée"**
5. Sélectionner le dossier `/data/dev/654-extension/`

L'extension devrait apparaître dans la liste avec :
- ✅ Icône 654 (rond bleu/violet)
- ✅ Nom : "654 LinkedIn Session Extractor"
- ✅ ID stable (commence par les mêmes caractères à chaque rechargement)

### 4. Tester l'extension

1. Cliquer sur l'icône de l'extension (puzzle) dans Chrome
2. Cliquer sur l'icône 654 pour ouvrir la popup
3. Vous devriez voir : "Se connecter avec Google"

Si vous voyez une erreur `Cannot read properties of undefined`, recharger l'extension (étape 3) et réessayer.

### 5. Se connecter

1. Cliquer sur **"Se connecter avec Google"**
2. Choisir votre compte Google @321.com
3. Autoriser l'accès (profile + email)
4. La popup devrait afficher votre email

✅ **Installation terminée !**

## Vérification

### Vérifier que l'extension fonctionne

1. Aller sur LinkedIn
2. Un modal fullpage devrait apparaître : "654 - Mise à jour requise"
3. Cliquer sur **"Envoyer mes informations"**
4. Le modal devrait disparaître après quelques secondes

### Vérifier l'ID de l'extension

```bash
# Afficher l'ID de l'extension
cd /data/dev/654-extension
openssl rsa -in key.pem -pubout -outform DER | shasum -a 256 | head -c32 | tr 0-9a-f a-p
```

Cet ID doit correspondre à celui affiché dans `chrome://extensions/`.

## Problèmes courants

### "chrome.identity is not available"

**Solution** : Recharger l'extension dans `chrome://extensions/` (bouton circulaire).

### "Cannot read properties of undefined"

**Solutions possibles** :
1. Vérifier que la clé est bien ajoutée dans `manifest.json`
2. Vérifier que la clé est complète (très longue ligne)
3. Recharger l'extension
4. Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md) pour plus de détails

### L'ID de l'extension change à chaque rechargement

**Solution** : La clé n'a pas été ajoutée correctement dans `manifest.json`. Refaire l'étape 2.

### Modal n'apparaît pas sur LinkedIn

**Solutions** :
1. Ouvrir la console (F12) et chercher `[654 Extension]`
2. Vérifier que l'extension est bien chargée et activée
3. Recharger la page LinkedIn

## Désinstallation

1. Aller sur `chrome://extensions/`
2. Cliquer sur **"Supprimer"** sur l'extension 654
3. (Optionnel) Supprimer les fichiers `key.pem` et `key.txt`

## Next Steps

Après l'installation :
- Lire [README.md](README.md) pour comprendre le fonctionnement
- Consulter [TODO.md](TODO.md) pour le setup backend
- Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md) en cas de problème
