/**
 * Everlit Candle - Main Application
 * AI-agentic friendly, mobile-first
 */

// Configuration
const CONFIG = {
    COLLECTION_ID: '64338985-40a0-4efc-a4aa-baadefe08ef1',
    PROJECT_ID: '255LvC7vjfDhmTSBXcAtFckaoRAgi8WikkukRzgJ1jyjwbCs5K1uYiNJhfGx8dEK9oq2qcj7zY8ByJHHuizrCm5VffooCu3x9Q8vn27kYZZJB6rCrZ3ThFhUM56cvxQJKNQe39eiYH4z3T7aTGcAyFUQtJfS2sFHtxvAHroR6oT56xRbu75wow51XGtALff634KcjzbMNKJdCQFLJ2GcXZz',
    SERVER_KEY: 'sk_production_5izAun5aBHh4wDg9U6EdDWoNBsfkGYABJ8ophKaS6GhSXwyN22XXQ7HdnNzEq61pr3u9ikhkNKzPuTZsGZ6euNWj1GCvWTkkFnN4scwoxGoeLniSBzqfkJpZhZCemgUk9xLwXHVhMBV7DEdmWNBABGpGmx4zsxFWYsM7j7c8YQYBMKu6PBBbxDJArntLYNKb4KZ7yoxVMc8DP85iWTmQodEJ',
    CROSSMINT_ENV: 'production',
    API_BASE: 'https://www.crossmint.com/api/2022-06-09',
    PRICE: '$7.00'
};

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

/**
 * Initialize Application
 */
function initApp() {
    initNavigation();
    initScrollAnimations();
    initModals();
    initFormHandling();
    loadCandleWall();
    initCrossmintCheckout();
}

/**
 * Navigation - Smooth scroll and mobile menu
 */
function initNavigation() {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Header background on scroll
    const header = document.querySelector('.header');
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            header.style.background = 'rgba(26, 26, 26, 0.95)';
        } else {
            header.style.background = 'rgba(26, 26, 26, 0.85)';
        }
        
        lastScroll = currentScroll;
    });
}

/**
 * Scroll Animations - Fade in sections
 */
function initScrollAnimations() {
    const sections = document.querySelectorAll('.section, .hero');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in', 'visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    sections.forEach(section => {
        section.classList.add('fade-in');
        observer.observe(section);
    });
}

/**
 * Modal Handling
 */
function initModals() {
    // Purchase modal
    const purchaseButtons = document.querySelectorAll('[data-action="purchase"]');
    const checkoutModal = document.getElementById('checkout-modal');
    
    purchaseButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            openModal(checkoutModal);
        });
    });
    
    // Close modal handlers
    document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(checkoutModal);
        });
    });
    
    // Close on overlay click
    checkoutModal.querySelector('.modal-overlay').addEventListener('click', () => {
        closeModal(checkoutModal);
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(checkoutModal);
            closeFullscreen();
        }
    });
}

function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * Form Handling
 */
function initFormHandling() {
    const prayerInput = document.getElementById('prayer');
    const charCount = document.getElementById('char-count');
    
    if (prayerInput && charCount) {
        prayerInput.addEventListener('input', () => {
            charCount.textContent = prayerInput.value.length;
        });
    }
}

/**
 * Load Candle Wall - Fetch public candles from Crossmint
 */
