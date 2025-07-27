import express from 'express';
import multer from 'multer';

const router = express.Router();

// Configure multer for file uploads in tests
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB limit
    }
});

// Test Google Vision API
router.get('/vision', async (req, res) => {
    try {
        const apiKey = process.env.GOOGLE_VISION_API_KEY;
        
        if (!apiKey) {
            return res.json({
                status: 'error',
                message: 'GOOGLE_VISION_API_KEY not configured',
                hasKey: false
            });
        }

        // Test with a simple base64 image (1x1 white pixel PNG)
        const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        const requestBody = {
            requests: [
                {
                    image: {
                        content: testImageBase64
                    },
                    features: [
                        {
                            type: 'TEXT_DETECTION',
                            maxResults: 1
                        }
                    ]
                }
            ]
        };

        const response = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (response.ok) {
            const result = await response.json();
            return res.json({
                status: 'success',
                message: 'Google Vision API is working',
                hasKey: true,
                responseStatus: response.status,
                testResult: result.responses?.[0] ? 'API responded correctly' : 'No text detected (expected for test image)'
            });
        } else {
            const errorText = await response.text();
            return res.json({
                status: 'error',
                message: 'Google Vision API failed',
                hasKey: true,
                responseStatus: response.status,
                error: errorText
            });
        }

    } catch (error) {
        return res.json({
            status: 'error',
            message: 'Google Vision API test failed',
            hasKey: !!process.env.GOOGLE_VISION_API_KEY,
            error: error.message
        });
    }
});

// Test Gemini API
router.get('/gemini', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return res.json({
                status: 'error',
                message: 'GEMINI_API_KEY not configured',
                hasKey: false
            });
        }

        // Test with a simple text prompt using the current model name
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
                            text: "Respond with just the word 'test' if you can read this."
                        }]
                    }]
                })
            }
        );

        if (response.ok) {
            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
            
            return res.json({
                status: 'success',
                message: 'Gemini API is working',
                hasKey: true,
                responseStatus: response.status,
                testResult: responseText.toLowerCase().includes('test') ? 'API responded correctly' : 'Unexpected response',
                response: responseText
            });
        } else {
            const errorText = await response.text();
            return res.json({
                status: 'error',
                message: 'Gemini API failed',
                hasKey: true,
                responseStatus: response.status,
                error: errorText
            });
        }

    } catch (error) {
        return res.json({
            status: 'error',
            message: 'Gemini API test failed',
            hasKey: !!process.env.GEMINI_API_KEY,
            error: error.message
        });
    }
});

// Test Gemini API with custom prompt (POST)
router.post('/gemini', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return res.json({
                status: 'error',
                message: 'GEMINI_API_KEY not configured',
                hasKey: false
            });
        }

        // Get custom prompt from request body
        const { prompt } = req.body;
        const testPrompt = prompt || "Please spell out the ABC's (the alphabet from A to Z).";

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
                            text: testPrompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topK: 32,
                        topP: 0.9,
                        maxOutputTokens: 1024
                    }
                })
            }
        );

        if (response.ok) {
            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
            
            return res.json({
                status: 'success',
                message: 'Gemini API custom prompt test completed',
                hasKey: true,
                responseStatus: response.status,
                prompt: testPrompt,
                response: responseText,
                timestamp: new Date().toISOString()
            });
        } else {
            const errorText = await response.text();
            return res.json({
                status: 'error',
                message: 'Gemini API custom prompt test failed',
                hasKey: true,
                responseStatus: response.status,
                error: errorText,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        return res.json({
            status: 'error',
            message: 'Gemini API custom prompt test failed with exception',
            hasKey: !!process.env.GEMINI_API_KEY,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test both APIs at once
router.get('/all', async (req, res) => {
    try {
        // Test both APIs concurrently
        const [visionResponse, geminiResponse] = await Promise.all([
            fetch(`${req.protocol}://${req.get('host')}/api/test-apis/vision`),
            fetch(`${req.protocol}://${req.get('host')}/api/test-apis/gemini`)
        ]);

        const [visionResult, geminiResult] = await Promise.all([
            visionResponse.json(),
            geminiResponse.json()
        ]);

        return res.json({
            vision: visionResult,
            gemini: geminiResult,
            summary: {
                visionWorking: visionResult.status === 'success',
                geminiWorking: geminiResult.status === 'success',
                allWorking: visionResult.status === 'success' && geminiResult.status === 'success'
            }
        });

    } catch (error) {
        return res.json({
            error: 'Failed to test APIs',
            message: error.message
        });
    }
});

// List available Gemini models
router.get('/gemini-models', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return res.json({
                status: 'error',
                message: 'GEMINI_API_KEY not configured',
                hasKey: false
            });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.ok) {
            const result = await response.json();
            return res.json({
                status: 'success',
                message: 'Available Gemini models',
                hasKey: true,
                models: result.models || [],
                modelNames: result.models?.map(m => m.name) || []
            });
        } else {
            const errorText = await response.text();
            return res.json({
                status: 'error',
                message: 'Failed to list Gemini models',
                hasKey: true,
                responseStatus: response.status,
                error: errorText
            });
        }

    } catch (error) {
        return res.json({
            status: 'error',
            message: 'Gemini models list failed',
            hasKey: !!process.env.GEMINI_API_KEY,
            error: error.message
        });
    }
});

// Test basic Gemini SDK connection
router.get('/gemini-sdk-test', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        console.log('SDK Test - Environment check:', {
            hasApiKey: !!apiKey,
            keyLength: apiKey ? apiKey.length : 0,
            nodeEnv: process.env.NODE_ENV,
            allEnvKeys: Object.keys(process.env).filter(key => key.includes('GEMINI'))
        });
        
        if (!apiKey) {
            return res.json({
                status: 'error',
                message: 'GEMINI_API_KEY not found in environment',
                debugging: {
                    hasApiKey: false,
                    nodeEnv: process.env.NODE_ENV,
                    availableEnvKeys: Object.keys(process.env).filter(key => key.includes('GEMINI'))
                }
            });
        }

        // Test basic SDK initialization with Gemini 2.5 Pro
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        
        // Test basic text generation
        const result = await model.generateContent("Say 'Hello from Gemini SDK test'");
        const response = await result.response;
        const text = response.text();
        
        res.json({
            status: 'success',
            message: 'Gemini SDK working correctly',
            response: text,
            debugging: {
                hasApiKey: true,
                keyLength: apiKey.length,
                sdkVersion: 'latest'
            }
        });
        
    } catch (error) {
        console.error('SDK test error:', error);
        res.json({
            status: 'error',
            message: 'Gemini SDK test failed',
            error: error.message,
            errorType: error.name,
            debugging: {
                hasApiKey: !!process.env.GEMINI_API_KEY,
                nodeEnv: process.env.NODE_ENV
            }
        });
    }
});

