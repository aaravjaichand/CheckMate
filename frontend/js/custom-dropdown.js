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
                <div class="dropdown-options"></div>
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
            </div>
        `;

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
                console.error('Error loading options:', error);
                this.showError('Failed to load options');
            } finally {
                this.setLoading(false);
            }
        } else if (this.options.apiEndpoint) {
            this.loadOptionsFromAPI('');
        }
    }

    async loadOptionsFromAPI(searchTerm = '') {
        if (!this.options.apiEndpoint) return;

        this.setLoading(true);
        try {
            const token = localStorage.getItem('gradeflow_token');
            if (!token) {
                this.showError('Please log in to load options.');
                return;
            }

            const url = new URL(this.options.apiEndpoint, window.location.origin);
            if (searchTerm) url.searchParams.set('q', searchTerm);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Please log in again.');
                } else if (response.status === 404) {
                    throw new Error('Service not found. Please contact support.');
                } else if (response.status >= 500) {
                    throw new Error('Server error. Please try again later.');
                } else {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
            }

            const data = await response.json();
            this.allOptions = Array.isArray(data.options) ? data.options : [];
            this.filteredOptions = [...this.allOptions];
            this.renderOptions();
        } catch (error) {
            console.error('Error loading options from API:', error);
            
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

        this.selectedText.textContent = label;
        this.selectedMeta.textContent = meta;
        
        this.placeholder.style.display = 'none';
        this.selected.style.display = 'flex';

        // Update trigger state
        this.trigger.classList.remove('error');
        this.trigger.classList.add('selected');

        this.close();

        // Callback
        if (this.options.onSelect) {
            this.options.onSelect(option);
        }

        // Dispatch change event
        const changeEvent = new CustomEvent('change', {
            detail: { value: this.selectedValue, option: this.selectedOption }
        });
        this.element.dispatchEvent(changeEvent);
    }

    handleAddNew() {
        const searchTerm = this.searchInput ? this.searchInput.value.trim() : '';
        
        if (this.options.onAddNew) {
            this.options.onAddNew(searchTerm);
        } else if (this.options.addNewCallback) {
            this.options.addNewCallback(searchTerm);
        }
        
        this.close();
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
        
        // Check if dropdown goes off screen and adjust
        this.adjustMenuPosition();
    }

    adjustMenuPosition() {
        if (!this.isOpen) return;
        
        setTimeout(() => {
            const menuRect = this.menu.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // If menu goes off bottom of screen, show it above trigger
            if (menuRect.bottom > viewportHeight - 20) {
                this.menu.style.transform = 'translateY(-100%) translateY(-8px)';
                this.menu.style.top = 'auto';
                this.menu.style.bottom = '100%';
            }
            
            // If menu goes off right side, align to right edge
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

        // Reset menu positioning
        this.menu.style.transform = '';
        this.menu.style.top = '';
        this.menu.style.bottom = '';
        this.menu.style.left = '';
        this.menu.style.right = '';

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
        if (loading) {
            this.renderOptions();
        }
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
    document.querySelectorAll('[data-dropdown]').forEach(element => {
        const options = JSON.parse(element.dataset.dropdown || '{}');
        const dropdown = new CustomDropdown(element, options);
        window.activeDropdowns.add(dropdown);
    });
});