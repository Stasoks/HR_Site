// Admin Panel JavaScript

// Global variables
let currentUser = null;
let currentToken = null;
let selectedUserId = null;
let selectedUserName = null;
let adminChatPollingInterval = null; // For real-time admin chat updates
let adminUnreadCounts = {}; // Store unread message counts for admin
let lastMessageCount = 0; // Track message count for smooth updates
const API_BASE = ''; // Use relative paths for production

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel DOM loaded');
    
    // Check if user is logged in and is admin
    checkAuth();
    
    // Verify global functions are available
    console.log('Checking global functions availability:');
    console.log('window.deleteWithdrawal:', typeof window.deleteWithdrawal);
    console.log('window.completeWithdrawal:', typeof window.completeWithdrawal);
    console.log('window.apiRequest:', typeof window.apiRequest);
    console.log('window.showSuccess:', typeof window.showSuccess);
    console.log('window.showError:', typeof window.showError);
    
    // Load dashboard data with delay to ensure DOM is ready
    setTimeout(() => {
        console.log('Loading dashboard on page load');
        loadDashboard();
        
        // Force refresh data if dashboard tab is active
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab && activeTab.textContent.includes('Dashboard')) {
            console.log('Dashboard tab is active, refreshing data');
            setTimeout(() => {
                loadDashboard();
            }, 500);
        }
    }, 100);
});

// Authentication check
async function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token || !user.is_admin) {
        showError('Access denied. Administrator privileges required.');
        window.location.href = '/';
        return;
    }
    
    currentToken = token;
    currentUser = user;
}

// API request helper


// Tab switching
function showTab(tabName) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked tab
    event.target.classList.add('active');
    
    // Load data for the selected tab
    switch(tabName) {
        case 'dashboard':
            // Debug: switch to dashboard
            loadDashboard();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'tasks':
            loadTasks();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'users':
            loadUsers();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'news':
            loadNews();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'moderation':
            loadModeration();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'chat':
            loadChatConversations();
            // Start polling if a conversation is already selected
            if (selectedUserId) {
                startAdminChatPolling();
            }
            break;
        case 'withdrawals':
            console.log('Switching to withdrawals tab');
            loadWithdrawals();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'verification':
            loadVerificationRequests();
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
        case 'file-upload':
            // File upload tab doesn't need special loading
            stopAdminChatPolling(); // Stop chat polling when leaving chat
            break;
    }
}

// API request helper
window.apiRequest = async function(endpoint, options = {}) {
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
        // Debug: API request
        
        const response = await fetch(url, config);
        const data = await response.json();

        // Debug: API response

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid, redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return;
            }
            throw new Error(data.detail || `HTTP ${response.status}: ${response.statusText}`);
        }

        return data;
    } catch (error) {
        // Swallow detailed logs in production
        throw error;
    }
}

// Dashboard functions
async function loadDashboard() {
    // Debug: load dashboard called
    
    try {
        // Debug: loading dashboard stats
        const [users, tasks, moderation] = await Promise.all([
            apiRequest('/admin/users'),
            apiRequest('/admin/tasks'),
            apiRequest('/admin/moderation')
        ]);
        
        // Debug: dashboard stats loaded
        
        // Update statistics
        document.getElementById('total-users').textContent = users.length;
        document.getElementById('total-tasks').textContent = tasks.length;
        document.getElementById('pending-tasks').textContent = moderation.items ? moderation.items.length : 0;
        
        // Calculate total earnings (sum of all task rewards)
        const totalEarnings = tasks.reduce((sum, task) => sum + task.reward, 0);
        document.getElementById('total-earnings').textContent = `$${totalEarnings.toFixed(2)}`;
        
        // Update user statistics
        const fakeUsers = users.filter(user => user.is_fake).length;
        const realUsers = users.length - fakeUsers;
        
    } catch (error) {
        console.error('Failed to load dashboard statistics:', error);
        showError('Error loading statistics');
    }
    
    // Load top earners
    // Debug: load top earners
    await loadTopEarners();
    
    // Load most productive and quality leaders
    // Debug: load most productive
    await loadMostProductive();
    
    // Debug: load quality leaders
    await loadQualityLeaders();
    
    // Debug: dashboard loading completed
}

// Top Earners Management
async function loadTopEarners() {
    try {
        // Debug: loading top earners data
        const topEarners = await apiRequest('/admin/top-earners');
        // Debug: top earners response
        
        const tbody = document.getElementById('top-earners-table');
        if (!tbody) {
            console.error('top-earners-table element not found!');
            return;
        }
        
        if (!topEarners.top_earners || topEarners.top_earners.length === 0) {
            // Debug: empty top earners
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><h3>No users</h3><p>Create the first user</p></td></tr>';
            return;
        }
        
        // Debug: render top earners
        tbody.innerHTML = topEarners.top_earners.map(user => `
            <tr>
                <td>${user.first_name} ${user.last_name}</td>
                <td>${user.email}</td>
                <td>$${user.balance.toFixed(2)}</td>
                <td><span class="status-badge status-${user.level}">${user.level}</span></td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small" onclick="editUser(${user.id})">
                            ✏️ Edit
                        </button>
                        <button class="btn-admin btn-small btn-danger" onclick="deleteUser(${user.id})">
                            🗑️ Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // Debug: top earners loaded
        
    } catch (error) {
        console.error('Failed to load top earners:', error);
        showError('Error loading top leaders');
    }
}

// Most Productive Management
async function loadMostProductive() {
    try {
        // Debug: loading most productive
        const mostProductive = await apiRequest('/admin/most-productive');
        // Debug: most productive response
        
        const tbody = document.getElementById('most-productive-table');
        if (!tbody) {
            console.error('most-productive-table element not found!');
            return;
        }
        
        if (!mostProductive.most_productive || mostProductive.most_productive.length === 0) {
            // Debug: empty most productive
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><h3>No productive users</h3><p>Create the first user</p></td></tr>';
            return;
        }
        
        // Debug: render most productive
        tbody.innerHTML = mostProductive.most_productive.map(user => `
            <tr>
                <td>${user.first_name} ${user.last_name}</td>
                <td>${user.email}</td>
                <td>$${user.balance.toFixed(2)}</td>
                <td><span class="status-badge status-${user.level}">${user.level}</span></td>
                <td><span class="status-badge status-active">${user.tasks_completed}</span></td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small" onclick="editUser(${user.id})">
                            ✏️ Edit
                        </button>
                        <button class="btn-admin btn-small btn-danger" onclick="deleteUser(${user.id})">
                            🗑️ Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // Debug: most productive loaded
        
    } catch (error) {
        console.error('Failed to load most productive:', error);
        showError('Error loading productive users');
    }
}

// Quality Leaders Management
async function loadQualityLeaders() {
    try {
        // Debug: loading quality leaders
        const qualityLeaders = await apiRequest('/admin/quality-leaders');
        // Debug: quality leaders response
        
        const tbody = document.getElementById('quality-leaders-table');
        if (!tbody) {
            console.error('quality-leaders-table element not found!');
            return;
        }
        
        if (!qualityLeaders.quality_leaders || qualityLeaders.quality_leaders.length === 0) {
            // Debug: empty quality leaders
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><h3>No quality leaders</h3><p>Create the first user</p></td></tr>';
            return;
        }
        
        // Debug: render quality leaders
        tbody.innerHTML = qualityLeaders.quality_leaders.map(user => `
            <tr>
                <td>${user.first_name} ${user.last_name}</td>
                <td>${user.email}</td>
                <td>$${user.balance.toFixed(2)}</td>
                <td><span class="status-badge status-${user.level}">${user.level}</span></td>
                <td><span class="status-badge status-active">${user.approval_rate}%</span></td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small" onclick="editUser(${user.id})">
                            ✏️ Edit
                        </button>
                        <button class="btn-admin btn-small btn-danger" onclick="deleteUser(${user.id})">
                            🗑️ Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // Debug: quality leaders loaded
        
    } catch (error) {
        console.error('Failed to load quality leaders:', error);
        showError('Error loading quality leaders');
    }
}

// User form functions
function showCreateUserForm(type = 'earner', sectionId = 'top-earners-section') {
    const formId = `create-user-form-${sectionId.replace('-section', '')}`;
    const form = document.getElementById(formId);
    
    if (form) {
        form.style.display = 'block';
        
        // Set form title based on type
        const formTitle = form.querySelector('h4');
        if (formTitle) {
            switch(type) {
                case 'productive':
                    formTitle.textContent = 'Create productive user';
                    break;
                case 'quality':
                    formTitle.textContent = 'Create quality leader';
                    break;
                default:
                    formTitle.textContent = 'Create new user';
            }
        }
        
        // Save user type for use when creating
        form.setAttribute('data-user-type', type);
    }
}

function showCreateFakeUserForm(sectionId = 'top-earners-section') {
    const formId = `create-user-form-${sectionId.replace('-section', '')}`;
    const form = document.getElementById(formId);
    
    if (form) {
        form.style.display = 'block';
        const fakeCheckbox = form.querySelector('input[type="checkbox"]');
        if (fakeCheckbox) {
            fakeCheckbox.checked = true;
        }
        form.setAttribute('data-user-type', 'earner');
    }
}

function hideCreateUserForm(sectionId = 'top-earners-section') {
    const formId = `create-user-form-${sectionId.replace('-section', '')}`;
    const form = document.getElementById(formId);
    
    if (form) {
        form.style.display = 'none';
        const userForm = form.querySelector('form');
        if (userForm) {
            userForm.reset();
        }
    }
}

// Create user - Top Earners
document.getElementById('user-form-top-earners').addEventListener('submit', async function(e) {
    e.preventDefault();
    await createUserFromForm('top-earners-section');
});

// Create user - Most Productive
document.getElementById('user-form-most-productive').addEventListener('submit', async function(e) {
    e.preventDefault();
    await createUserFromForm('most-productive-section');
});

// Create user - Quality Leaders
document.getElementById('user-form-quality-leaders').addEventListener('submit', async function(e) {
    e.preventDefault();
    await createUserFromForm('quality-leaders-section');
});

// Generic function to create user from any form
async function createUserFromForm(sectionId) {
    // Debug
    
    const formId = `user-form-${sectionId.replace('-section', '')}`;
    const form = document.getElementById(formId);
    
    if (!form) {
        console.error('Form not found:', formId);
        return;
    }
    
    const formData = {
        first_name: document.getElementById(`user-first-name-${sectionId.replace('-section', '')}`).value,
        last_name: document.getElementById(`user-last-name-${sectionId.replace('-section', '')}`).value,
        email: document.getElementById(`user-email-${sectionId.replace('-section', '')}`).value,
        telegram_username: document.getElementById(`user-telegram-${sectionId.replace('-section', '')}`).value,
        password: document.getElementById(`user-password-${sectionId.replace('-section', '')}`).value,
        balance: parseFloat(document.getElementById(`user-balance-${sectionId.replace('-section', '')}`).value),
        level: document.getElementById(`user-level-${sectionId.replace('-section', '')}`).value,
        is_fake: document.getElementById(`user-is-fake-${sectionId.replace('-section', '')}`).checked
    };
    
    // Debug
    
    try {
        const response = await apiRequest('/admin/users/create', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        // Debug
        
        // Get user type from form
        const formContainer = document.getElementById(`create-user-form-${sectionId.replace('-section', '')}`);
        const userType = formContainer.getAttribute('data-user-type');
        // Debug
        
        // If this is a productive user or quality leader, create test tasks
        if (userType === 'productive' || userType === 'quality') {
            // Debug
            await createTestTasksForUser(response.user_id, userType);
        }
        
        hideCreateUserForm(sectionId);
        loadDashboard();
        showSuccess('User created successfully');
        
    } catch (error) {
        console.error('Failed to create user:', error);
        showError('Error creating user');
    }
}

// Create test tasks for productive users and quality leaders
async function createTestTasksForUser(userId, userType) {
    try {
        // Debug
        
        // Get task list
        const tasks = await apiRequest('/admin/tasks');
        // Debug
        
        if (tasks.length === 0) {
            console.warn('No tasks available for creating test submissions');
            return;
        }
        
        // Select random tasks
        const selectedTasks = tasks.slice(0, userType === 'productive' ? 5 : 3);
        // Debug
        
        for (let i = 0; i < selectedTasks.length; i++) {
            const task = selectedTasks[i];
            
            // Create test task completion
            const taskSubmission = {
                user_id: userId,
                task_id: task.id,
                status: userType === 'quality' ? 'approved' : (i < 4 ? 'approved' : 'rejected'),
                proof: `Test proof for task "${task.title}"`,
                submitted_at: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString() // Different dates
            };
            
            // Debug
            
            // Create UserTask record
            await createUserTaskSubmission(taskSubmission);
        }
        
        // Debug
        
    } catch (error) {
        console.error('Failed to create test tasks:', error);
    }
}

// Helper function to create user task submission
async function createUserTaskSubmission(submission) {
    try {
        // Debug
        
        // Use existing API to create UserTask
        const result = await apiRequest('/admin/user-tasks/create', {
            method: 'POST',
            body: JSON.stringify(submission)
        });
        
        // Debug
        return result;
    } catch (error) {
        console.error('Failed to create user task submission:', error);
        throw error;
    }
}

// Edit user
async function editUser(userId) {
    try {
        // Получаем данные пользователя из всех лидербордов
        const [topEarners, mostProductive, qualityLeaders] = await Promise.all([
            apiRequest('/admin/top-earners'),
            apiRequest('/admin/most-productive'),
            apiRequest('/admin/quality-leaders')
        ]);
        
        // Ищем пользователя во всех лидербордах
        let user = topEarners.top_earners?.find(u => u.id === userId);
        if (!user) {
            user = mostProductive.most_productive?.find(u => u.id === userId);
        }
        if (!user) {
            user = qualityLeaders.quality_leaders?.find(u => u.id === userId);
        }
        
        if (!user) {
            showError('User not found in leaderboards');
            return;
        }
        
        // Показываем модальное окно для редактирования
        showEditUserModal(user);
        
    } catch (error) {
        console.error('Failed to load user data:', error);
        showError('Error loading user data');
    }
}

// Show edit user modal
function showEditUserModal(user) {
    // Создаем модальное окно
    let modal = document.getElementById('editUserModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editUserModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(5px);
            z-index: 10005;
            display: none;
        `;
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 0;
            border-radius: 15px;
            width: 90%;
            max-width: 500px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
        ">
            <div class="modal-header" style="
                padding: 20px 25px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">Edit User: ${user.first_name} ${user.last_name}</h3>
                <span class="close" onclick="closeEditUserModal()" style="
                    color: #aaa;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    background: none;
                    border: none;
                ">&times;</span>
            </div>
            <div class="modal-body" style="padding: 25px;">
                <form id="edit-user-form">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Balance ($):</label>
                        <input type="number" id="edit-user-balance" value="${user.balance}" step="0.01" min="0" required style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid rgba(255,255,255,0.2);
                            border-radius: 10px;
                            background: rgba(255,255,255,0.1);
                            color: #fff;
                            font-size: 1rem;
                        ">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Level:</label>
                        <select id="edit-user-level" required style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid rgba(255,255,255,0.2);
                            border-radius: 10px;
                            background: rgba(255,255,255,0.1);
                            color: #fff;
                            font-size: 1rem;
                        ">
                            <option value="basic" ${user.level === 'basic' ? 'selected' : ''}>Basic</option>
                            <option value="silver" ${user.level === 'silver' ? 'selected' : ''}>Silver</option>
                            <option value="gold" ${user.level === 'gold' ? 'selected' : ''}>Gold</option>
                            <option value="platinum" ${user.level === 'platinum' ? 'selected' : ''}>Platinum</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Tasks Completed:</label>
                        <input type="number" id="edit-user-tasks-completed" value="${user.tasks_completed || 0}" min="0" required style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid rgba(255,255,255,0.2);
                            border-radius: 10px;
                            background: rgba(255,255,255,0.1);
                            color: #fff;
                            font-size: 1rem;
                        ">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Approval Rate (%):</label>
                        <input type="number" id="edit-user-approval-rate" value="${user.approval_rate || 0}" min="0" max="100" step="0.1" required style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid rgba(255,255,255,0.2);
                            border-radius: 10px;
                            background: rgba(255,255,255,0.1);
                            color: #fff;
                            font-size: 1rem;
                        ">
                    </div>
                </form>
            </div>
            <div class="modal-footer" style="
                padding: 20px 25px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: flex-end;
                gap: 15px;
            ">
                <button class="btn-secondary" onclick="closeEditUserModal()" style="
                    background: rgba(255,255,255,0.1);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">Cancel</button>
                <button class="btn-primary" onclick="saveUserEdit(${user.id})" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">Save changes</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Закрытие модального окна при клике вне его
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeEditUserModal();
        }
    };
}

// Close edit user modal
function closeEditUserModal() {
    const modal = document.getElementById('editUserModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Save user edit
async function saveUserEdit(userId) {
    const balance = parseFloat(document.getElementById('edit-user-balance').value);
    const level = document.getElementById('edit-user-level').value;
    const tasksCompleted = parseInt(document.getElementById('edit-user-tasks-completed').value);
    const approvalRate = parseFloat(document.getElementById('edit-user-approval-rate').value);
    
    if (isNaN(balance) || balance < 0) {
        showError('Please enter a valid balance');
        return;
    }
    
    if (isNaN(tasksCompleted) || tasksCompleted < 0) {
        showError('Please enter a valid number of completed tasks');
        return;
    }
    
    if (isNaN(approvalRate) || approvalRate < 0 || approvalRate > 100) {
        showError('Please enter a valid approval rate (0-100%)');
        return;
    }
    
    try {
        await apiRequest(`/admin/users/${userId}/update`, {
            method: 'POST',
            body: JSON.stringify({
                balance: balance,
                level: level,
                tasks_completed: tasksCompleted,
                approval_rate: approvalRate
            })
        });
        
        closeEditUserModal();
        
        // Обновляем все таблицы
        await loadTopEarners();
        await loadMostProductive();
        await loadQualityLeaders();
        showSuccess('User updated successfully');
        
    } catch (error) {
        console.error('Failed to update user:', error);
        showError('Error updating user');
    }
}

// Delete user
window.deleteUser = async function(userId) {
    showDeleteUserModal(userId);
};

// Modal for deleting user
function showDeleteUserModal(userId) {
    const modalHTML = `
        <div id="deleteUserModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">🗑️ Delete User</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to delete this user? This action cannot be undone.
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitDeleteUser(${userId})" style="
                        background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">🗑️ Delete</button>
                    <button onclick="closeDeleteUserModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('deleteUserModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDeleteUserModal();
        }
    });
}

window.submitDeleteUser = async function(userId) {
    try {
        await apiRequest(`/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        // Обновляем все таблицы
        await loadTopEarners();
        await loadMostProductive();
        await loadQualityLeaders();
        showSuccess('User deleted successfully');
        
    } catch (error) {
        console.error('Failed to delete user:', error);
        showError('Error deleting user');
    } finally {
        closeDeleteUserModal();
    }
};

window.closeDeleteUserModal = function() {
    const modal = document.getElementById('deleteUserModal');
    if (modal) {
        modal.remove();
    }
};

// Tasks management
async function loadTasks() {
    try {
        const tasks = await apiRequest('/admin/tasks');
        const tbody = document.getElementById('tasks-table');
        
        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><h3>No tasks</h3><p>Create the first task</p></td></tr>';
            return;
        }
        
        tbody.innerHTML = tasks.map(task => `
            <tr>
                <td>${task.id}</td>
                <td>${task.title}</td>
                <td>$${task.reward.toFixed(2)}</td>
                <td><span class="status-badge status-${task.level_required}">${task.level_required}</span></td>
                <td>${task.time_limit ? task.time_limit + 'h' : 'No limit'}</td>
                <td><span class="status-badge status-${task.is_active ? 'active' : 'inactive'}">${task.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small" onclick="editTask(${task.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn-admin btn-small" onclick="toggleTaskStatus(${task.id}, ${!task.is_active})">
                            ${task.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button class="btn-admin btn-small btn-danger" onclick="deleteTask(${task.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load tasks:', error);
        showError('Error loading tasks');
    }
}

// Task form functions
function showCreateTaskForm() {
    document.getElementById('create-task-form').style.display = 'block';
}

function hideCreateTaskForm() {
    document.getElementById('create-task-form').style.display = 'none';
    document.getElementById('task-form').reset();
}

// Create task
document.getElementById('task-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const timeLimitValue = parseInt(document.getElementById('task-time-limit').value) || 0;
    const formData = {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        required_proof: document.getElementById('task-required-proof').value,
        reward: parseFloat(document.getElementById('task-reward').value),
        level_required: document.getElementById('task-level').value,
        expires_at: null,
        time_limit_hours: timeLimitValue > 0 ? timeLimitValue : null
    };
    
    try {
        const response = await apiRequest('/admin/tasks', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        hideCreateTaskForm();
        loadTasks();
        loadDashboard();
        showSuccess('Task created successfully');
        
    } catch (error) {
        console.error('Failed to create task:', error);
        if (error.message && error.message.includes('Maximum 5 tasks allowed')) {
            showError('Task limit reached for this level (maximum 5)');
        } else {
            showError('Error creating task');
        }
    }
});

// Toggle task status
async function toggleTaskStatus(taskId, isActive) {
    try {
        await apiRequest(`/admin/tasks/${taskId}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ is_active: isActive })
        });
        
        loadTasks();
        showSuccess('Task status updated');
        
    } catch (error) {
        console.error('Failed to toggle task status:', error);
        showError('Error updating status');
    }
}

