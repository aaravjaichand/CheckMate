import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb } from '../services/database.js';
import { generateAIRecommendations } from '../services/gemini.js';

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

// Get comprehensive analytics organized by classes
router.get('/classes', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const teacherId = req.user.userId;

        // Get all classes for the teacher
        const classes = await db.collection('classes').find({
            teacherId: new ObjectId(teacherId),
            isActive: true
        }).toArray();

        if (classes.length === 0) {
            return res.json({ classes: [] });
        }

        const classAnalytics = [];

        for (const classDoc of classes) {
            const classId = classDoc._id;

            // Get all worksheets for this class
            const worksheets = await db.collection('worksheets').find({
                teacherId: new ObjectId(teacherId),
                classId: classId,
                status: 'graded'
            }).toArray();

            // Get all students in this class
            const students = await db.collection('students').find({
                teacherId: new ObjectId(teacherId),
                classes: classId,
                isActive: true
            }).toArray();

            // Calculate student performance
            const studentPerformance = [];
            let totalClassPoints = 0;
            let totalClassPointsEarned = 0;

            for (const student of students) {
                const studentWorksheets = worksheets.filter(w =>
                    w.studentId.toString() === student._id.toString()
                );

                if (studentWorksheets.length > 0) {
                    const totalPoints = studentWorksheets.reduce((sum, w) =>
                        sum + (w.gradingResults?.totalPoints || 0), 0);
                    const totalPointsEarned = studentWorksheets.reduce((sum, w) =>
                        sum + (w.gradingResults?.totalPointsEarned || 0), 0);
                    const averageScore = totalPoints > 0 ? Math.round((totalPointsEarned / totalPoints) * 100) : 0;

                    totalClassPoints += totalPoints;
                    totalClassPointsEarned += totalPointsEarned;

                    studentPerformance.push({
                        studentId: student._id,
                        studentName: student.name,
                        totalWorksheets: studentWorksheets.length,
                        totalPoints: totalPoints,
                        totalPointsEarned: totalPointsEarned,
                        averageScore: averageScore,
                        grade: calculateLetterGrade(averageScore),
                        needsSupport: averageScore < 80,
                        lastActivity: studentWorksheets.length > 0 ?
                            new Date(Math.max(...studentWorksheets.map(w => new Date(w.completedAt)))) : null
                    });
                } else {
                    // Student with no worksheets
                    studentPerformance.push({
                        studentId: student._id,
                        studentName: student.name,
                        totalWorksheets: 0,
                        totalPoints: 0,
                        totalPointsEarned: 0,
                        averageScore: 0,
                        grade: 'N/A',
                        needsSupport: true,
                        lastActivity: null
                    });
                }
            }

            // Calculate class metrics
            const classAverageScore = totalClassPoints > 0 ?
                Math.round((totalClassPointsEarned / totalClassPoints) * 100) : 0;

            // Get top performers (top 5)
            const topPerformers = studentPerformance
                .filter(s => s.totalWorksheets > 0)
                .sort((a, b) => b.averageScore - a.averageScore)
                .slice(0, 5)
                .map((student, index) => ({
                    rank: index + 1,
                    studentId: student.studentId,
                    studentName: student.studentName,
                    averageScore: student.averageScore,
                    grade: student.grade,
                    totalWorksheets: student.totalWorksheets
                }));

            // Get students needing support (below 80%)
            const studentsNeedingSupport = studentPerformance
                .filter(s => s.needsSupport)
                .sort((a, b) => a.averageScore - b.averageScore)
                .map(student => ({
                    studentId: student.studentId,
                    studentName: student.studentName,
                    averageScore: student.averageScore,
                    grade: student.grade,
                    totalWorksheets: student.totalWorksheets,
                    priority: student.averageScore < 60 ? 'high' :
                        student.averageScore < 70 ? 'medium' : 'low'
                }));

            // Calculate grade distribution
            const gradeDistribution = {
                A: studentPerformance.filter(s => s.averageScore >= 90).length,
                B: studentPerformance.filter(s => s.averageScore >= 80 && s.averageScore < 90).length,
                C: studentPerformance.filter(s => s.averageScore >= 70 && s.averageScore < 80).length,
                D: studentPerformance.filter(s => s.averageScore >= 60 && s.averageScore < 70).length,
                F: studentPerformance.filter(s => s.averageScore < 60).length
            };

            // Get common mistakes from worksheets
            const commonMistakes = await analyzeCommonMistakes(worksheets);

            classAnalytics.push({
                classId: classDoc._id,
                className: classDoc.name,
                subject: classDoc.subject,
                gradeLevel: classDoc.gradeLevel,
                schedule: classDoc.schedule,
                metrics: {
                    totalStudents: students.length,
                    totalWorksheets: worksheets.length,
                    totalPoints: totalClassPoints,
                    totalPointsEarned: totalClassPointsEarned,
                    averageScore: classAverageScore,
                    completionRate: students.length > 0 ?
                        Math.round((studentPerformance.filter(s => s.totalWorksheets > 0).length / students.length) * 100) : 0
                },
                studentPerformance: studentPerformance,
                topPerformers: topPerformers,
                studentsNeedingSupport: studentsNeedingSupport,
                gradeDistribution: gradeDistribution,
                commonMistakes: commonMistakes,
                aiRecommendations: null // Will be populated by separate endpoint
            });
        }

        res.json({
            teacherId: teacherId,
            totalClasses: classes.length,
            generatedAt: new Date(),
            classes: classAnalytics
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to get class analytics' });
    }
});

