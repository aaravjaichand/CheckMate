import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../services/database.js';

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

// Get dashboard overview
router.get('/overview', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const worksheets = db.collection('worksheets');
        const users = db.collection('users');

        const userId = req.user.userId;

        // Get user data
        const user = await users.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get current month data
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Aggregate worksheet stats
        const [monthlyStats, weeklyStats, recentWorksheets, statusCounts] = await Promise.all([
            // Monthly stats
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        uploadDate: { $gte: startOfMonth }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalUploaded: { $sum: 1 },
                        totalGraded: {
                            $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] }
                        },
                        averageScore: {
                            $avg: '$gradingResults.totalScore'
                        }
                    }
                }
            ]).toArray(),

            // Weekly stats
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        uploadDate: { $gte: startOfWeek }
                    }
                },
                {
                    $group: {
                        _id: null,
                        weeklyUploaded: { $sum: 1 },
                        weeklyGraded: {
                            $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] }
                        }
                    }
                }
            ]).toArray(),

            // Recent worksheets
            worksheets.find(
                { teacherId: userId },
                { 
                    sort: { uploadDate: -1 },
                    limit: 10,
                    projection: {
                        originalName: 1,
                        studentName: 1,
                        status: 1,
                        uploadDate: 1,
                        'gradingResults.totalScore': 1,
                        'metadata.subject': 1
                    }
                }
            ).toArray(),

            // Status counts
            worksheets.aggregate([
                { $match: { teacherId: userId } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]).toArray()
        ]);

        // Process results
        const monthly = monthlyStats[0] || { totalUploaded: 0, totalGraded: 0, averageScore: 0 };
        const weekly = weeklyStats[0] || { weeklyUploaded: 0, weeklyGraded: 0 };
        
        const statusSummary = {
            processing: 0,
            graded: 0,
            error: 0,
            total: 0
        };

        statusCounts.forEach(({ _id, count }) => {
            statusSummary[_id] = count;
            statusSummary.total += count;
        });

        // Calculate usage percentage
        const usagePercentage = user.monthlyLimit > 0 
            ? Math.round((monthly.totalUploaded / user.monthlyLimit) * 100)
            : 0;

        const overview = {
            user: {
                name: user.name,
                email: user.email,
                plan: user.plan,
                monthlyLimit: user.monthlyLimit,
                worksheetsProcessed: monthly.totalUploaded,
                usagePercentage
            },
            stats: {
                thisMonth: {
                    uploaded: monthly.totalUploaded,
                    graded: monthly.totalGraded,
                    averageScore: Math.round(monthly.averageScore || 0)
                },
                thisWeek: {
                    uploaded: weekly.weeklyUploaded,
                    graded: weekly.weeklyGraded
                },
                status: statusSummary
            },
            recentWorksheets: recentWorksheets.map(worksheet => ({
                id: worksheet._id,
                filename: worksheet.originalName,
                studentName: worksheet.studentName || 'Unknown',
                subject: worksheet.metadata?.subject || 'Unknown',
                status: worksheet.status,
                score: worksheet.gradingResults?.totalScore,
                uploadDate: worksheet.uploadDate
            }))
        };

        res.json(overview);

    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
});

