// User management and authentication utilities

// Load user data and update UI
function loadUserData() {
    try {
        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        if (!userData || !token) {
            // Redirect to login if no user data
            window.location.href = '/pages/login.html';
            return null;
        }

        const user = JSON.parse(userData);
        
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
        localStorage.removeItem('token');
        window.location.href = '/pages/login.html';
        return null;
    }
}

// Get authorization header with token
function getAuthHeader() {
    const token = localStorage.getItem('token');
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
        localStorage.removeItem('token');
        window.location.href = '/pages/login.html';
        return null;
    }

    return response;
}

// Logout function
function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/pages/login.html';
}

// Initialize user data on page load
document.addEventListener('DOMContentLoaded', () => {
    // Skip user loading on login page
    if (window.location.pathname.includes('/login.html')) {
        return;
    }
    
    loadUserData();
});