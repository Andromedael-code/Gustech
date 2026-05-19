import { auth } from './firebase-app.js';
import {
  addToCart,
  api,
  currency,
  escapeHtml,
  getCurrentUser,
  loadCatalog,
  loadCategories,
  loadWishlist,
  qsa,
  qs,
  stars,
  toast,
  toggleWishlist
} from './storefront-core.js';
import { debounce, formatCategoryLabel, formatReviewSummary, hasRealReviews, normalizeText } from './storefront-formatters.js';

const urlState = new URLSearchParams(window.location.search);
const initialCategory = urlState.get('category') || '';
const initialSearch = urlState.get('search') || '';
const initialSort = urlState.get('sort') || 'relevance';
const initialMinPrice = urlState.get('minPrice') || '';
const initialMaxPrice = urlState.get('maxPrice') || '';
const initialPage = Math.max(Number(urlState.get('page') || 1), 1);

const DEFAULT_HEADER_CATEGORY_ORDER = ['playstation', 'xbox', 'consoles', 'classicos', 'monitores', 'nintendo', 'raridades', 'perifericos'];

const state = {
  products: [],
  categories: [],
  topSellerRanks: new Map(),
  wishlist: new Set(),
  filters: {
    search: initialSearch,
    category: initialCategory,
    minPrice: initialMinPrice,
    maxPrice: initialMaxPrice,
    sort: initialSort,
    limit: 16,
    page: initialPage
  },
  pagination: {
    page: initialPage,
    limit: 16,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  },
  sliderIndex: 0,
  sliderTimer: null,
  sliderDrag: { active: false, startX: 0, deltaX: 0, width: 0 },
  sliderPreventClickUntil: 0,
  catalogRequestId: 0,
  catalogAbortController: null,
  homeConfig: {
    headerCategories: [...DEFAULT_HEADER_CATEGORY_ORDER],
    productSlides: []
  }
};

const debouncedCatalogRefresh = debounce(() => {
  refreshCatalog();
}, 260);

function productHref(productId) {
  return `produto.html?id=${encodeURIComponent(productId)}`;
}

function topSellerLabel(productId) {
  const rank = state.topSellerRanks.get(productId);
  if (!rank) return '';
  return rank === 1 ? 'Mais vendido' : `Top ${rank}`;
}

function pickSlideProduct(products = [], preferredTerms = [], fallbackTerms = []) {
  const indexedProducts = products.map((product) => ({
    product,
    haystack: `${normalizeText(product.name)} ${normalizeText(product.category)} ${normalizeText(product.slug || '')}`
  }));

  const preferred = indexedProducts.find(({ haystack }) => preferredTerms.every((term) => haystack.includes(normalizeText(term))));
  if (preferred) return preferred.product;

  const fallback = indexedProducts.find(({ haystack }) => fallbackTerms.every((term) => haystack.includes(normalizeText(term))));
  return fallback?.product || null;
}

function fallbackProductSlides() {
  const source = state.products;
  const playstation5 = pickSlideProduct(source, ['playstation', '5'], ['playstation']);
  const switchOled = pickSlideProduct(source, ['nintendo', 'switch', 'oled'], ['nintendo', 'switch']);

  return [playstation5, switchOled]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
    .map((item, index) => ({
      kind: 'product',
      id: item.id,
      href: productHref(item.id),
      title: item.name,
      badge: formatCategoryLabel(item.category),
      description: item.description || 'Produto selecionado para setups premium e compra confiável.',
      image: item.image,
      price: currency(item.price),
      accent: ['Oferta em destaque', 'Seleção gamer'][index % 2]
    }));
}

function configuredProductSlides() {
  if (!state.homeConfig.productSlides.length) return [];

  return state.homeConfig.productSlides
    .map((slide) => {
      const product = slide.product;
      if (!product?.id) return null;

      return {
        kind: 'product',
        id: product.id,
        href: productHref(product.id),
        title: product.name,
        badge: formatCategoryLabel(product.category),
        description: product.description || 'Produto selecionado para setups premium e compra confiável.',
        image: product.image,
        price: currency(product.price),
        accent: slide.accent || 'Oferta em destaque'
      };
    })
    .filter(Boolean);
}

