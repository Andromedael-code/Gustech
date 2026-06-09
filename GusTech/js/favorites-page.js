import { addToCart, currency, escapeHtml, getCurrentUser, loadWishlist, qsa, qs, stars, toast, toggleWishlist } from './storefront-core.js';
import { formatCategoryLabel, formatReviewSummary, hasRealReviews } from './storefront-formatters.js';

const state = {
  items: []
};

function productHref(productId) {
  return `produto.html?id=${encodeURIComponent(productId)}`;
}

function setFeedback(message = '', type = 'info') {
  const node = qs('#favorites-feedback');
  if (!node) return;
  node.textContent = message;
  node.className = `mt-5 text-sm${message ? '' : ' hidden'} ${type === 'error' ? 'text-red-300' : type === 'success' ? 'text-emerald-300' : 'text-slate-400'}`;
}

function renderLoggedOut() {
  const list = qs('#favorites-list');
  if (!list) return;
  list.className = 'grid';
  list.innerHTML = `
    <div class="empty-state">
      <h2 class="text-2xl font-display font-bold mb-2">Entre para ver seus favoritos</h2>
      <p class="text-gray-400">Sua lista fica vinculada a sua conta para aparecer em qualquer dispositivo.</p>
      <a class="primary-btn mt-4" href="conta.html?next=favoritos.html"><i class="fas fa-user"></i>Entrar na conta</a>
    </div>
  `;
  setFeedback('');
}

function renderEmpty() {
  const list = qs('#favorites-list');
  if (!list) return;
  list.className = 'grid';
  list.innerHTML = `
    <div class="empty-state">
      <h2 class="text-2xl font-display font-bold mb-2">Nenhum favorito ainda</h2>
      <p class="text-gray-400">Toque no coracao dos produtos para salvar sua selecao aqui.</p>
      <a class="primary-btn mt-4" href="index.html#catalog-section"><i class="fas fa-store"></i>Explorar produtos</a>
    </div>
  `;
  setFeedback('');
}

function renderLoading() {
  const list = qs('#favorites-list');
  if (!list) return;
  list.className = 'product-grid product-grid--compact';
  list.innerHTML = Array.from({ length: 4 }, () => `
    <article class="product-card product-card--skeleton" aria-hidden="true">
      <div class="product-card__image product-card__image--skeleton skeleton-block"></div>
      <div class="p-5 space-y-4">
        <div class="skeleton-block h-4 w-24 rounded-full"></div>
        <div class="skeleton-block h-6 w-4/5 rounded-xl"></div>
        <div class="skeleton-block h-4 w-3/5 rounded-xl"></div>
        <div class="skeleton-block h-11 w-full rounded-2xl"></div>
      </div>
    </article>
  `).join('');
}