// Test complete grading workflow (mimics the main upload flow without DB)
router.post('/complete-grading-test', upload.single('file'), async (req, res) => {
    try {
        console.log('Complete grading test received:', {
            hasFile: !!req.file,
            fileName: req.file?.originalname,
            fileSize: req.file?.size,
            mimeType: req.file?.mimetype
        });

        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No file uploaded'
            });
        }

        // Test the grading pipeline without database dependency
        console.log('Testing grading pipeline without database...');
        
        // Use the exact same processing function as the main upload
        const { gradeWorksheetDirect, generateFeedback } = await import('../services/gemini.js');
        
        console.log('Step 1: Starting grading with Gemini 2.5 Pro (or mock fallback)...');
        const gradingResults = await gradeWorksheetDirect({
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            subject: 'Test Subject',
            gradeLevel: 'Test Grade',
            studentName: 'Test Student',
            assignmentName: 'Complete Grading Test',
            rubric: null
        });

        console.log('Step 2: Generating feedback...');
        const feedback = await generateFeedback({
            gradingResults,
            studentName: 'Test Student',
            subject: 'Test Subject',
            tone: 'encouraging'
        });

        console.log('Complete grading test completed successfully');

        res.json({
            status: 'success',
            message: 'Complete grading workflow test completed (no DB)',
            fileInfo: {
                name: req.file.originalname,
                size: req.file.size,
                type: req.file.mimetype
            },
            gradingResults: gradingResults,
            feedback: feedback,
            testData: {
                mockGrading: gradingResults.source === 'mock' || gradingResults.source === 'mock-direct',
                processingSteps: ['uploaded', 'analyzing', 'grading', 'completed'],
                finalStatus: 'graded',
                databaseUsed: false
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Complete grading test error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Complete grading test failed',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
});

// Test Gemini 2.5 Pro with actual file upload
router.post('/gemini-file-test', upload.single('file'), async (req, res) => {
    try {
        console.log('File upload test received:', {
            hasFile: !!req.file,
            fileName: req.file?.originalname,
            fileSize: req.file?.size,
            mimeType: req.file?.mimetype,
            promptLength: req.body?.prompt?.length,
            bufferLength: req.file?.buffer?.length,
            bufferPreview: req.file?.buffer?.toString('hex').substring(0, 40) + '...'
        });

        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No file uploaded'
            });
        }

        // First, let's verify the image data by creating a simple base64 data URL
        const base64Image = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;
        
        console.log('Image verification:');
        console.log('- File type detected:', req.file.mimetype);
        console.log('- Buffer size:', req.file.buffer.length);
        console.log('- Base64 size:', base64Image.length);
        console.log('- Data URL length:', dataUrl.length);
        console.log('- Data URL preview:', dataUrl.substring(0, 100) + '...');

        const { gradeWorksheetDirect } = await import('../services/gemini.js');
        
        const customPrompt = req.body.prompt || 'Analyze this worksheet image in detail.';
        
        console.log('Starting Gemini 2.5 Pro analysis with custom prompt...');
        console.log('Custom prompt:', customPrompt.substring(0, 100) + '...');
        
        // Test with the actual uploaded file - EXACTLY the same as upload flow
        console.log('Calling gradeWorksheetDirect with EXACT same parameters as upload flow...');
        const result = await gradeWorksheetDirect({
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            subject: 'Test',
            gradeLevel: 'Test Grade',
            studentName: 'Test Student',
            assignmentName: 'File Upload Test',
            customPrompt: customPrompt
        });
        
        console.log('gradeWorksheetDirect completed, result type:', typeof result);
        console.log('Result keys:', Object.keys(result || {}));
        
        console.log('Gemini 2.5 Pro analysis completed');
        
        res.json({
            status: 'success',
            message: 'File analysis completed with Gemini 2.5 Pro',
            fileInfo: {
                name: req.file.originalname,
                size: req.file.size,
                type: req.file.mimetype
            },
            prompt: customPrompt,
            result: result,
            debugging: {
                bufferSize: req.file.buffer.length,
                base64Size: base64Image.length,
                mimeTypeDetected: req.file.mimetype,
                promptUsed: customPrompt,
                isCustomPrompt: !!customPrompt,
                resultType: result.rawResponse ? 'custom' : 'grading'
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('File test error:', error);
        res.status(500).json({
            status: 'error',
            message: 'File analysis failed',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
});

// Test Gemini 2.5 Pro direct image processing
router.post('/gemini-2.5-test', async (req, res) => {
    res.json({
        status: 'disabled',
        message: 'Mock test removed - use file upload test instead',
        note: 'This endpoint was disabled to prevent hardcoded responses. Use the file upload test to verify real Gemini API functionality.',
        timestamp: new Date().toISOString()
    });
});

// Test Gemini API with ABC prompt (specific test requested by user)
router.get('/gemini-abc', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return res.json({
                status: 'error',
                message: 'GEMINI_API_KEY not configured',
                hasKey: false
            });
        }

        // Test with the specific ABC prompt
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
                            text: "Please spell out the ABC's (the alphabet from A to Z)."
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topK: 32,
                        topP: 0.9,
                        maxOutputTokens: 1024
                    }
                })
            }
        );

        if (response.ok) {
            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
            
            return res.json({
                status: 'success',
                message: 'Gemini API ABC test completed',
                hasKey: true,
                responseStatus: response.status,
                prompt: "Please spell out the ABC's (the alphabet from A to Z).",
                response: responseText,
                timestamp: new Date().toISOString()
            });
        } else {
            const errorText = await response.text();
            return res.json({
                status: 'error',
                message: 'Gemini API ABC test failed',
                hasKey: true,
                responseStatus: response.status,
                error: errorText,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        return res.json({
            status: 'error',
            message: 'Gemini API ABC test failed with exception',
            hasKey: !!process.env.GEMINI_API_KEY,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test PNG file handling specifically
router.post('/png-test', upload.single('file'), async (req, res) => {
    try {
        console.log('=== PNG TEST ENDPOINT ===');
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const isPNG = req.file.mimetype && req.file.mimetype.includes('png');
        console.log('File details:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            isPNG: isPNG
        });
        
        if (!isPNG) {
            return res.json({
                status: 'info',
                message: 'File is not PNG, cannot test PNG-specific logic',
                fileType: req.file.mimetype
            });
        }
        
        // Test buffer integrity
        const buffer = req.file.buffer;
        const signature = buffer.toString('hex', 0, 8);
        const isValidPNG = signature === '89504e470d0a1a0a';
        
        console.log('PNG validation:', {
            bufferLength: buffer.length,
            isBuffer: Buffer.isBuffer(buffer),
            signature: signature,
            isValid: isValidPNG
        });
        
        // Test buffer conversion methods
        const conversionTests = {
            direct: Buffer.isBuffer(buffer),
            fromBuffer: null,
            fromValues: null,
            fromArray: null
        };
        
        try {
            conversionTests.fromBuffer = Buffer.isBuffer(Buffer.from(buffer.buffer || buffer));
        } catch (e) {
            conversionTests.fromBuffer = false;
        }
        
        try {
            conversionTests.fromValues = Buffer.isBuffer(Buffer.from(Object.values(buffer)));
        } catch (e) {
            conversionTests.fromValues = false;
        }
        
        try {
            conversionTests.fromArray = Buffer.isBuffer(Buffer.from(Array.from(buffer)));
        } catch (e) {
            conversionTests.fromArray = false;
        }
        
        res.json({
            status: 'success',
            message: 'PNG file test completed',
            results: {
                fileInfo: {
                    name: req.file.originalname,
                    type: req.file.mimetype,
                    size: req.file.size
                },
                validation: {
                    signature: signature,
                    isValidPNG: isValidPNG,
                    expectedSignature: '89504e470d0a1a0a'
                },
                bufferTests: conversionTests
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('PNG test error:', error);
        res.status(500).json({
            status: 'error',
            message: 'PNG test failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Environment check
router.get('/env-check', (req, res) => {
    const envVars = {
        GOOGLE_VISION_API_KEY: !!process.env.GOOGLE_VISION_API_KEY,
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        MONGODB_URI: !!process.env.MONGODB_URI,
        JWT_SECRET: !!process.env.JWT_SECRET,
        NODE_ENV: process.env.NODE_ENV || 'not set'
    };

    res.json({
        message: 'Environment variables check',
        variables: envVars,
        timestamp: new Date().toISOString()
    });
});

export default router;