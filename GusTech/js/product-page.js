import {
  addToCart,
  currency,
  escapeHtml,
  getCurrentUser,
  loadProduct,
  loadReviews,
  qs,
  qsa,
  stars,
  submitReview,
  toast,
  toggleWishlist
} from './storefront-core.js';
import { formatCategoryLabel, formatReviewSummary, hasRealReviews } from './storefront-formatters.js';

const state = {
  product: null,
  reviews: [],
  galleryIndex: 0
};

function formatReviewDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function syncProductReviewAggregate() {
  const total = state.reviews.length;
  state.product.reviews = total;
  state.product.rating = total
    ? Number((state.reviews.reduce((acc, review) => acc + Number(review.rating || 0), 0) / total).toFixed(1))
    : 0;
}

function categoryHref(category = '') {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  return `index.html${params.toString() ? `?${params.toString()}` : ''}#catalog-section`;
}

function currentImage() {
  return state.product?.gallery?.[state.galleryIndex] || state.product?.image || '';
}

function renderReviews() {
  const wrap = document.getElementById('reviews-list');
  if (!wrap) return;

  wrap.innerHTML = state.reviews.length
    ? state.reviews.map((review) => `
      <article class="surface-panel rounded-2xl p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="font-semibold">${escapeHtml(review.name || 'Cliente GusTech')}</div>
            <div class="mini-meta mt-1 flex items-center gap-2 flex-wrap">
              ${review.verifiedPurchase ? '<span class="status-pill status-pill--ok">Compra verificada</span>' : ''}
              ${formatReviewDate(review.createdAt) ? `<span>${escapeHtml(formatReviewDate(review.createdAt))}</span>` : ''}
            </div>
          </div>
          <div class="text-sm flex gap-1">${stars(review.rating)}</div>
        </div>
        <p class="text-sm text-gray-300 mt-2">${escapeHtml(review.comment)}</p>
      </article>
    `).join('')
    : '<div class="mini-meta">Ainda não há avaliações para este produto. Seja o primeiro a avaliar após a compra.</div>';
}

