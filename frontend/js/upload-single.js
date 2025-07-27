// Single Worksheet Upload Manager
class SingleUploadManager {
    constructor() {
        this.selectedFile = null;
        this.studentDropdown = null;
        this.classDropdown = null;
        this.isUploading = false;
        this.init();
    }

    init() {
        this.setupDropZone();
        this.setupDropdowns();
        this.setupEventListeners();
        this.loadUserData();
        this.loadRecentUploads();
    }

    setupDropdowns() {
        console.log('SingleUploadManager: Setting up dropdowns...');
        
        // Check if dropdowns are already initialized
        const checkInitialization = () => {
            const studentEl = document.getElementById('student-dropdown');
            const classEl = document.getElementById('class-dropdown');
            
            console.log('SingleUploadManager: Checking dropdown initialization status', {
                studentExists: !!studentEl,
                classExists: !!classEl,
                studentInitialized: studentEl?.getAttribute('data-dropdown-initialized') === 'true',
                classInitialized: classEl?.getAttribute('data-dropdown-initialized') === 'true',
                studentHasInstance: !!studentEl?.customDropdown,
                classHasInstance: !!classEl?.customDropdown
            });
            
            if (studentEl?.customDropdown && classEl?.customDropdown) {
                this.connectToDropdowns(studentEl, classEl);
                return true;
            }
            return false;
        };
        
        // Try connecting immediately
        if (checkInitialization()) {
            return;
        }
        
        // Listen for the dropdownsInitialized event
        const handleDropdownsInitialized = (event) => {
            console.log('SingleUploadManager: Received dropdownsInitialized event', event.detail);
            
            setTimeout(() => {
                if (checkInitialization()) {
                    document.removeEventListener('dropdownsInitialized', handleDropdownsInitialized);
                } else {
                    console.log('SingleUploadManager: Dropdowns still not ready after initialization event, trying manual init');
                    this.tryManualDropdownInit();
                }
            }, 300);
        };
        
        document.addEventListener('dropdownsInitialized', handleDropdownsInitialized);
        
        // Also watch for attribute changes as backup
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-dropdown-initialized') {
                    console.log('SingleUploadManager: Detected dropdown initialization via MutationObserver');
                    if (checkInitialization()) {
                        observer.disconnect();
                        document.removeEventListener('dropdownsInitialized', handleDropdownsInitialized);
                        return;
                    }
                }
            }
        });
        
        // Watch for changes in the dropdown elements
        const studentEl = document.getElementById('student-dropdown');
        const classEl = document.getElementById('class-dropdown');
        
        if (studentEl) observer.observe(studentEl, { attributes: true });
        if (classEl) observer.observe(classEl, { attributes: true });
        
        // Final fallback timeout
        setTimeout(() => {
            observer.disconnect();
            document.removeEventListener('dropdownsInitialized', handleDropdownsInitialized);
            if (!this.studentDropdown || !this.classDropdown) {
                console.log('SingleUploadManager: Timeout reached, trying manual initialization');
                this.tryManualDropdownInit();
            }
        }, 10000); // Increased timeout to 10 seconds
    }

    connectToDropdowns(studentEl, classEl) {
        console.log('SingleUploadManager: Connecting to initialized dropdowns');
        
        // Connect to dropdown instances
        this.studentDropdown = studentEl.customDropdown;
        this.classDropdown = classEl.customDropdown;
        
        // Set up event handlers
        this.studentDropdown.options.onSelect = (option) => {
            console.log('Student selected:', option);
            this.clearError('student-error');
            setTimeout(() => this.validateForm(), 10);
        };
        
        this.classDropdown.options.onSelect = (option) => {
            console.log('Class selected:', option);
            this.clearError('class-error');
            setTimeout(() => this.validateForm(), 10);
        };
        
        console.log('SingleUploadManager: Successfully connected to dropdowns');
        
        // Initial validation
        setTimeout(() => this.validateForm(), 100);
    }

    tryManualDropdownInit() {
        console.log('SingleUploadManager: Trying manual dropdown initialization...');
        
        if (typeof window.CustomDropdown !== 'function') {
            console.error('SingleUploadManager: CustomDropdown class not available, falling back');
            this.createFallbackDropdowns();
            return;
        }
        
        const studentEl = document.getElementById('student-dropdown');
        const classEl = document.getElementById('class-dropdown');
        
        if (!studentEl || !classEl) {
            console.error('SingleUploadManager: Dropdown elements not found', {
                studentExists: !!studentEl,
                classExists: !!classEl,
                studentEl: studentEl,
                classEl: classEl,
                allStudentElements: document.querySelectorAll('[id*="student"]'),
                allClassElements: document.querySelectorAll('[id*="class"]')
            });
            this.createFallbackDropdowns();
            return;
        }
        
        try {
            let successCount = 0;
            
            // Try to manually initialize student dropdown
            if (!studentEl.customDropdown && studentEl.dataset.dropdown) {
                try {
                    const studentOptions = JSON.parse(studentEl.dataset.dropdown);
                    console.log('SingleUploadManager: Creating student dropdown with options:', studentOptions);
                    
                    const studentDropdown = new window.CustomDropdown(studentEl, studentOptions);
                    window.activeDropdowns = window.activeDropdowns || new Set();
                    window.activeDropdowns.add(studentDropdown);
                    
                    studentEl.setAttribute('data-dropdown-initialized', 'true');
                    console.log('SingleUploadManager: Student dropdown manually initialized successfully');
                    successCount++;
                } catch (error) {
                    console.error('SingleUploadManager: Failed to initialize student dropdown:', error);
                    studentEl.setAttribute('data-dropdown-error', error.message);
                }
            }
            
            // Try to manually initialize class dropdown
            if (!classEl.customDropdown && classEl.dataset.dropdown) {
                try {
                    const classOptions = JSON.parse(classEl.dataset.dropdown);
                    console.log('SingleUploadManager: Creating class dropdown with options:', classOptions);
                    
                    const classDropdown = new window.CustomDropdown(classEl, classOptions);
                    window.activeDropdowns = window.activeDropdowns || new Set();
                    window.activeDropdowns.add(classDropdown);
                    
                    classEl.setAttribute('data-dropdown-initialized', 'true');
                    console.log('SingleUploadManager: Class dropdown manually initialized successfully');
                    successCount++;
                } catch (error) {
                    console.error('SingleUploadManager: Failed to initialize class dropdown:', error);
                    classEl.setAttribute('data-dropdown-error', error.message);
                }
            }
            
            // Try to connect if both were successful
            setTimeout(() => {
                if (successCount === 2) {
                    const studentDropdownEl = document.getElementById('student-dropdown');
                    const classDropdownEl = document.getElementById('class-dropdown');
                    
                    if (studentDropdownEl?.customDropdown && classDropdownEl?.customDropdown) {
                        this.connectToDropdowns(studentDropdownEl, classDropdownEl);
                        console.log('SingleUploadManager: Manual initialization and connection successful');
                        return;
                    }
                }
                
                console.warn('SingleUploadManager: Manual initialization partially failed, using fallback');
                this.createFallbackDropdowns();
            }, 200);
            
        } catch (error) {
            console.error('SingleUploadManager: Manual dropdown initialization error:', error);
            this.createFallbackDropdowns();
        }
    }

    createFallbackDropdowns() {
        // Create mock dropdown objects that will return dummy values initially
        this.studentDropdown = {
            getValue: () => null,
            getSelectedOption: () => null,
            setError: () => {},
            clear: () => {},
            refresh: () => {},
            setValue: () => {},
            options: {},
            fallbackMode: true
        };
        
        this.classDropdown = {
            getValue: () => null,
            getSelectedOption: () => null,
            setError: () => {},
            clear: () => {},
            refresh: () => {},
            setValue: () => {},
            options: {},
            fallbackMode: true
        };
        
        // Add click handlers to the actual dropdown elements for manual override
        const studentEl = document.getElementById('student-dropdown');
        const classEl = document.getElementById('class-dropdown');
        
        if (studentEl) {
            // Update the display to show it's in fallback mode
            studentEl.innerHTML = `
                <div class="dropdown-trigger" style="background: #fee2e2; border-color: #fca5a5; color: #991b1b;">
                    <span>Click to enter student name (Fallback Mode)</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
            `;
            
            studentEl.addEventListener('click', async () => {
                const name = prompt('Enter student name (fallback mode):');
                if (name) {
                    try {
                        const studentId = await this.createFallbackStudent(name);
                        if (studentId) {
                            this.studentDropdown.getValue = () => studentId;
                            this.studentDropdown.getSelectedOption = () => ({ value: studentId, label: name });
                            studentEl.innerHTML = `
                                <div class="dropdown-trigger selected" style="background: #dcfce7; border-color: #86efac;">
                                    <span>${name}</span>
                                    <i class="fas fa-user"></i>
                                </div>
                            `;
                            this.validateForm();
                        }
                    } catch (error) {
                        this.showNotification('Failed to create student. Please try again.', 'error');
                    }
                }
            });
        }
        
        if (classEl) {
            // Update the display to show it's in fallback mode
            classEl.innerHTML = `
                <div class="dropdown-trigger" style="background: #fee2e2; border-color: #fca5a5; color: #991b1b;">
                    <span>Click to enter class name (Fallback Mode)</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
            `;
            
            classEl.addEventListener('click', async () => {
                const name = prompt('Enter class name (fallback mode):');
                if (name) {
                    try {
                        const classId = await this.createFallbackClass(name);
                        if (classId) {
                            this.classDropdown.getValue = () => classId;
                            this.classDropdown.getSelectedOption = () => ({ value: classId, label: name });
                            classEl.innerHTML = `
                                <div class="dropdown-trigger selected" style="background: #dcfce7; border-color: #86efac;">
                                    <span>${name}</span>
                                    <i class="fas fa-graduation-cap"></i>
                                </div>
                            `;
                            this.validateForm();
                        }
                    } catch (error) {
                        this.showNotification('Failed to create class. Please try again.', 'error');
                    }
                }
            });
        }
    }

    async createFallbackStudent(name) {
        try {
            const token = localStorage.getItem('gradeflow_token');
            if (!token) {
                throw new Error('No authentication token');
            }

            const response = await fetch('/api/students', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    grade: 'K',
                    email: ''
                })
            });

            if (response.ok) {
                const result = await response.json();
                return result.student._id;
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create student');
            }
        } catch (error) {
            throw error;
        }
    }

    async createFallbackClass(name) {
        try {
            const token = localStorage.getItem('gradeflow_token');
            if (!token) {
                throw new Error('No authentication token');
            }

            const response = await fetch('/api/classes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    subject: 'other',
                    gradeLevel: 'K'
                })
            });

            if (response.ok) {
                const result = await response.json();
                return result.class._id;
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create class');
            }
        } catch (error) {
            throw error;
        }
    }

    setupDropZone() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const browseBtn = document.getElementById('browse-btn');

        // Ensure file input exists and is properly configured
        if (!fileInput) {
            return;
        }

        if (!dropZone) {
            return;
        }

        if (!browseBtn) {
            return;
        }

        // Make sure file input is properly configured
        fileInput.setAttribute('accept', '.pdf,.jpg,.jpeg,.png');
        fileInput.style.display = 'none';
        fileInput.style.position = 'absolute';
        fileInput.style.top = '-9999px';
        fileInput.style.left = '-9999px';
        fileInput.setAttribute('multiple', 'false');
        fileInput.removeAttribute('disabled');

        // Make sure browse button is properly clickable
        browseBtn.style.pointerEvents = 'auto';
        browseBtn.style.cursor = 'pointer';
        browseBtn.style.position = 'relative';
        browseBtn.style.zIndex = '10';
        
        // Click to browse
        browseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                fileInput.click();
            } catch (error) {
                // Silent fail
            }
        });

        // Add click handler to drop zone
        dropZone.addEventListener('click', (e) => {
            // Don't trigger if clicking on the browse button or file input itself
            if (e.target === browseBtn || browseBtn.contains(e.target) || 
                e.target === fileInput || fileInput.contains(e.target)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            
            try {
                // Use direct click without bubbling to prevent infinite loop
                fileInput.click();
            } catch (error) {
                // Silent fail
            }
        });

        // File selection - add multiple event listeners for robustness
        ['change', 'input'].forEach(eventType => {
            fileInput.addEventListener(eventType, (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    this.handleFile(file);
                }
            });
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only remove if leaving the drop zone entirely
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-over');
            }
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
        });
    }

    setupEventListeners() {
        // Upload button
        document.getElementById('upload-btn').addEventListener('click', () => {
            this.startUpload();
        });

        // Clear file button
        document.getElementById('clear-file').addEventListener('click', () => {
            this.clearFile();
        });

        // Cancel/Clear all button
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.clearAll();
        });

        // Assignment name input
        document.getElementById('assignment-name').addEventListener('input', () => {
            this.validateForm();
        });

        // Debug button
        document.getElementById('debug-btn').addEventListener('click', () => {
            this.debugDropdowns();
        });

        // Force enable button for testing
        document.getElementById('force-enable-btn').addEventListener('click', () => {
            this.forceEnableUpload();
        });
    }

    debugDropdowns() {
        console.log('=== DROPDOWN DEBUG INFO ===');
        console.log('Timestamp:', new Date().toISOString());
        
        // Basic dropdown state
        console.log('\n1. Dropdown Instances:');
        console.log('  Student dropdown exists:', !!this.studentDropdown);
        console.log('  Class dropdown exists:', !!this.classDropdown);
        console.log('  Student dropdown fallback mode:', this.studentDropdown?.fallbackMode);
        console.log('  Class dropdown fallback mode:', this.classDropdown?.fallbackMode);
        
        // DOM elements
        console.log('\n2. DOM Elements:');
        const studentEl = document.getElementById('student-dropdown');
        const classEl = document.getElementById('class-dropdown');
        console.log('  Student dropdown element:', !!studentEl, studentEl);
        console.log('  Class dropdown element:', !!classEl, classEl);
        console.log('  Student customDropdown property:', !!studentEl?.customDropdown);
        console.log('  Class customDropdown property:', !!classEl?.customDropdown);
        console.log('  All elements with student-dropdown id:', document.querySelectorAll('#student-dropdown'));
        console.log('  All elements with class-dropdown id:', document.querySelectorAll('#class-dropdown'));
        console.log('  CustomDropdown class available:', typeof window.CustomDropdown);
        console.log('  activeDropdowns:', window.activeDropdowns);
        console.log('  Elements with data-dropdown:', document.querySelectorAll('[data-dropdown]').length);
        
        // Current values
        console.log('\n3. Current Values:');
        console.log('  Student getValue():', this.studentDropdown?.getValue());
        console.log('  Class getValue():', this.classDropdown?.getValue());
        console.log('  Student selectedValue:', this.studentDropdown?.selectedValue);
        console.log('  Class selectedValue:', this.classDropdown?.selectedValue);
        console.log('  Student selectedOption:', this.studentDropdown?.selectedOption);
        console.log('  Class selectedOption:', this.classDropdown?.selectedOption);
        
        // Options data
        console.log('\n4. Options Data:');
        console.log('  Student allOptions length:', this.studentDropdown?.allOptions?.length || 0);
        console.log('  Class allOptions length:', this.classDropdown?.allOptions?.length || 0);
        console.log('  Student filteredOptions length:', this.studentDropdown?.filteredOptions?.length || 0);
        console.log('  Class filteredOptions length:', this.classDropdown?.filteredOptions?.length || 0);
        
        if (this.studentDropdown?.allOptions?.length > 0) {
            console.log('  Student options sample:', this.studentDropdown.allOptions.slice(0, 3));
        }
        if (this.classDropdown?.allOptions?.length > 0) {
            console.log('  Class options sample:', this.classDropdown.allOptions.slice(0, 3));
        }
        
        // File selection
        console.log('\n5. File Selection:');
        console.log('  Selected file exists:', !!this.selectedFile);
        console.log('  File details:', this.selectedFile ? {
            name: this.selectedFile.name,
            type: this.selectedFile.type,
            size: this.selectedFile.size
        } : 'None');
        
        // Form validation
        console.log('\n6. Form Validation:');
        const studentSelected = this.studentDropdown?.getValue();
        const classSelected = this.classDropdown?.getValue();
        const fileSelected = !!this.selectedFile;
        const dropdownsReady = !!(this.studentDropdown && this.classDropdown);
        
        console.log('  Has student:', !!studentSelected, '(value:', studentSelected, ')');
        console.log('  Has class:', !!classSelected, '(value:', classSelected, ')');
        console.log('  Has file:', fileSelected);
        console.log('  Dropdowns ready:', dropdownsReady);
        console.log('  All conditions met:', !!(studentSelected && classSelected && fileSelected && dropdownsReady));
        
        // Button state
        console.log('\n7. Upload Button State:');
        const uploadBtn = document.getElementById('upload-btn');
        const uploadActions = document.getElementById('upload-actions');
        console.log('  Button exists:', !!uploadBtn);
        console.log('  Button disabled:', uploadBtn?.disabled);
        console.log('  Button opacity:', uploadBtn?.style.opacity);
        console.log('  Button pointer events:', uploadBtn?.style.pointerEvents);
        console.log('  Actions visible (show class):', uploadActions?.classList.contains('show'));
        console.log('  Actions display style:', uploadActions?.style.display);
        
        console.log('\n=== END DEBUG INFO ===');
        
        // Also trigger a validation to see current behavior
        console.log('\nTriggering validateForm() now...');
        this.validateForm();
    }

    forceEnableUpload() {
        console.log('Force enabling upload button for testing...');
        
        const uploadBtn = document.getElementById('upload-btn');
        const uploadActions = document.getElementById('upload-actions');
        
        if (uploadBtn && uploadActions) {
            uploadBtn.disabled = false;
            uploadBtn.style.opacity = '1';
            uploadBtn.style.pointerEvents = 'auto';
            uploadActions.classList.add('show');
            uploadActions.style.display = 'flex';
            
            console.log('Upload button force-enabled');
            
            // Create mock data if needed
            if (!this.selectedFile) {
                this.selectedFile = new File(['test content'], 'test-file.pdf', {
                    type: 'application/pdf',
                    lastModified: Date.now()
                });
                this.showFilePreview(this.selectedFile);
                console.log('Mock file created and set');
            }
            
            if (!this.studentDropdown?.getValue()) {
                console.log('No student selected - you may need to select a student manually');
            }
            
            if (!this.classDropdown?.getValue()) {
                console.log('No class selected - you may need to select a class manually');
            }
        } else {
            console.log('Upload button or actions not found');
        }
    }

    async loadUserData() {
        try {
            const token = localStorage.getItem('gradeflow_token');
            if (!token) {
                this.showNotification('Please log in to access this page.', 'warning');
                return;
            }

            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateUserInfo(data.user);
                await this.updateUsageStats();
            } else {
                if (response.status === 401) {
                    localStorage.removeItem('gradeflow_token');
                    this.showNotification('Session expired. Please log in again.', 'warning');
                }
            }
        } catch (error) {
            // Network error or server not running - continue without user data
            console.log('User data load failed, continuing without authentication');
        }
    }

    updateUserInfo(user) {
        const userNameElements = document.querySelectorAll('#user-name, .user-name-liquid');
        const userPlanElements = document.querySelectorAll('#user-plan, .user-plan-liquid');
        
        userNameElements.forEach(el => el.textContent = user.name);
        userPlanElements.forEach(el => el.textContent = `${user.plan} Plan`);
    }

    async updateUsageStats() {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/dashboard/overview', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const user = data.user;
                
                const used = user.worksheetsProcessed || 0;
                const limit = user.monthlyLimit || 50;
                const remaining = Math.max(0, limit - used);
                const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;

                document.getElementById('worksheets-used').textContent = used;
                document.getElementById('worksheets-remaining').textContent = remaining;
                document.getElementById('usage-percentage').textContent = `${percentage}%`;
                document.getElementById('usage-progress').style.width = `${percentage}%`;
            }
        } catch (error) {
            // Silent error handling
        }
    }

    handleFile(file) {
        if (!this.validateFile(file)) {
            return;
        }

        this.selectedFile = file;
        this.showFilePreview(file);
        this.validateForm();
    }

    validateFile(file) {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        const maxSize = 10 * 1024 * 1024; // 10MB limit (matches backend)

        if (!allowedTypes.includes(file.type)) {
            this.showNotification(`Invalid file type "${file.type}". Only PDF, JPG, and PNG files are allowed.`, 'error');
            return false;
        }

        if (file.size > maxSize) {
            const fileSizeMB = Math.round(file.size / (1024 * 1024) * 10) / 10;
            this.showNotification(
                `File too large (${fileSizeMB}MB). Maximum size is 10MB. ` +
                `For images, try compressing the file or reducing image quality.`, 
                'error'
            );
            return false;
        }

        return true;
    }

    showFilePreview(file) {
        const filePreview = document.getElementById('file-preview');
        const filePreviewContent = document.getElementById('file-preview-content');
        
        const fileType = this.getFileIcon(file.type);
        const fileSize = this.formatFileSize(file.size);
        
        filePreviewContent.innerHTML = `
            <div class="file-preview-item">
                <div class="file-preview-icon">
                    <i class="fas ${fileType}"></i>
                </div>
                <div class="file-preview-info">
                    <div class="file-preview-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-preview-meta">${fileSize} • ${file.type}</div>
                </div>
            </div>
        `;
        
        filePreview.style.display = 'block';
        document.getElementById('drop-zone').style.display = 'none';
    }

    clearFile() {
        this.selectedFile = null;
        document.getElementById('file-preview').style.display = 'none';
        document.getElementById('drop-zone').style.display = 'block';
        document.getElementById('file-input').value = '';
        this.validateForm();
    }

    clearAll() {
        this.clearFile();
        this.studentDropdown?.clear();
        this.classDropdown?.clear();
        document.getElementById('assignment-name').value = '';
        this.clearAllErrors();
        this.validateForm();
    }

    validateForm() {
        const uploadBtn = document.getElementById('upload-btn');
        const uploadActions = document.getElementById('upload-actions');
        
        if (!uploadBtn || !uploadActions) {
            return;
        }
        
        // Simplified validation - only require file selection
        const hasFile = !!this.selectedFile;
        
        console.log('SingleUploadManager: Form validation check:', {
            hasFile,
            fileName: this.selectedFile?.name
        });
        
        if (hasFile) {
            uploadBtn.disabled = false;
            uploadBtn.style.opacity = '1';
            uploadBtn.style.pointerEvents = 'auto';
            uploadActions.classList.add('show');
            uploadActions.style.display = 'flex';
        } else {
            uploadBtn.disabled = true;
            uploadBtn.style.opacity = '0.5';
            uploadBtn.style.pointerEvents = 'none';
            uploadActions.classList.remove('show');
            uploadActions.style.display = 'none';
        }
    }

    async startUpload() {
        if (!this.validateUpload()) {
            return;
        }

        if (this.isUploading) {
            this.showNotification('Upload already in progress.', 'warning');
            return;
        }

        this.isUploading = true;
        this.showProcessingOverlay('Uploading worksheet...', 'Please wait while we process your file.');

        try {
            // Step 1: Upload in progress
            this.updateProcessingStep(0);

            // Get values or use defaults for demo
            const studentId = this.studentDropdown?.getValue() || '507f1f77bcf86cd799439012'; // Demo student ID
            const classId = this.classDropdown?.getValue() || '507f1f77bcf86cd799439013'; // Demo class ID
            const assignmentName = document.getElementById('assignment-name')?.value?.trim() || 'Demo Assignment';
            
            console.log('Starting upload with values:', {
                studentId,
                classId,
                assignmentName,
                fileName: this.selectedFile?.name
            });
            
            const formData = new FormData();
            formData.append('worksheet', this.selectedFile);
            formData.append('studentId', studentId);
            formData.append('classId', classId);
            
            if (assignmentName) {
                formData.append('assignment', assignmentName);
            }

            console.log('Making upload request...');
            
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/upload/worksheet/single', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                // Step 2: Analyzing worksheet
                this.updateProcessingStep(1);
                this.updateProcessingOverlay('Analyzing worksheet...', 'AI is reading and understanding the content.');

                await new Promise(resolve => setTimeout(resolve, 1500));

                // Step 3: AI grading 
                this.updateProcessingStep(2);
                this.updateProcessingOverlay('AI grading in progress...', 'Gemini 2.5 Flash is evaluating answers.');

                await new Promise(resolve => setTimeout(resolve, 2000));

                // Step 4: Generating feedback
                this.updateProcessingStep(3);
                this.updateProcessingOverlay('Generating feedback...', 'Creating personalized recommendations.');

                await new Promise(resolve => setTimeout(resolve, 1000));

                this.showNotification('Worksheet processed successfully! Redirecting to results...', 'success');
                
                // Clear form
                this.clearAll();
                this.updateUsageStats();
                this.loadRecentUploads();

                // Redirect to split-screen grading interface
                setTimeout(() => {
                    window.location.href = `/pages/grading-split.html?worksheet=${result.worksheet.id}`;
                }, 1500);

            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            this.showNotification(error.message || 'Upload failed. Please try again.', 'error');
        } finally {
            this.isUploading = false;
            this.hideProcessingOverlay();
        }
    }

    validateUpload() {
        // For demo purposes, only require file selection
        if (!this.selectedFile) {
            this.showNotification('Please select a file to upload.', 'error');
            return false;
        }

        console.log('Upload validation passed:', {
            hasFile: !!this.selectedFile,
            fileName: this.selectedFile?.name
        });

        return true;
    }

    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        }
    }

    clearError(elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.classList.remove('show');
            errorElement.textContent = '';
        }
    }

    clearAllErrors() {
        this.clearError('student-error');
        this.clearError('class-error');
        this.studentDropdown?.setError(false);
        this.classDropdown?.setError(false);
    }

    showProcessingOverlay(title, subtitle) {
        const overlay = document.createElement('div');
        overlay.className = 'processing-overlay show';
        overlay.innerHTML = `
            <div class="processing-modal">
                <div class="processing-spinner"></div>
                <div class="processing-text">${title}</div>
                <div class="processing-subtext">${subtitle}</div>
                <div class="processing-steps" id="processing-steps">
                    <div class="step active">
                        <i class="fas fa-upload"></i>
                        <span>Uploading file...</span>
                    </div>
                    <div class="step">
                        <i class="fas fa-eye"></i>
                        <span>Analyzing worksheet</span>
                    </div>
                    <div class="step">
                        <i class="fas fa-robot"></i>
                        <span>AI grading in progress</span>
                    </div>
                    <div class="step">
                        <i class="fas fa-check"></i>
                        <span>Generating feedback</span>
                    </div>
                </div>
            </div>
        `;

        // Add CSS for processing steps
        if (!document.querySelector('#processing-steps-css')) {
            const style = document.createElement('style');
            style.id = 'processing-steps-css';
            style.textContent = `
                .processing-steps {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                }
                .processing-steps .step {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 0;
                    color: #9ca3af;
                    font-size: 14px;
                    transition: color 0.3s ease;
                }
                .processing-steps .step.active {
                    color: #3b82f6;
                }
                .processing-steps .step.completed {
                    color: #10b981;
                }
                .processing-steps .step i {
                    width: 16px;
                    text-align: center;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);
        this.processingOverlay = overlay;
    }

    updateProcessingStep(stepIndex) {
        const steps = this.processingOverlay?.querySelectorAll('.step');
        if (steps && steps[stepIndex]) {
            // Mark previous steps as completed
            for (let i = 0; i < stepIndex; i++) {
                steps[i].classList.remove('active');
                steps[i].classList.add('completed');
            }

            // Mark current step as active
            steps[stepIndex].classList.add('active');

            // Remove active from future steps
            for (let i = stepIndex + 1; i < steps.length; i++) {
                steps[i].classList.remove('active', 'completed');
            }
        }
    }

    updateProcessingOverlay(title, subtitle) {
        if (this.processingOverlay) {
            const titleEl = this.processingOverlay.querySelector('.processing-text');
            const subtitleEl = this.processingOverlay.querySelector('.processing-subtext');

            if (titleEl) titleEl.textContent = title;
            if (subtitleEl) subtitleEl.textContent = subtitle;
        }
    }


    hideProcessingOverlay() {
        if (this.processingOverlay) {
            this.processingOverlay.classList.remove('show');
            setTimeout(() => {
                if (this.processingOverlay && this.processingOverlay.parentNode) {
                    this.processingOverlay.parentNode.removeChild(this.processingOverlay);
                }
                this.processingOverlay = null;
            }, 300);
        }
    }

    showAddStudentModal(searchTerm = '') {
        document.getElementById('student-name').value = searchTerm;
        document.getElementById('student-grade').value = 'K';
        document.getElementById('student-email').value = '';
        this.showModal('student-modal');
    }

    showAddClassModal(searchTerm = '') {
        document.getElementById('class-name').value = searchTerm;
        document.getElementById('class-subject').value = 'other';
        document.getElementById('class-grade').value = 'K';
        this.showModal('class-modal');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        
        // Setup form submission
        const form = modal.querySelector('form');
        form.onsubmit = (e) => {
            e.preventDefault();
            if (modalId === 'student-modal') {
                this.handleStudentSubmit();
            } else if (modalId === 'class-modal') {
                this.handleClassSubmit();
            }
        };
    }

    handleStudentSubmit() {
        const name = document.getElementById('student-name').value.trim();
        const grade = document.getElementById('student-grade').value;
        const email = document.getElementById('student-email').value.trim();
        
        if (!name) {
            this.showNotification('Student name is required', 'error');
            return;
        }
        
        this.createStudent({ name, grade, email });
        this.closeModal('student-modal');
    }

    handleClassSubmit() {
        const name = document.getElementById('class-name').value.trim();
        const subject = document.getElementById('class-subject').value;
        const gradeLevel = document.getElementById('class-grade').value;
        
        if (!name) {
            this.showNotification('Class name is required', 'error');
            return;
        }
        
        this.createClass({ name, subject, gradeLevel });
        this.closeModal('class-modal');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
    }

    async createStudent(studentData) {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/students', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(studentData)
            });

            const result = await response.json();

            if (response.ok) {
                this.showNotification(`Student "${studentData.name}" created successfully!`, 'success');
                this.studentDropdown.refresh();
                
                // Auto-select the new student
                setTimeout(() => {
                    this.studentDropdown.setValue(result.student._id);
                }, 500);
            } else {
                this.showNotification(result.error || 'Failed to create student', 'error');
            }
        } catch (error) {
            this.showNotification('Failed to create student', 'error');
        }
    }

    async createClass(classData) {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/classes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(classData)
            });

            const result = await response.json();

            if (response.ok) {
                this.showNotification(`Class "${classData.name}" created successfully!`, 'success');
                this.classDropdown.refresh();
                
                // Auto-select the new class
                setTimeout(() => {
                    this.classDropdown.setValue(result.class._id);
                }, 500);
            } else {
                this.showNotification(result.error || 'Failed to create class', 'error');
            }
        } catch (error) {
            this.showNotification('Failed to create class', 'error');
        }
    }

    async loadRecentUploads() {
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/upload/worksheets?limit=5', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayRecentUploads(data.worksheets);
            }
        } catch (error) {
            // Silent error handling
        }
    }

    displayRecentUploads(worksheets) {
        const recentList = document.getElementById('recent-list');
        
        if (worksheets.length === 0) {
            recentList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-upload"></i>
                    <p>No recent uploads</p>
                    <span>Upload your first worksheet to get started</span>
                </div>
            `;
            return;
        }

        recentList.innerHTML = '';
        
        worksheets.forEach(worksheet => {
            const recentItem = document.createElement('div');
            recentItem.className = 'recent-item';
            
            const statusIcon = this.getStatusIcon(worksheet.status);
            const timeAgo = this.timeAgo(worksheet.uploadDate);
            
            recentItem.innerHTML = `
                <div class="recent-icon ${worksheet.status}">
                    <i class="fas ${statusIcon}"></i>
                </div>
                <div class="recent-info">
                    <div class="recent-filename">${worksheet.originalName}</div>
                    <div class="recent-details">
                        ${worksheet.studentName || 'Unknown Student'} • 
                        ${worksheet.className || 'Unknown Class'} • 
                        ${timeAgo}
                    </div>
                </div>
                <div class="recent-actions">
                    ${worksheet.status === 'graded' 
                        ? `<button class="btn btn-primary btn-sm" onclick="window.location.href='/pages/grading-split.html?worksheet=${worksheet._id}'">View Results</button>`
                        : worksheet.status === 'error'
                            ? `<button class="btn btn-outline btn-sm" onclick="singleUploadManager.retryProcessing('${worksheet._id}')">Retry</button>`
                            : `<button class="btn btn-outline btn-sm" disabled>Processing...</button>`
                    }
                </div>
            `;
            
            recentList.appendChild(recentItem);
        });
    }

    retryProcessing(worksheetId) {
        this.showNotification('Processing retry not yet implemented.', 'info');
    }

    // Utility methods
    getFileIcon(mimeType) {
        if (mimeType === 'application/pdf') return 'fa-file-pdf';
        if (mimeType.startsWith('image/')) return 'fa-file-image';
        return 'fa-file';
    }

    getStatusIcon(status) {
        const icons = {
            'graded': 'fa-check',
            'processing': 'fa-cog',
            'error': 'fa-exclamation-triangle'
        };
        return icons[status] || 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    timeAgo(date) {
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        
        if (seconds < 60) return 'just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        // Use the notification system from main.js if available
        if (window.gradeflow && window.gradeflow.showNotification) {
            window.gradeflow.showNotification(message, type);
        } else {
            // Fallback to alert
            alert(message);
        }
    }
}

// Initialize single upload manager after dropdowns are auto-initialized
document.addEventListener('DOMContentLoaded', () => {
    console.log('SingleUploadManager: DOM ready, waiting for initialization...');
    
    // Listen for dropdown initialization event first
    const handleDropdownsInitialized = (event) => {
        console.log('SingleUploadManager: Received dropdownsInitialized event, starting initialization');
        document.removeEventListener('dropdownsInitialized', handleDropdownsInitialized);
        
        setTimeout(() => {
            window.singleUploadManager = new SingleUploadManager();
        }, 50);
    };
    
    document.addEventListener('dropdownsInitialized', handleDropdownsInitialized);
    
    // Also try after a delay as fallback
    setTimeout(() => {
        if (!window.singleUploadManager) {
            console.log('SingleUploadManager: Fallback initialization after timeout');
            document.removeEventListener('dropdownsInitialized', handleDropdownsInitialized);
            window.singleUploadManager = new SingleUploadManager();
        }
    }, 2000); // Wait longer for dropdowns to initialize
});

// Export removed for browser compatibility