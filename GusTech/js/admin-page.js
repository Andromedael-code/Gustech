import { auth } from './firebase-app.js';
import { api, escapeHtml, qs, qsa, toast } from './storefront-core.js';
import { formatCategoryLabel } from './storefront-formatters.js';

const DEFAULT_HOME_CATEGORIES = ['playstation', 'xbox', 'consoles', 'classicos', 'monitores', 'nintendo', 'raridades', 'perifericos'];
const PRODUCT_CATEGORY_OPTIONS = ['consoles', 'playstation', 'xbox', 'nintendo', 'perifericos', 'classicos', 'raridades', 'combos', 'monitores'];

const state = {
  products: [],
  stats: { totalProducts: 0, activeProducts: 0, activeStock: 0, activeCategories: 0 },
  editingId: null,
  mainImage: null,
  gallery: [],
  productCategories: ['consoles'],
  productCategoryQuery: '',
  productCategoryDropdownOpen: false,
  filters: { search: '', page: 1, limit: 10 },
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  activeTab: 'products',
  homeConfig: {
    productSlides: [],
    headerCategories: [...DEFAULT_HOME_CATEGORIES]
  },
  homeOptions: {
    productOptions: [],
    availableCategories: [...DEFAULT_HOME_CATEGORIES]
  },
  homeSlideSearch: {},
  orders: [], // feat: FEATURE-1
  ordersFilters: { status: '', page: 1, limit: 15 }, // feat: FEATURE-1
  ordersPagination: { page: 1, limit: 15, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false }, // feat: FEATURE-1
  selectedOrder: null, // feat: FEATURE-1
  reviewsProductFilter: '', // feat: FEATURE-2
  loadedAdminUid: null
};

function setFeedback(message, type = 'info') {
  const node = qs('#products-feedback');
  if (!node) return;
  node.textContent = message;
  node.className = `mini-meta${type === 'error' ? ' text-red-300' : type === 'success' ? ' text-emerald-300' : ''}`;
}

function readLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSpecs(value) {
  return readLines(value)
    .map((line) => {
      const [label, ...rest] = line.split(':');
      return { label: String(label || '').trim(), value: rest.join(':').trim() };
    })
    .filter((item) => item.label && item.value);
}

function parseVariants(value) {
  return readLines(value)
    .map((line) => {
      const [name, ...rest] = line.split(':');
      const options = rest.join(':').split(',').map((item) => item.trim()).filter(Boolean);
      return { name: String(name || '').trim(), options };
    })
    .filter((item) => item.name);
}

function resetFileInputs() {
  const mainInput = qs('#product-image-file');
  const galleryInput = qs('#product-gallery-files');
  if (mainInput) mainInput.value = '';
  if (galleryInput) galleryInput.value = '';
}

function normalizeProductCategories(categories = []) {
  const unique = Array.from(new Set(
    (Array.isArray(categories) ? categories : [])
      .map((category) => String(category || '').trim().toLowerCase())
      .filter((category) => PRODUCT_CATEGORY_OPTIONS.includes(category))
  ));

  return unique.length ? unique : ['consoles'];
}

function filteredProductCategoryOptions() {
  const query = String(state.productCategoryQuery || '').trim().toLowerCase();
  return PRODUCT_CATEGORY_OPTIONS.filter((category) => {
    if (state.productCategories.includes(category)) return false;
    if (!query) return true;

    const label = formatCategoryLabel(category).toLowerCase();
    return category.includes(query) || label.includes(query);
  });
}

function focusCategoryPickerInput() {
  const input = qs('#product-category-search');
  if (!input) return;
  input.focus();
  const position = input.value.length;
  input.setSelectionRange(position, position);
}

function addProductCategory(category) {
  if (!PRODUCT_CATEGORY_OPTIONS.includes(category) || state.productCategories.includes(category)) return;
  state.productCategories = [...state.productCategories, category];
  state.productCategoryQuery = '';
  state.productCategoryDropdownOpen = false;
  renderProductCategoryPicker();
  focusCategoryPickerInput();
}

function removeProductCategory(category) {
  state.productCategories = state.productCategories.filter((item) => item !== category);
  state.productCategoryDropdownOpen = false;
  renderProductCategoryPicker();
  focusCategoryPickerInput();
}

function bindProductCategoryPickerEvents() {
  const input = qs('#product-category-search');
  if (input) {
    input.addEventListener('focus', () => {
      if (state.productCategoryDropdownOpen) return;
      state.productCategoryDropdownOpen = true;
      renderProductCategoryPicker();
      focusCategoryPickerInput();
    });

    input.addEventListener('input', () => {
      state.productCategoryQuery = input.value;
      state.productCategoryDropdownOpen = true;
      renderProductCategoryPicker();
      focusCategoryPickerInput();
    });

    input.addEventListener('keydown', (event) => {
      const matches = filteredProductCategoryOptions();

      if (event.key === 'Backspace' && !state.productCategoryQuery && state.productCategories.length) {
        event.preventDefault();
        removeProductCategory(state.productCategories[state.productCategories.length - 1]);
        return;
      }

      if (event.key === 'Enter' && matches.length) {
        event.preventDefault();
        addProductCategory(matches[0]);
        return;
      }

      if (event.key === 'Escape') {
        state.productCategoryDropdownOpen = false;
        renderProductCategoryPicker();
      }
    });
  }

  qsa('[data-product-category-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      removeProductCategory(String(button.dataset.productCategoryRemove || ''));
    });
  });

  qsa('[data-product-category-pick]').forEach((button) => {
    button.addEventListener('click', () => {
      addProductCategory(String(button.dataset.productCategoryPick || ''));
    });
  });
}

