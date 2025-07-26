// Gemini API Service for AI Grading and Feedback Generation

export async function gradeWithGemini({ text, subject, gradeLevel, rubric, studentName }) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('Gemini API key not found, using mock grading');
            return await mockGrading({ text, subject, gradeLevel, rubric, studentName });
        }

        // Construct grading prompt based on subject and grade level
        const gradingPrompt = buildGradingPrompt({
            text,
            subject,
            gradeLevel,
            rubric,
            studentName
        });

        // Call Gemini API - Using Gemini 2.5 Flash (stable, best price-performance)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: gradingPrompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.2, // Lower for more consistent grading
                        topK: 32,
                        topP: 0.9,
                        maxOutputTokens: 4096 // Increased for complex grading tasks
                    },
                    safetySettings: [
                        {
                            category: 'HARM_CATEGORY_HARASSMENT',
                            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                        },
                        {
                            category: 'HARM_CATEGORY_HATE_SPEECH',
                            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            const generatedText = result.candidates[0].content.parts[0].text;
            return parseGradingResponse(generatedText, subject);
        } else {
            throw new Error('No valid response from Gemini API');
        }

    } catch (error) {
        console.error('Gemini grading error:', error);
        
        // Fallback to mock grading
        console.warn('Falling back to mock grading');
        return await mockGrading({ text, subject, gradeLevel, rubric, studentName });
    }
}

export async function generateFeedback({ gradingResults, studentName, subject, tone = 'encouraging' }) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('Gemini API key not found, using mock feedback');
            return generateMockFeedback({ gradingResults, studentName, subject, tone });
        }

        const feedbackPrompt = buildFeedbackPrompt({
            gradingResults,
            studentName,
            subject,
            tone
        });

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: feedbackPrompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.4, // Slightly higher for creative feedback
                        topK: 32,
                        topP: 0.9,
                        maxOutputTokens: 2048 // Adequate for feedback generation
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            const generatedFeedback = result.candidates[0].content.parts[0].text;
            return parseFeedbackResponse(generatedFeedback);
        } else {
            throw new Error('No valid feedback from Gemini API');
        }

    } catch (error) {
        console.error('Gemini feedback error:', error);
        
        // Fallback to mock feedback
        return generateMockFeedback({ gradingResults, studentName, subject, tone });
    }
}

// Build grading prompt based on subject and requirements
function buildGradingPrompt({ text, subject, gradeLevel, rubric, studentName }) {
    const basePrompt = `You are an experienced ${subject} teacher grading a ${gradeLevel} student's worksheet. 
Please evaluate the student's work and provide detailed grading information.

Student Name: ${studentName || 'Unknown'}
Subject: ${subject}
Grade Level: ${gradeLevel}

Worksheet Content:
${text}

${rubric ? `Grading Rubric: ${rubric}` : ''}

Please provide your response in the following JSON format:
{
    "totalScore": <percentage score 0-100>,
    "questions": [
        {
            "number": <question number>,
            "question": "<question text>",
            "studentAnswer": "<student's answer>",
            "correctAnswer": "<correct answer>",
            "score": <points earned>,
            "maxScore": <maximum points>,
            "isCorrect": <true/false>,
            "partialCredit": <true/false>,
            "feedback": "<specific feedback for this question>"
        }
    ],
    "strengths": ["<strength 1>", "<strength 2>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>"],
    "commonErrors": ["<error 1>", "<error 2>"],
    "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}`;

    // Add subject-specific instructions
    if (subject?.toLowerCase().includes('math')) {
        return basePrompt + `

Special Math Grading Instructions:
- Evaluate work shown, not just final answers
- Award partial credit for correct methodology even if final answer is wrong
- Check for computational errors vs conceptual errors
- Look for proper use of mathematical notation
- Consider alternative solution methods as valid`;
    }

    if (subject?.toLowerCase().includes('english') || subject?.toLowerCase().includes('language')) {
        return basePrompt + `

Special Language Arts Grading Instructions:
- Evaluate grammar, spelling, and sentence structure
- Consider age-appropriate expectations for writing quality
- Look for evidence of reading comprehension
- Assess vocabulary usage and variety
- Check for proper punctuation and capitalization`;
    }

    if (subject?.toLowerCase().includes('science')) {
        return basePrompt + `

Special Science Grading Instructions:
- Evaluate scientific reasoning and methodology
- Check for proper use of scientific vocabulary
- Look for evidence of understanding scientific concepts
- Consider accuracy of observations and conclusions
- Assess ability to apply scientific principles`;
    }

    return basePrompt;
}