function favoriteCard(item) {
  const safeName = escapeHtml(item.name || 'Produto GusTech');
  const safeImage = escapeHtml(item.image || '');
  const safeCategory = escapeHtml(formatCategoryLabel(item.category || 'consoles'));
  const safeDescription = escapeHtml(item.description || 'Produto salvo na sua lista de favoritos.');
  const href = productHref(item.productId);
  const hasDiscount = Number(item.oldPrice || 0) > Number(item.price || 0);
  const showReviews = hasRealReviews(item.reviews);

  return `
    <article class="product-card" data-product-id="${escapeHtml(item.productId)}">
      <div class="relative">
        <a class="media-link" href="${href}" aria-label="Abrir ${safeName}">
          <img class="product-card__image" src="${safeImage}" alt="${safeName}" loading="lazy" decoding="async">
        </a>
        <div class="absolute inset-x-0 top-0 flex items-start justify-between p-4 gap-3">
          <span class="chip">${safeCategory}</span>
          <button class="secondary-btn !rounded-full !p-3 remove-favorite-btn text-red-300" type="button" data-id="${escapeHtml(item.productId)}" aria-label="Remover ${safeName} dos favoritos">
            <i class="fas fa-heart"></i>
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4">
        <div class="mini-meta flex items-center justify-between gap-3">
          <span>${escapeHtml(item.condition || 'GusTech')}</span>
          <span class="status-pill ${Number(item.stock || 0) > 0 ? 'status-pill--ok' : 'status-pill--warn'}">
            ${Number(item.stock || 0) > 0 ? `${item.stock} em estoque` : 'Sem estoque'}
          </span>
        </div>
        <div>
          <a class="block text-xl font-display font-bold text-white hover:text-blue-300 transition-colors" href="${href}">
            ${safeName}
          </a>
          <div class="mini-meta mt-2 flex items-center gap-2 flex-wrap">
            ${showReviews ? `<span class="flex gap-1">${stars(item.rating || 0)}</span>` : ''}
            <span>${escapeHtml(formatReviewSummary(item.rating || 0, item.reviews || 0))}</span>
          </div>
        </div>
        <p class="text-sm text-gray-400 line-clamp-3">${safeDescription}</p>
        <div class="product-card__footer">
          <div class="product-card__price">
            ${hasDiscount ? `<div class="mini-meta line-through">${escapeHtml(currency(item.oldPrice))}</div>` : ''}
            <div class="text-2xl font-bold text-white">${escapeHtml(currency(item.price))}</div>
          </div>
          <div class="product-card__actions">
            <button class="primary-btn add-cart-btn" type="button" data-id="${escapeHtml(item.productId)}" ${Number(item.stock || 0) <= 0 ? 'disabled' : ''}>
              Comprar
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function updateSubtitle() {
  const subtitle = qs('#favorites-subtitle');
  if (!subtitle) return;
  const count = state.items.length;
  subtitle.textContent = count === 1
    ? '1 produto salvo para voce voltar quando quiser.'
    : `${count} produtos salvos para comparar, comprar depois ou voltar rapidinho.`;
}

function renderFavorites() {
  const list = qs('#favorites-list');
  if (!list) return;

  updateSubtitle();
  if (!state.items.length) {
    renderEmpty();
    return;
  }

  list.className = 'product-grid product-grid--compact';
  list.innerHTML = state.items.map(favoriteCard).join('');

  qsa('.add-cart-btn', list).forEach((button) => {
    button.addEventListener('click', async () => {
      const item = state.items.find((entry) => entry.productId === button.dataset.id);
      if (!item) return;

      try {
        button.disabled = true;
        await addToCart({
          productId: item.productId,
          name: item.name,
          image: item.image,
          price: item.price,
          oldPrice: item.oldPrice,
          quantity: 1
        });
        toast('Produto adicionado ao carrinho.', 'success');
      } catch (error) {
        toast(error.message || 'Nao foi possivel adicionar ao carrinho.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  qsa('.remove-favorite-btn', list).forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.id;
      const previousItems = [...state.items];

      try {
        button.disabled = true;
        state.items = state.items.filter((item) => item.productId !== productId);
        renderFavorites();
        const result = await toggleWishlist(productId);
        if (result.saved) {
          state.items = previousItems;
          renderFavorites();
          toast('Produto mantido nos favoritos.', 'info');
          return;
        }
        toast('Produto removido dos favoritos.', 'success');
      } catch (error) {
        state.items = previousItems;
        renderFavorites();
        toast(error.message || 'Nao foi possivel remover dos favoritos.', 'error');
      }
    });
  });
}

async function bootstrap() {
  renderLoading();
  const user = await getCurrentUser();
  if (!user || user.isAnonymous) {
    renderLoggedOut();
    return;
  }

  state.items = await loadWishlist();
  renderFavorites();
}

bootstrap().catch((error) => {
  const list = qs('#favorites-list');
  if (list) {
    list.className = 'grid';
    list.innerHTML = `<div class="feedback-card">${escapeHtml(error.message || 'Nao foi possivel carregar seus favoritos.')}</div>`;
  }
  setFeedback(error.message || 'Nao foi possivel carregar seus favoritos.', 'error');
});
