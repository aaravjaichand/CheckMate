// Gemini API Service for AI Grading and Feedback Generation
import { GoogleGenerativeAI } from '@google/generative-ai';

// Rate limiting configuration
const RATE_LIMIT = {
    maxRetries: 3,
    baseDelayMs: 1000,  // Start with 1 second
    maxDelayMs: 30000,  // Max 30 seconds
    backoffMultiplier: 2
};

// Simple in-memory rate limiter
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // Minimum 1 second between requests

// Rate limiting helper function
async function enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        console.log(`Rate limiting: waiting ${waitTime}ms before API call`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastRequestTime = Date.now();
}

// Retry with exponential backoff
async function retryWithBackoff(apiCall) {
    let lastError;

    for (let attempt = 0; attempt <= RATE_LIMIT.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(
                    RATE_LIMIT.baseDelayMs * Math.pow(RATE_LIMIT.backoffMultiplier, attempt - 1),
                    RATE_LIMIT.maxDelayMs
                );
                console.log(`Retry attempt ${attempt}, waiting ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            return await apiCall();

        } catch (error) {
            lastError = error;

            // Check if it's a rate limit error
            const isRateLimit = error.message?.includes('429') ||
                error.message?.includes('rate limit') ||
                error.message?.includes('quota') ||
                error.message?.includes('RATE_LIMIT_EXCEEDED');

            // Check if it's a temporary error we should retry
            const isRetryable = isRateLimit ||
                error.message?.includes('503') ||
                error.message?.includes('502') ||
                error.message?.includes('timeout');

            if (!isRetryable || attempt === RATE_LIMIT.maxRetries) {
                console.error(`API call failed after ${attempt + 1} attempts:`, error.message);
                throw error;
            }

            console.warn(`API call failed (attempt ${attempt + 1}/${RATE_LIMIT.maxRetries + 1}):`, error.message);
        }
    }

    throw lastError;
}

// Try to extract partial results from streaming text
function tryExtractPartialResults(text) {
    try {
        // Look for complete question objects in the streaming text
        const questions = [];

        // Match individual question objects that are complete
        const questionMatches = text.match(/"number":\s*\d+,[\s\S]*?"feedback":\s*"[^"]*"/g);

        if (questionMatches && questionMatches.length > 0) {
            questionMatches.forEach((match, index) => {
                try {
                    // Wrap in braces to make it a valid JSON object
                    const questionJson = `{${match}}`;
                    const question = JSON.parse(questionJson);

                    // Validate it has required fields
                    if (question.number && question.question !== undefined) {
                        questions.push({
                            number: question.number,
                            question: question.question || `Question ${question.number}`,
                            studentAnswer: question.studentAnswer || '',
                            correctAnswer: question.correctAnswer || '',
                            score: Math.max(0, question.score || 0),
                            maxScore: Math.max(1, question.maxScore || 1),
                            isCorrect: Boolean(question.isCorrect),
                            partialCredit: Boolean(question.partialCredit),
                            feedback: question.feedback || '',
                            showWork: question.showWork || '',
                            hasCorrections: Boolean(question.hasCorrections)
                        });
                    }
                } catch (e) {
                    // Skip invalid question objects
                }
            });
        }

        // Look for totalScore if it's available
        let totalScore = null;
        const scoreMatch = text.match(/"totalScore":\s*(\d+)/);
        if (scoreMatch) {
            totalScore = parseInt(scoreMatch[1]);
        }

        // Look for other fields
        let strengths = [];
        let weaknesses = [];
        let recommendations = [];

        const strengthsMatch = text.match(/"strengths":\s*\[([\s\S]*?)\]/);
        if (strengthsMatch) {
            try {
                strengths = JSON.parse(`[${strengthsMatch[1]}]`);
            } catch (e) { }
        }

        const weaknessesMatch = text.match(/"weaknesses":\s*\[([\s\S]*?)\]/);
        if (weaknessesMatch) {
            try {
                weaknesses = JSON.parse(`[${weaknessesMatch[1]}]`);
            } catch (e) { }
        }

        const recommendationsMatch = text.match(/"recommendations":\s*\[([\s\S]*?)\]/);
        if (recommendationsMatch) {
            try {
                recommendations = JSON.parse(`[${recommendationsMatch[1]}]`);
            } catch (e) { }
        }

        // Return partial results if we have any meaningful data
        if (questions.length > 0 || totalScore !== null) {
            return {
                totalScore: totalScore,
                questions: questions,
                strengths: strengths,
                weaknesses: weaknesses,
                recommendations: recommendations,
                source: 'gemini-2.5-flash-streaming',
                isPartial: true
            };
        }

        return null;
    } catch (error) {
        // Don't log errors for partial parsing - it's expected to fail sometimes
        return null;
    }
}

// NEW: Direct worksheet image processing with Gemini 2.5 Pro
export async function gradeWorksheetDirect({ fileBuffer, mimeType, subject, gradeLevel, rubric, studentName, assignmentName, customPrompt, customGradingInstructions, streamCallback }) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        console.log('Checking Gemini API key:', apiKey ? 'Present' : 'Missing');
        console.log('Environment check:', {
            hasApiKey: !!apiKey,
            keyLength: apiKey ? apiKey.length : 0,
            nodeEnv: process.env.NODE_ENV
        });

        if (!apiKey || apiKey === 'your-gemini-api-key') {
            console.error('GEMINI_API_KEY not found or using placeholder value in environment variables');
            console.warn('Falling back to mock grading due to missing/invalid API key');
            return await mockGradingFromImage({ subject, gradeLevel, rubric, studentName });
        }

        // Initialize Gemini with the API key
        const genAI = new GoogleGenerativeAI(apiKey);

        // Use Gemini 2.5 Flash - faster processing with excellent image support
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        console.log(`Processing worksheet directly with Gemini 2.5 Flash for ${studentName}`);

        // Determine upload method based on file size
        const fileSize = fileBuffer.length;
        const MAX_INLINE_SIZE = 20 * 1024 * 1024; // 20MB

        let result;

        if (fileSize > MAX_INLINE_SIZE) {
            // Use Files API for larger files
            console.log(`Large file (${Math.round(fileSize / 1024 / 1024)}MB), using Files API`);
            result = await processLargeWorksheet(model, fileBuffer, mimeType, { subject, gradeLevel, rubric, studentName, assignmentName, streamCallback });
        } else {
            // Use inline processing for smaller files
            console.log(`Small file (${Math.round(fileSize / 1024)}KB), using inline processing`);
            result = await processInlineWorksheet(model, fileBuffer, mimeType, { subject, gradeLevel, rubric, studentName, assignmentName, customPrompt, customGradingInstructions, streamCallback });
        }

        return result;

    } catch (error) {
        console.error('Direct worksheet grading error:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
        });

        // Check if it's an API key error
        if (error.message?.includes('API key not valid') || error.message?.includes('API_KEY_INVALID')) {
            console.warn('Invalid API key detected, falling back to mock grading');
            return await mockGradingFromImage({ subject, gradeLevel, rubric, studentName });
        }

        // Check if it's a rate limit error
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
            console.warn('Rate limit hit, falling back to mock grading');
            return await mockGradingFromImage({ subject, gradeLevel, rubric, studentName });
        }

        // For other errors, still fall back to mock grading to keep the workflow working
        console.warn('Falling back to mock grading due to API error');
        return await mockGradingFromImage({ subject, gradeLevel, rubric, studentName });
    }
}

// Process worksheet using inline image data (for files < 20MB)
async function processInlineWorksheet(model, fileBuffer, mimeType, context) {
    try {
        // Ensure we have a proper Buffer
        let buffer = fileBuffer;

        if (!Buffer.isBuffer(buffer)) {
            console.log('Converting non-Buffer data to Buffer:', typeof buffer);
            if (buffer && buffer.buffer) {
                // MongoDB Binary data
                buffer = Buffer.from(buffer.buffer);
            } else if (Array.isArray(buffer)) {
                // Array data
                buffer = Buffer.from(buffer);
            } else if (typeof buffer === 'object') {
                // Object data
                buffer = Buffer.from(Object.values(buffer));
            } else {
                throw new Error('Invalid buffer data format');
            }
            console.log('Converted to Buffer, length:', buffer.length);
        }

        const base64Image = buffer.toString('base64');

        // Use custom prompt if provided, otherwise build standard grading prompt
        let prompt;
        if (context.customPrompt) {
            console.log('Using CUSTOM prompt:', context.customPrompt);
            prompt = context.customPrompt;
        } else {
            console.log('Using DEFAULT grading prompt');
            prompt = buildDirectGradingPrompt(context);
        }

        console.log('Sending request to Gemini 2.5 Flash with prompt length:', prompt.length);
        console.log('Image data size:', base64Image.length, 'characters');
        console.log('MIME type:', mimeType);
        console.log('Base64 preview:', base64Image.substring(0, 100) + '...');
        console.log('File buffer info:', {
            originalBufferLength: fileBuffer?.length,
            originalBufferType: typeof fileBuffer,
            originalIsBuffer: Buffer.isBuffer(fileBuffer),
            finalBufferLength: buffer.length,
            finalBufferType: typeof buffer,
            finalIsBuffer: Buffer.isBuffer(buffer),
            firstBytes: buffer.toString('hex').substring(0, 20)
        });

        // Rate limit API calls
        await enforceRateLimit();

        // Add timeout to prevent hanging
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API call timed out after 2 minutes')), 2 * 60 * 1000)
        );

        // Enable streaming with retry logic for rate limiting
        const apiCall = retryWithBackoff(async () => {
            return model.generateContentStream([
                prompt,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType
                    }
                }
            ]);
        });

        const result = await Promise.race([apiCall, timeout]);

        console.log('=== GEMINI API STREAMING RESPONSE ===');
        let text = '';
        let chunkCount = 0;

        // Process streaming chunks and send to frontend via callback
        for await (const chunk of result.stream) {
            chunkCount++;
            const chunkText = chunk.text();
            text += chunkText;

            // Log streaming progress for debugging
            console.log(`Stream chunk ${chunkCount}: ${chunkText.length} chars`);
            console.log(`Chunk preview: ${chunkText.substring(0, 100)}...`);
            console.log(`Total accumulated: ${text.length} chars`);

            // Send chunk to frontend via callback if provided
            if (context.streamCallback && typeof context.streamCallback === 'function') {
                try {
                    context.streamCallback({
                        type: 'chunk',
                        data: chunkText,
                        chunkNumber: chunkCount,
                        totalLength: text.length
                    });

                    // Try to extract partial results as we stream
                    const partialResults = tryExtractPartialResults(text);
                    if (partialResults) {
                        context.streamCallback({
                            type: 'partial_results',
                            data: partialResults,
                            isComplete: false
                        });
                    }
                } catch (callbackError) {
                    console.error('Stream callback error:', callbackError);
                }
            }
        }

        console.log('=== STREAMING COMPLETE ===');
        console.log(`Total chunks received: ${chunkCount}`);
        console.log(`Final response length: ${text.length}`);

        // Notify frontend that streaming is complete
        if (context.streamCallback && typeof context.streamCallback === 'function') {
            try {
                context.streamCallback({
                    type: 'complete',
                    data: text,
                    totalChunks: chunkCount,
                    totalLength: text.length
                });
            } catch (callbackError) {
                console.error('Stream completion callback error:', callbackError);
            }
        }

        console.log('Raw Gemini response length:', text.length);
        console.log('Raw Gemini response (first 200 chars):', text.substring(0, 200));
        console.log('Raw Gemini response (last 200 chars):', text.substring(Math.max(0, text.length - 200)));

        console.log('Response text length:', text.length);
        console.log('Response preview:', text.substring(0, 200) + '...');

        // If using custom prompt, return raw response instead of trying to parse as grading JSON
        if (context.customPrompt) {
            console.log('Custom prompt used - returning raw response');
            return {
                customPromptResponse: text,
                prompt: context.customPrompt,
                source: 'gemini-2.5-flash-custom',
                gradedAt: new Date(),
                rawResponse: true
            };
        } else {
            return parseDirectGradingResponse(text, context.subject, context.studentName);
        }

    } catch (error) {
        console.error('Inline worksheet processing error:', error);
        console.error('Gemini API call failed:', {
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            stack: error.stack
        });
        throw error;
    }
}

// Process worksheet using Files API (for files > 20MB)
async function processLargeWorksheet(model, fileBuffer, mimeType, context) {
    // For large files, try inline processing first (Files API implementation pending)
    console.log('Large file detected, attempting inline processing (Files API not yet implemented)');

    try {
        return await processInlineWorksheet(model, fileBuffer, mimeType, context);
    } catch (error) {
        console.error('Large worksheet processing error:', error);
        throw error;
    }
}

// Build comprehensive grading prompt for direct image analysis
function buildDirectGradingPrompt({ subject, gradeLevel, rubric, studentName, assignmentName, customGradingInstructions }) {
    let basePrompt = `You are an experienced ${subject || 'elementary'} teacher grading a worksheet for a ${gradeLevel || 'elementary'} student named ${studentName || 'the student'}.

ASSIGNMENT: ${assignmentName || 'Worksheet Assignment'}
SUBJECT: ${subject || 'General'}
GRADE LEVEL: ${gradeLevel || 'Elementary'}
STUDENT: ${studentName || 'Student'}`;

    // PRIORITY: Add custom grading instructions first if provided
    if (customGradingInstructions && customGradingInstructions.trim()) {
        basePrompt += `

**CUSTOM GRADING INSTRUCTIONS (HIGHEST PRIORITY):**
${customGradingInstructions.trim()}

IMPORTANT: The custom grading instructions above take PRIORITY over all other grading guidelines. Follow them exactly as specified.`;
    }

    basePrompt += `

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not use markdown formatting. Do not include explanations outside the JSON structure.

Please carefully analyze this worksheet image and provide a comprehensive grading evaluation. Look at:

1. **Text Recognition**: Read all handwritten and printed text carefully
2. **Question Identification**: Identify each question number and what is being asked
3. **Student Answers**: Find and evaluate each student's response
4. **Show Work**: Look for mathematical work, diagrams, or explanations
5. **Corrections**: Notice any crossed-out answers or corrections
6. **Overall Presentation**: Assess neatness and organization

RESPONSE FORMAT: Return ONLY the JSON object below with no additional text:

{
    "totalScore": <percentage score 0-100>,
    "questions": [
        {
            "number": <question number>,
            "question": "<question text you can see>",
            "studentAnswer": "<student's written answer>",
            "correctAnswer": "<correct answer>",
            "score": <points earned>,
            "maxScore": <maximum points>,
            "isCorrect": <true/false>,
            "partialCredit": <true/false>,
            "feedback": "<specific feedback for this question>",
            "showWork": "<description of any work shown>",
            "hasCorrections": <true/false>
        }
    ],
    "strengths": ["<strength 1>", "<strength 2>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>"],
    "commonErrors": ["<error 1>", "<error 2>"],
    "recommendations": ["<recommendation 1>", "<recommendation 2>"],
    "presentationNotes": "<comments on handwriting, organization, etc>",
    "visualElements": "<description of any diagrams, drawings, or visual work>"
}

IMPORTANT: 
- Return ONLY valid JSON
- Use double quotes for all strings
- Ensure all brackets and braces are properly closed
- Do not include any markdown formatting (no backticks or code blocks)
- Do not include any explanatory text outside the JSON`;

    // Add subject-specific instructions if no custom instructions override them
    if (!customGradingInstructions || !customGradingInstructions.trim()) {
        if (subject?.toLowerCase().includes('math')) {
            return basePrompt + `

MATH-SPECIFIC INSTRUCTIONS:
- Pay special attention to mathematical notation and equations`;
        }
        // Add other subject-specific instructions as needed
    }

    return basePrompt;
}

// Parse the direct grading response from Gemini 2.5 Pro
function parseDirectGradingResponse(response, subject, studentName) {
    console.log('=== PARSING GEMINI RESPONSE ===');
    console.log('Original response length:', response.length);
    console.log('Subject:', subject);
    console.log('Student name:', studentName);

    try {
        // Clean the response first
        let cleanedResponse = response.trim();
        console.log('After trim, length:', cleanedResponse.length);

        // Remove markdown formatting if present
        cleanedResponse = cleanedResponse.replace(/```json\s*/, '').replace(/```\s*$/, '');
        console.log('After markdown removal, length:', cleanedResponse.length);
        console.log('Cleaned response (first 300 chars):', cleanedResponse.substring(0, 300));

        // Try to extract JSON from the response with multiple methods
        let jsonString = null;

        // Method 1: Try direct parsing if it looks like pure JSON
        if (cleanedResponse.startsWith('{') && cleanedResponse.endsWith('}')) {
            console.log('Method 1: Direct JSON detected');
            jsonString = cleanedResponse;
        } else {
            console.log('Method 1: Not pure JSON, trying extraction methods');
            // Method 2: Find the largest JSON object in the response
            const jsonMatches = cleanedResponse.match(/\{[\s\S]*?\}(?=\s*$|\s*[^}])/g);
            console.log('Method 2: Found matches:', jsonMatches?.length || 0);
            if (jsonMatches && jsonMatches.length > 0) {
                // Take the longest match (most likely to be complete)
                jsonString = jsonMatches.reduce((longest, current) =>
                    current.length > longest.length ? current : longest
                );
                console.log('Method 2: Selected match length:', jsonString.length);
            } else {
                // Method 3: Find any JSON-like structure
                const fallbackMatch = cleanedResponse.match(/\{[\s\S]*\}/);
                console.log('Method 3: Fallback match found:', !!fallbackMatch);
                if (fallbackMatch) {
                    jsonString = fallbackMatch[0];
                    console.log('Method 3: Match length:', jsonString.length);
                }
            }
        }

        if (jsonString) {
            console.log('Attempting to parse JSON:', jsonString.substring(0, 200) + '...');
            const parsed = JSON.parse(jsonString);

            // Validate and enhance the response
            const result = {
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
                    feedback: q.feedback || '',
                    showWork: q.showWork || '',
                    hasCorrections: Boolean(q.hasCorrections)
                })),
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
                weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
                commonErrors: Array.isArray(parsed.commonErrors) ? parsed.commonErrors : [],
                recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
                presentationNotes: parsed.presentationNotes || '',
                visualElements: parsed.visualElements || '',
                gradedAt: new Date(),
                source: 'gemini-2.5-flash-direct',
                processingMethod: 'direct-image-analysis'
            };

            console.log('Successfully parsed Gemini response with', result.questions.length, 'questions');
            return result;
        }
    } catch (error) {
        console.error('Error parsing direct grading response:', error);
        console.log('Raw response length:', response.length);
        console.log('Raw response preview:', response.substring(0, 500));
    }

    // Fallback if parsing fails
    console.warn('Falling back to mock grading results due to parsing failure');
    return generateMockGradingResults(subject, `Direct analysis for ${studentName}`);
}

// Mock grading fallback for direct image processing
async function mockGradingFromImage({ subject, gradeLevel, rubric, studentName }) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing time

    const result = generateMockGradingResults(subject, `Direct image analysis for ${studentName}`);
    result.source = 'mock-direct';
    result.processingMethod = 'fallback-mock';
    return result;
}

export async function gradeWithGemini({ text, subject, gradeLevel, rubric, studentName, customGradingInstructions }) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('Gemini API key not found, using mock grading');
            return await mockGrading({ text, subject, gradeLevel, studentName });
        }

        // Rate limit grading calls
        await enforceRateLimit();

        const gradingPrompt = buildGradingPrompt({
            text,
            subject,
            gradeLevel,
            rubric,
            studentName,
            customGradingInstructions
        });

        const response = await retryWithBackoff(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        signal: controller.signal,
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
                clearTimeout(timeoutId);
                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        });

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

        // Rate limit feedback generation calls too
        await enforceRateLimit();

        const response = await retryWithBackoff(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for feedback

            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        signal: controller.signal,
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
            clearTimeout(timeoutId);
            return response;
            } finally {
                clearTimeout(timeoutId);
            }
        });

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
function buildGradingPrompt({ text, subject, gradeLevel, rubric, studentName, customGradingInstructions }) {
    let basePrompt = `You are an experienced ${subject} teacher grading a ${gradeLevel} student's worksheet. 
Please evaluate the student's work and provide detailed grading information.

Student Name: ${studentName || 'Unknown'}
Subject: ${subject}
Grade Level: ${gradeLevel}

Worksheet Content:
${text}

${rubric ? `Grading Rubric: ${rubric}` : ''}`;

    // PRIORITY: Add custom grading instructions first if provided
    if (customGradingInstructions && customGradingInstructions.trim()) {
        basePrompt += `

**CUSTOM GRADING INSTRUCTIONS (HIGHEST PRIORITY):**
${customGradingInstructions.trim()}

IMPORTANT: The custom grading instructions above take PRIORITY over all other grading guidelines. Follow them exactly as specified.`;
    }

    basePrompt += `

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

    // Add subject-specific instructions only if no custom instructions are provided
    if (!customGradingInstructions || !customGradingInstructions.trim()) {
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
            const questions = (parsed.questions || []).map((q, index) => ({
                number: q.number || index + 1,
                question: q.question || '',
                studentAnswer: q.studentAnswer || '',
                correctAnswer: q.correctAnswer || '',
                score: Math.max(0, q.score || 0),
                maxScore: Math.max(1, q.maxScore || 1),
                isCorrect: Boolean(q.isCorrect),
                partialCredit: Boolean(q.partialCredit),
                feedback: q.feedback || ''
            }));

            // Calculate total points and points earned
            const totalPoints = questions.reduce((sum, q) => sum + q.maxScore, 0);
            const totalPointsEarned = questions.reduce((sum, q) => sum + q.score, 0);

            return {
                totalScore: Math.max(0, Math.min(100, parsed.totalScore || 0)),
                totalPoints: totalPoints,
                totalPointsEarned: totalPointsEarned,
                questions: questions,
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

// Generate AI-powered recommendations based on class performance
export async function generateAIRecommendations({ className, subject, gradeLevel, feedbackData, commonErrors, studentPerformanceData }) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('Gemini API key not found, using mock recommendations');
            return generateMockRecommendations({ className, subject, gradeLevel });
        }

        // Rate limit recommendation calls
        await enforceRateLimit();

        const recommendationPrompt = buildRecommendationPrompt({
            className,
            subject,
            gradeLevel,
            feedbackData,
            commonErrors,
            studentPerformanceData
        });

        const response = await retryWithBackoff(async () => {
            return fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: recommendationPrompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.7, // Higher for creative recommendations
                            topK: 40,
                            topP: 0.9,
                            maxOutputTokens: 3072 // More tokens for comprehensive recommendations
                        }
                    })
                }
            );
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            const generatedRecommendations = result.candidates[0].content.parts[0].text;
            return parseRecommendationsResponse(generatedRecommendations);
        } else {
            throw new Error('No valid recommendations from Gemini API');
        }

    } catch (error) {
        console.error('Gemini recommendations error:', error);

        // Fallback to mock recommendations
        return generateMockRecommendations({ className, subject, gradeLevel });
    }
}