function sliderSlides() {
  const productSlides = configuredProductSlides().length ? configuredProductSlides() : fallbackProductSlides();

  return [
    {
      kind: 'hero',
      title: 'O Próximo Nível\nComeça Aqui',
      badge: 'Promoção exclusiva',
      description: 'Consoles novos, semi-novos e raridades com garantia total. Atualize seu setup hoje.'
    },
    ...productSlides
  ];
}

function sliderCount() {
  return sliderSlides().length;
}

function updateAuthLink() {
  const button = document.getElementById('auth-action-btn');
  if (!button) return;
  const user = auth.currentUser;
  button.textContent = user && !user.isAnonymous ? 'Minha conta' : 'Entrar / Criar conta';
  button.href = 'conta.html';
}

function syncFilterControls() {
  const searchInput = qs('#search-input');
  const categorySelect = qs('#category-select');
  const minPriceInput = qs('#price-min');
  const maxPriceInput = qs('#price-max');
  const sortSelect = qs('#sort-select');

  if (searchInput) searchInput.value = state.filters.search;
  if (categorySelect) categorySelect.value = state.filters.category;
  if (minPriceInput) minPriceInput.value = state.filters.minPrice;
  if (maxPriceInput) maxPriceInput.value = state.filters.maxPrice;
  if (sortSelect) sortSelect.value = state.filters.sort;
}

