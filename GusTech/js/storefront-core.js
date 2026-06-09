import { auth, waitForAuthState } from './firebase-app.js';

export const currency = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[char]));
export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const LOCAL_CART_KEY = 'gustech_local_cart';
const LOGIN_REQUIRED_MESSAGE = 'Entre na sua conta para usar o carrinho e finalizar compras.';

function readLocalCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalCart(items = []) {
  localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(items));
  syncCartBadge(items);
  window.dispatchEvent(new CustomEvent('gustech:cart-updated', { detail: { items } }));
  return items;
}

function normalizeLocalCart(items = []) {
  return items.map((item, index) => ({
    docId: item.docId || `local-${item.productId || index + 1}`,
    productId: item.productId || null,
    name: item.name || 'Produto',
    image: item.image || '',
    price: Number(item.price || 0),
    oldPrice: Number(item.oldPrice || 0),
    quantity: Math.min(Math.max(Number(item.quantity || 1), 1), 99)
  }));
}

function syncCartBadge(items = readLocalCart()) {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const total = items.reduce((acc, item) => acc + Number(item.quantity || 0), 0);
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.style.display = total > 0 ? 'flex' : 'none';
  badge.classList.toggle('scale-0', total <= 0);
}

function withTimeout(promise, timeoutMs = 6_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Tempo limite de autenticacao.')), timeoutMs);
    })
  ]);
}

export async function refreshCartBadge() {
  const user = await getAuthenticatedUser();
  if (!user) {
    syncCartBadge([]);
    return;
  }

  try {
    const response = await api('/cart/me');
    const items = normalizeLocalCart(response.items || []);
    localStorage.removeItem(LOCAL_CART_KEY);
    syncCartBadge(items);
  } catch {
    syncCartBadge([]);
  }
}

export function showLoginPrompt(next = window.location.pathname.split('/').pop() || 'index.html') {
  let modal = document.getElementById('login-required-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'login-required-modal';
    modal.className = 'login-required-modal hidden';
    modal.innerHTML = `
      <div class="login-required-modal__backdrop" data-login-modal-close></div>
      <section class="login-required-modal__panel" role="dialog" aria-modal="true" aria-labelledby="login-required-title">
        <button class="login-required-modal__close" type="button" aria-label="Fechar" data-login-modal-close>
          <i class="fas fa-xmark"></i>
        </button>
        <div class="login-required-modal__icon"><i class="fas fa-user-lock"></i></div>
        <h2 id="login-required-title">Entre para continuar</h2>
        <p>Para proteger seus dados, carrinho, endereço e pagamento ficam disponíveis apenas após login.</p>
        <div class="login-required-modal__actions">
          <a class="primary-btn" data-login-modal-enter href="conta.html">Entrar ou criar conta</a>
          <button class="secondary-btn" type="button" data-login-modal-close>Continuar navegando</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target.closest('[data-login-modal-close]')) modal.classList.add('hidden');
    });
  }

  const loginUrl = `conta.html?next=${encodeURIComponent(next)}`;
  modal.querySelector('[data-login-modal-enter]')?.setAttribute('href', loginUrl);
  modal.classList.remove('hidden');
}

export async function requireLoggedIn(next, message = LOGIN_REQUIRED_MESSAGE) {
  const user = await getAuthenticatedUser();
  if (user) return user;
  openLoginPrompt(next, message);
  return null;
}

export function stars(rating = 0) {
  const safe = Math.max(0, Math.min(5, Number(rating || 0)));
  return Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(safe);
    return `<i class="fas fa-star ${active ? 'text-yellow-400' : 'text-gray-600'}"></i>`;
  }).join('');
}

export function toast(message, type = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  const item = document.createElement('div');
  const isLight = document.documentElement.classList.contains('light');
  const themeClass = type === 'error'
    ? isLight ? 'border-red-500/20 text-red-700 bg-red-500/10' : 'border-red-500/30 text-red-100'
    : type === 'success'
      ? isLight ? 'border-emerald-500/20 text-emerald-700 bg-emerald-500/10' : 'border-emerald-500/30 text-emerald-100'
      : isLight ? 'border-blue-500/20 text-blue-700 bg-blue-500/10' : 'border-blue-500/30 text-blue-100';
  item.className = `toast surface-panel px-4 py-3 rounded-2xl border ${themeClass} text-sm shadow-xl`;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.textContent = message;
  root.appendChild(item);
  window.requestAnimationFrame(() => item.classList.add('toast--visible'));
  setTimeout(() => {
    item.classList.remove('toast--visible');
    item.style.opacity = '0';
    setTimeout(() => item.remove(), 260);
  }, 2800);
}

export async function api(path, options = {}) {
  return window.gustechApi.request(path, options);
}

export async function getCurrentUser() {
  return auth.currentUser || waitForAuthState();
}

export async function getAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user || user.isAnonymous) return null;

  try {
    await withTimeout(user.getIdToken(true));
    await api('/users/me', { timeoutMs: 6_000 });
    return user;
  } catch {
    await auth.signOut().catch(() => {});
    localStorage.removeItem(LOCAL_CART_KEY);
    syncCartBadge([]);
    return null;
  }
}

function openLoginPrompt(next, message = LOGIN_REQUIRED_MESSAGE) {
  localStorage.removeItem(LOCAL_CART_KEY);
  syncCartBadge([]);
  showLoginPrompt(next);
  toast(message, 'error');
}

export async function loadCatalog(params = {}, requestOptions = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  return api(`/products${query.toString() ? `?${query.toString()}` : ''}`, requestOptions);
}

export async function loadProduct(productId, requestOptions = {}) {
  const response = await api(`/products/${productId}`, requestOptions);
  return response.product;
}

export async function loadCategories(requestOptions = {}) {
  const response = await api('/products/meta/categories', requestOptions);
  return response.categories || [];
}

export async function loadCart() {
  const user = await getAuthenticatedUser();
  if (!user) {
    localStorage.removeItem(LOCAL_CART_KEY);
    syncCartBadge([]);
    return [];
  }

  try {
    const response = await api('/cart/me');
    const items = normalizeLocalCart(response.items || []);
    localStorage.removeItem(LOCAL_CART_KEY);
    syncCartBadge(items);
    return items;
  } catch (error) {
    syncCartBadge([]);
    throw error;
  }
}

export async function addToCart(payload) {
  const user = await requireLoggedIn('carrinho.html');
  if (!user) throw new Error(LOGIN_REQUIRED_MESSAGE);

  try {
    const response = await api('/cart/me', { method: 'POST', body: JSON.stringify(payload) });
    const items = await loadCart();
    syncCartBadge(items);
    return response;
  } catch (error) {
    throw error;
  }
}

export async function updateCartItem(itemId, quantity) {
  const normalizedQuantity = Math.min(Math.max(Number(quantity || 1), 1), 99);
  const user = await requireLoggedIn('carrinho.html');
  if (!user) throw new Error(LOGIN_REQUIRED_MESSAGE);

  try {
    const response = await api(`/cart/me/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity: normalizedQuantity }) });
    const items = await loadCart();
    syncCartBadge(items);
    return response;
  } catch (error) {
    throw error;
  }
}

