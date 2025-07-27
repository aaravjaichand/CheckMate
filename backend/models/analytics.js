// Analytics model schema and validation

export const AnalyticsSchema = {
    teacherId: {
        type: 'ObjectId',
        required: true,
        ref: 'User'
    },
    classId: {
        type: 'ObjectId',
        required: true,
        ref: 'Class'
    },
    className: {
        type: String,
        required: true
    },
    period: {
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        type: {
            type: String,
            enum: ['weekly', 'monthly', 'quarterly', 'semester', 'yearly'],
            default: 'monthly'
        }
    },
    classMetrics: {
        totalStudents: {
            type: Number,
            default: 0
        },
        totalWorksheets: {
            type: Number,
            default: 0
        },
        totalPoints: {
            type: Number,
            default: 0
        },
        totalPointsEarned: {
            type: Number,
            default: 0
        },
        averageScore: {
            type: Number,
            default: 0
        },
        highestScore: {
            type: Number,
            default: 0
        },
        lowestScore: {
            type: Number,
            default: 0
        }
    },
    studentPerformance: [{
        studentId: {
            type: 'ObjectId',
            ref: 'Student',
            required: true
        },
        studentName: {
            type: String,
            required: true
        },
        totalWorksheets: {
            type: Number,
            default: 0
        },
        totalPoints: {
            type: Number,
            default: 0
        },
        totalPointsEarned: {
            type: Number,
            default: 0
        },
        averageScore: {
            type: Number,
            default: 0
        },
        grade: {
            type: String,
            enum: ['A', 'B', 'C', 'D', 'F'],
            default: 'F'
        },
        needsSupport: {
            type: Boolean,
            default: false
        },
        improvement: {
            type: Number,
            default: 0
        },
        lastActivity: {
            type: Date
        }
    }],
    topPerformers: [{
        studentId: {
            type: 'ObjectId',
            ref: 'Student'
        },
        studentName: String,
        averageScore: Number,
        totalWorksheets: Number,
        rank: Number
    }],
    studentsNeedingSupport: [{
        studentId: {
            type: 'ObjectId',
            ref: 'Student'
        },
        studentName: String,
        averageScore: Number,
        totalWorksheets: Number,
        weakAreas: [String],
        priority: {
            type: String,
            enum: ['high', 'medium', 'low'],
            default: 'medium'
        }
    }],
    commonMistakes: [{
        topic: String,
        frequency: Number,
        percentage: Number,
        affectedStudents: Number,
        examples: [String]
    }],
    aiRecommendations: {
        topics: [{
            topic: String,
            description: String,
            priority: {
                type: String,
                enum: ['high', 'medium', 'low'],
                default: 'medium'
            },
            studentsAffected: Number,
            suggestedActivities: [String]
        }],
        classStrategy: String,
        individualRecommendations: [{
            studentId: {
                type: 'ObjectId',
                ref: 'Student'
            },
            studentName: String,
            recommendations: [String]
        }],
        generatedAt: {
            type: Date,
            default: Date.now
        },
        source: {
            type: String,
            default: 'gemini-2.5'
        }
    },
    gradeDistribution: {
        A: { type: Number, default: 0 },
        B: { type: Number, default: 0 },
        C: { type: Number, default: 0 },
        D: { type: Number, default: 0 },
        F: { type: Number, default: 0 }
    },
    subjectBreakdown: {
        subject: String,
        averageScore: Number,
        topicPerformance: [{
            topic: String,
            averageScore: Number,
            strugglingStudents: Number
        }]
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
};

// Validation functions
export function validateAnalyticsCreation(analyticsData) {
    const errors = [];

    if (!analyticsData.teacherId) {
        errors.push('Teacher ID is required');
    }

    if (!analyticsData.classId) {
        errors.push('Class ID is required');
    }

    if (!analyticsData.className) {
        errors.push('Class name is required');
    }

    if (!analyticsData.period?.startDate) {
        errors.push('Period start date is required');
    }

    if (!analyticsData.period?.endDate) {
        errors.push('Period end date is required');
    }

    return errors;
}

// Helper functions
export function createAnalyticsDocument(teacherId, classId, className, periodData, metricsData) {
    return {
        teacherId,
        classId,
        className,
        period: {
            startDate: periodData.startDate,
            endDate: periodData.endDate,
            type: periodData.type || 'monthly'
        },
        classMetrics: {
            totalStudents: metricsData.totalStudents || 0,
            totalWorksheets: metricsData.totalWorksheets || 0,
            totalPoints: metricsData.totalPoints || 0,
            totalPointsEarned: metricsData.totalPointsEarned || 0,
            averageScore: metricsData.averageScore || 0,
            highestScore: metricsData.highestScore || 0,
            lowestScore: metricsData.lowestScore || 0
        },
        studentPerformance: metricsData.studentPerformance || [],
        topPerformers: metricsData.topPerformers || [],
        studentsNeedingSupport: metricsData.studentsNeedingSupport || [],
        commonMistakes: metricsData.commonMistakes || [],
        aiRecommendations: {
            topics: [],
            classStrategy: '',
            individualRecommendations: [],
            generatedAt: new Date(),
            source: 'gemini-2.5'
        },
        gradeDistribution: {
            A: 0,
            B: 0,
            C: 0,
            D: 0,
            F: 0
        },
        subjectBreakdown: metricsData.subjectBreakdown || {},
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

export function calculateGradeFromScore(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

export function determineNeedsSupport(averageScore, improvementTrend = 0) {
    return averageScore < 80 || improvementTrend < -5;
}

export function updateAnalyticsMetrics(analyticsDoc, newMetrics) {
    analyticsDoc.classMetrics = { ...analyticsDoc.classMetrics, ...newMetrics };
    analyticsDoc.updatedAt = new Date();
    return analyticsDoc;
}

export function addStudentPerformance(analyticsDoc, studentData) {
    const existingIndex = analyticsDoc.studentPerformance.findIndex(
        s => s.studentId.toString() === studentData.studentId.toString()
    );

    if (existingIndex !== -1) {
        analyticsDoc.studentPerformance[existingIndex] = {
            ...analyticsDoc.studentPerformance[existingIndex],
            ...studentData
        };
    } else {
        analyticsDoc.studentPerformance.push(studentData);
    }

    analyticsDoc.updatedAt = new Date();
    return analyticsDoc;
}

export function generateTopPerformers(studentPerformance, limit = 5) {
    return studentPerformance
        .filter(student => student.totalWorksheets > 0)
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, limit)
        .map((student, index) => ({
            studentId: student.studentId,
            studentName: student.studentName,
            averageScore: student.averageScore,
            totalWorksheets: student.totalWorksheets,
            rank: index + 1
        }));
}

export function generateStudentsNeedingSupport(studentPerformance) {
    return studentPerformance
        .filter(student => determineNeedsSupport(student.averageScore, student.improvement))
        .sort((a, b) => a.averageScore - b.averageScore)
        .map(student => ({
            studentId: student.studentId,
            studentName: student.studentName,
            averageScore: student.averageScore,
            totalWorksheets: student.totalWorksheets,
            weakAreas: [], // To be filled by AI analysis
            priority: student.averageScore < 60 ? 'high' : student.averageScore < 70 ? 'medium' : 'low'
        }));
}

export function updateGradeDistribution(analyticsDoc) {
    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    analyticsDoc.studentPerformance.forEach(student => {
        const grade = calculateGradeFromScore(student.averageScore);
        distribution[grade]++;
    });

    analyticsDoc.gradeDistribution = distribution;
    analyticsDoc.updatedAt = new Date();
    return analyticsDoc;
}

// Period helpers
export function getCurrentPeriod(type = 'monthly') {
    const now = new Date();
    let startDate, endDate;

    switch (type) {
        case 'weekly':
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
            const endOfWeek = new Date(now.setDate(startOfWeek.getDate() + 6));
            startDate = startOfWeek;
            endDate = endOfWeek;
            break;
        case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
            break;
        case 'semester':
            const semester = now.getMonth() < 6 ? 0 : 1;
            startDate = new Date(now.getFullYear(), semester * 6, 1);
            endDate = new Date(now.getFullYear(), (semester + 1) * 6, 0);
            break;
        case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return { startDate, endDate, type };
} 