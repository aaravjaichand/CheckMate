// Student model schema and validation

export const StudentSchema = {
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
    classes: [{
        type: 'ObjectId',
        ref: 'Class'
    }],
    grade: {
        type: String,
        enum: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        default: 'K'
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(email) {
                return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            },
            message: 'Please provide a valid email address'
        }
    },
    parentContact: {
        name: {
            type: String,
            trim: true,
            maxlength: 100
        },
        email: {
            type: String,
            trim: true,
            lowercase: true
        },
        phone: {
            type: String,
            trim: true,
            maxlength: 20
        }
    },
    notes: {
        type: String,
        maxlength: 500
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
export function validateStudentCreation(studentData) {
    const errors = [];

    // teacherId will be set from JWT token, not from request body
    
    if (!studentData.name) {
        errors.push('Student name is required');
    } else if (studentData.name.length > 100) {
        errors.push('Student name must be less than 100 characters');
    }

    if (studentData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentData.email)) {
        errors.push('Please provide a valid email address');
    }

    if (studentData.grade && !['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].includes(studentData.grade)) {
        errors.push('Invalid grade level');
    }

    if (studentData.notes && studentData.notes.length > 500) {
        errors.push('Notes must be less than 500 characters');
    }

    return errors;
}

export function validateStudentUpdate(studentData) {
    const errors = [];

    if (studentData.name && studentData.name.length > 100) {
        errors.push('Student name must be less than 100 characters');
    }

    if (studentData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentData.email)) {
        errors.push('Please provide a valid email address');
    }

    if (studentData.grade && !['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].includes(studentData.grade)) {
        errors.push('Invalid grade level');
    }

    if (studentData.notes && studentData.notes.length > 500) {
        errors.push('Notes must be less than 500 characters');
    }

    return errors;
}

// Helper functions
export function createStudentDocument(teacherId, studentData) {
    return {
        teacherId,
        name: studentData.name.trim(),
        classes: studentData.classes || [],
        grade: studentData.grade || 'K',
        email: studentData.email ? studentData.email.toLowerCase().trim() : '',
        parentContact: {
            name: studentData.parentContact?.name?.trim() || '',
            email: studentData.parentContact?.email?.toLowerCase().trim() || '',
            phone: studentData.parentContact?.phone?.trim() || ''
        },
        notes: studentData.notes?.trim() || '',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

export function sanitizeStudentForResponse(student) {
    const sanitized = { ...student };
    // Remove any sensitive data if needed
    return sanitized;
}

export function getStudentsByClass(students, classId) {
    if (!classId) return students;
    return students.filter(s => s.classes.includes(classId));
}

export function getStudentsByGrade(students, grade) {
    if (!grade) return students;
    return students.filter(s => s.grade === grade);
}

export function searchStudents(students, searchTerm) {
    if (!searchTerm) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(s => 
        s.name.toLowerCase().includes(term) ||
        s.email.toLowerCase().includes(term) ||
        s.parentContact?.name?.toLowerCase().includes(term) ||
        s.parentContact?.email?.toLowerCase().includes(term)
    );
}

// Stats helper
export function calculateStudentStats(students) {
    const stats = {
        total: students.length,
        active: 0,
        inactive: 0,
        byGrade: {},
        recentlyAdded: 0
    };

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    students.forEach(student => {
        if (student.isActive) {
            stats.active++;
        } else {
            stats.inactive++;
        }

        const grade = student.grade || 'Unknown';
        stats.byGrade[grade] = (stats.byGrade[grade] || 0) + 1;

        if (student.createdAt && new Date(student.createdAt) > oneWeekAgo) {
            stats.recentlyAdded++;
        }
    });

    return stats;
}