import express from 'express';

const router = express.Router();

// Get Firebase configuration for frontend
router.get('/firebase', (req, res) => {
    try {
        console.log('=== Firebase Config Request ===');
        console.log('All env vars:', Object.keys(process.env).filter(key => key.includes('FIREBASE')));
        console.log('FIREBASE_API_KEY:', process.env.FIREBASE_API_KEY ? 'Present' : 'Missing');
        console.log('FIREBASE_AUTH_DOMAIN:', process.env.FIREBASE_AUTH_DOMAIN ? 'Present' : 'Missing');
        console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'Present' : 'Missing');
        console.log('NODE_ENV:', process.env.NODE_ENV);

        const config = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        };

        console.log('Config object:', {
            apiKey: config.apiKey ? 'Set' : 'Missing',
            authDomain: config.authDomain ? 'Set' : 'Missing',
            projectId: config.projectId ? 'Set' : 'Missing',
            storageBucket: config.storageBucket ? 'Set' : 'Missing',
            messagingSenderId: config.messagingSenderId ? 'Set' : 'Missing',
            appId: config.appId ? 'Set' : 'Missing'
        });

        // Check if all required config is present
        if (!config.apiKey || !config.authDomain || !config.projectId) {
            console.error('Missing Firebase environment variables');
            return res.status(400).json({ 
                error: 'Firebase configuration is incomplete. Please check environment variables.',
                missing: {
                    apiKey: !config.apiKey,
                    authDomain: !config.authDomain,
                    projectId: !config.projectId,
                    storageBucket: !config.storageBucket,
                    messagingSenderId: !config.messagingSenderId,
                    appId: !config.appId
                },
                help: 'Make sure you have set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, and FIREBASE_PROJECT_ID in your Vercel environment variables'
            });
        }

        console.log('Sending successful config response');
        res.json(config);
    } catch (error) {
        console.error('Error getting Firebase config:', error);
        res.status(500).json({ 
            error: 'Failed to get Firebase configuration',
            details: error.message 
        });
    }
});

export default router;