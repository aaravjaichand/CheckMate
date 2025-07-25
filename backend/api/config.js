import express from 'express';

const router = express.Router();

// Get Auth0 configuration for frontend
router.get('/auth0', (req, res) => {
    try {
        const config = {
            domain: process.env.AUTH0_DOMAIN,
            clientId: process.env.AUTH0_CLIENT_ID,
            audience: process.env.AUTH0_AUDIENCE,
            redirectUri: `https://${req.get('host')}/pages/dashboard.html`,
            connections: {
                google: 'google-oauth2',
                database: 'Username-Password-Authentication',
                passwordless: 'email'
            }
        };

        // Check if all required config is present
        if (!config.domain || !config.clientId || !config.audience) {
            return res.status(500).json({ 
                error: 'Auth0 configuration is incomplete. Please check environment variables.' 
            });
        }

        res.json(config);
    } catch (error) {
        console.error('Error getting Auth0 config:', error);
        res.status(500).json({ error: 'Failed to get Auth0 configuration' });
    }
});

export default router;