import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../services/database.js';
import { gradeWithGemini } from '../services/gemini.js';
import { generateFeedback } from '../services/gemini.js';

const router = express.Router();

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

// Start grading process for a worksheet
router.post('/grade/:worksheetId', verifyToken, async (req, res) => {
    try {
        const { worksheetId } = req.params;
        const { rubric, subject, gradeLevel } = req.body;

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Get worksheet
        const worksheet = await worksheets.findOne({
            _id: worksheetId,
            teacherId: req.user.userId
        });

        if (!worksheet) {
            return res.status(404).json({ error: 'Worksheet not found' });
        }

        if (worksheet.status !== 'completed' || !worksheet.ocrResults) {
            return res.status(400).json({ error: 'Worksheet must be processed first' });
        }

        // Update status to grading
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    status: 'grading',
                    processingStage: 'grading',
                    progress: 70,
                    updatedAt: new Date()
                }
            }
        );

        // Start grading process asynchronously
        gradeWorksheetAsync(worksheetId, worksheet, rubric, subject, gradeLevel, req.user);

        res.json({
            message: 'Grading started',
            worksheetId,
            status: 'grading'
        });

    } catch (error) {
        console.error('Grading start error:', error);
        res.status(500).json({ error: 'Failed to start grading' });
    }
});

// Get grading results
router.get('/results/:worksheetId', verifyToken, async (req, res) => {
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
            studentName: worksheet.studentName,
            status: worksheet.status,
            results: worksheet.gradingResults,
            feedback: worksheet.feedback,
            completedAt: worksheet.completedAt
        });

    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ error: 'Failed to get results' });
    }
});

// Update manual grades
router.put('/results/:worksheetId', verifyToken, async (req, res) => {
    try {
        const { worksheetId } = req.params;
        const { grades, feedback, finalScore } = req.body;

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        const updateData = {
            updatedAt: new Date(),
            manuallyEdited: true
        };

        if (grades) updateData['gradingResults.questions'] = grades;
        if (feedback) updateData.feedback = feedback;
        if (finalScore !== undefined) updateData['gradingResults.totalScore'] = finalScore;

        await worksheets.updateOne(
            { _id: worksheetId, teacherId: req.user.userId },
            { $set: updateData }
        );

        res.json({ message: 'Grades updated successfully' });

    } catch (error) {
        console.error('Update grades error:', error);
        res.status(500).json({ error: 'Failed to update grades' });
    }
});

// Bulk grade multiple worksheets
router.post('/bulk-grade', verifyToken, async (req, res) => {
    try {
        const { worksheetIds, rubric, subject, gradeLevel } = req.body;

        if (!worksheetIds || !Array.isArray(worksheetIds)) {
            return res.status(400).json({ error: 'Worksheet IDs array is required' });
        }

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Verify all worksheets belong to user and are ready for grading
        const worksheetList = await worksheets.find({
            _id: { $in: worksheetIds },
            teacherId: req.user.userId,
            status: 'completed',
            ocrResults: { $exists: true }
        }).toArray();

        if (worksheetList.length !== worksheetIds.length) {
            return res.status(400).json({ 
                error: 'Some worksheets not found or not ready for grading' 
            });
        }

        // Update all worksheets to grading status
        await worksheets.updateMany(
            { _id: { $in: worksheetIds } },
            { 
                $set: { 
                    status: 'grading',
                    processingStage: 'grading',
                    progress: 70,
                    updatedAt: new Date()
                }
            }
        );

        // Start bulk grading process
        const gradingPromises = worksheetList.map(worksheet => 
            gradeWorksheetAsync(worksheet._id, worksheet, rubric, subject, gradeLevel, req.user)
        );

        // Don't wait for completion, return immediately
        Promise.all(gradingPromises).catch(error => {
            console.error('Bulk grading error:', error);
        });

        res.json({
            message: `Grading started for ${worksheetList.length} worksheets`,
            worksheetIds: worksheetIds,
            status: 'grading'
        });

    } catch (error) {
        console.error('Bulk grading error:', error);
        res.status(500).json({ error: 'Failed to start bulk grading' });
    }
});

