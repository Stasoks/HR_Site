// Global variables
let currentUser = null;
let currentToken = null;
let currentChatType = 'general';
let chatPollingInterval = null; // For real-time chat updates
let currentTasksData = null; // For storing task data
let chatMessagesLoaded = false; // Flag for loaded messages
let lastLoadedChatType = null; // Last loaded chat type
let currentTaskFilter = 'available'; // Current active task filter
let isChatSectionActive = false; // Track if chat section is currently visible


// Unread messages system
let unreadPollingInterval = null; // For checking unread messages
let unreadCounts = {
    general: 0,
    support: 0,
    total: 0
}; // Current unread counts
let lastUnreadCheck = 0; // Timestamp of last unread check

// Initialize user data from localStorage
function initializeUserData() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentToken = token;
        try {
            currentUser = JSON.parse(user);
        } catch (e) {
            console.error('Failed to parse user data:', e);
            currentUser = null;
            currentToken = null;
        }
    }
}

// Initialize on script load
initializeUserData();



// Функция для проверки состояния чатов (для отладки)
window.checkChatStateDebug = function() {
    console.log('🔍 ТЕКУЩЕЕ СОСТОЯНИЕ ЧАТОВ:');
    console.log('   - currentUser:', currentUser ? 'есть' : 'нет');
    console.log('   - currentChatType:', currentChatType);
    console.log('   - isChatSectionActive:', isChatSectionActive);
    console.log('   - chatPollingInterval:', chatPollingInterval ? 'активен' : 'неактивен');
    

};



// API Base URL
const API_BASE = '';

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

// Auth Functions
function showAuthForm(formType) {
    if (formType === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
    // Ensure tour overlay never dims auth screens
    try { forceHideTourOverlay(); } catch(_) {}
}

// Helper: robustly play bottom nav animation once
function playBottomNavAnimation() {
    try {
        const bottomNav = document.querySelector('.bottom-nav');
        if (!bottomNav) return;

        // Reset any previous run
        bottomNav.classList.remove('nav-animate-once');
        const items = bottomNav.querySelectorAll('.nav-item');
        items.forEach(item => {
            item.style.animation = 'none';
        });
        // Force reflow to restart animations reliably
        // eslint-disable-next-line no-unused-expressions
        bottomNav.offsetHeight;
        items.forEach(item => {
            item.style.animation = '';
        });

        requestAnimationFrame(() => {
            bottomNav.classList.add('nav-animate-once');
        });
        setTimeout(() => bottomNav.classList.remove('nav-animate-once'), 1500);
    } catch(_) {}
}

async function showApp() {
    // Debug: show app initialized
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Force hide tour overlay immediately when app is shown
    forceHideTourOverlay();

    // Removed nav animation trigger here per request; only after tour skip/close
    
    showLoadingState();
    
    // Preload and cache site elements during loading
    await preloadAndCacheElements();
    
    // Add loading delay for better UX (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check for cached data first
    const cachedData = getCachedData();
    
    const [userData, news, tasks, awards, tourStatus] = await Promise.all([
        loadUserData(),
        cachedData?.news ? Promise.resolve(cachedData.news) : loadNews(),
        cachedData?.tasks ? Promise.resolve(cachedData.tasks) : loadTasks(),
        cachedData?.awards ? Promise.resolve(cachedData.awards) : loadAwards(),
        apiRequest('/api/tour/status').catch(() => ({ tour_completed: true })),
        // Preload chat messages in background
        preloadChatMessages('general'),
        preloadChatMessages('support')
    ]);
    
    // Update user level on app load
    await updateUserLevel();
    
    // Initialize unread messages system
    await loadUnreadCounts();
    startUnreadPolling();
    
    hideLoadingState();
    
    // Immediate news refresh after login
    // Debug: news refresh after login
    loadNews();
    
    // Force refresh data for current active section
    const activeSection = document.querySelector('.section.active');
    if (activeSection && activeSection.id === 'awards-section') {
        // Debug: awards refresh
        loadAwards();
    }
    
    if (currentUser && !currentUser.documents_accepted) {
        showDocumentModal();
        return;
    }
    
    if (currentUser && currentUser.documents_accepted) {
        console.log('=== TOUR STATUS CHECK ===');
        console.log('Tour status from parallel load:', tourStatus);
        console.log('Tour status type:', typeof tourStatus.tour_completed);
        console.log('Tour status === false:', tourStatus.tour_completed === false);
        console.log('Tour status === true:', tourStatus.tour_completed === true);
        
        // Force hide any existing tour overlay first
        forceHideTourOverlay();
        
        if (tourStatus.tour_completed === false) {
            console.log('Tour not completed, starting tour...');
            if (onboardingTour) {
                console.log('OnboardingTour found, calling start()...');
                onboardingTour.start();
            } else {
                console.error('OnboardingTour not found');
            }
        } else {
            console.log('Tour already completed, skipping');
            console.log('Tour will NOT be started');
            // Ensure tour overlay is hidden when tour is completed
            forceHideTourOverlay();
        }
    }
}

function hideApp() {
    appContainer.classList.add('hidden');
    authContainer.classList.remove('hidden');
    showAuthForm('login');
    currentUser = null;
    currentToken = null;
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            ...options.headers
        },
        ...options
    };

    // Only set Content-Type for JSON requests
    if (!(options.body instanceof FormData)) {
        config.headers['Content-Type'] = 'application/json';
    }

    if (currentToken) {
        config.headers['Authorization'] = `Bearer ${currentToken}`;
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid, redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return;
            }
            throw new Error(data.detail || 'API request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Unread messages functions
async function loadUnreadCounts() {
    try {
        const response = await apiRequest('/api/chat/unread-count');
        unreadCounts = {
            general: response.general_unread || 0,
            support: response.support_unread || 0,
            total: response.total_unread || 0
        };
        updateUnreadBadges();
        return unreadCounts;
    } catch (error) {
        console.error('Failed to load unread counts:', error);
        return { general: 0, support: 0, total: 0 };
    }
}

async function markChatAsRead(chatType) {
    try {
        await apiRequest(`/api/chat/mark-read?chat_type=${chatType}`, {
            method: 'POST'
        });
        
        // Update local counts
        if (chatType === 'general') {
            unreadCounts.general = 0;
        } else if (chatType === 'support') {
            unreadCounts.support = 0;
        }
        unreadCounts.total = unreadCounts.general + unreadCounts.support;
        
        updateUnreadBadges();
    } catch (error) {
        console.error('Failed to mark chat as read:', error);
    }
}

function updateUnreadBadges() {
    // Update main chat icon badge
    const chatNavItem = document.querySelector('.nav-item[data-section="chat"]');
    if (chatNavItem) {
        let badge = chatNavItem.querySelector('.unread-badge');
        
        if (unreadCounts.total > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'unread-badge';
                chatNavItem.appendChild(badge);
            }
            
            if (unreadCounts.total > 9) {
                badge.textContent = '9+';
            } else {
                badge.textContent = unreadCounts.total.toString();
            }
        } else if (badge) {
            badge.remove();
        }
    }
    
    // Update chat tab badges
    const generalTab = document.querySelector('.chat-tab[data-chat="general"]');
    const supportTab = document.querySelector('.chat-tab[data-chat="support"]');
    
    if (generalTab) {
        let badge = generalTab.querySelector('.unread-badge');
        if (unreadCounts.general > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'unread-badge';
                generalTab.appendChild(badge);
            }
            badge.textContent = unreadCounts.general > 9 ? '9+' : unreadCounts.general.toString();
        } else if (badge) {
            badge.remove();
        }
    }
    
    if (supportTab) {
        let badge = supportTab.querySelector('.unread-badge');
        if (unreadCounts.support > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'unread-badge';
                supportTab.appendChild(badge);
            }
            badge.textContent = unreadCounts.support > 9 ? '9+' : unreadCounts.support.toString();
        } else if (badge) {
            badge.remove();
        }
    }
}

function startUnreadPolling() {
    if (unreadPollingInterval) {
        clearInterval(unreadPollingInterval);
    }
    
    // Check unread messages every 5 seconds
    unreadPollingInterval = setInterval(async () => {
        if (currentUser && !isChatSectionActive) {
            await loadUnreadCounts();
        }
    }, 5000);
}

function stopUnreadPolling() {
    if (unreadPollingInterval) {
        clearInterval(unreadPollingInterval);
        unreadPollingInterval = null;
    }
}

