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
        fileSize: 10 * 1024 * 1024, // 10MB limit (increased for worksheets)
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
router.post('/worksheet/single', verifyToken, upload.single('worksheet'), async (req, res) => {
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

        // Use the authenticated user's ID as the teacher
        const teacherId = req.user.userId;
        console.log('Using authenticated user as teacher ID:', teacherId);
        
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

        // Debug file upload info
        const isPNG = req.file.mimetype && req.file.mimetype.includes('png');
        console.log('=== FILE UPLOAD DEBUG ===');
        console.log('File type:', req.file.mimetype);
        console.log('Is PNG:', isPNG);
        console.log('Original buffer type:', typeof req.file.buffer);
        console.log('Buffer length:', req.file.buffer.length);
        console.log('Buffer is Buffer:', Buffer.isBuffer(req.file.buffer));

        if (isPNG && req.file.buffer) {
            const signature = req.file.buffer.toString('hex', 0, 8);
            console.log('PNG upload signature check:', signature);
            console.log('Is valid PNG:', signature === '89504e470d0a1a0a');
        }

        // Create worksheet record with memory storage adaptations
        const worksheetData = {
            teacherId: teacherId,
            originalName: req.file.originalname,
            filename: `${Date.now()}-${req.file.originalname}`,
            filepath: 'memory-storage', // No actual file path in serverless
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            fileBuffer: req.file.buffer, // Store file buffer for serving
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

        console.log('=== WORKSHEET CREATED ===');
        console.log('Worksheet ID:', result.insertedId);
        console.log('Teacher ID:', teacherId);
        console.log('Student ID:', studentId);
        console.log('Class ID:', classId);
        console.log('File size:', req.file.size);
        console.log('MIME type:', req.file.mimetype);

        // Skip user count update for demo

        // Start OCR and grading processing asynchronously with file buffer - pass the exact buffer
        processSingleWorksheetAsync(result.insertedId, {
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            originalName: req.file.originalname
        }, { preferences: { feedbackTone: 'encouraging' } });

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
            return res.status(413).json({ error: 'File too large. Maximum size is 10MB per file.' });
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
            return res.status(413).json({ error: 'File too large. Maximum size is 10MB per file.' });
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

// Streaming endpoint for real-time grading updates  
router.get('/stream/:worksheetId', async (req, res) => {
    // Custom token verification for EventSource (which can't send custom headers)
    try {
        const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No token provided' }));
            return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token' }));
        return;
    }
    try {
        const { worksheetId } = req.params;

        console.log('=== STREAMING GRADING REQUEST ===');
        console.log('Worksheet ID:', worksheetId);
        console.log('User ID:', req.user.userId);

        // Set up Server-Sent Events
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Convert string ID to ObjectId
        let objectId;
        try {
            objectId = new ObjectId(worksheetId);
        } catch (error) {
            res.write(`data: ${JSON.stringify({ error: 'Invalid worksheet ID format' })}\n\n`);
            res.end();
            return;
        }

        // Get worksheet and verify ownership
        const worksheet = await worksheets.findOne({
            _id: objectId,
            teacherId: req.user.userId
        });

        if (!worksheet) {
            res.write(`data: ${JSON.stringify({ error: 'Worksheet not found' })}\n\n`);
            res.end();
            return;
        }

        // Send initial status
        res.write(`data: ${JSON.stringify({
            type: 'status',
            message: 'Starting AI grading with Gemini 2.5 Flash...',
            worksheetId: worksheetId,
            studentName: worksheet.studentName
        })}\n\n`);

        // Import grading service
        const { gradeWorksheetDirect } = await import('../services/gemini.js');

        // Create stream callback to send chunks to frontend
        const streamCallback = (chunk) => {
            console.log('Sending chunk to frontend:', chunk.type, chunk.data?.length || 0, 'chars');
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        };

        try {
            // Ensure we have the file buffer - it might be corrupted from MongoDB storage
            let fileBuffer = worksheet.fileBuffer;

            console.log('File buffer details for streaming:', {
                hasBuffer: !!fileBuffer,
                bufferType: typeof fileBuffer,
                isBuffer: Buffer.isBuffer(fileBuffer),
                bufferLength: fileBuffer?.length,
                mimeType: worksheet.mimeType
            });

            // Convert MongoDB Binary to Buffer if needed
            if (fileBuffer && !Buffer.isBuffer(fileBuffer)) {
                if (fileBuffer.buffer) {
                    // Handle MongoDB Binary data
                    fileBuffer = Buffer.from(fileBuffer.buffer);
                    console.log('Converted MongoDB Binary to Buffer, new length:', fileBuffer.length);
                } else if (typeof fileBuffer === 'object') {
                    // Handle other object types
                    fileBuffer = Buffer.from(Object.values(fileBuffer));
                    console.log('Converted object to Buffer, new length:', fileBuffer.length);
                }
            }

            // Grade with streaming
            const gradingResults = await gradeWorksheetDirect({
                fileBuffer: fileBuffer,
                mimeType: worksheet.mimeType,
                subject: worksheet.metadata?.subject,
                gradeLevel: worksheet.metadata?.grade,
                studentName: worksheet.studentName,
                assignmentName: worksheet.metadata?.assignment,
                streamCallback: streamCallback
            });

            // Send final results
            res.write(`data: ${JSON.stringify({
                type: 'results',
                data: gradingResults
            })}\n\n`);

            // Update worksheet in database
            await worksheets.updateOne(
                { _id: objectId },
                {
                    $set: {
                        status: 'graded',
                        processingStage: 'completed',
                        progress: 100,
                        gradingResults,
                        completedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );

        } catch (error) {
            console.error('Streaming grading error:', error);

            // Check if it's a rate limit error and provide helpful message
            const isRateLimit = error.message?.includes('429') ||
                error.message?.includes('rate limit') ||
                error.message?.includes('quota');

            const errorMessage = isRateLimit
                ? 'API rate limit reached. Please wait a moment and try again.'
                : error.message;

            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: errorMessage,
                isRateLimit: isRateLimit
            })}\n\n`);

            // Update worksheet with error
            await worksheets.updateOne(
                { _id: objectId },
                {
                    $set: {
                        status: 'error',
                        error: errorMessage,
                        updatedAt: new Date()
                    }
                }
            );
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();

    } catch (error) {
        console.error('Streaming endpoint error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Streaming failed'
        })}\n\n`);
        res.end();
    }
});

// Get upload status (demo version without strict auth)
router.get('/status/:worksheetId', verifyToken, async (req, res) => {
    try {
        const { worksheetId } = req.params;
        
        console.log('=== WORKSHEET STATUS REQUEST ===');
        console.log('Worksheet ID:', worksheetId);
        console.log('User ID:', req.user.userId);
        console.log('User object:', req.user);

        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        // Convert string ID to ObjectId
        let objectId;
        try {
            objectId = new ObjectId(worksheetId);
            console.log('Converted to ObjectId:', objectId);
        } catch (error) {
            console.log('Invalid ObjectId format:', error.message);
            return res.status(400).json({ error: 'Invalid worksheet ID format' });
        }

        // First, let's check if the worksheet exists at all (without user filtering)
        const worksheetExists = await worksheets.findOne({ _id: objectId });
        console.log('Worksheet exists (no user filter):', !!worksheetExists);
        if (worksheetExists) {
            console.log('Worksheet teacherId:', worksheetExists.teacherId);
            console.log('User teacherId:', req.user.userId);
            console.log('TeacherIds match:', worksheetExists.teacherId?.toString() === req.user.userId);
        }

        // Filter by the authenticated user's teacherId for proper data isolation
        const worksheet = await worksheets.findOne({
            _id: objectId,
            teacherId: req.user.userId
        });

        console.log('Worksheet found with user filter:', !!worksheet);

        if (!worksheet) {
            console.log('Worksheet not found for ID:', worksheetId);
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        console.log('Found worksheet:', {
            id: worksheet._id,
            status: worksheet.status,
            processingStage: worksheet.processingStage
        });

        res.json({
            id: worksheet._id,
            filename: worksheet.originalName,
            mimeType: worksheet.mimeType,
            status: worksheet.status,
            processingStage: worksheet.processingStage,
            progress: worksheet.progress || 0,
            error: worksheet.error,
            completedAt: worksheet.completedAt,
            gradingResults: worksheet.gradingResults,
            feedback: worksheet.feedback,
            studentName: worksheet.studentName,
            className: worksheet.className,
            uploadDate: worksheet.uploadDate
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
async function processSingleWorksheetAsync(worksheetId, fileData, user) {
    console.log('=== STARTING WORKSHEET PROCESSING ===');
    console.log('Worksheet ID:', worksheetId);
    console.log('MIME type:', fileData.mimeType);
    console.log('File buffer size:', fileData.fileBuffer?.length);
    console.log('Original filename:', fileData.originalName);
    console.log('User preferences:', user);

    try {
        const db = await getDb();
        const worksheets = db.collection('worksheets');

        console.log('Updating worksheet status to analyzing...');
        // Update status to analyzing worksheet with Gemini 2.5 Pro
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    processingStage: 'analyzing',
                    progress: 30,
                    updatedAt: new Date()
                }
            }
        );
        console.log('Status updated to analyzing');

        // Skip OCR - Process directly with Gemini 2.5 Pro
        console.log('Bypassing OCR, processing directly with Gemini 2.5 Pro');

        // Update progress before grading
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    processingStage: 'grading',
                    progress: 70,
                    updatedAt: new Date()
                }
            }
        );

        // Get the worksheet with full context for grading - ensure user isolation
        console.log('Looking up worksheet for grading with user:', user);
        const worksheet = await worksheets.findOne({ _id: worksheetId });

        console.log('Worksheet found for grading:', !!worksheet);
        if (!worksheet) {
            throw new Error(`Worksheet ${worksheetId} not found for grading`);
        }

        console.log('Worksheet details:', {
            id: worksheet._id,
            mimeType: worksheet.mimeType,
            hasFileBuffer: !!worksheet.fileBuffer,
            teacherId: worksheet.teacherId
        });

        // Import grading service
        const { gradeWorksheetDirect, generateFeedback } = await import('../services/gemini.js');

        // Grade directly with Gemini 2.5 Flash using image analysis (bypassing OCR)
        console.log('Starting direct image processing with Gemini 2.5 Flash...');

        // Use the original file buffer, not the one from database (which may be corrupted)
        const originalFileBuffer = fileData.fileBuffer;
        console.log('Using original file buffer:', {
            bufferLength: originalFileBuffer?.length,
            bufferType: typeof originalFileBuffer,
            isBuffer: Buffer.isBuffer(originalFileBuffer)
        });

        const gradingResults = await gradeWorksheetDirect({
            fileBuffer: originalFileBuffer, // Use the original buffer directly
            mimeType: fileData.mimeType,
            subject: worksheet.metadata?.subject,
            gradeLevel: worksheet.metadata?.grade,
            studentName: worksheet.studentName,
            assignmentName: worksheet.metadata?.assignment,
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

        console.log(`Single worksheet ${worksheetId} processing completed successfully with ${gradingResults.questions?.length || 0} questions graded`);

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

// Serve uploaded files
router.get('/file/:worksheetId', verifyToken, async (req, res) => {
    try {
        const { worksheetId } = req.params;

        console.log('=== FILE SERVING REQUEST ===');
        console.log('Worksheet ID:', worksheetId);
        console.log('User ID:', req.user.userId);

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Convert to ObjectId
        let objectId;
        try {
            objectId = new ObjectId(worksheetId);
        } catch (error) {
            console.log('Invalid ObjectId format:', error.message);
            return res.status(400).json({ error: 'Invalid worksheet ID format' });
        }

        // Get worksheet and verify ownership
        const worksheet = await worksheets.findOne({
            _id: objectId,
            teacherId: req.user.userId
        });

        console.log('Worksheet found:', !!worksheet);
        if (worksheet) {
            console.log('Has fileBuffer:', !!worksheet.fileBuffer);
            console.log('Has filepath:', !!worksheet.filepath);
            console.log('MIME type:', worksheet.mimeType);
            console.log('File size:', worksheet.fileSize);
            console.log('Original name:', worksheet.originalName);

            // Debug buffer structure for PNG files
            if (worksheet.mimeType && worksheet.mimeType.includes('png')) {
                console.log('=== PNG FILE DEBUG ===');
                console.log('Buffer type:', typeof worksheet.fileBuffer);
                console.log('Is Buffer:', Buffer.isBuffer(worksheet.fileBuffer));
                console.log('Buffer constructor:', worksheet.fileBuffer?.constructor?.name);

                if (worksheet.fileBuffer) {
                    console.log('Buffer length:', worksheet.fileBuffer.length);
                    console.log('Buffer preview:', worksheet.fileBuffer.toString('hex').substring(0, 50));

                    // Check if it looks like a valid PNG file
                    const pngSignature = worksheet.fileBuffer.toString('hex').substring(0, 16);
                    console.log('PNG signature check:', pngSignature);
                    console.log('Is valid PNG signature:', pngSignature === '89504e470d0a1a0a');
                }
            }
        }

        if (!worksheet) {
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        // For files stored in memory (buffer), serve directly
        if (worksheet.fileBuffer) {
            console.log('Serving file from buffer');
            console.log('Buffer type:', typeof worksheet.fileBuffer);
            console.log('Buffer length:', worksheet.fileBuffer.length);
            console.log('Is Buffer:', Buffer.isBuffer(worksheet.fileBuffer));

            try {
                // Handle both Buffer and Binary data from MongoDB
                let buffer;
                const originalBufferType = typeof worksheet.fileBuffer;
                const isPNG = worksheet.mimeType && worksheet.mimeType.includes('png');

                console.log(`Processing ${isPNG ? 'PNG' : 'non-PNG'} file buffer...`);

                if (Buffer.isBuffer(worksheet.fileBuffer)) {
                    buffer = worksheet.fileBuffer;
                    console.log('File buffer is already a Buffer');
                } else if (worksheet.fileBuffer && worksheet.fileBuffer.buffer) {
                    // Handle MongoDB Binary data
                    buffer = Buffer.from(worksheet.fileBuffer.buffer);
                    console.log('Converted MongoDB Binary to Buffer');
                } else if (worksheet.fileBuffer && typeof worksheet.fileBuffer === 'object') {
                    // Handle other object types - convert to buffer
                    console.log('Converting object to buffer, object keys:', Object.keys(worksheet.fileBuffer));

                    // For PNG files, try different conversion methods
                    if (isPNG) {
                        // Try to handle MongoDB stored binary data for PNG
                        if (worksheet.fileBuffer.data && Array.isArray(worksheet.fileBuffer.data)) {
                            console.log('PNG: Using data array from MongoDB Binary');
                            buffer = Buffer.from(worksheet.fileBuffer.data);
                        } else if (worksheet.fileBuffer.buffer) {
                            console.log('PNG: Using buffer property');
                            buffer = Buffer.from(worksheet.fileBuffer.buffer);
                        } else {
                            console.log('PNG: Using Object.values fallback');
                            buffer = Buffer.from(Object.values(worksheet.fileBuffer));
                        }
                    } else {
                        buffer = Buffer.from(Object.values(worksheet.fileBuffer));
                    }
                    console.log('Converted object to Buffer');
                } else if (worksheet.fileBuffer && Array.isArray(worksheet.fileBuffer)) {
                    // Handle array data
                    buffer = Buffer.from(worksheet.fileBuffer);
                    console.log('Converted array to Buffer');
                } else {
                    console.error('Unsupported buffer type for', isPNG ? 'PNG' : 'file', ':', originalBufferType);
                    console.error('FileBuffer structure:', {
                        type: originalBufferType,
                        hasBuffer: !!worksheet.fileBuffer?.buffer,
                        hasData: !!worksheet.fileBuffer?.data,
                        isArray: Array.isArray(worksheet.fileBuffer),
                        keys: worksheet.fileBuffer && typeof worksheet.fileBuffer === 'object' ? Object.keys(worksheet.fileBuffer) : []
                    });
                    throw new Error(`Invalid buffer data type for ${isPNG ? 'PNG' : 'file'}: ${originalBufferType}`);
                }

                console.log('Final buffer length:', buffer.length);
                console.log('Buffer first 20 bytes (hex):', buffer.toString('hex').substring(0, 40));

                // Validate buffer has content
                if (buffer.length === 0) {
                    throw new Error('Buffer is empty');
                }

                // For PNG files, validate the signature
                if (isPNG) {
                    const signature = buffer.toString('hex', 0, 8);
                    const validPNGSignature = '89504e470d0a1a0a';
                    console.log('PNG signature validation:', {
                        expected: validPNGSignature,
                        actual: signature,
                        isValid: signature === validPNGSignature
                    });

                    if (signature !== validPNGSignature) {
                        console.warn('PNG signature mismatch - buffer may be corrupted');
                        // Don't throw error, just warn - let browser handle it
                    }
                }

                // Set headers with special handling for PNG files
                const headers = {
                    'Content-Type': worksheet.mimeType || 'application/octet-stream',
                    'Content-Length': buffer.length,
                    'Content-Disposition': `inline; filename="${worksheet.originalName || 'worksheet'}"`,
                    'Cache-Control': 'public, max-age=31536000', // Cache for better performance
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET',
                    'Access-Control-Allow-Headers': 'Authorization, Content-Type'
                };

                // For PNG files, ensure proper MIME type
                if (isPNG) {
                    headers['Content-Type'] = 'image/png';
                    console.log('Setting PNG-specific headers');
                }

                res.set(headers);
                return res.send(buffer);
            } catch (bufferError) {
                console.error('Error serving buffer:', bufferError);
                console.error('Buffer details:', {
                    hasFileBuffer: !!worksheet.fileBuffer,
                    bufferType: typeof worksheet.fileBuffer,
                    isBuffer: Buffer.isBuffer(worksheet.fileBuffer),
                    isArray: Array.isArray(worksheet.fileBuffer)
                });
                return res.status(500).json({ error: 'Failed to serve file buffer', details: bufferError.message });
            }
        }

        // For files stored on disk (if using file storage)
        if (worksheet.filepath) {
            return res.sendFile(path.resolve(worksheet.filepath));
        }

        res.status(404).json({ error: 'File not found' });

    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

export default router;