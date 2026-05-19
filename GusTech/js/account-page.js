import { auth } from './firebase-app.js';
import { api, currency, escapeHtml, qs, qsa, toast } from './storefront-core.js';

const db = window.gustechCompatDb;
const state = {
  currentUser: null,
  currentProfile: null,
  currentAddresses: [],
  currentSection: 'account',
  phoneVerificationEnabled: false,
  phoneVerificationMock: false,
  editingUsername: false,
  editingPhone: false,
  phoneVerificationPending: false,
  pendingPhoneDigits: '',
  nextPage: new URLSearchParams(window.location.search).get('next') || 'conta.html'
};

const $ = qs;
const onlyDigits = (value = '') => String(value || '').replace(/\D/g, '');

function setFeedback(message, type = 'ok') {
  const node = $('#feedback');
  if (!node) return;
  node.textContent = message;
  node.className = `mt-5 text-sm rounded-2xl border px-4 py-3 ${type === 'error' ? 'text-red-200 border-red-500/30 bg-red-500/10' : 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10'}`;
  node.classList.remove('hidden');
}

function clearFeedback() {
  const node = $('#feedback');
  if (!node) return;
  node.textContent = '';
  node.className = 'mt-5 text-sm hidden';
}

function maskCPF(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function maskZip(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, '$1-$2');
}

function formatPhoneVerificationDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