function renderProductCategoryPicker(selectedCategories = null) {
  const root = qs('#product-categories-field');
  if (!root) return;

  if (Array.isArray(selectedCategories)) {
    state.productCategories = normalizeProductCategories(selectedCategories);
    state.productCategoryQuery = '';
    state.productCategoryDropdownOpen = false;
  }

  const matches = filteredProductCategoryOptions();
  const showResults = state.productCategoryDropdownOpen && (matches.length || state.productCategoryQuery);

  root.innerHTML = `
    <div class="admin-category-picker__shell ${state.productCategoryDropdownOpen ? 'is-focused' : ''}">
      <div class="admin-category-picker__tokens">
        ${state.productCategories.map((category) => `
          <button
            class="admin-category-chip"
            type="button"
            data-product-category-remove="${escapeHtml(category)}"
            aria-label="Remover ${escapeHtml(formatCategoryLabel(category))}">
            <span>${escapeHtml(formatCategoryLabel(category))}</span>
            <i class="fas fa-xmark"></i>
          </button>
        `).join('')}
        <input
          id="product-category-search"
          class="admin-category-picker__input"
          type="search"
          value="${escapeHtml(state.productCategoryQuery)}"
          placeholder="${state.productCategories.length ? 'Buscar outra categoria' : 'Buscar e adicionar categorias'}"
          aria-label="Buscar categoria do produto"
          autocomplete="off">
      </div>
    </div>
    ${showResults ? `
      <div class="admin-category-picker__results">
        ${matches.length ? matches.map((category) => `
          <button
            class="admin-category-picker__result"
            type="button"
            data-product-category-pick="${escapeHtml(category)}">
            <span>${escapeHtml(formatCategoryLabel(category))}</span>
            <small>${escapeHtml(category)}</small>
          </button>
        `).join('') : '<div class="admin-category-picker__empty">Nenhuma categoria encontrada.</div>'}
      </div>
    ` : ''}
  `;

  bindProductCategoryPickerEvents();
}

function statValue(selector, value) {
  const node = qs(selector);
  if (node) node.textContent = String(value);
}

function updateStats() {
  statValue('#stat-products', state.stats.totalProducts);
  statValue('#stat-active', state.stats.activeProducts);
  statValue('#stat-stock', state.stats.activeStock);
  statValue('#stat-categories', state.stats.activeCategories);
}

function previewCard(asset, index, kind) {
  return `
    <article class="preview-card">
      <img src="${escapeHtml(asset.preview || asset.url || '')}" alt="Preview ${index + 1}">
      <button class="preview-card__remove" type="button" data-kind="${kind}" data-index="${index}" aria-label="Remover imagem">
        <i class="fas fa-xmark"></i>
      </button>
      <div class="preview-card__meta">${escapeHtml(asset.name || (kind === 'main' ? 'Imagem principal' : `Galeria ${index + 1}`))}</div>
    </article>
  `;
}

function bindPreviewActions() {
  qsa('.preview-card__remove').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index || 0);
      if (button.dataset.kind === 'main') {
        state.mainImage = null;
        renderMediaPreviews();
        return;
      }
      state.gallery.splice(index, 1);
      renderMediaPreviews();
    });
  });
}

function renderMediaPreviews() {
  const mainRoot = qs('#main-image-preview');
  const galleryRoot = qs('#gallery-preview');
  if (mainRoot) {
    mainRoot.innerHTML = state.mainImage
      ? previewCard(state.mainImage, 0, 'main')
      : '<div class="mini-meta">Nenhuma imagem principal selecionada.</div>';
  }
  if (galleryRoot) {
    galleryRoot.innerHTML = state.gallery.length
      ? state.gallery.map((asset, index) => previewCard(asset, index, 'gallery')).join('')
      : '<div class="mini-meta">Nenhuma imagem na galeria.</div>';
  }
  bindPreviewActions();
}

function createRemoteAsset(url, fallbackName = 'Imagem salva') {
  return url ? { kind: 'remote', url, preview: url, name: fallbackName } : null;
}

function fillForm(product = null) {
  state.editingId = product?.id || null;
  qs('#form-title').textContent = product ? `Editando ${product.name}` : 'Cadastrar produto';
  qs('#product-id').value = product?.id || '';
  qs('#product-brand').value = product?.brand || '';
  qs('#product-name').value = product?.name || '';
  renderProductCategoryPicker(product?.categories || [product?.category || 'consoles']);
  qs('#product-condition').value = product?.condition || 'Novo';
  qs('#product-price').value = product?.price ?? '';
  qs('#product-old-price').value = product?.oldPrice ?? '';
  qs('#product-stock').value = product?.stock ?? 0;
  qs('#product-relevance').value = product?.relevanceScore ?? 0;
  qs('#product-description').value = product?.description || '';
  qs('#product-specs').value = (product?.specs || []).map((item) => `${item.label}: ${item.value}`).join('\n');
  qs('#product-variants').value = (product?.variants || []).map((item) => `${item.name}: ${(item.options || []).join(', ')}`).join('\n');
  qs('#is-active').checked = product ? Boolean(product.isActive) : true;

  state.mainImage = createRemoteAsset(product?.image || '', 'Imagem principal');
  state.gallery = (product?.gallery || []).map((url, index) => createRemoteAsset(url, `Galeria ${index + 1}`)).filter(Boolean);
  resetFileInputs();
  renderMediaPreviews();
}

