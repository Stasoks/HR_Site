// Global variables
let currentUser = null;
let currentToken = null;
let currentChatType = 'general';

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
}

function showApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    loadUserData();
    loadNews();
    loadTasks();
    loadAwards();
    
    // Start tour after everything is loaded and visible
    setTimeout(() => {
        startTourWhenReady();
    }, 2000);
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
        
        showApp();
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
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

async function loadNews() {
    try {
        const response = await apiRequest('/news');
        updateNewsUI(response.news);
    } catch (error) {
        console.error('Failed to load news:', error);
    }
}

async function loadTasks(filterType = 'available') {
    try {
        const [response, stats] = await Promise.all([
            apiRequest(`/tasks?filter_type=${filterType}`),
            apiRequest('/tasks/stats')
        ]);
        updateTasksUI(response.tasks, filterType);
        updateTaskStats(stats);
    } catch (error) {
        console.error('Failed to load tasks:', error);
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
        const response = await apiRequest('/awards');
        updateAwardsUI(response);
    } catch (error) {
        console.error('Failed to load awards:', error);
    }
}

async function loadChatMessages(chatType) {
    try {
        const response = await apiRequest(`/chat/${chatType}`);
        updateChatUI(response.messages);
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
        adminButton.textContent = '🔧 Админ панель';
        adminButton.onclick = () => window.open('/admin', '_blank');
        profileActions.appendChild(adminButton);
    }
}

function updateBalanceUI(balance) {
    document.getElementById('balanceAmount').textContent = `$${balance.toFixed(2)}`;
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
    const newsList = document.getElementById('newsList');
    newsList.innerHTML = '';

    if (news.length === 0) {
        newsList.innerHTML = '<div class="news-item"><p>No news available</p></div>';
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
                <div class="news-item-link">
                    <i class="fas fa-external-link-alt"></i>
                </div>
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
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';

    if (tasks.length === 0) {
        tasksList.innerHTML = '<div class="task-card"><p>No tasks available</p></div>';
        return;
    }

    tasks.forEach(task => {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card';
        
        const date = new Date(task.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        // Dynamic task content based on real data
        const taskContent = `
            <div class="task-header">
                <div class="task-title">${task.title}</div>
                <div class="task-status">${filterType === 'available' ? 'Available' : filterType === 'my_tasks' ? 'In Progress' : filterType === 'revision' ? 'Revision' : 'Completed'}</div>
            </div>
            <div class="task-description">${task.description}</div>
            <div class="task-requirements">
                <div class="task-requirement">
                    <i class="fas fa-clipboard-check"></i>
                    <span><strong>Необходимые доказательства:</strong> ${task.required_proof}</span>
                </div>
            </div>
            <div class="task-notes">
                <div class="task-note">
                    <i class="fas fa-money-bill-wave"></i>
                    <span>Награда: $${task.reward.toFixed(2)}</span>
                </div>
                <div class="task-note">
                    <i class="fas fa-layer-group"></i>
                    <span>Уровень доступа: ${task.level_required}</span>
                </div>
                ${task.expires_at ? `
                <div class="task-note">
                    <i class="fas fa-clock"></i>
                    <span>Срок выполнения: ${new Date(task.expires_at).toLocaleDateString()}</span>
                </div>
                ` : ''}
                ${task.admin_comment && filterType === 'my_tasks' && task.user_task_status === 'revision' ? `
                <div class="task-note admin-comment">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span><strong>Комментарий к доработке:</strong> ${task.admin_comment}</span>
                </div>
                ` : ''}
            </div>
            <div class="task-footer">
                <div class="task-reward">$${task.reward.toFixed(2)}</div>
                <div class="task-date">${date}</div>
            </div>
            <div class="task-actions">
                <button class="btn-secondary">
                    <i class="fas fa-eye"></i>
                    View Details
                </button>
                ${filterType === 'available' ? 
                    `<button class="btn-primary take-task-btn" data-task-id="${task.id}">
                        <i class="fas fa-plus"></i>
                        Take Task
                    </button>` :
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
        tasksList.appendChild(taskCard);
    });

    // Add event listeners for take task buttons
    document.querySelectorAll('.take-task-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = e.target.closest('.take-task-btn').dataset.taskId;
            try {
                await apiRequest(`/tasks/${taskId}/take`, { method: 'POST' });
                // Убираем alert и просто перезагружаем задачи
                loadTasks(filterType);
                loadTaskStats(); // Обновляем статистику
            } catch (error) {
                alert('Failed to take task: ' + error.message);
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
}

function updateAwardsUI(awardsData) {
    // Top Earners
    const topEarnersList = document.getElementById('topEarnersList');
    topEarnersList.innerHTML = '';
    
    if (awardsData.top_earners && awardsData.top_earners.length > 0) {
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
                    <div class="award-details">Period: monthly • ${new Date().toLocaleDateString()}</div>
                </div>
                <div class="award-value">$${user.balance.toFixed(2)}</div>
            `;
            topEarnersList.appendChild(awardItem);
        });
    }

    // Most Productive
    const mostProductiveList = document.getElementById('mostProductiveList');
    mostProductiveList.innerHTML = '';
    
    if (awardsData.most_productive && awardsData.most_productive.length > 0) {
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
                    <div class="award-details">Period: monthly • ${new Date().toLocaleDateString()}</div>
                </div>
                <div class="award-value">847 tasks</div>
            `;
            mostProductiveList.appendChild(awardItem);
        });
    }

    // Quality Leaders
    const qualityLeadersList = document.getElementById('qualityLeadersList');
    qualityLeadersList.innerHTML = '';
    
    if (awardsData.quality_leaders && awardsData.quality_leaders.length > 0) {
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
                    <div class="award-details">Period: monthly • ${new Date().toLocaleDateString()}</div>
                </div>
                <div class="award-value">95%</div>
            `;
            qualityLeadersList.appendChild(awardItem);
        });
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
                    <h3>Отправить задание на проверку</h3>
                    <span class="close" onclick="closeSubmitTaskModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="taskProof">Описание выполненной работы:</label>
                        <textarea id="taskProof" rows="4" placeholder="Опишите выполненную работу, что было сделано, какие результаты достигнуты..."></textarea>
                    </div>
                    <div class="form-group">
                        <label for="taskFiles">Прикрепить файлы:</label>
                        <input type="file" id="taskFiles" multiple accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar" style="display: none;">
                        <div class="file-upload-area" onclick="document.getElementById('taskFiles').click()">
                            <i class="fas fa-cloud-upload-alt"></i>
                            <p>Нажмите для выбора файлов или перетащите их сюда</p>
                            <small>Поддерживаются: изображения, PDF, документы, архивы</small>
                        </div>
                        <div id="selectedFiles" class="selected-files"></div>
                    </div>
                    <div class="form-group">
                        <label for="taskLinks">Дополнительные ссылки (необязательно):</label>
                        <input type="text" id="taskLinks" placeholder="Ссылки на Google Drive, Dropbox, YouTube и т.д.">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeSubmitTaskModal()">Отмена</button>
                    <button class="btn-primary" onclick="submitTaskProof(${taskId})">Отправить на проверку</button>
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
        modal.style.display = 'none';
    }
}