function isValidCPF(cpf) {
  const digits = onlyDigits(cpf);
  if (!digits || digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (base, factor) => {
    let total = 0;
    for (const n of base) total += Number(n) * factor--;
    const mod = (total * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(digits.slice(0, 9), 10) === Number(digits[9]) && calc(digits.slice(0, 10), 11) === Number(digits[10]);
}

function isValidPhone(phone) {
  const digits = onlyDigits(phone);
  return digits.length === 10 || digits.length === 11;
}

function getPasswordStrength(password = '') {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function updatePasswordStrength() {
  const label = $('#password-strength-label');
  if (!label) return;
  const levels = ['Muito fraca', 'Fraca', 'Media', 'Boa', 'Forte', 'Muito forte'];
  label.textContent = `Forca da senha: ${levels[getPasswordStrength($('#signup-password')?.value || '')]}`;
}

function togglePassword(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showTopTab(tab) {
  ['login', 'signup', 'account'].forEach((key) => {
    const panel = document.getElementById(`${key}-panel`);
    const button = document.getElementById(`tab-${key}`);
    const active = key === tab;
    panel?.classList.toggle('hidden', !active);
    button?.classList.toggle('is-active', active);
  });
}

function setSideTabs(section) {
  ['account', 'addresses', 'orders'].forEach((key) => {
    document.getElementById(`side-tab-${key}`)?.classList.toggle('is-active', key === section);
  });
}

function showAccountSection(section = 'account') {
  state.currentSection = section;
  $('#account-panel')?.classList.toggle('hidden', section !== 'account');
  $('#addresses-panel')?.classList.toggle('hidden', section !== 'addresses');
  $('#orders-panel')?.classList.toggle('hidden', section !== 'orders');
  setSideTabs(section);
}

function applyAuthLayout(isLoggedIn) {
  $('#account-sidebar')?.classList.toggle('hidden', !isLoggedIn);
  $('#account-content')?.classList.toggle('hidden', !isLoggedIn);
  $('#tab-login')?.classList.toggle('hidden', isLoggedIn);
  $('#tab-signup')?.classList.toggle('hidden', isLoggedIn);
  $('#tab-account')?.classList.toggle('hidden', !isLoggedIn);
  $('#logout-btn')?.classList.toggle('hidden', !isLoggedIn);
  document.getElementById('account-layout')?.classList.toggle('account-layout-shell--logged', isLoggedIn);
}

function ensureAddressIds(addresses = []) {
  return addresses.map((address, index) => ({ id: address.id || `addr_${Date.now()}_${index}`, ...address }));
}

function clearAddressForm() {
  ['address-id', 'address-label', 'address-street', 'address-number', 'address-neighborhood', 'address-zip', 'address-complement'].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  if ($('#address-default')) $('#address-default').checked = false;
}

function setFieldEditable(inputId, editable) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.readOnly = !editable;
  input.setAttribute('aria-readonly', editable ? 'false' : 'true');
  input.classList.toggle('store-input--locked', !editable);
  input.classList.toggle('store-input--editable', editable);
}

function resetPhoneVerificationFlow() {
  state.phoneVerificationPending = false;
  state.pendingPhoneDigits = '';
  const codeInput = $('#phone-verification-code');
  if (codeInput) codeInput.value = '';
}

function fillProfileForm(profile = {}) {
  state.currentProfile = profile;
  state.editingUsername = false;
  state.editingPhone = false;
  resetPhoneVerificationFlow();
  $('#profile-username').value = profile.username || '';
  $('#profile-name').value = profile.name || '';
  $('#profile-phone').value = profile.phone || '';
  $('#profile-cpf').value = profile.cpf || '';
  syncPhoneVerificationUi();
}

function isPhoneChanged() {
  return onlyDigits($('#profile-phone')?.value || '') !== onlyDigits(state.currentProfile?.phone || '');
}

function syncPhoneVerificationUi(message = '', tone = 'info') {
  const status = $('#phone-verification-status');
  const panel = $('#phone-verification-panel');
  const panelMessage = $('#phone-verification-message');
  const saveButton = $('#save-phone-btn');
  const confirmButton = $('#confirm-phone-code-btn');
  const editUsernameButton = $('#edit-username-btn');
  const editPhoneButton = $('#edit-phone-btn');
  const codeInput = $('#phone-verification-code');
  const phoneInput = $('#profile-phone');
  const currentPhone = state.currentProfile?.phone || '';
  const nextPhone = phoneInput?.value || '';
  const nextPhoneDigits = onlyDigits(nextPhone);
  const changed = nextPhoneDigits && isPhoneChanged();
  const verificationMatchesCurrentDraft = state.pendingPhoneDigits && nextPhoneDigits === state.pendingPhoneDigits;
  const canSend = state.phoneVerificationEnabled && state.editingPhone && changed && isValidPhone(nextPhone);
  const canConfirm = state.phoneVerificationPending && verificationMatchesCurrentDraft && String(codeInput?.value || '').trim().length >= 4;

  if (editUsernameButton) {
    editUsernameButton.innerHTML = `<i class="fas fa-${state.editingUsername ? 'xmark' : 'pen'}"></i>`;
    editUsernameButton.setAttribute('aria-label', state.editingUsername ? 'Cancelar edição do nick' : 'Editar nick');
    editUsernameButton.setAttribute('title', state.editingUsername ? 'Cancelar edição do nick' : 'Editar nick');
  }

  if (editPhoneButton) {
    editPhoneButton.innerHTML = `<i class="fas fa-${state.editingPhone ? 'xmark' : 'pen'}"></i>`;
    editPhoneButton.setAttribute('aria-label', state.editingPhone ? 'Cancelar edição do celular' : 'Editar celular');
    editPhoneButton.setAttribute('title', state.editingPhone ? 'Cancelar edição do celular' : 'Editar celular');
  }

  setFieldEditable('profile-username', state.editingUsername);
  setFieldEditable('profile-phone', state.editingPhone);

  if (saveButton) {
    saveButton.classList.toggle('hidden', !(state.editingPhone && changed));
    saveButton.disabled = !canSend;
  }
  if (confirmButton) confirmButton.disabled = !canConfirm;
  if (panel) panel.classList.toggle('hidden', !state.phoneVerificationPending);

  if (!status) return;

  status.className = `mini-meta mt-3 ${tone === 'error' ? 'text-red-300' : tone === 'ok' ? 'text-emerald-300' : ''}`;
  if (panelMessage) {
    panelMessage.className = `mt-2 text-sm ${tone === 'error' ? 'text-red-300' : tone === 'ok' ? 'text-slate-200' : 'text-slate-300'}`;
  }

  if (message) {
    status.textContent = message;
    if (panelMessage && state.phoneVerificationPending) panelMessage.textContent = message;
    return;
  }

  if (!state.phoneVerificationEnabled) {
    status.textContent = 'A verificação por SMS ainda não está configurada no servidor.';
    return;
  }

  if (state.phoneVerificationPending) {
    status.textContent = 'Código enviado. Confirme o novo número para concluir a alteração.';
    if (panelMessage) {
      panelMessage.textContent = state.phoneVerificationMock
        ? 'Modo teste ativo: o painel foi liberado para você validar a interface. Use o código 123456.'
        : 'Enviamos um código para o novo número. Digite abaixo para concluir a troca.';
    }
    return;
  }

  if (state.editingPhone && changed) {
    status.textContent = 'Clique em "Salvar número" para enviar o código por SMS.';
    return;
  }

  if (state.currentProfile?.phoneVerifiedAt) {
    status.textContent = `Celular confirmado por SMS em ${formatPhoneVerificationDate(state.currentProfile.phoneVerifiedAt)}.`;
    return;
  }

  status.textContent = currentPhone
    ? 'Seu celular atual ainda não possui confirmação por SMS registrada.'
    : 'Cadastre um celular e confirme por SMS para proteger sua conta.';
}

function toggleUsernameEdit() {
  if (state.editingUsername) {
    $('#profile-username').value = state.currentProfile?.username || '';
    state.editingUsername = false;
  } else {
    state.editingUsername = true;
    $('#profile-username')?.focus();
  }
  syncPhoneVerificationUi();
}

function togglePhoneEdit() {
  if (state.editingPhone) {
    $('#profile-phone').value = state.currentProfile?.phone || '';
    state.editingPhone = false;
    resetPhoneVerificationFlow();
  } else {
    state.editingPhone = true;
    $('#profile-phone')?.focus();
  }
  syncPhoneVerificationUi();
}

function validateCustomerFields({ cpf, phone }, { allowEmptyPhone = true, allowEmptyCpf = false } = {}) {
  const cleanCpf = onlyDigits(cpf || '');
  const cleanPhone = onlyDigits(phone || '');
  if (!allowEmptyCpf && !cleanCpf) throw new Error('CPF e obrigatorio.');
  if (cleanCpf && !isValidCPF(cleanCpf)) throw new Error('CPF invalido. Verifique os numeros informados.');
  if (!allowEmptyPhone && !cleanPhone) throw new Error('Celular e obrigatorio.');
  if (cleanPhone && !isValidPhone(cleanPhone)) throw new Error('Celular invalido. Informe DDD e numero.');
}

function addressCard(address) {
  return `
    <article class="surface-panel rounded-[24px] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="font-semibold text-white">${escapeHtml(address.label || 'Endereco')}</div>
          <div class="mini-meta mt-2">${escapeHtml(address.street || '-')}, ${escapeHtml(address.number || '-')} - ${escapeHtml(address.neighborhood || '-')}</div>
          <div class="mini-meta mt-1">CEP: ${escapeHtml(address.zip || '-')}${address.complement ? ` | ${escapeHtml(address.complement)}` : ''}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${address.isDefault ? '<span class="status-pill status-pill--info">Principal</span>' : `<button class="ghost-btn set-default-address" type="button" data-id="${escapeHtml(address.id)}">Definir principal</button>`}
          <button class="secondary-btn !py-2 !px-3 edit-address" type="button" data-id="${escapeHtml(address.id)}"><i class="fas fa-pen"></i></button>
          <button class="danger-btn !py-2 !px-3 delete-address" type="button" data-id="${escapeHtml(address.id)}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </article>
  `;
}

function renderAddresses() {
  const root = $('#addresses-list');
  if (!root) return;
  if (!state.currentAddresses.length) {
    root.innerHTML = '<div class="empty-state"><h3 class="text-2xl font-display font-bold mb-2">Nenhum endereco cadastrado</h3><p class="text-slate-400">Adicione um endereco para agilizar o checkout.</p></div>';
    return;
  }

  root.innerHTML = state.currentAddresses.map(addressCard).join('');

  qsa('.edit-address', root).forEach((button) => {
    button.addEventListener('click', () => {
      const address = state.currentAddresses.find((item) => item.id === button.dataset.id);
      if (!address) return;
      $('#address-id').value = address.id;
      $('#address-label').value = address.label || '';
      $('#address-street').value = address.street || '';
      $('#address-number').value = address.number || '';
      $('#address-neighborhood').value = address.neighborhood || '';
      $('#address-zip').value = address.zip || '';
      $('#address-complement').value = address.complement || '';
      $('#address-default').checked = Boolean(address.isDefault);
      $('#address-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  qsa('.delete-address', root).forEach((button) => {
    button.addEventListener('click', async () => {
      const next = state.currentAddresses.filter((item) => item.id !== button.dataset.id);
      if (next.length && !next.some((item) => item.isDefault)) next[0].isDefault = true;
      await persistAddresses(next);
      clearAddressForm();
      setFeedback('Endereco removido com sucesso.');
    });
  });

  qsa('.set-default-address', root).forEach((button) => {
    button.addEventListener('click', async () => {
      const next = state.currentAddresses.map((item) => ({ ...item, isDefault: item.id === button.dataset.id }));
      await persistAddresses(next);
      setFeedback('Endereco principal atualizado com sucesso.');
    });
  });
}

function getMockOrdersForUser(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem('gustech_mock_orders') || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.userId === uid) : [];
  } catch {
    return [];
  }
}

function getOrderTimestamp(order) {
  const date = new Date(order?.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatOrderDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function renderOrders(list = []) {
  const root = $('#orders-list');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = '<div class="empty-state"><h3 class="text-2xl font-display font-bold mb-2">Voce ainda nao fez pedidos</h3><p class="text-slate-400">Quando concluir uma compra, o historico aparecera aqui.</p></div>';
    return;
  }

  root.innerHTML = list.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((acc, item) => acc + Number(item.quantity || 1), 0);
    return `
      <details class="surface-panel rounded-[24px] p-5 group">
        <summary class="list-none cursor-pointer flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="mini-meta">Pedido #${escapeHtml(order.id)}</div>
            <div class="mt-2 text-2xl font-display font-bold">${escapeHtml(order.status || 'pending')}</div>
            <div class="mini-meta mt-2">${formatOrderDate(order.createdAt)}</div>
          </div>
          <div class="text-right">
            <div class="status-pill status-pill--info">${quantity} item(ns)</div>
            <div class="mt-3 font-semibold">${currency(order.total || 0)}</div>
            <div class="mini-meta mt-1">${escapeHtml(order.method || '-')}</div>
          </div>
        </summary>
        <div class="mt-5 grid gap-3">
          ${items.map((item) => `
            <article class="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
              <img src="${escapeHtml(item.image || '')}" alt="${escapeHtml(item.name || 'Produto')}" class="w-16 h-16 rounded-2xl object-cover bg-slate-900 border border-white/10">
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-white">${escapeHtml(item.name || 'Produto')}</div>
                <div class="mini-meta mt-1">Qtd: ${Number(item.quantity || 1)}</div>
              </div>
              <div class="text-right">
                <div class="mini-meta">Subtotal</div>
                <div class="font-semibold">${currency(Number(item.price || 0) * Number(item.quantity || 1))}</div>
              </div>
            </article>
          `).join('')}
        </div>
      </details>
    `;
  }).join('');
}

async function persistAddresses(addresses) {
  state.currentAddresses = ensureAddressIds(addresses);
  if (state.currentAddresses.length && !state.currentAddresses.some((item) => item.isDefault)) {
    state.currentAddresses[0].isDefault = true;
  }
  await api('/users/me/addresses', {
    method: 'PUT',
    body: JSON.stringify({ addresses: state.currentAddresses })
  });
  renderAddresses();
}

async function loadOrders() {
  const response = await api('/orders/me');
  const mock = getMockOrdersForUser(state.currentUser?.uid || '');
  const merged = [...(response.orders || []), ...mock].sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));
  renderOrders(merged);
}

async function loadAccountData() {
  let data = {};
  try {
    const me = await api('/users/me');
    data = me.profile || {};
    state.currentAddresses = ensureAddressIds(me.addresses || []);
    state.phoneVerificationEnabled = Boolean(me.phoneVerification?.enabled || me.phoneVerification?.mock);
    state.phoneVerificationMock = Boolean(me.phoneVerification?.mock);
  } catch {
    const fallback = db ? await db.collection('users').doc(state.currentUser.uid).get() : null;
    data = fallback?.exists ? fallback.data() : {};
    state.currentAddresses = ensureAddressIds(data.addresses || []);
    state.phoneVerificationEnabled = false;
    state.phoneVerificationMock = false;
  }

  fillProfileForm(data);
  renderAddresses();
  await loadOrders();
}

async function handleLogin(event) {
  event.preventDefault();
  clearFeedback();
  try {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    await auth.signInWithEmailAndPassword(email, password);
    localStorage.setItem('gustech_session_email', email.toLowerCase());
    setFeedback('Login realizado com sucesso.');
    setTimeout(() => { window.location.href = state.nextPage; }, 600);
  } catch (error) {
    setFeedback(error.message || 'Falha no login.', 'error');
  }
}

async function handleSignup(event) {
  event.preventDefault();
  clearFeedback();
  try {
    const email = $('#signup-email').value.trim();
    const password = $('#signup-password').value;
    if (!$('#signup-terms').checked) throw new Error('Voce precisa aceitar os termos para criar conta.');
    if (getPasswordStrength(password) < 3) throw new Error('Use uma senha mais forte com letras, numeros e simbolos.');
    const profile = {
      username: $('#signup-username').value.trim(),
      name: $('#signup-name').value.trim(),
      phone: $('#signup-phone').value.trim(),
      cpf: $('#signup-cpf').value.trim(),
      email
    };
    if (!profile.username) throw new Error('Informe um nome de usuario.');
    validateCustomerFields({ cpf: profile.cpf, phone: profile.phone }, { allowEmptyPhone: false, allowEmptyCpf: false });

    await auth.createUserWithEmailAndPassword(email, password);
    await api('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify({ ...profile, addresses: [] })
    });
    localStorage.setItem('gustech_session_email', email.toLowerCase());
    setFeedback('Conta criada com sucesso.');
    setTimeout(() => { window.location.href = state.nextPage; }, 600);
  } catch (error) {
    setFeedback(error.message || 'Falha ao criar conta.', 'error');
  }
}

async function handleProfileSave(event) {
  event.preventDefault();
  clearFeedback();
  try {
    const username = $('#profile-username').value.trim();
    if (!username) throw new Error('Nome de usuario e obrigatorio.');
    if (isPhoneChanged()) throw new Error('Confirme o novo celular por SMS antes de salvar o perfil.');
    await api('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify({ username })
    });
    state.currentProfile = {
      ...(state.currentProfile || {}),
      username
    };
    state.editingUsername = false;
    syncPhoneVerificationUi('Dados pessoais atualizados com sucesso.', 'ok');
    setFeedback('Dados pessoais atualizados com sucesso.');
  } catch (error) {
    setFeedback(error.message || 'Nao foi possivel salvar o perfil.', 'error');
  }
}