function formToPayload() {
  const categories = normalizeProductCategories(state.productCategories);
  return {
    id: qs('#product-id').value.trim(),
    brand: qs('#product-brand').value.trim(),
    name: qs('#product-name').value.trim(),
    category: categories[0] || 'consoles',
    categories,
    condition: qs('#product-condition').value.trim(),
    price: Number(qs('#product-price').value || 0),
    oldPrice: Number(qs('#product-old-price').value || 0),
    stock: Number(qs('#product-stock').value || 0),
    relevanceScore: Number(qs('#product-relevance').value || 0),
    description: qs('#product-description').value.trim(),
    specs: parseSpecs(qs('#product-specs').value),
    variants: parseVariants(qs('#product-variants').value),
    isActive: qs('#is-active').checked
  };
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

async function uploadAsset(asset) {
  if (!asset) return '';
  if (asset.kind === 'remote') return asset.url;

  const dataUrl = await readFileAsDataUrl(asset.file);
  const response = await api('/products/upload-image', {
    method: 'POST',
    body: JSON.stringify({ dataUrl, filename: asset.file.name })
  });
  return response.url;
}

async function prepareMediaPayload() {
  const image = await uploadAsset(state.mainImage);
  const gallery = [];
  for (const asset of state.gallery) {
    const uploadedUrl = await uploadAsset(asset);
    if (uploadedUrl) gallery.push(uploadedUrl);
  }
  return { image, gallery };
}

async function handleMainImageSelection(event) {
  const [file] = Array.from(event.target.files || []);
  if (!file) return;
  state.mainImage = {
    kind: 'local',
    file,
    preview: await readFileAsDataUrl(file),
    name: file.name
  };
  renderMediaPreviews();
}

async function handleGallerySelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const assets = await Promise.all(files.map(async (file) => ({
    kind: 'local',
    file,
    preview: await readFileAsDataUrl(file),
    name: file.name
  })));
  state.gallery.push(...assets);
  resetFileInputs();
  renderMediaPreviews();
}

function productRow(product) {
  return `
    <tr class="border-b border-white/10">
      <td class="px-4 py-5 align-middle">
        <div class="admin-product-cell">
          <img src="${escapeHtml(product.image || '')}" alt="${escapeHtml(product.name)}" class="admin-product-thumb">
          <div class="min-w-0">
            <div class="admin-product-name">${escapeHtml(product.name)}</div>
            <div class="admin-product-meta">${escapeHtml(product.brand || 'GusTech')} | ${escapeHtml((product.categories || [product.category]).map((category) => formatCategoryLabel(category)).join(', '))}</div>
            <div class="admin-product-id">${escapeHtml(product.id || '')}</div>
          </div>
        </div>
      </td>
      <td class="px-4 py-5 align-middle">
        <div class="admin-price-cell">R$ ${Number(product.price || 0).toFixed(2).replace('.', ',')}</div>
      </td>
      <td class="px-4 py-5 align-middle admin-compact-cell">
        ${Number(product.stock || 0) <= 3
          ? `<span class="font-bold text-red-400" title="Estoque baixo">${Number(product.stock || 0)} &#9888;</span>` // feat: FEATURE-3
          : Number(product.stock || 0)
        }
      </td>
      <td class="px-4 py-5 align-middle">
        <div class="admin-actions-cell">
          <span class="admin-status-cell">${product.isActive ? 'Ativo' : 'Inativo'}</span>
          <button class="secondary-btn admin-icon-btn edit-product" data-id="${product.id}" aria-label="Editar ${escapeHtml(product.name)}"><i class="fas fa-pen"></i></button>
          <button class="danger-btn admin-icon-btn delete-product" data-id="${product.id}" aria-label="Excluir ${escapeHtml(product.name)}"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `;
}

function renderProducts() {
  const tbody = qs('#products-tbody');
  if (!tbody) return;
  tbody.innerHTML = state.products.length
    ? state.products.map(productRow).join('')
    : '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Nenhum produto encontrado.</td></tr>';

  qs('#product-count').textContent = `${state.pagination.total} produtos`;
  updateStats();

  qsa('.edit-product', tbody).forEach((button) => {
    button.addEventListener('click', () => {
      const product = state.products.find((item) => item.id === button.dataset.id);
      fillForm(product || null);
      setActiveTab('products');
      qs('#product-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  qsa('.delete-product', tbody).forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Remover este produto do catalogo?')) return;
      try {
        await api(`/products/${button.dataset.id}`, { method: 'DELETE' });
        toast('Produto removido com sucesso.', 'success');
        await Promise.all([loadProducts(), loadHomeConfig()]);
      } catch (error) {
        toast(error.message || 'Nao foi possivel remover o produto.', 'error');
      }
    });
  });
}

function renderPagination() {
  qsa('[data-admin-pagination-info]').forEach((info) => {
    info.textContent = `Pagina ${state.pagination.page} de ${state.pagination.totalPages} | ${state.pagination.total} produtos no total`;
  });

  qsa('[data-admin-prev-btn]').forEach((button) => {
    button.disabled = !state.pagination.hasPreviousPage;
  });

  qsa('[data-admin-next-btn]').forEach((button) => {
    button.disabled = !state.pagination.hasNextPage;
  });
}

async function loadProducts() {
  setFeedback('Carregando produtos...');
  try {
    const query = new URLSearchParams({
      page: String(state.filters.page),
      limit: String(state.filters.limit)
    });
    if (state.filters.search) query.set('search', state.filters.search);
    const response = await api(`/products/admin/all?${query.toString()}`);
    state.products = Array.isArray(response.products) ? response.products : [];
    state.pagination = response.pagination || state.pagination;
    state.stats = response.stats || state.stats;
    renderProducts();
    renderPagination();
    setFeedback('Catalogo carregado com sucesso.', 'success');
  } catch (error) {
    state.products = [];
    state.stats = { totalProducts: 0, activeProducts: 0, activeStock: 0, activeCategories: 0 };
    renderProducts();
    renderPagination();
    setFeedback(error.message || 'Nao foi possivel carregar os produtos do admin.', 'error');
    throw error;
  }
}

async function submitProduct(event) {
  event.preventDefault();

  try {
    const payload = formToPayload();
    const media = await prepareMediaPayload();
    payload.image = media.image;
    payload.gallery = media.gallery;

    if (!payload.name) {
      toast('Informe o nome do produto.', 'error');
      return;
    }

    if (!payload.image) {
      toast('Selecione ou mantenha uma imagem principal para o produto.', 'error');
      return;
    }

    if (state.editingId) {
      await api(`/products/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Produto atualizado com sucesso.', 'success');
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      toast('Produto criado com sucesso.', 'success');
    }

    fillForm(null);
    await Promise.all([loadProducts(), loadHomeConfig()]);
  } catch (error) {
    toast(error.message || 'Nao foi possivel salvar o produto.', 'error');
  }
}

