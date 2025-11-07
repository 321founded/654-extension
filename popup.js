// Popup - Interface login/logout

const loginSection = document.getElementById('login-section');
const loggedInSection = document.getElementById('logged-in-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmailDiv = document.getElementById('user-email');
const statusDiv = document.getElementById('status');

// Affiche l'état de connexion
async function updateUI() {
  const response = await chrome.runtime.sendMessage({ action: 'isAuthenticated' });

  if (response.authenticated) {
    const userInfo = await chrome.runtime.sendMessage({ action: 'getUserInfo' });
    userEmailDiv.textContent = userInfo.email;
    loginSection.style.display = 'none';
    loggedInSection.style.display = 'block';
  } else {
    loginSection.style.display = 'block';
    loggedInSection.style.display = 'none';
  }
}

// Gère le clic sur "Se connecter"
async function handleLogin() {
  try {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Connexion en cours...';

    const result = await chrome.runtime.sendMessage({ action: 'login' });

    if (result.success) {
      showStatus('success', `Connecté en tant que ${result.email}`);
      await updateUI();
    } else {
      throw new Error(result.error || 'Login failed');
    }

  } catch (error) {
    console.error('Erreur de connexion:', error);
    showStatus('error', `Erreur: ${error.message}`);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter avec Google';
  }
}

// Gère le clic sur "Se déconnecter"
async function handleLogout() {
  try {
    await chrome.runtime.sendMessage({ action: 'logout' });
    showStatus('success', 'Déconnecté avec succès');
    await updateUI();
  } catch (error) {
    console.error('Erreur de déconnexion:', error);
    showStatus('error', `Erreur: ${error.message}`);
  }
}

// Affiche un message de statut
function showStatus(type, message) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type} visible`;

  setTimeout(() => {
    statusDiv.className = 'status';
  }, 3000);
}

// Event listeners
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

// Initialise l'UI au démarrage
updateUI();
