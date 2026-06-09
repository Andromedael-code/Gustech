import { createOrder, currency, escapeHtml, getCheckoutSelection, loadCart, loadProfile, qs, requireLoggedIn, toast } from './storefront-core.js';

const PAYMENT_PROVIDER = 'manual';
const state = {
  cart: [],
  profile: null,
  addresses: [],
  method: 'pix'
};

function orderTotal() {
  return state.cart.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function selectedAddress() {
  const addressId = qs('#address-select')?.value || '';
  return state.addresses.find((item) => item.id === addressId) || state.addresses[0] || null;
}

function setFeedback(message = '', tone = 'info') {
  const root = qs('#checkout-feedback');
  if (!root) return;
  root.textContent = message;
  root.classList.toggle('text-red-300', tone === 'error');
  root.classList.toggle('text-emerald-300', tone === 'success');
}

function setPaymentStatus(title, copy, icon = 'fa-lock') {
  const titleNode = qs('#payment-status-title');
  const copyNode = qs('#payment-status-copy');
  const iconNode = qs('#payment-status-panel i');
  if (titleNode) titleNode.textContent = title;
  if (copyNode) copyNode.textContent = copy;
  if (iconNode) iconNode.className = `fas ${icon}`;
}

function renderProfile() {
  const profileBox = qs('#customer-preview');
  if (!profileBox || !state.profile) return;
  profileBox.innerHTML = `
    <div class="mini-meta">Cliente logado</div>
    <div class="mt-2 text-lg font-semibold">${escapeHtml(state.profile.name || '-')}</div>
    <div class="text-sm text-gray-400">${escapeHtml(state.profile.email || '-')}</div>
    <div class="text-sm text-gray-400">${escapeHtml(state.profile.phone || '-')}</div>
    <div class="text-sm text-gray-400">CPF: ${escapeHtml(state.profile.cpf || '-')}</div>
  `;
}

function renderAddressPreview(address) {
  const preview = qs('#address-preview');
  if (!preview) return;
  preview.textContent = address
    ? `${address.street}, ${address.number} - ${address.neighborhood} - CEP ${address.zip}${address.complement ? ` - ${address.complement}` : ''}`
    : 'Selecione um endereco.';
}

function renderAddresses() {
  const select = qs('#address-select');
  if (!select) return;
  if (!state.addresses.length) {
    select.innerHTML = '<option value="">Nenhum endereco cadastrado</option>';
    renderAddressPreview(null);
    qs('#address-preview').textContent = 'Cadastre um endereco em Minha conta antes de finalizar a compra.';
    return;
  }
  select.innerHTML = state.addresses.map((address) => `<option value="${escapeHtml(address.id)}">${escapeHtml(address.label || 'Endereco')}${address.isDefault ? ' (Principal)' : ''}</option>`).join('');
  const current = state.addresses.find((item) => item.isDefault) || state.addresses[0];
  select.value = current.id;
  renderAddressPreview(current);
}

function renderSummary() {
  const wrap = qs('#summary-items');
  const subtotalNode = qs('#summary-subtotal');
  const totalNode = qs('#summary-total');
  if (!wrap || !subtotalNode || !totalNode) return;
  wrap.innerHTML = state.cart.map((item) => `
    <div class="summary-line">
      <span>${escapeHtml(item.name || 'Produto')} x${Number(item.quantity || 1)}</span>
      <strong>${currency(Number(item.price || 0) * Number(item.quantity || 1))}</strong>
    </div>
  `).join('');
  subtotalNode.textContent = currency(orderTotal());
  totalNode.textContent = currency(orderTotal());
}

function paymentCopy() {
  const total = currency(orderTotal());
  if (state.method === 'pix') {
    return {
      icon: 'fa-qrcode',
      title: 'Pix',
      statusTitle: 'Pix selecionado',
      copy: `A loja enviara a chave Pix e confirmara o pagamento do pedido de ${total} antes do envio.`,
      statusCopy: 'O pedido ficara pendente ate a confirmacao do Pix.'
    };
  }
  if (state.method === 'credit_card') {
    return {
      icon: 'fa-credit-card',
      title: 'Cartao de credito',
      statusTitle: 'Cartao por link seguro',
      copy: `A loja enviara um link de pagamento seguro para o pedido de ${total}. O site nao coleta dados do cartao.`,
      statusCopy: 'O pedido ficara pendente ate a aprovacao no link de pagamento.'
    };
  }
  return {
    icon: 'fa-barcode',
    title: 'Boleto',
    statusTitle: 'Boleto selecionado',
    copy: `A loja emitira o boleto do pedido de ${total} e enviara as instrucoes de pagamento.`,
    statusCopy: 'O pedido ficara pendente ate a compensacao do boleto.'
  };
}

function renderMethodHint() {
  const details = paymentCopy();
  const hint = qs('#method-hint');
  const title = qs('#payment-method-title');
  const copy = qs('#payment-method-copy');
  const icon = qs('#payment-method-icon');
  if (hint) hint.textContent = details.statusCopy;
  if (title) title.textContent = details.title;
  if (copy) copy.textContent = details.copy;
  if (icon) icon.className = `fas ${details.icon}`;
  setPaymentStatus(details.statusTitle, details.statusCopy, details.icon);
}

function paymentDetails() {
  const details = paymentCopy();
  return {
    provider: PAYMENT_PROVIDER,
    method: state.method,
    status: 'pending',
    amount: orderTotal(),
    instructions: details.copy
  };
}

async function bootstrap() {
  const user = await requireLoggedIn('pagamento.html');
  if (!user) {
    setFeedback('Entre na sua conta para continuar para o pagamento.', 'error');
    setPaymentStatus('Login necessario', 'O pagamento so fica disponivel depois que voce entrar na conta.', 'fa-user-lock');
    qs('#checkout-form button[type="submit"]')?.setAttribute('disabled', 'disabled');
    qs('#payment-method')?.setAttribute('disabled', 'disabled');
    qs('#payment-instructions')?.classList.add('hidden');
    return;
  }

  const selectedIds = new Set(getCheckoutSelection());
  state.cart = (await loadCart()).filter((item) => !selectedIds.size || selectedIds.has(item.docId));
  const me = await loadProfile();
  state.profile = me.profile || {};
  state.addresses = me.addresses || [];

  renderProfile();
  renderAddresses();
  renderSummary();
  renderMethodHint();

  qs('#address-select')?.addEventListener('change', () => renderAddressPreview(selectedAddress()));

  qs('#payment-method')?.addEventListener('change', (event) => {
    state.method = event.target.value;
    renderMethodHint();
    setFeedback('');
  });

  qs('#checkout-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFeedback('');
    if (!state.cart.length) {
      toast('Seu carrinho esta vazio.', 'error');
      return;
    }
    if (!state.profile?.name || !state.profile?.cpf) {
      toast('Complete seus dados na pagina Minha conta antes de finalizar.', 'error');
      return;
    }
    const address = selectedAddress();
    if (!address) {
      toast('Selecione um endereco para entrega.', 'error');
      return;
    }

    try {
      const payload = {
        method: state.method,
        paymentDetails: paymentDetails(),
        deliveryAddress: address,
        cartItemIds: state.cart.map((item) => item.docId),
        items: state.cart.map((item) => ({
          productId: item.productId || null,
          name: item.name,
          image: item.image || '',
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1)
        }))
      };
      const result = await createOrder(payload);
      localStorage.removeItem('gustech_checkout_items');
      toast(`Pedido #${result.orderId} criado com sucesso.`, 'success');
      setFeedback('Pedido criado e aguardando confirmacao do pagamento.', 'success');
      setTimeout(() => {
        window.location.href = `obrigado.html?pedido=${encodeURIComponent(result.orderId)}&status=${encodeURIComponent(result.status || 'pending')}`;
      }, 800);
    } catch (error) {
      setFeedback(error.message || 'Nao foi possivel concluir o pedido.', 'error');
      toast(error.message || 'Nao foi possivel concluir o pedido.', 'error');
    }
  });
}

bootstrap().catch((error) => {
  const root = qs('#checkout-feedback');
  if (root) root.textContent = error.message || 'Nao foi possivel iniciar o checkout.';
});