// Auth API calls
async function login(email, password) {
    try {
        const response = await apiRequest('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        currentToken = response.access_token;
        currentUser = response.user;
        
        localStorage.setItem('token', currentToken);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        await showApp();
        return response;
    } catch (error) {
        throw error;
    }
}

async function register(userData) {
    try {
        const response = await apiRequest('/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        // Do not trigger nav animation here anymore
        return response;
    } catch (error) {
        throw error;
    }
}

// Data loading functions
async function loadUserData() {
    try {
        const userData = await apiRequest('/profile');
        updateProfileUI(userData);
        updateBalanceUI(userData.balance);
        
        // Withdrawals requests are now available via quick menu
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

// Update user level from server
async function updateUserLevel() {
    try {
        const response = await apiRequest('/api/user/level');
        if (response && response.level && currentUser) {
            currentUser.level = response.level;
            // Also update is_admin if provided
            if (response.is_admin !== undefined) {
                currentUser.is_admin = response.is_admin;
            }
            // Update localStorage with new level and admin status
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            storedUser.level = response.level;
            if (response.is_admin !== undefined) {
                storedUser.is_admin = response.is_admin;
            }
            localStorage.setItem('user', JSON.stringify(storedUser));
        }
    } catch (error) {
        console.error('Failed to update user level:', error);
    }
}

// Load withdrawal requests
async function loadWithdrawalRequests() {
    try {
        const response = await apiRequest('/api/user/withdrawal-requests');
        
        if (response.success && response.withdrawal_requests) {
            updateWithdrawalRequestsUI(response.withdrawal_requests);
        } else {
            updateWithdrawalRequestsUI([]);
        }
    } catch (error) {
        console.error('Failed to load withdrawal requests:', error);
        updateWithdrawalRequestsUI([]);
    }
}

// Update withdrawal requests UI
function updateWithdrawalRequestsUI(withdrawalRequests) {
    const withdrawalRequestsList = document.getElementById('withdrawalRequestsList');
    
    if (!withdrawalRequestsList) return;
    
    if (!withdrawalRequests || withdrawalRequests.length === 0) {
        withdrawalRequestsList.innerHTML = `
            <div class="empty-withdrawal-requests">
                <i class="fas fa-history"></i>
                <h3>No Withdrawal Requests</h3>
                <p>You haven't made any withdrawal requests yet.</p>
            </div>
        `;
        return;
    }
    
    withdrawalRequestsList.innerHTML = withdrawalRequests.map(request => {
        const date = new Date(request.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const statusClass = request.status === 'completed' ? 'completed' : 'pending';
        const statusText = request.status === 'completed' ? 'Completed' : 'Pending';
        
        // Get network icon
        let networkIcon = 'fas fa-coins';
        switch (request.network_coin.toLowerCase()) {
            case 'usdt':
                networkIcon = 'fab fa-bitcoin';
                break;
            case 'bep20':
                networkIcon = 'fab fa-ethereum';
                break;
            case 'tron':
                networkIcon = 'fas fa-coins';
                break;
            case 'ethereum':
                networkIcon = 'fab fa-ethereum';
                break;
            default:
                networkIcon = 'fas fa-coins';
        }
        
        return `
            <div class="withdrawal-request-item">
                <div class="withdrawal-request-header">
                    <div class="withdrawal-request-amount">$${request.amount.toFixed(2)}</div>
                    <div class="withdrawal-request-status ${statusClass}">${statusText}</div>
                </div>
                <div class="withdrawal-request-details">
                    <div class="withdrawal-request-network">
                        <i class="${networkIcon}"></i>
                        <span>${request.network_coin.toUpperCase()}</span>
                    </div>
                    <div class="withdrawal-request-date">${date}</div>
                    <div class="withdrawal-request-wallet">${request.wallet_address}</div>
                </div>
            </div>
        `;
    }).join('');
}

async function loadNews() {
    try {
        // Debug: loading news
        const response = await apiRequest('/news');
        // Debug: news response
        
        if (response && response.news) {
            // Debug: news count
            updateNewsUI(response.news);
        } else {
            // Debug: empty news
            updateNewsUI([]);
        }
    } catch (error) {
        console.error('❌ Failed to load news:', error);
        // Показываем сообщение об ошибке пользователю
        const newsList = document.getElementById('newsList');
        if (newsList) {
            newsList.innerHTML = '<div class="news-item"><p>Failed to load news</p></div>';
        }
        updateNewsUI([]);
    }
}

async function loadTasks(filterType = 'available') {
    try {
        // Debug: loading tasks
        
        const [response, stats] = await Promise.all([
            apiRequest(`/tasks?filter_type=${filterType}`),
            apiRequest('/tasks/stats')
        ]);
        
        // Debug: tasks response
        
        // Для доступных заданий response содержит категории, для остальных - response.tasks
        const tasksData = filterType === 'available' ? response : response.tasks;
        
        // Debug: tasks data
        
        // Сохраняем данные о заданиях глобально
        currentTasksData = {
            filterType: filterType,
            data: tasksData
        };
        
        // Debug: update tasks UI
        updateTasksUI(tasksData, filterType);
        updateTaskStats(stats);
        
        // Debug: tasks displayed
    } catch (error) {
        console.error(`❌ Error loading tasks for ${filterType}:`, error);
        
        // Show error message to user
        const tasksList = document.getElementById('tasksList');
        if (tasksList) {
            tasksList.innerHTML = `
                <div class="task-card error-state">
                    <h3>❌ Error loading</h3>
                    <p>Failed to load tasks: ${error.message}</p>
                    <button onclick="loadTasks('${filterType}')" class="btn-retry">🔄 Retry</button>
                </div>
            `;
        }
    }
}

async function loadTaskStats() {
    try {
        const stats = await apiRequest('/tasks/stats');
        updateTaskStats(stats);
    } catch (error) {
        console.error('Failed to load task stats:', error);
    }
}

async function loadAwards() {
    try {
        console.log('Loading awards data...');
        const response = await apiRequest('/awards');
        console.log('Awards response:', response);
        updateAwardsUI(response);
    } catch (error) {
        console.error('Failed to load awards:', error);
        // Show error message to user
        updateAwardsUI({ top_earners: [], most_productive: [], quality_leaders: [] });
    }
}

// Preload chat messages without updating UI
async function preloadChatMessages(chatType) {
    try {
        console.log(`Preloading chat messages for ${chatType}...`);
        const response = await apiRequest(`/api/chat/messages?type=${chatType}&limit=150`);
        console.log(`✅ Preloaded ${chatType} chat: ${response.messages?.length || 0} messages`);
        return response;
    } catch (error) {
        console.log(`⚠️ Failed to preload ${chatType} chat messages:`, error);
        return null;
    }
}

async function loadChatMessages(chatType) {
    try {
        // Check if messages are already loaded for this chat type
        if (chatMessagesLoaded && lastLoadedChatType === chatType) {
            console.log(`Chat messages for ${chatType} already loaded, skipping...`);
            return;
        }
        
        console.log(`Loading chat messages for ${chatType}...`);
        
        const response = await apiRequest(`/api/chat/messages?type=${chatType}&limit=150`);
        const messages = response.messages || [];
        
        displayChatMessages(messages);
        
        // Scroll to bottom only on first load with a small delay to ensure DOM is updated
        setTimeout(() => {
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }, 100);
        
        // Update chat background based on chat type
        const chatMessagesContainer = document.querySelector('.chat-messages');
        if (chatMessagesContainer) {
            if (chatType === 'support') {
                chatMessagesContainer.classList.add('support-active');
            } else {
                chatMessagesContainer.classList.remove('support-active');
            }
        }
        
        // Update flags
        chatMessagesLoaded = true;
        lastLoadedChatType = chatType;
        
        // Force hide tour overlay when chat messages are loaded
        forceHideTourOverlay();
    } catch (error) {
        console.error('Failed to load chat messages:', error);
    }
}

// UI Update functions
function updateProfileUI(userData) {
    const initials = `${userData.first_name.charAt(0)}${userData.last_name.charAt(0)}`.toUpperCase();
    
    document.getElementById('profileInitials').textContent = initials;
    document.getElementById('profileName').textContent = `${userData.first_name} ${userData.last_name}`;
    document.getElementById('profileEmail').textContent = userData.email;
    document.getElementById('profileEmailValue').textContent = userData.email;
    document.getElementById('profileFullName').textContent = `${userData.first_name} ${userData.last_name}`;
    document.getElementById('profileRole').textContent = userData.is_admin ? 'Admin' : 'User';
    
    // Update avatar
    document.getElementById('profileAvatar').querySelector('span').textContent = initials;
    
    // Load verification status (не перезаписываем, если уже установлен)
    loadVerificationStatus();
    // Disable withdrawals quick button for base users only
    try {
        const quickBtn = document.getElementById('openWithdrawalsMenuBtn');
        if (quickBtn) {
            const isBase = (userData.level || '').toLowerCase() === 'base';
            quickBtn.disabled = isBase;
            quickBtn.style.opacity = isBase ? '0.6' : '';
            quickBtn.style.cursor = isBase ? 'not-allowed' : '';
            if (isBase) {
                quickBtn.title = 'Upgrade to Silver to access withdrawals';
        } else {
                quickBtn.removeAttribute('title');
            }
        }
    } catch(_) {}

    
    // Load activity history
async function loadActivityHistory() {
    try {
        const response = await apiRequest('/api/user/events');
        const activityHistory = document.getElementById('activityHistory');
        
        if (response.success && response.events && response.events.length > 0) {
            activityHistory.innerHTML = '';
            
            response.events.forEach(event => {
                const activityItem = document.createElement('div');
                activityItem.className = 'activity-item';
                
                // Определяем иконку и тег в зависимости от типа события
                let icon = 'fas fa-info-circle';
                let tag = 'System';
                let tagClass = 'activity-tag';
                
                switch(event.event_type) {
                    case 'account_created':
                        icon = 'fas fa-user-plus';
                        tag = 'Account';
                        break;
                    case 'verification_submitted':
                        icon = 'fas fa-id-card';
                        tag = 'Verification';
                        tagClass = 'activity-tag verification';
                        break;
                    case 'verification_approved':
                        icon = 'fas fa-check-circle';
                        tag = 'Verified';
                        tagClass = 'activity-tag verified';
                        break;
                    case 'withdrawal_requested':
                        icon = 'fas fa-download';
                        tag = 'Withdrawal';
                        tagClass = 'activity-tag withdrawal';
                        break;
                    case 'task_taken':
                        icon = 'fas fa-tasks';
                        tag = 'Task';
                        tagClass = 'activity-tag task';
                        break;
                    case 'task_completed':
                        icon = 'fas fa-check';
                        tag = 'Completed';
                        tagClass = 'activity-tag completed';
                        break;
                    default:
                        icon = 'fas fa-info-circle';
                        tag = 'System';
                }
                
                const date = new Date(event.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                activityItem.innerHTML = `
                    <i class="${icon}"></i>
                    <div class="activity-content">
                        <div class="activity-title">${event.event_description}</div>
                        <div class="activity-message">${date}</div>
                    </div>
                    <span class="${tagClass}">${tag}</span>
                `;
                
                activityHistory.appendChild(activityItem);
            });
        } else {
            // Если нет событий, показываем только создание аккаунта
            activityHistory.innerHTML = `
                <div class="activity-item">
                    <i class="fas fa-user"></i>
                    <div class="activity-content">
                        <div class="activity-title">Account Created</div>
                        <div class="activity-message">Welcome to the team!</div>
                    </div>
                    <span class="activity-tag">System</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load activity history:', error);
        // При ошибке показываем только создание аккаунта
        const activityHistory = document.getElementById('activityHistory');
        activityHistory.innerHTML = `
            <div class="activity-item">
                <i class="fas fa-user"></i>
                <div class="activity-content">
                    <div class="activity-title">Account Created</div>
                    <div class="activity-message">Welcome to the team!</div>
                </div>
                <span class="activity-tag">System</span>
            </div>
        `;
    }
}
    
    // Load activity history
    loadActivityHistory();
    
    // Update user level
    const levelBadge = document.getElementById('levelBadge');
    if (levelBadge) {
        const levelClass = `level-${userData.level}`;
        const levelText = userData.level.charAt(0).toUpperCase() + userData.level.slice(1) + ' Level';
        levelBadge.className = `status-badge ${levelClass}`;
        levelBadge.innerHTML = `<i class="fas fa-layer-group"></i>${levelText}`;
    }
    
    // Add admin panel button if user is admin
    const profileActions = document.querySelector('.profile-actions');
    if (userData.is_admin) {
        // Remove existing admin button if any
        const existingAdminBtn = profileActions.querySelector('.admin-btn');
        if (existingAdminBtn) {
            existingAdminBtn.remove();
        }
        
        const adminButton = document.createElement('button');
        adminButton.className = 'btn btn-primary admin-btn';
        adminButton.textContent = '🔧 Admin panel';
        adminButton.onclick = () => window.open('/admin', '_blank');
        profileActions.appendChild(adminButton);
    }
    
    // Update chat interface based on user level and current chat type
    if (currentChatType === 'support') {
        updateChatInterfaceForUserLevel('support');
    } else {
        updateChatInterfaceForUserLevel(userData.level);
    }
    
    // Check user level and withdrawal access
    const withdrawBtn = document.getElementById('withdrawBtn');
    if (withdrawBtn) {
        const withdrawalEnabled = userData.withdrawal_enabled !== false; // Default to true if not set
        
        // Debug logging
        console.log('Withdrawal debug:', {
            userLevel: userData.level,
            withdrawalEnabled: userData.withdrawal_enabled,
            withdrawalEnabledCalculated: withdrawalEnabled,
            isBase: userData.level === 'base',
            isBasic: userData.level === 'basic'
        });
        
        if (userData.level === 'base') {
            withdrawBtn.disabled = true;
            withdrawBtn.style.opacity = '0.5';
            withdrawBtn.style.cursor = 'not-allowed';
            withdrawBtn.title = 'Upgrade to Silver to access withdrawals';
            
            // Add warning text
            const balanceCard = withdrawBtn.closest('.balance-card');
            console.log('Withdrawal restriction: balanceCard found:', !!balanceCard);
            
            if (balanceCard) {
                // Remove existing warning if any
                const existingWarning = balanceCard.querySelector('.withdrawal-warning');
                if (existingWarning) {
                    existingWarning.remove();
                    console.log('Withdrawal restriction: removed existing warning');
                }
                
                // Add warning message
                const warning = document.createElement('div');
                warning.className = 'withdrawal-warning';
                warning.innerHTML = `
                    <div style="
                        background: rgba(220, 53, 69, 0.1);
                        border: 1px solid rgba(220, 53, 69, 0.3);
                        border-radius: 8px;
                        padding: 8px;
                        margin-top: 8px;
                        font-size: 14px;
                        color: #ffffff;
                        text-align: center;
                        font-weight: 600;
                    ">
                        <i class="fas fa-exclamation-triangle"></i>
                        Upgrade to Silver to access withdrawals
                    </div>
                `;
                balanceCard.appendChild(warning);
                console.log('Withdrawal restriction: added warning message for', userData.level);
            } else {
                console.error('Withdrawal restriction: balanceCard not found!');
            }
        } else if (!withdrawalEnabled) {
            // User has appropriate level but withdrawal is disabled
            withdrawBtn.disabled = true;
            withdrawBtn.style.opacity = '0.5';
            withdrawBtn.style.cursor = 'not-allowed';
            withdrawBtn.title = 'Upgrade to Silver to access withdrawals';
            
            // Add warning text
            const balanceCard = withdrawBtn.closest('.balance-card');
            if (balanceCard) {
                // Remove existing warning if any
                const existingWarning = balanceCard.querySelector('.withdrawal-warning');
                if (existingWarning) {
                    existingWarning.remove();
                }
                
                // Add warning message
                const warning = document.createElement('div');
                warning.className = 'withdrawal-warning';
                warning.innerHTML = `
                    <div style="
                        background: rgba(255, 193, 7, 0.1);
                        border: 1px solid rgba(255, 193, 7, 0.3);
                        border-radius: 8px;
                        padding: 8px;
                        margin-top: 8px;
                        font-size: 14px;
                        color: #ffffff;
                        text-align: center;
                        font-weight: 600;
                    ">
                        <i class="fas fa-lock"></i>
                        Upgrade to Silver to access withdrawals
                    </div>
                `;
                balanceCard.appendChild(warning);
            }
        } else {
            withdrawBtn.disabled = false;
            withdrawBtn.style.opacity = '1';
            withdrawBtn.style.cursor = 'pointer';
            withdrawBtn.title = 'Withdraw funds';
            
            // Remove warning if exists
            const balanceCard = withdrawBtn.closest('.balance-card');
            if (balanceCard) {
                const existingWarning = balanceCard.querySelector('.withdrawal-warning');
                if (existingWarning) {
                    existingWarning.remove();
                }
            }
        }
    }
}

// Force scroll lock for chat section
function forceScrollLock(isLocked) {
    try {
        if (isLocked) {
            document.body.style.overflowY = 'hidden';
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflowY = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.classList.add('chat-active');
            document.documentElement.classList.add('chat-active');
        } else {
            document.body.style.overflowY = '';
            document.body.style.overflow = '';
            document.documentElement.style.overflowY = '';
            document.documentElement.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.classList.remove('chat-active');
            document.documentElement.classList.remove('chat-active');
        }
    } catch(_) {}
}

function updateBalanceUI(balance) {
    document.getElementById('balanceAmount').textContent = `$${balance.toFixed(2)}`;
}

// Update chat interface based on user level
function updateChatInterfaceForUserLevel(userLevel) {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');
    
    console.log('updateChatInterfaceForUserLevel called with level:', userLevel);
    
    if (!messageInput || !sendButton) return;
    
    if (userLevel === 'support') {
        // For support chat, enable for all users
            messageInput.placeholder = 'Write a message to support...';
        messageInput.disabled = false;
        sendButton.disabled = false;
        sendButton.style.opacity = '1';
        sendButton.title = 'Send message to support';
        
        // Remove warning if exists
        const chatInputContainer = messageInput.closest('.chat-input');
        if (chatInputContainer) {
            const existingWarning = chatInputContainer.querySelector('.chat-level-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
        }
    } else if (['silver', 'gold'].includes(userLevel)) {
        // For silver and gold users, enable chat input
        messageInput.placeholder = 'Type a message...';
        messageInput.disabled = false;
        sendButton.disabled = false;
        sendButton.style.opacity = '1';
        sendButton.title = '';
        
        // Remove warning if exists
        const chatInputContainer = messageInput.closest('.chat-input');
        if (chatInputContainer) {
            const existingWarning = chatInputContainer.querySelector('.chat-level-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
        }
    } else {
                 // For all other users (base, etc.), disable chat input
         messageInput.placeholder = 'Upgrade to Silver to unlock chat';
         messageInput.disabled = true;
         messageInput.style.fontSize = '12px';
         messageInput.style.marginLeft = '1px';
         messageInput.style.paddingLeft = '1px';
         sendButton.disabled = true;
         sendButton.style.opacity = '0.5';
         sendButton.style.fontSize = '12px';
         sendButton.title = 'Upgrade to Silver to unlock chat';
         
         // Add visual indicator
         const chatInputContainer = messageInput.closest('.chat-input');
         if (chatInputContainer) {
             // Remove existing warning if any
             const existingWarning = chatInputContainer.querySelector('.chat-level-warning');
             if (existingWarning) {
                 existingWarning.remove();
             }
             
             // Add warning message
             const warning = document.createElement('div');
             warning.className = 'chat-level-warning';
             warning.innerHTML = `
                 <div style="
                     
                    width: 12px;
                     padding: 0px;
                     margin-bottom: 4px;
                     color: #ffc107;
                     font-size: 12px;
                     text-align: center;
                 ">
                     <i class="fas fa-lock" ></i>
                    
                 </div>
             `;
             chatInputContainer.insertBefore(warning, messageInput);
         }
    }
}

function updateTaskStats(stats) {
    document.getElementById('availableTasks').textContent = stats.available;
    document.getElementById('myTasks').textContent = stats.my_tasks;
    document.getElementById('completedTasks').textContent = stats.done;
    
    // Update filter counts
    document.getElementById('availableCount').textContent = `(${stats.available})`;
    document.getElementById('myTasksCount').textContent = `(${stats.my_tasks})`;
    document.getElementById('revisionCount').textContent = `(${stats.revision})`;
    document.getElementById('doneCount').textContent = `(${stats.done})`;
}

function updateNewsUI(news) {
    console.log('📰 updateNewsUI called with:', news);
    
    const newsList = document.getElementById('newsList');
    const newsCountElement = document.querySelector('.news-count');
    
    console.log('📰 newsList element:', newsList);
    console.log('📰 newsCountElement:', newsCountElement);
    
    if (newsList) {
        newsList.innerHTML = '';
    }

    // Update news count
    if (newsCountElement) {
        const countText = `${news.length} Update${news.length !== 1 ? 's' : ''}`;
        newsCountElement.textContent = countText;
        console.log('📰 Updated news count to:', countText);
    } else {
        console.error('❌ newsCountElement not found!');
    }

    if (!news || news.length === 0) {
        console.log('📰 No news available');
        if (newsList) {
            newsList.innerHTML = '<div class="news-item"><p>No news available</p></div>';
        }
        return;
    }

    news.forEach(item => {
        const newsItem = document.createElement('div');
        newsItem.className = 'news-item';
        
        const date = new Date(item.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        newsItem.innerHTML = `
            <div class="news-item-header">
                <div class="news-item-title">${item.title}</div>
                
            </div>
            <div class="news-item-content">${item.content}</div>
            <div class="news-item-footer">
                <div class="news-item-date">${date}</div>
                <div class="news-item-tag">Company News</div>
            </div>
        `;
        
        newsList.appendChild(newsItem);
    });
}

function updateTasksUI(tasks, filterType) {
    console.log(`🎨 updateTasksUI вызвана для ${filterType} с данными:`, tasks);
    
    const tasksList = document.getElementById('tasksList');
    if (!tasksList) {
        console.error('❌ tasksList element not found!');
        return;
    }
    
    console.log(`🧹 Clearing task list for ${filterType}...`);
    tasksList.innerHTML = '';

    if (filterType === 'available') {
        // Отображение заданий по категориям для доступных заданий
        if (tasks.basic && tasks.basic.tasks.length === 0 && 
            tasks.silver && tasks.silver.tasks.length === 0 && 
            tasks.gold && tasks.gold.tasks.length === 0 && 
            tasks.platinum && tasks.platinum.tasks.length === 0) {
            tasksList.innerHTML = '<div class="task-card"><p>No tasks available</p></div>';
            return;
        }

        // Basic категория
        if (tasks.basic && tasks.basic.tasks.length > 0) {
            const basicSection = document.createElement('div');
            basicSection.className = 'task-category';
            basicSection.innerHTML = `
                <div class="category-header">
                    <h3>Basic</h3>
                    <span class="category-description"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M240-160h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM240-160v-400 400Zm0 80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h280v-80q0-83 58.5-141.5T720-920q83 0 141.5 58.5T920-720h-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80h120q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Z"/></svg></span>
                </div>
            `;
            
            const basicTasksContainer = document.createElement('div');
            basicTasksContainer.className = 'category-tasks';
            
            tasks.basic.tasks.forEach(task => {
                // Используем информацию о статусе из сервера
                const canTake = task.can_take !== undefined ? task.can_take : true;
                basicTasksContainer.appendChild(createTaskCard(task, filterType, canTake));
            });
            
            basicSection.appendChild(basicTasksContainer);
            tasksList.appendChild(basicSection);
        }

        // Silver категория
        if (tasks.silver && tasks.silver.tasks.length > 0) {
            const silverSection = document.createElement('div');
            silverSection.className = 'task-category';
            silverSection.innerHTML = `
                <div class="category-header">
                    <h3>Silver</h3>
                    <span class="category-description"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"/></svg></span>
                </div>
            `;
            
            const silverTasksContainer = document.createElement('div');
            silverTasksContainer.className = 'category-tasks';
            
            tasks.silver.tasks.forEach(task => {
                silverTasksContainer.appendChild(createTaskCard(task, filterType, tasks.silver.can_take));
            });
            
            silverSection.appendChild(silverTasksContainer);
            
            // Кнопка "Загрузить еще" (неактивна)
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'load-more-btn disabled';
            loadMoreBtn.innerHTML = '<button class="btn-secondary" disabled>Load more</button>';
            silverSection.appendChild(loadMoreBtn);
            
            tasksList.appendChild(silverSection);
        }

        // Gold категория
        if (tasks.gold && tasks.gold.tasks.length > 0) {
            const goldSection = document.createElement('div');
            goldSection.className = 'task-category';
            goldSection.innerHTML = `
                <div class="category-header">
                    <h3>Gold</h3>
                    <span class="category-description"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"/></svg></span>
                </div>
            `;
            
            const goldTasksContainer = document.createElement('div');
            goldTasksContainer.className = 'category-tasks';
            
            tasks.gold.tasks.forEach(task => {
                goldTasksContainer.appendChild(createTaskCard(task, filterType, tasks.gold.can_take));
            });
            
            goldSection.appendChild(goldTasksContainer);
            
            // Кнопка "Загрузить еще" (неактивна)
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'load-more-btn disabled';
            loadMoreBtn.innerHTML = '<button class="btn-secondary" disabled>Load more</button>';
            goldSection.appendChild(loadMoreBtn);
            
            tasksList.appendChild(goldSection);
        }

        // Platinum категория
        if (tasks.platinum && tasks.platinum.tasks.length > 0) {
            const platinumSection = document.createElement('div');
            platinumSection.className = 'task-category';
            platinumSection.innerHTML = `
                <div class="category-header">
                    <h3>Platinum</h3>
                    <span class="category-description"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"/></svg></span>
                </div>
            `;
            
            const platinumTasksContainer = document.createElement('div');
            platinumTasksContainer.className = 'category-tasks';
            
            tasks.platinum.tasks.forEach(task => {
                platinumTasksContainer.appendChild(createTaskCard(task, filterType, tasks.platinum.can_take));
            });
            
            platinumSection.appendChild(platinumTasksContainer);
            
            // Кнопка "Загрузить еще" (неактивна)
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'load-more-btn disabled';
            loadMoreBtn.innerHTML = '<button class="btn-secondary" disabled>Load more</button>';
            platinumSection.appendChild(loadMoreBtn);
            
            tasksList.appendChild(platinumSection);
        }
    } else {
        // Для других фильтров (my_tasks, revision, done) - обычное отображение
        console.log(`📋 Processing ${filterType} with ${tasks.length} tasks`);
        
        if (tasks.length === 0) {
            console.log(`📭 No tasks for ${filterType}`);
            tasksList.innerHTML = '<div class="task-card"><p>No tasks</p></div>';
            return;
        }

        console.log(`🎯 Creating cards for ${tasks.length} tasks...`);
        tasks.forEach((task, index) => {
            console.log(`📝 Creating card ${index + 1}/${tasks.length}:`, task.title);
            tasksList.appendChild(createTaskCard(task, filterType, true));
        });
        
        console.log(`✅ Created ${tasks.length} task cards for ${filterType}`);
    }

    // Add event listeners
    addTaskEventListeners(filterType);
}

// Функция для проверки доступа к заданию по уровню
function canAccessTaskLevel(taskLevel, userLevel) {
    if (!userLevel) {
        return false;
    }

    // Нормализуем названия уровней
    const normalizedUserLevel = userLevel === 'base' ? 'basic' : userLevel;

    const levelHierarchy = {
        'basic': 1,
        'silver': 2,
        'gold': 3,
        'platinum': 4
    };

    const userLevelValue = levelHierarchy[normalizedUserLevel] || 0;
    const taskLevelValue = levelHierarchy[taskLevel] || 0;

    return userLevelValue >= taskLevelValue;
}

function createTaskCard(task, filterType, canTake = true) {
    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    
    // Добавляем класс для взятых заданий
    if (task.user_task_status) {
        taskCard.classList.add('task-taken');
    }
    
    // Проверяем доступ к заданию по уровню
    const canAccessTask = canAccessTaskLevel(task.level_required, currentUser?.level);
    
    // Добавляем класс для недоступных заданий
    if (!canAccessTask) {
        taskCard.classList.add('task-inaccessible');
    }
    
    const date = new Date(task.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });

    // Укорачиваем описание до 2 строк
    const shortDescription = truncateText(task.description, 120);
    
    // Определяем статус задания
    let statusText = '';
    let statusClass = '';
    if (task.user_task_status) {
        switch(task.user_task_status) {
            case 'taken':
                statusText = 'Taken';
                statusClass = 'status-taken';
                break;
            case 'submitted':
                statusText = 'Submitted';
                statusClass = 'status-submitted';
                break;
            case 'revision':
                statusText = 'Revision';
                statusClass = 'status-revision';
                break;
            case 'approved':
                statusText = 'Approved';
                statusClass = 'status-approved';
                break;
        }
    }

    const taskContent = `
        <div class="task-header">
            <div class="task-title">${task.title}</div>
            ${statusText ? `<div class="task-status ${statusClass}">${statusText}</div>` : ''}
        </div>
        <div class="task-description">${shortDescription}</div>
        <div class="task-requirements">
            <div class="task-requirement">
                <i class="fas fa-clipboard-check"></i>
                <span><strong>Required proof:</strong> ${task.required_proof}</span>
            </div>
        </div>
        <div class="task-notes">
            <div class="task-note">
                <i class="fas fa-money-bill-wave"></i>
                <span>Reward: $${task.reward.toFixed(2)}</span>
            </div>
            <div class="task-note">
                <i class="fas fa-layer-group"></i>
                <span>Access level: ${task.level_required}</span>
            </div>
            ${task.time_limit && !task.user_task_status ? `
            <div class="task-note">
                <i class="fas fa-clock"></i>
                <span>Time limit: ${task.time_limit}h</span>
            </div>
            ` : ''}
            ${task.user_task_status && task.user_task_status !== 'approved' && (task.user_task_expires_at || task.expires_at) ? `
            <div class="task-note time-remaining">
                <i class="fas fa-hourglass-half"></i>
                <span class="${formatRemainingTimeWithSeconds(task.user_task_expires_at || task.expires_at)?.startsWith('-') ? 'expired' : ''}">${formatRemainingTimeWithSeconds(task.user_task_expires_at || task.expires_at)}</span>
            </div>
            ` : ''}

            ${task.admin_comment && filterType === 'my_tasks' && task.user_task_status === 'revision' ? `
            <div class="task-note admin-comment">
                <i class="fas fa-exclamation-triangle"></i>
                <span><strong>Revision comment:</strong> ${task.admin_comment}</span>
            </div>
            ` : ''}
        </div>
        <div class="task-footer">
            <div class="task-reward">$${task.reward.toFixed(2)}</div>
            
        </div>
        <div class="task-actions">
            <button class="btn-secondary view-details-btn" data-task-id="${task.id}" ${!canAccessTask ? 'disabled' : ''}>
                <i class="fas fa-eye"></i>
                View Details
            </button>
            ${filterType === 'available' ? 
                (task.user_task_status ? 
                    (task.user_task_status === 'taken' ? 
                        `<button class="btn-primary submit-task-btn" data-task-id="${task.id}">
                            <i class="fas fa-paper-plane"></i>
                            Submit for Review
                        </button>` :
                    `<button class="btn-secondary task-status-btn" data-task-id="${task.id}" disabled>
                        <i class="fas fa-check"></i>
                            ${task.user_task_status === 'submitted' ? 'Submitted' : 
                          task.user_task_status === 'revision' ? 'In Revision' : 
                          task.user_task_status === 'approved' ? 'Approved' : 'Processing'}
                        </button>`
                    ) :
                    `<button class="btn-primary take-task-btn" data-task-id="${task.id}" ${!canAccessTask ? 'disabled' : ''}>
                        <i class="fas fa-plus"></i>
                        Take Task
                    </button>`
                ) :
                filterType === 'my_tasks' ? 
                `<button class="btn-primary submit-task-btn" data-task-id="${task.id}">
                    <i class="fas fa-paper-plane"></i>
                    Submit for Review
                </button>` :
                ''
            }
        </div>
    `;
    
    taskCard.innerHTML = taskContent;
    return taskCard;
}

// Функция для укорачивания текста
function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + '...';
}

// Функция для форматирования оставшегося времени
function formatRemainingTime(expiresAt) {
    if (!expiresAt) return null;
    
    // Получаем текущее время
    const now = new Date();
    
    // Парсим время истечения как UTC (сервер отправляет время в UTC)
    // Добавляем 'Z' чтобы JavaScript интерпретировал как UTC
    const expiry = new Date(expiresAt + 'Z');
    
    const diff = expiry - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
    } else {
        return `${minutes}m remaining`;
    }
}

// Функция для форматирования оставшегося времени с секундами
function formatRemainingTimeWithSeconds(expiresAt) {
    if (!expiresAt) return null;
    
    // Получаем текущее время
    const now = new Date();
    
    // Парсим время истечения как UTC (сервер отправляет время в UTC)
    // Добавляем 'Z' чтобы JavaScript интерпретировал как UTC
    const expiry = new Date(expiresAt + 'Z');
    
    const diff = expiry - now;
    
    // Показываем отрицательное время если истекло
    if (diff <= 0) {
        const absDiff = Math.abs(diff);
        const hours = Math.floor(absDiff / (1000 * 60 * 60));
        const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);
        
        if (hours > 0) {
            return `-${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `-${minutes}m ${seconds}s`;
        } else {
            return `-${seconds}s`;
        }
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s remaining`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s remaining`;
    } else {
        return `${seconds}s remaining`;
    }
}

// Функция для обновления таймеров в реальном времени
function updateTimers() {
    // Обновляем все элементы с оставшимся временем
    const timeElements = document.querySelectorAll('.time-remaining span, .execution-time-value');
    
    timeElements.forEach(element => {
        const taskCard = element.closest('.task-card, .modal-content');
        if (!taskCard) return;
        
        // Находим данные задания
        let taskData = null;
        
        // Для карточек заданий
        if (taskCard.classList.contains('task-card')) {
            const taskId = taskCard.querySelector('[data-task-id]')?.getAttribute('data-task-id');
            if (taskId) {
                taskData = findTaskById(parseInt(taskId));
            }
        }
        // Для модального окна
        else if (taskCard.classList.contains('modal-content')) {
            const modal = document.getElementById('taskDetailsModal');
            if (modal && modal.dataset.currentTaskId) {
                taskData = findTaskById(parseInt(modal.dataset.currentTaskId));
            }
        }
        
        if (taskData && taskData.user_task_status !== 'approved' && (taskData.user_task_expires_at || taskData.expires_at)) {
            const remainingTime = formatRemainingTimeWithSeconds(taskData.user_task_expires_at || taskData.expires_at);
            element.textContent = remainingTime;
            
            if (remainingTime && remainingTime.startsWith('-')) {
                element.className = element.className.replace('time-remaining', '') + ' expired';
            } else {
                element.className = element.className.replace('expired', '') + ' time-remaining';
            }
        }
    });
}

// Запускаем обновление таймеров каждую секунду
setInterval(updateTimers, 1000);

// Функция для форматирования текста с поддержкой ссылок
function formatTextWithLinks(text) {
    if (!text) return '';
    
    // Экранируем HTML символы для безопасности
    const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    
    // Находим и заменяем URL на кликабельные ссылки
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return escapedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #8b5cf6; text-decoration: underline;">$1</a>');
}

// Функция для показа модального окна с деталями задания
function showTaskDetailsModal(taskId) {
    // Находим задание по ID
    const task = findTaskById(taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    // Создаем модальное окно если его нет
    let modal = document.getElementById('taskDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'taskDetailsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content task-details-modal">
                <div class="modal-header">
                    <h3>Task details</h3>
                    <span class="close" onclick="closeTaskDetailsModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="task-details-content">
                        <div class="task-detail-section">
                            <h4 class="task-detail-title"></h4>
                            <div class="task-detail-status"></div>
                        </div>
                        
                        <div class="task-detail-section">
                            <h5>Full description:</h5>
                            <div class="task-detail-description"></div>
                        </div>
                        
                        <div class="task-detail-section">
                            <h5>Required proof:</h5>
                            <div class="task-detail-proof"></div>
                        </div>
                        
                        <div class="task-detail-section">
                            <h5>Task characteristics:</h5>
                            <div class="task-detail-characteristics">
                                <div class="characteristic-item">
                                    <i class="fas fa-money-bill-wave"></i>
                                    <span class="characteristic-label">Reward:</span>
                                    <span class="characteristic-value reward-value"></span>
                                </div>
                                <div class="characteristic-item">
                                    <i class="fas fa-layer-group"></i>
                                    <span class="characteristic-label">Access level:</span>
                                    <span class="characteristic-value level-value"></span>
                                </div>
                                <div class="characteristic-item">
                                    <i class="fas fa-clock"></i>
                                    <span class="characteristic-label">Remaining time:</span>
                                    <span class="characteristic-value execution-time-value"></span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="task-detail-section admin-comment-section" style="display: none;">
                            <h5>Admin comment:</h5>
                            <div class="task-detail-admin-comment"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeTaskDetailsModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Добавляем обработчик для закрытия по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTaskDetailsModal();
            }
        });
    }
    
    // Заполняем данные задания
    const title = modal.querySelector('.task-detail-title');
    const status = modal.querySelector('.task-detail-status');
    const description = modal.querySelector('.task-detail-description');
    const proof = modal.querySelector('.task-detail-proof');
    const rewardValue = modal.querySelector('.reward-value');
    const levelValue = modal.querySelector('.level-value');
    const executionTimeValue = modal.querySelector('.execution-time-value');
    const adminCommentSection = modal.querySelector('.admin-comment-section');
    const adminComment = modal.querySelector('.task-detail-admin-comment');
    
    title.textContent = task.title;
    status.textContent = getTaskStatusText(task);
    status.className = `task-detail-status status-${getTaskStatusClass(task)}`;
    // Используем innerHTML для поддержки ссылок и выделения текста
    description.innerHTML = formatTextWithLinks(task.description);
    proof.innerHTML = formatTextWithLinks(task.required_proof);
    rewardValue.textContent = `$${task.reward.toFixed(2)}`;
    levelValue.textContent = task.level_required;
    
    // Отображаем time limit или оставшееся время (не для done заданий)
    if (task.user_task_status === 'approved') {
        executionTimeValue.textContent = 'Completed';
        executionTimeValue.className = 'characteristic-value execution-time-value';
    } else if (task.user_task_status && (task.user_task_expires_at || task.expires_at)) {
        const remainingTime = formatRemainingTimeWithSeconds(task.user_task_expires_at || task.expires_at);
        executionTimeValue.textContent = remainingTime;
        if (remainingTime && remainingTime.startsWith('-')) {
            executionTimeValue.className = 'characteristic-value execution-time-value expired';
        } else {
            executionTimeValue.className = 'characteristic-value execution-time-value time-remaining';
        }
    } else if (task.time_limit) {
        executionTimeValue.textContent = `${task.time_limit}h`;
        executionTimeValue.className = 'characteristic-value execution-time-value';
    } else {
        executionTimeValue.textContent = 'No limit';
        executionTimeValue.className = 'characteristic-value execution-time-value';
    }
    
    if (task.admin_comment) {
        adminCommentSection.style.display = 'block';
        adminComment.innerHTML = formatTextWithLinks(task.admin_comment);
    } else {
        adminCommentSection.style.display = 'none';
    }
    
    // Сохраняем ID текущего задания для обновления таймера
    modal.dataset.currentTaskId = taskId;
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Блокируем прокрутку фона
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Прокручиваем содержимое модального окна к началу
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
}

// Функция для закрытия модального окна с деталями задания
function closeTaskDetailsModal() {
    const modal = document.getElementById('taskDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        // Восстанавливаем прокрутку фона
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }
}

// Функция для поиска задания по ID
function findTaskById(taskId) {
    if (!currentTasksData) {
        console.error('No tasks data available');
        return null;
    }
    
    const taskIdNum = parseInt(taskId);
    
    // Для доступных заданий ищем по категориям
    if (currentTasksData.filterType === 'available') {
        const categories = ['basic', 'silver', 'gold', 'platinum'];
        for (const category of categories) {
            if (currentTasksData.data[category] && currentTasksData.data[category].tasks) {
                const task = currentTasksData.data[category].tasks.find(t => t.id === taskIdNum);
                if (task) return task;
            }
        }
    } else {
        // Для других фильтров ищем в массиве заданий
        if (Array.isArray(currentTasksData.data)) {
            return currentTasksData.data.find(t => t.id === taskIdNum);
        }
    }
    
    console.error('Task not found with ID:', taskId);
    return null;
}

// Функция для получения текста статуса задания
function getTaskStatusText(task) {
    if (task.user_task_status) {
        switch (task.user_task_status) {
            case 'taken': return 'In progress';
            case 'submitted': return 'Submitted';
            case 'revision': return 'On revision';
            case 'approved': return 'Completed';
            case 'rejected': return 'Rejected';

            default: return 'Available';
        }
    }
    return 'Available';
}

// Функция для получения класса статуса задания
function getTaskStatusClass(task) {
    if (task.user_task_status) {
        switch (task.user_task_status) {
            case 'taken': return 'in-progress';
            case 'submitted': return 'submitted';
            case 'revision': return 'revision';
            case 'approved': return 'completed';
            case 'rejected': return 'rejected';

            default: return 'available';
        }
    }
    return 'available';
}

// Функция для вычисления времени выполнения задания (отключена - задания не истекают)
function calculateExecutionTime(task) {
    return 'Unlimited';
}











function addTaskEventListeners(filterType) {
    // Add event listeners for take task buttons (only enabled ones)
    document.querySelectorAll('.take-task-btn:not(.disabled):not(:disabled)').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const taskId = button.dataset.taskId;
            // UI: disable button and show loading state
            const prevHtml = button.innerHTML;
            button.disabled = true;
            button.classList.add('disabled');
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Taking...';
            try {
                await apiRequest(`/tasks/${taskId}/take`, { method: 'POST' });
                // After successful take, switch UI to My Tasks and reload data
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const myBtn = document.querySelector('.filter-btn[data-filter="my_tasks"]');
                if (myBtn) myBtn.classList.add('active');
                currentTaskFilter = 'my_tasks';
                await loadTasks('my_tasks');
                await loadTaskStats();
            } catch (error) {
                // If already taken, still try to show in My Tasks
                if ((error?.message || '').toLowerCase().includes('task already taken')) {
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    const myBtn = document.querySelector('.filter-btn[data-filter="my_tasks"]');
                    if (myBtn) myBtn.classList.add('active');
                    currentTaskFilter = 'my_tasks';
                    await loadTasks('my_tasks');
                    await loadTaskStats();
                } else {
                    alert('Failed to take task: ' + error.message);
                }
            } finally {
                // Restore button state
                button.disabled = false;
                button.classList.remove('disabled');
                button.innerHTML = prevHtml;
            }
        });
    });
    
    // Add event listeners for submit task buttons
    document.querySelectorAll('.submit-task-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = e.target.closest('.submit-task-btn').dataset.taskId;
            showSubmitTaskModal(taskId);
        });
    });

    // Add event listeners for view details buttons (only enabled ones)
    document.querySelectorAll('.view-details-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = e.target.closest('.view-details-btn').dataset.taskId;
            showTaskDetailsModal(taskId);
        });
    });
}

