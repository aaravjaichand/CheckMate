import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '../services/database.js';
import { validateEmail, validatePassword } from '../utils/helpers.js';

const router = express.Router();

// Register new user
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name, school } = req.body;

        // Validation
        if (!email || !password || !name) {
            return res.status(400).json({ 
                error: 'Email, password, and name are required' 
            });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ 
                error: 'Please provide a valid email address' 
            });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ 
                error: 'Password must be at least 8 characters long and contain uppercase, lowercase, and numbers' 
            });
        }

        const db = await getDb();
        const users = db.collection('users');

        // Check if user already exists
        const existingUser = await users.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ 
                error: 'An account with this email already exists' 
            });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const newUser = {
            email: email.toLowerCase(),
            password: hashedPassword,
            name,
            school: school || '',
            role: 'teacher',
            plan: 'freemium',
            worksheetsProcessed: 0,
            monthlyLimit: 50,
            createdAt: new Date(),
            lastLogin: new Date(),
            isActive: true,
            preferences: {
                feedbackTone: 'encouraging',
                gradeDisplay: 'percentage',
                notifications: {
                    email: true,
                    processing: true,
                    weekly: false
                }
            }
        };

        const result = await users.insertOne(newUser);
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: result.insertedId,
                email: email.toLowerCase(),
                role: 'teacher'
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Remove password from response
        delete newUser.password;
        newUser._id = result.insertedId;

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: newUser
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            error: 'Failed to create account. Please try again.' 
        });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required' 
            });
        }

        const db = await getDb();
        const users = db.collection('users');

        // Find user
        const user = await users.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({ 
                error: 'Account has been deactivated. Please contact support.' 
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        // Update last login
        await users.updateOne(
            { _id: user._id },
            { $set: { lastLogin: new Date() } }
        );

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Remove password from response
        delete user.password;

        res.json({
            message: 'Login successful',
            token,
            user
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed. Please try again.' 
        });
    }
});

// Validate token
router.post('/validate', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = await getDb();
        const users = db.collection('users');

        const user = await users.findOne(
            { _id: decoded.userId },
            { projection: { password: 0 } }
        );

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        res.json({ user });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Generate new token
        const newToken = jwt.sign(
            { 
                userId: decoded.userId,
                email: decoded.email,
                role: decoded.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token: newToken });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Logout (client-side handles token removal)
router.post('/logout', (req, res) => {
    res.json({ message: 'Logout successful' });
});

// Get user profile
router.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const db = await getDb();
        const users = db.collection('users');
        
        const user = await users.findOne(
            { _id: decoded.userId },
            { projection: { password: 0 } }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Update user profile
router.put('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const { name, school, preferences } = req.body;
        
        const db = await getDb();
        const users = db.collection('users');
        
        const updateData = {
            updatedAt: new Date()
        };

        if (name) updateData.name = name;
        if (school !== undefined) updateData.school = school;
        if (preferences) updateData.preferences = { ...preferences };

        await users.updateOne(
            { _id: decoded.userId },
            { $set: updateData }
        );

        const updatedUser = await users.findOne(
            { _id: decoded.userId },
            { projection: { password: 0 } }
        );

        res.json({ 
            message: 'Profile updated successfully',
            user: updatedUser 
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

export default router;