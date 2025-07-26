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
            this.updateWorksheetInfo();
            this.loadPDF();

            // If grading is complete, show results
            if (this.worksheetData.status === 'graded' && this.worksheetData.results) {
                this.showGradingResults(this.worksheetData.results);
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
        
        document.getElementById('worksheet-title').textContent = data.filename || 'Worksheet';
        document.getElementById('student-name').textContent = data.studentName || 'Unknown Student';
        document.getElementById('class-name').textContent = data.className || 'Unknown Class';
        document.getElementById('assignment-name').textContent = data.results?.assignment || 'Assignment';

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
            
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch(`/api/grading/grade/${this.worksheetId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Update worksheet data and status
                this.worksheetData.status = 'processing';
                this.worksheetData.processingStage = 'grading';
                this.updateWorksheetInfo();
                
                // Start polling for results
                this.pollForResults();
                
                this.showNotification('Grading started successfully!', 'success');
            } else {
                throw new Error(result.error || 'Failed to start grading');
            }
            
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

    async loadPDF() {
        try {
            const token = localStorage.getItem('gradeflow_token');
            
            // For demo purposes, we'll show a placeholder since we don't have direct PDF access
            // In a real implementation, you'd fetch the actual PDF file
            this.showPDFPlaceholder();
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showPDFError();
        }
    }

    showPDFPlaceholder() {
        // Hide loading, show canvas
        document.getElementById('pdf-loading').style.display = 'none';
        document.getElementById('pdf-canvas').style.display = 'block';
        
        // Draw a placeholder
        const canvas = this.canvas;
        const ctx = this.context;
        
        canvas.width = 600;
        canvas.height = 800;
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Border
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
        
        // Placeholder content
        ctx.fillStyle = '#6b7280';
        ctx.font = '24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Worksheet Preview', canvas.width / 2, 100);
        
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText('PDF content would be displayed here', canvas.width / 2, 140);
        ctx.fillText('in a real implementation', canvas.width / 2, 170);
        
        // Mock questions
        ctx.fillStyle = '#374151';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'left';
        
        const questions = [
            '1. What is 2 + 2?',
            '2. Solve for x: 3x + 5 = 14',
            '3. What is the capital of France?',
            '4. Define photosynthesis',
            '5. Calculate the area of a circle with radius 5cm'
        ];
        
        questions.forEach((question, index) => {
            ctx.fillText(question, 50, 250 + (index * 60));
            // Mock answer line
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(50, 275 + (index * 60));
            ctx.lineTo(550, 275 + (index * 60));
            ctx.stroke();
        });
        
        this.updatePageControls();
    }

    showPDFError() {
        document.getElementById('pdf-loading').style.display = 'none';
        document.getElementById('pdf-error').style.display = 'block';
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
        // In a real implementation, this would render the specific PDF page
        // For now, we'll just update the placeholder
        this.showPDFPlaceholder();
    }

    async pollForResults() {
        if (this.worksheetData?.status === 'graded' || this.worksheetData?.status === 'error') {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const token = localStorage.getItem('gradeflow_token');
                const response = await fetch(`/api/grading/results/${this.worksheetId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.status === 'graded' && data.results) {
                        clearInterval(pollInterval);
                        this.worksheetData = data;
                        this.updateWorksheetInfo();
                        this.showGradingResults(data.results);
                        this.updateProcessingSteps('completed');
                    } else if (data.status === 'error') {
                        clearInterval(pollInterval);
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
            'ocr': 'step-ocr',
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

    showGradingResults(results) {
        // Hide loading, show results
        document.getElementById('grading-loading').style.display = 'none';
        document.getElementById('grading-results').style.display = 'block';
        
        // Show overall score
        const overallScore = document.getElementById('overall-score');
        const scoreValue = document.getElementById('score-value');
        
        if (results.totalScore !== undefined) {
            scoreValue.textContent = `${results.totalScore}%`;
            overallScore.style.display = 'flex';
        }

        // Update summary
        this.updateSummary(results);
        
        // Update questions
        this.updateQuestions(results.questions || []);
        
        // Update feedback
        this.updateFeedback(this.worksheetData.feedback || {});
    }

    updateSummary(results) {
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

        // Update feedback summary
        const feedbackSummary = document.getElementById('feedback-summary');
        const summary = this.worksheetData.feedback?.summary || 'Great work on this assignment!';
        feedbackSummary.textContent = summary;
    }

    updateQuestions(questions) {
        const questionsList = document.getElementById('questions-list');
        
        if (questions.length === 0) {
            questionsList.innerHTML = '<p class="text-center text-gray-500">No questions found</p>';
            return;
        }

        questionsList.innerHTML = questions.map((question, index) => {
            const statusClass = question.isCorrect ? 'correct' : 
                              question.partialCredit ? 'partial' : 'incorrect';
            
            return `
                <div class="question-item ${statusClass}" data-question="${index}">
                    <div class="question-header" onclick="gradingInterface.toggleQuestion(${index})">
                        <div class="question-title">
                            <div class="question-number">${question.number || index + 1}</div>
                            <div class="question-text">${this.escapeHtml(question.question || `Question ${index + 1}`)}</div>
                        </div>
                        <div class="question-score">
                            ${question.score || 0}/${question.maxScore || 1}
                            <i class="fas fa-chevron-down expand-icon"></i>
                        </div>
                    </div>
                    <div class="question-content">
                        <div class="question-details">
                            ${question.studentAnswer ? `
                                <div class="answer-section student-answer">
                                    <div class="answer-label">Student Answer</div>
                                    <div class="answer-text">${this.escapeHtml(question.studentAnswer)}</div>
                                </div>
                            ` : ''}
                            
                            ${question.correctAnswer ? `
                                <div class="answer-section correct-answer">
                                    <div class="answer-label">Correct Answer</div>
                                    <div class="answer-text">${this.escapeHtml(question.correctAnswer)}</div>
                                </div>
                            ` : ''}
                            
                            ${question.feedback ? `
                                <div class="answer-section">
                                    <div class="answer-label">Feedback</div>
                                    <div class="feedback-text">${this.escapeHtml(question.feedback)}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateFeedback(feedback) {
        // Update feedback tabs
        document.getElementById('praise-panel').innerHTML = `
            <p>${this.escapeHtml(feedback.praise || 'You did a great job on this assignment!')}</p>
        `;
        
        document.getElementById('improvements-panel').innerHTML = `
            <p>${this.escapeHtml(feedback.improvements || 'Keep practicing to improve your skills.')}</p>
        `;
        
        document.getElementById('next-steps-panel').innerHTML = `
            <p>${this.escapeHtml(feedback.nextSteps || 'Continue working on similar problems.')}</p>
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

export default GradingInterface;