async function handleStartPhoneVerification() {
  clearFeedback();
  try {
    const phone = $('#profile-phone')?.value.trim() || '';
    if (!isValidPhone(phone)) throw new Error('Informe um celular valido com DDD.');
    if (!isPhoneChanged()) throw new Error('Digite um novo celular para enviar o codigo.');

    const response = await api('/users/me/phone-verification/start', {
      method: 'POST',
      body: JSON.stringify({ phone })
    });

    state.phoneVerificationPending = true;
    state.pendingPhoneDigits = onlyDigits(phone);
    syncPhoneVerificationUi(response.message || 'Codigo enviado por SMS.', 'ok');
    setFeedback(response.message || 'Codigo enviado por SMS.');
    $('#phone-verification-code')?.focus();
  } catch (error) {
    syncPhoneVerificationUi(error.message || 'Nao foi possivel enviar o codigo por SMS.', 'error');
    setFeedback(error.message || 'Nao foi possivel enviar o codigo por SMS.', 'error');
  }
}

async function handleConfirmPhoneVerification() {
  clearFeedback();
  try {
    const phone = $('#profile-phone')?.value.trim() || '';
    const code = $('#phone-verification-code')?.value.trim() || '';
    if (!isValidPhone(phone)) throw new Error('Informe um celular valido com DDD.');
    if (!code) throw new Error('Digite o codigo recebido por SMS.');

    const response = await api('/users/me/phone-verification/confirm', {
      method: 'POST',
      body: JSON.stringify({ phone, code })
    });

    $('#profile-phone').value = response.phone || phone;
    $('#phone-verification-code').value = '';
    state.currentProfile = {
      ...(state.currentProfile || {}),
      phone: response.phone || phone,
      phoneVerifiedAt: response.phoneVerifiedAt || new Date().toISOString()
    };
    state.editingPhone = false;
    resetPhoneVerificationFlow();
    syncPhoneVerificationUi(response.message || 'Celular confirmado por SMS.', 'ok');
    setFeedback(response.message || 'Celular confirmado por SMS.');
  } catch (error) {
    syncPhoneVerificationUi(error.message || 'Nao foi possivel confirmar o celular.', 'error');
    setFeedback(error.message || 'Nao foi possivel confirmar o celular.', 'error');
  }
}

