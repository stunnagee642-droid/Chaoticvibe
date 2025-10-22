// index.js

// === DOM ELEMENTS ===
const loginSection = document.getElementById('loginSection');
const chatSection = document.getElementById('chatSection');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const logoutBtn = document.getElementById('logoutBtn');
const welcomeText = document.getElementById('welcomeText');

// === LOCAL STORAGE HANDLER ===
function getUser() {
  return localStorage.getItem('chaoticvibeUser');
}

function setUser(username) {
  localStorage.setItem('chaoticvibeUser', username);
}

function clearUser() {
  localStorage.removeItem('chaoticvibeUser');
}

// === NAVIGATION LOGIC ===
function showChat() {
  loginSection.style.display = 'none';
  chatSection.style.display = 'flex';
  welcomeText.textContent = `👋 Welcome ${getUser()}!`;
}

function showLogin() {
  chatSection.style.display = 'none';
  loginSection.style.display = 'flex';
}

// === INITIAL LOAD ===
window.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (user) {
    showChat();
  } else {
    showLogin();
  }
});

// === LOGIN FORM HANDLER ===
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  if (username.length < 3) {
    alert('Username must be at least 3 characters.');
    return;
  }
  setUser(username);
  showChat();
});

// === LOGOUT HANDLER ===
logoutBtn.addEventListener('click', () => {
  clearUser();
  showLogin();
});