// Edit task
async function editTask(taskId) {
    try {
        // Get task data
        const tasks = await apiRequest('/admin/tasks');
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
            showError('Task not found');
            return;
        }
        
        // Show edit form
        showEditTaskForm(task);
        
    } catch (error) {
        console.error('Failed to load task for editing:', error);
        showError('Error loading task');
    }
}

// Show edit task form
function showEditTaskForm(task) {
    // Create edit modal
    let modal = document.getElementById('editTaskModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editTaskModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(5px);
            z-index: 10005;
            display: none;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 0;
                border-radius: 15px;
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <div class="modal-header" style="
                    padding: 20px 25px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h3 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">Edit task</h3>
                    <span class="close" onclick="closeEditTaskModal()" style="
                        color: #aaa;
                        font-size: 28px;
                        font-weight: bold;
                        cursor: pointer;
                        background: none;
                        border: none;
                    ">&times;</span>
                </div>
                <div class="modal-body" style="padding: 25px;">
                    <form id="edit-task-form">
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Task title:</label>
                            <input type="text" id="edit-task-title" placeholder="Enter the task title" required style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid rgba(255,255,255,0.2);
                                border-radius: 10px;
                                background: rgba(255,255,255,0.1);
                                color: #fff;
                                font-size: 1rem;
                            ">
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Task description:</label>
                            <textarea id="edit-task-description" placeholder="Describe the task in detail" rows="4" required style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid rgba(255,255,255,0.2);
                                border-radius: 10px;
                                background: rgba(255,255,255,0.1);
                                color: #fff;
                                font-size: 1rem;
                                resize: vertical;
                            "></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Necessary proof:</label>
                            <textarea id="edit-task-required-proof" placeholder="Describe the proof that the user must provide (screenshots, files, description, etc.)" rows="3" required style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid rgba(255,255,255,0.2);
                                border-radius: 10px;
                                background: rgba(255,255,255,0.1);
                                color: #fff;
                                font-size: 1rem;
                                resize: vertical;
                            "></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Reward ($):</label>
                            <input type="number" id="edit-task-reward" placeholder="0.00" step="0.01" min="0" required style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid rgba(255,255,255,0.2);
                                border-radius: 10px;
                                background: rgba(255,255,255,0.1);
                                color: #fff;
                                font-size: 1rem;
                            ">
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Access level:</label>
                            <select id="edit-task-level" required style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid rgba(255,255,255,0.2);
                                border-radius: 10px;
                                background: rgba(255,255,255,0.1);
                                color: #fff;
                                font-size: 1rem;
                            ">
                                <option value="basic">Basic</option>
                                <option value="silver">Silver</option>
                                <option value="gold">Gold</option>
                                <option value="platinum">Platinum</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Time limit (hours):</label>
                            <input type="number" id="edit-task-time-limit" placeholder="Enter time limit in hours (0 = no limit)" min="0" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid rgba(255,255,255,0.2);
                                border-radius: 10px;
                                background: rgba(255,255,255,0.1);
                                color: #fff;
                                font-size: 1rem;
                            ">
                        </div>

                    </form>
                </div>
                <div class="modal-footer" style="
                    padding: 20px 25px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    justify-content: flex-end;
                    gap: 15px;
                ">
                    <button class="btn-secondary" onclick="closeEditTaskModal()" style="
                        background: rgba(255,255,255,0.1);
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                    ">Cancel</button>
                    <button class="btn-primary" onclick="saveTaskEdit()" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                    ">Save changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Добавляем обработчик для закрытия по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEditTaskModal();
            }
        });
    }
    
            // Fill form with data
    document.getElementById('edit-task-title').value = task.title;
    document.getElementById('edit-task-description').value = task.description;
    document.getElementById('edit-task-required-proof').value = task.required_proof || '';
    document.getElementById('edit-task-reward').value = task.reward;
    document.getElementById('edit-task-level').value = task.level_required;
    document.getElementById('edit-task-time-limit').value = task.time_limit || 0;
    

    
            // Save task ID for saving
    modal.dataset.taskId = task.id;
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Блокируем прокрутку фона
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
}

// Close edit task modal
function closeEditTaskModal() {
    const modal = document.getElementById('editTaskModal');
    if (modal) {
        // Полностью удаляем модальное окно из DOM
        modal.remove();
        // Восстанавливаем прокрутку фона
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }
}

