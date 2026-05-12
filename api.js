// TravelMate Nepal — API Connector
// Include this in every HTML page: <script src="api.js"></script>

const API = 'https://travelmate-api-pr3w.onrender.com';

// ─── Auth helpers ─────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('tm_token'),
  getUser:  () => JSON.parse(localStorage.getItem('tm_user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('tm_token'),
  save: (token, user) => {
    localStorage.setItem('tm_token', token);
    localStorage.setItem('tm_user', JSON.stringify(user));
  },
  logout: () => {
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_user');
    window.location.href = 'login.html';
  }
};

// ─── Base fetch wrapper ───────────────────────────────────────
async function apiRequest(method, path, body = null, auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = `Bearer ${Auth.getToken()}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API}${path}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  } catch (err) {
    throw err;
  }
}

// ─── Auth API ─────────────────────────────────────────────────
const AuthAPI = {
  register: (data) => apiRequest('POST', '/api/auth/register', data),
  login:    (data) => apiRequest('POST', '/api/auth/login', data),
  me:       ()     => apiRequest('GET',  '/api/auth/me', null, true),
  forgot:   (email)=> apiRequest('POST', '/api/auth/forgot-password', { email }),
};

// ─── Listings API ─────────────────────────────────────────────
const ListingsAPI = {
  search: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return apiRequest('GET', `/api/listings?${params}`);
  },
  get: (id) => apiRequest('GET', `/api/listings/${id}`),
};

// ─── Bookings API ─────────────────────────────────────────────
const BookingsAPI = {
  create: (data)  => apiRequest('POST',  '/api/bookings', data, true),
  myList: ()      => apiRequest('GET',   '/api/bookings/my', null, true),
  get:    (id)    => apiRequest('GET',   `/api/bookings/${id}`, null, true),
  cancel: (id)    => apiRequest('PATCH', `/api/bookings/${id}/cancel`, {}, true),
};

// ─── Reviews API ──────────────────────────────────────────────
const ReviewsAPI = {
  get:    (listing_id) => apiRequest('GET',  `/api/reviews/${listing_id}`),
  create: (data)       => apiRequest('POST', '/api/reviews', data, true),
};

// ─── Vendors API ──────────────────────────────────────────────
const VendorsAPI = {
  me:       ()     => apiRequest('GET',   '/api/vendors/me', null, true),
  register: (data) => apiRequest('POST',  '/api/vendors/register', data, true),
  stats:    ()     => apiRequest('GET',   '/api/vendors/stats', null, true),
  update:   (data) => apiRequest('PATCH', '/api/vendors/me', data, true),
};

// ─── UI Helpers ───────────────────────────────────────────────

// Show toast notification
function showToast(message, type = 'success') {
  const existing = document.getElementById('tm-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'tm-toast';
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:14px 20px;border-radius:12px;font-family:'DM Sans',sans-serif;
    font-size:14px;font-weight:500;color:#fff;max-width:320px;
    box-shadow:0 8px 32px rgba(0,0,0,0.15);
    animation:slideIn .3s ease;
    background:${type === 'success' ? '#1B4332' : type === 'error' ? '#c62828' : '#0077B6'};
  `;
  toast.innerHTML = `${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${message}`;
  document.body.appendChild(toast);

  const style = document.createElement('style');
  style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`;
  document.head.appendChild(style);

  setTimeout(() => toast.remove(), 4000);
}

// Show loading spinner on a button
function setButtonLoading(btn, loading, originalText) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle"></span> Loading...';
  } else {
    btn.disabled = false;
    btn.textContent = originalText || btn.dataset.originalText;
  }
}

// Update nav based on login status
function updateNav() {
  const user = Auth.getUser();
  const signInBtns = document.querySelectorAll('.btn-signin');
  const userMenus = document.querySelectorAll('.user-menu');

  if (user) {
    signInBtns.forEach(btn => {
      btn.textContent = user.first_name;
      btn.onclick = () => window.location.href = 'dashboard.html';
    });
    userMenus.forEach(m => m.style.display = 'flex');
  }
}

// Format price
function formatPrice(amount, unit = '') {
  return `$${Number(amount).toLocaleString()}${unit ? ' ' + unit : ''}`;
}

// Format date
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// Star rating display
function starsHTML(rating) {
  const full = Math.floor(rating / 2);
  const half = rating % 2 >= 1 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

// Run on every page load
document.addEventListener('DOMContentLoaded', () => {
  updateNav();
});