function setLoggedIn(isLoggedIn) {
  qs('#login-card')?.classList.toggle('hidden', isLoggedIn);
  qs('#admin-panel')?.classList.toggle('hidden', !isLoggedIn);
}

function normalizeConfigSlide(slide = {}, index = 0) {
  return {
    id: String(slide.id || `slide-${Date.now()}-${index + 1}`),
    productId: String(slide.productId || '').trim(),
    accent: String(slide.accent || (index === 0 ? 'Oferta em destaque' : 'Selecao gamer')).trim()
  };
}

function normalizeConfigCategory(category = '') {
  const fallback = state.homeOptions.availableCategories[0] || 'playstation';
  return String(category || fallback).trim() || fallback;
}

function categoryOptionMarkup(selectedCategory = '') {
  return state.homeOptions.availableCategories.map((category) => `
    <option value="${escapeHtml(category)}" ${selectedCategory === category ? 'selected' : ''}>
      ${escapeHtml(formatCategoryLabel(category))}
    </option>
  `).join('');
}

function getProductOptionById(productId = '') {
  return state.homeOptions.productOptions.find((product) => product.id === productId) || null;
}

function formatProductOptionLabel(product) {
  if (!product) return 'Nenhum produto selecionado';
  return `${product.name} · ${product.id}${product.isActive ? '' : ' · inativo'}`;
}

function getSlideSearchValue(slide) {
  return state.homeSlideSearch[slide.id] || '';
}

function findSlideProductMatches(query = '', currentProductId = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];

  return state.homeOptions.productOptions
    .filter((product) => {
      const haystack = `${String(product.name || '').toLowerCase()} ${String(product.id || '').toLowerCase()}`;
      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) => {
      const aSelected = a.id === currentProductId ? -1 : 0;
      const bSelected = b.id === currentProductId ? -1 : 0;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    })
    .slice(0, 6);
}

function homeSlideSearchResultsMarkup(slide, index) {
  const matches = findSlideProductMatches(getSlideSearchValue(slide), slide.productId);
  if (!getSlideSearchValue(slide)) return '';

  return `
    <div class="admin-search-results" data-home-slide-results="${index}">
      ${matches.length
        ? matches.map((product) => `
          <button
            class="admin-search-result"
            type="button"
            data-home-slide-pick="${index}"
            data-product-id="${escapeHtml(product.id)}">
            <span>${escapeHtml(product.name)}</span>
            <span class="admin-search-result__meta">${escapeHtml(product.id)} · ${escapeHtml(formatCategoryLabel(product.category))}</span>
          </button>
        `).join('')
        : '<div class="admin-search-result admin-search-result--empty">Nenhum produto encontrado.</div>'}
    </div>
  `;
}

function renderHomeSlides() {
  const root = qs('#home-slides-list');
  if (!root) return;

  root.innerHTML = state.homeConfig.productSlides.length
    ? state.homeConfig.productSlides.map((slide, index) => `
      <article class="admin-config-row" data-slide-index="${index}">
        <div class="admin-config-row__main">
          <div class="admin-config-row__label">Slide ${index + 1}</div>
          <div class="admin-config-selection">${escapeHtml(formatProductOptionLabel(getProductOptionById(slide.productId)))}</div>
          <div class="admin-config-search">
            <input
              class="store-input"
              type="search"
              value="${escapeHtml(getSlideSearchValue(slide))}"
              placeholder="Buscar produto por nome ou ID"
              autocomplete="off"
              data-home-slide-search="${index}">
            ${homeSlideSearchResultsMarkup(slide, index)}
          </div>
          <input
            class="store-input"
            type="text"
            value="${escapeHtml(slide.accent || '')}"
            maxlength="60"
            placeholder="Texto do selo do slide"
            data-home-slide-accent="${index}">
        </div>
        <div class="admin-config-row__actions">
          <button class="secondary-btn admin-icon-btn" type="button" data-home-slide-move="up" data-index="${index}" aria-label="Subir slide"><i class="fas fa-arrow-up"></i></button>
          <button class="secondary-btn admin-icon-btn" type="button" data-home-slide-move="down" data-index="${index}" aria-label="Descer slide"><i class="fas fa-arrow-down"></i></button>
          <button class="danger-btn admin-icon-btn" type="button" data-home-slide-remove="${index}" aria-label="Remover slide"><i class="fas fa-trash"></i></button>
        </div>
      </article>
    `).join('')
    : '<div class="admin-config-empty">Nenhum slide de produto configurado.</div>';
}

function renderHomeCategories() {
  const root = qs('#home-categories-list');
  if (!root) return;

  root.innerHTML = state.homeConfig.headerCategories.length
    ? state.homeConfig.headerCategories.map((category, index) => `
      <article class="admin-config-row" data-category-index="${index}">
        <div class="admin-config-row__main">
          <div class="admin-config-row__label">Categoria ${index + 1}</div>
          <select class="store-select" data-home-category-select="${index}">
            ${categoryOptionMarkup(category)}
          </select>
        </div>
        <div class="admin-config-row__actions">
          <button class="secondary-btn admin-icon-btn" type="button" data-home-category-move="up" data-index="${index}" aria-label="Subir categoria"><i class="fas fa-arrow-up"></i></button>
          <button class="secondary-btn admin-icon-btn" type="button" data-home-category-move="down" data-index="${index}" aria-label="Descer categoria"><i class="fas fa-arrow-down"></i></button>
          <button class="danger-btn admin-icon-btn" type="button" data-home-category-remove="${index}" aria-label="Remover categoria"><i class="fas fa-trash"></i></button>
        </div>
      </article>
    `).join('')
    : '<div class="admin-config-empty">Nenhuma categoria configurada para a header.</div>';
}