// Get student grades for a specific class (for dropdown)
router.get('/classes/:classId/student-grades', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const teacherId = req.user.userId;
        const classId = req.params.classId;

        // Verify class belongs to teacher
        const classDoc = await db.collection('classes').findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(teacherId)
        });

        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Get all students in the class
        const students = await db.collection('students').find({
            teacherId: new ObjectId(teacherId),
            classes: new ObjectId(classId),
            isActive: true
        }).toArray();

        const studentGrades = [];

        for (const student of students) {
            // Get all worksheets for this student in this class
            const worksheets = await db.collection('worksheets').find({
                teacherId: new ObjectId(teacherId),
                classId: new ObjectId(classId),
                studentId: student._id,
                status: 'graded'
            }).toArray();

            if (worksheets.length > 0) {
                const totalPoints = worksheets.reduce((sum, w) =>
                    sum + (w.gradingResults?.totalPoints || 0), 0);
                const totalPointsEarned = worksheets.reduce((sum, w) =>
                    sum + (w.gradingResults?.totalPointsEarned || 0), 0);
                const percentage = totalPoints > 0 ? Math.round((totalPointsEarned / totalPoints) * 100) : 0;

                studentGrades.push({
                    studentId: student._id,
                    studentName: student.name,
                    totalPoints: totalPoints,
                    totalPointsEarned: totalPointsEarned,
                    percentage: percentage,
                    letterGrade: calculateLetterGrade(percentage),
                    worksheetCount: worksheets.length
                });
            } else {
                studentGrades.push({
                    studentId: student._id,
                    studentName: student.name,
                    totalPoints: 0,
                    totalPointsEarned: 0,
                    percentage: 0,
                    letterGrade: 'N/A',
                    worksheetCount: 0
                });
            }
        }

        // Sort by student name
        studentGrades.sort((a, b) => a.studentName.localeCompare(b.studentName));

        res.json({
            classId: classId,
            className: classDoc.name,
            students: studentGrades
        });

    } catch (error) {
        console.error('Student grades error:', error);
        res.status(500).json({ error: 'Failed to get student grades' });
    }
});

