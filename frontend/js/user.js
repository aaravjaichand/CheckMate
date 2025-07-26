// User management and authentication utilities

// Load user data and update UI
async function loadUserData() {
    try {
        console.log('Checking authentication...');
        
        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('gradeflow_token');
        
        console.log('Auth data check:', {
            hasUser: !!userData,
            hasToken: !!token,
            currentPage: window.location.pathname
        });
        
        if (!userData || !token) {
            console.log('No authentication found, redirecting to login');
            window.location.href = '/pages/login.html';
            return null;
        }

        const user = JSON.parse(userData);
        console.log('User authenticated:', user.name);
        
        // Update user name in UI
        const userNameElement = document.getElementById('user-name');
        if (userNameElement && user.name) {
            userNameElement.textContent = user.name;
        }

        // Update user name in liquid glass effect
        const userNameLiquidElements = document.querySelectorAll('.user-name-liquid');
        userNameLiquidElements.forEach(element => {
            if (user.name) {
                element.textContent = user.name;
            }
        });

        return user;
    } catch (error) {
        console.error('Error loading user data:', error);
        // Clear corrupted data and redirect to login
        localStorage.removeItem('user');
        localStorage.removeItem('gradeflow_token');
        window.location.href = '/pages/login.html';
        return null;
    }
}

// Get authorization header with token
function getAuthHeader() {
    const token = localStorage.getItem('gradeflow_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Make authenticated API request
async function authenticatedFetch(url, options = {}) {
    const authHeaders = getAuthHeader();
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...options.headers
        }
    });

    // If unauthorized, redirect to login
    if (response.status === 401) {
        localStorage.removeItem('user');
        localStorage.removeItem('gradeflow_token');
        window.location.href = '/pages/login.html';
        return null;
    }

    return response;
}

// Firebase auth state management

// Clear all authentication data
function clearAuthData() {
    console.log('Clearing all authentication data...');
    localStorage.removeItem('user');
    localStorage.removeItem('gradeflow_token');
    // Also clear any old token that might still exist
    localStorage.removeItem('token');
}

// Logout function
function logout() {
    clearAuthData();
    window.location.href = '/pages/login.html';
}

// Emergency auth reset function (can be called from console)
window.resetAuth = function() {
    console.log('Emergency auth reset triggered');
    clearAuthData();
    window.location.href = '/pages/login.html';
};

// Initialize user data on page load
document.addEventListener('DOMContentLoaded', () => {
    // Skip user loading on login page and dashboard page (dashboard.js handles its own auth)
    if (window.location.pathname.includes('/login.html') || 
        window.location.pathname.includes('/dashboard.html')) {
        console.log('On login or dashboard page, skipping auth check');
        return;
    }
    
    console.log('Initializing authentication check');
    loadUserData();
});