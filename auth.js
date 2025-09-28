// Authentication JavaScript

// Global variables
let isLoginMode = true;

// API Base URL
const API_BASE = '';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authSwitchText = document.getElementById('authSwitchText');
const authSwitchLink = document.getElementById('authSwitchLink');
const loadingOverlay = document.getElementById('loadingOverlay');
const messageContainer = document.getElementById('messageContainer');

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    checkExistingSession();
    
    // Setup event listeners
    setupEventListeners();
});

// Check for existing session
async function checkExistingSession() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        try {
            // Verify token is still valid
            const response = await fetch(`${API_BASE}/profile`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                // Token is valid, redirect to main app
                showMessage('Welcome back!', 'success');
                setTimeout(() => {
                    window.location.replace('/');
                }, 1000);
                return;
            } else {
                console.log('Token validation failed:', response.status);
            }
        } catch (error) {
            console.log('Session check failed:', error);
        }
    }
    
    // Clear invalid tokens
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Setup event listeners
function setupEventListeners() {
    // Login form submission
    loginForm.addEventListener('submit', handleLogin);
    
    // Register form submission
    registerForm.addEventListener('submit', handleRegister);
    
    // Auth mode switching
    authSwitchLink.addEventListener('click', function(e) {
        e.preventDefault();
        toggleAuthMode();
    });
    
    // Remember me functionality
    const rememberCheckbox = document.getElementById('rememberMe');
    if (localStorage.getItem('rememberEmail')) {
        document.getElementById('loginEmail').value = localStorage.getItem('rememberEmail');
        rememberCheckbox.checked = true;
    }
    
    // Enter key handling
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const activeForm = isLoginMode ? loginForm : registerForm;
            activeForm.dispatchEvent(new Event('submit'));
        }
    });
}

// Toggle between login and register modes
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    
    if (isLoginMode) {
        // Switch to login mode
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authSwitchText.textContent = 'Don\'t have an account?';
        authSwitchLink.textContent = 'Create one';
        document.querySelector('.auth-subtitle').textContent = 'Sign in to your account';
    } else {
        // Switch to register mode
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authSwitchText.textContent = 'Already have an account?';
        authSwitchLink.textContent = 'Sign in';
        document.querySelector('.auth-subtitle').textContent = 'Create a new account';
    }
}

// Handle login form submission
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    if (!email || !password) {
        showMessage('Please fill in all fields', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Ошибка входа');
        }
        
        // Save token and user data
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Save email if remember me is checked
        if (rememberMe) {
            localStorage.setItem('rememberEmail', email);
        } else {
            localStorage.removeItem('rememberEmail');
        }
        
        showMessage('Успешный вход! Перенаправление...', 'success');
        
        // Redirect to main app after short delay
        setTimeout(() => {
            window.location.replace('/');
        }, 1500);
        
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Handle register form submission
async function handleRegister(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('registerEmail').value;
    const telegramUsername = document.getElementById('telegramUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validation
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        showMessage('Пожалуйста, заполните все обязательные поля', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Пароли не совпадают', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Пароль должен содержать минимум 6 символов', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email: email,
                telegram_username: telegramUsername,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Ошибка регистрации');
        }
        
        showMessage('Регистрация успешна! Теперь вы можете войти', 'success');
        
        // Switch to login mode and pre-fill email
        toggleAuthMode();
        document.getElementById('loginEmail').value = email;
        
        // Clear register form
        registerForm.reset();
        
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Show/hide loading overlay
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// Show message notification
function showMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    
    const icon = type === 'success' ? 'fas fa-check-circle' : 
                type === 'error' ? 'fas fa-exclamation-circle' : 
                'fas fa-info-circle';
    
    messageEl.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    messageContainer.appendChild(messageEl);
    
    // Show message with animation
    setTimeout(() => {
        messageEl.classList.add('show');
    }, 100);
    
    // Hide and remove message after 5 seconds
    setTimeout(() => {
        messageEl.classList.remove('show');
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 300);
    }, 5000);
}

// Handle authentication errors
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message) {
        showMessage('Произошла ошибка: ' + event.reason.message, 'error');
    }
});