// Save task edit
async function saveTaskEdit() {
    const modal = document.getElementById('editTaskModal');
    const taskId = modal.dataset.taskId;
    
    const timeLimitValue = parseInt(document.getElementById('edit-task-time-limit').value) || 0;
    const formData = {
        title: document.getElementById('edit-task-title').value,
        description: document.getElementById('edit-task-description').value,
        required_proof: document.getElementById('edit-task-required-proof').value,
        reward: parseFloat(document.getElementById('edit-task-reward').value),
        level_required: document.getElementById('edit-task-level').value,
        expires_at: null,
        time_limit_hours: timeLimitValue > 0 ? timeLimitValue : null
    };
    
    try {
        await apiRequest(`/admin/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(formData)
        });
        
        closeEditTaskModal();
        loadTasks();
        showSuccess('Task updated successfully');
        
    } catch (error) {
        console.error('Failed to update task:', error);
        showError('Error updating task');
    }
}

// Delete task
window.deleteTask = async function(taskId) {
    showDeleteTaskModal(taskId);
};

// Modal for deleting task
function showDeleteTaskModal(taskId) {
    const modalHTML = `
        <div id="deleteTaskModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">🗑️ Delete Task</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to delete this task?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitDeleteTask(${taskId})" style="
                        background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">🗑️ Delete</button>
                    <button onclick="closeDeleteTaskModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('deleteTaskModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDeleteTaskModal();
        }
    });
}

