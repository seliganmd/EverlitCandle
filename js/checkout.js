/**
 * Everlit Candle - Stripe Checkout Integration
 * Frontend checkout flow
 */

const API_BASE = 'https://us-central1-everlitcandle.cloudfunctions.net';

/**
 * Initialize checkout form handling
 */
function initCheckout() {
  const form = document.getElementById('checkout-form');
  const submitBtn = document.getElementById('checkout-submit');
  
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const prayer = document.getElementById('prayer').value;
    const isPublic = document.getElementById('is-public')?.checked ?? true;
    
    if (!email || !prayer) {
      showNotification('Please fill in all fields', 'error');
      return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating checkout...';
    
    try {
      const response = await fetch(`${API_BASE}/createCheckoutSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          prayer,
          isPublic
        })
      });
      
      const data = await response.json();
      
      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout');
      }
      
    } catch (error) {
      console.error('Checkout error:', error);
      showNotification(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Light My Candle';
    }
  });
}

/**
 * Check for checkout result in URL
 */
function checkCheckoutResult() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  const canceled = urlParams.get('canceled');
  
  if (sessionId) {
    showNotification('Payment successful! Your candle is being minted...', 'success');
    // Clear URL params
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (canceled) {
    showNotification('Payment canceled. You can try again.', 'info');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/**
 * Load user's candles from backend
 */
async function loadUserCandles(email) {
  if (!email) return;
  
  try {
    const response = await fetch(`${API_BASE}/getUserCandles?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    
    if (data.candles) {
      renderUserCandles(data.candles);
    }
  } catch (error) {
    console.error('Error loading candles:', error);
  }
}

/**
 * Render user's candles
 */
function renderUserCandles(candles) {
  const grid = document.getElementById('candles-grid');
  if (!grid) return;
  
  if (candles.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>You haven't lit any candles yet.</p>
        <p><a href="/">Light your first candle</a></p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = candles.map((candle, index) => `
    <div class="candle-card" data-status="${candle.status}">
      <span class="candle-prayer-meta">${candle.prayer || 'My prayer, memory, hope, or intention'}</span>
      <img src="assets/logo.png" alt="Everlit Candle #${index + 1}">
      <p class="candle-date">${formatDate(candle.createdAt)}</p>
      ${candle.status === 'minted' ? '<span class="candle-status minted">Minted</span>' : ''}
      ${candle.status === 'pending_payment' ? '<span class="candle-status pending">Pending</span>' : ''}
    </div>
  `).join('');
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return 'Lit: Recently';
  const date = new Date(dateString);
  return `Lit: ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })}`;
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <span class="notification-message">${message}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  
  // Styles
  notification.style.cssText = `
    position: fixed;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1e1c19'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 1000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initCheckout();
  checkCheckoutResult();
});

// Export for global access
window.EverlitCheckout = {
  loadUserCandles,
  renderUserCandles
};