function updateAwardsUI(awardsData) {
    console.log('Updating awards UI with data:', awardsData);
    
    // Top Earners
    const topEarnersList = document.getElementById('topEarnersList');
    if (!topEarnersList) {
        console.error('topEarnersList element not found!');
        return;
    }
    topEarnersList.innerHTML = '';
    
    if (awardsData.top_earners && awardsData.top_earners.length > 0) {
        console.log('Top earners found:', awardsData.top_earners.length);
        awardsData.top_earners.forEach((user, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'other';
            const rankIcon = index === 0 ? 'fas fa-crown' : index === 1 ? 'fas fa-medal' : index === 2 ? 'fas fa-medal' : 'fas fa-trophy';
            
            const awardItem = document.createElement('div');
            awardItem.className = 'award-item';
            awardItem.innerHTML = `
                <div class="award-rank ${rankClass}">
                    <i class="${rankIcon}"></i>
                </div>
                <div class="award-user">
                    <div class="award-name">${user.first_name} ${user.last_name}</div>
                    <div class="award-details">Period: monthly</div>
                </div>
                <div class="award-value">$${(user.balance || 0).toFixed(2)}</div>
            `;
            topEarnersList.appendChild(awardItem);
        });
    } else {
        console.log('No top earners data');
        topEarnersList.innerHTML = '<div class="award-item"><div class="award-user"><div class="award-name">No data</div></div></div>';
    }

    // Most Productive
    const mostProductiveList = document.getElementById('mostProductiveList');
    if (!mostProductiveList) {
        console.error('mostProductiveList element not found!');
        return;
    }
    mostProductiveList.innerHTML = '';
    
    if (awardsData.most_productive && awardsData.most_productive.length > 0) {
        console.log('Most productive found:', awardsData.most_productive.length);
        awardsData.most_productive.forEach((user, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'other';
            const rankIcon = index === 0 ? 'fas fa-crown' : index === 1 ? 'fas fa-medal' : index === 2 ? 'fas fa-medal' : 'fas fa-trophy';
            
            const awardItem = document.createElement('div');
            awardItem.className = 'award-item';
            awardItem.innerHTML = `
                <div class="award-rank ${rankClass}">
                    <i class="${rankIcon}"></i>
                </div>
                <div class="award-user">
                    <div class="award-name">${user.first_name} ${user.last_name}</div>
                    <div class="award-details">Period: monthly</div>
                </div>
                <div class="award-value">${user.tasks_completed || 0} tasks</div>
            `;
            mostProductiveList.appendChild(awardItem);
        });
    } else {
        console.log('No most productive data');
        mostProductiveList.innerHTML = '<div class="award-item"><div class="award-user"><div class="award-name">No data</div></div></div>';
    }

    // Quality Leaders
    const qualityLeadersList = document.getElementById('qualityLeadersList');
    if (!qualityLeadersList) {
        console.error('qualityLeadersList element not found!');
        return;
    }
    qualityLeadersList.innerHTML = '';
    
    if (awardsData.quality_leaders && awardsData.quality_leaders.length > 0) {
        console.log('Quality leaders found:', awardsData.quality_leaders.length);
        awardsData.quality_leaders.forEach((user, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'other';
            const rankIcon = index === 0 ? 'fas fa-crown' : index === 1 ? 'fas fa-medal' : index === 2 ? 'fas fa-medal' : 'fas fa-trophy';
            
            const awardItem = document.createElement('div');
            awardItem.className = 'award-item';
            awardItem.innerHTML = `
                <div class="award-rank ${rankClass}">
                    <i class="${rankIcon}"></i>
                </div>
                <div class="award-user">
                    <div class="award-name">${user.first_name} ${user.last_name}</div>
                    <div class="award-details">Period: monthly</div>
                </div>
                <div class="award-value">${user.approval_rate || 0}%</div>
            `;
            qualityLeadersList.appendChild(awardItem);
        });
    } else {
        console.log('No quality leaders data');
        qualityLeadersList.innerHTML = '<div class="award-item"><div class="award-user"><div class="award-name">No data</div></div></div>';
    }
}