function moveItem(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return list;
  const clone = [...list];
  const [item] = clone.splice(from, 1);
  clone.splice(to, 0, item);
  return clone;
}

function addHomeSlide() {
  const fallbackProductId = state.homeOptions.productOptions[0]?.id || '';
  const slide = {
    id: `slide-${Date.now()}`,
    productId: fallbackProductId,
    accent: state.homeConfig.productSlides.length ? 'Selecao gamer' : 'Oferta em destaque'
  };
  state.homeConfig.productSlides.push(slide);
  state.homeSlideSearch[slide.id] = '';
  renderHomeSlides();
  wireHomeConfigEvents();
}

function addHomeCategory() {
  const available = state.homeOptions.availableCategories.find((category) => !state.homeConfig.headerCategories.includes(category))
    || state.homeOptions.availableCategories[0]
    || 'playstation';
  state.homeConfig.headerCategories.push(available);
  renderHomeCategories();
  wireHomeConfigEvents();
}

function renderHomeConfig() {
  renderHomeSlides();
  renderHomeCategories();
}

function setActiveTab(tab) {
  const validTabs = ['products', 'home', 'orders', 'reviews']; // feat: FEATURE-1
  state.activeTab = validTabs.includes(tab) ? tab : 'products';
  qsa('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminTab === state.activeTab);
  });
  qs('#admin-products-view')?.classList.toggle('hidden', state.activeTab !== 'products');
  qs('#admin-home-view')?.classList.toggle('hidden', state.activeTab !== 'home');
  qs('#admin-orders-view')?.classList.toggle('hidden', state.activeTab !== 'orders'); // feat: FEATURE-1
  qs('#admin-reviews-view')?.classList.toggle('hidden', state.activeTab !== 'reviews'); // feat: FEATURE-2
  if (state.activeTab === 'orders') loadOrders().catch(() => {}); // feat: FEATURE-1
  if (state.activeTab === 'reviews') loadAdminReviews().catch(() => {}); // feat: FEATURE-2
}

async function loadHomeConfig() {
  const response = await api('/storefront/admin/home');
  state.homeOptions.productOptions = Array.isArray(response.productOptions) ? response.productOptions : [];
  state.homeOptions.availableCategories = Array.isArray(response.availableCategories) && response.availableCategories.length
    ? response.availableCategories
    : [...DEFAULT_HOME_CATEGORIES];

  const config = response.config || {};
  state.homeConfig = {
    productSlides: Array.isArray(config.productSlides)
      ? config.productSlides.map((slide, index) => normalizeConfigSlide(slide, index))
      : [],
    headerCategories: Array.isArray(config.headerCategories) && config.headerCategories.length
      ? config.headerCategories.map((category) => normalizeConfigCategory(category))
      : [...DEFAULT_HOME_CATEGORIES]
  };
  state.homeSlideSearch = Object.fromEntries(state.homeConfig.productSlides.map((slide) => [slide.id, '']));

  renderHomeConfig();
  wireHomeConfigEvents();
}

async function saveHomeConfig() {
  try {
    const payload = {
      productSlides: state.homeConfig.productSlides
        .map((slide, index) => normalizeConfigSlide(slide, index))
        .filter((slide) => slide.productId),
      headerCategories: state.homeConfig.headerCategories.map((category) => normalizeConfigCategory(category))
    };

    const response = await api('/storefront/admin/home', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    state.homeConfig = {
      productSlides: Array.isArray(response.config?.productSlides)
        ? response.config.productSlides.map((slide, index) => normalizeConfigSlide(slide, index))
        : [],
      headerCategories: Array.isArray(response.config?.headerCategories) && response.config.headerCategories.length
        ? response.config.headerCategories.map((category) => normalizeConfigCategory(category))
        : [...DEFAULT_HOME_CATEGORIES]
    };
    state.homeSlideSearch = Object.fromEntries(state.homeConfig.productSlides.map((slide) => [slide.id, '']));

    renderHomeConfig();
    wireHomeConfigEvents();
    toast('Configuracao da home salva com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Nao foi possivel salvar a home.', 'error');
  }
}

function wireHomeConfigEvents() {
  qsa('[data-home-slide-search]').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.homeSlideSearch || 0);
      const slide = state.homeConfig.productSlides[index];
      if (!slide) return;
      state.homeSlideSearch[slide.id] = input.value;
      renderHomeSlides();
      wireHomeConfigEvents();
      const refreshed = qs(`[data-home-slide-search="${index}"]`);
      if (refreshed) {
        refreshed.focus();
        refreshed.setSelectionRange(refreshed.value.length, refreshed.value.length);
      }
    });
  });

  qsa('[data-home-slide-accent]').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.homeSlideAccent || 0);
      if (!state.homeConfig.productSlides[index]) return;
      state.homeConfig.productSlides[index].accent = input.value;
    });
  });

  qsa('[data-home-slide-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.homeSlideRemove || 0);
      const slide = state.homeConfig.productSlides[index];
      state.homeConfig.productSlides.splice(index, 1);
      if (slide) delete state.homeSlideSearch[slide.id];
      renderHomeSlides();
      wireHomeConfigEvents();
    });
  });

  qsa('[data-home-slide-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index || 0);
      const direction = button.dataset.homeSlideMove === 'up' ? -1 : 1;
      state.homeConfig.productSlides = moveItem(state.homeConfig.productSlides, index, index + direction);
      renderHomeSlides();
      wireHomeConfigEvents();
    });
  });

  qsa('[data-home-slide-pick]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.homeSlidePick || 0);
      const slide = state.homeConfig.productSlides[index];
      if (!slide) return;
      slide.productId = String(button.dataset.productId || '').trim();
      state.homeSlideSearch[slide.id] = '';
      renderHomeSlides();
      wireHomeConfigEvents();
    });
  });

  qsa('[data-home-category-select]').forEach((select) => {
    select.addEventListener('change', () => {
      const index = Number(select.dataset.homeCategorySelect || 0);
      if (state.homeConfig.headerCategories[index] === undefined) return;
      state.homeConfig.headerCategories[index] = select.value;
    });
  });

  qsa('[data-home-category-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.homeCategoryRemove || 0);
      state.homeConfig.headerCategories.splice(index, 1);
      renderHomeCategories();
      wireHomeConfigEvents();
    });
  });

  qsa('[data-home-category-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index || 0);
      const direction = button.dataset.homeCategoryMove === 'up' ? -1 : 1;
      state.homeConfig.headerCategories = moveItem(state.homeConfig.headerCategories, index, index + direction);
      renderHomeCategories();
      wireHomeConfigEvents();
    });
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const email = qs('#login-email').value.trim();
  const password = qs('#login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
    localStorage.setItem('gustech_user_role', 'admin');
    localStorage.setItem('gustech_session_email', email.toLowerCase());
    setLoggedIn(true);
    await Promise.all([loadProducts(), loadHomeConfig()]);
    toast('Painel administrativo liberado.', 'success');
  } catch (error) {
    toast(error.message || 'Falha ao entrar.', 'error');
  }
}