async function handleAddressSave(event) {
  event.preventDefault();
  if (!state.currentUser) return;
  clearFeedback();
  try {
    const addressId = $('#address-id').value || `addr_${Date.now()}`;
    const address = {
      id: addressId,
      label: $('#address-label').value.trim() || 'Endereco',
      street: $('#address-street').value.trim(),
      number: $('#address-number').value.trim(),
      neighborhood: $('#address-neighborhood').value.trim(),
      zip: $('#address-zip').value.trim(),
      complement: $('#address-complement').value.trim(),
      isDefault: $('#address-default').checked
    };

    if (!address.street || !address.number || !address.neighborhood || onlyDigits(address.zip).length !== 8) {
      throw new Error('Preencha endereco completo com CEP valido.');
    }

    let next = state.currentAddresses.filter((item) => item.id !== addressId);
    if (address.isDefault) next = next.map((item) => ({ ...item, isDefault: false }));
    next.push(address);
    if (!next.some((item) => item.isDefault)) next[0].isDefault = true;

    await persistAddresses(next);
    clearAddressForm();
    setFeedback('Endereco salvo com sucesso.');
  } catch (error) {
    setFeedback(error.message || 'Nao foi possivel salvar o endereco.', 'error');
  }
}

async function handleLogout() {
  localStorage.removeItem('gustech_user_role');
  localStorage.removeItem('gustech_session_email');
  await auth.signOut();
  window.location.href = 'index.html';
}

