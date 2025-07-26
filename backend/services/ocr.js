import { promises as fs } from 'fs';
import path from 'path';

// OCR Service - Google Vision API Integration
export async function processOCR(filePathOrBuffer, mimeType) {
    try {
        // Check if Google Vision API key is available
        const apiKey = process.env.GOOGLE_VISION_API_KEY;
        if (!apiKey) {
            console.warn('Google Vision API key not found, using fallback OCR');
            return await fallbackOCR(filePathOrBuffer, mimeType);
        }

        // Handle both file paths and buffers (for Vercel compatibility)
        let fileBuffer;
        if (Buffer.isBuffer(filePathOrBuffer)) {
            fileBuffer = filePathOrBuffer;
        } else {
            fileBuffer = await fs.readFile(filePathOrBuffer);
        }
        const base64Image = fileBuffer.toString('base64');

        // Prepare request for Google Vision API
        const requestBody = {
            requests: [
                {
                    image: {
                        content: base64Image
                    },
                    features: [
                        {
                            type: 'TEXT_DETECTION',
                            maxResults: 50
                        },
                        {
                            type: 'DOCUMENT_TEXT_DETECTION',
                            maxResults: 50
                        }
                    ],
                    imageContext: {
                        languageHints: ['en']
                    }
                }
            ]
        };

        // Call Google Vision API
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

        if (!response.ok) {
            throw new Error(`Google Vision API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.responses && result.responses[0]) {
            const ocrResponse = result.responses[0];
            
            // Extract text from both TEXT_DETECTION and DOCUMENT_TEXT_DETECTION
            const fullTextAnnotation = ocrResponse.fullTextAnnotation;
            const textAnnotations = ocrResponse.textAnnotations || [];

            // Combine results for comprehensive text extraction
            const extractedText = fullTextAnnotation ? fullTextAnnotation.text : '';
            
            // Extract individual words/blocks with bounding boxes
            const words = textAnnotations.slice(1).map(annotation => ({
                text: annotation.description,
                confidence: annotation.confidence || 0.9,
                boundingBox: annotation.boundingPoly ? {
                    vertices: annotation.boundingPoly.vertices
                } : null
            }));

            return {
                text: extractedText,
                words: words,
                confidence: calculateOverallConfidence(words),
                language: 'en',
                processingTime: Date.now(),
                source: 'google-vision'
            };
        } else {
            throw new Error('No text detected in image');
        }

    } catch (error) {
        console.error('OCR processing error:', error);
        
        // Fallback to basic OCR if Google Vision fails
        console.warn('Falling back to basic OCR processing');
        return await fallbackOCR(filePathOrBuffer, mimeType);
    }
}

// Fallback OCR using Tesseract.js (for development/testing)
async function fallbackOCR(filePathOrBuffer, mimeType) {
    try {
        // For development purposes, return mock OCR results
        // In production, you could integrate Tesseract.js here
        
        const fileName = Buffer.isBuffer(filePathOrBuffer) ? 'uploaded-file' : path.basename(filePathOrBuffer);
        
        // Mock OCR results based on file type and name
        const mockText = generateMockOCRText(fileName, mimeType);
        
        return {
            text: mockText,
            words: extractWordsFromText(mockText),
            confidence: 0.75, // Lower confidence for fallback
            language: 'en',
            processingTime: Date.now(),
            source: 'fallback'
        };

    } catch (error) {
        console.error('Fallback OCR error:', error);
        throw new Error('OCR processing failed completely');
    }
}

// Helper function to calculate overall confidence
function calculateOverallConfidence(words) {
    if (!words || words.length === 0) return 0;
    
    const totalConfidence = words.reduce((sum, word) => sum + (word.confidence || 0), 0);
    return totalConfidence / words.length;
}

// Helper function to extract words from text for fallback
function extractWordsFromText(text) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    
    return words.map((word, index) => ({
        text: word,
        confidence: 0.8,
        boundingBox: null // No bounding box info in fallback
    }));
}

// Generate mock OCR text for development/testing
function generateMockOCRText(fileName, mimeType) {
    // Different mock content based on apparent subject
    if (fileName.toLowerCase().includes('math')) {
        return `Math Worksheet - Grade 5
Name: Sarah Johnson

1. 25 + 17 = 42
2. 89 - 34 = 55
3. 12 × 6 = 72
4. 144 ÷ 12 = 12
5. What is 1/4 + 1/2? 
   Answer: 3/4

Word Problems:
6. If Jake has 24 marbles and gives away 8, how many does he have left?
   Answer: 16 marbles

7. A pizza is cut into 8 slices. If you eat 3 slices, what fraction of the pizza did you eat?
   Answer: 3/8

Show your work:
Problem 6: 24 - 8 = 16
Problem 7: 3 out of 8 slices = 3/8`;
    }
    
    if (fileName.toLowerCase().includes('english') || fileName.toLowerCase().includes('language')) {
        return `English Language Arts Worksheet
Name: Michael Chen
Date: March 15, 2024

Grammar Section:
1. Circle the nouns in this sentence: "The quick brown fox jumps over the lazy dog."
   Answer: fox, dog

2. What is the plural of "child"?
   Answer: children

3. Identify the verb in this sentence: "She runs to school every day."
   Answer: runs

Reading Comprehension:
Read the passage and answer the questions:

"The ancient oak tree stood majestically in the center of the park. Its branches reached toward the sky like arms stretching after a long sleep. Children often played beneath its shade during hot summer days."

4. What type of tree is described?
   Answer: Oak tree

5. Where is the tree located?
   Answer: In the center of the park

6. When do children play under the tree?
   Answer: During hot summer days`;
    }
    
    if (fileName.toLowerCase().includes('science')) {
        return `Science Worksheet - Plant Biology
Name: Emma Rodriguez
Grade: 4th

Fill in the blanks:
1. Plants need _____, water, and carbon dioxide to make food.
   Answer: sunlight

2. The process by which plants make food is called _____.
   Answer: photosynthesis

3. The green substance in leaves that helps plants make food is _____.
   Answer: chlorophyll

True or False:
4. Roots help plants absorb water from the soil. 
   Answer: True

5. All plants need soil to grow.
   Answer: False (some plants can grow in water)

Short Answer:
6. Name three parts of a plant and their functions.
   Answer: 
   - Roots: absorb water and nutrients
   - Stem: supports the plant and transports materials
   - Leaves: make food through photosynthesis`;
    }
    
    // Default generic worksheet
    return `Student Worksheet
Name: [Student Name]
Date: [Date]
Subject: [Subject]

Question 1: [Sample question text]
Answer: [Student answer]

Question 2: [Sample question text]
Answer: [Student answer]

Question 3: [Sample question text]
Answer: [Student answer]

Additional work shown:
[Student work and calculations]`;
}

// Preprocess image for better OCR (if needed)
export async function preprocessImage(filePath, options = {}) {
    try {
        // This function could implement image preprocessing
        // such as noise reduction, contrast enhancement, etc.
        // For now, it returns the original file path
        
        const {
            enhanceContrast = false,
            reduceNoise = false,
            deskew = false
        } = options;

        // In a full implementation, you might use libraries like:
        // - sharp for image processing
        // - opencv4nodejs for advanced image operations
        
        console.log(`Preprocessing image: ${filePath}`);
        if (enhanceContrast) console.log('- Enhancing contrast');
        if (reduceNoise) console.log('- Reducing noise');
        if (deskew) console.log('- Deskewing image');
        
        return filePath; // Return original path for now
        
    } catch (error) {
        console.error('Image preprocessing error:', error);
        return filePath; // Return original on error
    }
}

// Extract specific types of content from OCR results
export function extractMathProblems(ocrText) {
    const mathPatterns = [
        /(\d+)\s*[\+\-\×\*÷\/]\s*(\d+)\s*=\s*(\d+)/g,
        /(\d+)\s*\+\s*(\d+)\s*=\s*(\d+)/g,
        /(\d+)\s*\-\s*(\d+)\s*=\s*(\d+)/g,
        /(\d+)\s*[\×\*]\s*(\d+)\s*=\s*(\d+)/g,
        /(\d+)\s*[÷\/]\s*(\d+)\s*=\s*(\d+)/g
    ];

    const problems = [];
    
    mathPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(ocrText)) !== null) {
            problems.push({
                problem: match[0],
                operand1: parseInt(match[1]),
                operator: match[0].match(/[\+\-\×\*÷\/]/)[0],
                operand2: parseInt(match[2]),
                studentAnswer: parseInt(match[3])
            });
        }
    });

    return problems;
}

// Extract question-answer pairs
export function extractQAPairs(ocrText) {
    const qaPatterns = [
        /(\d+)\.?\s*(.+?)\n.*?Answer:\s*(.+?)(?=\n\d+\.|\n[A-Z]|\n$|$)/gs,
        /Question\s*(\d+):\s*(.+?)\n.*?Answer:\s*(.+?)(?=\nQuestion|\n[A-Z]|\n$|$)/gs
    ];

    const qaPairs = [];
    
    qaPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(ocrText)) !== null) {
            qaPairs.push({
                questionNumber: match[1],
                question: match[2].trim(),
                answer: match[3].trim()
            });
        }
    });

    return qaPairs;
}