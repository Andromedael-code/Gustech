import { createOrder, currency, escapeHtml, getCheckoutSelection, loadCart, loadProfile, qs, toast } from './storefront-core.js';

const PAYMENT_PROVIDER = 'gustech-demo';
const state = {
  cart: [],
  profile: null,
  addresses: [],
  method: 'pix',
  paymentSession: null
};

const onlyDigits = (value = '') => String(value).replace(/\D/g, '');

function orderTotal() {
  return state.cart.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function createReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GT-${stamp}-${suffix}`;
}

function futureIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function selectedAddress() {
  const addressId = qs('#address-select')?.value || '';
  return state.addresses.find((item) => item.id === addressId) || state.addresses[0] || null;
}

function detectCardBrand(number = '') {
  const digits = onlyDigits(number);
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^6/.test(digits)) return 'Elo/Discover';
  return 'Cartao';
}

function isValidCardNumber(number = '') {
  const digits = onlyDigits(number);
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (shouldDouble) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function isValidExpiry(value = '') {
  const [rawMonth, rawYear] = String(value).split('/');
  const month = Number(rawMonth);
  const year = Number(`20${String(rawYear || '').padStart(2, '0')}`);
  if (!month || month < 1 || month > 12 || !year) return false;
  const expiresAt = new Date(year, month, 0, 23, 59, 59);
  return expiresAt > new Date();
}

function buildPixCode(session) {
  const total = orderTotal().toFixed(2);
  return `00020126360014BR.GOV.BCB.PIX0114GUSTECH-DEMO520400005303986540${total}5802BR5920GUSTECH MARKETPLACE6008CASSIA MG62180514${session.reference}6304DEMO`;
}

function buildBoletoCode(session) {
  const seed = onlyDigits(String(session.createdAt || Date.now()));
  return `23790.00009 60000.${seed.slice(-5).padStart(5, '0')} 00000.${seed.slice(-6).padStart(6, '0')} 1 000000${Math.round(orderTotal() * 100)}`;
}

function buildPaymentSession(method) {
  const base = {
    provider: PAYMENT_PROVIDER,
    reference: createReference(),
    amount: orderTotal(),
    createdAt: new Date().toISOString(),
    status: 'pending'
  };

  if (method === 'pix') {
    const session = { ...base, type: 'pix', expiresAt: futureIso(30) };
    return { ...session, qrCode: buildPixCode(session) };
  }

  if (method === 'boleto') {
    const session = { ...base, type: 'boleto', expiresAt: futureIso(3 * 24 * 60) };
    return { ...session, barcode: buildBoletoCode(session) };
  }

  if (method === 'teste') {
    return { ...base, type: 'teste', status: 'approved', approvedAt: new Date().toISOString() };
  }

  return { ...base, type: 'credit_card' };
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
    ? `${address.street}, ${address.number} - ${address.neighborhood} · CEP ${address.zip}${address.complement ? ` · ${address.complement}` : ''}`
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

function renderMethodHint() {
  const hint = qs('#method-hint');
  if (!hint) return;
  hint.textContent = state.method === 'pix'
    ? 'Pix com copia e cola, expiracao e confirmacao demo para validar o fluxo.'
    : state.method === 'credit_card'
      ? 'Cartao validado sem armazenar numero completo; apenas bandeira e final ficam no pedido.'
      : state.method === 'boleto'
        ? 'Boleto de demonstracao com linha digitavel e vencimento em 3 dias.'
        : 'Modo teste aprova o pagamento automaticamente para validar pedido, NF e etiqueta.';
}

function renderPaymentSession() {
  state.paymentSession = buildPaymentSession(state.method);

  qs('#card-block')?.classList.toggle('hidden', state.method !== 'credit_card');
  qs('#pix-block')?.classList.toggle('hidden', state.method !== 'pix');
  qs('#boleto-block')?.classList.toggle('hidden', state.method !== 'boleto');

  if (state.method === 'pix') {
    qs('#pix-code').textContent = state.paymentSession.qrCode;
    setPaymentStatus(
      'Pix gerado em ambiente demo',
      `Referencia ${state.paymentSession.reference}. Expira em ${formatDateTime(state.paymentSession.expiresAt)}.`,
      'fa-qrcode'
    );
  } else if (state.method === 'boleto') {
    qs('#boleto-code').textContent = state.paymentSession.barcode;
    qs('#boleto-due').value = `Vencimento em ${formatDateTime(state.paymentSession.expiresAt)}`;
    setPaymentStatus('Boleto pronto para emissao', `Referencia ${state.paymentSession.reference}.`, 'fa-barcode');
  } else if (state.method === 'teste') {
    setPaymentStatus('Pagamento aprovado em modo teste', `Referencia ${state.paymentSession.reference}.`, 'fa-circle-check');
  } else {
    setPaymentStatus('Cartao protegido', 'Informe os dados para validar a simulacao. O numero completo nao sera salvo.', 'fa-credit-card');
  }
}

function paymentDetails() {
  const session = state.paymentSession || buildPaymentSession(state.method);
  if (state.method === 'credit_card') {
    const number = qs('#card-number')?.value || '';
    const holder = qs('#card-holder')?.value.trim() || '';
    const expiry = qs('#card-expiry')?.value.trim() || '';
    const cvv = onlyDigits(qs('#card-cvv')?.value || '');
    if (holder.length < 3) throw new Error('Informe o nome impresso no cartao.');
    if (!isValidCardNumber(number)) throw new Error('Numero do cartao invalido para a simulacao.');
    if (!isValidExpiry(expiry)) throw new Error('Validade do cartao invalida ou vencida.');
    if (cvv.length < 3 || cvv.length > 4) throw new Error('CVV invalido.');
    return {
      provider: PAYMENT_PROVIDER,
      reference: session.reference,
      status: 'approved',
      approvedAt: new Date().toISOString(),
      brand: detectCardBrand(number),
      holder,
      last4: onlyDigits(number).slice(-4),
      installments: Number(qs('#installments')?.value || 1)
    };
  }
  if (state.method === 'boleto') {
    return {
      provider: PAYMENT_PROVIDER,
      reference: session.reference,
      status: 'pending',
      barcode: session.barcode,
      dueDate: session.expiresAt
    };
  }
  if (state.method === 'teste') {
    return {
      provider: PAYMENT_PROVIDER,
      reference: session.reference,
      status: 'approved',
      approvedAt: session.approvedAt,
      mode: 'test'
    };
  }
  return {
    provider: PAYMENT_PROVIDER,
    reference: session.reference,
    status: session.status,
    qrCode: session.qrCode,
    expiresAt: session.expiresAt
  };
}

function formatCardInputs() {
  const cardNumber = qs('#card-number');
  const expiry = qs('#card-expiry');
  const cvv = qs('#card-cvv');

  cardNumber?.addEventListener('input', () => {
    const digits = onlyDigits(cardNumber.value).slice(0, 19);
    cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  });

  expiry?.addEventListener('input', () => {
    const digits = onlyDigits(expiry.value).slice(0, 4);
    expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });

  cvv?.addEventListener('input', () => {
    cvv.value = onlyDigits(cvv.value).slice(0, 4);
  });
}

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    toast(message, 'success');
  } catch {
    toast('Nao foi possivel copiar automaticamente.', 'error');
  }
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
  renderPaymentSession();
  formatCardInputs();

  qs('#address-select')?.addEventListener('change', () => renderAddressPreview(selectedAddress()));

  qs('#payment-method')?.addEventListener('change', (event) => {
    state.method = event.target.value;
    renderMethodHint();
    renderPaymentSession();
    setFeedback('');
  });

  qs('#copy-pix-btn')?.addEventListener('click', () => {
    if (state.paymentSession?.qrCode) void copyText(state.paymentSession.qrCode, 'Codigo Pix copiado.');
  });

  qs('#approve-pix-demo-btn')?.addEventListener('click', () => {
    if (!state.paymentSession || state.method !== 'pix') return;
    state.paymentSession.status = 'approved';
    state.paymentSession.approvedAt = new Date().toISOString();
    setPaymentStatus('Pix confirmado em modo demo', `Referencia ${state.paymentSession.reference}.`, 'fa-circle-check');
    toast('Pix demo confirmado. Voce ja pode criar o pedido como pago.', 'success');
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
      const details = paymentDetails();
      const payload = {
        method: state.method,
        paymentDetails: details,
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
      setFeedback(`Pedido criado com status ${result.status}.`, 'success');
      setTimeout(() => { window.location.href = `obrigado.html?pedido=${encodeURIComponent(result.orderId)}&status=${encodeURIComponent(result.status || '')}`; }, 800);
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
