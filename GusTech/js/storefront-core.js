import { auth, waitForAuthState } from './firebase-app.js';

export const currency = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[char]));
export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const LOCAL_CART_KEY = 'gustech_local_cart';

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
  badge.textContent = String(total);
  badge.classList.toggle('scale-0', total <= 0);
}

export function stars(rating = 0) {
  const safe = Math.max(0, Math.min(5, Number(rating || 0)));
  return Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(safe);
    return `<i class="fas fa-star ${active ? 'text-yellow-400' : 'text-gray-600'}"></i>`;
  }).join('');
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const item = document.createElement('div');
  const isLight = document.documentElement.classList.contains('light');
  const themeClass = type === 'error'
    ? isLight ? 'border-red-500/20 text-red-700 bg-red-500/10' : 'border-red-500/30 text-red-100'
    : type === 'success'
      ? isLight ? 'border-emerald-500/20 text-emerald-700 bg-emerald-500/10' : 'border-emerald-500/30 text-emerald-100'
      : isLight ? 'border-blue-500/20 text-blue-700 bg-blue-500/10' : 'border-blue-500/30 text-blue-100';
  item.className = `surface-panel px-4 py-3 rounded-2xl border ${themeClass} text-sm shadow-xl`;
  item.textContent = message;
  root.appendChild(item);
  setTimeout(() => {
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
  const user = await getCurrentUser();
  if (!user || user.isAnonymous) {
    return normalizeLocalCart(readLocalCart());
  }

  try {
    const response = await api('/cart/me');
    const items = normalizeLocalCart(response.items || []);
    syncCartBadge(items);
    return items;
  } catch {
    return normalizeLocalCart(readLocalCart());
  }
}

export async function addToCart(payload) {
  const user = await getCurrentUser();
  if (!user || user.isAnonymous) {
    const items = normalizeLocalCart(readLocalCart());
    const existing = items.find((item) => item.productId && item.productId === payload.productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + Number(payload.quantity || 1), 99);
    } else {
      items.push({
        docId: `local-${payload.productId || crypto.randomUUID()}`,
        productId: payload.productId || null,
        name: payload.name || 'Produto',
        image: payload.image || '',
        price: Number(payload.price || 0),
        oldPrice: Number(payload.oldPrice || 0),
        quantity: Math.min(Math.max(Number(payload.quantity || 1), 1), 99)
      });
    }
    writeLocalCart(items);
    return { ok: true };
  }

  try {
    const response = await api('/cart/me', { method: 'POST', body: JSON.stringify(payload) });
    const items = await loadCart();
    syncCartBadge(items);
    return response;
  } catch {
    const items = normalizeLocalCart(readLocalCart());
    const existing = items.find((item) => item.productId && item.productId === payload.productId);
    if (existing) existing.quantity = Math.min(existing.quantity + Number(payload.quantity || 1), 99);
    else items.push({
      docId: `local-${payload.productId || crypto.randomUUID()}`,
      productId: payload.productId || null,
      name: payload.name || 'Produto',
      image: payload.image || '',
      price: Number(payload.price || 0),
      oldPrice: Number(payload.oldPrice || 0),
      quantity: Math.min(Math.max(Number(payload.quantity || 1), 1), 99)
    });
    writeLocalCart(items);
    return { ok: true, fallback: true };
  }
}

export async function updateCartItem(itemId, quantity) {
  const normalizedQuantity = Math.min(Math.max(Number(quantity || 1), 1), 99);
  const user = await getCurrentUser();
  if (!user || user.isAnonymous || String(itemId).startsWith('local-')) {
    const items = normalizeLocalCart(readLocalCart()).map((item) => item.docId === itemId ? { ...item, quantity: normalizedQuantity } : item);
    writeLocalCart(items);
    return { ok: true, quantity: normalizedQuantity };
  }

  try {
    const response = await api(`/cart/me/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity: normalizedQuantity }) });
    const items = await loadCart();
    syncCartBadge(items);
    return response;
  } catch {
    const items = normalizeLocalCart(readLocalCart()).map((item) => item.docId === itemId ? { ...item, quantity: normalizedQuantity } : item);
    writeLocalCart(items);
    return { ok: true, quantity: normalizedQuantity, fallback: true };
  }
}

export async function deleteCartItem(itemId) {
  const user = await getCurrentUser();
  if (!user || user.isAnonymous || String(itemId).startsWith('local-')) {
    const items = normalizeLocalCart(readLocalCart()).filter((item) => item.docId !== itemId);
    writeLocalCart(items);
    return { ok: true };
  }

  try {
    const response = await api(`/cart/me/${itemId}`, { method: 'DELETE' });
    const items = await loadCart();
    syncCartBadge(items);
    return response;
  } catch {
    const items = normalizeLocalCart(readLocalCart()).filter((item) => item.docId !== itemId);
    writeLocalCart(items);
    return { ok: true, fallback: true };
  }
}

export async function loadWishlist() {
  const response = await api('/wishlist/me');
  return response.items || [];
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

syncCartBadge();
