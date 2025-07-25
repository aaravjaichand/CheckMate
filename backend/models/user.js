// User model schema and validation

export const UserSchema = {
    auth0Id: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        validate: {
            validator: function(email) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            },
            message: 'Please provide a valid email address'
        }
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    picture: {
        type: String,
        trim: true
    },
    school: {
        type: String,
        trim: true,
        maxlength: 200
    },
    role: {
        type: String,
        enum: ['teacher', 'admin'],
        default: 'teacher'
    },
    plan: {
        type: String,
        enum: ['freemium', 'teacher-pro', 'school'],
        default: 'freemium'
    },
    worksheetsProcessed: {
        type: Number,
        default: 0,
        min: 0
    },
    monthlyLimit: {
        type: Number,
        default: 50,
        min: 0
    },
    preferences: {
        feedbackTone: {
            type: String,
            enum: ['encouraging', 'strict', 'funny'],
            default: 'encouraging'
        },
        gradeDisplay: {
            type: String,
            enum: ['percentage', 'letter', 'points'],
            default: 'percentage'
        },
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            processing: {
                type: Boolean,
                default: true
            },
            weekly: {
                type: Boolean,
                default: false
            }
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    }
};

// User validation functions
export function validateUserCreation(userData) {
    const errors = [];

    if (!userData.auth0Id) {
        errors.push('Auth0 ID is required');
    }

    if (!userData.email) {
        errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
        errors.push('Please provide a valid email address');
    }

    if (!userData.name) {
        errors.push('Name is required');
    } else if (userData.name.length > 100) {
        errors.push('Name must be less than 100 characters');
    }

    if (userData.school && userData.school.length > 200) {
        errors.push('School name must be less than 200 characters');
    }

    return errors;
}

export function validateUserUpdate(userData) {
    const errors = [];

    if (userData.name && userData.name.length > 100) {
        errors.push('Name must be less than 100 characters');
    }

    if (userData.school && userData.school.length > 200) {
        errors.push('School name must be less than 200 characters');
    }

    if (userData.preferences) {
        const { feedbackTone, gradeDisplay } = userData.preferences;
        
        if (feedbackTone && !['encouraging', 'strict', 'funny'].includes(feedbackTone)) {
            errors.push('Invalid feedback tone');
        }

        if (gradeDisplay && !['percentage', 'letter', 'points'].includes(gradeDisplay)) {
            errors.push('Invalid grade display format');
        }
    }

    return errors;
}

// Helper functions for user operations
export function createUserDocument(userData) {
    return {
        auth0Id: userData.auth0Id,
        email: userData.email.toLowerCase(),
        name: userData.name.trim(),
        school: userData.school ? userData.school.trim() : '',
        role: 'teacher',
        plan: 'freemium',
        worksheetsProcessed: 0,
        monthlyLimit: 50,
        preferences: {
            feedbackTone: 'encouraging',
            gradeDisplay: 'percentage',
            notifications: {
                email: true,
                processing: true,
                weekly: false
            }
        },
        createdAt: new Date(),
        lastLogin: new Date(),
        isActive: true
    };
}

export function sanitizeUserForResponse(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    return sanitized;
}

export function getPlanLimits(plan) {
    const limits = {
        freemium: {
            monthlyLimit: 50,
            features: ['basic-grading', 'standard-feedback']
        },
        'teacher-pro': {
            monthlyLimit: -1, // Unlimited
            features: ['advanced-grading', 'personalized-feedback', 'analytics', 'export']
        },
        school: {
            monthlyLimit: -1, // Unlimited
            features: ['all-features', 'admin-dashboard', 'sso', 'priority-support']
        }
    };

    return limits[plan] || limits.freemium;
}