window.submitDeleteTask = async function(taskId) {
    try {
        await apiRequest(`/admin/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        loadTasks();
        loadDashboard();
        showSuccess('Task deleted');
        
    } catch (error) {
        console.error('Failed to delete task:', error);
        showError('Error deleting task');
    } finally {
        closeDeleteTaskModal();
    }
};

window.closeDeleteTaskModal = function() {
    const modal = document.getElementById('deleteTaskModal');
    if (modal) {
        modal.remove();
    }
};

// Users management
async function loadUsers() {
    try {
        const users = await apiRequest('/admin/users');
        const tbody = document.getElementById('users-table');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><h3>No users</h3></td></tr>';
            return;
        }
        
        // Store for search
        window.__ADMIN_USERS = users;
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.first_name} ${user.last_name}</td>
                <td>${user.email}</td>
                <td>${user.telegram_username || 'Not specified'}</td>
                <td>$${user.balance.toFixed(2)}</td>
                <td>$${(user.min_withdrawal_amount || 50.0).toFixed(2)}</td>
                <td><span class="status-badge status-${user.level}">${user.level}</span></td>
                <td>
                    <span class="status-badge status-${user.is_verified ? 'active' : 'inactive'}">
                        ${user.is_verified ? 'Verified' : 'Not verified'}
                    </span>
                </td>
                <td>
                    <span class="status-badge status-${user.withdrawal_enabled ? 'active' : 'inactive'}">
                        ${user.withdrawal_enabled ? 'Withdrawal enabled' : 'Withdrawal disabled'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small" onclick="changeUserLevel(${user.id})">Change level</button>
                        <button class="btn-admin btn-small" onclick="adjustUserBalance(${user.id})">Change balance</button>
                        <button class="btn-admin btn-small" onclick="changeUserMinWithdrawal(${user.id})">Min. withdrawal</button>
                        <button class="btn-admin btn-small" onclick="toggleUserWithdrawalAccess(${user.id})">
                            ${user.withdrawal_enabled ? 'Disable withdrawal' : 'Enable withdrawal'}
                        </button>
                        <button class="btn-admin btn-small" onclick="editUserData(${user.id})">Edit</button>
                        <button class="btn-admin btn-small" onclick="toggleUserVerification(${user.id}, ${!user.is_verified})">
                            ${user.is_verified ? 'Cancel verification' : 'Verify'}
                        </button>
                        <button class="btn-admin btn-small btn-warning" onclick="changeUserPassword(${user.id}, '${user.email}')">🔐 Password</button>
                        <button class="btn-admin btn-small btn-info" onclick="showUserEvents(${user.id})">📋 History</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load users:', error);
        showError('Error loading users');
    }
}

// Handle user search by email
function handleUserSearch() {
    const input = document.getElementById('user-search-input');
    const query = (input.value || '').toLowerCase().trim();
    const users = Array.isArray(window.__ADMIN_USERS) ? window.__ADMIN_USERS : [];
    const filtered = query
        ? users.filter(u => (u.email || '').toLowerCase().includes(query))
        : users;
    const tbody = document.getElementById('users-table');
    if (!tbody) return;
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><h3>No users found</h3></td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.first_name} ${user.last_name}</td>
            <td>${user.email}</td>
            <td>${user.telegram_username || 'Not specified'}</td>
            <td>$${user.balance.toFixed(2)}</td>
            <td>$${(user.min_withdrawal_amount || 50.0).toFixed(2)}</td>
            <td><span class="status-badge status-${user.level}">${user.level}</span></td>
            <td>
                <span class="status-badge status-${user.is_verified ? 'active' : 'inactive'}">
                    ${user.is_verified ? 'Verified' : 'Not verified'}
                </span>
            </td>
            <td>
                <span class="status-badge status-${user.withdrawal_enabled ? 'active' : 'inactive'}">
                    ${user.withdrawal_enabled ? 'Withdrawal enabled' : 'Withdrawal disabled'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-admin btn-small" onclick="changeUserLevel(${user.id})">Change level</button>
                    <button class="btn-admin btn-small" onclick="adjustUserBalance(${user.id})">Change balance</button>
                    <button class="btn-admin btn-small" onclick="changeUserMinWithdrawal(${user.id})">Min. withdrawal</button>
                    <button class="btn-admin btn-small" onclick="toggleUserWithdrawalAccess(${user.id})">
                        ${user.withdrawal_enabled ? 'Disable withdrawal' : 'Enable withdrawal'}
                    </button>
                    <button class="btn-admin btn-small" onclick="editUserData(${user.id})">Edit</button>
                    <button class="btn-admin btn-small" onclick="toggleUserVerification(${user.id}, ${!user.is_verified})">
                        ${user.is_verified ? 'Cancel verification' : 'Verify'}
                    </button>
                    <button class="btn-admin btn-small btn-warning" onclick="changeUserPassword(${user.id}, '${user.email}')">🔐 Password</button>
                    <button class="btn-admin btn-small btn-info" onclick="showUserEvents(${user.id})">📋 History</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Reset user search
function resetUserSearch() {
    const input = document.getElementById('user-search-input');
    if (input) {
        input.value = '';
        handleUserSearch(); // This will show all users
    }
}

// Add event listeners for search inputs
document.addEventListener('DOMContentLoaded', function() {
    // User search input
    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput) {
        userSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleUserSearch();
            }
        });
    }
    
    // Withdrawal search input
    const withdrawalSearchInput = document.getElementById('withdrawal-search-input');
    if (withdrawalSearchInput) {
        withdrawalSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleWithdrawalSearch();
            }
        });
    }
});

// User management functions
async function changeUserLevel(userId) {
    console.log('changeUserLevel called with userId:', userId);
    
    // Create modal for level input
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    
    modal.innerHTML = `
        <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            padding: 30px;
            border-radius: 15px;
            border: 1px solid #3a3a3a;
            min-width: 400px;
            color: white;
        ">
            <h3 style="margin-bottom: 20px;">Change User Level</h3>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px;">Select Level:</label>
                <select id="levelSelect" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                ">
                    <option value="basic">Basic</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="platinum">Platinum</option>
                </select>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal').remove()" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #666;
                    color: white;
                    cursor: pointer;
                ">Cancel</button>
                <button onclick="submitLevelChange(${userId})" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #667eea;
                    color: white;
                    cursor: pointer;
                ">Change Level</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal on outside click
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Submit level change
async function submitLevelChange(userId) {
    const modal = document.querySelector('.modal');
    const levelSelect = document.getElementById('levelSelect');
    
    if (!levelSelect || !levelSelect.value) {
        showError('Please select a level');
        return;
    }
    
    const level = levelSelect.value;
    
    try {
        console.log('Sending level change request for user:', userId, 'level:', level);
        
        await apiRequest(`/admin/users/${userId}/level`, {
            method: 'POST',
            body: JSON.stringify({ level: level })
        });
        
        console.log('Level change successful');
        
        // Close modal
        if (modal) modal.remove();
        
        loadUsers();
        showSuccess('User level updated');
        
    } catch (error) {
        console.error('Failed to change user level:', error);
        showError('Error changing level: ' + error.message);
    }
}

async function adjustUserBalance(userId) {
    console.log('adjustUserBalance called with userId:', userId);
    
    // Create modal for balance input
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    
    modal.innerHTML = `
        <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            padding: 30px;
            border-radius: 15px;
            border: 1px solid #3a3a3a;
            min-width: 400px;
            color: white;
        ">
            <h3 style="margin-bottom: 20px;">Change User Balance</h3>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px;">Action:</label>
                <select id="balanceAction" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    margin-bottom: 15px;
                ">
                    <option value="set">Set exact balance</option>
                    <option value="adjust">Add/subtract amount</option>
                </select>
                <label style="display: block; margin-bottom: 8px;">Amount:</label>
                <input type="number" id="balanceAmount" step="0.01" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                " placeholder="Enter amount">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal').remove()" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #666;
                    color: white;
                    cursor: pointer;
                ">Cancel</button>
                <button onclick="submitBalanceChange(${userId})" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #667eea;
                    color: white;
                    cursor: pointer;
                ">Change Balance</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal on outside click
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Submit balance change
async function submitBalanceChange(userId) {
    const modal = document.querySelector('.modal');
    const actionSelect = document.getElementById('balanceAction');
    const amountInput = document.getElementById('balanceAmount');
    
    if (!actionSelect || !amountInput || !amountInput.value || isNaN(amountInput.value)) {
        showError('Please enter a valid amount');
            return;
        }
    
    const action = actionSelect.value;
    const amount = parseFloat(amountInput.value);
        
        try {
        if (action === 'set') {
            console.log('Setting exact balance for user:', userId, 'balance:', amount);
            
            await apiRequest(`/admin/users/${userId}/update`, {
                method: 'POST',
                body: JSON.stringify({ balance: amount })
            });
    } else {
            console.log('Adjusting balance for user:', userId, 'amount:', amount);
            
            await apiRequest(`/admin/users/${userId}/balance`, {
                method: 'POST',
                body: JSON.stringify({ amount: amount })
            });
        }
        
        console.log('Balance change successful');
        
        // Close modal
        if (modal) modal.remove();
            
            loadUsers();
            loadDashboard();
            showSuccess('User balance updated');
            
        } catch (error) {
        console.error('Failed to change user balance:', error);
        showError('Error changing balance: ' + error.message);
    }
}

async function toggleUserVerification(userId, isVerified) {
    console.log('toggleUserVerification called with userId:', userId, 'isVerified:', isVerified);
    
    try {
        console.log('Sending verification toggle request for user:', userId, 'isVerified:', isVerified);
        
        await apiRequest(`/admin/users/${userId}/verify`, {
            method: 'POST',
            body: JSON.stringify({ is_verified: isVerified })
        });
        
        console.log('Verification toggle successful');
        loadUsers();
        showSuccess('Verification status updated');
        
    } catch (error) {
        console.error('Failed to toggle user verification:', error);
        showError('Error changing verification: ' + error.message);
    }
}

async function changeUserMinWithdrawal(userId) {
    console.log('changeUserMinWithdrawal called with userId:', userId);
    
    // Create modal for min withdrawal input
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    
    modal.innerHTML = `
        <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            padding: 30px;
            border-radius: 15px;
            border: 1px solid #3a3a3a;
            min-width: 400px;
            color: white;
        ">
            <h3 style="margin-bottom: 20px;">Change Minimum Withdrawal Amount</h3>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px;">Minimum Withdrawal Amount:</label>
                <input type="number" id="minWithdrawalAmount" step="0.01" min="0" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                " placeholder="Enter minimum withdrawal amount">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal').remove()" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #666;
                    color: white;
                    cursor: pointer;
                ">Cancel</button>
                <button onclick="submitMinWithdrawalChange(${userId})" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #667eea;
                    color: white;
                    cursor: pointer;
                ">Change Amount</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal on outside click
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Submit min withdrawal change
async function submitMinWithdrawalChange(userId) {
    const modal = document.querySelector('.modal');
    const amountInput = document.getElementById('minWithdrawalAmount');
    
    if (!amountInput || !amountInput.value || isNaN(amountInput.value) || parseFloat(amountInput.value) < 0) {
        showError('Please enter a valid amount (must be 0 or greater)');
        return;
    }
    
    const amount = parseFloat(amountInput.value);
    
    try {
        console.log('Setting min withdrawal amount for user:', userId, 'amount:', amount);
        
        await apiRequest(`/admin/users/${userId}/min-withdrawal`, {
            method: 'POST',
            body: JSON.stringify({ min_withdrawal_amount: amount })
        });
        
        console.log('Min withdrawal amount update successful');
        
        // Close modal
        if (modal) modal.remove();
        
        loadUsers();
        showSuccess('Minimum withdrawal amount updated');
        
    } catch (error) {
        console.error('Failed to change user min withdrawal:', error);
        showError('Error changing minimum withdrawal amount: ' + error.message);
    }
}

async function toggleUserWithdrawalAccess(userId) {
    console.log('toggleUserWithdrawalAccess called with userId:', userId);
    
    try {
        console.log('Sending withdrawal access toggle request for user:', userId);
        
        await apiRequest(`/admin/users/${userId}/withdrawal-access`, {
            method: 'POST',
            body: JSON.stringify({})
        });
        
        console.log('Withdrawal access toggle successful');
        loadUsers();
        showSuccess('User withdrawal access updated');
        
    } catch (error) {
        console.error('Failed to toggle user withdrawal access:', error);
        showError('Error updating withdrawal access: ' + error.message);
    }
}

async function editUserData(userId) {
    console.log('editUserData called with userId:', userId);
    
    // Get user data
    const users = await apiRequest('/admin/users');
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        showError('User not found');
        return;
    }
    
    console.log('Found user:', user);
    
    // Create modal for user data edit
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    
    modal.innerHTML = `
        <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            padding: 30px;
            border-radius: 15px;
            border: 1px solid #3a3a3a;
            min-width: 500px;
            color: white;
            max-height: 90vh;
            overflow-y: auto;
        ">
            <h3 style="margin-bottom: 20px;">Edit User Data</h3>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px;">Balance:</label>
                <input type="number" id="editUserBalance" value="${user.balance}" step="0.01" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    margin-bottom: 15px;
                " placeholder="Enter balance">
                
                <label style="display: block; margin-bottom: 8px;">Minimum Withdrawal Amount:</label>
                <input type="number" id="editUserMinWithdrawal" value="${user.min_withdrawal_amount || 50.0}" step="0.01" min="0" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    margin-bottom: 15px;
                " placeholder="Enter minimum withdrawal amount">
                
                <label style="display: block; margin-bottom: 8px;">Level:</label>
                <select id="editUserLevel" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                    margin-bottom: 15px;
                ">
                    <option value="basic" ${user.level === 'basic' ? 'selected' : ''}>Basic</option>
                    <option value="silver" ${user.level === 'silver' ? 'selected' : ''}>Silver</option>
                    <option value="gold" ${user.level === 'gold' ? 'selected' : ''}>Gold</option>
                    <option value="platinum" ${user.level === 'platinum' ? 'selected' : ''}>Platinum</option>
                </select>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; margin-bottom: 8px;">
                        <input type="checkbox" id="editUserVerified" ${user.is_verified ? 'checked' : ''} style="
                            margin-right: 10px;
                            transform: scale(1.2;
                        ">
                        User Verified
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; margin-bottom: 8px;">
                        <input type="checkbox" id="editUserAdmin" ${user.is_admin ? 'checked' : ''} style="
                            margin-right: 10px;
                            transform: scale(1.2);
                        ">
                        User is Admin
                    </label>
                </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal').remove()" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #666;
                    color: white;
                    cursor: pointer;
                ">Cancel</button>
                <button onclick="submitUserDataEdit(${userId})" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #667eea;
                    color: white;
                    cursor: pointer;
                ">Save Changes</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal on outside click
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Submit user data edit
async function submitUserDataEdit(userId) {
    const modal = document.querySelector('.modal');
    const balanceInput = document.getElementById('editUserBalance');
    const minWithdrawalInput = document.getElementById('editUserMinWithdrawal');
    const levelSelect = document.getElementById('editUserLevel');
    const verifiedCheckbox = document.getElementById('editUserVerified');
    const adminCheckbox = document.getElementById('editUserAdmin');
    
    if (!balanceInput || !minWithdrawalInput || !levelSelect || !verifiedCheckbox || !adminCheckbox) {
        showError('Form elements not found');
        return;
    }
    
    const balance = parseFloat(balanceInput.value);
    const minWithdrawal = parseFloat(minWithdrawalInput.value);
    const level = levelSelect.value;
    const isVerified = verifiedCheckbox.checked;
    const isAdmin = adminCheckbox.checked;
    
    if (isNaN(balance) || isNaN(minWithdrawal) || minWithdrawal < 0) {
        showError('Please enter valid numbers for balance and minimum withdrawal amount');
        return;
    }
    
    if (!['basic', 'silver', 'gold', 'platinum'].includes(level)) {
        showError('Please select a valid level');
        return;
    }
    
    try {
        const userData = {
            balance: balance,
            min_withdrawal_amount: minWithdrawal,
            level: level,
            is_verified: isVerified,
            is_admin: isAdmin
        };
        
        console.log('Sending user data update:', userData);
        
        await apiRequest(`/admin/users/${userId}/update`, {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        
        console.log('User data update successful');
        
        // Close modal
        if (modal) modal.remove();
        
        loadUsers();
        loadDashboard();
        showSuccess('User data updated');
        
    } catch (error) {
        console.error('Failed to update user data:', error);
        showError('Error updating user data: ' + error.message);
    }
}

async function showUserEvents(userId) {
    console.log('showUserEvents called with userId:', userId);
    
    try {
        console.log('Loading events for user:', userId);
        
        const response = await apiRequest(`/admin/user/${userId}/events`);
        
        console.log('Events response:', response);
        
        if (!response.success) {
            showError('Error loading event history');
            return;
        }
        
        const user = response.user;
        const events = response.events;
        
        // Создаем модальное окно с историей событий
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const eventTypes = {
            'account_created': '👤 Account created',
            'verified': '✅ Account verified',
            'verification_rejected': '❌ Verification rejected',
            'withdrawal_request': '💰 Withdrawal request created'
        };
        
        const eventsHtml = events.length > 0 ? events.map(event => {
            const eventType = eventTypes[event.event_type] || event.event_type;
            let eventData = '';
            
            if (event.event_data) {
                try {
                    const data = JSON.parse(event.event_data);
                    if (data.amount) {
                        eventData = `<br><small>Amount: $${data.amount}, Network: ${data.network_coin}</small>`;
                    }
                } catch (e) {
                    // Игнорируем ошибки парсинга JSON
                }
            }
            
            return `
                <div class="event-item">
                    <div class="event-icon">${eventType.split(' ')[0]}</div>
                    <div class="event-content">
                        <div class="event-title">${eventType.split(' ').slice(1).join(' ')}</div>
                        <div class="event-description">${event.event_description}</div>
                        ${eventData}
                        <div class="event-time">${new Date(event.created_at).toLocaleString()}</div>
                    </div>
                </div>
            `;
        }).join('') : '<div class="no-events">Event history is empty</div>';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>📋 User event history</h3>
                    <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="user-info">
                        <h4>${user.name}</h4>
                        <p>${user.email}</p>
                    </div>
                    <div class="events-list">
                        ${eventsHtml}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Закрытие модального окна при клике вне его
        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        };
        
    } catch (error) {
        console.error('Failed to load user events:', error);
        showError('Error loading event history');
    }
}

// Change user password
async function changeUserPassword(userId, userEmail) {
    console.log('changeUserPassword called with:', { userId, userEmail });
    
    // Create modal for password input
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    
    modal.innerHTML = `
        <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            padding: 30px;
            border-radius: 15px;
            border: 1px solid #3a3a3a;
            min-width: 400px;
            color: white;
        ">
            <h3 style="margin-bottom: 20px;">Change Password for ${userEmail}</h3>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px;">New Password:</label>
                <input type="password" id="newPasswordInput" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 16px;
                " placeholder="Enter new password">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal').remove()" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #666;
                    color: white;
                    cursor: pointer;
                ">Cancel</button>
                <button onclick="submitPasswordChange(${userId}, '${userEmail}')" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    background: #667eea;
                    color: white;
                    cursor: pointer;
                ">Change Password</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on input
    setTimeout(() => {
        const input = modal.querySelector('#newPasswordInput');
        if (input) input.focus();
    }, 100);
    
    // Close modal on outside click
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// Submit password change
async function submitPasswordChange(userId, userEmail) {
    const modal = document.querySelector('.modal');
    const passwordInput = document.getElementById('newPasswordInput');
    
    if (!passwordInput || !passwordInput.value.trim()) {
        showError('Please enter a password');
        return;
    }
    
    const newPassword = passwordInput.value.trim();
    
    try {
        console.log(`Changing password for user ${userEmail} (ID: ${userId})`);
        
        const response = await apiRequest(`/admin/users/${userId}/change-password`, {
            method: 'POST',
            body: JSON.stringify({
                new_password: newPassword
            })
        });
        
        console.log('Password change response:', response);
        
        showSuccess(`Password changed successfully for ${userEmail}`);
        
        // Close modal
        if (modal) modal.remove();
        
        // Reload users to refresh the table
        await loadUsers();
        
    } catch (error) {
        console.error('Failed to change user password:', error);
        
        // Show more detailed error message
        let errorMessage = 'Error changing user password';
        if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        showError(errorMessage);
    }
}

// Global settings functions
function showGlobalSettings() {
    document.getElementById('global-settings-form').style.display = 'block';
    loadGlobalSettings();
}

function hideGlobalSettings() {
    document.getElementById('global-settings-form').style.display = 'none';
}

async function loadGlobalSettings() {
    try {
        const response = await apiRequest('/admin/settings/global-min-withdrawal');
        document.getElementById('global-min-withdrawal').value = response.global_min_withdrawal_amount;
    } catch (error) {
        console.error('Failed to load global settings:', error);
        showError('Error loading global settings');
    }
}

// Add event listener for global settings form
document.addEventListener('DOMContentLoaded', function() {
    const globalSettingsForm = document.getElementById('global-settings-form');
    if (globalSettingsForm) {
        globalSettingsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const globalMinWithdrawal = parseFloat(document.getElementById('global-min-withdrawal').value);
            
            if (isNaN(globalMinWithdrawal) || globalMinWithdrawal < 0) {
                showError('Enter a valid amount');
                return;
            }
            
            try {
                await apiRequest('/admin/settings/global-min-withdrawal', {
                    method: 'POST',
                    body: JSON.stringify({ global_min_withdrawal_amount: globalMinWithdrawal })
                });
                
                hideGlobalSettings();
                showSuccess('Global settings updated');
                
            } catch (error) {
                console.error('Failed to update global settings:', error);
                showError('Error updating global settings');
            }
        });
    }
});

// Welcome message management
window.sendWelcomeToAllUsers = async function() {
    showSendWelcomeModal();
};

// Modal for sending welcome message
function showSendWelcomeModal() {
    const modalHTML = `
        <div id="sendWelcomeModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">📧 Send Welcome Message</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Send welcome message to all users who have not received it yet?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitSendWelcome()" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">📧 Send</button>
                    <button onclick="closeSendWelcomeModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('sendWelcomeModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeSendWelcomeModal();
        }
    });
}

window.submitSendWelcome = async function() {
    try {
        const response = await apiRequest('/admin/send-welcome-to-all', {
            method: 'POST'
        });
        
        showSuccess(`Welcome messages sent to ${response.sent_count} users from ${response.total_users}`);
        
    } catch (error) {
        console.error('Failed to send welcome messages:', error);
        showError('Error sending welcome messages');
    } finally {
        closeSendWelcomeModal();
    }
};

window.closeSendWelcomeModal = function() {
    const modal = document.getElementById('sendWelcomeModal');
    if (modal) {
        modal.remove();
    }
};

// News management
async function loadNews() {
    try {
        const news = await apiRequest('/news');
        const tbody = document.getElementById('news-table');
        
        if (!news.news || news.news.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><h3>No news</h3><p>Create the first news</p></td></tr>';
            return;
        }
        
        tbody.innerHTML = news.news.map(item => `
            <tr>
                <td>${item.id}</td>
                <td>${item.title}</td>
                <td>${new Date(item.created_at).toLocaleDateString()}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small btn-danger" onclick="deleteNews(${item.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load news:', error);
        showError('Error loading news');
    }
}

// News form functions
function showCreateNewsForm() {
    document.getElementById('create-news-form').style.display = 'block';
}

function hideCreateNewsForm() {
    document.getElementById('create-news-form').style.display = 'none';
    document.getElementById('news-form').reset();
    document.getElementById('news-created-at').value = '';
}

// Create news
document.getElementById('news-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const createdAtValue = document.getElementById('news-created-at').value;
    const formData = {
        title: document.getElementById('news-title').value,
        content: document.getElementById('news-content').value,
        created_at: createdAtValue ? new Date(createdAtValue).toISOString() : null
    };
    
    try {
        await apiRequest('/admin/news', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        hideCreateNewsForm();
        loadNews();
        showSuccess('News created successfully');
        
    } catch (error) {
        console.error('Failed to create news:', error);
        showError('Error creating news');
    }
});

// Delete news
window.deleteNews = async function(newsId) {
    showDeleteNewsModal(newsId);
};

// Modal for deleting news
function showDeleteNewsModal(newsId) {
    const modalHTML = `
        <div id="deleteNewsModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">🗑️ Delete News</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to delete this news?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitDeleteNews(${newsId})" style="
                        background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">🗑️ Delete</button>
                    <button onclick="closeDeleteNewsModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('deleteNewsModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDeleteNewsModal();
        }
    });
}

window.submitDeleteNews = async function(newsId) {
    try {
        await apiRequest(`/admin/news/${newsId}`, {
            method: 'DELETE'
        });
        
        loadNews();
        showSuccess('News deleted');
        
    } catch (error) {
        console.error('Failed to delete news:', error);
        showError('Error deleting news');
    } finally {
        closeDeleteNewsModal();
    }
};

window.closeDeleteNewsModal = function() {
    const modal = document.getElementById('deleteNewsModal');
    if (modal) {
        modal.remove();
    }
};

// Moderation management
async function loadModeration() {
    try {
        const moderation = await apiRequest('/admin/moderation');
        const tbody = document.getElementById('moderation-table');
        
        if (!moderation.items || moderation.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><h3>No tasks for moderation</h3></td></tr>';
            return;
        }
        
        tbody.innerHTML = moderation.items.map(item => `
            <tr>
                <td>${item.user_name}</td>
                <td>${item.task_title}</td>
                <td>
                    <button class="btn-admin btn-small" onclick="viewProof(${item.id})">View</button>
                </td>
                <td>${new Date(item.submitted_at).toLocaleDateString()}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-admin btn-small btn-success" onclick="approveTask(${item.id})">Approve</button>
                        <button class="btn-admin btn-small btn-danger" onclick="rejectTask(${item.id})">Reject</button>
                        <button class="btn-admin btn-small btn-warning" onclick="requestRevision(${item.id})">Request revision</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load moderation:', error);
        showError('Error loading moderation');
    }
}

// Moderation functions
async function viewProof(taskId) {
    try {
        const proof = await apiRequest(`/admin/moderation/${taskId}/proof`);
        showProofModal(proof);
    } catch (error) {
        console.error('Failed to load proof:', error);
        showError('Error loading proof');
    }
}

function showProofModal(proofData) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('proofModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'proofModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Proof of task completion</h3>
                    <span class="close" onclick="closeProofModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="proof-section">
                        <h4>Description     of the completed work:</h4>
                        <div class="proof-text">${proofData.proof || 'Description not provided'}</div>
                    </div>
                    
                    <div id="proofFiles" class="proof-section" style="display: none;">
                        <h4>Attached files:</h4>
                        <div class="proof-files"></div>
                    </div>
                    
                    <div id="proofLinks" class="proof-section" style="display: none;">
                        <h4>Additional links:</h4>
                        <div class="proof-links"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeProofModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Добавляем обработчик клика вне модального окна
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeProofModal();
        }
    });
    
    // Добавляем обработчик клавиши Escape
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            closeProofModal();
        }
    });
    
    // Заполняем данными
    const proofText = modal.querySelector('.proof-text');
    const proofFiles = modal.querySelector('#proofFiles');
    const proofFilesContainer = modal.querySelector('.proof-files');
    const proofLinks = modal.querySelector('#proofLinks');
    const proofLinksContainer = modal.querySelector('.proof-links');
    
    proofText.innerHTML = proofData.proof || 'Description not provided';
    
    // Отображаем файлы
    if (proofData.proof_files && proofData.proof_files.length > 0) {
        proofFiles.style.display = 'block';
        proofFilesContainer.innerHTML = proofData.proof_files.map(file => {
            const isImage = file.type && file.type.startsWith('image/');
            const fileIcon = isImage ? 'fas fa-image' : 'fas fa-file';
            
            if (isImage) {
                return `
                    <div class="proof-file">
                        <div class="file-info">
                            <i class="${fileIcon}"></i>
                            <span>${file.filename}</span>
                            <span class="file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <div class="file-preview">
                            <img src="/uploads/${file.path}" alt="${file.filename}" onclick="openImageModal('/uploads/${file.path}')">
                        </div>
                        <a href="/uploads/${file.path}" download="${file.filename}" class="btn-admin btn-small">
                            <i class="fas fa-download"></i> Download
                        </a>
                    </div>
                `;
            } else {
                return `
                    <div class="proof-file">
                        <div class="file-info">
                            <i class="${fileIcon}"></i>
                            <span>${file.filename}</span>
                            <span class="file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <a href="/uploads/${file.path}" download="${file.filename}" class="btn-admin btn-small">
                            <i class="fas fa-download"></i> Download
                        </a>
                    </div>
                `;
            }
        }).join('');
    } else {
        proofFiles.style.display = 'none';
    }
    
    // Отображаем ссылки
    if (proofData.proof_links && proofData.proof_links.length > 0) {
        proofLinks.style.display = 'block';
        proofLinksContainer.innerHTML = proofData.proof_links.map(link => `
            <div class="proof-link">
                <a href="${link}" target="_blank" class="link-item">
                    <i class="fas fa-external-link-alt"></i>
                    ${link}
                </a>
            </div>
        `).join('');
    } else {
        proofLinks.style.display = 'none';
    }
    
    // Показываем модальное окно
    modal.style.display = 'block';
}

