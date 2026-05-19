import { createOrder, currency, getCheckoutSelection, loadCart, loadProfile, qs, toast } from './storefront-core.js';

const state = { cart: [], profile: null, addresses: [], method: 'pix' };

function selectedAddress() {
  const addressId = qs('#address-select')?.value || '';
  return state.addresses.find((item) => item.id === addressId) || state.addresses[0] || null;
}

function renderProfile() {
  const profileBox = qs('#customer-preview');
  if (!profileBox || !state.profile) return;
  profileBox.innerHTML = `
    <div class="mini-meta">Cliente logado</div>
    <div class="mt-2 text-lg font-semibold">${state.profile.name || '-'}</div>
    <div class="text-sm text-gray-400">${state.profile.email || '-'}</div>
    <div class="text-sm text-gray-400">${state.profile.phone || '-'}</div>
    <div class="text-sm text-gray-400">CPF: ${state.profile.cpf || '-'}</div>
  `;
}

function renderAddresses() {
  const select = qs('#address-select');
  const preview = qs('#address-preview');
  if (!select || !preview) return;
  if (!state.addresses.length) {
    select.innerHTML = '<option value="">Nenhum endereco cadastrado</option>';
    preview.innerHTML = 'Cadastre um endereco em Minha conta antes de finalizar a compra.';
    return;
  }
  select.innerHTML = state.addresses.map((address) => `<option value="${address.id}">${address.label || 'Endereco'}${address.isDefault ? ' (Principal)' : ''}</option>`).join('');
  const current = state.addresses.find((item) => item.isDefault) || state.addresses[0];
  select.value = current.id;
  preview.textContent = `${current.street}, ${current.number} - ${current.neighborhood} · CEP ${current.zip}${current.complement ? ` · ${current.complement}` : ''}`;
}

function renderSummary() {
  const wrap = qs('#summary-items');
  const totalNode = qs('#summary-total');
  if (!wrap || !totalNode) return;
  wrap.innerHTML = state.cart.map((item) => `
    <div class="summary-line">
      <span>${item.name} x${item.quantity || 1}</span>
      <strong>${currency(Number(item.price || 0) * Number(item.quantity || 1))}</strong>
    </div>
  `).join('');
  totalNode.textContent = currency(state.cart.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 1), 0));
}

function renderMethodHint() {
  const hint = qs('#method-hint');
  if (!hint) return;
  hint.textContent = state.method === 'pix'
    ? 'Pix com aprovacao rapida e conciliacao imediata.'
    : state.method === 'credit_card'
      ? 'Pedido com dados essenciais de cartao para simulacao segura do fluxo.'
      : state.method === 'boleto'
        ? 'Boleto com vencimento em 3 dias.'
        : 'Modo teste para validar o fluxo sem cobranca real.';
}

function paymentDetails() {
  if (state.method === 'credit_card') {
    return {
      holder: qs('#card-holder')?.value.trim() || '',
      last4: (qs('#card-number')?.value || '').replace(/\D/g, '').slice(-4),
      installments: Number(qs('#installments')?.value || 1)
    };
  }
  if (state.method === 'boleto') {
    return { dueDate: qs('#boleto-due')?.value || '' };
  }
  if (state.method === 'teste') {
    return { mode: 'test' };
  }
  return { expiresInMinutes: 30 };
}

async function bootstrap() {
  const selectedIds = new Set(getCheckoutSelection());
  state.cart = (await loadCart()).filter((item) => !selectedIds.size || selectedIds.has(item.docId));
  const me = await loadProfile();
  state.profile = me.profile || {};
  state.addresses = me.addresses || [];

  renderProfile();
  renderAddresses();
  renderSummary();
  renderMethodHint();

  qs('#address-select')?.addEventListener('change', () => {
    const current = selectedAddress();
    qs('#address-preview').textContent = current
      ? `${current.street}, ${current.number} - ${current.neighborhood} · CEP ${current.zip}${current.complement ? ` · ${current.complement}` : ''}`
      : 'Selecione um endereco.';
  });

  qs('#payment-method')?.addEventListener('change', (event) => {
    state.method = event.target.value;
    qs('#card-block')?.classList.toggle('hidden', state.method !== 'credit_card');
    qs('#boleto-block')?.classList.toggle('hidden', state.method !== 'boleto');
    renderMethodHint();
  });

  qs('#checkout-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
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
      setTimeout(() => { window.location.href = 'obrigado.html'; }, 800);
    } catch (error) {
      toast(error.message || 'Nao foi possivel concluir o pedido.', 'error');
    }
  });
}

bootstrap().catch((error) => {
  const root = qs('#checkout-feedback');
  if (root) root.textContent = error.message || 'Nao foi possivel iniciar o checkout.';
});