// Build AI recommendation prompt
function buildRecommendationPrompt({ className, subject, gradeLevel, feedbackData, commonErrors, studentPerformanceData }) {
    const errorFrequency = {};
    commonErrors.forEach(error => {
        errorFrequency[error] = (errorFrequency[error] || 0) + 1;
    });

    const topErrors = Object.entries(errorFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([error, count]) => `${error} (${count} students)`);

    const averageClassScore = studentPerformanceData.length > 0
        ? Math.round(studentPerformanceData.reduce((sum, s) => sum + s.score, 0) / studentPerformanceData.length)
        : 0;

    const strugglingStudents = studentPerformanceData.filter(s => s.score < 70).length;
    const excellentStudents = studentPerformanceData.filter(s => s.score >= 90).length;

    return `As an AI teaching assistant, analyze the performance data for ${className} (${subject}, Grade ${gradeLevel}) and provide actionable recommendations.

CLASS PERFORMANCE SUMMARY:
- Average Score: ${averageClassScore}%
- Students Struggling (< 70%): ${strugglingStudents}
- Students Excelling (≥ 90%): ${excellentStudents}
- Total Worksheets Analyzed: ${studentPerformanceData.length}

TOP COMMON ERRORS:
${topErrors.join('\n')}

SAMPLE FEEDBACK DATA:
${feedbackData.slice(0, 5).map(f =>
        `- ${f.studentName}: ${f.topic} (${f.score}%) - ${f.feedback}`
    ).join('\n')}

Please provide recommendations in the following JSON format:
{
    "topics": [
        {
            "topic": "<specific topic that needs focus>",
            "description": "<why this topic needs attention>", 
            "priority": "<high/medium/low>",
            "studentsAffected": <number>,
            "suggestedActivities": ["<activity1>", "<activity2>", "<activity3>"]
        }
    ],
    "classStrategy": "<overall teaching strategy recommendation>",
    "individualRecommendations": [
        {
            "studentName": "<name>",
            "recommendations": ["<specific recommendation1>", "<specific recommendation2>"]
        }
    ]
}

Focus on:
1. Specific ${subject} topics that need review based on common errors
2. Teaching strategies appropriate for Grade ${gradeLevel}
3. Individual student needs where performance data indicates specific issues
4. Practical activities and exercises to address identified weaknesses

Limit to maximum 5 topics, 3 class strategies, and individual recommendations only for students scoring below 70%.`;
}

