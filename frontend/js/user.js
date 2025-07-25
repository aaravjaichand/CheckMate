// User management and authentication utilities

// Load user data and update UI
async function loadUserData() {
    try {
        // Check if we're handling an Auth0 callback
        if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
            console.log('Handling Auth0 callback on dashboard page...');
            await handleAuth0Callback();
            return;
        }

        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        console.log('Loading user data:', { userData, token });
        
        if (!userData || !token) {
            console.log('No user data found, redirecting to login...');
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

// Handle Auth0 callback on dashboard page
async function handleAuth0Callback() {
    try {
        // Get Auth0 client configuration
        const configResponse = await fetch('/api/config/auth0');
        const auth0Config = await configResponse.json();
        
        // Initialize Auth0 client
        const auth0Client = await auth0.createAuth0Client({
            domain: auth0Config.domain,
            clientId: auth0Config.clientId,
            authorizationParams: {
                redirect_uri: auth0Config.redirectUri,
                audience: auth0Config.audience
            }
        });

        // Handle the callback
        console.log('Processing Auth0 callback...');
        await auth0Client.handleRedirectCallback();
        const user = await auth0Client.getUser();
        console.log('Auth0 user from callback:', user);
        
        // Send user data to backend
        const response = await fetch('/api/auth/auth0', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                auth0Id: user.sub,
                email: user.email,
                name: user.name,
                picture: user.picture
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Backend error:', errorData);
            throw new Error('Failed to authenticate with backend');
        }

        const authData = await response.json();
        console.log('Auth data from backend:', authData);
        
        // Store user info and token
        localStorage.setItem('user', JSON.stringify(authData.user));
        localStorage.setItem('token', authData.token);
        console.log('Stored user data in localStorage');
        
        // Clean up URL and reload user data
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Now load the user data normally
        const userData = localStorage.getItem('user');
        const user2 = JSON.parse(userData);
        
        // Update user name in UI
        const userNameElement = document.getElementById('user-name');
        if (userNameElement && user2.name) {
            userNameElement.textContent = user2.name;
        }

        // Update user name in liquid glass effect
        const userNameLiquidElements = document.querySelectorAll('.user-name-liquid');
        userNameLiquidElements.forEach(element => {
            if (user2.name) {
                element.textContent = user2.name;
            }
        });
        
    } catch (error) {
        console.error('Error handling Auth0 callback:', error);
        alert('Login failed. Please try again.');
        window.location.href = '/pages/login.html';
    }
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