function attachMasks() {
  ['signup-cpf', 'profile-cpf'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (event) => { event.target.value = maskCPF(event.target.value); });
  });
  ['signup-phone', 'profile-phone'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (event) => { event.target.value = maskPhone(event.target.value); });
  });
  ['address-zip'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (event) => { event.target.value = maskZip(event.target.value); });
  });
}

function wireEvents() {
  $('#login-form')?.addEventListener('submit', handleLogin);
  $('#signup-form')?.addEventListener('submit', handleSignup);
  $('#profile-form')?.addEventListener('submit', handleProfileSave);
  $('#address-form')?.addEventListener('submit', handleAddressSave);
  $('#edit-username-btn')?.addEventListener('click', toggleUsernameEdit);
  $('#edit-phone-btn')?.addEventListener('click', togglePhoneEdit);
  $('#save-phone-btn')?.addEventListener('click', handleStartPhoneVerification);
  $('#confirm-phone-code-btn')?.addEventListener('click', handleConfirmPhoneVerification);
  $('#logout-btn')?.addEventListener('click', handleLogout);
  $('#clear-address-form')?.addEventListener('click', clearAddressForm);
  $('#go-signup-btn')?.addEventListener('click', () => showTopTab('signup'));
  $('#tab-login')?.addEventListener('click', () => showTopTab('login'));
  $('#tab-signup')?.addEventListener('click', () => showTopTab('signup'));
  $('#tab-account')?.addEventListener('click', () => {
    showTopTab('account');
    showAccountSection(state.currentSection);
  });
  $('#side-tab-account')?.addEventListener('click', () => showAccountSection('account'));
  $('#side-tab-addresses')?.addEventListener('click', () => showAccountSection('addresses'));
  $('#side-tab-orders')?.addEventListener('click', () => showAccountSection('orders'));
  $('#toggle-login-password')?.addEventListener('click', () => togglePassword('login-password'));
  $('#toggle-signup-password')?.addEventListener('click', () => togglePassword('signup-password'));
  $('#signup-password')?.addEventListener('input', updatePasswordStrength);
  $('#profile-phone')?.addEventListener('input', () => {
    if (state.phoneVerificationPending && onlyDigits($('#profile-phone')?.value || '') !== state.pendingPhoneDigits) {
      resetPhoneVerificationFlow();
    }
    syncPhoneVerificationUi();
  });
  $('#profile-username')?.addEventListener('input', () => syncPhoneVerificationUi());
  $('#phone-verification-code')?.addEventListener('input', () => syncPhoneVerificationUi());
}

function handleFocusParam() {
  const focus = new URLSearchParams(window.location.search).get('focus');
  if (focus === 'addresses') {
    showAccountSection('addresses');
    setFeedback('Antes de finalizar o pagamento, cadastre um endereco de entrega.', 'error');
  } else if (focus === 'orders') {
    showAccountSection('orders');
  }
}

function bootstrap() {
  attachMasks();
  wireEvents();
  applyAuthLayout(false);
  showTopTab('login');

  auth.onAuthStateChanged(async (user) => {
    state.currentUser = user || null;
    clearFeedback();

    if (!user || user.isAnonymous) {
      state.currentProfile = null;
      state.phoneVerificationEnabled = false;
      applyAuthLayout(false);
      showTopTab('login');
      return;
    }

    applyAuthLayout(true);
    showTopTab('account');
    showAccountSection('account');

    try {
      await loadAccountData();
      handleFocusParam();
    } catch (error) {
      setFeedback(error.message || 'Nao foi possivel carregar sua conta.', 'error');
      toast(error.message || 'Falha ao carregar dados da conta.', 'error');
    }
  });
}

bootstrap();