// Get grading analytics
router.get('/analytics', verifyToken, async (req, res) => {
    try {
        const { timeframe = '30d', subject } = req.query;

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Calculate date range
        const now = new Date();
        let startDate;
        
        switch (timeframe) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const filter = {
            teacherId: req.user.userId,
            status: 'graded',
            completedAt: { $gte: startDate }
        };

        if (subject) {
            filter['metadata.subject'] = subject;
        }

        const gradedWorksheets = await worksheets.find(filter).toArray();

        // Calculate analytics
        const analytics = {
            totalGraded: gradedWorksheets.length,
            averageScore: 0,
            gradeDistribution: {
                'A (90-100%)': 0,
                'B (80-89%)': 0,
                'C (70-79%)': 0,
                'D (60-69%)': 0,
                'F (0-59%)': 0
            },
            commonMistakes: [],
            subjectBreakdown: {},
            timeToGrade: 0
        };

        if (gradedWorksheets.length > 0) {
            const scores = gradedWorksheets
                .filter(w => w.gradingResults?.totalScore !== undefined)
                .map(w => w.gradingResults.totalScore);

            if (scores.length > 0) {
                analytics.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

                // Grade distribution
                scores.forEach(score => {
                    if (score >= 90) analytics.gradeDistribution['A (90-100%)']++;
                    else if (score >= 80) analytics.gradeDistribution['B (80-89%)']++;
                    else if (score >= 70) analytics.gradeDistribution['C (70-79%)']++;
                    else if (score >= 60) analytics.gradeDistribution['D (60-69%)']++;
                    else analytics.gradeDistribution['F (0-59%)']++;
                });
            }

            // Subject breakdown
            gradedWorksheets.forEach(worksheet => {
                const subject = worksheet.metadata?.subject || 'Unknown';
                if (!analytics.subjectBreakdown[subject]) {
                    analytics.subjectBreakdown[subject] = 0;
                }
                analytics.subjectBreakdown[subject]++;
            });

            // Calculate average time to grade
            const processingTimes = gradedWorksheets
                .filter(w => w.uploadDate && w.completedAt)
                .map(w => w.completedAt - w.uploadDate);

            if (processingTimes.length > 0) {
                const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
                analytics.timeToGrade = Math.round(avgTime / 1000 / 60); // Convert to minutes
            }

            // Extract common mistakes (simplified)
            const mistakes = [];
            gradedWorksheets.forEach(worksheet => {
                if (worksheet.gradingResults?.commonErrors) {
                    mistakes.push(...worksheet.gradingResults.commonErrors);
                }
            });

            // Count mistake frequency
            const mistakeCount = {};
            mistakes.forEach(mistake => {
                mistakeCount[mistake] = (mistakeCount[mistake] || 0) + 1;
            });

            analytics.commonMistakes = Object.entries(mistakeCount)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([mistake, count]) => ({ mistake, count }));
        }

        res.json(analytics);

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

// Async function to grade a worksheet
async function gradeWorksheetAsync(worksheetId, worksheet, rubric, subject, gradeLevel, user) {
    try {
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        const users = db.collection('users');

        // Get user preferences for feedback tone
        const userData = await users.findOne({ _id: user.userId });
        const feedbackTone = userData?.preferences?.feedbackTone || 'encouraging';

        // Grade with Gemini API
        const gradingResults = await gradeWithGemini({
            text: worksheet.ocrResults.text,
            subject: subject || worksheet.metadata?.subject,
            gradeLevel: gradeLevel || worksheet.metadata?.grade,
            rubric: rubric,
            studentName: worksheet.studentName
        });

        // Generate personalized feedback
        const feedback = await generateFeedback({
            gradingResults,
            studentName: worksheet.studentName,
            subject: subject || worksheet.metadata?.subject,
            tone: feedbackTone
        });

        // Update worksheet with results
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

        console.log(`Worksheet ${worksheetId} graded successfully`);

    } catch (error) {
        console.error(`Grading error for worksheet ${worksheetId}:`, error);
        
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        
        await worksheets.updateOne(
            { _id: worksheetId },
            { 
                $set: { 
                    status: 'error',
                    error: `Grading failed: ${error.message}`,
                    updatedAt: new Date()
                }
            }
        );
    }
}

export default router;