async function loadCandleWall() {
    const wallContainer = document.getElementById('wall-preview');
    if (!wallContainer) return;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/collections/${CONFIG.COLLECTION_ID}/nfts?page=1&perPage=8`);
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            renderCandleWall(data, wallContainer);
            updateCounter(data.length);
        } else {
            // Show placeholder/demo candles
            renderDemoCandles(wallContainer);
        }
    } catch (error) {
        console.error('Failed to load candle wall:', error);
        renderDemoCandles(wallContainer);
    }
}

function renderCandleWall(nfts, container) {
    container.innerHTML = nfts.map(nft => {
        const date = new Date(nft.onChain?.timestamp || Date.now()).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        return `
            <div class="candle-card" data-nft-id="${nft.id}">
                <img src="${nft.metadata.image}" alt="Everlit Candle" loading="lazy">
                <span class="date">${date}</span>
            </div>
        `;
    }).join('');
}

function renderDemoCandles(container) {
    const demoDates = [
        'Jun 17, 2026',
        'Jun 16, 2026',
        'Jun 15, 2026',
        'Jun 14, 2026'
    ];
    
    container.innerHTML = demoDates.map(date => `
        <div class="candle-card">
            <img src="https://crossmint.myfilebase.com/ipfs/QmeBxmYGM9hV5JcVQKcVq3jiKSzbXctpxm5QyY3fffYud3" alt="Everlit Candle">
            <span class="date">${date}</span>
        </div>
    `).join('');
}

function updateCounter(count) {
    const counter = document.getElementById('candle-counter');
    if (counter) {
        // Animate counter
        const target = 83 + count; // Base + actual
        animateCounter(counter, parseInt(counter.textContent), target, 1000);
    }
}

function animateCounter(element, start, end, duration) {
    const range = end - start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        element.textContent = current;
        
        if (current === end) {
            clearInterval(timer);
        }
    }, stepTime);
}

/**
 * Crossmint Checkout Integration
 */
function initCrossmintCheckout() {
    const container = document.getElementById('crossmint-button-container');
    if (!container || typeof crossmintPayButton === 'undefined') return;
    
    // Store pending purchase data
    let pendingPurchase = null;
    
    // Listen for form changes
    const form = document.getElementById('checkout-form');
    const emailInput = document.getElementById('email');
    const prayerInput = document.getElementById('prayer');
    
    // Create Crossmint button
    const button = crossmintPayButton.create({
        collectionId: CONFIG.COLLECTION_ID,
        projectId: CONFIG.PROJECT_ID,
        environment: CONFIG.CROSSMINT_ENV,
        mintConfig: {
            type: 'erc-721',
            quantity: '1'
        },
        recipientEmail: emailInput?.value || '',
        onEvent: (event) => {
            console.log('Crossmint event:', event);
            
            switch (event.type) {
                case 'payment:process.succeeded':
                    handlePaymentSuccess(event);
                    break;
                case 'payment:process.failed':
                    handlePaymentFailure(event);
                    break;
            }
        }
    });
    
    button.mount('#crossmint-button-container');
    
    // Update email in checkout config when changed
    emailInput?.addEventListener('change', (e) => {
        button.updateConfig({ recipientEmail: e.target.value });
    });
    
    function handlePaymentSuccess(event) {
        // Save purchase data for webhook processing
        pendingPurchase = {
            email: emailInput?.value,
            prayer: prayerInput?.value,
            orderId: event.orderId,
            timestamp: new Date().toISOString()
        };
        
        // Store in localStorage for demo purposes
        // In production, this would be handled by Firebase webhook
        localStorage.setItem('pendingPurchase', JSON.stringify(pendingPurchase));
        
        // Show success message
        showNotification('Candle lit! Check your email for confirmation.', 'success');
        
        // Close modal
        closeModal(document.getElementById('checkout-modal'));
        
        // Clear form
        form?.reset();
        document.getElementById('char-count').textContent = '0';
    }
    
    function handlePaymentFailure(event) {
        showNotification('Payment failed. Please try again.', 'error');
    }
}

/**
 * Fullscreen Candle View
 */
function openFullscreen(candleData) {
    const modal = document.getElementById('fullscreen-modal');
    const candleImg = document.getElementById('fullscreen-candle');
    const prayerText = document.getElementById('fullscreen-prayer');
    const dateText = document.getElementById('fullscreen-date');
    
    if (candleImg) candleImg.src = candleData.image;
    if (prayerText) prayerText.textContent = candleData.prayer || 'Your prayer intention';
    if (dateText) dateText.textContent = candleData.date || '';
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Request actual fullscreen
    if (modal.requestFullscreen) {
        modal.requestFullscreen().catch(() => {});
    }
}

function closeFullscreen() {
    const modal = document.getElementById('fullscreen-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

// Close fullscreen button
document.querySelector('[data-action="close-fullscreen"]')?.addEventListener('click', closeFullscreen);

/**
 * Notification System
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Styles
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? 'rgba(245, 158, 11, 0.9)' : 'rgba(239, 68, 68, 0.9)'};
        color: #1A1A1A;
        border-radius: 8px;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

/**
 * AI-Agentic Helper Functions
 * For future automation and testing
 */
window.EverlitAPI = {
    // Navigation
    navigateTo: (section) => {
        const element = document.querySelector(`[data-section="${section}"]`);
        if (element) element.scrollIntoView({ behavior: 'smooth' });
    },
    
    // Open purchase modal
    openPurchase: () => {
        document.querySelector('[data-action="purchase"]')?.click();
    },
    
    // Get candle count
    getCandleCount: () => {
        return document.getElementById('candle-counter')?.textContent;
    },
    
    // Get wall candles
    getWallCandles: () => {
        return Array.from(document.querySelectorAll('.candle-card')).map(card => ({
            id: card.dataset.nftId,
            date: card.querySelector('.date')?.textContent
        }));
    },
    
    // Fill checkout form
    fillCheckout: (email, prayer) => {
        const emailInput = document.getElementById('email');
        const prayerInput = document.getElementById('prayer');
        if (emailInput) emailInput.value = email;
        if (prayerInput) {
            prayerInput.value = prayer;
            prayerInput.dispatchEvent(new Event('input'));
        }
    }
};

// Expose for AI agents
console.log('🕯️ Everlit Candle loaded. API available at window.EverlitAPI');
