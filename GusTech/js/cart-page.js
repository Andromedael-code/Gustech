import { currency, deleteCartItem, escapeHtml, loadCart, qsa, qs, saveCheckoutSelection, toast, updateCartItem } from './storefront-core.js';

const state = { items: [], selected: new Set() };

function updateSummary() {
  const selectedItems = state.items.filter((item) => state.selected.has(item.docId));
  const subtotal = selectedItems.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const savings = selectedItems.reduce((acc, item) => {
    const diff = Number(item.oldPrice || 0) - Number(item.price || 0);
    return diff > 0 ? acc + diff * Number(item.quantity || 1) : acc;
  }, 0);
  qs('#selected-count').textContent = `${selectedItems.length} itens`;
  qs('#summary-subtotal').textContent = currency(subtotal);
  qs('#summary-savings').textContent = `-${currency(savings)}`;
  qs('#summary-total').textContent = currency(subtotal);
}

function renderCart() {
  const list = qs('#cart-list');
  if (!list) return;
  if (!state.items.length) {
    list.innerHTML = '<div class="empty-state"><h2 class="text-2xl font-display font-bold mb-2">Seu carrinho esta vazio</h2><p class="text-gray-400">Explore o catalogo, salve seus favoritos e volte para finalizar a compra.</p><a class="primary-btn mt-4" href="index.html">Voltar para a loja</a></div>';
    updateSummary();
    return;
  }

  list.innerHTML = state.items.map((item) => `
    <article class="surface-panel rounded-[28px] p-5">
      <div class="flex flex-col gap-4 md:flex-row md:items-center">
        <label class="flex items-center gap-3">
          <input type="checkbox" class="accent-blue-500 cart-check" data-id="${escapeHtml(item.docId)}" ${state.selected.has(item.docId) ? 'checked' : ''}>
          <img src="${escapeHtml(item.image || '')}" alt="${escapeHtml(item.name || 'Produto')}" class="w-24 h-24 rounded-2xl object-cover">
        </label>
        <div class="flex-1 space-y-2">
          <a class="text-xl font-display font-bold text-white" href="produto.html?id=${encodeURIComponent(item.productId || '')}">${escapeHtml(item.name || 'Produto')}</a>
          <div class="mini-meta">${escapeHtml(item.productId || 'Produto em carrinho')}</div>
          <div class="flex flex-wrap items-center gap-4">
            <div>
              ${Number(item.oldPrice || 0) > Number(item.price || 0) ? `<div class="mini-meta line-through">${currency(item.oldPrice)}</div>` : ''}
              <div class="text-xl font-bold">${currency(item.price)}</div>
            </div>
            <div class="quantity-stepper">
              <button type="button" class="qty-step" data-id="${escapeHtml(item.docId)}" data-step="-1">-</button>
              <span>${item.quantity || 1}</span>
              <button type="button" class="qty-step" data-id="${escapeHtml(item.docId)}" data-step="1">+</button>
            </div>
          </div>
        </div>
        <div class="text-right">
          <div class="mini-meta">Subtotal</div>
          <div class="text-xl font-bold">${currency(Number(item.price || 0) * Number(item.quantity || 1))}</div>
          <button class="danger-btn mt-4 remove-item" data-id="${escapeHtml(item.docId)}"><i class="fas fa-trash"></i>Remover</button>
        </div>
      </div>
    </article>
  `).join('');

  qsa('.cart-check', list).forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.selected.add(input.dataset.id);
      else state.selected.delete(input.dataset.id);
      updateSummary();
    });
  });

  qsa('.qty-step', list).forEach((button) => {
    button.addEventListener('click', async () => {
      const item = state.items.find((entry) => entry.docId === button.dataset.id);
      if (!item) return;
      const nextQty = Math.max(1, Math.min(99, Number(item.quantity || 1) + Number(button.dataset.step || 0)));
      if (nextQty === Number(item.quantity || 1)) return;
      try {
        await updateCartItem(item.docId, nextQty);
        item.quantity = nextQty;
        renderCart();
        updateSummary();
      } catch (error) {
        toast(error.message || 'Nao foi possivel atualizar a quantidade.', 'error');
      }
    });
  });

  qsa('.remove-item', list).forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await deleteCartItem(button.dataset.id);
        state.items = state.items.filter((entry) => entry.docId !== button.dataset.id);
        state.selected.delete(button.dataset.id);
        renderCart();
        updateSummary();
      } catch (error) {
        toast(error.message || 'Nao foi possivel remover este item.', 'error');
      }
    });
  });

  updateSummary();
}

async function bootstrap() {
  state.items = await loadCart();
  state.selected = new Set(state.items.map((item) => item.docId));
  renderCart();

  qs('#checkout-btn')?.addEventListener('click', () => {
    const ids = state.items.filter((item) => state.selected.has(item.docId)).map((item) => item.docId);
    if (!ids.length) {
      toast('Selecione ao menos um item para continuar.', 'error');
      return;
    }
    saveCheckoutSelection(ids);
    window.location.href = 'pagamento.html';
  });
}

bootstrap().catch((error) => {
  const list = qs('#cart-list');
  if (list) list.innerHTML = `<div class="feedback-card">${error.message || 'Nao foi possivel carregar seu carrinho.'}</div>`;
});