// Orders admin. // feat: FEATURE-1
const ORDER_STATUS_LABELS = {
  pending: 'Pendente',
  paid: 'Pago',
  processing: 'Em processamento',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado'
};

const ORDER_STATUS_CLASSES = {
  pending: 'status-pill--info',
  paid: 'status-pill--ok',
  processing: 'status-pill--info',
  shipped: 'status-pill--info',
  delivered: 'status-pill--ok',
  cancelled: 'status-pill--warn'
};

function orderStatusPill(status) {
  const label = ORDER_STATUS_LABELS[status] || status;
  const cls = ORDER_STATUS_CLASSES[status] || 'status-pill--info';
  return `<span class="status-pill ${cls}">${escapeHtml(label)}</span>`;
}

function formatOrderDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function orderRow(order) {
  const customer = order.customer || {};
  const total = Number(order.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const orderId = escapeHtml(String(order.id || ''));
  return `
    <tr class="border-b border-white/10">
      <td class="px-4 py-5 align-middle">
        <div class="font-semibold text-white">#${orderId}</div>
        <div class="mini-meta mt-1">${formatOrderDate(order.createdAt)}</div>
      </td>
      <td class="px-4 py-5 align-middle">
        <div class="text-sm font-medium text-white">${escapeHtml(customer.name || '-')}</div>
        <div class="mini-meta">${escapeHtml(customer.email || '-')}</div>
      </td>
      <td class="px-4 py-5 align-middle">
        <div class="font-semibold">${total}</div>
        <div class="mini-meta">${escapeHtml(order.method || '-')}</div>
      </td>
      <td class="px-4 py-5 align-middle">${orderStatusPill(order.status)}</td>
      <td class="px-4 py-5 align-middle text-right">
        <button class="secondary-btn admin-icon-btn view-order-btn" data-order-id="${orderId}" aria-label="Ver pedido ${orderId}">
          <i class="fas fa-eye"></i>
        </button>
      </td>
    </tr>
  `;
}

function renderOrdersList(orders = []) {
  const tbody = qs('#orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = orders.length
    ? orders.map(orderRow).join('')
    : '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Nenhum pedido encontrado.</td></tr>';

  qsa('.view-order-btn', tbody).forEach((button) => {
    button.addEventListener('click', () => {
      const orderId = Number(button.dataset.orderId);
      const order = state.orders.find((item) => Number(item.id) === orderId);
      if (order) showOrderDetail(order);
    });
  });
}

function renderOrdersPagination() {
  const p = state.ordersPagination;
  qsa('[data-orders-pagination-info]').forEach((el) => {
    el.textContent = `Pagina ${p.page} de ${p.totalPages} | ${p.total} pedidos`;
  });
  qsa('[data-orders-prev-btn]').forEach((btn) => { btn.disabled = !p.hasPreviousPage; });
  qsa('[data-orders-next-btn]').forEach((btn) => { btn.disabled = !p.hasNextPage; });
}

async function loadOrders() {
  try {
    const query = new URLSearchParams({ page: String(state.ordersFilters.page), limit: String(state.ordersFilters.limit) });
    if (state.ordersFilters.status) query.set('status', state.ordersFilters.status);
    const response = await api(`/orders?${query.toString()}`); // feat: FEATURE-1
    state.orders = Array.isArray(response.orders) ? response.orders : [];
    state.ordersPagination = response.pagination || state.ordersPagination;
    renderOrdersList(state.orders);
    renderOrdersPagination();
  } catch (error) {
    toast(error.message || 'Nao foi possivel carregar os pedidos.', 'error');
  }
}

function showOrderDetail(order) {
  state.selectedOrder = order;
  const panel = qs('#order-detail-panel');
  if (!panel) return;

  qs('#order-detail-title').textContent = `Pedido #${order.id}`;

  const customer = order.customer || {};
  qs('#order-detail-customer').innerHTML = `
    <div><span class="text-slate-500">Nome:</span> ${escapeHtml(customer.name || '-')}</div>
    <div><span class="text-slate-500">Email:</span> ${escapeHtml(customer.email || '-')}</div>
    <div><span class="text-slate-500">Telefone:</span> ${escapeHtml(customer.phone || '-')}</div>
    <div><span class="text-slate-500">CPF:</span> ${escapeHtml(customer.cpf || '-')}</div>
    <div class="mt-2"><span class="text-slate-500">Pagamento:</span> ${escapeHtml(order.method || '-')}</div>
    <div><span class="text-slate-500">Total:</span> <strong>${Number(order.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    ${order.invoice?.number ? `<div class="mt-2"><span class="text-slate-500">NF:</span> ${escapeHtml(order.invoice.number)}</div>` : ''}
    ${order.shipping?.labelCode ? `<div><span class="text-slate-500">Rastreio:</span> ${escapeHtml(order.shipping.labelCode)} (${escapeHtml(order.shipping.carrier || '')})</div>` : ''}
  `;

  const addr = order.deliveryAddress || {};
  qs('#order-detail-address').innerHTML = addr.street
    ? `<div>${escapeHtml(addr.street)}, ${escapeHtml(addr.number || '')}</div>
       <div>${escapeHtml(addr.neighborhood || '')}</div>
       <div>CEP ${escapeHtml(addr.zip || '')}</div>
       ${addr.complement ? `<div>${escapeHtml(addr.complement)}</div>` : ''}`
    : '<div class="text-slate-500">Endereco nao disponivel.</div>';

  const items = Array.isArray(order.items) ? order.items : [];
  qs('#order-detail-items').innerHTML = items.length
    ? items.map((item) => `
        <div class="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
          <img src="${escapeHtml(item.image || '')}" alt="${escapeHtml(item.name || 'Produto')}" class="w-14 h-14 rounded-xl object-cover bg-slate-900 border border-white/10">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-white">${escapeHtml(item.name || 'Produto')}</div>
            <div class="mini-meta">Qtd: ${Number(item.quantity || 1)}</div>
          </div>
          <div class="text-right">
            <div class="mini-meta">Subtotal</div>
            <div class="font-semibold">${(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
          </div>
        </div>
      `).join('')
    : '<div class="text-slate-500">Sem itens.</div>';

  const timeline = Array.isArray(order.timeline) ? order.timeline : [];
  qs('#order-detail-timeline').innerHTML = timeline.length
    ? timeline.map((entry) => `
        <div class="flex items-center gap-3 text-sm">
          <span class="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></span>
          <span>${orderStatusPill(entry.status)}</span>
          <span class="text-slate-400">${formatOrderDate(entry.at)}</span>
        </div>
      `).join('')
    : '<div class="text-slate-500 text-sm">Sem historico.</div>';

  const statusNext = qs('#order-status-next');
  if (statusNext) statusNext.value = '';
  qs('#order-invoice-btn')?.classList.toggle('hidden', Boolean(order.invoice?.number));
  qs('#order-shipping-btn')?.classList.toggle('hidden', Boolean(order.shipping?.labelCode));

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeOrderDetail() {
  state.selectedOrder = null;
  qs('#order-detail-panel')?.classList.add('hidden');
}

function wireOrdersEvents() {
  qs('#admin-orders-status-filter')?.addEventListener('change', (event) => {
    state.ordersFilters.status = event.target.value;
    state.ordersFilters.page = 1;
    loadOrders().catch(() => {});
  });

  qsa('[data-orders-prev-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.ordersPagination.hasPreviousPage) return;
      state.ordersFilters.page = Math.max(state.ordersFilters.page - 1, 1);
      loadOrders().catch(() => {});
    });
  });

  qsa('[data-orders-next-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.ordersPagination.hasNextPage) return;
      state.ordersFilters.page += 1;
      loadOrders().catch(() => {});
    });
  });

  qs('#close-order-detail-btn')?.addEventListener('click', closeOrderDetail);

  qs('#order-status-save-btn')?.addEventListener('click', async () => {
    const order = state.selectedOrder;
    if (!order) return;
    const nextStatus = qs('#order-status-next')?.value;
    if (!nextStatus) {
      toast('Selecione um status.', 'error');
      return;
    }
    try {
      await api(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      toast('Status atualizado com sucesso.', 'success');
      await loadOrders();
      closeOrderDetail();
    } catch (error) {
      toast(error.message || 'Nao foi possivel atualizar o status.', 'error');
    }
  });

  qs('#order-invoice-btn')?.addEventListener('click', async () => {
    const order = state.selectedOrder;
    if (!order) return;
    try {
      await api(`/orders/${order.id}/invoice`, { method: 'POST', body: '{}' });
      toast('Nota fiscal emitida.', 'success');
      await loadOrders();
      closeOrderDetail();
    } catch (error) {
      toast(error.message || 'Nao foi possivel emitir a nota.', 'error');
    }
  });

  qs('#order-shipping-btn')?.addEventListener('click', async () => {
    const order = state.selectedOrder;
    if (!order) return;
    const carrier = prompt('Transportadora (ex: Correios, Jadlog):', 'Correios') || 'Correios';
    try {
      await api(`/orders/${order.id}/shipping-label`, { method: 'POST', body: JSON.stringify({ carrier }) });
      toast('Etiqueta gerada com sucesso.', 'success');
      await loadOrders();
      closeOrderDetail();
    } catch (error) {
      toast(error.message || 'Nao foi possivel gerar a etiqueta.', 'error');
    }
  });
}

