import express from 'express';
import { getDb } from '../services/database.js';

const router = express.Router();

// Debug endpoint to check environment variables and database connection
router.get('/env', async (req, res) => {
    try {
        const envStatus = {
            JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
            MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'MISSING',
            AUTH0_DOMAIN: process.env.AUTH0_DOMAIN ? 'SET' : 'MISSING',
            AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID ? 'SET' : 'MISSING',
            AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE ? 'SET' : 'MISSING',
        };

        // Test database connection
        let dbStatus = 'UNKNOWN';
        try {
            const db = await getDb();
            await db.admin().ping();
            dbStatus = 'CONNECTED';
        } catch (dbError) {
            dbStatus = `ERROR: ${dbError.message}`;
        }

        res.json({
            environment: envStatus,
            database: dbStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Test auth endpoint with minimal data
router.post('/test-auth', async (req, res) => {
    try {
        const testData = {
            auth0Id: 'test-12345',
            email: 'test@example.com',
            name: 'Test User'
        };

        res.json({
            message: 'Test endpoint working',
            receivedData: req.body,
            testData: testData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

export default router;