function closeProofModal() {
    const modal = document.getElementById('proofModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function openImageModal(imageSrc) {
    let imageModal = document.getElementById('imageModal');
    if (!imageModal) {
        imageModal = document.createElement('div');
        imageModal.id = 'imageModal';
        imageModal.className = 'modal';
        imageModal.innerHTML = `
            <div class="modal-content image-modal">
                <div class="modal-header">
                    <h3>View image</h3>
                    <span class="close" onclick="closeImageModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <img id="modalImage" src="" alt="Preview" style="max-width: 100%; max-height: 70vh;">
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeImageModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(imageModal);
    }
    
    document.getElementById('modalImage').src = imageSrc;
    imageModal.style.display = 'block';
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

window.approveTask = async function(taskId) {
    showApproveTaskModal(taskId);
};

// Modal for approving task
function showApproveTaskModal(taskId) {
    const modalHTML = `
        <div id="approveTaskModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">✅ Approve Task</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to approve this task?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitApproveTask(${taskId})" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">✅ Approve</button>
                    <button onclick="closeApproveTaskModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('approveTaskModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeApproveTaskModal();
        }
    });
}

window.submitApproveTask = async function(taskId) {
    try {
        await apiRequest(`/admin/moderation/${taskId}/approve`, {
            method: 'POST'
        });
        
        loadModeration();
        loadDashboard();
        showSuccess('Task approved');
        
        // Обновляем статистику задач
        if (typeof loadTaskStats === 'function') {
            loadTaskStats();
        }
        
    } catch (error) {
        console.error('Failed to approve task:', error);
        showError('Error approving task');
    } finally {
        closeApproveTaskModal();
    }
};

window.closeApproveTaskModal = function() {
    const modal = document.getElementById('approveTaskModal');
    if (modal) {
        modal.remove();
    }
};

// Approve all submitted tasks
window.approveAllTasks = async function() {
    showApproveAllTasksModal();
};

// Modal for approving all tasks
function showApproveAllTasksModal() {
    const modalHTML = `
        <div id="approveAllTasksModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">✅ Approve All Tasks</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Подтвердить все задания, ожидающие модерации?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitApproveAllTasks()" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">✅ Approve All</button>
                    <button onclick="closeApproveAllTasksModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('approveAllTasksModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeApproveAllTasksModal();
        }
    });
}

window.submitApproveAllTasks = async function() {
    try {
        const response = await apiRequest('/admin/moderation/approve-all', {
            method: 'POST'
        });
        const approved = response && typeof response.approved === 'number' ? response.approved : 0;
        const reward = response && typeof response.total_reward === 'number' ? response.total_reward : 0;
        showSuccess(`Принято ${approved} заданий. Начислено наград: $${reward.toFixed(2)}`);
        loadModeration();
        loadDashboard();
    } catch (error) {
        console.error('Failed to approve all tasks:', error);
        showError('Ошибка массового одобрения заданий');
    } finally {
        closeApproveAllTasksModal();
    }
};

window.closeApproveAllTasksModal = function() {
    const modal = document.getElementById('approveAllTasksModal');
    if (modal) {
        modal.remove();
    }
};

window.rejectTask = async function(taskId) {
    showRejectTaskModal(taskId);
};

// Modal for rejecting task
function showRejectTaskModal(taskId) {
    const modalHTML = `
        <div id="rejectTaskModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">❌ Reject Task</h3>
                <p style="margin-bottom: 15px; opacity: 0.9;">
                    Enter reason for rejection:
                </p>
                <textarea id="rejectReason" placeholder="Reason for rejection..." style="
                    width: 100%;
                    min-height: 80px;
                    padding: 10px;
                    border: none;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-family: inherit;
                    resize: vertical;
                "></textarea>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitRejectTask(${taskId})" style="
                        background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Reject</button>
                    <button onclick="closeRejectTaskModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('rejectTaskModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeRejectTaskModal();
        }
    });
}

window.submitRejectTask = async function(taskId) {
    const reason = document.getElementById('rejectReason').value.trim();
    if (!reason) {
        showError('Please enter a reason for rejection');
        return;
    }
    
    try {
        await apiRequest(`/admin/moderation/${taskId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason })
        });
        
        loadModeration();
        showSuccess('Task rejected');
        
        // Обновляем статистику задач
        if (typeof loadTaskStats === 'function') {
            loadTaskStats();
        }
        
    } catch (error) {
        console.error('Failed to reject task:', error);
        showError('Error rejecting task');
    } finally {
        closeRejectTaskModal();
    }
};

window.closeRejectTaskModal = function() {
    const modal = document.getElementById('rejectTaskModal');
    if (modal) {
        modal.remove();
    }
};

window.requestRevision = async function(taskId) {
    showRequestRevisionModal(taskId);
};

// Modal for requesting revision
function showRequestRevisionModal(taskId) {
    const modalHTML = `
        <div id="requestRevisionModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">🔄 Request Revision</h3>
                <p style="margin-bottom: 15px; opacity: 0.9;">
                    Enter comment for revision:
                </p>
                <textarea id="revisionComment" placeholder="Comment for revision..." style="
                    width: 100%;
                    min-height: 80px;
                    padding: 10px;
                    border: none;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-family: inherit;
                    resize: vertical;
                "></textarea>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitRequestRevision(${taskId})" style="
                        background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">🔄 Send for Revision</button>
                    <button onclick="closeRequestRevisionModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('requestRevisionModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeRequestRevisionModal();
        }
    });
}

window.submitRequestRevision = async function(taskId) {
    const comment = document.getElementById('revisionComment').value.trim();
    if (!comment) {
        showError('Please enter a comment for revision');
        return;
    }
    
    try {
        await apiRequest(`/admin/moderation/${taskId}/revision`, {
            method: 'POST',
            body: JSON.stringify({ comment: comment })
        });
        
        loadModeration();
        showSuccess('Task sent for revision');
        
        // Обновляем статистику задач
        if (typeof loadTaskStats === 'function') {
            loadTaskStats();
        }
        
    } catch (error) {
        console.error('Failed to request revision:', error);
        showError('Error sending task for revision');
    } finally {
        closeRequestRevisionModal();
    }
};

window.closeRequestRevisionModal = function() {
    const modal = document.getElementById('requestRevisionModal');
    if (modal) {
        modal.remove();
    }
};

// Utility functions
window.showSuccess = function(message) {
    // Create success notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10001;
        font-weight: 500;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideInRight 0.3s ease-out;
    `;
    notification.innerHTML = `✅ ${message}`;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
    
    // Add click to dismiss
    notification.onclick = () => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    };
}

window.showError = function(message) {
    // Create error notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10001;
        font-weight: 500;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideInRight 0.3s ease-out;
    `;
    notification.innerHTML = `❌ ${message}`;
    
    document.body.appendChild(notification);
    
    // Auto remove after 7 seconds (longer for errors)
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }
    }, 7000);
    
    // Add click to dismiss
    notification.onclick = () => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    };
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Settings functions
async function loadWelcomeMessage() {
    try {
        const response = await apiRequest('/admin/settings/welcome-message');
        const textarea = document.getElementById('welcomeMessageText');
        if (textarea) {
            textarea.value = response.message || '';
        }
    } catch (error) {
        console.error('Failed to load welcome message:', error);
        showError('Error loading welcome message');
    }
}

async function updateWelcomeMessage() {
    const textarea = document.getElementById('welcomeMessageText');
    if (!textarea) return;
    
    const message = textarea.value.trim();
    if (!message) {
        showError('Message cannot be empty');
        return;
    }
    
    try {
        await apiRequest('/admin/settings/welcome-message', {
            method: 'PUT',
            body: JSON.stringify({ value: message })
        });
        
        showSuccess('Welcome message updated successfully');
    } catch (error) {
        console.error('Failed to update welcome message:', error);
        showError('Error updating welcome message');
    }
}

