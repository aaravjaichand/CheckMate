import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { getDb } from '../services/database.js';
import { processOCR } from '../services/ocr.js';
import { extractStudentName, validateFileType } from '../utils/helpers.js';
import { createWorksheetDocument } from '../models/worksheet.js';
import { ObjectId } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads - Use memory storage for Vercel
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (validateFileType(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 50 // Maximum 50 files per upload
    }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Upload single worksheet with student and class selection
router.post('/worksheet/single', upload.single('worksheet'), async (req, res) => {
    try {
        console.log('Upload request received:', {
            hasFile: !!req.file,
            body: req.body,
            fileName: req.file?.originalname
        });
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { studentId, classId, assignment } = req.body;

        if (!studentId || !classId) {
            return res.status(400).json({ error: 'Student ID and Class ID are required' });
        }

        console.log('Connecting to database...');
        const db = await getDb();
        console.log('Database connected, accessing collections...');
        
        const users = db.collection('users');
        const students = db.collection('students');
        const classes = db.collection('classes');
        const worksheets = db.collection('worksheets');
        
        console.log('Collections accessed successfully');

        // For demo purposes, skip auth checks and use default values
        const defaultTeacherId = new ObjectId('507f1f77bcf86cd799439011'); // Demo teacher ID
        
        // Get student and class info (without teacher verification for demo)
        const student = await students.findOne({
            _id: new ObjectId(studentId),
            isActive: true
        });

        const classDoc = await classes.findOne({
            _id: new ObjectId(classId),
            isActive: true
        });

        // Use defaults if not found
        const studentInfo = student || { name: 'Demo Student', _id: studentId };
        const classInfo = classDoc || { name: 'Demo Class', subject: 'General', gradeLevel: 'K' };

        // Create worksheet record with memory storage adaptations
        const worksheetData = {
            teacherId: defaultTeacherId,
            originalName: req.file.originalname,
            filename: `${Date.now()}-${req.file.originalname}`,
            filepath: 'memory-storage', // No actual file path in serverless
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            uploadDate: new Date(),
            status: 'processing',
            processingStage: 'uploaded',
            progress: 0,
            studentId: new ObjectId(studentId),
            studentName: studentInfo.name,
            classId: new ObjectId(classId),
            className: classInfo.name,
            metadata: {
                subject: classInfo.subject || 'unknown',
                grade: classInfo.gradeLevel || 'unknown',
                assignment: assignment || 'Untitled Assignment'
            },
            updatedAt: new Date()
        };

        const result = await worksheets.insertOne(worksheetData);
        worksheetData._id = result.insertedId;

        // Skip user count update for demo

        // Start OCR and grading processing asynchronously with file buffer
        processSingleWorksheetAsync(result.insertedId, req.file.buffer, req.file.mimetype, { preferences: { feedbackTone: 'encouraging' } });

        res.json({
            message: 'Worksheet uploaded successfully',
            worksheet: {
                id: result.insertedId,
                filename: req.file.originalname,
                size: req.file.size,
                status: 'processing',
                student: {
                    id: studentId,
                    name: studentInfo.name
                },
                class: {
                    id: classId,
                    name: classInfo.name,
                    subject: classInfo.subject
                }
            },
            remaining: 999 // Demo value
        });

    } catch (error) {
        console.error('Single upload error:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            code: error.code
        });
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size is 50MB per file.' });
        }
        
        if (error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }

        // Return more detailed error info for debugging
        res.status(500).json({ 
            error: 'Upload failed. Please try again.',
            debug: {
                message: error.message,
                type: error.name,
                code: error.code
            }
        });
    }
});

// Upload worksheets (bulk - existing functionality)
router.post('/worksheets', verifyToken, upload.array('worksheets', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const db = await getDb();
        const users = db.collection('users');
        const worksheets = db.collection('worksheets');

        // Get user data to check limits
        const user = await users.findOne({ _id: req.user.userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check monthly worksheet limit
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const monthlyCount = await worksheets.countDocuments({
            teacherId: req.user.userId,
            'uploadDate': {
                $gte: new Date(currentYear, currentMonth, 1),
                $lt: new Date(currentYear, currentMonth + 1, 1)
            }
        });

        const remainingLimit = user.monthlyLimit - monthlyCount;
        
        if (remainingLimit <= 0) {
            return res.status(403).json({ 
                error: 'Monthly worksheet limit reached. Please upgrade your plan or wait until next month.',
                limit: user.monthlyLimit,
                used: monthlyCount
            });
        }

        if (req.files.length > remainingLimit) {
            return res.status(403).json({ 
                error: `You can only upload ${remainingLimit} more worksheets this month.`,
                limit: user.monthlyLimit,
                used: monthlyCount,
                remaining: remainingLimit
            });
        }

        // Process each uploaded file
        const uploadResults = [];
        const errors = [];

        for (const file of req.files) {
            try {
                // Create worksheet record
                const worksheetData = {
                    teacherId: req.user.userId,
                    originalName: file.originalname,
                    filename: file.filename,
                    filepath: file.path,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    uploadDate: new Date(),
                    status: 'processing',
                    processingStage: 'uploaded',
                    metadata: {
                        subject: req.body.subject || 'unknown',
                        grade: req.body.grade || 'unknown',
                        assignment: req.body.assignment || 'Untitled Assignment'
                    }
                };

                const result = await worksheets.insertOne(worksheetData);
                worksheetData._id = result.insertedId;

                uploadResults.push({
                    id: result.insertedId,
                    filename: file.originalname,
                    size: file.size,
                    status: 'uploaded'
                });

                // Start OCR processing asynchronously
                processWorksheetAsync(result.insertedId, file.path, file.mimetype);

            } catch (error) {
                console.error(`Error processing file ${file.originalname}:`, error);
                errors.push({
                    filename: file.originalname,
                    error: error.message
                });
            }
        }

        // Update user's worksheet count
        await users.updateOne(
            { _id: req.user.userId },
            { 
                $inc: { worksheetsProcessed: uploadResults.length },
                $set: { lastActivity: new Date() }
            }
        );

        res.json({
            message: `Successfully uploaded ${uploadResults.length} worksheets`,
            uploads: uploadResults,
            errors: errors.length > 0 ? errors : undefined,
            remaining: remainingLimit - uploadResults.length
        });

    } catch (error) {
        console.error('Upload error:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size is 50MB per file.' });
        }
        
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(413).json({ error: 'Too many files. Maximum is 50 files per upload.' });
        }
        
        if (error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
});