// Generate AI recommendations for a specific class
router.post('/classes/:classId/ai-recommendations', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const teacherId = req.user.userId;
        const classId = req.params.classId;

        // Verify class belongs to teacher
        const classDoc = await db.collection('classes').findOne({
            _id: new ObjectId(classId),
            teacherId: new ObjectId(teacherId)
        });

        if (!classDoc) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Get all worksheets for this class
        const worksheets = await db.collection('worksheets').find({
            teacherId: new ObjectId(teacherId),
            classId: new ObjectId(classId),
            status: 'graded'
        }).toArray();

        if (worksheets.length === 0) {
            return res.json({
                classId: classId,
                className: classDoc.name,
                recommendations: {
                    topics: [],
                    classStrategy: 'No worksheets available for analysis yet.',
                    individualRecommendations: [],
                    generatedAt: new Date(),
                    source: 'insufficient-data'
                }
            });
        }

        // Collect all feedback and common errors for AI analysis
        const feedbackData = [];
        const commonErrors = [];
        const studentPerformanceData = [];

        worksheets.forEach(worksheet => {
            if (worksheet.feedback) {
                feedbackData.push({
                    studentName: worksheet.studentName,
                    topic: worksheet.metadata?.assignment || 'Unknown',
                    score: worksheet.gradingResults?.totalScore || 0,
                    feedback: worksheet.feedback.summary || '',
                    weaknesses: worksheet.gradingResults?.weaknesses || [],
                    strengths: worksheet.gradingResults?.strengths || []
                });
            }

            if (worksheet.gradingResults?.commonErrors) {
                commonErrors.push(...worksheet.gradingResults.commonErrors);
            }

            studentPerformanceData.push({
                studentName: worksheet.studentName,
                topic: worksheet.metadata?.assignment || 'Unknown',
                score: worksheet.gradingResults?.totalScore || 0,
                pointsEarned: worksheet.gradingResults?.totalPointsEarned || 0,
                totalPoints: worksheet.gradingResults?.totalPoints || 0
            });
        });

        // Generate AI recommendations using Gemini
        const recommendations = await generateAIRecommendations({
            className: classDoc.name,
            subject: classDoc.subject,
            gradeLevel: classDoc.gradeLevel,
            feedbackData: feedbackData,
            commonErrors: commonErrors,
            studentPerformanceData: studentPerformanceData
        });

        // Store recommendations in analytics collection
        const analyticsDoc = {
            teacherId: new ObjectId(teacherId),
            classId: new ObjectId(classId),
            className: classDoc.name,
            aiRecommendations: recommendations,
            generatedAt: new Date(),
            updatedAt: new Date()
        };

        await db.collection('analytics').replaceOne(
            {
                teacherId: new ObjectId(teacherId),
                classId: new ObjectId(classId),
                'aiRecommendations.generatedAt': { $exists: true }
            },
            analyticsDoc,
            { upsert: true }
        );

        res.json({
            classId: classId,
            className: classDoc.name,
            recommendations: recommendations
        });

    } catch (error) {
        console.error('AI recommendations error:', error);
        res.status(500).json({ error: 'Failed to generate AI recommendations' });
    }
});

// Get saved AI recommendations for a class
router.get('/classes/:classId/ai-recommendations', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const teacherId = req.user.userId;
        const classId = req.params.classId;

        // Get saved recommendations
        const analyticsDoc = await db.collection('analytics').findOne({
            teacherId: new ObjectId(teacherId),
            classId: new ObjectId(classId),
            'aiRecommendations.generatedAt': { $exists: true }
        });

        if (!analyticsDoc || !analyticsDoc.aiRecommendations) {
            return res.json({
                classId: classId,
                recommendations: null,
                message: 'No AI recommendations generated yet. Click refresh to generate.'
            });
        }

        res.json({
            classId: classId,
            className: analyticsDoc.className,
            recommendations: analyticsDoc.aiRecommendations
        });

    } catch (error) {
        console.error('Get AI recommendations error:', error);
        res.status(500).json({ error: 'Failed to get AI recommendations' });
    }
});

// Helper functions
function calculateLetterGrade(percentage) {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
}

async function analyzeCommonMistakes(worksheets) {
    const mistakeCount = {};
    const topicMistakes = {};

    worksheets.forEach(worksheet => {
        const topic = worksheet.metadata?.assignment || 'Unknown';

        if (!topicMistakes[topic]) {
            topicMistakes[topic] = [];
        }

        if (worksheet.gradingResults?.commonErrors) {
            worksheet.gradingResults.commonErrors.forEach(error => {
                mistakeCount[error] = (mistakeCount[error] || 0) + 1;
                topicMistakes[topic].push(error);
            });
        }
    });

    // Get top 10 most common mistakes
    const sortedMistakes = Object.entries(mistakeCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([mistake, frequency]) => ({
            mistake: mistake,
            frequency: frequency,
            percentage: Math.round((frequency / worksheets.length) * 100),
            affectedStudents: worksheets.filter(w =>
                w.gradingResults?.commonErrors?.includes(mistake)
            ).length
        }));

    return sortedMistakes;
}

export default router; 