// Reviews admin. // feat: FEATURE-2
function starsHtml(rating = 0) {
  const safe = Math.max(0, Math.min(5, Number(rating || 0)));
  return Array.from({ length: 5 }, (_, i) =>
    `<i class="fas fa-star ${i < Math.round(safe) ? 'text-yellow-400' : 'text-gray-600'}"></i>`
  ).join('');
}

function reviewCard(review) {
  return `
    <article class="surface-panel rounded-[24px] p-5 border border-white/10">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="font-semibold text-white">${escapeHtml(review.name || 'Cliente')}</div>
          <div class="mini-meta mt-0.5">${escapeHtml(review.productId || '')}</div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex gap-0.5">${starsHtml(review.rating)}</div>
          <span class="mini-meta">${escapeHtml(String(review.rating || '-'))}</span>
        </div>
      </div>
      <p class="mt-3 text-sm text-slate-300 leading-relaxed">${escapeHtml(review.comment || '')}</p>
      <div class="mini-meta mt-3">${formatOrderDate(review.createdAt)}</div>
    </article>
  `;
}

function resolveReviewProductFilter(filter) {
  const normalized = String(filter || '').trim().toLowerCase();
  const options = state.homeOptions.productOptions || [];
  const match = options.find((product) =>
    String(product.id || '').toLowerCase() === normalized
    || String(product.name || '').toLowerCase().includes(normalized)
  );
  return match?.id || filter;
}