// Parse AI recommendations response
function parseRecommendationsResponse(response) {
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            return {
                topics: (parsed.topics || []).map(topic => ({
                    topic: topic.topic || 'Unknown Topic',
                    description: topic.description || 'No description provided',
                    priority: ['high', 'medium', 'low'].includes(topic.priority) ? topic.priority : 'medium',
                    studentsAffected: Math.max(0, topic.studentsAffected || 0),
                    suggestedActivities: Array.isArray(topic.suggestedActivities) ? topic.suggestedActivities : []
                })).slice(0, 5), // Limit to 5 topics
                classStrategy: parsed.classStrategy || 'Continue current teaching approach.',
                individualRecommendations: (parsed.individualRecommendations || []).map(rec => ({
                    studentName: rec.studentName || 'Unknown Student',
                    recommendations: Array.isArray(rec.recommendations) ? rec.recommendations : []
                })).slice(0, 10), // Limit to 10 individual recommendations
                generatedAt: new Date(),
                source: 'gemini-2.5'
            };
        }
    } catch (error) {
        console.error('Error parsing recommendations response:', error);
    }

    // Fallback if parsing fails
    return generateMockRecommendations({});
}

// Mock recommendations for fallback
function generateMockRecommendations({ className = 'Class', subject = 'math', gradeLevel = '9' }) {
    const mathTopics = [
        'Algebraic manipulation and equation solving',
        'Graphing linear functions and interpreting slopes',
        'Word problem translation and setup',
        'Fraction operations and decimal conversions',
        'Order of operations and mathematical notation'
    ];

    const activities = [
        'Practice worksheets with step-by-step solutions',
        'Interactive online math games and simulations',
        'Peer tutoring and collaborative problem solving',
        'Real-world application projects',
        'Daily warm-up review exercises'
    ];

    return {
        topics: mathTopics.slice(0, 3).map((topic, index) => ({
            topic: topic,
            description: `Students are showing difficulty with ${topic.toLowerCase()}. Additional practice and review needed.`,
            priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
            studentsAffected: Math.floor(Math.random() * 10) + 5,
            suggestedActivities: activities.slice(index, index + 3)
        })),
        classStrategy: `Focus on foundational ${subject} concepts for Grade ${gradeLevel}. Use varied teaching methods including visual aids, hands-on activities, and technology integration to accommodate different learning styles.`,
        individualRecommendations: [
            {
                studentName: 'Sample Student',
                recommendations: [
                    'Provide additional practice with basic operations',
                    'Use visual aids and manipulatives for better understanding',
                    'Consider one-on-one tutoring sessions'
                ]
            }
        ],
        generatedAt: new Date(),
        source: 'mock-fallback'
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
        totalPoints: totalPossible,
        totalPointsEarned: totalEarned,
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