// Функция для отправки доказательств
async function submitTaskProof(taskId) {
    const proof = document.getElementById('taskProof').value;
    const files = document.getElementById('taskFiles').files; // Get FileList
    const links = document.getElementById('taskLinks').value;
    
    if (!proof.trim() && files.length === 0 && !links.trim()) {
        alert('Пожалуйста, заполните поле с описанием, прикрепите файлы или добавьте ссылки.');
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
        showNotification('Задание успешно отправлено на проверку!', 'success');
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

    // Sample messages based on screenshot
    const sampleMessages = [
        { author: 'Storm Morris', message: 'is sports hot for anyone?', time: '17:05' },
        { author: 'Iris Barnes', message: 'gambling is a hell of a drug', time: '17:05' },
        { author: 'Atlas Cooper', message: 'dice treating me ok today', time: '17:06' },
        { author: 'Jack Robertson', message: 'early bird bonus hunting', time: '13:10' },
        { author: 'Cedar Rogers', message: 'GL everyone today', time: '13:11' }
    ];

    sampleMessages.forEach(msg => {
        const messageItem = document.createElement('div');
        messageItem.className = 'message-item';
        
        const initials = msg.author.split(' ').map(n => n[0]).join('').toUpperCase();
        
        messageItem.innerHTML = `
            <div class="message-avatar">${initials}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${msg.author}</span>
                    <span class="message-time">(${msg.time})</span>
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
        switchText.textContent = 'Уже есть аккаунт?';
        switchLink.textContent = 'Войдите';
    } else {
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
        switchText.textContent = 'Еще нет аккаунта?';
        switchLink.textContent = 'Создайте его';
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
        showNotification('Ошибка входа: ' + error.message, 'error');
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
        showNotification('Пароли не совпадают', 'error');
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
        showNotification('Ошибка регистрации: ' + error.message, 'error');
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

function handleDocumentAcceptance() {
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
}

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
        currentToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showApp();
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

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            
            // Update navigation
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Update sections
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(`${section}-section`).classList.add('active');
            
            // Load section-specific data
            switch(section) {
                case 'home':
                    loadNews();
                    break;
                case 'tasks':
                    loadTasks('available');
                    break;
                case 'chat':
                    loadChatMessages(currentChatType);
                    break;
                case 'awards':
                    loadAwards();
                    break;
                case 'profile':
                    loadUserData();
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
            loadTasks(filterType);
        });
    });

    // Chat tabs
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            currentChatType = tab.dataset.chat;
            loadChatMessages(currentChatType);
        });
    });

    // Send message
    document.getElementById('sendMessage').addEventListener('click', async () => {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message) return;
        
        try {
            await apiRequest('/chat/send', {
                method: 'POST',
                body: JSON.stringify({
                    message: message,
                    chat_type: currentChatType
                })
            });
            
            messageInput.value = '';
            loadChatMessages(currentChatType);
        } catch (error) {
            alert('Failed to send message: ' + error.message);
        }
    });

    // Enter key in chat input
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('sendMessage').click();
        }
    });

    // Withdraw button
    document.getElementById('withdrawBtn').addEventListener('click', () => {
        alert('Withdraw functionality will be implemented later');
    });

    // Profile actions
    document.getElementById('applyVerification').addEventListener('click', () => {
        alert('Verification application will be implemented later');
    });

    document.getElementById('bindPayment').addEventListener('click', () => {
        alert('Payment method binding will be implemented later');
    });

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
    currentChatType = chatType;
    
    // Update chat tabs
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.chat === chatType) {
            tab.classList.add('active');
        }
    });
    
    // Update chat content area
    const generalChat = document.getElementById('general-chat');
    const supportChat = document.getElementById('support-chat');
    
    if (chatType === 'support') {
        if (generalChat) generalChat.style.display = 'none';
        if (supportChat) supportChat.style.display = 'block';
    } else {
        if (generalChat) generalChat.style.display = 'block';
        if (supportChat) supportChat.style.display = 'none';
    }
    
    // Load messages for the chat type
    loadChatMessages(chatType);
}

// Logout function
function logout() {
    currentUser = null;
    currentToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Show logout notification
    showNotification('Вы успешно вышли из системы', 'success');
    
    // Redirect to login page
    setTimeout(() => {
        window.location.href = '/login';
    }, 1000);
}

// Auto-refresh data every 30 seconds
setInterval(() => {
    if (currentUser) {
        loadUserData();
        loadNews();
        loadTasks();
    }
}, 30000);

// Onboarding Tour System
class OnboardingTour {
    constructor() {
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
    }
    
    bindEvents() {
        this.elements.nextBtn.addEventListener('click', async () => await this.nextStep());
        this.elements.skipBtn.addEventListener('click', async () => await this.skipTour());
        this.elements.goToSupportBtn.addEventListener('click', () => this.goToSupport());
        
        // Close tour on overlay click
        this.elements.overlay.addEventListener('click', async () => await this.skipTour());
    }
    
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.currentStep = 0;
        this.elements.overlay.style.display = 'block';
        this.showStep();
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
        this.endTour();
        
        // Save tour completion status to database
        try {
            await apiRequest('/api/tour/complete', {
                method: 'POST'
            });
            console.log('Tour skip saved to database');
        } catch (error) {
            console.error('Failed to save tour skip:', error);
            // Fallback to localStorage
            localStorage.setItem('tourCompleted', 'true');
        }
    }
    
    async completeTour() {
        this.endTour();
        this.elements.completeModal.style.display = 'flex';
        
        // Save tour completion status to database
        try {
            await apiRequest('/api/tour/complete', {
                method: 'POST'
            });
            console.log('Tour completion saved to database');
        } catch (error) {
            console.error('Failed to save tour completion:', error);
            // Fallback to localStorage
            localStorage.setItem('tourCompleted', 'true');
        }
    }
    
    endTour() {
        this.isActive = false;
        this.elements.overlay.style.display = 'none';
        this.elements.highlight.style.display = 'none';
        this.elements.tooltip.style.display = 'none';
        this.elements.progress.style.display = 'none';
    }
    
    goToSupport() {
        this.elements.completeModal.style.display = 'none';
        
        // Switch to chat tab and then to support chat
        showTab('chat');
        setTimeout(() => {
            switchChatType('support');
            // Send welcome message from admin
            this.sendWelcomeMessage();
        }, 1000); // Increased delay to ensure chat is loaded
    }
    
    async sendWelcomeMessage() {
        try {
            // Get welcome message from backend
            const response = await apiRequest('/api/welcome-message');
            const welcomeText = response.message || "Hello, we are glad you are interested in our vacancy and contacted us. Let's get acquainted. We are an international gaming company - Stake. My name is Daniel and I am the official representative of the company, as well as your personal manager. Our task is to test gameplay, technical part of websites, game responsiveness, technical support interaction, search for bugs, errors, in general, everything that the customer asks to test. You are interested in the vacancy of a game tester, right?";
            
            // Add admin message to chat
            this.addAdminMessage(welcomeText);
            
            // Show notification
            showNotification('Welcome message from support received!', 'success');
            
        } catch (error) {
            console.error('Failed to get welcome message:', error);
            // Fallback message
            this.addAdminMessage("Hello, we are glad you are interested in our vacancy and contacted us. Let's get acquainted. We are an international gaming company - Stake. My name is Daniel and I am the official representative of the company, as well as your personal manager. Our task is to test gameplay, technical part of websites, game responsiveness, technical support interaction, search for bugs, errors, in general, everything that the customer asks to test. You are interested in the vacancy of a game tester, right?");
        }
    }
    
    addAdminMessage(text) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message admin-message';
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <strong>Daniel - Support Manager</strong>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-content">${text}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Initialize tour
const onboardingTour = new OnboardingTour();

// Check if we should start the tour
async function checkStartTour() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    console.log('Tour check conditions:', {
        documentsAccepted: user.documents_accepted,
        currentUser: !!currentUser,
        userOnMainSite: window.userOnMainSite
    });
    
    // Check tour status from database
    try {
        const response = await apiRequest('/api/tour/status');
        const tourStatus = response.tour_completed;
        
        console.log('Tour status from database:', tourStatus);
        
        // If tour is already completed, don't start it again
        if (tourStatus) {
            console.log('Tour already completed in database, skipping...');
            return;
        }
        
        // Only start tour if:
        // 1. Tour not completed in database
        // 2. Documents are accepted
        // 3. User is logged in
        // 4. On main site (no auth page)
        // 5. Main content is loaded
        if (!tourStatus && user.documents_accepted && currentUser && window.userOnMainSite) {
            const balanceCard = document.querySelector('.balance-card');
            
            // Make sure main content is visible
            if (balanceCard && balanceCard.offsetParent !== null) {
                console.log('All tour conditions met, starting tour...');
                setTimeout(() => {
                    onboardingTour.start();
                }, 1000);
            } else {
                console.log('Main content not loaded yet');
            }
        } else {
            console.log('Tour pre-conditions not met');
        }
    } catch (error) {
        console.error('Failed to check tour status:', error);
        // Fallback to localStorage check if API fails
        const tourCompleted = localStorage.getItem('tourCompleted');
        if (tourCompleted === 'true') {
            console.log('Tour completed in localStorage, skipping...');
            return;
        }
    }
}

// Start tour check after main content is loaded and user data is available
async function startTourWhenReady() {
    console.log('startTourWhenReady called');
    
    // Simple check - we're on main site, not login page
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (window.userOnMainSite && user.documents_accepted && currentUser) {
        console.log('Tour conditions met, waiting for content...');
        
        // Wait for main content to be visible
        const checkMainContent = () => {
            const balanceCard = document.querySelector('.balance-card');
            if (balanceCard && balanceCard.offsetParent !== null) {
                console.log('Main content ready, starting tour check...');
                checkStartTour();
            } else {
                console.log('Main content not ready yet, retrying...');
                setTimeout(checkMainContent, 500);
            }
        };
        
        setTimeout(checkMainContent, 1000);
    } else {
        console.log('Tour pre-conditions not met');
    }
}

// Initialize chat functionality
function initializeChat() {
    // Chat tab switching
    document.querySelectorAll('.chat-tab').forEach(tab => {
        // Remove existing listeners to prevent duplicates
        tab.removeEventListener('click', handleChatTabClick);
        tab.addEventListener('click', handleChatTabClick);
    });
    
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

// Send chat message
async function sendChatMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    try {
        await apiRequest('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                message: message,
                chat_type: currentChatType
            })
        });
        
        messageInput.value = '';
        loadChatMessages(currentChatType);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Load chat messages
async function loadChatMessages(chatType) {
    try {
        const response = await apiRequest(`/api/chat/messages?type=${chatType}`);
        displayChatMessages(response.messages || []);
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display chat messages
function displayChatMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '';
    
    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.is_admin ? 'admin-message' : 'user-message'}`;
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const sender = message.is_admin ? 'Support' : (message.sender_name || 'You');
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="sender">${sender}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content">${escapeHtml(message.message)}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
    });
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Also check tour readiness when page is fully loaded (as fallback)
document.addEventListener('DOMContentLoaded', () => {
    // Initialize chat functionality
    initializeChat();
    
    // Simple fallback check for tour
    setTimeout(() => {
        if (window.userOnMainSite && currentUser) {
            console.log('Fallback tour check triggered');
            startTourWhenReady();
        } else {
            console.log('Fallback tour check - not on main site or no user');
        }
    }, 3000); // Fallback after 3 seconds
});