// Build feedback generation prompt
function buildFeedbackPrompt({ gradingResults, studentName, subject, tone }) {
    const toneInstructions = {
        encouraging: 'Be very positive and encouraging. Focus on what the student did well and frame areas for improvement as opportunities to grow.',
        strict: 'Be direct and specific about errors. Maintain high standards while being constructive.',
        funny: 'Use gentle humor and engaging language appropriate for the student\'s age. Make learning fun while being helpful.'
    };

    return `Generate personalized feedback for ${studentName || 'this student'} based on their ${subject} worksheet performance.

Grading Results:
Total Score: ${gradingResults.totalScore}%
Strengths: ${gradingResults.strengths?.join(', ') || 'None identified'}
Areas for Improvement: ${gradingResults.weaknesses?.join(', ') || 'None identified'}
Common Errors: ${gradingResults.commonErrors?.join(', ') || 'None identified'}

Tone: ${tone} - ${toneInstructions[tone] || toneInstructions.encouraging}

Provide feedback in the following JSON format:
{
    "summary": "<2-3 sentence overall summary>",
    "praise": "<specific positive feedback>",
    "improvements": "<constructive suggestions for improvement>",
    "nextSteps": "<specific recommendations for continued learning>",
    "encouragement": "<motivational closing message>"
}

Keep the language appropriate for a ${gradingResults.gradeLevel || 'elementary'} student.`;
}

// Parse Gemini grading response
function parseGradingResponse(response, subject) {
    try {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and clean the response
            return {
                totalScore: Math.max(0, Math.min(100, parsed.totalScore || 0)),
                questions: (parsed.questions || []).map((q, index) => ({
                    number: q.number || index + 1,
                    question: q.question || '',
                    studentAnswer: q.studentAnswer || '',
                    correctAnswer: q.correctAnswer || '',
                    score: Math.max(0, q.score || 0),
                    maxScore: Math.max(1, q.maxScore || 1),
                    isCorrect: Boolean(q.isCorrect),
                    partialCredit: Boolean(q.partialCredit),
                    feedback: q.feedback || ''
                })),
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
                weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
                commonErrors: Array.isArray(parsed.commonErrors) ? parsed.commonErrors : [],
                recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
                gradedAt: new Date(),
                source: 'gemini'
            };
        }
    } catch (error) {
        console.error('Error parsing Gemini response:', error);
    }

    // Fallback if parsing fails
    return generateMockGradingResults(subject);
}

// Parse feedback response
function parseFeedbackResponse(response) {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                summary: parsed.summary || 'Good effort on this assignment!',
                praise: parsed.praise || 'You showed good understanding of the concepts.',
                improvements: parsed.improvements || 'Keep practicing to improve your skills.',
                nextSteps: parsed.nextSteps || 'Continue working on similar problems.',
                encouragement: parsed.encouragement || 'Keep up the great work!',
                generatedAt: new Date(),
                source: 'gemini'
            };
        }
    } catch (error) {
        console.error('Error parsing feedback response:', error);
    }

    // Fallback feedback
    return {
        summary: 'Good effort on this assignment!',
        praise: 'You demonstrated understanding of key concepts.',
        improvements: 'There are a few areas where you can improve with practice.',
        nextSteps: 'Continue practicing similar problems to strengthen your skills.',
        encouragement: 'Keep working hard - you\'re making great progress!',
        generatedAt: new Date(),
        source: 'fallback'
    };
}

