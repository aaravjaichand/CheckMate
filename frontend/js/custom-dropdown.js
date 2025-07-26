// Custom Dropdown Component
class CustomDropdown {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            placeholder: 'Select an option...',
            searchPlaceholder: 'Search...',
            apiEndpoint: null,
            searchable: true,
            clearable: true,
            addNew: false,
            addNewText: 'Add New',
            addNewCallback: null,
            onSelect: null,
            onAddNew: null,
            loadOptions: null,
            displayKey: 'label',
            valueKey: 'value',
            metaKey: null,
            badgeKey: null,
            emptyText: 'No options found',
            loadingText: 'Loading...',
            debounceMs: 300,
            ...options
        };
        
        this.isOpen = false;
        this.selectedValue = null;
        this.selectedOption = null;
        this.filteredOptions = [];
        this.allOptions = [];
        this.searchTerm = '';
        this.loading = false;
        
        this.init();
    }

    init() {
        this.createStructure();
        this.bindEvents();
        this.loadInitialOptions();
    }

    createStructure() {
        const dropdown = document.createElement('div');
        dropdown.className = 'custom-dropdown';
        
        dropdown.innerHTML = `
            <div class="dropdown-trigger" tabindex="0">
                <div class="dropdown-placeholder">${this.options.placeholder}</div>
                <div class="dropdown-selected" style="display: none;">
                    <div class="dropdown-selected-content">
                        <div class="dropdown-selected-text"></div>
                        <div class="dropdown-selected-meta"></div>
                    </div>
                </div>
                <svg class="dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div class="dropdown-menu">
                ${this.options.searchable ? `
                    <div class="dropdown-search">
                        <input type="text" class="dropdown-search-input" placeholder="${this.options.searchPlaceholder}">
                    </div>
                ` : ''}
                ${this.options.addNew ? `
                    <div class="dropdown-add-new">
                        <button type="button" class="dropdown-add-button">
                            <svg class="dropdown-add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                            ${this.options.addNewText}
                        </button>
                    </div>
                ` : ''}
                <div class="dropdown-options"></div>
            </div>
        `;

        // Copy over important attributes from original element
        if (this.element.id) {
            dropdown.id = this.element.id;
        }
        if (this.element.className && !dropdown.className.includes(this.element.className)) {
            dropdown.className += ' ' + this.element.className;
        }
        
        // Replace the original element
        this.element.parentNode.replaceChild(dropdown, this.element);
        this.element = dropdown;
        
        // Store reference to this instance on the element
        this.element.customDropdown = this;

        // Cache DOM elements
        this.trigger = this.element.querySelector('.dropdown-trigger');
        this.menu = this.element.querySelector('.dropdown-menu');
        this.optionsContainer = this.element.querySelector('.dropdown-options');
        this.placeholder = this.element.querySelector('.dropdown-placeholder');
        this.selected = this.element.querySelector('.dropdown-selected');
        this.selectedText = this.element.querySelector('.dropdown-selected-text');
        this.selectedMeta = this.element.querySelector('.dropdown-selected-meta');
        
        if (this.options.searchable) {
            this.searchInput = this.element.querySelector('.dropdown-search-input');
        }
        
        if (this.options.addNew) {
            this.addButton = this.element.querySelector('.dropdown-add-button');
        }
    }

    bindEvents() {
        // Store bound event handlers for cleanup
        this.boundHandlers = {
            outsideClick: (e) => {
                if (!this.element.contains(e.target)) {
                    this.close();
                }
            },
            escapeKey: (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            }
        };

        // Toggle dropdown
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Keyboard navigation for trigger
        this.trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.open();
                this.focusFirstOption();
            }
        });

        // Search functionality
        if (this.searchInput) {
            let searchTimeout;
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, this.options.debounceMs);
            });

            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.focusFirstOption();
                } else if (e.key === 'Escape') {
                    this.close();
                }
            });
        }

        // Add new functionality
        if (this.addButton) {
            this.addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleAddNew();
            });
        }

        // Global event listeners
        document.addEventListener('click', this.boundHandlers.outsideClick);
        document.addEventListener('keydown', this.boundHandlers.escapeKey);
    }

    async loadInitialOptions() {
        if (this.options.loadOptions) {
            this.setLoading(true);
            try {
                this.allOptions = await this.options.loadOptions('');
                this.filteredOptions = [...this.allOptions];
                this.renderOptions();
            } catch (error) {
                this.showError('Failed to load options');
            } finally {
                this.setLoading(false);
            }
        } else if (this.options.apiEndpoint) {
            this.loadOptionsFromAPI('');
        }
    }

    async loadOptionsFromAPI(searchTerm = '') {
        if (!this.options.apiEndpoint) {
            console.warn('CustomDropdown: No API endpoint configured');
            return;
        }

        console.log(`CustomDropdown: Loading options from ${this.options.apiEndpoint}`, { searchTerm });
        this.setLoading(true);
        
        try {
            const token = localStorage.getItem('gradeflow_token');
            if (!token) {
                console.warn('CustomDropdown: No authentication token found');
                this.showError('Please log in to load options.');
                this.setLoading(false);
                return;
            }

            const url = new URL(this.options.apiEndpoint, window.location.origin);
            if (searchTerm) url.searchParams.set('q', searchTerm);

            console.log(`CustomDropdown: Making request to ${url.toString()}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            console.log(`CustomDropdown: Response status: ${response.status}`);

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Please log in again.');
                } else if (response.status === 404) {
                    throw new Error('Service not found. Please contact support.');
                } else if (response.status >= 500) {
                    throw new Error('Server error. Please try again later.');
                } else {
                    const errorText = await response.text();
                    throw new Error(`Error ${response.status}: ${errorText || response.statusText}`);
                }
            }

            const data = await response.json();
            console.log('CustomDropdown: Received data:', data);
            
            this.allOptions = Array.isArray(data.options) ? data.options : [];
            this.filteredOptions = [...this.allOptions];
            console.log(`CustomDropdown: Loaded ${this.allOptions.length} options`);
            
            this.renderOptions();
        } catch (error) {
            console.error('CustomDropdown: API load error:', error);
            
            if (error.name === 'AbortError') {
                this.showError('Request timed out. Please try again.');
            } else if (error.message.includes('Failed to fetch')) {
                this.showError('Cannot connect to server. Please check your connection.');
            } else {
                this.showError(error.message || 'Failed to load options.');
            }
        } finally {
            this.setLoading(false);
        }
    }

    handleSearch(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();

        if (this.options.apiEndpoint) {
            // Server-side search
            this.loadOptionsFromAPI(searchTerm);
        } else {
            // Client-side search
            this.filteredOptions = this.allOptions.filter(option => {
                const label = option[this.options.displayKey] || '';
                const meta = option[this.options.metaKey] || '';
                return label.toLowerCase().includes(this.searchTerm) ||
                       meta.toLowerCase().includes(this.searchTerm);
            });
            this.renderOptions();
        }
    }

    renderOptions() {
        if (this.loading) {
            this.optionsContainer.innerHTML = `
                <div class="dropdown-loading">
                    <div class="dropdown-loading-spinner"></div>
                    ${this.options.loadingText}
                </div>
            `;
            return;
        }

        if (this.filteredOptions.length === 0) {
            this.optionsContainer.innerHTML = `
                <div class="dropdown-empty">
                    <svg class="dropdown-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z"></path>
                    </svg>
                    ${this.options.emptyText}
                </div>
            `;
            return;
        }

        this.optionsContainer.innerHTML = this.filteredOptions
            .map(option => this.renderOption(option))
            .join('');

        // Bind option click events
        this.optionsContainer.querySelectorAll('.dropdown-option').forEach((optionEl, index) => {
            const option = this.filteredOptions[index];
            
            optionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectOption(option);
            });

            optionEl.addEventListener('keydown', (e) => {
                this.handleOptionKeydown(e, option, index);
            });
        });
    }

    renderOption(option) {
        const value = option[this.options.valueKey];
        const label = option[this.options.displayKey] || '';
        const meta = option[this.options.metaKey] || '';
        const badge = option[this.options.badgeKey] || '';
        const isSelected = value === this.selectedValue;

        return `
            <div class="dropdown-option ${isSelected ? 'selected' : ''}" tabindex="0" data-value="${value}">
                <div class="dropdown-option-content">
                    <div class="dropdown-option-name">${this.escapeHtml(label)}</div>
                    ${meta ? `
                        <div class="dropdown-option-meta">
                            ${this.escapeHtml(meta)}
                            ${badge ? `<span class="dropdown-option-badge">${this.escapeHtml(badge)}</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    handleOptionKeydown(e, option, index) {
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                this.selectOption(option);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.focusNextOption(index);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.focusPreviousOption(index);
                break;
            case 'Escape':
                this.close();
                this.trigger.focus();
                break;
        }
    }

    focusFirstOption() {
        const firstOption = this.optionsContainer.querySelector('.dropdown-option');
        if (firstOption) {
            firstOption.focus();
        }
    }

    focusNextOption(currentIndex) {
        const nextIndex = Math.min(currentIndex + 1, this.filteredOptions.length - 1);
        const nextOption = this.optionsContainer.querySelectorAll('.dropdown-option')[nextIndex];
        if (nextOption) {
            nextOption.focus();
        }
    }

    focusPreviousOption(currentIndex) {
        const prevIndex = Math.max(currentIndex - 1, 0);
        const prevOption = this.optionsContainer.querySelectorAll('.dropdown-option')[prevIndex];
        if (prevOption) {
            prevOption.focus();
        }
    }

    selectOption(option) {
        this.selectedValue = option[this.options.valueKey];
        this.selectedOption = option;

        // Update display
        const label = option[this.options.displayKey] || '';
        const meta = option[this.options.metaKey] || '';
        const badge = option[this.options.badgeKey] || '';

        this.selectedText.textContent = label;
        
        // Show meta information with badge if available
        if (meta || badge) {
            let metaText = meta;
            if (badge && meta !== badge) {
                metaText = badge; // Prefer badge over meta for display
            }
            this.selectedMeta.textContent = metaText;
            this.selectedMeta.style.display = 'inline-block';
        } else {
            this.selectedMeta.style.display = 'none';
        }
        
        this.placeholder.style.display = 'none';
        this.selected.style.display = 'flex';

        // Update trigger state
        this.trigger.classList.remove('error');
        this.trigger.classList.add('selected');

        this.close();

        // Callback
        if (this.options.onSelect) {
            this.options.onSelect(option);
        } else {
            // Fallback alert if no callback is set
            console.log('CustomDropdown: Option selected but no callback:', option);
        }

        // Dispatch change event
        const changeEvent = new CustomEvent('change', {
            detail: { value: this.selectedValue, option: this.selectedOption }
        });
        this.element.dispatchEvent(changeEvent);
        
        // Debug alert for any selection
        const dropdownType = this.element.id === 'student-dropdown' ? 'Student' : 
                            this.element.id === 'class-dropdown' ? 'Class' : 
                            (this.element.id || 'Unknown');
        alert(`DROPDOWN SELECTION: "${option.label}" selected in ${dropdownType} dropdown`);
    }

    handleAddNew() {
        const searchTerm = this.searchInput ? this.searchInput.value.trim() : '';
        
        // Show inline add form instead of modal
        this.showInlineAddForm(searchTerm);
    }

    showInlineAddForm(prefillValue = '') {
        // Determine if this is for students or classes based on endpoint
        const isStudent = this.options.apiEndpoint && this.options.apiEndpoint.includes('students');
        const isClass = this.options.apiEndpoint && this.options.apiEndpoint.includes('classes');
        
        if (isStudent) {
            this.showInlineStudentForm(prefillValue);
        } else if (isClass) {
            this.showInlineClassForm(prefillValue);
        }
    }

    showInlineStudentForm(prefillValue = '') {
        this.optionsContainer.innerHTML = `
            <div class="dropdown-inline-form">
                <div class="inline-form-header">
                    <span>Add New Student</span>
                    <button class="inline-form-cancel" type="button">×</button>
                </div>
                <div class="inline-form-content">
                    <div class="inline-form-row">
                        <input type="text" class="inline-form-input" id="inline-student-name" 
                               placeholder="Full Name (e.g., John Doe)" value="${this.escapeHtml(prefillValue)}">
                    </div>
                    <div class="inline-form-row">
                        <select class="inline-form-select" id="inline-student-grade">
                            <option value="K">Kindergarten</option>
                            <option value="1">Grade 1</option>
                            <option value="2">Grade 2</option>
                            <option value="3">Grade 3</option>
                            <option value="4">Grade 4</option>
                            <option value="5">Grade 5</option>
                            <option value="6">Grade 6</option>
                            <option value="7">Grade 7</option>
                            <option value="8">Grade 8</option>
                            <option value="9">Grade 9</option>
                            <option value="10">Grade 10</option>
                            <option value="11">Grade 11</option>
                            <option value="12">Grade 12</option>
                        </select>
                        <button class="inline-form-save" type="button">✓</button>
                    </div>
                </div>
            </div>
        `;

        this.bindInlineFormEvents();
    }

    showInlineClassForm(prefillValue = '') {
        this.optionsContainer.innerHTML = `
            <div class="dropdown-inline-form">
                <div class="inline-form-header">
                    <span>Add New Class</span>
                    <button class="inline-form-cancel" type="button">×</button>
                </div>
                <div class="inline-form-content">
                    <div class="inline-form-row">
                        <input type="text" class="inline-form-input" id="inline-class-name" 
                               placeholder="Class Name (e.g., Math 101)" value="${this.escapeHtml(prefillValue)}">
                    </div>
                    <div class="inline-form-row">
                        <select class="inline-form-select" id="inline-class-subject">
                            <option value="math">Mathematics</option>
                            <option value="english">English/Language Arts</option>
                            <option value="science">Science</option>
                            <option value="history">History/Social Studies</option>
                            <option value="art">Art</option>
                            <option value="other">Other</option>
                        </select>
                        <select class="inline-form-select" id="inline-class-grade">
                            <option value="K">Kindergarten</option>
                            <option value="1">Grade 1</option>
                            <option value="2">Grade 2</option>
                            <option value="3">Grade 3</option>
                            <option value="4">Grade 4</option>
                            <option value="5">Grade 5</option>
                            <option value="6">Grade 6</option>
                            <option value="7">Grade 7</option>
                            <option value="8">Grade 8</option>
                            <option value="9">Grade 9</option>
                            <option value="10">Grade 10</option>
                            <option value="11">Grade 11</option>
                            <option value="12">Grade 12</option>
                        </select>
                        <button class="inline-form-save" type="button">✓</button>
                    </div>
                </div>
            </div>
        `;

        this.bindInlineFormEvents();
    }

    bindInlineFormEvents() {
        const saveBtn = this.optionsContainer.querySelector('.inline-form-save');
        const cancelBtn = this.optionsContainer.querySelector('.inline-form-cancel');
        const nameInput = this.optionsContainer.querySelector('.inline-form-input');

        // Save button
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.handleInlineFormSave();
            });
        }

        // Cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.renderOptions(); // Go back to normal view
            });
        }

        // Enter key on name input
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleInlineFormSave();
                }
            });
            
            // Focus the input
            setTimeout(() => nameInput.focus(), 100);
        }
    }

    async handleInlineFormSave() {
        const isStudent = this.options.apiEndpoint && this.options.apiEndpoint.includes('students');
        
        if (isStudent) {
            await this.saveInlineStudent();
        } else {
            await this.saveInlineClass();
        }
    }

    async saveInlineStudent() {
        const nameInput = this.optionsContainer.querySelector('#inline-student-name');
        const gradeSelect = this.optionsContainer.querySelector('#inline-student-grade');
        
        const name = nameInput.value.trim();
        const grade = gradeSelect.value;
        
        if (!name) {
            this.showInlineError('Student name is required');
            nameInput.focus();
            return;
        }
        
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/students', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, grade })
            });

            const result = await response.json();

            if (response.ok) {
                // Add to options and select it
                const newOption = {
                    value: result.student._id,
                    label: result.student.name,
                    grade: result.student.grade
                };
                
                this.allOptions.unshift(newOption);
                this.filteredOptions = [...this.allOptions];
                this.selectOption(newOption);
                
                // Show success briefly
                this.showInlineSuccess('Student added successfully!');
                setTimeout(() => {
                    this.close();
                }, 1000);
            } else {
                this.showInlineError(result.error || 'Failed to create student');
            }
        } catch (error) {
            this.showInlineError('Failed to create student');
        }
    }

    async saveInlineClass() {
        const nameInput = this.optionsContainer.querySelector('#inline-class-name');
        const subjectSelect = this.optionsContainer.querySelector('#inline-class-subject');
        const gradeSelect = this.optionsContainer.querySelector('#inline-class-grade');
        
        const name = nameInput.value.trim();
        const subject = subjectSelect.value;
        const gradeLevel = gradeSelect.value;
        
        if (!name) {
            this.showInlineError('Class name is required');
            nameInput.focus();
            return;
        }
        
        try {
            const token = localStorage.getItem('gradeflow_token');
            const response = await fetch('/api/classes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, subject, gradeLevel })
            });

            const result = await response.json();

            if (response.ok) {
                // Add to options and select it
                const newOption = {
                    value: result.class._id,
                    label: result.class.name,
                    subject: result.class.subject,
                    subjectDisplayName: result.class.subjectDisplayName,
                    gradeLevel: result.class.gradeLevel,
                    gradeDisplayName: result.class.gradeDisplayName
                };
                
                this.allOptions.unshift(newOption);
                this.filteredOptions = [...this.allOptions];
                this.selectOption(newOption);
                
                // Show success briefly
                this.showInlineSuccess('Class added successfully!');
                setTimeout(() => {
                    this.close();
                }, 1000);
            } else {
                this.showInlineError(result.error || 'Failed to create class');
            }
        } catch (error) {
            this.showInlineError('Failed to create class');
        }
    }

    showInlineError(message) {
        const formContent = this.optionsContainer.querySelector('.inline-form-content');
        let errorDiv = formContent.querySelector('.inline-form-error');
        
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'inline-form-error';
            formContent.appendChild(errorDiv);
        }
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        setTimeout(() => {
            if (errorDiv) errorDiv.style.display = 'none';
        }, 3000);
    }

    showInlineSuccess(message) {
        const formContent = this.optionsContainer.querySelector('.inline-form-content');
        let successDiv = formContent.querySelector('.inline-form-success');
        
        if (!successDiv) {
            successDiv = document.createElement('div');
            successDiv.className = 'inline-form-success';
            formContent.appendChild(successDiv);
        }
        
        successDiv.textContent = message;
        successDiv.style.display = 'block';
    }

    open() {
        if (this.isOpen) return;

        // Close all other dropdowns first
        if (window.CustomDropdown && window.CustomDropdown.closeAllOthers) {
            window.CustomDropdown.closeAllOthers(this);
        }

        this.isOpen = true;
        this.trigger.classList.add('active');
        
        this.menu.classList.add('open');

        // Focus search input if available
        if (this.searchInput) {
            setTimeout(() => {
                this.searchInput.focus();
            }, 50);
        }

        // Load options if needed
        if (this.allOptions.length === 0) {
            this.loadInitialOptions();
        }
        
        // Keep dropdown positioned below trigger
        // this.adjustMenuPosition(); // Disabled for now
    }

    adjustMenuPosition() {
        if (!this.isOpen) return;
        
        setTimeout(() => {
            const triggerRect = this.trigger.getBoundingClientRect();
            const menuRect = this.menu.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // Reset any previous positioning
            this.menu.style.transform = '';
            this.menu.style.top = '';
            this.menu.style.bottom = '';
            
            // Check if there's enough space below
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const menuHeight = menuRect.height || 300; // fallback to max height
            
            // Only position above if there's clearly not enough space below
            // AND there's more space above than below
            if (spaceBelow < menuHeight && triggerRect.top > spaceBelow) {
                this.menu.style.top = 'auto';
                this.menu.style.bottom = '100%';
                this.menu.style.marginTop = '0';
                this.menu.style.marginBottom = '4px';
            } else {
                // Keep default positioning below
                this.menu.style.top = '100%';
                this.menu.style.bottom = 'auto';
                this.menu.style.marginTop = '4px';
                this.menu.style.marginBottom = '0';
            }
            
            // Handle horizontal overflow
            if (menuRect.right > viewportWidth - 20) {
                this.menu.style.left = 'auto';
                this.menu.style.right = '0';
            }
        }, 10);
    }

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.trigger.classList.remove('active');
        this.menu.classList.remove('open');

        // No need to reset positioning since we use CSS only

        // Clear search
        if (this.searchInput) {
            this.searchInput.value = '';
            this.searchTerm = '';
            this.filteredOptions = [...this.allOptions];
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    setValue(value) {
        const option = this.allOptions.find(opt => opt[this.options.valueKey] === value);
        if (option) {
            this.selectOption(option);
        }
    }

    getValue() {
        return this.selectedValue;
    }

    getSelectedOption() {
        return this.selectedOption;
    }

    clear() {
        this.selectedValue = null;
        this.selectedOption = null;
        
        this.placeholder.style.display = 'block';
        this.selected.style.display = 'none';
        this.trigger.classList.remove('selected', 'error');
    }

    setError(show = true) {
        if (show) {
            this.trigger.classList.add('error');
        } else {
            this.trigger.classList.remove('error');
        }
    }

    setLoading(loading) {
        this.loading = loading;
        this.renderOptions();
    }

    showError(message) {
        this.optionsContainer.innerHTML = `
            <div class="dropdown-empty">
                <svg class="dropdown-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div style="margin-bottom: 8px;">${message}</div>
                ${this.options.apiEndpoint ? `
                    <button type="button" class="dropdown-retry-btn" style="
                        padding: 6px 12px; 
                        background: #4F46E5; 
                        color: white; 
                        border: none; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-size: 12px;
                    ">Retry</button>
                ` : ''}
            </div>
        `;
        
        // Add retry functionality
        const retryBtn = this.optionsContainer.querySelector('.dropdown-retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.loadInitialOptions();
            });
        }
    }

    updateOptions(options) {
        this.allOptions = options;
        this.filteredOptions = [...this.allOptions];
        this.renderOptions();
    }

    refresh() {
        this.loadInitialOptions();
    }

    destroy() {
        // Close dropdown first
        this.close();
        
        // Remove global event listeners
        if (this.boundHandlers) {
            document.removeEventListener('click', this.boundHandlers.outsideClick);
            document.removeEventListener('keydown', this.boundHandlers.escapeKey);
        }
        
        // Clear references
        this.allOptions = [];
        this.filteredOptions = [];
        this.selectedOption = null;
        
        // Remove element
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomDropdown;
} else {
    window.CustomDropdown = CustomDropdown;
}

