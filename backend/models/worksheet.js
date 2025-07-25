// Worksheet model schema and validation

export const WorksheetSchema = {
    teacherId: {
        type: 'ObjectId',
        required: true,
        ref: 'User'
    },
    originalName: {
        type: String,
        required: true,
        maxlength: 255
    },
    filename: {
        type: String,
        required: true,
        unique: true
    },
    filepath: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true,
        min: 0,
        max: 52428800 // 50MB
    },
    mimeType: {
        type: String,
        required: true,
        enum: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    },
    uploadDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'graded', 'error'],
        default: 'processing'
    },
    processingStage: {
        type: String,
        enum: ['uploaded', 'ocr', 'grading', 'completed'],
        default: 'uploaded'
    },
    progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    error: String,
    studentName: String,
    metadata: {
        subject: {
            type: String,
            enum: ['math', 'english', 'science', 'history', 'art', 'other', 'unknown'],
            default: 'unknown'
        },
        grade: {
            type: String,
            enum: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'unknown'],
            default: 'unknown'
        },
        assignment: {
            type: String,
            maxlength: 200,
            default: 'Untitled Assignment'
        }
    },
    ocrResults: {
        text: String,
        words: Array,
        confidence: Number,
        language: String,
        processingTime: Date,
        source: String
    },
    gradingResults: {
        totalScore: {
            type: Number,
            min: 0,
            max: 100
        },
        questions: [{
            number: Number,
            question: String,
            studentAnswer: String,
            correctAnswer: String,
            score: Number,
            maxScore: Number,
            isCorrect: Boolean,
            partialCredit: Boolean,
            feedback: String
        }],
        strengths: [String],
        weaknesses: [String],
        commonErrors: [String],
        recommendations: [String],
        gradedAt: Date,
        source: String
    },
    feedback: {
        summary: String,
        praise: String,
        improvements: String,
        nextSteps: String,
        encouragement: String,
        generatedAt: Date,
        source: String
    },
    completedAt: Date,
    updatedAt: {
        type: Date,
        default: Date.now
    },
    manuallyEdited: {
        type: Boolean,
        default: false
    }
};

// Validation functions
export function validateWorksheetUpload(fileData) {
    const errors = [];

    if (!fileData.originalname) {
        errors.push('File name is required');
    }

    if (!fileData.mimetype) {
        errors.push('File type is required');
    } else {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(fileData.mimetype)) {
            errors.push('Invalid file type. Only PDF, JPG, and PNG files are allowed');
        }
    }

    if (!fileData.size) {
        errors.push('File size is required');
    } else if (fileData.size > 52428800) { // 50MB
        errors.push('File too large. Maximum size is 50MB');
    }

    return errors;
}

export function validateWorksheetMetadata(metadata) {
    const errors = [];

    if (metadata.subject) {
        const validSubjects = ['math', 'english', 'science', 'history', 'art', 'other'];
        if (!validSubjects.includes(metadata.subject)) {
            errors.push('Invalid subject');
        }
    }

    if (metadata.grade) {
        const validGrades = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        if (!validGrades.includes(metadata.grade)) {
            errors.push('Invalid grade level');
        }
    }

    if (metadata.assignment && metadata.assignment.length > 200) {
        errors.push('Assignment name must be less than 200 characters');
    }

    return errors;
}

// Helper functions
export function createWorksheetDocument(teacherId, fileData, metadata = {}) {
    return {
        teacherId,
        originalName: fileData.originalname,
        filename: fileData.filename,
        filepath: fileData.path,
        fileSize: fileData.size,
        mimeType: fileData.mimetype,
        uploadDate: new Date(),
        status: 'processing',
        processingStage: 'uploaded',
        progress: 0,
        metadata: {
            subject: metadata.subject || 'unknown',
            grade: metadata.grade || 'unknown',
            assignment: metadata.assignment || 'Untitled Assignment'
        },
        updatedAt: new Date()
    };
}

export function updateWorksheetProgress(worksheetId, stage, progress, additionalData = {}) {
    const updateData = {
        processingStage: stage,
        progress,
        updatedAt: new Date(),
        ...additionalData
    };

    // Set status based on stage
    if (stage === 'completed') {
        updateData.status = 'completed';
        updateData.completedAt = new Date();
    } else if (stage === 'error') {
        updateData.status = 'error';
    }

    return updateData;
}

export function sanitizeWorksheetForResponse(worksheet) {
    const sanitized = { ...worksheet };
    
    // Remove sensitive server paths
    if (sanitized.filepath) {
        sanitized.filepath = undefined;
    }

    return sanitized;
}

export function getWorksheetsByStatus(worksheets, status) {
    if (!status) return worksheets;
    return worksheets.filter(w => w.status === status);
}

export function getWorksheetsBySubject(worksheets, subject) {
    if (!subject) return worksheets;
    return worksheets.filter(w => w.metadata?.subject === subject);
}

export function calculateWorksheetStats(worksheets) {
    const stats = {
        total: worksheets.length,
        processing: 0,
        completed: 0,
        graded: 0,
        error: 0,
        averageScore: 0,
        subjects: {},
        grades: {}
    };

    let totalScore = 0;
    let gradedCount = 0;

    worksheets.forEach(worksheet => {
        // Count by status
        stats[worksheet.status] = (stats[worksheet.status] || 0) + 1;

        // Calculate average score
        if (worksheet.gradingResults?.totalScore !== undefined) {
            totalScore += worksheet.gradingResults.totalScore;
            gradedCount++;
        }

        // Count by subject
        const subject = worksheet.metadata?.subject || 'unknown';
        stats.subjects[subject] = (stats.subjects[subject] || 0) + 1;

        // Count by grade
        const grade = worksheet.metadata?.grade || 'unknown';
        stats.grades[grade] = (stats.grades[grade] || 0) + 1;
    });

    if (gradedCount > 0) {
        stats.averageScore = Math.round(totalScore / gradedCount);
    }

    return stats;
}

// Processing stage helpers
export const ProcessingStages = {
    UPLOADED: 'uploaded',
    OCR: 'ocr',
    GRADING: 'grading',
    COMPLETED: 'completed'
};

export const WorksheetStatus = {
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    GRADED: 'graded',
    ERROR: 'error'
};

export function getNextStage(currentStage) {
    const stageOrder = [
        ProcessingStages.UPLOADED,
        ProcessingStages.OCR,
        ProcessingStages.GRADING,
        ProcessingStages.COMPLETED
    ];

    const currentIndex = stageOrder.indexOf(currentStage);
    return currentIndex < stageOrder.length - 1 ? stageOrder[currentIndex + 1] : currentStage;
}

export function getStageProgress(stage) {
    const progressMap = {
        [ProcessingStages.UPLOADED]: 10,
        [ProcessingStages.OCR]: 40,
        [ProcessingStages.GRADING]: 80,
        [ProcessingStages.COMPLETED]: 100
    };

    return progressMap[stage] || 0;
}