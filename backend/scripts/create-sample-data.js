import { MongoClient, ObjectId } from 'mongodb';

const TEACHER_ID = new ObjectId('688509985e8c64ab9178c9a6');
const DB_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017/checkmate';

async function createSampleData() {
    const client = new MongoClient(DB_URL);

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('checkmate');

        // Clear existing data for this teacher
        console.log('Clearing existing data...');
        await db.collection('classes').deleteMany({ teacherId: TEACHER_ID });
        await db.collection('students').deleteMany({ teacherId: TEACHER_ID });
        await db.collection('worksheets').deleteMany({ teacherId: TEACHER_ID });
        await db.collection('analytics').deleteMany({ teacherId: TEACHER_ID });

        // Create classes
        console.log('Creating sample classes...');
        const algebraClass1 = {
            _id: new ObjectId(),
            teacherId: TEACHER_ID,
            name: 'Algebra 1',
            subject: 'math',
            gradeLevel: '9',
            students: [],
            description: 'Introduction to algebraic concepts and equations',
            schoolYear: '2024-2025',
            semester: 'fall',
            schedule: {
                days: ['monday', 'wednesday', 'friday'],
                startTime: '09:00',
                endTime: '10:00',
                room: 'Room 101'
            },
            settings: {
                allowLateSubmissions: true,
                defaultGradingScale: 'percentage',
                feedbackStyle: 'encouraging'
            },
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const algebraClass2 = {
            _id: new ObjectId(),
            teacherId: TEACHER_ID,
            name: 'Algebra 2',
            subject: 'math',
            gradeLevel: '10',
            students: [],
            description: 'Advanced algebraic concepts and functions',
            schoolYear: '2024-2025',
            semester: 'fall',
            schedule: {
                days: ['tuesday', 'thursday'],
                startTime: '10:30',
                endTime: '12:00',
                room: 'Room 102'
            },
            settings: {
                allowLateSubmissions: true,
                defaultGradingScale: 'percentage',
                feedbackStyle: 'encouraging'
            },
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await db.collection('classes').insertMany([algebraClass1, algebraClass2]);
        console.log('Created classes: Algebra 1 and Algebra 2');

        // Create students for Algebra 1
        console.log('Creating students for Algebra 1...');
        const algebra1Students = [
            'Emma Johnson', 'Liam Smith', 'Olivia Williams', 'Noah Brown', 'Ava Jones',
            'William Garcia', 'Sophia Miller', 'James Davis', 'Isabella Rodriguez', 'Benjamin Wilson',
            'Mia Martinez', 'Lucas Anderson', 'Charlotte Taylor', 'Henry Thomas', 'Amelia Jackson'
        ].map((name, index) => ({
            _id: new ObjectId(),
            teacherId: TEACHER_ID,
            name: name,
            classes: [algebraClass1._id],
            grade: '9',
            email: `${name.toLowerCase().replace(' ', '.')}@school.edu`,
            parentContact: {
                name: `Parent of ${name}`,
                email: `parent.${name.toLowerCase().replace(' ', '.')}@email.com`,
                phone: `555-010${index.toString().padStart(2, '0')}`
            },
            notes: `Student in Algebra 1 class`,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }));

        // Create students for Algebra 2
        console.log('Creating students for Algebra 2...');
        const algebra2Students = [
            'Ethan Moore', 'Abigail Thompson', 'Alexander White', 'Harper Lopez', 'Sebastian Lee',
            'Emily Gonzalez', 'Jacob Harris', 'Elizabeth Clark', 'Samuel Lewis', 'Sofia Robinson',
            'David Walker', 'Avery Perez', 'Carter Hall', 'Ella Young', 'Daniel Allen'
        ].map((name, index) => ({
            _id: new ObjectId(),
            teacherId: TEACHER_ID,
            name: name,
            classes: [algebraClass2._id],
            grade: '10',
            email: `${name.toLowerCase().replace(' ', '.')}@school.edu`,
            parentContact: {
                name: `Parent of ${name}`,
                email: `parent.${name.toLowerCase().replace(' ', '.')}@email.com`,
                phone: `555-020${index.toString().padStart(2, '0')}`
            },
            notes: `Student in Algebra 2 class`,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }));

        await db.collection('students').insertMany([...algebra1Students, ...algebra2Students]);
        console.log(`Created ${algebra1Students.length} students for Algebra 1 and ${algebra2Students.length} students for Algebra 2`);

        // Update classes with student IDs
        await db.collection('classes').updateOne(
            { _id: algebraClass1._id },
            { $set: { students: algebra1Students.map(s => s._id) } }
        );

        await db.collection('classes').updateOne(
            { _id: algebraClass2._id },
            { $set: { students: algebra2Students.map(s => s._id) } }
        );

        // Create sample worksheets with varied performance
        console.log('Creating sample worksheets...');
        const worksheets = [];
        const topics = {
            algebra1: ['Linear Equations', 'Graphing Lines', 'Systems of Equations', 'Factoring', 'Quadratic Functions'],
            algebra2: ['Polynomial Functions', 'Exponential Functions', 'Logarithms', 'Trigonometry', 'Sequences and Series']
        };

        // Create worksheets for Algebra 1 students
        for (const student of algebra1Students) {
            for (let i = 0; i < 5; i++) {
                const topic = topics.algebra1[i];
                const questionsCount = Math.floor(Math.random() * 5) + 5; // 5-9 questions
                const questions = [];
                let totalPoints = 0;
                let totalPointsEarned = 0;

                // Generate varied performance based on student
                const performanceLevel = getStudentPerformanceLevel(student.name);

                for (let j = 1; j <= questionsCount; j++) {
                    const maxScore = Math.floor(Math.random() * 3) + 3; // 3-5 points per question
                    const difficulty = Math.random();
                    let score;

                    if (performanceLevel === 'high') {
                        score = difficulty < 0.8 ? maxScore : Math.floor(maxScore * 0.8);
                    } else if (performanceLevel === 'medium') {
                        score = difficulty < 0.6 ? Math.floor(maxScore * 0.8) : Math.floor(maxScore * 0.6);
                    } else {
                        score = difficulty < 0.4 ? Math.floor(maxScore * 0.6) : Math.floor(maxScore * 0.4);
                    }

                    totalPoints += maxScore;
                    totalPointsEarned += score;

                    questions.push({
                        number: j,
                        question: `${topic} Problem ${j}`,
                        studentAnswer: `Student solution ${j}`,
                        correctAnswer: `Correct solution ${j}`,
                        score: score,
                        maxScore: maxScore,
                        isCorrect: score === maxScore,
                        partialCredit: score > 0 && score < maxScore,
                        feedback: score === maxScore ? 'Excellent!' : score > 0 ? 'Good work, minor errors.' : 'Needs improvement.'
                    });
                }

                const totalScore = Math.round((totalPointsEarned / totalPoints) * 100);
                const uploadDate = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000); // Last 30 days

                worksheets.push({
                    _id: new ObjectId(),
                    teacherId: TEACHER_ID,
                    originalName: `${topic.replace(/\s+/g, '_')}_${student.name.replace(/\s+/g, '_')}.pdf`,
                    filename: `worksheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`,
                    filepath: '/uploads/sample_worksheet.pdf',
                    fileSize: Math.floor(Math.random() * 1000000) + 500000, // 500KB-1.5MB
                    mimeType: 'application/pdf',
                    uploadDate: uploadDate,
                    status: 'graded',
                    processingStage: 'completed',
                    progress: 100,
                    studentId: student._id,
                    studentName: student.name,
                    classId: algebraClass1._id,
                    className: 'Algebra 1',
                    metadata: {
                        subject: 'math',
                        grade: '9',
                        assignment: topic
                    },
                    gradingResults: {
                        totalScore: totalScore,
                        totalPoints: totalPoints,
                        totalPointsEarned: totalPointsEarned,
                        questions: questions,
                        strengths: getStrengthsForTopic(topic),
                        weaknesses: getWeaknessesForPerformance(performanceLevel),
                        commonErrors: getCommonErrorsForTopic(topic),
                        recommendations: getRecommendationsForTopic(topic),
                        gradedAt: new Date(uploadDate.getTime() + 60000), // 1 minute after upload
                        source: 'gemini'
                    },
                    feedback: {
                        summary: `Good work on ${topic}!`,
                        praise: 'Shows understanding of key concepts.',
                        improvements: 'Practice more complex problems.',
                        nextSteps: `Continue with advanced ${topic} exercises.`,
                        encouragement: 'Keep up the excellent progress!',
                        generatedAt: new Date(uploadDate.getTime() + 60000),
                        source: 'gemini'
                    },
                    completedAt: new Date(uploadDate.getTime() + 60000),
                    updatedAt: new Date()
                });
            }
        }

        // Create worksheets for Algebra 2 students
        for (const student of algebra2Students) {
            for (let i = 0; i < 5; i++) {
                const topic = topics.algebra2[i];
                const questionsCount = Math.floor(Math.random() * 5) + 6; // 6-10 questions
                const questions = [];
                let totalPoints = 0;
                let totalPointsEarned = 0;

                const performanceLevel = getStudentPerformanceLevel(student.name);

                for (let j = 1; j <= questionsCount; j++) {
                    const maxScore = Math.floor(Math.random() * 4) + 3; // 3-6 points per question
                    const difficulty = Math.random();
                    let score;

                    if (performanceLevel === 'high') {
                        score = difficulty < 0.8 ? maxScore : Math.floor(maxScore * 0.9);
                    } else if (performanceLevel === 'medium') {
                        score = difficulty < 0.6 ? Math.floor(maxScore * 0.8) : Math.floor(maxScore * 0.65);
                    } else {
                        score = difficulty < 0.4 ? Math.floor(maxScore * 0.6) : Math.floor(maxScore * 0.45);
                    }

                    totalPoints += maxScore;
                    totalPointsEarned += score;

                    questions.push({
                        number: j,
                        question: `${topic} Problem ${j}`,
                        studentAnswer: `Student solution ${j}`,
                        correctAnswer: `Correct solution ${j}`,
                        score: score,
                        maxScore: maxScore,
                        isCorrect: score === maxScore,
                        partialCredit: score > 0 && score < maxScore,
                        feedback: score === maxScore ? 'Perfect!' : score > 0 ? 'Good understanding, check calculations.' : 'Review the concept again.'
                    });
                }

                const totalScore = Math.round((totalPointsEarned / totalPoints) * 100);
                const uploadDate = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000);

                worksheets.push({
                    _id: new ObjectId(),
                    teacherId: TEACHER_ID,
                    originalName: `${topic.replace(/\s+/g, '_')}_${student.name.replace(/\s+/g, '_')}.pdf`,
                    filename: `worksheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`,
                    filepath: '/uploads/sample_worksheet.pdf',
                    fileSize: Math.floor(Math.random() * 1000000) + 500000,
                    mimeType: 'application/pdf',
                    uploadDate: uploadDate,
                    status: 'graded',
                    processingStage: 'completed',
                    progress: 100,
                    studentId: student._id,
                    studentName: student.name,
                    classId: algebraClass2._id,
                    className: 'Algebra 2',
                    metadata: {
                        subject: 'math',
                        grade: '10',
                        assignment: topic
                    },
                    gradingResults: {
                        totalScore: totalScore,
                        totalPoints: totalPoints,
                        totalPointsEarned: totalPointsEarned,
                        questions: questions,
                        strengths: getStrengthsForTopic(topic),
                        weaknesses: getWeaknessesForPerformance(performanceLevel),
                        commonErrors: getCommonErrorsForTopic(topic),
                        recommendations: getRecommendationsForTopic(topic),
                        gradedAt: new Date(uploadDate.getTime() + 60000),
                        source: 'gemini'
                    },
                    feedback: {
                        summary: `Solid effort on ${topic}!`,
                        praise: 'Demonstrates good problem-solving skills.',
                        improvements: 'Focus on computational accuracy.',
                        nextSteps: `Prepare for more advanced ${topic} concepts.`,
                        encouragement: 'Your hard work is paying off!',
                        generatedAt: new Date(uploadDate.getTime() + 60000),
                        source: 'gemini'
                    },
                    completedAt: new Date(uploadDate.getTime() + 60000),
                    updatedAt: new Date()
                });
            }
        }

        await db.collection('worksheets').insertMany(worksheets);
        console.log(`Created ${worksheets.length} sample worksheets`);

        console.log('Sample data creation completed successfully!');
        console.log(`\nSummary:`);
        console.log(`- Teacher ID: ${TEACHER_ID}`);
        console.log(`- Classes: 2 (Algebra 1, Algebra 2)`);
        console.log(`- Students: ${algebra1Students.length + algebra2Students.length} total`);
        console.log(`- Worksheets: ${worksheets.length} total`);

    } catch (error) {
        console.error('Error creating sample data:', error);
    } finally {
        await client.close();
    }
}

