// Service worker pour l'extension 654
console.log('[654 Background] Service worker loading...');

importScripts('api_client.js');

const GOOGLE_CLIENT_ID = '221322494211-u0b40fjm5k62kt1hvugiso4lap7hbqos.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'profile email';
const API_URL = 'https://654.321founded.com';

console.log('[654 Background] Service worker loaded');
console.log('[654 Background] chrome.identity available at startup:', !!chrome.identity);

// Handler pour les messages depuis content script et popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getCookiesAndSend') {
    handleGetCookiesAndSend(sender)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'checkSessionStatus') {
    checkSessionStatus()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, valid: false, error: error.message }));
    return true;
  }

  if (message.action === 'login') {
    handleLogin()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'logout') {
    handleLogout()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'isAuthenticated') {
    isAuthenticated()
      .then(result => sendResponse({ authenticated: result }))
      .catch(error => sendResponse({ authenticated: false, error: error.message }));
    return true;
  }

  if (message.action === 'getUserInfo') {
    getUserInfo()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

// Gère le login OAuth (appelé depuis la popup)
async function handleLogin() {
  try {
    // Vérifie que chrome.identity est disponible
    console.log('[654 Background] chrome.identity available:', !!chrome.identity);
    console.log('[654 Background] chrome object:', chrome);

    if (!chrome.identity) {
      throw new Error('chrome.identity API not available in service worker');
    }

    const redirectUri = chrome.identity.getRedirectURL();
    console.log('[654 Background] Redirect URI:', redirectUri);

    // Crée l'URL d'autorisation Google
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('access_type', 'online');

    // Lance le flow OAuth interactif
    const redirectUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
      }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(responseUrl);
      });
    });

    // Extrait le code d'autorisation
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Échange le code contre un token API
    const response = await fetch(`${API_URL}/api/auth/extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to exchange code for token');
    }

    const data = await response.json();

    // Sauvegarde le token et les infos user
    await chrome.storage.local.set({
      apiToken: data.token,
      userEmail: data.email,
      userName: data.name,
      loginTimestamp: Date.now()
    });

    return {
      success: true,
      email: data.email,
      name: data.name,
      token: data.token
    };

  } catch (error) {
    console.error('[654 Extension] Login error:', error);
    throw error;
  }
}

// Gère le logout
async function handleLogout() {
  await chrome.storage.local.remove(['apiToken', 'userEmail', 'userName', 'loginTimestamp', 'lastValidation', 'sessionValid']);
  return { success: true };
}

// Vérifie si l'utilisateur est authentifié
async function isAuthenticated() {
  const { apiToken } = await chrome.storage.local.get(['apiToken']);
  return !!apiToken;
}

// Récupère les infos utilisateur
async function getUserInfo() {
  const { userEmail, userName } = await chrome.storage.local.get(['userEmail', 'userName']);
  return { email: userEmail, name: userName };
}

// Récupère le cookie li_at + user agent et envoie à l'API
async function handleGetCookiesAndSend(sender) {
  try {
    // Vérifie que l'utilisateur est authentifié
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      throw new Error('Non authentifié. Veuillez vous connecter via la popup.');
    }

    const cookies = await chrome.cookies.getAll({ domain: '.linkedin.com' });
    const userAgent = navigator.userAgent;

    // Extrait uniquement le cookie li_at
    const liAtCookie = cookies.find(c => c.name === 'li_at');

    if (!liAtCookie) {
      throw new Error('Cookie li_at non trouvé. Êtes-vous connecté à LinkedIn ?');
    }

    const data = {
      linkedin: {
        cookie: liAtCookie.value,
        user_agent: userAgent
      }
    };

    const result = await sendToWebapp(data);

    return {
      success: true,
      message: 'Session LinkedIn envoyée avec succès',
      response: result
    };
  } catch (error) {
    console.error('Erreur lors de la récupération/envoi:', error);
    throw error;
  }
}

// Vérifie le statut de la session côté serveur
async function checkSessionStatus() {
  try {
    const result = await checkSessionValidity();

    return {
      success: true,
      valid: result.valid,
      message: result.message
    };
  } catch (error) {
    console.error('[654 Extension] Erreur vérification session:', error);
    return {
      success: false,
      valid: false,
      error: error.message
    };
  }
}