function pushFilterStateToUrl() {
  const params = new URLSearchParams();
  if (state.filters.search) params.set('search', state.filters.search);
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.minPrice) params.set('minPrice', state.filters.minPrice);
  if (state.filters.maxPrice) params.set('maxPrice', state.filters.maxPrice);
  if (state.filters.sort && state.filters.sort !== 'relevance') params.set('sort', state.filters.sort);
  if (state.filters.page > 1) params.set('page', String(state.filters.page));

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function renderCategories(categories = state.categories) {
  const wrap = document.getElementById('category-pills');
  const select = document.getElementById('category-select');
  const normalizedCategories = categories
    .map((item) => item?.category?.trim())
    .filter(Boolean);

  if (select) {
    select.innerHTML = `
      <option value="">Todas as categorias</option>
      ${normalizedCategories.map((category) => `
        <option value="${escapeHtml(category)}" ${state.filters.category === category ? 'selected' : ''}>${escapeHtml(formatCategoryLabel(category))}</option>
      `).join('')}
    `;
  }

  if (!wrap) return;

  const selectedCategory = String(state.filters.category || '').trim().toLowerCase();
  const curated = (state.homeConfig.headerCategories.length ? state.homeConfig.headerCategories : DEFAULT_HEADER_CATEGORY_ORDER)
    .map((category) => String(category || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((category, index, list) => list.indexOf(category) === index);

  wrap.innerHTML = `
    <button class="rail-category ${selectedCategory ? '' : 'is-active'}" data-category="">Todos</button>
    ${curated.map((category) => `
      <button class="rail-category ${selectedCategory === category ? 'is-active' : ''}" data-category="${escapeHtml(category)}">
        ${escapeHtml(formatCategoryLabel(category))}
      </button>
    `).join('')}
  `;

  qsa('.rail-category', wrap).forEach((button) => {
    button.addEventListener('click', () => {
      applyCategoryFilter(button.dataset.category || '');
    });
  });
}

function applyCategoryFilter(category = '') {
  state.filters.category = category;
  state.filters.page = 1;
  syncFilterControls();
  renderCategories(state.categories);
  refreshCatalog();
}

function renderSliderDots() {
  const dots = qs('#slider-dots');
  if (!dots) return;

  const slides = sliderSlides();
  dots.innerHTML = slides.map((_, index) => `
    <button
      class="store-slider__dot ${index === state.sliderIndex ? 'is-active' : ''}"
      type="button"
      data-index="${index}"
      aria-label="Ir para o slide ${index + 1}">
    </button>
  `).join('');

  qsa('.store-slider__dot', dots).forEach((button) => {
    button.addEventListener('click', () => {
      goToSlide(Number(button.dataset.index || 0));
      restartSliderTimer();
    });
  });
}

function syncSliderPosition({ animate = true } = {}) {
  const track = qs('#slider-track');
  const lane = qs('.store-slider__lane', track);
  if (!track || !lane) return;

  track.style.setProperty('--slider-index', String(state.sliderIndex));
  track.style.setProperty('--slider-drag-offset', `${state.sliderDrag.deltaX || 0}px`);
  lane.classList.toggle('is-dragging', !animate);
}

function goToSlide(nextIndex, { animate = true } = {}) {
  const total = sliderCount();
  if (!total) return;

  state.sliderIndex = (nextIndex + total) % total;
  state.sliderDrag.deltaX = 0;
  syncSliderPosition({ animate });
  renderSliderDots();
}

function renderSlider() {
  const track = qs('#slider-track');
  if (!track) return;

  const slides = sliderSlides();
  if (!slides.length) {
    track.innerHTML = '';
    const dots = qs('#slider-dots');
    if (dots) dots.innerHTML = '';
    return;
  }

  if (state.sliderIndex >= slides.length) state.sliderIndex = 0;

  track.innerHTML = `
    <div class="store-slider__lane">
      ${slides.map((slide) => {
        if (slide.kind === 'hero') {
          const title = slide.title.split('\n');
          return `
            <article class="store-slide store-slide--hero">
              <div class="store-slide__inner store-slide__inner--hero">
                <div class="store-slide__hero-copy">
                  <div class="chip"><i class="fas fa-rocket"></i>${escapeHtml(slide.badge)}</div>
                  <h3 class="store-slide__hero-title">
                    <span>${escapeHtml(title[0] || '')}</span>
                    <span class="store-slide__hero-title--muted">${escapeHtml(title[1] || '')}</span>
                  </h3>
                  <p class="store-slide__hero-description">${escapeHtml(slide.description)}</p>
                </div>
              </div>
            </article>
          `;
        }

        return `
          <article class="store-slide">
            <div class="store-slide__inner">
              <div class="store-slide__copy">
                <div class="chip"><i class="fas fa-rocket"></i>${escapeHtml(slide.accent)}</div>
                <div class="mini-meta uppercase tracking-[0.18em] mt-5">${escapeHtml(slide.badge)}</div>
                <h3 class="store-slide__product-title">${escapeHtml(slide.title)}</h3>
                <p class="store-slide__product-description">${escapeHtml(slide.description)}</p>
                <div class="store-slide__footer">
                  <div>
                    <div class="mini-meta">A partir de</div>
                    <div class="text-3xl font-bold">${escapeHtml(slide.price)}</div>
                  </div>
                  <a
                    class="primary-btn store-slide__cta"
                    href="${escapeHtml(slide.href)}"
                    data-slide-link="true"
                    data-slide-href="${escapeHtml(slide.href)}"
                    draggable="false">
                    <i class="fas fa-bolt"></i>Ver oferta
                  </a>
                </div>
              </div>
              <a
                class="store-slide__media"
                href="${escapeHtml(slide.href)}"
                data-slide-link="true"
                data-slide-href="${escapeHtml(slide.href)}"
                draggable="false"
                aria-label="Abrir ${escapeHtml(slide.title)}">
                <span class="store-slide__media-frame">
                  <img src="${escapeHtml(slide.image)}" alt="${escapeHtml(slide.title)}" decoding="async" draggable="false">
                </span>
              </a>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;

  qsa('[data-slide-link="true"]', track).forEach((link) => {
    link.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    link.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.sliderDrag.active || Date.now() < state.sliderPreventClickUntil) {
        event.preventDefault();
        return;
      }

      const href = link.dataset.slideHref || link.getAttribute('href');
      if (!href) return;
      event.preventDefault();
      window.location.assign(href);
    });
  });

  renderSliderDots();
  syncSliderPosition();
}

function restartSliderTimer() {
  window.clearInterval(state.sliderTimer);
  if (sliderCount() <= 1) return;
  state.sliderTimer = window.setInterval(() => {
    goToSlide(state.sliderIndex + 1);
  }, 5200);
}

