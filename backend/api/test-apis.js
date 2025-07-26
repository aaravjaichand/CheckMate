import express from 'express';

const router = express.Router();

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