// Load welcome message when settings tab is opened
const originalShowTab = showTab;
showTab = function(tabName) {
    originalShowTab(tabName);
    
    if (tabName === 'settings') {
        // Load welcome message when settings tab is shown
        setTimeout(loadWelcomeMessage, 100);
        // Attach once: ensure disable-all button works even if DOM re-rendered
        if (!window.__DISABLE_ALL_WITHDRAWALS_BOUND) {
            window.__DISABLE_ALL_WITHDRAWALS_BOUND = true;
            // Expose modal open on window (button uses it)
            window.showDisableAllWithdrawalsModal = function() {
                const modalHTML = `
                    <div id="disableAllWithdrawalsModal" class="modal-overlay" style="
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.7);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 10000;
                    ">
                        <div class="modal-content" style="
                            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                            padding: 30px;
                            border-radius: 15px;
                            max-width: 480px;
                            width: 90%;
                            text-align: center;
                            color: white;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                        ">
                            <h3 style="margin-bottom: 16px; font-size: 1.25rem;">⛔ Disable all withdrawals</h3>
                            <p style="margin-bottom: 20px; opacity: 0.95;">
                                This action will disable withdrawal access for all non-admin users. Are you sure?
                            </p>
                            <div style="display: flex; gap: 12px; justify-content: center;">
                                <button onclick="window.submitDisableAllWithdrawals()" style="
                                    background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                                    color: white;
                                    border: none;
                                    padding: 12px 20px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    font-size: 1rem;
                                    font-weight: 500;
                                ">⛔ Disable</button>
                                <button onclick="window.closeDisableAllWithdrawalsModal()" style="
                                    background: rgba(255,255,255,0.2);
                                    color: white;
                                    border: none;
                                    padding: 12px 20px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    font-size: 1rem;
                                    font-weight: 500;
                                ">❌ Cancel</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                const modal = document.getElementById('disableAllWithdrawalsModal');
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        window.closeDisableAllWithdrawalsModal();
                    }
                });
            };
            window.closeDisableAllWithdrawalsModal = function() {
                const modal = document.getElementById('disableAllWithdrawalsModal');
                if (modal) modal.remove();
            };
            window.submitDisableAllWithdrawals = async function() {
                try {
                    let response = await apiRequest('/admin/withdrawals/disable-all', { 
                        method: 'POST',
                        body: JSON.stringify({})
                    });
                    // Fallback attempts if server expects different signature
                    if (!response || (!response.success && response.updated === undefined)) {
                        response = await apiRequest('/admin/withdrawals/disable-all/', { 
                            method: 'POST',
                            body: JSON.stringify({})
                        });
                    }
                    window.closeDisableAllWithdrawalsModal();
                    if (response && (response.success || response.updated !== undefined)) {
                        const updated = response.updated || 0;
                        showSuccess(`Withdrawal access disabled for ${updated} users`);
                        // Refresh users list if visible
                        const usersSection = document.getElementById('users');
                        if (usersSection && usersSection.classList.contains('active')) {
                            loadUsers();
                        }
                    } else {
                        showError('Failed to disable withdrawals for all users');
                    }
                } catch (error) {
                    console.error('Error disabling all withdrawals:', error);
                    window.closeDisableAllWithdrawalsModal();
                    showError('Error disabling all withdrawals: ' + (error && error.message ? error.message : 'Unknown error'));
                }
            };
        }
        
        // Bind enable all withdrawals functions
        if (!window.__ENABLE_ALL_WITHDRAWALS_BOUND) {
            window.__ENABLE_ALL_WITHDRAWALS_BOUND = true;
            
            window.showEnableAllWithdrawalsModal = function() {
                const modalHTML = `
                    <div id="enableAllWithdrawalsModal" class="modal-overlay" style="
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.7);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 10000;
                    ">
                        <div class="modal-content" style="
                            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                            padding: 30px;
                            border-radius: 15px;
                            max-width: 400px;
                            width: 90%;
                            text-align: center;
                            color: white;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                        ">
                            <h3 style="margin-bottom: 16px; font-size: 1.25rem;">✅ Enable all withdrawals</h3>
                            <p style="margin-bottom: 25px; opacity: 0.9;">
                                This action will enable withdrawal access for all non-admin users. Are you sure?
                            </p>
                            <button onclick="window.submitEnableAllWithdrawals()" style="
                                background: linear-gradient(135deg, #218838 0%, #1ea085 100%);
                                color: white;
                                border: none;
                                padding: 12px 24px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 1rem;
                                font-weight: 500;
                                margin-right: 10px;
                            ">✅ Enable</button>
                            <button onclick="window.closeEnableAllWithdrawalsModal()" style="
                                background: rgba(255,255,255,0.2);
                                color: white;
                                border: none;
                                padding: 12px 24px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 1rem;
                                font-weight: 500;
                            ">❌ Cancel</button>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                const modal = document.getElementById('enableAllWithdrawalsModal');
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        window.closeEnableAllWithdrawalsModal();
                    }
                });
            };
            
            window.closeEnableAllWithdrawalsModal = function() {
                const modal = document.getElementById('enableAllWithdrawalsModal');
                if (modal) modal.remove();
            };
            
            window.submitEnableAllWithdrawals = async function() {
                try {
                    let response = await apiRequest('/admin/withdrawals/enable-all', { 
                        method: 'POST',
                        body: JSON.stringify({})
                    });
                    // Fallback attempts if server expects different signature
                    if (!response || (!response.success && response.updated === undefined)) {
                        response = await apiRequest('/admin/withdrawals/enable-all/', { 
                            method: 'POST',
                            body: JSON.stringify({})
                        });
                    }
                    window.closeEnableAllWithdrawalsModal();
                    if (response && (response.success || response.updated !== undefined)) {
                        const updated = response.updated || 0;
                        showSuccess(`Withdrawal access enabled for ${updated} users`);
                        // Refresh users list if visible
                        const usersSection = document.getElementById('users');
                        if (usersSection && usersSection.classList.contains('active')) {
                            loadUsers();
                        }
                    } else {
                        showError('Failed to enable withdrawals for all users');
                    }
                } catch (error) {
                    console.error('Error enabling all withdrawals:', error);
                    window.closeEnableAllWithdrawalsModal();
                    showError('Error enabling all withdrawals: ' + (error && error.message ? error.message : 'Unknown error'));
                }
            };
        }
    } else if (tabName === 'chat') {
        // Load chat conversations when chat tab is shown
        setTimeout(loadChatConversations, 100);
    }
};

// Global variables for chat
let adminLastReadTimestamps = {};


// Load chat conversations
async function loadChatConversations() {
    try {
        const response = await apiRequest('/admin/chat/conversations');
        displayConversations(response.conversations);
        // Initialize chat input after loading
        initializeAdminChatInput();
        // Start checking for unread messages
        startAdminUnreadCheck();
    } catch (error) {
        console.error('Failed to load conversations:', error);
        showError('Error loading conversations');
    }
}

// Display conversations list
function displayConversations(conversations) {
    const container = document.getElementById('conversationsList');
    if (!container) return;
    
    if (conversations.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.6; padding: 20px;">No conversations yet</p>';
        return;
    }
    
    container.innerHTML = conversations.map(conv => `
        <div class="conversation-item" data-user-id="${conv.user_id}" onclick="selectConversation(${conv.user_id}, '${conv.user_name}', event)">
            <div class="user-name">${conv.user_name}</div>
            <div class="last-message">${conv.user_email}</div>
            <div class="last-message">
                📅 ${new Date(conv.last_message_time).toLocaleString()}
            </div>
            <div class="last-message">
                💬 ${conv.message_count} messages
            </div>
            <span class="conversation-badge" data-user-id="${conv.user_id}" style="display: none;">0</span>
        </div>
    `).join('');
}

// Select conversation
async function selectConversation(userId, userName, event) {
    // Stop polling for previous conversation
    stopAdminChatPolling();
    
    // Clear messages area immediately
    const messagesArea = document.getElementById('chatMessagesArea');
    if (messagesArea) {
        messagesArea.innerHTML = '<p class="no-messages-placeholder">Loading messages...</p>';
    }
    
    // Reset message count for new conversation
    lastMessageCount = 0;
    
    selectedUserId = userId;
    selectedUserName = userName;
    
    // Mark conversation as read
    markAdminConversationAsRead(userId);
    
    // Update header
    document.getElementById('chatHeader').textContent = `💬 Conversation with ${userName}`;
    
    // Show send message area
    document.getElementById('sendMessageArea').style.display = 'flex';
    
    // Load messages for this user
    await loadChatMessages(userId);
    
    // Start real-time updates for this conversation
    startAdminChatPolling();
    
    // Highlight selected conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Find and highlight the selected conversation item using data attribute
    const conversationItems = document.querySelectorAll('.conversation-item');
    for (let item of conversationItems) {
        const itemUserId = item.getAttribute('data-user-id');
        if (itemUserId && parseInt(itemUserId) === userId) {
            item.classList.add('selected');
            break;
        }
    }
}

// Load chat messages for specific user
async function loadChatMessages(userId) {
    try {
        const response = await apiRequest(`/admin/chat/messages/${userId}?limit=150`);
        displayChatMessages(response.messages);
    } catch (error) {
        console.error('Failed to load chat messages:', error);
        showError('Error loading messages');
    }
}

// Display chat messages
function displayChatMessages(messages) {
    const container = document.getElementById('chatMessagesArea');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<p class="no-messages-placeholder">No messages yet</p>';
        lastMessageCount = 0;
        return;
    }
    
    // Server already limits to 150; ensure at most 150 here and reverse to show oldest first
    const limitedMessages = messages.slice(-150).reverse();
    
    // Always update display when switching conversations (lastMessageCount was reset to 0)
    // Only skip update if we're in the same conversation and message count hasn't changed
    if (lastMessageCount > 0 && limitedMessages.length === lastMessageCount) {
        return;
    }
    
    // Preserve scroll position
    const prevBottomDistance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const wasAtBottom = prevBottomDistance < 20;
    
    // Clear and update the display
    container.innerHTML = '';
    
    limitedMessages.forEach(message => {
        const messageDiv = document.createElement('div');
        
        // Determine if this is the current admin's message
        const isCurrentAdminMessage = currentUser && message.sender_id === currentUser.id;
        const isUserMessage = !message.is_admin;
        
        // Set message class based on sender
        if (isCurrentAdminMessage) {
            messageDiv.className = 'chat-message current-user-message';
        } else if (isUserMessage) {
            messageDiv.className = 'chat-message other-user-message';
        } else {
            messageDiv.className = 'chat-message admin-message';
        }
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const sender = message.is_admin ? 'Support' : (message.sender_name || 'User');
        
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
        
        container.appendChild(messageDiv);
    });
    
    // Restore scroll: keep position unless at bottom or first load
    if (lastMessageCount === 0 || wasAtBottom) {
        container.scrollTop = container.scrollHeight;
    } else {
        const newBottom = Math.max(0, container.scrollHeight - container.clientHeight - prevBottomDistance);
        container.scrollTop = newBottom;
    }
    
    // Ensure the last message is visible
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 100);
    
    lastMessageCount = limitedMessages.length;
}

