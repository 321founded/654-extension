#!/bin/bash

# Script pour générer une clé stable pour l'extension Chrome en mode développeur
# Ceci fixe l'ID de l'extension pour permettre à chrome.identity de fonctionner correctement

set -e

echo "🔑 Génération d'une clé pour l'extension Chrome 654..."
echo ""

# Génère la clé privée
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
echo "✅ Clé privée générée: key.pem"

# Génère la clé publique au format base64
openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A > key.txt
echo "✅ Clé publique générée: key.txt"

# Lit la clé publique
KEY=$(cat key.txt)

echo ""
echo "📋 Clé publique à ajouter dans manifest.json:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo '  "key": "'$KEY'",'
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANT:"
echo "   1. Ajouter la ligne ci-dessus dans manifest.json (après la première ligne)"
echo "   2. NE PAS commiter key.pem (contient la clé privée)"
echo "   3. GARDER key.pem en sécurité (nécessaire pour packager l'extension)"
echo ""
echo "📝 Exemple de manifest.json:"
echo "{"
echo '  "key": "'$KEY'",'
echo '  "manifest_version": 3,'
echo '  "name": "654 LinkedIn Session Extractor",'
echo "  ..."
echo "}"
echo ""
echo "✅ Fait! Rechargez l'extension dans chrome://extensions/"