export async function deleteCartItem(itemId) {
  const user = await requireLoggedIn('carrinho.html');
  if (!user) throw new Error(LOGIN_REQUIRED_MESSAGE);

  try {
    const response = await api(`/cart/me/${itemId}`, { method: 'DELETE' });
    const items = await loadCart();
    syncCartBadge(items);
    return response;
  } catch (error) {
    throw error;
  }
}

export async function loadWishlist() {
  const response = await api('/wishlist/me');
  return response.items || [];
}

export async function checkWishlist(productId) {
  return api(`/wishlist/check/${productId}`);
}

export async function toggleWishlist(productId) {
  return api(`/wishlist/me/${productId}/toggle`, { method: 'POST', body: JSON.stringify({}) });
}

export async function loadProfile() {
  return api('/users/me');
}

export async function createOrder(payload) {
  return api('/orders', { method: 'POST', body: JSON.stringify(payload) });
}

export async function loadReviews(productId) {
  const response = await api(`/reviews/${productId}`);
  return response.reviews || [];
}

export async function submitReview(productId, payload) {
  return api(`/reviews/${productId}`, { method: 'POST', body: JSON.stringify(payload) });
}

export function saveCheckoutSelection(ids = []) {
  localStorage.setItem('gustech_checkout_items', JSON.stringify(ids));
}

export function getCheckoutSelection() {
  try {
    const parsed = JSON.parse(localStorage.getItem('gustech_checkout_items') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (!/(^|\/)(carrinho|pagamento)\.html(?:[?#].*)?$/.test(href)) return;
  event.preventDefault();
  void getAuthenticatedUser().then((user) => {
    if (user) window.location.href = href;
    else openLoginPrompt(href);
  });
});

syncCartBadge([]);
refreshCartBadge().catch(() => syncCartBadge([]));
auth.onAuthStateChanged(() => {
  refreshCartBadge().catch(() => syncCartBadge([]));
});
