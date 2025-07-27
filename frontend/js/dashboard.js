// Dashboard functionality for CheckMate
class DashboardManager {
    constructor() {
        this.charts = {};
        this.currentUser = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDashboardData();
        this.setupUserDropdown();
    }

    setupEventListeners() {
        // Filter controls - only add listeners if elements exist
        const activityFilter = document.getElementById('activity-filter');
        if (activityFilter) {
            activityFilter.addEventListener('change', () => {
                this.loadRecentActivity();
            });
        }

        const gradePeriod = document.getElementById('grade-period');
        if (gradePeriod) {
            gradePeriod.addEventListener('change', () => {
                this.loadGradeDistribution();
            });
        }

        const trendsSubject = document.getElementById('trends-subject');
        if (trendsSubject) {
            trendsSubject.addEventListener('change', () => {
                this.loadPerformanceTrends();
            });
        }

        const trendsPeriod = document.getElementById('trends-period');
        if (trendsPeriod) {
            trendsPeriod.addEventListener('change', () => {
                this.loadPerformanceTrends();
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }

    setupUserDropdown() {
        const userAvatar = document.getElementById('user-avatar');
        const dropdown = document.getElementById('user-dropdown');

        userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('active');
        });

        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    async loadDashboardData() {
        try {
            // Check authentication first
            const userData = localStorage.getItem('user');
            const token = localStorage.getItem('gradeflow_token');
            
            if (!userData || !token) {
                console.log('No authentication found, redirecting to login with clear flag');
                window.location.href = '/pages/login.html?clear=true';
                return;
            }

            // Load user profile and overview data in parallel
            const [profileResponse, overviewResponse] = await Promise.all([
                this.fetchWithAuth('/api/auth/profile'),
                this.fetchWithAuth('/api/dashboard/overview')
            ]);

            if (profileResponse && overviewResponse && profileResponse.ok && overviewResponse.ok) {
                const profileData = await profileResponse.json();
                const overviewData = await overviewResponse.json();

                this.currentUser = profileData.user;
                this.updateUserInfo(profileData.user);
                this.updateStats(overviewData.stats);
                this.updateUsage(overviewData.user);
                this.displayRecentActivity(overviewData.recentWorksheets);
                
                // Load additional data
                this.loadGradeDistribution();
                this.loadPerformanceTrends();
                this.loadClassPerformance();
            } else {
                // Handle cases where API endpoints return 404 but user is authenticated
                console.warn('Dashboard API endpoints not available, showing limited functionality');
                this.showLimitedDashboard();
            }
        } catch (error) {
            console.error('Dashboard load error:', error);
            // If it's an auth error, redirect to login
            if (error.message.includes('401') || error.message.includes('unauthorized')) {
                localStorage.removeItem('user');
                localStorage.removeItem('gradeflow_token');
                window.location.href = '/pages/login.html';
                return;
            }
            this.showError('Failed to load dashboard data');
        }
    }

    updateUserInfo(user) {
        const userNameEl = document.getElementById('user-name');
        const userPlanEl = document.getElementById('user-plan');
        const currentPlanEl = document.getElementById('current-plan');
        
        if (userNameEl) userNameEl.textContent = user.name;
        if (userPlanEl) userPlanEl.textContent = `${user.plan} Plan`;
        if (currentPlanEl) currentPlanEl.textContent = `${user.plan} Plan`;
        
        // Update liquid glass navigation elements
        const userNameLiquidElements = document.querySelectorAll('.user-name-liquid');
        const userPlanLiquidElements = document.querySelectorAll('.user-plan-liquid');
        
        userNameLiquidElements.forEach(element => {
            if (user.name) {
                element.textContent = user.name;
            }
        });
        
        userPlanLiquidElements.forEach(element => {
            if (user.plan) {
                element.textContent = `${user.plan} Plan`;
            }
        });
    }

    updateStats(stats) {
        const thisMonth = stats.thisMonth || {};
        const thisWeek = stats.thisWeek || {};

        // Update stat values with null checks
        const totalWorksheetsEl = document.getElementById('total-worksheets');
        const gradedWorksheetsEl = document.getElementById('graded-worksheets');
        const averageScoreEl = document.getElementById('average-score');
        const timeSavedEl = document.getElementById('time-saved');
        
        if (totalWorksheetsEl) totalWorksheetsEl.textContent = thisMonth.uploaded || 0;
        if (gradedWorksheetsEl) gradedWorksheetsEl.textContent = thisMonth.graded || 0;
        if (averageScoreEl) averageScoreEl.textContent = `${thisMonth.averageScore || 0}%`;
        
        // Calculate time saved (assuming 10 minutes per worksheet manually)
        if (timeSavedEl) {
            const timeSavedMinutes = (thisMonth.graded || 0) * 10;
            const timeSavedHours = Math.floor(timeSavedMinutes / 60);
            timeSavedEl.textContent = `${timeSavedHours}h`;
        }

        // Update change indicators (placeholder logic) with null checks
        this.updateStatChange('worksheets-change', 12);
        this.updateStatChange('graded-change', 8);
        this.updateStatChange('score-change', 0);
        this.updateStatChange('time-change', 15);
    }

    updateStatChange(elementId, changePercent) {
        const element = document.getElementById(elementId);
        if (!element) {
            return; // Element doesn't exist on this page, skip
        }
        const parent = element.closest('.stat-change');
        
        element.textContent = `${changePercent > 0 ? '+' : ''}${changePercent}%`;
        
        parent.className = 'stat-change';
        if (changePercent > 0) {
            parent.classList.add('positive');
            element.previousElementSibling.className = 'fas fa-arrow-up';
        } else if (changePercent < 0) {
            parent.classList.add('negative');
            element.previousElementSibling.className = 'fas fa-arrow-down';
        } else {
            parent.classList.add('neutral');
            element.previousElementSibling.className = 'fas fa-minus';
        }
    }

    updateUsage(user) {
        const used = user.worksheetsProcessed || 0;
        const limit = user.monthlyLimit || 50;
        const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
        const remaining = Math.max(0, limit - used);

        // Update usage display
        document.getElementById('monthly-usage-percent').textContent = `${percentage}%`;
        document.getElementById('monthly-used').textContent = used;
        document.getElementById('monthly-limit').textContent = limit;
        document.getElementById('remaining-usage').textContent = remaining;

        // Update circular progress
        this.updateCircularProgress(percentage);

        // Calculate reset date (first day of next month)
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const resetDate = nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        document.getElementById('reset-date').textContent = resetDate;

        // Weekly usage (placeholder)
        document.getElementById('week-usage').textContent = Math.floor(used * 0.3);
    }

    updateCircularProgress(percentage) {
        const circle = document.getElementById('usage-circle');
        const radius = 34;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;

        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = offset;
    }

    displayRecentActivity(worksheets) {
        const activityList = document.getElementById('activity-list');
        
        if (!worksheets || worksheets.length === 0) {
            activityList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No recent activity</p>
                    <span>Your recent grading activity will appear here</span>
                </div>
            `;
            return;
        }

        activityList.innerHTML = '';
        
        worksheets.slice(0, 10).forEach(worksheet => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            
            const statusIcon = this.getStatusIcon(worksheet.status);
            const timeAgo = this.timeAgo(worksheet.uploadDate);
            const score = worksheet.score ? `${worksheet.score}%` : '';
            
            activityItem.innerHTML = `
                <div class="activity-icon ${worksheet.status}">
                    <i class="fas ${statusIcon}"></i>
                </div>
                <div class="activity-info">
                    <div class="activity-title">${worksheet.filename}</div>
                    <div class="activity-details">
                        ${worksheet.studentName} • ${worksheet.subject} • ${timeAgo}
                        ${score ? `• ${score}` : ''}
                    </div>
                </div>
                <div class="activity-actions">
                    ${worksheet.status === 'graded' 
                        ? `<button class="btn btn-outline btn-sm" onclick="dashboardManager.viewWorksheet('${worksheet.id}')">View</button>`
                        : worksheet.status === 'processing'
                            ? '<span class="status-badge processing">Processing</span>'
                            : '<span class="status-badge error">Error</span>'
                    }
                </div>
            `;
            
            activityList.appendChild(activityItem);
        });
    }

    async loadGradeDistribution() {
        try {
            const period = document.getElementById('grade-period').value;
            const response = await this.fetchWithAuth(`/api/dashboard/analytics?timeframe=${period}`);
            
            if (response.ok) {
                const data = await response.json();
                this.renderGradeDistributionChart(data.gradeDistribution);
            }
        } catch (error) {
            console.error('Error loading grade distribution:', error);
        }
    }

    renderGradeDistributionChart(distribution) {
        const ctx = document.getElementById('gradeChart').getContext('2d');
        
        if (this.charts.gradeChart) {
            this.charts.gradeChart.destroy();
        }

        const data = {
            labels: Object.keys(distribution),
            datasets: [{
                data: Object.values(distribution),
                backgroundColor: [
                    '#ef4444', // F - Red
                    '#f97316', // D - Orange
                    '#eab308', // C - Yellow
                    '#22c55e', // B - Green
                    '#3b82f6'  // A - Blue
                ],
                borderWidth: 0
            }]
        };

        this.charts.gradeChart = new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    async loadPerformanceTrends() {
        try {
            const subject = document.getElementById('trends-subject').value;
            const period = document.getElementById('trends-period').value;
            
            let url = `/api/dashboard/analytics?timeframe=${period}`;
            if (subject) url += `&subject=${subject}`;
            
            const response = await this.fetchWithAuth(url);
            
            if (response.ok) {
                const data = await response.json();
                this.renderPerformanceTrendsChart(data.gradingTrends);
            }
        } catch (error) {
            console.error('Error loading performance trends:', error);
        }
    }

    renderPerformanceTrendsChart(trends) {
        const ctx = document.getElementById('trendsChart').getContext('2d');
        
        if (this.charts.trendsChart) {
            this.charts.trendsChart.destroy();
        }

        const data = {
            labels: trends.map(t => new Date(t.date).toLocaleDateString()),
            datasets: [{
                label: 'Average Score',
                data: trends.map(t => t.averageScore),
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f6',
                tension: 0.4,
                fill: false
            }, {
                label: 'Worksheets Graded',
                data: trends.map(t => t.count),
                borderColor: '#10b981',
                backgroundColor: '#10b981',
                tension: 0.4,
                fill: false,
                yAxisID: 'y1'
            }]
        };

        this.charts.trendsChart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Average Score (%)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Worksheets Count'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    }
                }
            }
        });
    }

    async loadClassPerformance() {
        try {
            const response = await this.fetchWithAuth('/api/dashboard/class-summary');
            
            if (response.ok) {
                const data = await response.json();
                this.displayClassPerformance(data);
            }
        } catch (error) {
            console.error('Error loading class performance:', error);
        }
    }

    displayClassPerformance(classData) {
        const performanceGrid = document.getElementById('performance-grid');
        
        if (!classData || !classData.students || classData.students.length === 0) {
            performanceGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No class data available</p>
                    <span>Upload and grade worksheets to see class performance</span>
                </div>
            `;
            return;
        }

        // Create summary stats
        const summaryHtml = `
            <div class="class-summary">
                <div class="summary-stat">
                    <div class="summary-value">${classData.studentCount}</div>
                    <div class="summary-label">Students</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-value">${classData.classAverage}%</div>
                    <div class="summary-label">Class Average</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-value">${classData.highestScore}%</div>
                    <div class="summary-label">Highest Score</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-value">${classData.lowestScore}%</div>
                    <div class="summary-label">Lowest Score</div>
                </div>
            </div>
        `;

        // Create student performance list
        const studentsHtml = classData.students.slice(0, 10).map(student => `
            <div class="student-performance">
                <div class="student-info">
                    <div class="student-name">${student.name}</div>
                    <div class="student-details">
                        ${student.worksheetCount} worksheets • 
                        Last activity: ${this.timeAgo(student.lastActivity)}
                    </div>
                </div>
                <div class="student-score">
                    <div class="score-value ${this.getScoreClass(student.averageScore)}">${student.averageScore}%</div>
                </div>
            </div>
        `).join('');

        performanceGrid.innerHTML = summaryHtml + '<div class="students-list">' + studentsHtml + '</div>';
    }

    // Utility methods
    async fetchWithAuth(url) {
        const token = localStorage.getItem('gradeflow_token');
        if (!token) {
            window.location.href = '/pages/login.html';
            return null;
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // If unauthorized, redirect to login
        if (response.status === 401) {
            localStorage.removeItem('user');
            localStorage.removeItem('gradeflow_token');
            window.location.href = '/pages/login.html';
            return null;
        }
        
        return response;
    }

    getStatusIcon(status) {
        const icons = {
            'completed': 'fa-check',
            'graded': 'fa-check',
            'processing': 'fa-cog',
            'error': 'fa-exclamation-triangle'
        };
        return icons[status] || 'fa-file';
    }

    getScoreClass(score) {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'good';
        if (score >= 70) return 'fair';
        return 'needs-improvement';
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
        if (days < 7) return `${days}d ago`;
        
        return new Date(date).toLocaleDateString();
    }

    viewWorksheet(worksheetId) {
        window.location.href = `/pages/grading.html?worksheet=${worksheetId}`;
    }

    async logout() {
        // Clear localStorage
        localStorage.removeItem('gradeflow_token');
        localStorage.removeItem('user');
        
        // Sign out from Firebase if available
        try {
            if (window.auth) {
                await window.auth.signOut();
            }
        } catch (error) {
            console.log('Firebase signout not available or failed:', error);
        }
        
        // Redirect to login
        window.location.href = '/pages/login.html';
    }

    showLimitedDashboard() {
        // Show basic dashboard with limited functionality when APIs are unavailable
        const userData = localStorage.getItem('user');
        if (userData) {
            const user = JSON.parse(userData);
            
            // Update user info from localStorage
            const userNameEl = document.getElementById('user-name');
            const userPlanEl = document.getElementById('user-plan');
            
            if (userNameEl) userNameEl.textContent = user.name || 'User';
            if (userPlanEl) userPlanEl.textContent = user.plan || 'Unknown Plan';
            
            // Show default values
            const elements = {
                'worksheets-used': '0',
                'worksheets-remaining': '50', 
                'usage-percentage': '0%'
            };
            
            Object.entries(elements).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
            
            const progressEl = document.getElementById('usage-progress');
            if (progressEl) progressEl.style.width = '0%';
            
            console.log('Limited dashboard mode activated - API endpoints unavailable');
        }
    }

    showError(message) {
        console.error(message);
        // Could show notification here
    }
}

// Initialize dashboard when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // No authentication check here - user.js handles all auth
    console.log('Initializing dashboard (auth handled by user.js)');
    window.dashboardManager = new DashboardManager();
});

// Export removed for browser compatibility