// Global dropdown management
window.CustomDropdown = CustomDropdown;
window.activeDropdowns = new Set();

// Close all other dropdowns when one opens
CustomDropdown.closeAllOthers = function(currentDropdown) {
    window.activeDropdowns.forEach(dropdown => {
        if (dropdown !== currentDropdown && dropdown.isOpen) {
            dropdown.close();
        }
    });
};

// Auto-initialize dropdowns with data attributes
document.addEventListener('DOMContentLoaded', () => {
    console.log('CustomDropdown: DOM ready, initializing dropdowns...');
    
    // Wait a brief moment to ensure all other scripts have loaded
    setTimeout(() => {
        const dropdownElements = document.querySelectorAll('[data-dropdown]');
        console.log(`CustomDropdown: Found ${dropdownElements.length} dropdown elements to initialize`);
        
        dropdownElements.forEach((element, index) => {
            try {
                const options = JSON.parse(element.dataset.dropdown || '{}');
                console.log(`CustomDropdown: Initializing dropdown ${index + 1}/${dropdownElements.length}`, {
                    id: element.id,
                    endpoint: options.apiEndpoint
                });
                
                const dropdown = new CustomDropdown(element, options);
                window.activeDropdowns.add(dropdown);
                
                // Mark as successfully initialized
                element.setAttribute('data-dropdown-initialized', 'true');
                console.log(`CustomDropdown: Successfully initialized ${element.id}`);
                
            } catch (error) {
                console.error(`CustomDropdown: Failed to initialize dropdown ${element.id}:`, error);
                element.setAttribute('data-dropdown-error', error.message);
            }
        });
        
        console.log('CustomDropdown: All dropdowns initialized');
        
        // Dispatch custom event to notify other scripts
        document.dispatchEvent(new CustomEvent('dropdownsInitialized', {
            detail: { count: dropdownElements.length }
        }));
        
    }, 50); // Small delay to ensure other scripts are ready
});