// Функция для показа модального окна отправки задания
function showSubmitTaskModal(taskId) {
    // Создаем модальное окно если его нет
    let modal = document.getElementById('submitTaskModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'submitTaskModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Submit task for revision</h3>
                    <span class="close" onclick="closeSubmitTaskModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="taskProof">Description of the completed work:</label>
                        <textarea id="taskProof" rows="4" placeholder="Describe the work done, what was done, what results were achieved..."></textarea>
                    </div>
                    <div class="form-group">
                        <label for="taskFiles">Attach files:</label>
                        <input type="file" id="taskFiles" multiple accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar" style="display: none;">
                        <div class="file-upload-area" onclick="document.getElementById('taskFiles').click()">
                            <i class="fas fa-cloud-upload-alt"></i>
                            <p>Click to select files or drag and drop them here</p>
                            <small>Supported: images, PDF, documents, archives</small>
                        </div>
                        <div id="selectedFiles" class="selected-files"></div>
                    </div>
                    <div class="form-group">
                        <label for="taskLinks">Additional links (optional):</label>
                        <input type="text" id="taskLinks" placeholder="Links to Google Drive, Dropbox, YouTube, etc.">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeSubmitTaskModal()">Cancel</button>
                    <button class="btn-primary" onclick="submitTaskProof(${taskId})">Submit for revision</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Добавляем обработчик для drag & drop
        const fileArea = modal.querySelector('.file-upload-area');
        const fileInput = modal.querySelector('#taskFiles');
        const selectedFilesDiv = modal.querySelector('#selectedFiles');
        
        fileInput.addEventListener('change', handleFileSelect);
        
        fileArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileArea.classList.add('dragover');
        });
        
        fileArea.addEventListener('dragleave', () => {
            fileArea.classList.remove('dragover');
        });
        
        fileArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileArea.classList.remove('dragover');
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        });
    }
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Блокируем прокрутку фона
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Прокручиваем содержимое модального окна к началу
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
    
    document.getElementById('taskProof').value = '';
    document.getElementById('taskLinks').value = '';
    document.getElementById('selectedFiles').innerHTML = '';
    document.getElementById('taskFiles').value = '';
}

