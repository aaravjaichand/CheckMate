import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
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

// Debug JWT token verification
router.post('/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        console.log('Debugging token verification...');
        console.log('Token received:', token.substring(0, 50) + '...');
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token decoded successfully:', decoded);
        
        // Test database lookup
        const db = await getDb();
        const users = db.collection('users');
        
        console.log('Looking up user with ID:', decoded.userId);
        console.log('ID type:', typeof decoded.userId);
        
        const user = await users.findOne(
            { _id: new ObjectId(decoded.userId) },
            { projection: { password: 0 } }
        );
        
        console.log('User found:', !!user);
        if (user) {
            console.log('User details:', { _id: user._id, email: user.email, name: user.name });
        }

        res.json({
            decoded,
            userFound: !!user,
            user: user ? { _id: user._id, email: user.email, name: user.name } : null,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Token verification debug error:', error);
        res.status(400).json({
            error: error.message,
            stack: error.stack
        });
    }
});

export default router;