// Helper functions for generating varied data
function getStudentPerformanceLevel(studentName) {
    // Create consistent performance levels based on name hash
    const hash = studentName.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    const mod = Math.abs(hash) % 10;

    if (mod < 3) return 'high';    // 30% high performers
    if (mod < 7) return 'medium';  // 40% medium performers
    return 'low';                  // 30% need support
}

function getStrengthsForTopic(topic) {
    const strengths = {
        'Linear Equations': ['Shows understanding of algebraic manipulation', 'Good grasp of solving for variables'],
        'Graphing Lines': ['Understands coordinate plane concepts', 'Can identify slope and intercepts'],
        'Systems of Equations': ['Shows multiple solution methods', 'Good organizational skills'],
        'Factoring': ['Recognizes common patterns', 'Shows step-by-step work'],
        'Quadratic Functions': ['Understands parabola properties', 'Can complete the square'],
        'Polynomial Functions': ['Identifies degree and leading coefficient', 'Shows good algebraic manipulation'],
        'Exponential Functions': ['Understands growth and decay patterns', 'Good with exponential rules'],
        'Logarithms': ['Shows understanding of inverse operations', 'Can apply log properties'],
        'Trigonometry': ['Understands unit circle concepts', 'Good with angle measurements'],
        'Sequences and Series': ['Recognizes patterns', 'Shows good computational skills']
    };

    return strengths[topic] || ['Shows good effort', 'Follows instructions well'];
}