// Функция для обработки выбора файлов
function handleFileSelect() {
    const fileInput = document.getElementById('taskFiles');
    const selectedFilesDiv = document.getElementById('selectedFiles');
    const files = Array.from(fileInput.files);
    
    selectedFilesDiv.innerHTML = '';
    
    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const isImage = file.type.startsWith('image/');
        const fileIcon = isImage ? 'fas fa-image' : 'fas fa-file';
        
        fileItem.innerHTML = `
            <div class="file-info">
                <i class="${fileIcon}"></i>
                <span class="file-name">${file.name}</span>
                <span class="file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button class="remove-file" onclick="removeFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        selectedFilesDiv.appendChild(fileItem);
    });
}

// Функция для удаления файла
function removeFile(index) {
    const fileInput = document.getElementById('taskFiles');
    const files = Array.from(fileInput.files);
    files.splice(index, 1);
    
    // Создаем новый FileList
    const dt = new DataTransfer();
    files.forEach(file => dt.items.add(file));
    fileInput.files = dt.files;
    
    handleFileSelect();
}

// Функция для закрытия модального окна
function closeSubmitTaskModal() {
    const modal = document.getElementById('submitTaskModal');
    if (modal) {
        modal.remove(); // Полностью удаляем модальное окно из DOM
    }
    
    // Восстанавливаем прокрутку фона
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
}

// Функция для отправки доказательств
async function submitTaskProof(taskId) {
    const proof = document.getElementById('taskProof').value;
    const files = document.getElementById('taskFiles').files; // Get FileList
    const links = document.getElementById('taskLinks').value;
    
    if (!proof.trim() && files.length === 0 && !links.trim()) {
        alert('Please fill in the description field, attach files or add links.');
        return;
    }
    
    const formData = new FormData();
    if (proof) {
        formData.append('proof', proof);
    }
    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
    }
    if (links) {
        formData.append('links', links);
    }
    
    try {
        await apiRequest(`/tasks/${taskId}/submit`, { 
            method: 'POST',
            body: formData
        });
        closeSubmitTaskModal();
        
        // Обновляем все вкладки задач, чтобы задача исчезла из "My Tasks" и появилась в "Revision"
        const currentFilter = document.querySelector('.filter-btn.active').dataset.filter;
        loadTasks(currentFilter);
        loadTaskStats(); // Обновляем статистику
        
        // Показываем уведомление об успешной отправке
        showNotification('Task successfully sent for revision!', 'success');
    } catch (error) {
        alert('Failed to submit task: ' + error.message);
    }
}

// Функция для показа уведомлений
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Показываем уведомление
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Скрываем через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function updateChatUI(messages) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    if (messages.length === 0) {
        chatMessages.innerHTML = '<p>No messages yet</p>';
        return;
    }

    // Ensure chronological order (oldest -> newest) by timestamp
    const normalized = messages
        .map(m => ({...m, _ts: new Date(m.timestamp).getTime() || 0}))
        .sort((a, b) => a._ts - b._ts)
        .slice(-150);

    normalized.forEach(msg => {
        const messageItem = document.createElement('div');
        messageItem.className = 'message-item other-user-message';
        const initials = (msg.sender_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase();
        const time = new Date(msg.timestamp).toLocaleTimeString();
        messageItem.innerHTML = `
            <div class="message-avatar">${initials}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${msg.sender_name || 'Unknown'}</span>
                    <span class="message-time">(${time})</span>
                </div>
                <div class="message-text">${msg.message}</div>
                <div class="message-reply">
                    <i class="fas fa-reply"></i>
                </div>
            </div>
        `;
        chatMessages.appendChild(messageItem);
    });
}

// Event Listeners
// Auth Modal Functions
function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';
        // Hide main content
        const container = document.querySelector('.container');
        if (container) {
            container.style.display = 'none';
        }
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
        // Show main content
        const container = document.querySelector('.container');
        if (container) {
            container.style.display = 'block';
        }
    }
}

function switchAuthForm(toRegister = false) {
    const loginForm = document.getElementById('modalLoginForm');
    const registerForm = document.getElementById('modalRegisterForm');
    const switchText = document.getElementById('modalAuthSwitchText');
    const switchLink = document.getElementById('modalAuthSwitchLink');
    
    if (toRegister) {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        switchText.textContent = 'Already have an account?';
        switchLink.textContent = 'Login';
    } else {
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
        switchText.textContent = 'No account yet?';
        switchLink.textContent = 'Create it';
    }
}

async function handleModalLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('modalLoginEmail').value;
    const password = document.getElementById('modalLoginPassword').value;
    
    try {
        const response = await apiRequest('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.access_token) {
            localStorage.setItem('token', response.access_token);
            localStorage.setItem('user', JSON.stringify(response.user));
            
            // For login, go directly to main site
            hideAuthModal();
            location.reload();
        }
    } catch (error) {
        showNotification('Error logging in: ' + error.message, 'error');
    }
}

async function handleModalRegister(event) {
    event.preventDefault();
    
    const firstName = document.getElementById('modalFirstName').value;
    const lastName = document.getElementById('modalLastName').value;
    const email = document.getElementById('modalRegisterEmail').value;
    const telegramUsername = document.getElementById('modalTelegramUsername').value;
    const password = document.getElementById('modalRegisterPassword').value;
    const confirmPassword = document.getElementById('modalConfirmPassword').value;
    
    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    try {
        const response = await apiRequest('/register', {
            method: 'POST',
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email,
                telegram_username: telegramUsername,
                password
            })
        });
        
        if (response.access_token) {
            localStorage.setItem('token', response.access_token);
            localStorage.setItem('user', JSON.stringify(response.user));
            
            // Redirect to documents page
            window.location.href = '/documents';
        }
    } catch (error) {
        showNotification('Error registering: ' + error.message, 'error');
    }
}

// Document Modal Functions
function showDocumentModal() {
    const modal = document.getElementById('documentModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideDocumentModal() {
    const modal = document.getElementById('documentModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function handleDocumentAcceptance() {
    try {
        // Accept documents via API
        await apiRequest('/api/accept-documents', {
            method: 'POST'
        });
        
        // Update user data
        currentUser.documents_accepted = true;
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        const welcomeNotification = document.getElementById('welcomeNotificationModal');
        
        // Show welcome notification
        welcomeNotification.style.display = 'block';
        
        // Hide document modal
        hideDocumentModal();
        
        // Hide notification and reload page after 3 seconds
        setTimeout(function() {
            welcomeNotification.style.display = 'none';
            location.reload();
        }, 3000);
    } catch (error) {
        console.error('Error accepting documents:', error);
        alert('Error accepting documents. Please try again.');
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
        currentToken = savedToken;
        currentUser = JSON.parse(savedUser);
        await showApp();
    }

    // Auth form switching
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthForm('register');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthForm('login');
    });

    // Login form submission
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            await login(email, password);
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    });

    // Register form submission
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        const userData = {
            first_name: document.getElementById('firstName').value,
            last_name: document.getElementById('lastName').value,
            email: document.getElementById('registerEmail').value,
            telegram_username: document.getElementById('telegramUsername').value,
            password: password
        };
        
        try {
            await register(userData);
            alert('Registration successful! Please log in.');
            showAuthForm('login');
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    });

    // Withdrawals quick menu button
    try {
        const openWithdrawalsMenuBtn = document.getElementById('openWithdrawalsMenuBtn');
        if (openWithdrawalsMenuBtn) {
            openWithdrawalsMenuBtn.addEventListener('click', showWithdrawalsQuickMenu);
        } else {
            // Fallback delegate in case button is re-rendered later
            document.addEventListener('click', function(e) {
                const trigger = e.target && e.target.closest ? e.target.closest('#openWithdrawalsMenuBtn') : null;
                if (trigger) {
                    showWithdrawalsQuickMenu();
                }
            });
        }
    } catch(_) {}

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            
            // Force hide tour overlay to prevent darkening effect
            forceHideTourOverlay();
            
            // Update navigation
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Update sections
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(`${section}-section`).classList.add('active');
            
            // Отслеживаем активность чата
            isChatSectionActive = (section === 'chat');
            
            // Управление прокруткой app-container в зависимости от активной вкладки
            try {
                const appContainerEl = document.getElementById('app-container');
                if (appContainerEl) {
                    if (isChatSectionActive) {
                        appContainerEl.classList.add('no-scroll');
                    } else {
                        appContainerEl.classList.remove('no-scroll');
                    }
                }
            } catch(_) {}
            
            // Управление прокруткой body при входе в чат
            forceScrollLock(isChatSectionActive);
            
            // Update user level when switching sections
            updateUserLevel();
            
            // Load section-specific data
            switch(section) {
                case 'home':
                    isChatSectionActive = false;
                    console.log('🏠 Switching to home section, loading news...');
                    loadNews();
                    // Immediate news refresh when switching to Home
                    setTimeout(() => {
                        console.log('🔄 Immediate news refresh for home section...');
                        loadNews();
                    }, 1000);
                    stopChatPolling(); // Stop chat polling when leaving chat
                    // Разблокируем прокрутку при выходе из чата
                    setTimeout(() => forceScrollLock(false), 100);
                    break;
                case 'tasks':
                    isChatSectionActive = false;
                    loadTasks('available');
                    stopChatPolling(); // Stop chat polling when leaving chat
                    // Разблокируем прокрутку при выходе из чата
                    setTimeout(() => forceScrollLock(false), 100);
                    break;
                case 'chat':
                    isChatSectionActive = true;
                    // Всегда открываем чат general при переходе в раздел чатов
                    currentChatType = 'general';
                    switchChatType('general');
                    loadChatMessages('general');
                    startChatPolling(); // Start real-time updates when entering chat
                    // Force hide tour overlay specifically for chat section
                    forceHideTourOverlay();
                    // Также сразу информируем сервер, что активный чат прочитан
                    apiRequest(`/api/chat/mark-read?chat_type=general`, { method: 'POST' }).catch(() => {});
                    // Принудительно блокируем прокрутку для чата
                    setTimeout(() => forceScrollLock(true), 100);
                    break;
                case 'awards':
                    isChatSectionActive = false;
                    console.log('Switching to awards section, loading awards data...');
                    loadAwards();
                    stopChatPolling(); // Stop chat polling when leaving chat
                    // Разблокируем прокрутку при выходе из чата
                    setTimeout(() => forceScrollLock(false), 100);
                    break;
                case 'profile':
                    isChatSectionActive = false;
                    loadUserData();
                    stopChatPolling(); // Stop chat polling when leaving chat
                    // Разблокируем прокрутку при выходе из чата
                    setTimeout(() => forceScrollLock(false), 100);
                    break;
            }
        });
    });

    // Task filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filterType = btn.dataset.filter;
            currentTaskFilter = filterType; // Save current filter
            console.log('🔀 Task filter changed to:', filterType);
            loadTasks(filterType);
        });
    });

    // Chat tabs - now handled by initializeChat() function
    // Old event listeners removed to prevent conflicts with new real-time system

    // Chat functionality is now handled by initializeChat() function
    // Old event listeners removed to prevent duplicate message sending


    
    // Ensure scroll lock is applied if user is in chat section
    setTimeout(() => {
        if (isChatSectionActive) {
            forceScrollLock(true);
        }
    }, 500);
    // Withdraw button
    document.getElementById('withdrawBtn').addEventListener('click', () => {
        // Additional check for user level
        if (currentUser && currentUser.level === 'base') {
            showNotification('Upgrade to Silver to access withdrawals', 'error');
            return;
        }
        showWithdrawalModal();
    });

    // Profile actions
    document.getElementById('applyVerification').addEventListener('click', () => {
    showVerificationForm();
});

    // document.getElementById('bindPayment').addEventListener('click', () => {
    //     alert('Payment method binding will be implemented later');
    // });

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Auth modal event listeners
    const modalLoginForm = document.getElementById('modalLoginForm');
    const modalRegisterForm = document.getElementById('modalRegisterForm');
    const modalAuthSwitchLink = document.getElementById('modalAuthSwitchLink');
    
    if (modalLoginForm) {
        modalLoginForm.addEventListener('submit', handleModalLogin);
    }
    
    if (modalRegisterForm) {
        modalRegisterForm.addEventListener('submit', handleModalRegister);
    }
    
    if (modalAuthSwitchLink) {
        modalAuthSwitchLink.addEventListener('click', function(e) {
            e.preventDefault();
            const isLoginActive = document.getElementById('modalLoginForm').classList.contains('active');
            switchAuthForm(isLoginActive);
        });
    }
    
    // Document modal event listeners
    const confirmDocumentsModal = document.getElementById('confirmDocumentsModal');
    const acceptButtonModal = document.getElementById('acceptButtonModal');
    
    if (confirmDocumentsModal && acceptButtonModal) {
        // Enable/disable accept button based on checkbox
        confirmDocumentsModal.addEventListener('change', function() {
            if (this.checked) {
                acceptButtonModal.disabled = false;
                acceptButtonModal.classList.add('enabled');
            } else {
                acceptButtonModal.disabled = true;
                acceptButtonModal.classList.remove('enabled');
            }
        });
        
        // Handle accept button click
        acceptButtonModal.addEventListener('click', function() {
            if (confirmDocumentsModal.checked) {
                handleDocumentAcceptance();
            }
        });
    }
});

// Navigation helper function for tour
function showTab(tabName) {
    // Find navigation item with matching section
    const navItem = document.querySelector(`.nav-item[data-section="${tabName}"]`);
    if (navItem) {
        navItem.click(); // Trigger existing navigation logic
    }
}

// Switch chat type helper function
function switchChatType(chatType) {
    chatTabSelected = true;
    currentChatType = chatType;
    
    // Update chat tabs
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.chat === chatType) {
            tab.classList.add('active');
        }
    });
    
    // Update chat content area with smooth transitions
    const generalChat = document.getElementById('general-chat');
    const supportChat = document.getElementById('support-chat');
    const chatMessagesContainer = document.querySelector('.chat-messages');
    
    if (chatType === 'support') {
        // Простое переключение к чату поддержки
        if (generalChat) {
            generalChat.style.display = 'none';
        }
        if (supportChat) {
            supportChat.style.display = 'block';
        }
        // Изменение фона
        if (chatMessagesContainer) {
            chatMessagesContainer.classList.add('support-active');
        }
    } else {
        // Простое переключение к общему чату
        if (supportChat) {
            supportChat.style.display = 'none';
        }
        if (generalChat) {
            generalChat.style.display = 'block';
        }
        // Изменение фона
        if (chatMessagesContainer) {
            chatMessagesContainer.classList.remove('support-active');
        }
    }
    
    // Update chat interface based on user level and chat type
    if (currentUser) {
        console.log('switchChatType - currentUser level:', currentUser.level, 'chatType:', chatType);
        if (chatType === 'support') {
            console.log('Enabling support chat for all users');
            updateChatInterfaceForUserLevel('support');
        } else if (chatType === 'general') {
            console.log('Checking general chat access for user level:', currentUser.level);
            updateChatInterfaceForUserLevel(currentUser.level);
        }
    }
    
    // Load messages for the chat type (only if not already loaded)
    if (!chatMessagesLoaded || lastLoadedChatType !== chatType) {
        loadChatMessages(chatType);
        lastLoadedChatType = chatType;
        chatMessagesLoaded = true;
    } else {
        // Если сообщения уже загружены, просто прокручиваем к последнему сообщению
        setTimeout(() => {
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }, 100);
    }
    
    // Mark chat as read when switching to it
    markChatAsRead(chatType);
    
    // Start real-time updates for this chat
    startChatPolling();
}

// Start real-time chat polling
function startChatPolling() {
    // Clear any existing polling
    stopChatPolling();
    
    // Show live indicator
    const statusIndicator = document.getElementById('chatStatusIndicator');
    if (statusIndicator) {
        statusIndicator.style.display = 'flex';
    }
    
    // Start new polling every 3 seconds
    chatPollingInterval = setInterval(() => {
        // Only poll if user is logged in and chat is visible
        if (currentUser && currentChatType) {
            // Загружаем ТОЛЬКО активный чат
            apiRequest(`/api/chat/messages?type=${currentChatType}&limit=150`)
                .then(response => {
                    const messages = response.messages || [];
                    // Для активного чата только обновляем отображение
                    displayChatMessages(messages);
                    // Mark active chat as read on server
                    apiRequest(`/api/chat/mark-read?chat_type=${currentChatType}`, { method: 'POST' }).catch(() => {});
                })
                .catch(() => {});
        }
    }, 3000);
}

// Stop chat polling
function stopChatPolling() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
    
    // Hide live indicator
    const statusIndicator = document.getElementById('chatStatusIndicator');
    if (statusIndicator) {
        statusIndicator.style.display = 'none';
    }
}



// Logout function
function logout() {
    // Stop all polling before logout
    stopChatPolling();
    stopUnreadPolling();
    
    // Reset chat flags
    chatMessagesLoaded = false;
    lastLoadedChatType = null;
    
    currentUser = null;
    currentToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Show logout notification
    showNotification('You have successfully logged out of the system', 'success');
    
    // Redirect to login page
    setTimeout(() => {
        window.location.href = '/login';
    }, 1000);
}

// Auto-refresh data every 5 seconds
setInterval(() => {
    if (currentUser) {
        loadUserData();
        loadNews();
        
        // Load tasks with current filter
        loadTasks(currentTaskFilter);
    }
}, 5000);

// Onboarding Tour System
class OnboardingTour {
    constructor() {
        console.log('=== ONBOARDING TOUR CONSTRUCTOR CALLED ===');
        console.log('Constructor call stack:', new Error().stack);
        
        this.currentStep = 0;
        this.isActive = false;
        this.steps = [
            {
                target: '.balance-card',
                title: 'Your Balance & Withdrawal',
                description: 'This is your current balance card. Here you can see your earnings and use the green "Withdraw" button to cash out your money.',
                position: 'bottom'
            },
            {
                target: '.news-section',
                title: 'News & Updates',
                description: 'Stay updated with the latest news and announcements from our platform. Important updates will appear here.',
                position: 'top'
            },
            {
                target: '.bottom-nav',
                title: 'Navigation Menu',
                description: 'Use this navigation to switch between different sections: Home, Tasks, Chat, Awards, and Profile.',
                position: 'top'
            },
            {
                target: '.nav-item[data-section="tasks"]',
                title: 'Tasks Section',
                description: 'Here you can find available tasks, track your progress, and manage your completed work.',
                position: 'top'
            },
            {
                target: '.nav-item[data-section="chat"]',
                title: 'Chat & Support',
                description: 'Access general chat with other users or contact support for assistance.',
                position: 'top'
            }
        ];
        
        this.elements = {
            overlay: document.getElementById('tourOverlay'),
            highlight: document.getElementById('tourHighlight'),
            tooltip: document.getElementById('tourTooltip'),
            progress: document.getElementById('tourProgress'),
            title: document.getElementById('tourTitle'),
            description: document.getElementById('tourDescription'),
            nextBtn: document.getElementById('tourNext'),
            skipBtn: document.getElementById('tourSkip'),
            completeModal: document.getElementById('tourCompleteModal'),
            goToSupportBtn: document.getElementById('goToSupport')
        };
        
        this.bindEvents();
        console.log('=== ONBOARDING TOUR CONSTRUCTOR COMPLETED ===');
    }
    
    bindEvents() {
        this.elements.nextBtn.addEventListener('click', async () => await this.nextStep());
        this.elements.skipBtn.addEventListener('click', async () => await this.skipTour());
        this.elements.goToSupportBtn.addEventListener('click', () => this.goToSupport());
        
        // Close tour on overlay click
        this.elements.overlay.addEventListener('click', async () => await this.skipTour());
    }
    
    start() {
        console.log('=== TOUR START METHOD CALLED ===');
        console.log('Call stack:', new Error().stack);
        if (this.isActive) {
            console.log('Tour already active, preventing start...');
            return;
        }
        
        // Start tour immediately since status was already checked in showApp()
        console.log('Starting tour immediately...');
        this.isActive = true;
        this.currentStep = 0;
        this.elements.overlay.style.display = 'block';
        this.showStep();
        console.log('=== TOUR START METHOD COMPLETED ===');
    }
    
    showStep() {
        const step = this.steps[this.currentStep];
        const targetElement = document.querySelector(step.target);
        
        if (!targetElement) {
            console.warn(`Tour target not found: ${step.target}`);
            this.nextStep();
            return;
        }
        
        // Update progress
        this.elements.progress.textContent = `Step ${this.currentStep + 1} of ${this.steps.length}`;
        
        // Update tooltip content
        this.elements.title.textContent = step.title;
        this.elements.description.textContent = step.description;
        
        // Update button text
        this.elements.nextBtn.textContent = this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next';
        
        // Position highlight
        this.positionHighlight(targetElement);
        
        // Position tooltip
        this.positionTooltip(targetElement, step.position);
        
        // Show elements
        this.elements.highlight.style.display = 'block';
        this.elements.tooltip.style.display = 'block';
        this.elements.progress.style.display = 'block';
    }
    
    positionHighlight(element) {
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        this.elements.highlight.style.top = (rect.top + scrollTop - 5) + 'px';
        this.elements.highlight.style.left = (rect.left + scrollLeft - 5) + 'px';
        this.elements.highlight.style.width = (rect.width + 10) + 'px';
        this.elements.highlight.style.height = (rect.height + 10) + 'px';
        
        // Устанавливаем светло-серое затемнение вокруг активной области
        this.elements.highlight.style.boxShadow = '0 0 0 9999px rgba(240, 240, 240, 0.78)';
    }
    
    positionTooltip(element, position) {
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const tooltipRect = this.elements.tooltip.getBoundingClientRect();
        
        let top, left;
        
        if (position === 'bottom') {
            top = rect.bottom + scrollTop + 15;
            left = rect.left + scrollLeft + (rect.width / 2) - (tooltipRect.width / 2);
        } else if (position === 'top') {
            top = rect.top + scrollTop - tooltipRect.height - 15;
            left = rect.left + scrollLeft + (rect.width / 2) - (tooltipRect.width / 2);
        } else if (position === 'right') {
            top = rect.top + scrollTop + (rect.height / 2) - (tooltipRect.height / 2);
            left = rect.right + scrollLeft + 15;
        } else { // left
            top = rect.top + scrollTop + (rect.height / 2) - (tooltipRect.height / 2);
            left = rect.left + scrollLeft - tooltipRect.width - 15;
        }
        
        // Keep tooltip within viewport
        const margin = 20;
        left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
        top = Math.max(margin, top);
        
        this.elements.tooltip.style.top = top + 'px';
        this.elements.tooltip.style.left = left + 'px';
    }
    
    async nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else {
            await this.completeTour();
        }
    }
    
    async skipTour() {
        console.log('=== TOUR SKIP CALLED ===');
        this.endTour();
        
        // Save tour completion status to database
        try {
            await apiRequest('/api/tour/complete', {
                method: 'POST'
            });
            console.log('Tour skip saved to database');
            // Sync localStorage with database
            localStorage.setItem('tourCompleted', 'true');
        } catch (error) {
            console.error('Failed to save tour skip:', error);
            // Fallback to localStorage
            localStorage.setItem('tourCompleted', 'true');
        }

        // Trigger bottom nav animation once after tour skip
        try {
            localStorage.setItem('playNavAnimationOnce', '1');
            playBottomNavAnimation();
        } catch(_) {}
        console.log('=== TOUR SKIP COMPLETED ===');
    }
    
    async completeTour() {
        console.log('=== TOUR COMPLETE CALLED ===');
        this.endTour();
        this.elements.completeModal.style.display = 'flex';
        
        // Save tour completion status to database
        try {
            await apiRequest('/api/tour/complete', {
                method: 'POST'
            });
            console.log('Tour completion saved to database');
            // Sync localStorage with database
            localStorage.setItem('tourCompleted', 'true');
        } catch (error) {
            console.error('Failed to save tour completion:', error);
            // Fallback to localStorage
            localStorage.setItem('tourCompleted', 'true');
        }

        // Trigger bottom nav animation once after tour completion
        try {
            localStorage.setItem('playNavAnimationOnce', '1');
            // Try to play immediately as the modal appears
            playBottomNavAnimation();
        } catch(_) {}
        console.log('=== TOUR COMPLETE COMPLETED ===');
    }
    
    endTour() {
        this.isActive = false;
        this.elements.overlay.style.display = 'none';
        this.elements.highlight.style.display = 'none';
        this.elements.tooltip.style.display = 'none';
        this.elements.progress.style.display = 'none';
        
        // Remove any remaining tour-related elements
        document.querySelectorAll('.tour-highlight, .tour-tooltip, .tour-overlay, .tour-progress').forEach(el => {
            el.remove();
        });
        
        // Clear any inline styles that might have been added
        document.querySelectorAll('[style*="position: relative"]').forEach(el => {
            if (el.style.position === 'relative' && el.classList.contains('tour-target')) {
                el.style.position = '';
                el.classList.remove('tour-target');
            }
        });
        
        // Remove any tour-related classes from all elements
        document.querySelectorAll('.tour-target, .tour-highlighted').forEach(el => {
            el.classList.remove('tour-target', 'tour-highlighted');
        });
        
        // Reset body overflow and any tour-related styles
        document.body.style.overflow = '';
        document.body.classList.remove('tour-active');
        
        // Force a repaint to ensure all visual changes are applied
        document.body.offsetHeight;
    }
    
    goToSupport() {
        this.elements.completeModal.style.display = 'none';
        // Play bottom nav animation right after closing completion modal
        try {
            localStorage.setItem('playNavAnimationOnce', '1');
            playBottomNavAnimation();
        } catch(_) {}
        
        // Switch to chat tab and then to support chat
        showTab('chat');
        setTimeout(() => {
            switchChatType('support');
            // Send welcome message from admin (only if not already sent)
            this.sendWelcomeMessage();
        }, 1000); // Increased delay to ensure chat is loaded
    }
    
    async sendWelcomeMessage() {
        try {
            // Send welcome message through API (this will check for duplicates on the server)
            const response = await apiRequest('/api/send-welcome-message', {
                method: 'POST'
            });
            
            if (response.already_sent) {
                console.log('Welcome message already sent, skipping...');
                return;
            }
            
            // Reload chat messages to show the new welcome message
            await loadChatMessages('support');
            
            // Show notification
            showNotification('Welcome message from support received!', 'success');
            
        } catch (error) {
            console.error('Failed to send welcome message:', error);
        }
    }
    

}

// Initialize tour
const onboardingTour = new OnboardingTour();
window.onboardingTour = onboardingTour; // Make it globally accessible

// Force hide tour overlay to prevent darkening effect
function forceHideTourOverlay() {
    const tourOverlay = document.getElementById('tourOverlay');
    const tourHighlight = document.getElementById('tourHighlight');
    const tourTooltip = document.getElementById('tourTooltip');
    const tourProgress = document.getElementById('tourProgress');
    
    if (tourOverlay) tourOverlay.style.display = 'none';
    if (tourHighlight) tourHighlight.style.display = 'none';
    if (tourTooltip) tourTooltip.style.display = 'none';
    if (tourProgress) tourProgress.style.display = 'none';
    
    // Remove any tour-related classes
    document.querySelectorAll('.tour-target, .tour-highlighted').forEach(el => {
        el.classList.remove('tour-target', 'tour-highlighted');
    });
    
    // Reset body styles
    document.body.style.overflow = '';
    document.body.classList.remove('tour-active');
}

// Call this function when the app loads to ensure no overlay is present
document.addEventListener('DOMContentLoaded', forceHideTourOverlay);

// Also call it when the window loads to ensure it's hidden
window.addEventListener('load', forceHideTourOverlay);

// Initialize chat functionality
function initializeChat() {
    // Chat tab switching
    document.querySelectorAll('.chat-tab').forEach(tab => {
        // Remove existing listeners to prevent duplicates
        tab.removeEventListener('click', handleChatTabClick);
        tab.addEventListener('click', handleChatTabClick);
        // Дополнительно: при клике сразу помечаем как прочитанное
        tab.addEventListener('click', () => {
            const chatType = tab.dataset.chat;
            if (chatType) {
                apiRequest(`/api/chat/mark-read?chat_type=${chatType}`, { method: 'POST' }).catch(() => {});
            }
        });
    });
    
    // Always set general chat as active and update UI
    currentChatType = 'general';
    
    // Update chat tabs to show general as active
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.chat === 'general') {
            tab.classList.add('active');
        }
    });
    
    // Initialize chat background for general chat
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
        chatMessages.classList.remove('support-active');
    }
    
    // Send message functionality
    const sendButton = document.getElementById('sendMessage');
    const messageInput = document.getElementById('messageInput');
    
    if (sendButton) {
        // Remove existing listeners to prevent duplicates
        sendButton.removeEventListener('click', sendChatMessage);
        sendButton.addEventListener('click', sendChatMessage);
    }
    
    if (messageInput) {
        // Remove existing listeners to prevent duplicates
        messageInput.removeEventListener('keypress', handleMessageKeypress);
        messageInput.addEventListener('keypress', handleMessageKeypress);
    }
}

// Кэш для статуса верификации
let verificationStatusCache = null;
let lastVerificationCheck = 0;
const VERIFICATION_CACHE_DURATION = 30000; // 30 секунд

// Verification functions
async function loadVerificationStatus(forceRefresh = false) {
    try {
        const currentTime = Date.now();
        
        // Используем кэш, если он не устарел и не требуется принудительное обновление
        if (!forceRefresh && verificationStatusCache && (currentTime - lastVerificationCheck) < VERIFICATION_CACHE_DURATION) {
            updateVerificationUI(verificationStatusCache);
            return;
        }
        
        const response = await apiRequest('/api/verification/status');
        const verificationBadge = document.getElementById('verificationBadge');
        const applyButton = document.getElementById('applyVerification');
        
        if (!verificationBadge || !applyButton) {
            console.log('Verification elements not found, skipping status update');
            return;
        }
        
        // Обновляем кэш
        verificationStatusCache = response.status;
        lastVerificationCheck = currentTime;
        
        updateVerificationUI(response.status);
        
    } catch (error) {
        console.error('Failed to load verification status:', error);
        // Don't show error to user, just log it
        // This prevents the error from appearing when verification system is not fully set up
    }
}

// Функция для обновления UI статуса верификации
function updateVerificationUI(status) {
    const verificationBadge = document.getElementById('verificationBadge');
    const applyButton = document.getElementById('applyVerification');
    
    if (!verificationBadge || !applyButton) return;
    
    if (status === 'approved') {
            verificationBadge.className = 'status-badge verified';
            verificationBadge.innerHTML = '<i class="fas fa-check"></i>Verified';
            applyButton.style.display = 'none';
    } else if (status === 'pending') {
        verificationBadge.className = 'status-badge pending';
            verificationBadge.innerHTML = '<i class="fas fa-clock"></i>Pending';
            applyButton.style.display = 'none';
    } else if (status === 'rejected') {
            verificationBadge.className = 'status-badge rejected';
            verificationBadge.innerHTML = '<i class="fas fa-times"></i>Rejected';
            applyButton.style.display = 'block';
            applyButton.textContent = 'Reapply for Verification';
        } else {
            verificationBadge.className = 'status-badge unverified';
            verificationBadge.innerHTML = '<i class="fas fa-times"></i>Unverified';
            applyButton.style.display = 'block';
            applyButton.textContent = 'Apply for Verification';
    }
}

function showVerificationForm() {
    const formHTML = `
        <div id="verificationModal" class="modal verification-modal" style="display: flex;">
            <div class="modal-content verification-content">
                <div class="verification-header">
                    <div class="verification-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="#4CAF50"/>
                            <path d="M19 15L19.74 17.74L22.5 18.5L19.74 19.26L19 22L18.26 19.26L15.5 18.5L18.26 17.74L19 15Z" fill="#2196F3"/>
                            <path d="M5 6L5.5 7.5L7 8L5.5 8.5L5 10L4.5 8.5L3 8L4.5 7.5L5 6Z" fill="#FF9800"/>
                        </svg>
                    </div>
                    <div class="verification-title">
                        <h2>🔐 Identity Verification</h2>
                        <p>Complete your profile verification to unlock advanced features</p>
                    </div>
                    <span class="close verification-close" onclick="closeVerificationModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                </div>
                
                <div class="verification-progress">
                    <div class="progress-step active" data-step="1">
                        <div class="step-number">1</div>
                        <div class="step-label">Personal Info</div>
                    </div>
                    <div class="progress-line"></div>
                    <div class="progress-step" data-step="2">
                        <div class="step-number">2</div>
                        <div class="step-label">Documents</div>
                    </div>
                    <div class="progress-line"></div>
                    <div class="progress-step" data-step="3">
                        <div class="step-number">3</div>
                        <div class="step-label">Review</div>
                    </div>
                </div>
                
                <form id="verificationForm" class="verification-form">
                    <div class="form-section active" data-section="1">
                        <h3>📝 Personal Information</h3>
                        <p class="section-description">Please provide your personal details as they appear in your official documents.</p>
                        
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="fullName">
                                    <i class="fas fa-user"></i>
                                    Full Name 
                                </label>
                                <input type="text" id="fullName" required placeholder="Enter your full name">
                                <div class="input-icon">
                                    <i class="fas fa-user-check"></i>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="dateOfBirth">
                                    <i class="fas fa-calendar"></i>
                                    Date of Birth
                                </label>
                                <input type="date" id="dateOfBirth" required placeholder="MM/DD/YYYY">
                                <div class="input-icon">
                                    <i class="fas fa-calendar-check"></i>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="phoneNumber">
                                    <i class="fas fa-phone"></i>
                                    Phone Number
                                </label>
                                <input type="tel" id="phoneNumber" required placeholder="+XX XXX XXX XXXX">
                                <div class="input-icon">
                                    <i class="fas fa-phone-check"></i>
                                </div>
                            </div>
                            
                            <div class="form-group full-width">
                                <label for="address">
                                    <i class="fas fa-map-marker-alt"></i>
                                    Full Address
                                </label>
                                <textarea id="address" rows="3" required placeholder="Enter your complete address"></textarea>
                                <div class="input-icon">
                                    <i class="fas fa-map-check"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section" data-section="2">
                        <h3>📄 Document Information</h3>
                        <p class="section-description">Provide your document details for verification purposes.</p>
                        
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="passportNumber">
                                    <i class="fas fa-id-card"></i>
                                    Document Number
                                </label>
                                <input type="text" id="passportNumber" required placeholder="1234 567890">
                                <div class="input-icon">
                                    <i class="fas fa-id-check"></i>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="passportIssuer">
                                    <i class="fas fa-building"></i>
                                    Country
                                </label>
                                <input type="text" id="passportIssuer" required placeholder="United States">
                                <div class="input-icon">
                                    <i class="fas fa-building-check"></i>
                                </div>
                            </div>

                            
                            <div class="form-group">
                                <label for="passportIssueDate">
                                    <i class="fas fa-calendar-alt"></i>
                                    Issue Date
                                </label>
                                <input type="date" id="passportIssueDate" required placeholder="MM/DD/YYYY">
                                <div class="input-icon">
                                    <i class="fas fa-calendar-check"></i>
                                </div>
                            </div>
                            
                            
                        </div>
                    </div>
                    
                    <div class="form-section" data-section="3">
                        <h3>📸 Document Upload</h3>
                        <p class="section-description">Upload clear photos of your documents. This helps us verify your identity faster.</p>
                        
                        <div class="upload-section">
                            <div class="upload-group">
                                <div class="upload-area" data-for="documentFront">
                                    <div class="upload-icon">
                                        <i class="fas fa-camera"></i>
                                    </div>
                                    <h4>Front Side</h4>
                                    <p>Upload the front side of your document</p>
                                    <input type="file" id="documentFront" accept="image/*" hidden>
                                    <button type="button" class="upload-btn">Choose File</button>
                                </div>
                            </div>
                            
                            <div class="upload-group">
                                <div class="upload-area" data-for="documentBack">
                                    <div class="upload-icon">
                                        <i class="fas fa-camera"></i>
                                    </div>
                                    <h4>Back Side</h4>
                                    <p>Upload the back side of your document</p>
                                    <input type="file" id="documentBack" accept="image/*" hidden>
                                    <button type="button" class="upload-btn">Choose File</button>
                                </div>
                            </div>
                            
                            <div class="upload-group">
                                <div class="upload-area" data-for="selfieWithDocument">
                                    <div class="upload-icon">
                                        <i class="fas fa-user-circle"></i>
                                    </div>
                                    <h4>Selfie with Document</h4>
                                    <p>Take a photo with your document</p>
                                    <input type="file" id="selfieWithDocument" accept="image/*" hidden>
                                    <button type="button" class="upload-btn">Choose File</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="verification-actions">
                        <button type="button" class="btn-secondary" onclick="closeVerificationModal()">
                            <i class="fas fa-times"></i>
                            Cancel
                        </button>
                        <button type="button" class="btn-prev" onclick="prevVerificationStep()" style="display: none;">
                            <i class="fas fa-arrow-left"></i>
                            Previous
                        </button>
                        <button type="button" class="btn-next" onclick="nextVerificationStep()">
                            Next
                            <i class="fas fa-arrow-right"></i>
                        </button>
                        <button type="submit" class="btn-primary btn-submit" style="display: none;">
                            <i class="fas fa-paper-plane"></i>
                            Submit Application
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', formHTML);
    
    // Add form submit handler
    document.getElementById('verificationForm').addEventListener('submit', submitVerification);
    
    // Add upload button handlers
    setupUploadHandlers();
    
    // Initialize step navigation
    currentVerificationStep = 1;
    updateVerificationProgress();
}

