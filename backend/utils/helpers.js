// Utility functions and helpers

// Email validation
export function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Password validation - at least 8 chars with uppercase, lowercase, and numbers
export function validatePassword(password) {
    if (password.length < 8) return false;
    
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    
    return hasUppercase && hasLowercase && hasNumbers;
}

// File type validation
export function validateFileType(mimeType) {
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg', 
        'image/png'
    ];
    
    return allowedTypes.includes(mimeType.toLowerCase());
}

// Extract student name from OCR text
export function extractStudentName(ocrText) {
    if (!ocrText) return null;
    
    // Common patterns for student names on worksheets
    const namePatterns = [
        /Name:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
        /Student:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/m,
        /Name\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];
    
    for (const pattern of namePatterns) {
        const match = ocrText.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            // Validate name (should be reasonable length and contain letters)
            if (name.length >= 2 && name.length <= 50 && /^[A-Za-z\s]+$/.test(name)) {
                return name;
            }
        }
    }
    
    return null;
}

// Generate unique filename
export function generateUniqueFilename(originalName, teacherId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extension = originalName.split('.').pop();
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
    
    return `${teacherId}_${baseName}_${timestamp}_${random}.${extension}`;
}

// Format file size for display
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Calculate grade letter from percentage
export function calculateGradeLetter(percentage) {
    if (percentage >= 97) return 'A+';
    if (percentage >= 93) return 'A';
    if (percentage >= 90) return 'A-';
    if (percentage >= 87) return 'B+';
    if (percentage >= 83) return 'B';
    if (percentage >= 80) return 'B-';
    if (percentage >= 77) return 'C+';
    if (percentage >= 73) return 'C';
    if (percentage >= 70) return 'C-';
    if (percentage >= 67) return 'D+';
    if (percentage >= 63) return 'D';
    if (percentage >= 60) return 'D-';
    return 'F';
}

// Sanitize filename for safe storage
export function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Validate MongoDB ObjectId
export function isValidObjectId(id) {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(id);
}

// Generate random color for UI elements
export function generateRandomColor() {
    const colors = [
        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
        '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
        '#ec4899', '#6366f1', '#14b8a6', '#eab308'
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
}

// Parse subject from filename or text
export function parseSubjectFromText(text) {
    const subjectKeywords = {
        'math': ['math', 'arithmetic', 'algebra', 'geometry', 'calculus', 'addition', 'subtraction', 'multiplication', 'division'],
        'english': ['english', 'language arts', 'reading', 'writing', 'grammar', 'vocabulary', 'spelling', 'literature'],
        'science': ['science', 'biology', 'chemistry', 'physics', 'nature', 'experiment', 'hypothesis', 'observation'],
        'history': ['history', 'social studies', 'civics', 'government', 'geography', 'culture'],
        'art': ['art', 'drawing', 'painting', 'creative', 'design', 'artistic']
    };
    
    const lowerText = text.toLowerCase();
    
    for (const [subject, keywords] of Object.entries(subjectKeywords)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
            return subject;
        }
    }
    
    return 'unknown';
}

// Estimate grade level from content complexity
export function estimateGradeLevel(text) {
    if (!text) return 'unknown';
    
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = words.length / sentences.length;
    
    // Simple heuristic based on word and sentence complexity
    if (avgWordLength < 4 && avgSentenceLength < 8) return 'K-2';
    if (avgWordLength < 5 && avgSentenceLength < 12) return '3-5';
    if (avgWordLength < 6 && avgSentenceLength < 16) return '6-8';
    return '9-12';
}

// Clean and normalize text for processing
export function normalizeText(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s.,!?;:()\-]/g, '')
        .trim();
}

// Generate processing ID for tracking
export function generateProcessingId() {
    return 'proc_' + Date.now() + '_' + Math.random().toString(36).substring(2);
}

// Check if string contains mathematical expressions
export function containsMath(text) {
    const mathPatterns = [
        /\d+\s*[\+\-\×\*÷\/]\s*\d+/,
        /\d+\s*=\s*\d+/,
        /\d+\/\d+/,
        /\d+\.\d+/,
        /\b(add|subtract|multiply|divide|equals|sum|difference|product|quotient)\b/i
    ];
    
    return mathPatterns.some(pattern => pattern.test(text));
}

// Extract numbers from text
export function extractNumbers(text) {
    const numberRegex = /\d+(?:\.\d+)?/g;
    const matches = text.match(numberRegex);
    return matches ? matches.map(Number) : [];
}

// Calculate reading difficulty score (simplified Flesch Reading Ease)
export function calculateReadingDifficulty(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const syllables = words.reduce((count, word) => count + countSyllables(word), 0);
    
    if (sentences.length === 0 || words.length === 0) return 0;
    
    const avgSentenceLength = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;
    
    // Simplified Flesch Reading Ease formula
    const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

// Count syllables in a word (approximation)
function countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    
    let count = 0;
    let previousWasVowel = false;
    
    for (let i = 0; i < word.length; i++) {
        const isVowel = 'aeiouy'.includes(word[i]);
        if (isVowel && !previousWasVowel) {
            count++;
        }
        previousWasVowel = isVowel;
    }
    
    // Handle silent 'e'
    if (word.endsWith('e')) {
        count--;
    }
    
    return Math.max(1, count);
}

// Format date for display
export function formatDate(date, format = 'short') {
    if (!date) return '';
    
    const d = new Date(date);
    
    switch (format) {
        case 'short':
            return d.toLocaleDateString();
        case 'long':
            return d.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        case 'time':
            return d.toLocaleTimeString();
        case 'datetime':
            return d.toLocaleString();
        default:
            return d.toLocaleDateString();
    }
}

// Calculate time ago string
export function timeAgo(date) {
    if (!date) return '';
    
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

// Debounce function for API calls
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for rate limiting
export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}