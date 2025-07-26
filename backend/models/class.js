// Class model schema and validation

export const ClassSchema = {
    teacherId: {
        type: 'ObjectId',
        required: true,
        ref: 'User'
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    subject: {
        type: String,
        required: true,
        enum: ['math', 'english', 'science', 'history', 'art', 'other'],
        default: 'other'
    },
    gradeLevel: {
        type: String,
        enum: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        required: true
    },
    students: [{
        type: 'ObjectId',
        ref: 'Student'
    }],
    description: {
        type: String,
        maxlength: 500
    },
    schoolYear: {
        type: String,
        default: function() {
            const year = new Date().getFullYear();
            return `${year}-${year + 1}`;
        }
    },
    semester: {
        type: String,
        enum: ['fall', 'spring', 'summer', 'year'],
        default: 'fall'
    },
    schedule: {
        days: [{
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }],
        startTime: String,
        endTime: String,
        room: String
    },
    settings: {
        allowLateSubmissions: {
            type: Boolean,
            default: true
        },
        defaultGradingScale: {
            type: String,
            enum: ['percentage', 'letter', 'points'],
            default: 'percentage'
        },
        feedbackStyle: {
            type: String,
            enum: ['encouraging', 'strict', 'funny'],
            default: 'encouraging'
        }
    },
    isActive: {
        type: Boolean,
        default: true
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
export function validateClassCreation(classData) {
    const errors = [];

    // teacherId will be set from JWT token, not from request body

    if (!classData.name) {
        errors.push('Class name is required');
    } else if (classData.name.length > 100) {
        errors.push('Class name must be less than 100 characters');
    }

    if (!classData.subject) {
        errors.push('Subject is required');
    } else if (!['math', 'english', 'science', 'history', 'art', 'other'].includes(classData.subject)) {
        errors.push('Invalid subject');
    }

    if (!classData.gradeLevel) {
        errors.push('Grade level is required');
    } else if (!['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].includes(classData.gradeLevel)) {
        errors.push('Invalid grade level');
    }

    if (classData.description && classData.description.length > 500) {
        errors.push('Description must be less than 500 characters');
    }

    if (classData.semester && !['fall', 'spring', 'summer', 'year'].includes(classData.semester)) {
        errors.push('Invalid semester');
    }

    return errors;
}

export function validateClassUpdate(classData) {
    const errors = [];

    if (classData.name && classData.name.length > 100) {
        errors.push('Class name must be less than 100 characters');
    }

    if (classData.subject && !['math', 'english', 'science', 'history', 'art', 'other'].includes(classData.subject)) {
        errors.push('Invalid subject');
    }

    if (classData.gradeLevel && !['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].includes(classData.gradeLevel)) {
        errors.push('Invalid grade level');
    }

    if (classData.description && classData.description.length > 500) {
        errors.push('Description must be less than 500 characters');
    }

    if (classData.semester && !['fall', 'spring', 'summer', 'year'].includes(classData.semester)) {
        errors.push('Invalid semester');
    }

    return errors;
}

// Helper functions
export function createClassDocument(teacherId, classData) {
    const currentYear = new Date().getFullYear();
    
    return {
        teacherId,
        name: classData.name.trim(),
        subject: classData.subject,
        gradeLevel: classData.gradeLevel,
        students: classData.students || [],
        description: classData.description?.trim() || '',
        schoolYear: classData.schoolYear || `${currentYear}-${currentYear + 1}`,
        semester: classData.semester || 'fall',
        schedule: {
            days: classData.schedule?.days || [],
            startTime: classData.schedule?.startTime || '',
            endTime: classData.schedule?.endTime || '',
            room: classData.schedule?.room || ''
        },
        settings: {
            allowLateSubmissions: classData.settings?.allowLateSubmissions !== false,
            defaultGradingScale: classData.settings?.defaultGradingScale || 'percentage',
            feedbackStyle: classData.settings?.feedbackStyle || 'encouraging'
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

export function sanitizeClassForResponse(classDoc) {
    const sanitized = { ...classDoc };
    // Remove any sensitive data if needed
    return sanitized;
}

export function getClassesBySubject(classes, subject) {
    if (!subject) return classes;
    return classes.filter(c => c.subject === subject);
}

export function getClassesByGrade(classes, gradeLevel) {
    if (!gradeLevel) return classes;
    return classes.filter(c => c.gradeLevel === gradeLevel);
}

export function searchClasses(classes, searchTerm) {
    if (!searchTerm) return classes;
    const term = searchTerm.toLowerCase();
    return classes.filter(c => 
        c.name.toLowerCase().includes(term) ||
        c.subject.toLowerCase().includes(term) ||
        c.description?.toLowerCase().includes(term) ||
        c.schedule?.room?.toLowerCase().includes(term)
    );
}

export function addStudentToClass(classDoc, studentId) {
    if (!classDoc.students.includes(studentId)) {
        classDoc.students.push(studentId);
        classDoc.updatedAt = new Date();
    }
    return classDoc;
}

export function removeStudentFromClass(classDoc, studentId) {
    classDoc.students = classDoc.students.filter(id => id.toString() !== studentId.toString());
    classDoc.updatedAt = new Date();
    return classDoc;
}

// Stats helper
export function calculateClassStats(classes) {
    const stats = {
        total: classes.length,
        active: 0,
        inactive: 0,
        bySubject: {},
        byGrade: {},
        totalStudents: 0,
        avgStudentsPerClass: 0,
        recentlyCreated: 0
    };

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let totalStudentCount = 0;

    classes.forEach(classDoc => {
        if (classDoc.isActive) {
            stats.active++;
        } else {
            stats.inactive++;
        }

        // Count by subject
        const subject = classDoc.subject || 'unknown';
        stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1;

        // Count by grade
        const grade = classDoc.gradeLevel || 'unknown';
        stats.byGrade[grade] = (stats.byGrade[grade] || 0) + 1;

        // Count students
        const studentCount = classDoc.students ? classDoc.students.length : 0;
        totalStudentCount += studentCount;

        // Recently created
        if (classDoc.createdAt && new Date(classDoc.createdAt) > oneWeekAgo) {
            stats.recentlyCreated++;
        }
    });

    stats.totalStudents = totalStudentCount;
    stats.avgStudentsPerClass = classes.length > 0 ? Math.round(totalStudentCount / classes.length) : 0;

    return stats;
}

// Subject display helper
export function getSubjectDisplayName(subject) {
    const displayNames = {
        'math': 'Mathematics',
        'english': 'English/Language Arts',
        'science': 'Science',
        'history': 'History/Social Studies',
        'art': 'Art',
        'other': 'Other'
    };
    return displayNames[subject] || subject;
}

// Grade display helper
export function getGradeDisplayName(gradeLevel) {
    if (gradeLevel === 'K') return 'Kindergarten';
    return `Grade ${gradeLevel}`;
}