// Global variable for current step
let currentVerificationStep = 1;

function nextVerificationStep() {
    if (currentVerificationStep < 3) {
        // Validate current step
        if (validateCurrentStep()) {
            currentVerificationStep++;
            updateVerificationProgress();
        }
    }
}

function prevVerificationStep() {
    if (currentVerificationStep > 1) {
        currentVerificationStep--;
        updateVerificationProgress();
    }
}

function validateCurrentStep() {
    const currentSection = document.querySelector(`[data-section="${currentVerificationStep}"]`);
    const inputs = currentSection.querySelectorAll('input[required], textarea[required]');
    
    let isValid = true;
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.style.borderColor = '#f44336';
            isValid = false;
        } else {
            input.style.borderColor = '#3a3a3a';
        }
    });
    
    if (!isValid) {
        showNotification('Please fill in all required fields', 'error');
    }
    
    return isValid;
}

function updateVerificationProgress() {
    // Update progress steps
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        const stepNumber = index + 1;
        if (stepNumber <= currentVerificationStep) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
    
    // Update form sections
    document.querySelectorAll('.form-section').forEach((section, index) => {
        const sectionNumber = index + 1;
        if (sectionNumber === currentVerificationStep) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });
    
    // Update buttons
    const prevBtn = document.querySelector('.btn-prev');
    const nextBtn = document.querySelector('.btn-next');
    const submitBtn = document.querySelector('.btn-submit');
    
    if (prevBtn) prevBtn.style.display = currentVerificationStep > 1 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = currentVerificationStep < 3 ? 'flex' : 'none';
    if (submitBtn) submitBtn.style.display = currentVerificationStep === 3 ? 'flex' : 'none';
}