// Get upload status
router.get('/status/:worksheetId', verifyToken, async (req, res) => {
    try {
        const { worksheetId } = req.params;
        
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        const worksheet = await worksheets.findOne({
            _id: worksheetId,
            teacherId: req.user.userId
        });

        if (!worksheet) {
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        res.json({
            id: worksheet._id,
            filename: worksheet.originalName,
            status: worksheet.status,
            processingStage: worksheet.processingStage,
            progress: worksheet.progress || 0,
            error: worksheet.error,
            completedAt: worksheet.completedAt,
            results: worksheet.results
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Get user's worksheets
router.get('/worksheets', verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, subject } = req.query;
        
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        const filter = { teacherId: req.user.userId };
        if (status) filter.status = status;
        if (subject) filter['metadata.subject'] = subject;

        const options = {
            sort: { uploadDate: -1 },
            skip: (page - 1) * limit,
            limit: parseInt(limit)
        };

        const [results, total] = await Promise.all([
            worksheets.find(filter, options).toArray(),
            worksheets.countDocuments(filter)
        ]);

        res.json({
            worksheets: results,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get worksheets error:', error);
        res.status(500).json({ error: 'Failed to get worksheets' });
    }
});

// Delete worksheet
router.delete('/worksheets/:worksheetId', verifyToken, async (req, res) => {
    try {
        const { worksheetId } = req.params;
        
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        const worksheet = await worksheets.findOne({
            _id: worksheetId,
            teacherId: req.user.userId
        });

        if (!worksheet) {
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        // Delete file from filesystem
        try {
            const fs = await import('fs/promises');
            await fs.unlink(worksheet.filepath);
        } catch (fileError) {
            console.warn('Could not delete file:', fileError.message);
        }

        // Delete from database
        await worksheets.deleteOne({ _id: worksheetId });

        res.json({ message: 'Worksheet deleted successfully' });

    } catch (error) {
        console.error('Delete worksheet error:', error);
        res.status(500).json({ error: 'Failed to delete worksheet' });
    }
});

// Async function to process single worksheet with enhanced grading
async function processSingleWorksheetAsync(worksheetId, filePath, mimeType, user) {
    try {
        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Update status to processing OCR
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    processingStage: 'ocr',
                    progress: 20,
                    updatedAt: new Date()
                }
            }
        );

        // Process OCR
        const ocrResults = await processOCR(filePath, mimeType);

        // Update with OCR results
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    processingStage: 'grading',
                    progress: 60,
                    ocrResults,
                    updatedAt: new Date()
                }
            }
        );

        // Get the worksheet with full context for grading
        const worksheet = await worksheets.findOne({ _id: worksheetId });

        // Import grading service
        const { gradeWithGemini, generateFeedback } = await import('../services/gemini.js');

        // Grade with Gemini API using enhanced context
        const gradingResults = await gradeWithGemini({
            text: ocrResults.text,
            subject: worksheet.metadata?.subject,
            gradeLevel: worksheet.metadata?.grade,
            studentName: worksheet.studentName,
            rubric: null // No custom rubric for now
        });

        // Generate personalized feedback
        const feedback = await generateFeedback({
            gradingResults,
            studentName: worksheet.studentName,
            subject: worksheet.metadata?.subject,
            tone: user.preferences?.feedbackTone || 'encouraging'
        });

        // Update worksheet with final results
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    status: 'graded',
                    processingStage: 'completed',
                    progress: 100,
                    gradingResults,
                    feedback,
                    completedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        console.log(`Single worksheet ${worksheetId} processed successfully`);

    } catch (error) {
        console.error('Single worksheet processing error:', worksheetId, error);
        
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    status: 'error',
                    error: error.message,
                    updatedAt: new Date()
                }
            }
        );
    }
}

// Async function to process worksheet OCR and grading (legacy bulk upload)
async function processWorksheetAsync(worksheetId, filePath, mimeType) {
    try {
        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Update status to processing OCR
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    processingStage: 'ocr',
                    progress: 20,
                    updatedAt: new Date()
                }
            }
        );

        // Process OCR
        const ocrResults = await processOCR(filePath, mimeType);
        
        // Extract student name from OCR results
        const studentName = extractStudentName(ocrResults.text);

        // Update with OCR results
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    processingStage: 'grading',
                    progress: 60,
                    ocrResults,
                    studentName,
                    updatedAt: new Date()
                }
            }
        );

        // Start grading process (will be implemented in grading.js)
        // For now, just mark as completed
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    status: 'completed',
                    processingStage: 'completed',
                    progress: 100,
                    completedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );

    } catch (error) {
        console.error('Processing error for worksheet:', worksheetId, error);
        
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    status: 'error',
                    error: error.message,
                    updatedAt: new Date()
                }
            }
        );
    }
}

export default router;