// Get detailed analytics
router.get('/analytics', verifyToken, async (req, res) => {
    try {
        const { timeframe = '30d' } = req.query;
        
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
            case '1y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const userId = req.user.userId;

        // Get comprehensive analytics
        const [
            gradingTrends,
            subjectPerformance,
            commonMistakes,
            studentProgress,
            timeAnalysis
        ] = await Promise.all([
            // Grading trends over time
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        completedAt: { $gte: startDate },
                        status: 'graded'
                    }
                },
                {
                    $group: {
                        _id: {
                            date: {
                                $dateToString: {
                                    format: '%Y-%m-%d',
                                    date: '$completedAt'
                                }
                            }
                        },
                        count: { $sum: 1 },
                        averageScore: { $avg: '$gradingResults.totalScore' }
                    }
                },
                { $sort: { '_id.date': 1 } }
            ]).toArray(),

            // Subject performance
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        completedAt: { $gte: startDate },
                        status: 'graded'
                    }
                },
                {
                    $group: {
                        _id: '$metadata.subject',
                        count: { $sum: 1 },
                        averageScore: { $avg: '$gradingResults.totalScore' },
                        highestScore: { $max: '$gradingResults.totalScore' },
                        lowestScore: { $min: '$gradingResults.totalScore' }
                    }
                },
                { $sort: { count: -1 } }
            ]).toArray(),

            // Common mistakes analysis
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        completedAt: { $gte: startDate },
                        status: 'graded',
                        'gradingResults.commonErrors': { $exists: true, $ne: [] }
                    }
                },
                { $unwind: '$gradingResults.commonErrors' },
                {
                    $group: {
                        _id: '$gradingResults.commonErrors',
                        count: { $sum: 1 },
                        subjects: { $addToSet: '$metadata.subject' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]).toArray(),

            // Student progress (top/bottom performers)
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        completedAt: { $gte: startDate },
                        status: 'graded',
                        studentName: { $exists: true, $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$studentName',
                        worksheetCount: { $sum: 1 },
                        averageScore: { $avg: '$gradingResults.totalScore' },
                        latestScore: { $last: '$gradingResults.totalScore' },
                        improvement: {
                            $avg: {
                                $subtract: ['$gradingResults.totalScore', { $first: '$gradingResults.totalScore' }]
                            }
                        }
                    }
                },
                {
                    $match: { worksheetCount: { $gte: 2 } }
                },
                { $sort: { averageScore: -1 } }
            ]).toArray(),

            // Time analysis
            worksheets.aggregate([
                {
                    $match: {
                        teacherId: userId,
                        completedAt: { $gte: startDate },
                        uploadDate: { $exists: true },
                        completedAt: { $exists: true }
                    }
                },
                {
                    $project: {
                        processingTime: {
                            $divide: [
                                { $subtract: ['$completedAt', '$uploadDate'] },
                                1000 * 60 // Convert to minutes
                            ]
                        },
                        status: 1
                    }
                },
                {
                    $group: {
                        _id: null,
                        averageProcessingTime: { $avg: '$processingTime' },
                        minProcessingTime: { $min: '$processingTime' },
                        maxProcessingTime: { $max: '$processingTime' }
                    }
                }
            ]).toArray()
        ]);

        // Calculate grade distribution
        const gradeDistribution = await worksheets.aggregate([
            {
                $match: {
                    teacherId: userId,
                    completedAt: { $gte: startDate },
                    status: 'graded'
                }
            },
            {
                $bucket: {
                    groupBy: '$gradingResults.totalScore',
                    boundaries: [0, 60, 70, 80, 90, 100],
                    default: 'Other',
                    output: {
                        count: { $sum: 1 },
                        averageScore: { $avg: '$gradingResults.totalScore' }
                    }
                }
            }
        ]).toArray();

        const analytics = {
            timeframe,
            gradingTrends: gradingTrends.map(trend => ({
                date: trend._id.date,
                count: trend.count,
                averageScore: Math.round(trend.averageScore || 0)
            })),
            subjectPerformance: subjectPerformance.map(subject => ({
                subject: subject._id || 'Unknown',
                count: subject.count,
                averageScore: Math.round(subject.averageScore || 0),
                highestScore: Math.round(subject.highestScore || 0),
                lowestScore: Math.round(subject.lowestScore || 0)
            })),
            gradeDistribution: {
                'F (0-59%)': gradeDistribution.find(g => g._id === 0)?.count || 0,
                'D (60-69%)': gradeDistribution.find(g => g._id === 60)?.count || 0,
                'C (70-79%)': gradeDistribution.find(g => g._id === 70)?.count || 0,
                'B (80-89%)': gradeDistribution.find(g => g._id === 80)?.count || 0,
                'A (90-100%)': gradeDistribution.find(g => g._id === 90)?.count || 0
            },
            commonMistakes: commonMistakes.map(mistake => ({
                mistake: mistake._id,
                count: mistake.count,
                subjects: mistake.subjects
            })),
            studentProgress: {
                topPerformers: studentProgress.slice(0, 5).map(student => ({
                    name: student._id,
                    averageScore: Math.round(student.averageScore || 0),
                    worksheetCount: student.worksheetCount,
                    improvement: Math.round(student.improvement || 0)
                })),
                needsAttention: studentProgress.slice(-5).reverse().map(student => ({
                    name: student._id,
                    averageScore: Math.round(student.averageScore || 0),
                    worksheetCount: student.worksheetCount,
                    improvement: Math.round(student.improvement || 0)
                }))
            },
            timeAnalysis: timeAnalysis[0] ? {
                averageProcessingTime: Math.round(timeAnalysis[0].averageProcessingTime || 0),
                minProcessingTime: Math.round(timeAnalysis[0].minProcessingTime || 0),
                maxProcessingTime: Math.round(timeAnalysis[0].maxProcessingTime || 0)
            } : {
                averageProcessingTime: 0,
                minProcessingTime: 0,
                maxProcessingTime: 0
            }
        };

        res.json(analytics);

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