function setupUploadHandlers() {
    document.querySelectorAll('.upload-area').forEach(area => {
        const inputId = area.getAttribute('data-for');
        const input = document.getElementById(inputId);
        const uploadBtn = area.querySelector('.upload-btn');
        
        if (uploadBtn && input) {
            uploadBtn.addEventListener('click', () => {
                input.click();
            });
            
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    updateUploadArea(area, file);
                }
            });
        }
    });
}

function updateUploadArea(area, file) {
    const uploadIcon = area.querySelector('.upload-icon');
    const uploadBtn = area.querySelector('.upload-btn');
    
    // Update icon to show success
    uploadIcon.innerHTML = '<i class="fas fa-check"></i>';
    uploadIcon.style.background = 'linear-gradient(135deg, #4CAF50, #388E3C)';
    
    // Update button text
    uploadBtn.textContent = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
    uploadBtn.style.background = 'linear-gradient(135deg, #4CAF50, #388E3C)';
    
    // Add file size info
    const fileSize = (file.size / 1024 / 1024).toFixed(2);
    area.querySelector('p').textContent = `File uploaded: ${fileSize} MB`;
}

function closeVerificationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) {
        modal.remove();
    }
}

async function submitVerification(event) {
    event.preventDefault();
    
    try {
        const formData = {
            full_name: document.getElementById('fullName').value,
            date_of_birth: document.getElementById('dateOfBirth').value,
            passport_number: document.getElementById('passportNumber').value,
            passport_issue_date: document.getElementById('passportIssueDate').value,
            passport_issuer: document.getElementById('passportIssuer').value,
            address: document.getElementById('address').value,
            phone_number: document.getElementById('phoneNumber').value
        };
        
        const response = await apiRequest('/api/verification/submit', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        closeVerificationModal();
        showNotification('Verification application submitted successfully!', 'success');
        // Принудительно обновляем статус верификации
        loadVerificationStatus(true);
        
    } catch (error) {
        console.error('Failed to submit verification:', error);
        showNotification('Failed to submit verification application', 'error');
    }
}

// Chat tab click handler
function handleChatTabClick(event) {
    const chatType = event.target.closest('.chat-tab').dataset.chat;
    switchChatType(chatType);
}

// Message keypress handler
function handleMessageKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// Global flag to prevent duplicate message sending
let isSendingMessage = false;

// Send chat message
async function sendChatMessage() {
    if (isSendingMessage) {
        console.log('Message already being sent, ignoring duplicate request');
        return;
    }
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    isSendingMessage = true;
    
    try {
        await apiRequest('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                message: message,
                chat_type: currentChatType
            })
        });
        
        messageInput.value = '';
        // В активной вкладке: сразу помечаем как прочитанное
        apiRequest(`/api/chat/mark-read?chat_type=${currentChatType}`, { method: 'POST' }).catch(() => {});
        loadChatMessages(currentChatType);

    } catch (error) {
        console.error('Error sending message:', error);
        
        // Show user-friendly error message
        if (error.message && error.message.includes('base level')) {
            alert('❌ ' + error.message);
        } else {
            alert('❌ Error sending message: ' + error.message);
        }
    } finally {
        isSendingMessage = false;
    }
}



// Display chat messages
function displayChatMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    // Limit to last 150 messages (server already limits), reverse to show oldest first
    const limitedMessages = messages.slice(-150).reverse();
    
    chatMessages.innerHTML = '';
    
    limitedMessages.forEach(message => {
        const messageDiv = document.createElement('div');
        
        // Determine if this is the current user's message
        const isCurrentUserMessage = currentUser && message.sender_id === currentUser.id;
        const isAdminMessage = message.is_admin;
        
        // Debug logging
        console.log('Message debug:', {
            messageSenderId: message.sender_id,
            currentUserId: currentUser?.id,
            isCurrentUserMessage,
            isAdminMessage,
            senderName: message.sender_name
        });
        
        // Set message class based on sender
        if (isCurrentUserMessage) {
            messageDiv.className = 'chat-message current-user-message';
        } else if (isAdminMessage) {
            messageDiv.className = 'chat-message admin-message';
        } else {
            messageDiv.className = 'chat-message other-user-message';
        }
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const sender = isAdminMessage ? 'Support' : (message.sender_name || 'Unknown');
        
        // Generate initials for avatar
        const initials = generateInitials(sender);
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <div class="avatar-circle">
                    <span class="avatar-text">${initials}</span>
                </div>
            </div>
            <div class="message-content-wrapper">
                <div class="message-header">
                    <span class="sender">${sender}</span>
                    <span class="timestamp">${timestamp}</span>
                </div>
                <div class="message-content">${escapeHtml(message.message)}</div>
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
    });
}

// Generate initials from name
function generateInitials(name) {
    if (!name || name === 'You') {
        return 'YO';
    }
    
    // Split name into parts and take first letter of each
    const nameParts = name.trim().split(' ');
    if (nameParts.length >= 2) {
        return (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase();
    } else if (nameParts.length === 1) {
        return nameParts[0].substring(0, 2).toUpperCase();
    }
    
    return 'UN';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Loading state functions
function showLoadingState() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-overlay';
    loadingDiv.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>Just loading...</p>
        </div>
    `;
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;
    
    const loadingContent = loadingDiv.querySelector('.loading-content');
    loadingContent.style.cssText = `
        text-align: center;
        color: white;
    `;
    
    const spinner = loadingDiv.querySelector('.loading-spinner');
    spinner.style.cssText = `
        width: 50px;
        height: 50px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #00d4aa;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(loadingDiv);
}

function hideLoadingState() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
    
    // Force hide tour overlay after loading is complete
    forceHideTourOverlay();
}

// Preload and cache site elements for better performance
async function preloadAndCacheElements() {
    try {
        console.log('🔄 Preloading and caching site elements...');
        
        // Preload chat background images
        const chatBackgrounds = [
            'static/images/chat-bg.jpg',
            'static/images/chat-bg-support.jpg',
            'static/images/chat-bg-general.jpg'
        ];
        
        const imagePromises = chatBackgrounds.map(src => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    console.log(`✅ Preloaded image: ${src}`);
                    resolve(img);
                };
                img.onerror = () => {
                    console.log(`⚠️ Failed to preload image: ${src}`);
                    resolve(null);
                };
                img.src = src;
            });
        });
        
        // Preload and cache chat messages
        const chatPromises = ['general', 'support'].map(async (chatType) => {
            try {
                const response = await apiRequest(`/api/chat/messages?type=${chatType}&limit=50`);
                console.log(`✅ Preloaded ${chatType} chat messages: ${response.messages?.length || 0} messages`);
                return response;
            } catch (error) {
                console.log(`⚠️ Failed to preload ${chatType} chat messages:`, error);
                return null;
            }
        });
        
        // Preload task data
        const taskPromise = apiRequest('/tasks?filter=available').catch(error => {
            console.log('⚠️ Failed to preload task data:', error);
            return null;
        });
        
        // Preload news data
        const newsPromise = apiRequest('/news').catch(error => {
            console.log('⚠️ Failed to preload news data:', error);
            return null;
        });
        
        // Preload awards data
        const awardsPromise = apiRequest('/awards').catch(error => {
            console.log('⚠️ Failed to preload awards data:', error);
            return null;
        });
        
        // Wait for all preloading to complete
        const results = await Promise.all([
            ...imagePromises,
            ...chatPromises,
            taskPromise,
            newsPromise,
            awardsPromise
        ]);
        
        // Cache preloaded data in localStorage
        const cacheData = {
            timestamp: Date.now(),
            chatMessages: results.slice(imagePromises.length, imagePromises.length + chatPromises.length),
            tasks: results[imagePromises.length + chatPromises.length],
            news: results[imagePromises.length + chatPromises.length + 1],
            awards: results[imagePromises.length + chatPromises.length + 2]
        };
        
        try {
            localStorage.setItem('siteCache', JSON.stringify(cacheData));
            console.log('✅ Site data cached in localStorage');
        } catch (error) {
            console.log('⚠️ Failed to cache data in localStorage:', error);
        }
        
        console.log('✅ All site elements preloaded and cached successfully!');
        
    } catch (error) {
        console.error('❌ Error during preloading:', error);
    }
}

// Get cached data from localStorage
function getCachedData() {
    try {
        const cached = localStorage.getItem('siteCache');
        if (cached) {
            const data = JSON.parse(cached);
            const now = Date.now();
            const cacheAge = now - data.timestamp;
            const maxAge = 5 * 60 * 1000; // 5 minutes
            
            if (cacheAge < maxAge) {
                console.log('✅ Using cached data (age:', Math.round(cacheAge / 1000), 'seconds)');
                return data;
            } else {
                console.log('⚠️ Cached data expired, removing...');
                localStorage.removeItem('siteCache');
            }
        }
    } catch (error) {
        console.log('⚠️ Error reading cached data:', error);
        localStorage.removeItem('siteCache');
    }
    return null;
}

// Also check tour readiness when page is fully loaded (as fallback)
document.addEventListener('DOMContentLoaded', () => {
    // Initialize chat functionality
    initializeChat();
    
    // Load general chat messages by default
    if (currentUser) {
        loadChatMessages('general');
    }
    
    // Initialize withdrawal modal functionality
    initializeWithdrawalModal();
    
    // Initialize iOS installation modal functionality
    initializeIosInstallationModal();
    
    // Force hide tour overlay on page load
    forceHideTourOverlay();
    
    // Tour check is now handled exclusively by showApp() after database verification
    console.log('DOMContentLoaded - chat initialized, tour check handled by showApp()');
});

