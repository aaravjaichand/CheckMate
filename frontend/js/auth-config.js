// Auth0 Configuration
// These values should be replaced with your actual Auth0 settings
// or loaded from environment variables in production

const AUTH0_CONFIG = {
    domain: 'YOUR_AUTH0_DOMAIN', // e.g., 'dev-dxzw4g7dlmwdbgeg.us.auth0.com'
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    audience: 'YOUR_AUTH0_AUDIENCE', // e.g., 'https://checkmate-api'
    redirectUri: window.location.origin + '/pages/dashboard.html',
    
    // Connection names for different login methods
    connections: {
        google: 'google-oauth2',
        database: 'Username-Password-Authentication',
        passwordless: 'email'
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AUTH0_CONFIG;
}