// Export grades to CSV
router.get('/export/:format', verifyToken, async (req, res) => {
    try {
        const { format } = req.params;
        const { startDate, endDate, subject, includeDetails = false } = req.query;

        if (format !== 'csv') {
            return res.status(400).json({ error: 'Only CSV format is currently supported' });
        }

        const db = await getDb();
        const worksheets = db.collection('worksheets');

        // Build filter
        const filter = {
            teacherId: req.user.userId,
            status: 'graded'
        };

        if (startDate || endDate) {
            filter.completedAt = {};
            if (startDate) filter.completedAt.$gte = new Date(startDate);
            if (endDate) filter.completedAt.$lte = new Date(endDate);
        }

        if (subject) {
            filter['metadata.subject'] = subject;
        }

        const gradedWorksheets = await worksheets.find(filter)
            .sort({ completedAt: -1 })
            .toArray();

        // Generate CSV content
        let csvContent = '';
        
        if (includeDetails === 'true') {
            // Detailed export with question-by-question breakdown
            csvContent = 'Student Name,Assignment,Subject,Upload Date,Completion Date,Total Score,Questions,Feedback\n';
            
            gradedWorksheets.forEach(worksheet => {
                const questions = worksheet.gradingResults?.questions || [];
                const questionSummary = questions.map(q => 
                    `Q${q.number}: ${q.score}/${q.maxScore}`
                ).join('; ');
                
                const row = [
                    worksheet.studentName || 'Unknown',
                    worksheet.originalName || '',
                    worksheet.metadata?.subject || 'Unknown',
                    worksheet.uploadDate?.toISOString().split('T')[0] || '',
                    worksheet.completedAt?.toISOString().split('T')[0] || '',
                    worksheet.gradingResults?.totalScore || 0,
                    `"${questionSummary}"`,
                    `"${(worksheet.feedback?.summary || '').replace(/"/g, '""')}"`
                ].join(',');
                
                csvContent += row + '\n';
            });
        } else {
            // Simple export
            csvContent = 'Student Name,Assignment,Subject,Upload Date,Completion Date,Total Score,Grade\n';
            
            gradedWorksheets.forEach(worksheet => {
                const score = worksheet.gradingResults?.totalScore || 0;
                let grade = 'F';
                if (score >= 90) grade = 'A';
                else if (score >= 80) grade = 'B';
                else if (score >= 70) grade = 'C';
                else if (score >= 60) grade = 'D';
                
                const row = [
                    worksheet.studentName || 'Unknown',
                    worksheet.originalName || '',
                    worksheet.metadata?.subject || 'Unknown',
                    worksheet.uploadDate?.toISOString().split('T')[0] || '',
                    worksheet.completedAt?.toISOString().split('T')[0] || '',
                    score,
                    grade
                ].join(',');
                
                csvContent += row + '\n';
            });
        }

        // Set response headers for file download
        const filename = `gradeflow-export-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        res.send(csvContent);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Get class summary
router.get('/class-summary', verifyToken, async (req, res) => {
    try {
        const { subject, timeframe = '30d' } = req.query;
        
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

        // Get class performance data
        const classData = await worksheets.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$studentName',
                    worksheetCount: { $sum: 1 },
                    totalScore: { $avg: '$gradingResults.totalScore' },
                    lastActivity: { $max: '$completedAt' },
                    subjects: { $addToSet: '$metadata.subject' }
                }
            },
            { $sort: { totalScore: -1 } }
        ]).toArray();

        // Calculate class statistics
        const scores = classData.map(student => student.totalScore || 0);
        const classAverage = scores.length > 0 
            ? scores.reduce((a, b) => a + b, 0) / scores.length 
            : 0;

        const classSummary = {
            studentCount: classData.length,
            classAverage: Math.round(classAverage),
            highestScore: Math.max(...scores, 0),
            lowestScore: Math.min(...scores, 100),
            students: classData.map(student => ({
                name: student._id,
                worksheetCount: student.worksheetCount,
                averageScore: Math.round(student.totalScore || 0),
                lastActivity: student.lastActivity,
                subjects: student.subjects.filter(s => s)
            }))
        };

        res.json(classSummary);

    } catch (error) {
        console.error('Class summary error:', error);
        res.status(500).json({ error: 'Failed to get class summary' });
    }
});

export default router;