function renderProduct() {
  const root = document.getElementById('product-root');
  if (!root || !state.product) return;

  const product = state.product;
  const safeName = escapeHtml(product.name);
  const safeBrand = escapeHtml(product.brand || 'GusTech');
  const safeDescription = escapeHtml(product.description || '');
  const productCategories = Array.isArray(product.categories) && product.categories.length ? product.categories : [product.category].filter(Boolean);
  const productGallery = product.gallery?.length ? product.gallery : [product.image];
  const showReviews = hasRealReviews(product.reviews);
  const reviewSummary = formatReviewSummary(product.rating || 0, product.reviews || 0);
  const discount = Number(product.oldPrice || 0) > Number(product.price || 0)
    ? Math.round(((Number(product.oldPrice) - Number(product.price)) / Number(product.oldPrice)) * 100)
    : 0;

  document.title = `${product.name} | GusTech`;

  root.innerHTML = `
    <section class="split-layout">
      <div class="surface-panel rounded-[32px] p-5">
        <div class="gallery-grid">
          <div class="thumbnail-list">
            ${productGallery.map((image, index) => `
              <button class="thumbnail-btn ${index === state.galleryIndex ? 'is-active' : ''}" data-index="${index}" type="button" aria-label="Ver imagem ${index + 1} de ${safeName}">
                <img src="${escapeHtml(image)}" alt="${safeName}" loading="lazy" decoding="async">
              </button>
            `).join('')}
          </div>
          <div class="gallery-main surface-panel">
            <img src="${escapeHtml(currentImage())}" alt="${safeName}" decoding="async">
          </div>
        </div>
      </div>

      <div class="surface-panel rounded-[32px] p-8 space-y-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex flex-wrap gap-2">
              ${productCategories.map((category) => `
                <a class="chip chip--link" href="${categoryHref(category)}">${escapeHtml(formatCategoryLabel(category))}</a>
              `).join('')}
            </div>
            <h1 class="mt-4 text-4xl font-display font-bold">${safeName}</h1>
            <div class="mt-3 mini-meta flex items-center gap-3 flex-wrap">
              <span>${safeBrand}</span>
              ${showReviews ? `<span class="flex gap-1">${stars(product.rating || 0)}</span>` : ''}
              <span>${escapeHtml(reviewSummary)}</span>
            </div>
          </div>
          <button id="wishlist-btn" class="secondary-btn !rounded-full !p-4" type="button" aria-label="Favoritar ${safeName}">
            <i class="fas fa-heart"></i>
          </button>
        </div>

        <div class="surface-panel rounded-[28px] p-5">
          <div class="mini-meta">Preço final com compra segura GusTech</div>
          <div class="mt-2 flex items-end gap-3 flex-wrap">
            <div class="text-4xl font-bold">${escapeHtml(currency(product.price))}</div>
            ${Number(product.oldPrice || 0) > Number(product.price || 0) ? `<div class="mini-meta line-through">${escapeHtml(currency(product.oldPrice))}</div>` : ''}
            ${discount > 0 ? `<div class="chip">-${discount}%</div>` : ''}
          </div>
          <div class="mt-3 status-pill ${Number(product.stock || 0) > 0 ? 'status-pill--ok' : 'status-pill--warn'}">
            <i class="fas fa-box"></i>${Number(product.stock || 0) > 0 ? `${product.stock} unidades disponíveis` : 'Sem estoque no momento'}
          </div>
        </div>

        <p class="text-gray-300 leading-7">${safeDescription}</p>

        ${(product.highlights || []).length ? `
          <div class="grid gap-3">
            ${product.highlights.map((item) => `
              <div class="surface-panel rounded-2xl px-4 py-3 text-sm text-gray-300">
                <i class="fas fa-check text-emerald-400 mr-2"></i>${escapeHtml(item)}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="flex flex-wrap items-center gap-3">
          <div class="quantity-stepper">
            <button type="button" data-qty-step="-1" aria-label="Diminuir quantidade">-</button>
            <span id="qty-value">1</span>
            <button type="button" data-qty-step="1" aria-label="Aumentar quantidade">+</button>
          </div>
          <button id="buy-btn" class="primary-btn flex-1" type="button">
            <i class="fas fa-cart-plus"></i>Adicionar ao carrinho
          </button>
        </div>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-[1fr_380px] mt-8">
      <div class="surface-panel rounded-[32px] p-8">
        <h2 class="text-2xl font-display font-bold mb-5">Detalhes técnicos</h2>
        <div class="grid gap-3 md:grid-cols-2">
          ${(product.specs || []).length
            ? product.specs.map((spec) => `
                <div class="surface-panel rounded-2xl px-4 py-4">
                  <div class="mini-meta">${escapeHtml(spec.label)}</div>
                  <div class="mt-1 font-semibold">${escapeHtml(spec.value)}</div>
                </div>
              `).join('')
            : '<div class="mini-meta">Sem especificações adicionais cadastradas.</div>'}
        </div>
      </div>

      <div class="surface-panel rounded-[32px] p-8">
        <h2 class="text-2xl font-display font-bold mb-5">Avaliações</h2>
        <form id="review-form" class="space-y-3">
          <select id="review-rating" class="store-select">
            <option value="5">5 estrelas</option>
            <option value="4">4 estrelas</option>
            <option value="3">3 estrelas</option>
            <option value="2">2 estrelas</option>
            <option value="1">1 estrela</option>
          </select>
          <textarea id="review-comment" class="store-textarea" rows="4" placeholder="Conte como foi sua experiência com este produto"></textarea>
          <button class="primary-btn w-full" type="submit">Enviar avaliação</button>
        </form>
        <div id="reviews-list" class="space-y-3 mt-6"></div>
      </div>
    </section>

    <section class="mt-8">
      <h2 class="text-2xl font-display font-bold mb-4">Produtos relacionados</h2>
      <div class="product-grid">
        ${(product.relatedProducts || []).map((item) => `
          <article class="product-card">
            <img class="product-card__image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async">
            <div class="p-5 space-y-3">
              <div class="flex flex-wrap gap-2">
                ${(Array.isArray(item.categories) && item.categories.length ? item.categories : [item.category].filter(Boolean)).map((category) => `
                  <a class="mini-meta inline-flex w-fit hover:text-blue-300 transition-colors" href="${categoryHref(category)}">${escapeHtml(formatCategoryLabel(category))}</a>
                `).join('')}
              </div>
              <a class="block text-xl font-display font-bold text-white" href="produto.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a>
              <div class="flex items-center justify-between gap-3">
                <span class="font-bold">${escapeHtml(currency(item.price))}</span>
                <a class="secondary-btn" href="produto.html?id=${encodeURIComponent(item.id)}">Abrir</a>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;

  qsa('.thumbnail-btn', root).forEach((button) => {
    button.addEventListener('click', () => {
      state.galleryIndex = Number(button.dataset.index || 0);
      renderProduct();
      renderReviews();
    });
  });

  qsa('[data-qty-step]', root).forEach((button) => {
    button.addEventListener('click', () => {
      const valueNode = qs('#qty-value');
      const current = Number(valueNode?.textContent || 1);
      const next = Math.max(1, Math.min(Number(state.product.stock || 99), current + Number(button.dataset.qtyStep || 0)));
      if (valueNode) valueNode.textContent = String(next);
    });
  });

  qs('#buy-btn')?.addEventListener('click', async () => {
    try {
      const quantity = Number(qs('#qty-value')?.textContent || 1);
      await addToCart({
        productId: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        oldPrice: product.oldPrice,
        quantity
      });
      toast('Item adicionado ao carrinho.', 'success');
    } catch (error) {
      toast(error.message || 'Não foi possível adicionar ao carrinho.', 'error');
    }
  });

  qs('#wishlist-btn')?.addEventListener('click', async () => {
    try {
      const user = await getCurrentUser();
      if (!user || user.isAnonymous) {
        toast('Entre na conta para favoritar produtos.', 'error');
        window.setTimeout(() => {
          const nextPath = `${window.location.pathname.split('/').pop()}${window.location.search}`;
          window.location.href = `conta.html?next=${encodeURIComponent(nextPath)}`;
        }, 500);
        return;
      }

      await toggleWishlist(product.id);
      toast('Wishlist atualizada.', 'success');
    } catch (error) {
      toast(error.message || 'Falha ao atualizar wishlist.', 'error');
    }
  });

  qs('#review-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const user = await getCurrentUser();
      if (!user || user.isAnonymous) {
        toast('Entre na conta para avaliar.', 'error');
        return;
      }

      await submitReview(product.id, {
        rating: Number(qs('#review-rating')?.value || 5),
        comment: qs('#review-comment')?.value.trim() || ''
      });

      state.reviews = await loadReviews(product.id);
      syncProductReviewAggregate();
      renderProduct();
      renderReviews();
      if (qs('#review-comment')) qs('#review-comment').value = '';
      toast('Avaliação enviada com sucesso.', 'success');
    } catch (error) {
      toast(error.message || 'Não foi possível enviar sua avaliação.', 'error');
    }
  });
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  if (!productId) throw new Error('Produto não especificado.');

  const [product, reviews] = await Promise.all([loadProduct(productId), loadReviews(productId)]);
  state.product = product;
  state.reviews = reviews;
  syncProductReviewAggregate();
  renderProduct();
  renderReviews();
}

bootstrap().catch((error) => {
  const root = document.getElementById('product-root');
  if (root) {
    root.innerHTML = `<div class="feedback-card">${escapeHtml(error.message || 'Não foi possível carregar este produto.')}</div>`;
  }
});
