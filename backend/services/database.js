import { MongoClient } from 'mongodb';

let db = null;
let client = null;

export async function connectToDatabase() {
    try {
        if (db) {
            return db;
        }

        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        client = new MongoClient(uri, {
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        await client.connect();
        console.log('Connected to MongoDB Atlas');

        db = client.db('checkmate');

        // Create indexes for better performance
        await createIndexes();

        return db;
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }
}

export async function getDb() {
    if (!db) {
        await connectToDatabase();
    }
    return db;
}

export async function closeDatabase() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('Database connection closed');
    }
}

async function createIndexes() {
    try {
        // Users collection indexes
        await db.collection('users').createIndexes([
            { key: { email: 1 }, unique: true },
            { key: { createdAt: 1 } },
            { key: { lastLogin: 1 } }
        ]);

        // Worksheets collection indexes
        await db.collection('worksheets').createIndexes([
            { key: { teacherId: 1, uploadDate: -1 } },
            { key: { teacherId: 1, status: 1 } },
            { key: { teacherId: 1, 'metadata.subject': 1 } },
            { key: { studentName: 1 } },
            { key: { studentId: 1 } },
            { key: { classId: 1 } },
            { key: { teacherId: 1, studentId: 1 } },
            { key: { teacherId: 1, classId: 1 } },
            { key: { status: 1 } },
            { key: { uploadDate: 1 } },
            { key: { completedAt: 1 } }
        ]);

        // Students collection indexes
        await db.collection('students').createIndexes([
            { key: { teacherId: 1, name: 1 } },
            { key: { teacherId: 1, isActive: 1 } },
            { key: { teacherId: 1, grade: 1 } },
            { key: { classes: 1 } },
            { key: { createdAt: 1 } },
            { key: { email: 1 }, sparse: true }
        ]);

        // Classes collection indexes
        await db.collection('classes').createIndexes([
            { key: { teacherId: 1, name: 1 } },
            { key: { teacherId: 1, isActive: 1 } },
            { key: { teacherId: 1, subject: 1 } },
            { key: { teacherId: 1, gradeLevel: 1 } },
            { key: { students: 1 } },
            { key: { createdAt: 1 } }
        ]);

        // Analytics collection indexes (for future use)
        await db.collection('analytics').createIndexes([
            { key: { teacherId: 1, date: -1 } },
            { key: { teacherId: 1, type: 1 } }
        ]);

        console.log('Database indexes created successfully');
    } catch (error) {
        console.error('Error creating indexes:', error);
        // Don't throw error as indexes might already exist
    }
}

// Health check function
export async function checkDatabaseHealth() {
    try {
        if (!db) {
            throw new Error('Database not connected');
        }

        // Simple ping to check connection
        await db.admin().ping();
        return { status: 'healthy', timestamp: new Date() };
    } catch (error) {
        return { 
            status: 'unhealthy', 
            error: error.message, 
            timestamp: new Date() 
        };
    }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Received SIGINT, closing database connection...');
    await closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing database connection...');
    await closeDatabase();
    process.exit(0);
});