async function loadAdminReviews() {
  const feedbackEl = qs('#reviews-feedback');
  const listEl = qs('#reviews-list');
  if (!listEl) return;

  const filter = state.reviewsProductFilter.trim();
  if (!filter) {
    listEl.innerHTML = '<div class="text-slate-400 text-sm">Digite o ID ou nome de um produto para ver as avaliacoes.</div>';
    if (feedbackEl) feedbackEl.textContent = '';
    return;
  }

  if (feedbackEl) feedbackEl.textContent = 'Carregando avaliacoes...';
  try {
    const productId = resolveReviewProductFilter(filter);
    const response = await api(`/reviews/${encodeURIComponent(productId)}`); // feat: FEATURE-2
    const reviews = Array.isArray(response.reviews) ? response.reviews : [];
    listEl.innerHTML = reviews.length
      ? reviews.map(reviewCard).join('')
      : '<div class="text-slate-400 text-sm">Nenhuma avaliacao encontrada para este produto.</div>';
    if (feedbackEl) feedbackEl.textContent = `${reviews.length} avaliacao(oes) encontrada(s).`;
  } catch (error) {
    if (feedbackEl) feedbackEl.textContent = error.message || 'Erro ao carregar avaliacoes.';
    listEl.innerHTML = '';
  }
}

function wireReviewsEvents() {
  let reviewsDebounce;
  qs('#admin-reviews-product-search')?.addEventListener('input', (event) => {
    state.reviewsProductFilter = event.target.value;
    clearTimeout(reviewsDebounce);
    reviewsDebounce = setTimeout(() => {
      if (state.activeTab === 'reviews') loadAdminReviews().catch(() => {});
    }, 400);
  });
}

function wireFormEvents() {
  wireOrdersEvents(); // feat: FEATURE-1
  wireReviewsEvents(); // feat: FEATURE-2

  qs('#product-image-file')?.addEventListener('change', (event) => {
    handleMainImageSelection(event).catch((error) => toast(error.message || 'Falha ao ler a imagem.', 'error'));
  });

  qs('#product-gallery-files')?.addEventListener('change', (event) => {
    handleGallerySelection(event).catch((error) => toast(error.message || 'Falha ao ler a galeria.', 'error'));
  });

  qs('#reset-form-btn')?.addEventListener('click', () => fillForm(null));
  qs('#admin-product-search')?.addEventListener('input', (event) => {
    state.filters.search = event.target.value.trim();
    state.filters.page = 1;
    loadProducts().catch(() => {});
  });

  qsa('[data-admin-prev-btn]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.pagination.hasPreviousPage) return;
      state.filters.page = Math.max(state.filters.page - 1, 1);
      loadProducts().catch(() => {});
    });
  });

  qsa('[data-admin-next-btn]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.pagination.hasNextPage) return;
      state.filters.page += 1;
      loadProducts().catch(() => {});
    });
  });

  qsa('[data-admin-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.adminTab || 'products');
    });
  });

  qs('#add-home-slide-btn')?.addEventListener('click', addHomeSlide);
  qs('#add-home-category-btn')?.addEventListener('click', addHomeCategory);
  qs('#save-home-config-btn')?.addEventListener('click', saveHomeConfig);

  document.addEventListener('click', (event) => {
    const picker = qs('#product-categories-field');
    if (!picker || picker.contains(event.target)) return;
    if (!state.productCategoryDropdownOpen) return;
    state.productCategoryDropdownOpen = false;
    renderProductCategoryPicker();
  });
}

async function bootstrap() {
  fillForm(null);
  renderHomeConfig();
  wireFormEvents();
  setActiveTab('products');

  qs('#login-form')?.addEventListener('submit', handleLogin);
  qs('#product-form')?.addEventListener('submit', submitProduct);
  qs('#logout-btn')?.addEventListener('click', async () => {
    localStorage.removeItem('gustech_user_role');
    localStorage.removeItem('gustech_session_email');
    await auth.signOut();
    setLoggedIn(false);
    setFeedback('Entre novamente para acessar o admin.');
  });

  auth.onAuthStateChanged(async (user) => {
    const loggedIn = Boolean(user && !user.isAnonymous);
    setLoggedIn(loggedIn);
    if (!loggedIn) {
      state.loadedAdminUid = null;
      return;
    }

    const adminUid = String(user.uid || '');
    const shouldLoadAdminData = state.loadedAdminUid !== adminUid;
    state.loadedAdminUid = adminUid;

    localStorage.setItem('gustech_user_role', 'admin');
    localStorage.setItem('gustech_session_email', String(user.email || '').toLowerCase());
    if (!shouldLoadAdminData) return;

    try {
      await Promise.all([loadProducts(), loadHomeConfig()]);
    } catch {
      toast('O admin entrou, mas algum bloco ainda nao respondeu. Verifique o backend.', 'error');
    }
  });
}

bootstrap();