// Send admin message
async function sendAdminMessage() {
    if (!selectedUserId) {
        return; // Silent fail - no notification
    }
    
    const input = document.getElementById('adminMessageInput');
    const message = input.value.trim();
    
    if (!message) {
        return; // Silent fail - no notification
    }
    
    try {
        
        
        const response = await apiRequest('/admin/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                message: message,
                chat_type: 'support',
                recipient_id: selectedUserId
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        //console.log('Admin message sent successfully:', response);
        
        input.value = '';
        // Reset message count to force refresh
        lastMessageCount = 0;
        // Refresh messages immediately after sending
        await loadChatMessages(selectedUserId);
        // No success notification
    } catch (error) {
        console.error('Failed to send admin message:', error);
        // No error notification - silent fail
    }
}

// Handle Enter key in message input - moved to chat loading
function initializeAdminChatInput() {
    const input = document.getElementById('adminMessageInput');
    if (input) {
        // Remove existing listener to prevent duplicates
        input.removeEventListener('keypress', handleAdminMessageKeypress);
        input.addEventListener('keypress', handleAdminMessageKeypress);
    }
}

function handleAdminMessageKeypress(e) {
    if (e.key === 'Enter') {
        sendAdminMessage();
    }
}

// NEW: Start real-time chat polling for admin
function startAdminChatPolling() {
    // Clear any existing polling
    stopAdminChatPolling();
    
    // Start new polling every 3 seconds
    adminChatPollingInterval = setInterval(() => {
        // Only poll if admin is logged in and a conversation is selected
        if (currentUser && selectedUserId) {
            loadChatMessages(selectedUserId);
        }
    }, 3000);
}

// Stop real-time chat polling for admin
function stopAdminChatPolling() {
    if (adminChatPollingInterval) {
        clearInterval(adminChatPollingInterval);
        adminChatPollingInterval = null;
    }
}

// Escape HTML to prevent XSS
window.escapeHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Secret Key Modal Functions
function showSecretKeyModal() {
    document.getElementById('secretKeyModal').style.display = 'block';
    document.getElementById('secretKeyInput').focus();
}

function closeSecretKeyModal() {
    document.getElementById('secretKeyModal').style.display = 'none';
    document.getElementById('secretKeyInput').value = '';
}

function handleSecretKeyKeypress(event) {
    if (event.key === 'Enter') {
        submitSecretKey();
    } else if (event.key === 'Escape') {
        closeSecretKeyModal();
    }
}

async function submitSecretKey() {
    const secretKey = document.getElementById('secretKeyInput').value.trim();
    
    if (!secretKey) {
        showError('Please enter the secret key');
        return;
    }
    
    try {
        const response = await fetch('/admin/access/secret-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ secret_key: secretKey })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Store the new token
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Update current user and token
            currentToken = data.access_token;
            currentUser = data.user;
            
            // Close modal and show success
            closeSecretKeyModal();
            showSuccess('Admin panel access granted! You can now use all functions.');
            
            // Reload the page to refresh the admin panel
            window.location.reload();
            
        } else {
            const errorData = await response.json();
            showError(`Error: ${errorData.detail || 'Invalid secret key'}`);
        }
        
    } catch (error) {
        console.error('Error submitting secret key:', error);
        showError('Error sending secret key');
    }
}

// Check admin access status
async function checkAdminAccess() {
    try {
        const response = await apiRequest('/admin/access/check');
        return response.is_admin;
    } catch (error) {
        console.error('Error checking admin access:', error);
        return false;
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('secretKeyModal');
    if (event.target === modal) {
        closeSecretKeyModal();
    }
}

// Withdrawal Requests Functions
window.loadWithdrawals = async function() {
    console.log('loadWithdrawals called');
    
    try {
        console.log('Sending GET request to /admin/withdrawals');
        const response = await apiRequest('/admin/withdrawals');
        
        console.log('Load withdrawals response:', response);
        
        if (response.success) {
            // Store for search
            window.__ADMIN_WITHDRAWALS = response.withdrawals || [];
            console.log('Stored withdrawals:', window.__ADMIN_WITHDRAWALS);
            displayWithdrawals(window.__ADMIN_WITHDRAWALS);
            updateWithdrawalStats(response.stats);
        } else {
            showError('Failed to load withdrawal requests');
        }
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        showError('Error loading withdrawal requests: ' + error.message);
    }
}

window.displayWithdrawals = function(withdrawals) {
    console.log('displayWithdrawals called with:', withdrawals);
    
    const tableBody = document.getElementById('withdrawals-table');
    console.log('Table body element:', tableBody);
    
    if (!withdrawals || withdrawals.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="loading">No withdrawal requests</td></tr>';
        return;
    }
    
    const html = withdrawals.map(withdrawal => {
        console.log('Processing withdrawal:', withdrawal);
        return `
        <tr>
            <td>${escapeHtml( withdrawal.user_email)}</td>
            <td>${escapeHtml( withdrawal.user_tg)}</td>
            <td>${escapeHtml(withdrawal.network_coin)}</td>
            <td>$${withdrawal.amount.toFixed(2)}</td>
            <td>
                <div class="wallet-address" title="${escapeHtml(withdrawal.wallet_address)}">
                    ${escapeHtml(withdrawal.wallet_address)}
                </div>
            </td>
            <td>${new Date(withdrawal.created_at).toLocaleString()}</td>
            <td>
                <span class="withdrawal-status ${withdrawal.status}">
                    ${withdrawal.status === 'pending' ? 'Pending' : 'Completed'}
                </span>
            </td>
            <td>
                <div class="withdrawal-actions">
                    ${withdrawal.status === 'pending' ? 
                        `<button class="btn-complete" onclick="completeWithdrawal(${withdrawal.id})" title="Mark as completed">
                            ✅ Completed
                        </button>` : ''
                    }
                    <button class="btn-delete" onclick="deleteWithdrawal(${withdrawal.id})" title="Delete request">
                        🗑️ Delete
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
    
    console.log('Generated HTML:', html);
    tableBody.innerHTML = html;
}

// Handle withdrawal search by user email
function handleWithdrawalSearch() {
    const input = document.getElementById('withdrawal-search-input');
    const query = (input.value || '').toLowerCase().trim();
    const all = Array.isArray(window.__ADMIN_WITHDRAWALS) ? window.__ADMIN_WITHDRAWALS : [];
    const filtered = query
        ? all.filter(w => (w.user_email || '').toLowerCase().includes(query))
        : all;
    displayWithdrawals(filtered);
}

// Reset withdrawal search
function resetWithdrawalSearch() {
    const input = document.getElementById('withdrawal-search-input');
    if (input) {
        input.value = '';
        handleWithdrawalSearch(); // This will show all withdrawals
    }
}

window.updateWithdrawalStats = function(stats) {
    document.getElementById('totalWithdrawals').textContent = stats.total || 0;
    document.getElementById('pendingWithdrawals').textContent = stats.pending || 0;
    document.getElementById('totalAmount').textContent = `$${(stats.total_amount || 0).toFixed(2)}`;
}

// Make functions globally available
window.deleteWithdrawal = async function(withdrawalId) {
    console.log('🗑️ deleteWithdrawal called with ID:', withdrawalId);
    
    // Show confirmation modal
    showDeleteWithdrawalModal(withdrawalId);
};

// Modal for deleting withdrawal
function showDeleteWithdrawalModal(withdrawalId) {
    // Create modal HTML
    const modalHTML = `
        <div id="deleteWithdrawalModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">🗑️ Delete Withdrawal</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to delete this withdrawal request? This action cannot be undone.
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitDeleteWithdrawal(${withdrawalId})" style="
                        background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">🗑️ Delete</button>
                    <button onclick="closeDeleteWithdrawalModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add click outside to close
    const modal = document.getElementById('deleteWithdrawalModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDeleteWithdrawalModal();
        }
    });
}

// Submit deletion
window.submitDeleteWithdrawal = async function(withdrawalId) {
    try {
        console.log('Sending DELETE request to:', `/admin/withdrawals/${withdrawalId}`);
        const response = await apiRequest(`/admin/withdrawals/${withdrawalId}`, {
            method: 'DELETE'
        });
        
        console.log('Delete response:', response);
        
        if (response.success) {
            showSuccess('Withdrawal request deleted');
            loadWithdrawals(); // Reload the list
        } else {
            showError(response.message || 'Failed to delete withdrawal request');
        }
    } catch (error) {
        console.error('Error deleting withdrawal:', error);
        showError('Error deleting withdrawal request: ' + error.message);
    } finally {
        closeDeleteWithdrawalModal();
    }
};

// Close modal
window.closeDeleteWithdrawalModal = function() {
    const modal = document.getElementById('deleteWithdrawalModal');
    if (modal) {
        modal.remove();
    }
};

window.completeWithdrawal = async function(withdrawalId) {
    console.log('✅ completeWithdrawal called with ID:', withdrawalId);
    
    // Show confirmation modal
    showCompleteWithdrawalModal(withdrawalId);
};

// Modal for completing withdrawal
function showCompleteWithdrawalModal(withdrawalId) {
    // Create modal HTML
    const modalHTML = `
        <div id="completeWithdrawalModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">✅ Complete Withdrawal</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to mark this withdrawal request as completed?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitCompleteWithdrawal(${withdrawalId})" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">✅ Complete</button>
                    <button onclick="closeCompleteWithdrawalModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add click outside to close
    const modal = document.getElementById('completeWithdrawalModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeCompleteWithdrawalModal();
        }
    });
}

// Submit completion
window.submitCompleteWithdrawal = async function(withdrawalId) {
    try {
        console.log('Sending POST request to:', `/admin/withdrawals/${withdrawalId}/complete`);
        const response = await apiRequest(`/admin/withdrawals/${withdrawalId}/complete`, {
            method: 'POST'
        });
        
        console.log('Complete response:', response);
        
        if (response.success) {
            showSuccess('Withdrawal request marked as completed');
            loadWithdrawals(); // Reload the list
        } else {
            showError(response.message || 'Failed to complete withdrawal request');
        }
    } catch (error) {
        console.error('Error completing withdrawal:', error);
        showError('Error completing withdrawal request: ' + error.message);
    } finally {
        closeCompleteWithdrawalModal();
    }
};

// Close modal
window.closeCompleteWithdrawalModal = function() {
    const modal = document.getElementById('completeWithdrawalModal');
    if (modal) {
        modal.remove();
    }
};

// Initialize withdrawal filters
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for withdrawal filters
    const filterButtons = document.querySelectorAll('.withdrawal-filters .filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            // Load withdrawals with filter
            const filter = this.dataset.filter;
            loadWithdrawalsWithFilter(filter);
        });
    });
});

async function loadWithdrawalsWithFilter(filter) {
    try {
        const response = await apiRequest(`/admin/withdrawals?filter=${filter}`);
        
        if (response.success) {
            displayWithdrawals(response.withdrawals);
            updateWithdrawalStats(response.stats);
        } else {
            showError('Failed to load withdrawal requests');
        }
    } catch (error) {
        console.error('Error loading withdrawals with filter:', error);
        showError('Error loading withdrawal requests');
    }
}

// File Upload for Chat Messages functionality
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener for file upload form
    const fileUploadForm = document.getElementById('file-upload-form');
    if (fileUploadForm) {
        fileUploadForm.addEventListener('submit', handleFileUpload);
    }
});

async function handleFileUpload(event) {
    event.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('chat-file');
    const chatTypeSelect = document.getElementById('chat-type');
    const minIntervalInput = document.getElementById('min-interval');
    const maxIntervalInput = document.getElementById('max-interval');
    
    // Validate file
    if (!fileInput.files[0]) {
        showError('Please select a file');
        return;
    }
    
    const file = fileInput.files[0];
    if (!file.name.endsWith('.txt')) {
        showError('Please select a TXT file');
        return;
    }
    
    // Validate intervals
    const minInterval = parseInt(minIntervalInput.value);
    const maxInterval = parseInt(maxIntervalInput.value);
    
    if (minInterval >= maxInterval) {
        showError('Minimum interval must be less than maximum');
        return;
    }
    
    // Prepare form data
    formData.append('file', file);
    formData.append('chat_type', chatTypeSelect.value);
    formData.append('min_interval', minInterval);
    formData.append('max_interval', maxInterval);
    
    try {
        // Show loading state
        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.textContent = '⏳ Loading...';
        submitButton.disabled = true;
        
        // Upload file and schedule messages
        const response = await apiRequest('/admin/upload-chat-messages', {
            method: 'POST',
            body: formData
        });
        
        // Show success message
        showSuccess('File uploaded and messages scheduled!');
        
        // Display upload status
        displayUploadStatus(response, file);
        
        // Preview messages
        await previewMessages(file);
        
    } catch (error) {
        console.error('Error uploading file:', error);
        showError('Error uploading file: ' + error.message);
    } finally {
        // Reset button
        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.textContent = '🚀 Start sending messages';
        submitButton.disabled = false;
    }
}

function displayUploadStatus(response, file) {
    const statusSection = document.getElementById('upload-status');
    const uploadInfo = document.getElementById('upload-info');
    
    // Update status information
    document.getElementById('uploaded-filename').textContent = file.name;
    document.getElementById('messages-count').textContent = response.messages_count;
    document.getElementById('chat-type-display').textContent = response.chat_type;
    document.getElementById('interval-display').textContent = response.interval_range;
    document.getElementById('sending-status').textContent = '✅ Messages scheduled';
    document.getElementById('sending-status').style.color = '#00d4aa';
    
    // Show status section
    statusSection.style.display = 'block';
}

async function previewMessages(file) {
    try {
        const fileReader = new FileReader();
        
        fileReader.onload = function(e) {
            const content = e.target.result;
            const lines = content.split('\n');
            const messages = [];
            
            // Parse first 5 messages
            for (let i = 0; i < Math.min(5, lines.length); i++) {
                const line = lines[i].trim();
                if (line && line.includes(':')) {
                    const parts = line.split(':', 2);
                    if (parts.length === 2) {
                        const name = parts[0].trim();
                        const message = parts[1].trim();
                        if (name && message) {
                            messages.push({ name, message });
                        }
                    }
                }
            }
            
            // Display preview
            const previewContainer = document.getElementById('preview-messages');
            if (messages.length > 0) {
                const previewHTML = messages.map(msg => 
                    `<div style="margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 5px;">
                        <strong style="color: #00d4aa;">${msg.name}:</strong> ${msg.message}
                    </div>`
                ).join('');
                previewContainer.innerHTML = previewHTML;
            } else {
                previewContainer.innerHTML = '<p style="color: rgba(255,255,255,0.6);">No messages for preview</p>';
            }
        };
        
        fileReader.readAsText(file);
        
    } catch (error) {
        console.error('Error previewing messages:', error);
        document.getElementById('preview-messages').innerHTML = 
                '<p style="color: #ff6b6b;">Error previewing messages</p>';
    }
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

// Verification management
async function loadVerificationRequests() {
    try {
        // Debug
        const response = await apiRequest('/admin/verification/requests');
        // Debug
        
        const tbody = document.getElementById('verification-table');
        if (!tbody) {
            console.error('❌ verification-table element not found!');
            showError('Error: table element not found');
            return;
        }
        
        if (!response.requests || response.requests.length === 0) {
            // Debug
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><h3>No verification requests</h3><p>Verification requests will appear here</p></td></tr>';
            updateVerificationStats({ requests: [] });
            return;
        }
        
        // Debug
        
        tbody.innerHTML = response.requests.map(request => `
            <tr>
                <td>
                    <div class="user-info">
                        <strong>${request.user_name || 'Unknown user'}</strong><br>
                        <small>${request.user_email || 'No email'}</small>
                    </div>
                </td>
                <td>${request.full_name || 'Not specified'}</td>
                <td>${request.date_of_birth || 'Not specified'}</td>
                <td>${request.passport_number || 'Not specified'}</td>
                <td>${request.phone_number || 'Not specified'}</td>
                <td>${request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : 'Not specified'}</td>
                <td>
                    <span class="verification-status ${request.status || 'unknown'}">${request.status || 'unknown'}</span>
                </td>
                <td>
                    <div class="verification-actions">
                        <button class="btn-view" onclick="viewVerificationDetails(${request.id})">👁️ View</button>
                        ${request.status === 'pending' ? `
                            <button class="btn-approve" onclick="approveVerification(${request.id})">✅ Approve</button>
                            <button class="btn-reject" onclick="rejectVerification(${request.id})">❌ Reject</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
        
        updateVerificationStats(response);
        // Debug
        
    } catch (error) {
        console.error('❌ Error loading verification requests:', error);
        
        // Показываем более подробную информацию об ошибке
        let errorMessage = 'Error loading verification requests';
        if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        
        showError(errorMessage);
        
        // Показываем сообщение в таблице
        const tbody = document.getElementById('verification-table');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="error-state">
                        <h3>❌ Error loading</h3>
                        <p>Failed to load verification requests</p>
                        <p><small>${error.message || 'Unknown error'}</small></p>
                        <button onclick="loadVerificationRequests()" class="btn-retry">🔄 Retry</button>
                    </td>
                </tr>
            `;
        }
    }
}

function updateVerificationStats(data) {
    const requests = data.requests || [];
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'pending').length;
    const approved = requests.filter(r => r.status === 'approved').length;
    const rejected = requests.filter(r => r.status === 'rejected').length;
    
    document.getElementById('totalVerifications').textContent = total;
    document.getElementById('pendingVerifications').textContent = pending;
    document.getElementById('approvedVerifications').textContent = approved;
    document.getElementById('rejectedVerifications').textContent = rejected;
}

