// Main JavaScript for CheckMate
class CheckMate {
    constructor() {
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupScrollEffects();
        this.setupButtons();
        this.setupAnimations();
        this.setupAuth();
    }

    // Navigation functionality
    setupNavigation() {
        const navToggle = document.getElementById('nav-toggle');
        const navMenu = document.getElementById('nav-menu');

        if (navToggle && navMenu) {
            navToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
                navToggle.classList.toggle('active');
            });

            // Close menu when clicking on links
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    navMenu.classList.remove('active');
                    navToggle.classList.remove('active');
                });
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                    navMenu.classList.remove('active');
                    navToggle.classList.remove('active');
                }
            });
        }

        // Smooth scrolling for anchor links
        const anchorLinks = document.querySelectorAll('a[href^="#"]');
        anchorLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    const offsetTop = targetElement.offsetTop - 80; // Account for fixed navbar
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // Scroll effects
    setupScrollEffects() {
        const navbar = document.querySelector('.navbar');
        
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.style.background = 'rgba(255, 255, 255, 0.98)';
                navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
            } else {
                navbar.style.background = 'rgba(255, 255, 255, 0.95)';
                navbar.style.boxShadow = 'none';
            }
        });

        // Intersection Observer for animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        // Observe elements that should animate on scroll
        const animateElements = document.querySelectorAll('.feature-card, .step, .pricing-card');
        animateElements.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    // Button functionality
    setupButtons() {
        // Get Started button
        const getStartedBtn = document.getElementById('get-started-btn');
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
                this.showAuthModal('signup');
            });
        }

        // Login button
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.showAuthModal('login');
            });
        }

        // Demo button
        const demoBtn = document.getElementById('demo-btn');
        if (demoBtn) {
            demoBtn.addEventListener('click', () => {
                this.showDemo();
            });
        }

        // Pricing buttons
        const pricingButtons = document.querySelectorAll('.pricing-card .btn');
        pricingButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const plan = btn.closest('.pricing-card').querySelector('h3').textContent;
                this.selectPlan(plan);
            });
        });
    }

    // Animation setup
    setupAnimations() {
        // Animate hero stats counter
        const statNumbers = document.querySelectorAll('.stat-number');
        
        const animateCounter = (element, target, duration = 2000) => {
            const start = 0;
            const increment = target / (duration / 16);
            let current = start;
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                
                if (target.toString().includes('.')) {
                    element.textContent = current.toFixed(1) + (element.textContent.includes('M') ? 'M+' : '%');
                } else {
                    element.textContent = Math.floor(current).toLocaleString() + (element.textContent.includes('M') ? 'M+' : element.textContent.includes('/') ? '/7' : '%');
                }
            }, 16);
        };

        // Start counter animation when hero section is visible
        const heroObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    statNumbers.forEach(stat => {
                        const text = stat.textContent;
                        let target = parseFloat(text);
                        if (text.includes('M')) target = 3.2;
                        else if (text.includes('%')) target = 95;
                        else if (text.includes('/')) target = 24;
                        
                        animateCounter(stat, target);
                    });
                    heroObserver.unobserve(entry.target);
                }
            });
        });

        const heroStats = document.querySelector('.hero-stats');
        if (heroStats) {
            heroObserver.observe(heroStats);
        }

        // Worksheet demo animation
        const worksheetStack = document.querySelector('.worksheet-stack');
        if (worksheetStack) {
            let currentSheet = 1;
            setInterval(() => {
                const worksheets = worksheetStack.querySelectorAll('.worksheet');
                worksheets.forEach((sheet, index) => {
                    sheet.style.zIndex = index === currentSheet ? 3 : (index === (currentSheet + 1) % 3 ? 2 : 1);
                    sheet.style.opacity = index === currentSheet ? 1 : (index === (currentSheet + 1) % 3 ? 0.8 : 0.6);
                });
                currentSheet = (currentSheet + 1) % 3;
            }, 3000);
        }
    }

    // Authentication setup
    setupAuth() {
        // Initialize Auth0 (placeholder for actual implementation)
        this.auth = {
            isAuthenticated: false,
            user: null
        };

        // Check for existing session
        this.checkAuthStatus();
    }

    checkAuthStatus() {
        const token = localStorage.getItem('gradeflow_token');
        if (token) {
            // Validate token with backend
            this.validateToken(token);
        }
    }

    async validateToken(token) {
        try {
            const response = await fetch('/api/auth/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.auth.isAuthenticated = true;
                this.auth.user = userData;
                this.updateUI();
            } else {
                localStorage.removeItem('gradeflow_token');
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            localStorage.removeItem('gradeflow_token');
        }
    }

    showAuthModal(type = 'login') {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'auth-modal-overlay';
        modal.innerHTML = `
            <div class="auth-modal">
                <div class="auth-modal-header">
                    <h2>${type === 'login' ? 'Welcome Back' : 'Get Started Free'}</h2>
                    <button class="auth-modal-close">&times;</button>
                </div>
                <div class="auth-modal-content">
                    <form class="auth-form" id="auth-form">
                        <div class="form-group">
                            <label for="email">Email Address</label>
                            <input type="email" id="email" name="email" required>
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required>
                        </div>
                        ${type === 'signup' ? `
                            <div class="form-group">
                                <label for="name">Full Name</label>
                                <input type="text" id="name" name="name" required>
                            </div>
                            <div class="form-group">
                                <label for="school">School/Organization</label>
                                <input type="text" id="school" name="school">
                            </div>
                        ` : ''}
                        <button type="submit" class="btn btn-primary btn-large auth-submit">
                            ${type === 'login' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>
                    <div class="auth-divider">
                        <span>or</span>
                    </div>
                    <button class="btn btn-outline btn-large google-auth">
                        <i class="fab fa-google"></i>
                        Continue with Google
                    </button>
                    <div class="auth-switch">
                        ${type === 'login' 
                            ? `Don't have an account? <a href="#" class="switch-to-signup">Sign up</a>`
                            : `Already have an account? <a href="#" class="switch-to-login">Sign in</a>`
                        }
                    </div>
                </div>
            </div>
        `;

        // Add modal styles
        const styles = `
            <style>
                .auth-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    backdrop-filter: blur(4px);
                }

                .auth-modal {
                    background: white;
                    border-radius: 1rem;
                    width: 90%;
                    max-width: 400px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
                }

                .auth-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--gray-200);
                }

                .auth-modal-header h2 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--gray-900);
                    margin: 0;
                }

                .auth-modal-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: var(--gray-500);
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .auth-modal-content {
                    padding: 1.5rem;
                }

                .auth-form {
                    margin-bottom: 1.5rem;
                }

                .form-group {
                    margin-bottom: 1rem;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    color: var(--gray-700);
                }

                .form-group input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 2px solid var(--gray-200);
                    border-radius: 0.5rem;
                    font-size: 1rem;
                    transition: border-color 0.15s ease;
                }

                .form-group input:focus {
                    outline: none;
                    border-color: var(--primary-color);
                }

                .auth-submit {
                    width: 100%;
                    margin-bottom: 1rem;
                }

                .auth-divider {
                    text-align: center;
                    margin: 1.5rem 0;
                    position: relative;
                    color: var(--gray-500);
                }

                .auth-divider::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: var(--gray-200);
                }

                .auth-divider span {
                    background: white;
                    padding: 0 1rem;
                }

                .google-auth {
                    width: 100%;
                    margin-bottom: 1rem;
                }

                .auth-switch {
                    text-align: center;
                    color: var(--gray-600);
                }

                .auth-switch a {
                    color: var(--primary-color);
                    text-decoration: none;
                }

                .auth-switch a:hover {
                    text-decoration: underline;
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
        document.body.appendChild(modal);

        // Add event listeners
        const closeBtn = modal.querySelector('.auth-modal-close');
        const form = modal.querySelector('#auth-form');
        const switchLink = modal.querySelector(type === 'login' ? '.switch-to-signup' : '.switch-to-login');
        const googleBtn = modal.querySelector('.google-auth');

        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAuth(type, new FormData(form));
        });

        if (switchLink) {
            switchLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.body.removeChild(modal);
                this.showAuthModal(type === 'login' ? 'signup' : 'login');
            });
        }

        googleBtn.addEventListener('click', () => {
            this.handleGoogleAuth();
        });
    }

    async handleAuth(type, formData) {
        const submitBtn = document.querySelector('.auth-submit');
        const originalText = submitBtn.textContent;
        
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;

        try {
            const data = Object.fromEntries(formData);
            const response = await fetch(`/api/auth/${type}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                localStorage.setItem('gradeflow_token', result.token);
                this.auth.isAuthenticated = true;
                this.auth.user = result.user;
                this.updateUI();
                
                // Close modal
                const modal = document.querySelector('.auth-modal-overlay');
                if (modal) {
                    document.body.removeChild(modal);
                }

                // Redirect to dashboard
                window.location.href = '/pages/dashboard.html';
            } else {
                throw new Error(result.message || 'Authentication failed');
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.showNotification('Authentication failed. Please try again.', 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    handleGoogleAuth() {
        // Placeholder for Google OAuth implementation
        this.showNotification('Google authentication coming soon!', 'info');
    }

    showDemo() {
        // Create demo modal
        const modal = document.createElement('div');
        modal.className = 'demo-modal-overlay';
        modal.innerHTML = `
            <div class="demo-modal">
                <div class="demo-modal-header">
                    <h2>CheckMate Demo</h2>
                    <button class="demo-modal-close">&times;</button>
                </div>
                <div class="demo-modal-content">
                    <div class="demo-video">
                        <div class="demo-placeholder">
                            <i class="fas fa-play-circle"></i>
                            <p>Demo video would play here</p>
                            <p class="demo-description">See how CheckMate grades 30 worksheets in under 5 minutes with personalized feedback for each student.</p>
                        </div>
                    </div>
                    <div class="demo-actions">
                        <button class="btn btn-primary" onclick="document.querySelector('.auth-modal-overlay') && document.body.removeChild(document.querySelector('.auth-modal-overlay')); gradeflow.showAuthModal('signup')">
                            Start Free Trial
                        </button>
                        <button class="btn btn-outline" onclick="document.body.removeChild(document.querySelector('.demo-modal-overlay'))">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add demo modal styles
        const demoStyles = `
            <style>
                .demo-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }

                .demo-modal {
                    background: white;
                    border-radius: 1rem;
                    width: 90%;
                    max-width: 800px;
                    max-height: 90vh;
                    overflow-y: auto;
                }

                .demo-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--gray-200);
                }

                .demo-modal-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: var(--gray-500);
                }

                .demo-modal-content {
                    padding: 1.5rem;
                }

                .demo-video {
                    margin-bottom: 1.5rem;
                }

                .demo-placeholder {
                    background: var(--gray-100);
                    border-radius: 0.5rem;
                    padding: 4rem 2rem;
                    text-align: center;
                    color: var(--gray-600);
                }

                .demo-placeholder i {
                    font-size: 4rem;
                    color: var(--primary-color);
                    margin-bottom: 1rem;
                }

                .demo-actions {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', demoStyles);
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.demo-modal-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    selectPlan(plan) {
        if (plan === 'School License') {
            // Contact sales
            window.location.href = 'mailto:sales@gradeflow.com?subject=School License Inquiry';
        } else {
            // Show signup modal with plan preselected
            this.showAuthModal('signup');
        }
    }

    updateUI() {
        if (this.auth.isAuthenticated) {
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.innerHTML = `
                    <i class="fas fa-user-circle"></i>
                    Dashboard
                `;
                loginBtn.onclick = () => {
                    window.location.href = '/pages/dashboard.html';
                };
            }
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;

        // Add notification styles
        const notificationStyles = `
            <style>
                .notification {
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    background: white;
                    border-radius: 0.5rem;
                    padding: 1rem;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    min-width: 300px;
                    animation: slideIn 0.3s ease;
                }

                .notification-error {
                    border-left: 4px solid var(--error-color);
                }

                .notification-success {
                    border-left: 4px solid var(--success-color);
                }

                .notification-info {
                    border-left: 4px solid var(--primary-color);
                }

                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex: 1;
                }

                .notification-close {
                    background: none;
                    border: none;
                    font-size: 1.2rem;
                    cursor: pointer;
                    color: var(--gray-500);
                }

                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            </style>
        `;

        if (!document.querySelector('style[data-notifications]')) {
            const style = document.createElement('style');
            style.setAttribute('data-notifications', '');
            style.textContent = notificationStyles.replace(/<\/?style>/g, '');
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(notification);
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }
}

// Initialize CheckMate when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gradeflow = new CheckMate();
});

// Export for use in other modules
export default CheckMate;