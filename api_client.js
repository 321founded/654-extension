// Client API pour communiquer avec la webapp 654-memento

// Configuration par défaut
const DEFAULT_API_URL = 'https://654.321founded.com';
const API_ENDPOINT = '/api/me';

// Récupère le token API depuis le storage
async function getApiToken() {
  const { apiToken } = await chrome.storage.local.get(['apiToken']);
  if (!apiToken) {
    throw new Error('Non authentifié. Veuillez vous connecter via la popup.');
  }
  return apiToken;
}

// Envoie les données à la webapp
async function sendToWebapp(data) {
  const token = await getApiToken();
  const url = `${DEFAULT_API_URL}${API_ENDPOINT}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  if (response.status === 401) {
    // Token invalide ou expiré, déconnecter l'utilisateur
    await chrome.storage.local.remove(['apiToken', 'userEmail', 'userName', 'loginTimestamp']);
    throw new Error('Token expiré. Veuillez vous reconnecter.');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Vérifie si la session est valide côté serveur
async function checkSessionValidity() {
  try {
    const token = await getApiToken();
    const url = `${DEFAULT_API_URL}${API_ENDPOINT}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      // Token invalide, déconnecter
      await chrome.storage.local.remove(['apiToken', 'userEmail', 'userName', 'loginTimestamp']);
      return { valid: false, message: 'Token expiré' };
    }

    if (response.status === 404) {
      // Endpoint pas encore implémenté, on assume valide
      return { valid: true, message: 'Endpoint de vérification non implémenté' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API (${response.status}): ${errorText}`);
    }

    return await response.json();

  } catch (error) {
    if (error.message.includes('Non authentifié')) {
      return { valid: false, message: 'Non authentifié' };
    }
    throw error;
  }
}

// Export pour service worker (background.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendToWebapp, checkSessionValidity, getApiToken };
}