// Withdrawal Modal Functions
function initializeWithdrawalModal() {
    const withdrawalModal = document.getElementById('withdrawalModal');
    const closeWithdrawalModal = document.getElementById('closeWithdrawalModal');
    const cancelWithdrawal = document.getElementById('cancelWithdrawal');
    const withdrawalForm = document.getElementById('withdrawalForm');
    
    // Close modal events
    if (closeWithdrawalModal) {
        closeWithdrawalModal.addEventListener('click', hideWithdrawalModal);
    }
    
    if (cancelWithdrawal) {
        cancelWithdrawal.addEventListener('click', hideWithdrawalModal);
    }
    
    // Close modal when clicking outside
    if (withdrawalModal) {
        withdrawalModal.addEventListener('click', (e) => {
            if (e.target === withdrawalModal) {
                hideWithdrawalModal();
            }
        });
    }
    
    // Handle form submission
    if (withdrawalForm) {
        withdrawalForm.addEventListener('submit', handleWithdrawalSubmit);
    }
}

async function showWithdrawalModal() {
    const withdrawalModal = document.getElementById('withdrawalModal');
    if (withdrawalModal) {
        withdrawalModal.style.display = 'flex';
        // Reset form
        const form = document.getElementById('withdrawalForm');
        if (form) {
            form.reset();
        }
        
        // Load minimum withdrawal amount for current user
        try {
            // First try to get user's specific minimum withdrawal amount
            const userProfile = await apiRequest('/profile');
            let minAmount = 50.0; // Default value
            
            // Get global minimum first
            const globalResponse = await apiRequest('/api/settings/global_min_withdrawal_amount');
            let globalMinAmount = 50.0; // Default value
            
            if (globalResponse && globalResponse.global_min_withdrawal_amount) {
                globalMinAmount = parseFloat(globalResponse.global_min_withdrawal_amount);
                console.log(`Global minimum withdrawal amount: $${globalMinAmount}`);
            }
            
            // Check if user has specific minimum
            if (userProfile && userProfile.min_withdrawal_amount && userProfile.min_withdrawal_amount > 0) {
                // Use user's specific minimum (individual setting has priority)
                const userMinAmount = parseFloat(userProfile.min_withdrawal_amount);
                minAmount = userMinAmount;
                console.log(`Using user-specific minimum withdrawal amount: $${minAmount}`);
            } else {
                // Use global minimum
                minAmount = globalMinAmount;
                console.log(`Using global minimum withdrawal amount: $${minAmount}`);
            }
            
            const minAmountElement = document.getElementById('minWithdrawalAmount');
            if (minAmountElement) {
                minAmountElement.textContent = `$${minAmount.toFixed(2)}`;
            }
        } catch (error) {
            console.error('Error loading minimum withdrawal amount:', error);
            // Set default value if API fails
            const minAmountElement = document.getElementById('minWithdrawalAmount');
            if (minAmountElement) {
                minAmountElement.textContent = '$50.00';
            }
        }
    }
}

function hideWithdrawalModal() {
    const withdrawalModal = document.getElementById('withdrawalModal');
    if (withdrawalModal) {
        withdrawalModal.style.display = 'none';
    }
}

async function handleWithdrawalSubmit(event) {
    event.preventDefault();
    
    console.log('DEBUG: Withdrawal form submitted');
    
    const formData = new FormData(event.target);
    const networkCoin = formData.get('networkCoin');
    const amount = parseFloat(formData.get('amount'));
    const walletAddress = formData.get('walletAddress');
    
    console.log('DEBUG: Form data:', { networkCoin, amount, walletAddress });
    
    // Basic validation
    if (!networkCoin || !amount || !walletAddress) {
        console.log('DEBUG: Validation failed - missing fields');
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (amount <= 0) {
        console.log('DEBUG: Validation failed - amount <= 0');
        showNotification('Amount must be greater than 0', 'error');
        return;
    }
    
    // Disable submit button
    const submitBtn = event.target.querySelector('.submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }
    
    try {
        console.log('DEBUG: Sending withdrawal request to API...');
        const requestData = {
            network_coin: networkCoin,
            amount: amount,
            wallet_address: walletAddress
        };
        console.log('DEBUG: Request data:', requestData);
        
        const response = await apiRequest('/api/withdrawal/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        console.log('DEBUG: API response:', response);
        
        if (response.success) {
            console.log('DEBUG: Withdrawal request successful');
            showNotification('Withdrawal request sent successfully!', 'success');
            hideWithdrawalModal();
        } else {
            console.log('DEBUG: Withdrawal request failed:', response.message);
            showNotification(response.message || 'Failed to send withdrawal request', 'error');
        }
    } catch (error) {
        console.error('DEBUG: Error submitting withdrawal request:', error);
        showNotification('Failed to send withdrawal request. Please try again.', 'error');
    } finally {
        // Re-enable submit button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Withdrawal Request';
        }
    }
}

// App Installation Modal Functions
function initializeIosInstallationModal() {
    const showIosInstallationBtn = document.getElementById('showIosInstallation');
    const iosInstallationModal = document.getElementById('iosInstallationModal');
    const closeIosInstallationModal = document.getElementById('closeIosInstallationModal');
    const gotItBtn = document.getElementById('gotItBtn');
    
    if (showIosInstallationBtn) {
        showIosInstallationBtn.addEventListener('click', showIosInstallationModal);
        console.log('App installation button event listener added');
    } else {
        console.error('showIosInstallation button not found');
    }
    
    if (closeIosInstallationModal) {
        closeIosInstallationModal.addEventListener('click', hideIosInstallationModal);
        console.log('Close app installation modal button event listener added');
    } else {
        console.error('closeIosInstallationModal button not found');
    }
    
    if (gotItBtn) {
        gotItBtn.addEventListener('click', hideIosInstallationModal);
        console.log('Got it button event listener added');
    } else {
        console.error('gotItBtn button not found');
    }
    
    // Close modal when clicking outside
    if (iosInstallationModal) {
        iosInstallationModal.addEventListener('click', (e) => {
            if (e.target === iosInstallationModal) {
                hideIosInstallationModal();
            }
        });
        console.log('App installation modal outside click event listener added');
    } else {
        console.error('iosInstallationModal not found');
    }
}

// Detect browser and platform
function detectBrowserAndPlatform() {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    console.log('User Agent:', userAgent);
    console.log('Platform:', platform);
    
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    
    // Detect Safari
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    
    // Detect Chrome
    const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
    
    // Detect Android
    const isAndroid = /Android/.test(userAgent);
    
    // Detect Edge
    const isEdge = /Edge/.test(userAgent);
    
    // Detect Firefox
    const isFirefox = /Firefox/.test(userAgent);
    
    const result = {
        isIOS,
        isSafari,
        isChrome,
        isAndroid,
        isEdge,
        isFirefox,
        platform,
        userAgent
    };
    
    console.log('Browser detection result:', result);
    return result;
}

function showIosInstallationModal() {
    const iosInstallationModal = document.getElementById('iosInstallationModal');
    if (iosInstallationModal) {
        // Detect browser and platform
        const browserInfo = detectBrowserAndPlatform();
        
        // Update modal content based on platform and browser
        updateInstallationModalContent(browserInfo);
        
        iosInstallationModal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        console.log('App installation modal shown for:', browserInfo);
    } else {
        console.error('iosInstallationModal not found when trying to show');
    }
}

function updateInstallationModalContent(browserInfo) {
    const modalTitle = document.querySelector('#iosInstallationModal h2');
    const modalSubtitle = document.querySelector('#iosInstallationModal .ios-installation-subtitle h3');
    const modalSubtitleText = document.querySelector('#iosInstallationModal .ios-installation-subtitle p');
    const modalSteps = document.querySelector('#iosInstallationModal .ios-installation-steps');
    const modalTip = document.querySelector('#iosInstallationModal .ios-installation-tip .tip-content p');
    
    if (browserInfo.isIOS && browserInfo.isSafari) {
        // iOS Safari - show iOS installation instructions
        if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-mobile-alt"></i> iOS Installation';
        if (modalSubtitle) modalSubtitle.textContent = 'iOS Installation';
        if (modalSubtitleText) modalSubtitleText.textContent = 'Follow these instructions to install via Safari';
        
        if (modalSteps) {
            modalSteps.innerHTML = `
                <div class="installation-step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Open Safari menu</h4>
                        <p>Tap the <i class="fas fa-share"></i> "Share" button at the bottom</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Find "Add to Home Screen"</h4>
                        <p>Scroll down and find <i class="fas fa-plus"></i> "Add to Home Screen"</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Confirm installation</h4>
                        <p>Tap "Add" in the top right corner</p>
                    </div>
                </div>
            `;
        }
        
        if (modalTip) {
            modalTip.textContent = 'After installation, the HR Portal icon will appear on your iPhone/iPad home screen';
        }
        
    } else if (browserInfo.isAndroid && browserInfo.isChrome) {
        // Android Chrome - show Android installation instructions
        if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-mobile-alt"></i> Android Installation';
        if (modalSubtitle) modalSubtitle.textContent = 'Android Installation';
        if (modalSubtitleText) modalSubtitleText.textContent = 'Follow these instructions to install via Chrome';
        
        if (modalSteps) {
            modalSteps.innerHTML = `
                <div class="installation-step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Open Chrome menu</h4>
                        <p>Tap the <i class="fas fa-ellipsis-v"></i> three dots menu in the top right</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Find "Add to Home screen"</h4>
                        <p>Tap "Add to Home screen" from the menu</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Confirm installation</h4>
                        <p>Tap "Add" to confirm the installation</p>
                    </div>
                </div>
            `;
        }
        
        if (modalTip) {
            modalTip.textContent = 'After installation, the HR Portal icon will appear on your Android home screen';
        }
        
    } else if (browserInfo.isIOS && !browserInfo.isSafari) {
        // iOS but not Safari - show Safari requirement message
        if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Safari Required';
        if (modalSubtitle) modalSubtitle.textContent = 'Safari Required for iOS';
        if (modalSubtitleText) modalSubtitleText.textContent = 'Please use Safari browser to install the app';
        
        if (modalSteps) {
            modalSteps.innerHTML = `
                <div class="installation-step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Open Safari</h4>
                        <p>Switch to Safari browser on your iOS device</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Navigate to this page</h4>
                        <p>Go to the same URL in Safari</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Try installation again</h4>
                        <p>Click "Install App" button again in Safari</p>
                    </div>
                </div>
            `;
        }
        
        if (modalTip) {
            modalTip.textContent = 'iOS only allows app installation through Safari browser for security reasons';
        }
        
    } else {
        // Desktop or other browsers - show general instructions
        if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-desktop"></i> App Installation';
        if (modalSubtitle) modalSubtitle.textContent = 'Mobile Installation';
        if (modalSubtitleText) modalSubtitleText.textContent = 'Please use your mobile device to install the app';
        
        if (modalSteps) {
            modalSteps.innerHTML = `
                <div class="installation-step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Open on mobile device</h4>
                        <p>Use your iPhone/iPad or Android device</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Use appropriate browser</h4>
                        <p>Use Safari on iOS or Chrome on Android</p>
                    </div>
                </div>
                
                <div class="installation-step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Follow installation steps</h4>
                        <p>Use the "Install App" button on your mobile device</p>
                    </div>
                </div>
            `;
        }
        
        if (modalTip) {
            modalTip.textContent = 'App installation is only available on mobile devices with supported browsers';
        }
    }
}

function hideIosInstallationModal() {
    const iosInstallationModal = document.getElementById('iosInstallationModal');
    if (iosInstallationModal) {
        iosInstallationModal.classList.remove('show');
        document.body.style.overflow = ''; // Restore scrolling
        console.log('App installation modal hidden');
    } else {
        console.error('iosInstallationModal not found when trying to hide');
    }
}

// Quick menu: Active withdrawals modal
function showWithdrawalsQuickMenu() {
    let modal = document.getElementById('withdrawalsQuickModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'withdrawalsQuickModal';
        modal.className = 'withdrawal-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="withdrawal-modal-content" style="-webkit-overflow-scrolling: touch;">
                <div class="withdrawal-modal-header">
                    <h2><i class="fas fa-money-check-alt"></i> Withdrawals</h2>
                    <button class="close-modal-btn" onclick="hideWithdrawalsQuickMenu()">✕</button>
                </div>
                <div class="withdrawal-form" id="withdrawalsQuickList">
                    <div style="text-align:center; opacity:.8; padding:12px;">Loading...</div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) hideWithdrawalsQuickMenu(); });
    }
    // Ensure above bottom nav
    modal.style.zIndex = '10005';
    const content = modal.querySelector('.withdrawal-modal-content');
    if (content) {
        content.style.zIndex = '10006';
        content.style['-webkit-overflow-scrolling'] = 'touch';
    }
    // Lock body scroll on iOS
    document.body.style.overflow = 'hidden';
    modal.style.display = 'flex';
    loadActiveWithdrawalsForQuickMenu();
}

function hideWithdrawalsQuickMenu() {
    const modal = document.getElementById('withdrawalsQuickModal');
    if (modal) modal.style.display = 'none';
    // Restore body scroll
    document.body.style.overflow = '';
}

async function loadActiveWithdrawalsForQuickMenu() {
    try {
        // Load user's own withdrawals - show all including completed
        const response = await apiRequest('/api/user/withdrawal-requests');
        const list = document.getElementById('withdrawalsQuickList');
        if (!list) return;
        const all = (response && response.withdrawal_requests) ? response.withdrawal_requests : [];
        
        if (all.length === 0) {
            list.innerHTML = '<div style="text-align:center; opacity:.75;">No withdrawals found</div>';
            return;
        }
        
        list.innerHTML = all.map(w => {
            const status = (w.status || '').toLowerCase();
            const statusText = status === 'completed' ? 'Paid' : 'Pending';
            const statusClass = status === 'completed' ? 'completed' : 'pending';
            
            return `
                <div style=\"display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(255,255,255,.08)\">
                    <div>
                        <div style=\"font-weight:600;\">$${(w.amount || 0).toFixed(2)} · ${w.network_coin || ''}</div>
                        <div style=\"opacity:.75; font-size:12px;\">${w.created_at ? new Date(w.created_at).toLocaleString() : ''}</div>
                    </div>
                    <span class=\"withdrawal-status ${statusClass}\">${statusText}</span>
                </div>`;
        }).join('');
    } catch (e) {
        const list = document.getElementById('withdrawalsQuickList');
        if (list) list.innerHTML = '<div style="color:#ff6b6b;">Failed to load withdrawals</div>';
    }
}

// Disable zoom on mobile devices
document.addEventListener('DOMContentLoaded', function() {
    // Prevent zoom on double tap
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);

    // Prevent zoom on pinch
    document.addEventListener('gesturestart', function (event) {
        event.preventDefault();
    });

    document.addEventListener('gesturechange', function (event) {
        event.preventDefault();
    });

    document.addEventListener('gestureend', function (event) {
        event.preventDefault();
    });

    // Prevent zoom on wheel
    document.addEventListener('wheel', function (event) {
        if (event.ctrlKey) {
            event.preventDefault();
        }
    }, { passive: false });

    // Prevent zoom on keyboard shortcuts
    document.addEventListener('keydown', function (event) {
        if (event.ctrlKey && (event.key === '+' || event.key === '-' || event.key === '0')) {
            event.preventDefault();
        }
    });
});