function bindSliderDrag() {
  const track = qs('#slider-track');
  if (!track || track.dataset.dragBound === 'true') return;
  track.dataset.dragBound = 'true';

  const handlePointerDown = (event) => {
    if (sliderCount() <= 1) return;
    if (event.target?.closest?.('[data-slide-link="true"], a, button')) return;
    state.sliderDrag.active = true;
    state.sliderDrag.startX = event.clientX;
    state.sliderDrag.deltaX = 0;
    state.sliderDrag.width = track.getBoundingClientRect().width;
    track.classList.add('is-pointer-down');
    track.setPointerCapture?.(event.pointerId);
    window.clearInterval(state.sliderTimer);
  };

  const handlePointerMove = (event) => {
    if (!state.sliderDrag.active) return;
    state.sliderDrag.deltaX = event.clientX - state.sliderDrag.startX;
    syncSliderPosition({ animate: false });
  };

  const handlePointerUp = (event) => {
    if (!state.sliderDrag.active) return;

    const threshold = Math.min(140, Math.max(60, state.sliderDrag.width * 0.12));
    const movedEnough = Math.abs(state.sliderDrag.deltaX) > 8;
    const shouldAdvance = Math.abs(state.sliderDrag.deltaX) > threshold;

    if (shouldAdvance) {
      goToSlide(state.sliderIndex + (state.sliderDrag.deltaX < 0 ? 1 : -1));
      state.sliderPreventClickUntil = Date.now() + 250;
    } else {
      state.sliderDrag.deltaX = 0;
      syncSliderPosition();
      if (movedEnough) state.sliderPreventClickUntil = Date.now() + 180;
    }

    state.sliderDrag.active = false;
    state.sliderDrag.deltaX = 0;
    track.classList.remove('is-pointer-down');
    if (track.hasPointerCapture?.(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
    restartSliderTimer();
  };

  track.addEventListener('pointerdown', handlePointerDown);
  track.addEventListener('pointermove', handlePointerMove);
  track.addEventListener('pointerup', handlePointerUp);
  track.addEventListener('pointercancel', handlePointerUp);
  track.addEventListener('pointerleave', handlePointerUp);
  track.addEventListener('click', (event) => {
    if (Date.now() < state.sliderPreventClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

function skeletonCard() {
  return `
    <article class="product-card product-card--skeleton" aria-hidden="true">
      <div class="product-card__image product-card__image--skeleton skeleton-block"></div>
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="skeleton-block h-4 w-24 rounded-full"></div>
          <div class="skeleton-block h-7 w-28 rounded-full"></div>
        </div>
        <div class="space-y-3">
          <div class="skeleton-block h-6 w-4/5 rounded-xl"></div>
          <div class="skeleton-block h-4 w-3/5 rounded-xl"></div>
        </div>
        <div class="space-y-2">
          <div class="skeleton-block h-4 w-full rounded-xl"></div>
          <div class="skeleton-block h-4 w-11/12 rounded-xl"></div>
          <div class="skeleton-block h-4 w-2/3 rounded-xl"></div>
        </div>
        <div class="flex items-end justify-between gap-4">
          <div class="space-y-2">
            <div class="skeleton-block h-4 w-16 rounded-xl"></div>
            <div class="skeleton-block h-8 w-28 rounded-xl"></div>
          </div>
          <div class="skeleton-block h-11 w-28 rounded-2xl"></div>
        </div>
      </div>
    </article>
  `;
}

function setCatalogLoading() {
  const grid = qs('#products-grid');
  const count = qs('#catalog-count');
  if (count) count.textContent = 'Atualizando catálogo...';
  if (grid) {
    grid.innerHTML = Array.from({ length: state.filters.limit }, skeletonCard).join('');
  }
}

function productCard(product) {
  const safeId = encodeURIComponent(product.id);
  const safeName = escapeHtml(product.name);
  const safeImage = escapeHtml(product.image || '');
  const safeBrand = escapeHtml(product.brand || 'GusTech');
  const safeDescription = escapeHtml(product.description || 'Produto premium com curadoria GusTech.');
  const safeCategory = escapeHtml(formatCategoryLabel(product.category));
  const hasDiscount = Number(product.oldPrice || 0) > Number(product.price || 0);
  const discount = hasDiscount
    ? Math.round(((Number(product.oldPrice) - Number(product.price)) / Number(product.oldPrice)) * 100)
    : 0;
  const wished = state.wishlist.has(product.id);
  const bestSeller = topSellerLabel(product.id);
  const showReviews = hasRealReviews(product.reviews);
  const ratingText = formatReviewSummary(product.rating || 0, product.reviews || 0);

  return `
    <article class="product-card">
      <div class="relative">
        <a class="media-link" href="produto.html?id=${safeId}" aria-label="Abrir ${safeName}">
          <img
            class="product-card__image"
            src="${safeImage}"
            alt="${safeName}"
            loading="lazy"
            decoding="async">
        </a>
        <div class="absolute inset-x-0 top-0 flex items-start justify-between p-4 gap-3">
          <span class="chip">${safeCategory}</span>
          <button class="secondary-btn !rounded-full !p-3 wishlist-toggle ${wished ? 'text-red-300' : 'text-white'}" data-id="${escapeHtml(product.id)}" aria-label="Favoritar ${safeName}">
            <i class="fas fa-heart"></i>
          </button>
        </div>
        ${discount > 0 ? `<div class="absolute left-4 bottom-4 chip">-${discount}%</div>` : ''}
      </div>
      <div class="p-5 space-y-4">
        <div class="mini-meta flex items-center justify-between gap-3">
          <span>${safeBrand}</span>
          <span class="status-pill ${Number(product.stock || 0) > 0 ? 'status-pill--ok' : 'status-pill--warn'}">
            ${Number(product.stock || 0) > 0 ? `${product.stock} em estoque` : 'Sem estoque'}
          </span>
        </div>
        <div>
          <a class="block text-xl font-display font-bold text-white hover:text-blue-300 transition-colors" href="produto.html?id=${safeId}">
            ${safeName}
          </a>
          <div class="mini-meta mt-2 flex items-center gap-2 flex-wrap">
            ${showReviews ? `<span class="flex gap-1">${stars(product.rating || 0)}</span>` : ''}
            <span>${ratingText}</span>
            ${bestSeller ? `<span class="status-pill status-pill--ok">${escapeHtml(bestSeller)}</span>` : ''}
          </div>
        </div>
        <p class="text-sm text-gray-400 line-clamp-3">${safeDescription}</p>
        <div class="product-card__footer">
          <div class="product-card__price">
            ${hasDiscount ? `<div class="mini-meta line-through">${escapeHtml(currency(product.oldPrice))}</div>` : ''}
            <div class="text-2xl font-bold text-white">${escapeHtml(currency(product.price))}</div>
          </div>
          <div class="product-card__actions">
            <button class="primary-btn add-cart-btn" data-id="${escapeHtml(product.id)}">Comprar</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const grid = qs('#products-grid');
  const count = qs('#catalog-count');
  if (!grid || !count) return;

  count.textContent = `${state.pagination.total} produtos encontrados`;
  grid.innerHTML = state.products.length
    ? state.products.map(productCard).join('')
    : `
      <div class="empty-state md:col-span-2 xl:col-span-4">
        <h3 class="text-2xl font-display font-bold mb-3">Nada encontrado por aqui</h3>
        <p class="text-gray-400">Ajuste busca, preço ou categoria para ampliar os resultados.</p>
      </div>
    `;

  qsa('.add-cart-btn', grid).forEach((button) => {
    button.addEventListener('click', async () => {
      const product = state.products.find((item) => item.id === button.dataset.id);
      if (!product) return;

      try {
        await addToCart({
          productId: product.id,
          name: product.name,
          image: product.image,
          price: product.price,
          oldPrice: product.oldPrice,
          quantity: 1
        });
        toast('Produto adicionado ao carrinho.', 'success');
      } catch (error) {
        toast(error.message || 'Não foi possível adicionar ao carrinho.', 'error');
      }
    });
  });

  qsa('.wishlist-toggle', grid).forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const user = await getCurrentUser();
        if (!user || user.isAnonymous) {
          toast('Entre na conta para usar sua wishlist.', 'error');
          window.setTimeout(() => {
            window.location.href = 'conta.html?next=index.html';
          }, 500);
          return;
        }

        const result = await toggleWishlist(button.dataset.id);
        if (result.saved) state.wishlist.add(button.dataset.id);
        else state.wishlist.delete(button.dataset.id);
        renderProducts();
      } catch (error) {
        toast(error.message || 'Falha ao atualizar wishlist.', 'error');
      }
    });
  });
}

function renderPagination() {
  qsa('[data-catalog-pagination-info]').forEach((info) => {
    info.textContent = `Página ${state.pagination.page} de ${state.pagination.totalPages} | ${state.pagination.total} produtos no total`;
  });

  qsa('[data-catalog-prev-btn]').forEach((button) => {
    button.disabled = !state.pagination.hasPreviousPage;
  });

  qsa('[data-catalog-next-btn]').forEach((button) => {
    button.disabled = !state.pagination.hasNextPage;
  });
}

function renderCatalogError(message) {
  const grid = qs('#products-grid');
  const count = qs('#catalog-count');

  if (count) count.textContent = 'Falha ao carregar';
  if (grid) {
    grid.innerHTML = `
      <div class="feedback-card md:col-span-2 xl:col-span-4">
        ${escapeHtml(message || 'Não foi possível carregar o catálogo.')}
      </div>
    `;
  }
}

async function loadTopSellerRanks() {
  const response = await loadCatalog({ sort: 'best_sellers', page: 1, limit: 5 });
  state.topSellerRanks = new Map((response.products || []).map((product, index) => [product.id, index + 1]));
}

async function loadHomeConfig() {
  try {
    const response = await api('/storefront/home');
    const config = response.config || {};
    state.homeConfig = {
      headerCategories: Array.isArray(config.headerCategories) && config.headerCategories.length
        ? config.headerCategories.map((category) => String(category || '').trim().toLowerCase()).filter(Boolean)
        : [...DEFAULT_HEADER_CATEGORY_ORDER],
      productSlides: Array.isArray(config.productSlides)
        ? config.productSlides.filter((slide) => slide?.product?.id)
        : []
    };
  } catch {
    state.homeConfig = {
      headerCategories: [...DEFAULT_HEADER_CATEGORY_ORDER],
      productSlides: []
    };
  }
}

async function refreshCatalog({ showSkeleton = true } = {}) {
  pushFilterStateToUrl();

  state.catalogRequestId += 1;
  const requestId = state.catalogRequestId;

  state.catalogAbortController?.abort();
  state.catalogAbortController = new AbortController();

  if (showSkeleton) setCatalogLoading();

  try {
    const response = await loadCatalog(state.filters, { signal: state.catalogAbortController.signal });
    if (requestId !== state.catalogRequestId) return;

    state.products = response.products || [];
    state.pagination = response.pagination || state.pagination;
    renderCategories(state.categories);
    renderProducts();
    renderSlider();
    restartSliderTimer();
    renderPagination();
  } catch (error) {
    if (requestId !== state.catalogRequestId || /cancelad/i.test(String(error?.message || ''))) return;
    renderCatalogError(error.message);
  }
}

async function bootstrap() {
  syncFilterControls();
  bindSliderDrag();

  qs('#search-input')?.addEventListener('input', (event) => {
    state.filters.search = event.target.value.trim();
    state.filters.page = 1;
    debouncedCatalogRefresh();
  });

  qs('#category-select')?.addEventListener('change', (event) => {
    applyCategoryFilter(event.target.value);
  });

  qs('#price-min')?.addEventListener('change', (event) => {
    state.filters.minPrice = event.target.value;
    state.filters.page = 1;
    refreshCatalog();
  });

  qs('#price-max')?.addEventListener('change', (event) => {
    state.filters.maxPrice = event.target.value;
    state.filters.page = 1;
    refreshCatalog();
  });

  qs('#sort-select')?.addEventListener('change', (event) => {
    state.filters.sort = event.target.value;
    state.filters.page = 1;
    refreshCatalog({ showSkeleton: false });
  });

  qsa('[data-catalog-prev-btn]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.pagination.hasPreviousPage) return;
      state.filters.page = Math.max(state.filters.page - 1, 1);
      refreshCatalog({ showSkeleton: false });
    });
  });

  qsa('[data-catalog-next-btn]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.pagination.hasNextPage) return;
      state.filters.page += 1;
      refreshCatalog({ showSkeleton: false });
    });
  });

  qs('#slider-prev-btn')?.addEventListener('click', () => {
    if (!sliderCount()) return;
    goToSlide(state.sliderIndex - 1);
    restartSliderTimer();
  });

  qs('#slider-next-btn')?.addEventListener('click', () => {
    if (!sliderCount()) return;
    goToSlide(state.sliderIndex + 1);
    restartSliderTimer();
  });

  const [categories] = await Promise.all([
    loadCategories().catch(() => []),
    loadTopSellerRanks().catch(() => {
      state.topSellerRanks = new Map();
    }),
    loadHomeConfig()
  ]);

  state.categories = categories;
  renderCategories(categories);
  syncFilterControls();
  await refreshCatalog();
  renderProducts();

  try {
    const wishlist = await loadWishlist();
    state.wishlist = new Set(wishlist.map((item) => item.productId));
    renderProducts();
  } catch {
    state.wishlist = new Set();
  }

  auth.onAuthStateChanged(() => updateAuthLink());
  updateAuthLink();
}

bootstrap().catch((error) => {
  renderCatalogError(error.message || 'Não foi possível carregar o catálogo.');
});
