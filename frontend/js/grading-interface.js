// Split-Screen Grading Interface Manager
class GradingInterface {
    constructor() {
        this.worksheetId = this.getWorksheetIdFromUrl();
        this.worksheetData = null;
        this.pdfDocument = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.zoomLevel = 1.0;
        this.canvas = null;
        this.context = null;
        this.isResizing = false;
        this.questionsExpanded = false;
        
        this.init();
    }

    getWorksheetIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('worksheet');
    }

    init() {
        if (!this.worksheetId) {
            this.showError('No worksheet ID provided');
            return;
        }

        this.setupCanvas();
        this.setupEventListeners();
        this.setupResizeHandle();
        this.loadWorksheet();
        this.pollForResults();
    }

    async fetchStudentName(studentId) {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch(`/api/students/${studentId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                const studentName = result.student?.name || 'Unknown Student';
                document.getElementById('student-name').textContent = studentName;
            }
        } catch (error) {
            console.error('Error fetching student name:', error);
        }
    }

    async fetchClassName(classId) {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch(`/api/classes/${classId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                const className = result.class?.name || 'Unknown Class';
                document.getElementById('class-name').textContent = className;
            }
        } catch (error) {
            console.error('Error fetching class name:', error);
        }
    }

    setupCanvas() {
        this.canvas = document.getElementById('pdf-canvas');
        this.context = this.canvas.getContext('2d');
    }

    setupEventListeners() {
        // PDF Controls
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('prev-page').addEventListener('click', () => this.previousPage());
        document.getElementById('next-page').addEventListener('click', () => this.nextPage());

        // Question Controls
        document.getElementById('expand-all').addEventListener('click', () => this.expandAllQuestions());
        document.getElementById('collapse-all').addEventListener('click', () => this.collapseAllQuestions());
        
        // Grade Worksheet Button
        document.getElementById('grade-worksheet-btn').addEventListener('click', () => this.gradeWorksheet());

        // Feedback Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Section Collapse
        document.querySelectorAll('.collapse-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.collapse-btn').dataset.target;
                if (target) {
                    this.toggleSection(target);
                }
            });
        });

        // Save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveChanges());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    setupResizeHandle() {
        const resizeHandle = document.querySelector('.resize-handle');
        const leftPanel = document.querySelector('.left-panel');
        const rightPanel = document.querySelector('.right-panel');
        
        let startX, startLeftWidth, startRightWidth;

        resizeHandle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            startX = e.clientX;
            startLeftWidth = leftPanel.offsetWidth;
            startRightWidth = rightPanel.offsetWidth;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        });

        const handleMouseMove = (e) => {
            if (!this.isResizing) return;
            
            const deltaX = e.clientX - startX;
            const containerWidth = leftPanel.parentElement.offsetWidth;
            const minWidth = 300;
            
            let newLeftWidth = startLeftWidth + deltaX;
            let newRightWidth = startRightWidth - deltaX;
            
            if (newLeftWidth < minWidth) {
                newLeftWidth = minWidth;
                newRightWidth = containerWidth - minWidth - 4; // 4px for resize handle
            } else if (newRightWidth < minWidth) {
                newRightWidth = minWidth;
                newLeftWidth = containerWidth - minWidth - 4;
            }
            
            leftPanel.style.flex = `0 0 ${newLeftWidth}px`;
            rightPanel.style.flex = `0 0 ${newRightWidth}px`;
        };

        const handleMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }

    async loadWorksheet() {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch(`/api/upload/status/${this.worksheetId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.worksheetData = await response.json();
            console.log('Loaded worksheet data:', this.worksheetData);
            this.updateWorksheetInfo();
            this.loadWorksheetFile();

            // If grading is complete, show results
            if (this.worksheetData.status === 'graded' && this.worksheetData.gradingResults) {
                this.showGradingResults(this.worksheetData.gradingResults);
            } else if (this.worksheetData.status === 'error') {
                this.showGradingError(this.worksheetData.error);
            }

        } catch (error) {
            console.error('Error loading worksheet:', error);
            this.showError('Failed to load worksheet data');
        }
    }

    updateWorksheetInfo() {
        const data = this.worksheetData;
        
        document.getElementById('worksheet-title').textContent = data.originalName || data.filename || 'Worksheet';

        // Try to get student name from different possible fields
        const studentName = data.studentName || data.metadata?.studentName || 'Loading...';
        document.getElementById('student-name').textContent = studentName;

        // Try to get class name from different possible fields  
        const className = data.className || data.metadata?.className || 'Loading...';
        document.getElementById('class-name').textContent = className;

        // Try to get assignment from different possible fields
        const assignment = data.assignment || data.metadata?.assignment || data.results?.assignment || 'Assignment';
        document.getElementById('assignment-name').textContent = assignment;

        // If we have IDs but no names, fetch the names
        if (data.studentId && !data.studentName) {
            this.fetchStudentName(data.studentId);
        }
        if (data.classId && !data.className) {
            this.fetchClassName(data.classId);
        }

        // Update status
        const statusEl = document.getElementById('grading-status');
        const statusIndicator = statusEl.querySelector('.status-indicator');
        
        statusIndicator.className = 'status-indicator';
        
        const gradeBtn = document.getElementById('grade-worksheet-btn');
        
        switch (data.status) {
            case 'processing':
                statusIndicator.classList.add('processing');
                statusIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                gradeBtn.style.display = 'none';
                break;
            case 'graded':
                statusIndicator.classList.add('completed');
                statusIndicator.innerHTML = '<i class="fas fa-check"></i> Completed';
                gradeBtn.style.display = 'none';
                break;
            case 'error':
                statusIndicator.classList.add('error');
                statusIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
                gradeBtn.style.display = 'inline-flex';
                gradeBtn.innerHTML = '<i class="fas fa-redo"></i> Retry Grading';
                break;
            case 'uploaded':
            case 'pending':
            default:
                statusIndicator.classList.add('pending');
                statusIndicator.innerHTML = '<i class="fas fa-clock"></i> Ready to Grade';
                gradeBtn.style.display = 'inline-flex';
                gradeBtn.innerHTML = '<i class="fas fa-robot"></i> Grade Worksheet';
                break;
        }
    }

    async gradeWorksheet() {
        try {
            const gradeBtn = document.getElementById('grade-worksheet-btn');
            const statusIndicator = document.querySelector('.status-indicator');
            
            // Show loading state
            gradeBtn.disabled = true;
            gradeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Grading...';
            statusIndicator.className = 'status-indicator processing';
            statusIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            // Show grading loading state
            document.getElementById('grading-loading').style.display = 'block';
            document.getElementById('grading-results').style.display = 'none';
            document.getElementById('grading-error').style.display = 'none';
            
            // Start processing steps animation
            this.updateProcessingSteps('analyzing');

            // Update worksheet data and status
            this.worksheetData.status = 'processing';
            this.worksheetData.processingStage = 'analyzing';
            this.updateWorksheetInfo();

            // Start streaming AI grading process
            await this.startStreamingGrading();
            
        } catch (error) {
            console.error('Error starting grading:', error);
            
            // Reset button state
            const gradeBtn = document.getElementById('grade-worksheet-btn');
            gradeBtn.disabled = false;
            gradeBtn.innerHTML = '<i class="fas fa-redo"></i> Retry Grading';
            
            // Show error status
            const statusIndicator = document.querySelector('.status-indicator');
            statusIndicator.className = 'status-indicator error';
            statusIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
            
            this.showNotification(`Grading failed: ${error.message}`, 'error');
        }
    }

    async startStreamingGrading() {
        return new Promise((resolve, reject) => {
            const token = localStorage.getItem('gradeflow_token');
            const eventSource = new EventSource(`/api/upload/stream/${this.worksheetId}?token=${token}`);

            // Show streaming display after analyzing step
            setTimeout(() => {
                this.updateProcessingSteps('grading');
                this.showStreamingDisplay();
            }, 1000);

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Received stream data:', data.type, data);

                    switch (data.type) {
                        case 'status':
                            this.addStreamMessage(`🤖 ${data.message}`, 'status');
                            break;

                        case 'chunk':
                            this.addStreamMessage(data.data, 'chunk');
                            break;

                        case 'partial_results':
                            console.log('Partial results received:', data.data);
                            this.addStreamMessage('📊 Live results updating...', 'status');

                            // Show partial results immediately
                            this.showPartialResults(data.data);
                            break;

                        case 'complete':
                            this.addStreamMessage('\n\n✅ AI analysis complete!', 'complete');
                            break;

                        case 'results':
                            console.log('Final grading results:', data.data);
                            this.addStreamMessage('🎯 Final results processed!', 'complete');

                            // Update worksheet data with results
                            this.worksheetData.gradingResults = data.data;
                            this.worksheetData.status = 'graded';

                            // Show final step and results
                            this.updateProcessingSteps('completed');

                            // Show final cleaned results immediately
                            this.showGradingResults(data.data);
                            resolve();
                            break;

                        case 'error':
                            this.addStreamMessage(`❌ Error: ${data.message}`, 'error');
                            this.showGradingError(data.message);
                            reject(new Error(data.message));
                            break;

                        case 'done':
                            eventSource.close();
                            break;
                    }
                } catch (error) {
                    console.error('Error parsing stream data:', error);
                    this.addStreamMessage(`⚠️ Stream parsing error: ${error.message}`, 'error');
                }
            };

            eventSource.onerror = (error) => {
                console.error('EventSource error:', error);
                eventSource.close();
                this.addStreamMessage('❌ Streaming connection failed', 'error');
                reject(new Error('Streaming connection failed'));
            };

            // Timeout after 5 minutes
            setTimeout(() => {
                eventSource.close();
                this.addStreamMessage('⏰ Streaming timeout', 'error');
                reject(new Error('Streaming timeout'));
            }, 5 * 60 * 1000);
        });
    }

    showStreamingDisplay() {
        const container = document.getElementById('ai-streaming-container');
        if (container) {
            container.style.display = 'block';
        }
    }

    addStreamMessage(content, type) {
        const streamingOutput = document.getElementById('streaming-output');
        if (!streamingOutput) return;

        if (type === 'chunk') {
            // Append to the last chunk message or create new one
            const lastMessage = streamingOutput.lastElementChild;
            if (lastMessage && lastMessage.classList.contains('chunk')) {
                lastMessage.textContent += content;
            } else {
                const message = document.createElement('div');
                message.className = `stream-message ${type}`;
                message.textContent = content;
                streamingOutput.appendChild(message);
            }
        } else {
            // Create new message for status, complete, error
            const message = document.createElement('div');
            message.className = `stream-message ${type}`;
            message.textContent = content;
            streamingOutput.appendChild(message);
        }

        // Auto-scroll to bottom
        streamingOutput.scrollTop = streamingOutput.scrollHeight;
    }

    async loadWorksheetFile() {
        try {
            // Hide loading initially and show it properly
            const loadingEl = document.getElementById('pdf-loading');
            const canvasEl = document.getElementById('pdf-canvas');
            const errorEl = document.getElementById('pdf-error');

            loadingEl.style.display = 'flex';
            canvasEl.style.display = 'none';
            errorEl.style.display = 'none';

            const mimeType = this.worksheetData.mimeType || 'application/pdf';
            console.log('Loading file with MIME type:', mimeType);

    // Fetch the actual file from the server
            const token = localStorage.getItem('gradeflow_token');
            const fileResponse = await fetch(`/api/upload/file/${this.worksheetId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!fileResponse.ok) {
                throw new Error(`Failed to load file: ${fileResponse.status}`);
            }

            const fileBlob = await fileResponse.blob();
            const fileUrl = URL.createObjectURL(fileBlob);

            if (mimeType.startsWith('image/')) {
                this.loadImageWorksheet(fileUrl);
            } else if (mimeType === 'application/pdf') {
                this.loadPDFWorksheet(fileUrl);
            } else {
                throw new Error(`Unsupported file type: ${mimeType}`);
            }

        } catch (error) {
            console.error('Error loading worksheet file:', error);
            this.showFileError(error.message);
        }
    }

    async loadImageWorksheet(fileUrl) {
        try {
            const canvas = this.canvas;
            const ctx = this.context;

            // Create image object and load the real file
            const img = new Image();

            img.onload = () => {
                // Calculate canvas size to fit image while maintaining aspect ratio
                const maxWidth = 800;
                const maxHeight = 1000;
                let { width, height } = img;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw the actual image
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Hide loading, show canvas
                document.getElementById('pdf-loading').style.display = 'none';
                document.getElementById('pdf-canvas').style.display = 'block';

                this.updatePageControls();

                // Clean up the object URL
                URL.revokeObjectURL(fileUrl);
            };

            img.onerror = () => {
                URL.revokeObjectURL(fileUrl);
                throw new Error('Failed to load image');
            };

            img.src = fileUrl;

        } catch (error) {
            console.error('Error loading image worksheet:', error);
            this.showFileError(error.message);
        }
    }

    async loadPDFWorksheet(fileUrl) {
        try {
            const canvas = this.canvas;
            const ctx = this.context;

            // Load PDF using PDF.js
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library not loaded');
            }

            const loadingTask = pdfjsLib.getDocument(fileUrl);
            this.pdfDocument = await loadingTask.promise;
            this.totalPages = this.pdfDocument.numPages;
            this.currentPage = 1;

            // Render first page
            await this.renderPDFPage(this.currentPage);

            // Hide loading, show canvas
            document.getElementById('pdf-loading').style.display = 'none';
            document.getElementById('pdf-canvas').style.display = 'block';

            this.updatePageControls();

            // Clean up the object URL
            URL.revokeObjectURL(fileUrl);

        } catch (error) {
            console.error('Error loading PDF worksheet:', error);
            this.showFileError(error.message);
            URL.revokeObjectURL(fileUrl);
        }
    }

    async renderPDFPage(pageNumber) {
        try {
            const page = await this.pdfDocument.getPage(pageNumber);
            const canvas = this.canvas;
            const ctx = this.context;

            // Calculate scale to fit canvas while maintaining aspect ratio
            const viewport = page.getViewport({ scale: 1 });
            const maxWidth = 800;
            const scale = Math.min(maxWidth / viewport.width, 1.5);
            const scaledViewport = page.getViewport({ scale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Render the page
            const renderContext = {
                canvasContext: ctx,
                viewport: scaledViewport
            };

            await page.render(renderContext).promise;

        } catch (error) {
            console.error('Error rendering PDF page:', error);
            throw error;
        }
    }

    renderMockWorksheet(ctx, width, height, fileType) {
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Border
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);

        // Header based on actual worksheet data
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';

        const title = this.worksheetData.filename || 'Worksheet';
        ctx.fillText(title, width / 2, 50);
        
        // Student info
        ctx.font = '14px Inter, sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`Student: ${this.worksheetData.studentName || 'Demo Student'}`, width / 2, 80);
        ctx.fillText(`Class: ${this.worksheetData.className || 'Demo Class'}`, width / 2, 100);

        // File type indicator
        ctx.fillText(`File Type: ${fileType.toUpperCase()} (${this.worksheetData.mimeType || 'unknown'})`, width / 2, 120);

        // Mock worksheet content
        ctx.fillStyle = '#374151';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'left';
        
        const questions = [
            '1. What is 15 + 27?',
            '2. Solve for x: 4x - 8 = 16',
            '3. What is the area of a rectangle with length 8cm and width 5cm?',
            '4. Convert 3/4 to a decimal',
            '5. What is 20% of 80?'
        ];
        
        const answers = ['42', 'x = 6', '40 cm²', '0.75', '16'];

        questions.forEach((question, index) => {
            const y = 180 + (index * 80);

            // Question
            ctx.fillText(question, 50, y);

            // Answer line
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(50, y + 25);
            ctx.lineTo(550, y + 25);
            ctx.stroke();

            // Mock student answer
            ctx.fillStyle = '#2563eb';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(`Answer: ${answers[index]}`, 60, y + 20);
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = '#374151';
        });
        
        // Status message at bottom
        ctx.fillStyle = '#059669';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';

        const statusMessage = this.worksheetData.status === 'graded'
            ? 'Worksheet has been graded by AI'
            : 'Worksheet loaded successfully';
        ctx.fillText(statusMessage, width / 2, height - 30);
    }

    showFileError(errorMessage) {
        console.error('File loading error:', errorMessage);
        document.getElementById('pdf-loading').style.display = 'none';
        document.getElementById('pdf-canvas').style.display = 'none';

        const errorEl = document.getElementById('pdf-error');
        errorEl.style.display = 'block';

        // Update error message if provided
        const errorText = errorEl.querySelector('p');
        if (errorText && errorMessage) {
            errorText.textContent = `Failed to load worksheet: ${errorMessage}`;
        }
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.2, 3.0);
        this.updateZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.5);
        this.updateZoom();
    }

    updateZoom() {
        document.getElementById('zoom-level').textContent = `${Math.round(this.zoomLevel * 100)}%`;
        
        if (this.canvas) {
            this.canvas.style.transform = `scale(${this.zoomLevel})`;
            this.canvas.style.transformOrigin = 'top left';
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePageControls();
            this.renderPage();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePageControls();
            this.renderPage();
        }
    }

    updatePageControls() {
        document.getElementById('current-page').textContent = this.currentPage;
        document.getElementById('total-pages').textContent = this.totalPages;
        
        document.getElementById('prev-page').disabled = this.currentPage <= 1;
        document.getElementById('next-page').disabled = this.currentPage >= this.totalPages;
    }

    renderPage() {
        // Re-render the current page with updated data
        if (this.worksheetData) {
            const mimeType = this.worksheetData.mimeType || 'application/pdf';
            const ctx = this.context;
            if (mimeType.startsWith('image/')) {
                this.renderMockWorksheet(ctx, this.canvas.width, this.canvas.height, 'image');
            } else {
                this.renderMockWorksheet(ctx, this.canvas.width, this.canvas.height, 'pdf');
            }
        }
    }

    async pollForResults() {
        if (this.worksheetData?.status === 'graded' || this.worksheetData?.status === 'error') {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const token = localStorage.getItem('gradeflow_token');
                const response = await fetch(`/api/upload/status/${this.worksheetId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.status === 'graded' && data.gradingResults) {
                        clearInterval(pollInterval);
                        this.worksheetData = data;
                        this.updateWorksheetInfo();
                        this.showGradingResults(data.gradingResults);
                        this.updateProcessingSteps('completed');
                    } else if (data.status === 'error') {
                        clearInterval(pollInterval);
                        this.worksheetData = data;
                        this.updateWorksheetInfo();
                        this.showGradingError(data.error || 'Grading failed');
                    } else {
                        // Update processing steps
                        this.updateProcessingSteps(data.processingStage);
                    }
                }
            } catch (error) {
                console.error('Error polling for results:', error);
            }
        }, 3000); // Poll every 3 seconds
    }

    updateProcessingSteps(stage) {
        const steps = {
            'analyzing': 'step-analyzing',
            'grading': 'step-grading',
            'completed': 'step-feedback'
        };

        // Reset all steps
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active', 'completed');
        });

        // Update steps based on current stage
        Object.entries(steps).forEach(([stageKey, elementId]) => {
            const element = document.getElementById(elementId);
            if (stageKey === stage) {
                element.classList.add('active');
            } else if (this.isStageCompleted(stageKey, stage)) {
                element.classList.add('completed');
            }
        });
    }

    isStageCompleted(checkStage, currentStage) {
        const stageOrder = ['ocr', 'grading', 'completed'];
        const checkIndex = stageOrder.indexOf(checkStage);
        const currentIndex = stageOrder.indexOf(currentStage);
        return checkIndex < currentIndex;
    }

    showPartialResults(results) {
        console.log('Showing partial results:', results);

        // Hide loading, show results container
        document.getElementById('grading-loading').style.display = 'none';
        document.getElementById('grading-results').style.display = 'block';

        // Show partial indicator
        const overallScore = document.getElementById('overall-score');
        const scoreValue = document.getElementById('score-value');

        if (results.totalScore !== undefined && results.totalScore !== null) {
            scoreValue.textContent = `${results.totalScore}%`;
            scoreValue.style.opacity = '0.7'; // Show it's partial
            overallScore.style.display = 'flex';
            overallScore.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'; // Orange for partial
        }

        // Update summary with partial data
        this.updateSummaryStyle2(results, true);

        // Update questions with partial data (append new ones)
        this.updateQuestionsStyle2(results.questions || [], true);

        // Add partial indicator to the header
        const resultsSection = document.querySelector('.results-section.summary-section .section-header h4');
        if (resultsSection && !resultsSection.textContent.includes('🔄')) {
            resultsSection.innerHTML = '🔄 Summary (Live Updates)';
        }
    }

    showGradingResults(results) {
        // Hide loading, show results
        document.getElementById('grading-loading').style.display = 'none';
        document.getElementById('grading-results').style.display = 'block';
        
        // Show overall score (final version)
        const overallScore = document.getElementById('overall-score');
        const scoreValue = document.getElementById('score-value');
        
        if (results.totalScore !== undefined) {
            scoreValue.textContent = `${results.totalScore}%`;
            scoreValue.style.opacity = '1'; // Full opacity for final
            overallScore.style.display = 'flex';
            overallScore.style.background = ''; // Reset to default styling
        }

        // Remove partial indicator from header
        const resultsSection = document.querySelector('.results-section.summary-section .section-header h4');
        if (resultsSection && resultsSection.textContent.includes('🔄')) {
            resultsSection.innerHTML = 'Summary';
        }

        // Update summary with Style 2 formatting
        this.updateSummaryStyle2(results);

        // Update questions with Style 2 formatting
        this.updateQuestionsStyle2(results.questions || []);
        
        // Update feedback
        this.updateFeedback(this.worksheetData.feedback || {});
    }

    updateSummaryStyle2(results, isPartial = false) {
        const questions = results.questions || [];
        let correct = 0, incorrect = 0, partial = 0;

        questions.forEach(q => {
            if (q.isCorrect) {
                correct++;
            } else if (q.partialCredit) {
                partial++;
            } else {
                incorrect++;
            }
        });

        document.getElementById('correct-count').textContent = correct;
        document.getElementById('incorrect-count').textContent = incorrect;
        document.getElementById('partial-count').textContent = partial;

        // Create Style 2 compact header in the summary section
        const summaryContent = document.getElementById('summary-content');
        const existingHeader = summaryContent.querySelector('.style2-score-header');

        if (!existingHeader) {
            const style2Header = document.createElement('div');
            style2Header.className = 'style2-score-header';
            style2Header.innerHTML = `
                <div class="style2-score-display">
                    <div class="style2-score-number">${results.totalScore || 0}%</div>
                    <div class="style2-score-label">OVERALL SCORE</div>
                </div>
            `;

            // Add CSS for Style 2 header
            if (!document.querySelector('#style2-css')) {
                const style = document.createElement('style');
                style.id = 'style2-css';
                style.textContent = `
                    .style2-score-header {
                        background: #1e293b;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 8px;
                        margin-bottom: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 20px;
                    }
                    .style2-score-number {
                        font-size: 36px;
                        font-weight: bold;
                    }
                    .style2-score-label {
                        font-size: 14px;
                        opacity: 0.8;
                    }
                    .style2-question-item {
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 6px;
                        margin-bottom: 12px;
                        overflow: hidden;
                    }
                    .style2-question-header {
                        padding: 12px 16px;
                        background: #f8fafc;
                        border-bottom: 1px solid #e2e8f0;
                        font-weight: 600;
                        font-size: 14px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .style2-question-content {
                        padding: 16px;
                        font-size: 14px;
                    }
                    .style2-answer-row {
                        display: flex;
                        gap: 20px;
                        margin-bottom: 10px;
                    }
                    .style2-answer-col {
                        flex: 1;
                        padding: 10px;
                        background: #f8fafc;
                        border-radius: 4px;
                        font-size: 13px;
                    }
                    .style2-feedback {
                        font-style: italic;
                        color: #64748b;
                        margin-top: 8px;
                        padding-top: 8px;
                        border-top: 1px solid #e5e7eb;
                    }
                    
                    /* Status badge styles for good text visibility */
                    .status-badge {
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 500;
                        display: inline-block;
                    }
                    
                    .status-correct, .status-badge.correct {
                        background: #dcfce7 !important;
                        color: #166534 !important;
                        border: 1px solid #bbf7d0;
                    }
                    
                    .status-incorrect, .status-badge.incorrect {
                        background: #fef2f2 !important;
                        color: #dc2626 !important;
                        border: 1px solid #fecaca;
                    }
                    
                    .status-partial, .status-badge.partial {
                        background: #fef3c7 !important;
                        color: #d97706 !important;
                        border: 1px solid #fde68a;
                    }
                    
                    /* Ensure all text in questions is visible */
                    .style2-question-header span {
                        color: #374151 !important;
                    }
                    
                    .style2-question-content {
                        color: #374151 !important;
                    }
                    
                    .style2-answer-col {
                        color: #374151 !important;
                        background: #f8fafc !important;
                    }
                    
                    .style2-answer-col strong {
                        color: #1f2937 !important;
                    }
                    
                    /* Fix any white-on-white or black-on-black issues */
                    .text-gray-500 {
                        color: #6b7280 !important;
                    }
                    
                    .text-center {
                        text-align: center;
                    }
                `;
                document.head.appendChild(style);
            }

            summaryContent.insertBefore(style2Header, summaryContent.firstChild);
        } else {
            // Update existing header
            const scoreNumber = existingHeader.querySelector('.style2-score-number');
            if (scoreNumber) {
                scoreNumber.textContent = `${results.totalScore || 0}%`;
            }
        }

        // Update feedback summary with proper styling
        const feedbackSummary = document.getElementById('feedback-summary');
        const summary = this.worksheetData.feedback?.summary || 'Great work on this assignment!';
        feedbackSummary.textContent = summary;
        
        // Ensure feedback summary is visible
        feedbackSummary.style.color = '#374151';
        feedbackSummary.style.background = '#f8fafc';
        feedbackSummary.style.padding = '12px';
        feedbackSummary.style.borderRadius = '6px';
        feedbackSummary.style.marginTop = '16px';
    }

    updateSummary(results) {
        // Keep the original method for backward compatibility
        this.updateSummaryStyle2(results);
    }

    updateQuestionsStyle2(questions, isPartial = false) {
        const questionsList = document.getElementById('questions-list');
        
        if (questions.length === 0 && !isPartial) {
            questionsList.innerHTML = '<p class="text-center text-gray-500">No questions found</p>';
            return;
        }

        // For partial updates, keep existing questions and add new ones
        if (isPartial) {
            this.updateQuestionsPartially(questions);
            return;
        }

        // Clean up partial indicators for final display
        const finalHeader = questionsList.innerHTML.includes('🔄')
            ? '📝 Questions & Answers (Final)'
            : '📝 Questions & Answers';

        questionsList.innerHTML = `
            <h4 style="margin-bottom: 15px; color: #374151;">${finalHeader}</h4>
            ${questions.map((question, index) => {
            const statusClass = question.isCorrect ? 'correct' :
                question.partialCredit ? 'partial' : 'incorrect';
                const statusIcon = question.isCorrect ? '✓' : (question.partialCredit ? '◐' : '✗');

                return `
                    <div class="style2-question-item">
                        <div class="style2-question-header">
                            <span>Q${question.number || index + 1}: ${this.escapeHtml(question.question || `Question ${index + 1}`)}</span>
                            <span class="status-badge status-${statusClass}">${statusIcon} ${question.score || 0}/${question.maxScore || 1}</span>
                        </div>
                        <div class="style2-question-content">
                            <div class="style2-answer-row">
                                <div class="style2-answer-col">
                                    <strong>Student:</strong> ${this.escapeHtml(question.studentAnswer || 'No answer provided')}
                                </div>
                                <div class="style2-answer-col">
                                    <strong>Correct:</strong> ${this.escapeHtml(question.correctAnswer || 'Not specified')}
                                </div>
                            </div>
                            ${question.showWork ? `
                                <div class="style2-answer-col" style="margin-bottom: 8px;">
                                    <strong>Work Shown:</strong> ${this.escapeHtml(question.showWork)}
                                </div>
                            ` : ''}
                            ${question.feedback ? `
                                <div class="style2-feedback">${this.escapeHtml(question.feedback)}</div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    }

    updateQuestionsPartially(questions) {
        const questionsList = document.getElementById('questions-list');

        // Initialize if empty
        if (!questionsList.innerHTML.includes('Questions & Answers')) {
            questionsList.innerHTML = '<h4 style="margin-bottom: 15px; color: #374151;">🔄 Questions & Answers (Live)</h4>';
        }

        // Track which questions we already have
        const existingQuestions = new Set();
        questionsList.querySelectorAll('.style2-question-item').forEach(item => {
            const header = item.querySelector('.style2-question-header span');
            if (header) {
                const match = header.textContent.match(/Q(\d+):/);
                if (match) {
                    existingQuestions.add(parseInt(match[1]));
                }
            }
        });

        // Add new questions that we don't have yet
        questions.forEach((question, index) => {
            const questionNumber = question.number || index + 1;

            if (!existingQuestions.has(questionNumber)) {
                const statusClass = question.isCorrect ? 'correct' :
                    question.partialCredit ? 'partial' : 'incorrect';
                const statusIcon = question.isCorrect ? '✓' : (question.partialCredit ? '◐' : '✗');

                const questionHtml = `
                    <div class="style2-question-item" style="animation: fadeInUp 0.3s ease-out;">
                        <div class="style2-question-header">
                            <span>Q${questionNumber}: ${this.escapeHtml(question.question || `Question ${questionNumber}`)}</span>
                            <span class="status-badge status-${statusClass}">${statusIcon} ${question.score || 0}/${question.maxScore || 1}</span>
                        </div>
                        <div class="style2-question-content">
                            <div class="style2-answer-row">
                                <div class="style2-answer-col">
                                    <strong>Student:</strong> ${this.escapeHtml(question.studentAnswer || 'No answer provided')}
                                </div>
                                <div class="style2-answer-col">
                                    <strong>Correct:</strong> ${this.escapeHtml(question.correctAnswer || 'Not specified')}
                                </div>
                            </div>
                            ${question.showWork ? `
                                <div class="style2-answer-col" style="margin-bottom: 8px;">
                                    <strong>Work Shown:</strong> ${this.escapeHtml(question.showWork)}
                                </div>
                            ` : ''}
                            ${question.feedback ? `
                                <div class="style2-feedback">${this.escapeHtml(question.feedback)}</div>
                            ` : ''}
                        </div>
                    </div>
                `;

                questionsList.insertAdjacentHTML('beforeend', questionHtml);
                existingQuestions.add(questionNumber);
            }
        });

        // Add CSS for animation if not already added
        if (!document.querySelector('#partial-animation-css')) {
            const style = document.createElement('style');
            style.id = 'partial-animation-css';
            style.textContent = `
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Additional text visibility fixes for all elements */
                * {
                    /* Prevent invisible text by ensuring minimum contrast */
                }
                
                .style2-question-item * {
                    color: inherit;
                }
                
                .style2-question-item {
                    background: #ffffff !important;
                    color: #374151 !important;
                }
                
                .style2-question-header {
                    background: #f8fafc !important;
                    color: #374151 !important;
                }
                
                .style2-question-content div,
                .style2-question-content span,
                .style2-question-content p {
                    color: #374151 !important;
                }
                
                .style2-feedback {
                    color: #64748b !important;
                    background: rgba(249, 250, 251, 0.5) !important;
                    padding: 8px !important;
                    border-radius: 4px !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    updateQuestions(questions) {
        // Keep the original method for backward compatibility, but use Style 2
        this.updateQuestionsStyle2(questions);
    }

    updateFeedback(feedback) {
        // Update feedback tabs with proper styling for visibility
        document.getElementById('praise-panel').innerHTML = `
            <p style="color: #374151; background: #f0fdf4; padding: 12px; border-radius: 6px; border-left: 4px solid #22c55e;">
                ${this.escapeHtml(feedback.praise || 'You did a great job on this assignment!')}
            </p>
        `;
        
        document.getElementById('improvements-panel').innerHTML = `
            <p style="color: #374151; background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                ${this.escapeHtml(feedback.improvements || 'Keep practicing to improve your skills.')}
            </p>
        `;
        
        document.getElementById('next-steps-panel').innerHTML = `
            <p style="color: #374151; background: #dbeafe; padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6;">
                ${this.escapeHtml(feedback.nextSteps || 'Continue working on similar problems.')}
            </p>
        `;
    }

    toggleQuestion(index) {
        const questionItem = document.querySelector(`[data-question="${index}"]`);
        if (questionItem) {
            questionItem.classList.toggle('expanded');
        }
    }

    expandAllQuestions() {
        document.querySelectorAll('.question-item').forEach(item => {
            item.classList.add('expanded');
        });
        
        this.questionsExpanded = true;
        document.getElementById('expand-all').style.display = 'none';
        document.getElementById('collapse-all').style.display = 'flex';
    }

    collapseAllQuestions() {
        document.querySelectorAll('.question-item').forEach(item => {
            item.classList.remove('expanded');
        });
        
        this.questionsExpanded = false;
        document.getElementById('expand-all').style.display = 'flex';
        document.getElementById('collapse-all').style.display = 'none';
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}-panel`).classList.add('active');
    }

    toggleSection(targetId) {
        const content = document.getElementById(targetId);
        const button = document.querySelector(`[data-target="${targetId}"]`);
        const icon = button.querySelector('i');
        
        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            icon.className = 'fas fa-chevron-up';
        } else {
            content.classList.add('collapsed');
            icon.className = 'fas fa-chevron-down';
        }
    }

    handleKeyboardShortcuts(e) {
        // Prevent shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.previousPage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextPage();
                break;
            case '=':
            case '+':
                e.preventDefault();
                this.zoomIn();
                break;
            case '-':
                e.preventDefault();
                this.zoomOut();
                break;
            case 'Escape':
                e.preventDefault();
                window.history.back();
                break;
        }
    }

    showGradingError(error) {
        document.getElementById('grading-loading').style.display = 'none';
        document.getElementById('grading-error').style.display = 'block';
        
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = error || 'An error occurred while grading the worksheet.';
    }

    showError(message) {
        console.error('Grading Interface Error:', message);
        
        // You could show a toast notification here
        if (window.gradeflow && window.gradeflow.showNotification) {
            window.gradeflow.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    async saveChanges() {
        // This would save any manual edits made to the grading
        console.log('Save changes not yet implemented');
        this.showNotification('Save functionality not yet implemented', 'info');
    }

    showNotification(message, type = 'info') {
        if (window.gradeflow && window.gradeflow.showNotification) {
            window.gradeflow.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize grading interface when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    window.gradingInterface = new GradingInterface();
});