function getWeaknessesForPerformance(performanceLevel) {
    const weaknesses = {
        'high': ['Minor calculation errors', 'Could show more detailed work'],
        'medium': ['Some conceptual gaps', 'Inconsistent problem-solving approach'],
        'low': ['Needs review of fundamental concepts', 'Requires more practice with basic operations']
    };

    return weaknesses[performanceLevel] || ['Needs improvement'];
}

function getCommonErrorsForTopic(topic) {
    const errors = {
        'Linear Equations': ['Sign errors when moving terms', 'Forgetting to distribute negative signs'],
        'Graphing Lines': ['Mixing up x and y coordinates', 'Incorrect slope calculation'],
        'Systems of Equations': ['Arithmetic errors in elimination', 'Not checking solutions'],
        'Factoring': ['Missing common factors', 'Incorrect sign patterns'],
        'Quadratic Functions': ['Errors in completing the square', 'Wrong vertex form'],
        'Polynomial Functions': ['Degree identification errors', 'End behavior mistakes'],
        'Exponential Functions': ['Confusing growth vs decay', 'Base calculation errors'],
        'Logarithms': ['Mixing up log properties', 'Domain restriction errors'],
        'Trigonometry': ['Angle conversion mistakes', 'Reference angle errors'],
        'Sequences and Series': ['Pattern recognition issues', 'Formula application errors']
    };

    return errors[topic] || ['Calculation mistakes', 'Conceptual misunderstandings'];
}

function getRecommendationsForTopic(topic) {
    const recommendations = {
        'Linear Equations': ['Practice more multi-step equations', 'Review algebraic properties'],
        'Graphing Lines': ['Work on coordinate plane exercises', 'Practice slope-intercept form'],
        'Systems of Equations': ['Try different solution methods', 'Check solutions by substitution'],
        'Factoring': ['Memorize common factoring patterns', 'Practice with different polynomial types'],
        'Quadratic Functions': ['Review vertex and standard forms', 'Practice graphing parabolas'],
        'Polynomial Functions': ['Study end behavior rules', 'Practice synthetic division'],
        'Exponential Functions': ['Review exponential rules', 'Practice real-world applications'],
        'Logarithms': ['Memorize log properties', 'Practice change of base formula'],
        'Trigonometry': ['Review unit circle', 'Practice with reference angles'],
        'Sequences and Series': ['Study arithmetic and geometric patterns', 'Practice summation formulas']
    };

    return recommendations[topic] || ['Continue practicing', 'Ask for help when needed'];
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    createSampleData().catch(console.error);
}

export { createSampleData }; 