// Mock grading for development/fallback
async function mockGrading({ text, subject, gradeLevel, rubric, studentName }) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return generateMockGradingResults(subject, text);
}

function generateMockGradingResults(subject, text = '') {
    const mockQuestions = [];
    const questionCount = Math.floor(Math.random() * 5) + 3; // 3-7 questions

    for (let i = 1; i <= questionCount; i++) {
        const maxScore = Math.floor(Math.random() * 5) + 3; // 3-7 points per question
        const score = Math.floor(Math.random() * (maxScore + 1)); // 0 to maxScore
        const isCorrect = score === maxScore;
        
        mockQuestions.push({
            number: i,
            question: `Question ${i}`,
            studentAnswer: `Student answer ${i}`,
            correctAnswer: `Correct answer ${i}`,
            score: score,
            maxScore: maxScore,
            isCorrect: isCorrect,
            partialCredit: score > 0 && score < maxScore,
            feedback: isCorrect 
                ? 'Excellent work!' 
                : score > 0 
                    ? 'Good approach, but check your final answer.'
                    : 'This needs more work. Review the concept and try again.'
        });
    }

    const totalPossible = mockQuestions.reduce((sum, q) => sum + q.maxScore, 0);
    const totalEarned = mockQuestions.reduce((sum, q) => sum + q.score, 0);
    const totalScore = Math.round((totalEarned / totalPossible) * 100);

    return {
        totalScore,
        questions: mockQuestions,
        strengths: [
            'Shows good understanding of basic concepts',
            'Work is organized and neat',
            'Follows instructions well'
        ],
        weaknesses: [
            'Some computational errors',
            'Could show more work'
        ],
        commonErrors: [
            'Calculation mistakes',
            'Misreading questions'
        ],
        recommendations: [
            'Practice more problems of this type',
            'Double-check calculations',
            'Show all work steps'
        ],
        gradedAt: new Date(),
        source: 'mock'
    };
}

// Generate mock feedback
function generateMockFeedback({ gradingResults, studentName, subject, tone }) {
    const name = studentName || 'Student';
    const score = gradingResults.totalScore || 75;
    
    const feedbackByTone = {
        encouraging: {
            summary: `Great job, ${name}! You scored ${score}% on this ${subject} assignment and showed good understanding of the concepts.`,
            praise: `You did especially well on the problems where you showed your work clearly. Your effort really shows!`,
            improvements: `With a little more practice on calculations, you can improve even more. Don't worry about the mistakes - they help you learn!`,
            nextSteps: `Try doing 2-3 similar problems each day to build your confidence. Ask for help when you need it!`,
            encouragement: `You're making wonderful progress, ${name}. Keep up the excellent work!`
        },
        strict: {
            summary: `${name}, you earned ${score}% on this assignment. There is room for improvement in your work.`,
            praise: `Your correct answers show you understand the basic concepts when you apply yourself.`,
            improvements: `You need to be more careful with your calculations and show all your work. Several errors were preventable.`,
            nextSteps: `Review the problems you missed and practice similar examples. Complete additional practice problems.`,
            encouragement: `With more focused effort and attention to detail, you can achieve better results.`
        },
        funny: {
            summary: `Hey ${name}! You scored ${score}% - not bad at all! Your brain was definitely working on this ${subject} adventure.`,
            praise: `I loved seeing your thinking process! Some of your solutions were spot-on, like a detective solving a mystery.`,
            improvements: `A few calculation gremlins snuck into your work, but don't worry - we can catch them with more practice!`,
            nextSteps: `Let's do some "gremlin hunting" with more practice problems. Make it a game to catch every mistake!`,
            encouragement: `You're becoming a real ${subject} superhero, ${name}! Keep flying high with your learning!`
        }
    };

    return {
        ...feedbackByTone[tone] || feedbackByTone.encouraging,
        generatedAt: new Date(),
        source: 'mock'
    };
}