async function viewVerificationDetails(requestId) {
    try {
        const response = await apiRequest('/admin/verification/requests');
        const request = response.requests.find(r => r.id === requestId);
        
        if (!request) {
            showError('Verification request not found');
            return;
        }
        
        // Создаем модальное окно для отображения деталей
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background-color: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #333;">Verification Details</h3>
                <button onclick="this.closest('.modal').remove()" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">&times;</button>
            </div>
            
            <div style="line-height: 1.6;">
                <p><strong>User:</strong> ${request.user_name} (${request.user_email})</p>
                <p><strong>Full name:</strong> ${request.full_name}</p>
                <p><strong>Date of birth:</strong> ${request.date_of_birth}</p>
                <p><strong>Document number:</strong> ${request.passport_number}</p>
                <p><strong>Document issue date:</strong> ${request.passport_issue_date}</p>
                <p><strong>Country:</strong> ${request.passport_issuer}</p>
                <p><strong>Address:</strong> ${request.address}</p>
                <p><strong>Phone:</strong> ${request.phone_number}</p>
                <p><strong>Status:</strong> <span style="
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: bold;
                    ${request.status === 'approved' ? 'background-color: #d4edda; color: #155724;' : 
                      request.status === 'rejected' ? 'background-color: #f8d7da; color: #721c24;' : 
                      'background-color: #fff3cd; color: #856404;'}
                ">${request.status}</span></p>
                <p><strong>Date submitted:</strong> ${new Date(request.submitted_at).toLocaleString()}</p>
                ${request.reviewed_at ? `<p><strong>Date reviewed:</strong> ${new Date(request.reviewed_at).toLocaleString()}</p>` : ''}
                ${request.admin_comment ? `<p><strong>Admin comment:</strong> ${request.admin_comment}</p>` : ''}
                ${request.document_front ? `<p><strong>Document (front side):</strong> <a href="${request.document_front}" target="_blank" style="color: #007bff; text-decoration: none;">View</a></p>` : ''}
                ${request.document_back ? `<p><strong>Document (back side):</strong> <a href="${request.document_back}" target="_blank" style="color: #007bff; text-decoration: none;">View</a></p>` : ''}
                ${request.selfie_with_document ? `<p><strong>Selfie with document:</strong> <a href="${request.selfie_with_document}" target="_blank" style="color: #007bff; text-decoration: none;">View</a></p>` : ''}
            </div>
            
            <div style="margin-top: 20px; text-align: center;">
                <button onclick="this.closest('.modal').remove()" style="
                    background-color: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Close</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Закрытие по клику вне модального окна
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (error) {
        console.error('Failed to view verification details:', error);
        showError('Error viewing verification details');
    }
}

window.approveVerification = async function(requestId) {
    showApproveVerificationModal(requestId);
};

// Modal for approving verification
function showApproveVerificationModal(requestId) {
    const modalHTML = `
        <div id="approveVerificationModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">✅ Approve Verification</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Are you sure you want to approve this user verification?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitApproveVerification(${requestId})" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">✅ Approve</button>
                    <button onclick="closeApproveVerificationModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('approveVerificationModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeApproveVerificationModal();
        }
    });
}

window.submitApproveVerification = async function(requestId) {
    try {
        await apiRequest(`/admin/verification/${requestId}/review`, {
            method: 'POST',
            body: JSON.stringify({
                status: 'approved',
                admin_comment: 'Verification approved'
            })
        });
        
        loadVerificationRequests();
        showSuccess('Verification approved');
        
    } catch (error) {
        console.error('Failed to approve verification:', error);
        showError('Error approving verification');
    } finally {
        closeApproveVerificationModal();
    }
};

window.closeApproveVerificationModal = function() {
    const modal = document.getElementById('approveVerificationModal');
    if (modal) {
        modal.remove();
    }
};

// Approve all pending verifications
window.approveAllVerifications = async function() {
    showApproveAllVerificationsModal();
};

// Modal for approving all verifications
function showApproveAllVerificationsModal() {
    const modalHTML = `
        <div id="approveAllVerificationsModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">✅ Approve All Verifications</h3>
                <p style="margin-bottom: 25px; opacity: 0.9;">
                    Одобрить все запросы на верификацию в статусе pending?
                </p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitApproveAllVerifications()" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">✅ Approve All</button>
                    <button onclick="closeApproveAllVerificationsModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('approveAllVerificationsModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeApproveAllVerificationsModal();
        }
    });
}

window.submitApproveAllVerifications = async function() {
    try {
        const response = await apiRequest(`/admin/verification/approve-all`, {
            method: 'POST'
        });
        const approved = response && typeof response.approved === 'number' ? response.approved : 0;
        showSuccess(`Одобрено верификаций: ${approved}`);
        loadVerificationRequests();
        loadUsers();
    } catch (error) {
        console.error('Failed to approve all verifications:', error);
        showError('Ошибка массового одобрения верификаций');
    } finally {
        closeApproveAllVerificationsModal();
    }
};

window.closeApproveAllVerificationsModal = function() {
    const modal = document.getElementById('approveAllVerificationsModal');
    if (modal) {
        modal.remove();
    }
};

window.rejectVerification = async function(requestId) {
    showRejectVerificationModal(requestId);
};

// Modal for rejecting verification
function showRejectVerificationModal(requestId) {
    const modalHTML = `
        <div id="rejectVerificationModal" class="modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                padding: 30px;
                border-radius: 15px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-bottom: 20px; font-size: 1.3rem;">❌ Reject Verification</h3>
                <p style="margin-bottom: 15px; opacity: 0.9;">
                    Enter the reason for rejecting the verification:
                </p>
                <textarea id="rejectVerificationReason" placeholder="Reason for rejection..." style="
                    width: 100%;
                    min-height: 80px;
                    padding: 10px;
                    border: none;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-family: inherit;
                    resize: vertical;
                "></textarea>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="submitRejectVerification(${requestId})" style="
                        background: linear-gradient(135deg, #ff5252 0%, #d63031 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Reject</button>
                    <button onclick="closeRejectVerificationModal()" style="
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 500;
                    ">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('rejectVerificationModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeRejectVerificationModal();
        }
    });
}

window.submitRejectVerification = async function(requestId) {
    const comment = document.getElementById('rejectVerificationReason').value.trim();
    if (!comment) {
        showError('Please enter a reason for rejection');
        return;
    }
    
    try {
        await apiRequest(`/admin/verification/${requestId}/review`, {
            method: 'POST',
            body: JSON.stringify({
                status: 'rejected',
                admin_comment: comment
            })
        });
        
        loadVerificationRequests();
        showSuccess('Verification rejected');
        
    } catch (error) {
        console.error('Failed to reject verification:', error);
        showError('Error rejecting verification');
    } finally {
        closeRejectVerificationModal();
    }
};

window.closeRejectVerificationModal = function() {
    const modal = document.getElementById('rejectVerificationModal');
    if (modal) {
        modal.remove();
    }
};

// Add event listeners for verification filters
document.addEventListener('DOMContentLoaded', function() {
    const verificationFilters = document.querySelectorAll('.verification-filters .filter-btn');
    verificationFilters.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            verificationFilters.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            // Load verification requests with filter
            const filter = this.getAttribute('data-filter');
            loadVerificationRequestsWithFilter(filter);
        });
    });
    
    // Initialize admin chat notification system
    startAdminUnreadCheck();
});

async function loadVerificationRequestsWithFilter(filter) {
    try {
        const response = await apiRequest(`/admin/verification/requests?status=${filter}`);
        const tbody = document.getElementById('verification-table');
        
        if (!response.requests || response.requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><h3>No verification requests</h3></td></tr>';
            updateVerificationStats({ requests: [] });
            return;
        }
        
        tbody.innerHTML = response.requests.map(request => `
            <tr>
                <td>
                    <div class="user-info">
                        <strong>${request.user_name}</strong><br>
                        <small>${request.user_email}</small>
                    </div>
                </td>
                <td>${request.full_name}</td>
                <td>${request.date_of_birth}</td>
                <td>${request.passport_number}</td>
                <td>${request.phone_number}</td>
                <td>${new Date(request.submitted_at).toLocaleDateString()}</td>
                <td>
                    <span class="verification-status ${request.status}">${request.status}</span>
                </td>
                <td>
                    <div class="verification-actions">
                        <button class="btn-view" onclick="viewVerificationDetails(${request.id})">👁️ View</button>
                        ${request.status === 'pending' ? `
                            <button class="btn-approve" onclick="approveVerification(${request.id})">✅ Approve</button>
                            <button class="btn-reject" onclick="rejectVerification(${request.id})">❌ Reject</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
        
        updateVerificationStats(response);
        
    } catch (error) {
        console.error('Failed to load verification requests with filter:', error);
        showError('Error loading verification requests with filter');
    }
}

// Admin Chat Notification System
function startAdminUnreadCheck() {
    // Check for unread messages every 10 seconds
    setInterval(checkAdminUnreadMessages, 10000);
}

async function checkAdminUnreadMessages() {
    try {
        const response = await apiRequest('/admin/chat/unread-counts');
        updateAdminUnreadCounts(response.unread_counts);
    } catch (error) {
        console.error('Failed to check unread messages:', error);
    }
}

function updateAdminUnreadCounts(unreadCounts) {
    // Only update if there are actual changes to prevent flickering
    const hasChanges = JSON.stringify(adminUnreadCounts) !== JSON.stringify(unreadCounts);
    if (!hasChanges) return;
    
    adminUnreadCounts = unreadCounts;
    
    // Update main chat badge
    const mainBadge = document.getElementById('adminChatBadge');
    const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    
    if (mainBadge) {
        if (totalUnread > 0) {
            mainBadge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
            mainBadge.style.display = 'inline-block';
            // Add animation class
            setTimeout(() => mainBadge.classList.add('show'), 10);
        } else {
            mainBadge.classList.remove('show');
            setTimeout(() => {
                if (mainBadge.classList.contains('show')) return;
                mainBadge.style.display = 'none';
            }, 300);
        }
    }
    
    // Update conversation badges
    Object.keys(unreadCounts).forEach(userId => {
        const badge = document.querySelector(`.conversation-badge[data-user-id="${userId}"]`);
        if (badge) {
            const count = unreadCounts[userId];
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : String(count);
                badge.style.display = 'inline-block';
                // Add animation class
                setTimeout(() => badge.classList.add('show'), 10);
            } else {
                badge.classList.remove('show');
                setTimeout(() => {
                    if (badge.classList.contains('show')) return;
                    badge.style.display = 'none';
                }, 300);
            }
        }
    });
}

// Mark messages as read when conversation is selected
function markAdminConversationAsRead(userId) {
    // Clear unread count for this user
    adminUnreadCounts[userId] = 0;
    
    // Update badges immediately for smooth UX
    const badge = document.querySelector(`.conversation-badge[data-user-id="${userId}"]`);
    if (badge) {
        badge.classList.remove('show');
        setTimeout(() => {
            if (badge.classList.contains('show')) return;
            badge.style.display = 'none';
        }, 300);
    }
    
    // Update main badge
    const mainBadge = document.getElementById('adminChatBadge');
    const totalUnread = Object.values(adminUnreadCounts).reduce((sum, count) => sum + count, 0);
    
    if (mainBadge) {
        if (totalUnread > 0) {
            mainBadge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
            mainBadge.style.display = 'inline-block';
            // Add animation class
            setTimeout(() => mainBadge.classList.add('show'), 10);
        } else {
            mainBadge.classList.remove('show');
            setTimeout(() => {
                if (mainBadge.classList.contains('show')) return;
                mainBadge.style.display = 'none';
            }, 300);
        }
    }
    
    // Send request to server to mark as read (non-blocking)
    apiRequest(`/admin/chat/mark-read/${userId}`, { method: 'POST' }).catch(() => {});
}
