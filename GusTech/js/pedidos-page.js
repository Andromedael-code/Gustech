import { auth } from './firebase-app.js';
import { api, currency, escapeHtml, qs, toast } from './storefront-core.js';

function formatDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function setFeedback(message, type = 'error') {
  const node = qs('#feedback');
  if (!node) return;
  node.textContent = message;
  node.className = `text-sm mt-4 ${type === 'error' ? 'text-red-300' : 'text-slate-300'}`;
  node.classList.remove('hidden');
}

function statusLabel(status = 'pending') {
  const labels = {
    pending: 'Pendente',
    paid: 'Pago',
    processing: 'Em processamento',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

function statusClass(status = 'pending') {
  if (status === 'delivered') return 'status-pill--ok';
  if (status === 'cancelled') return 'status-pill--warn';
  return 'status-pill--info';
}

function renderOrders(orders = []) {
  const root = qs('#orders-list');
  if (!root) return;

  if (!orders.length) {
    root.innerHTML = `
      <div class="empty-state">
        <h2 class="text-2xl font-display font-bold mb-2">Voce ainda nao fez pedidos</h2>
        <p class="text-slate-400">Assim que concluir uma compra, seus pedidos vao aparecer aqui com status e itens.</p>
        <a class="primary-btn mt-4" href="index.html">Voltar para a loja</a>
      </div>
    `;
    return;
  }

  root.innerHTML = orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemCount = items.reduce((acc, item) => acc + Number(item.quantity || 0), 0);
    return `
      <article class="surface-panel rounded-[28px] p-5 md:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="mini-meta">Pedido #${escapeHtml(order.id)}</div>
            <h2 class="text-2xl font-display font-bold mt-1">${statusLabel(order.status)}</h2>
            <div class="mini-meta mt-2">${formatDate(order.createdAt)}</div>
          </div>
          <span class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</span>
        </div>
        <div class="mt-5 grid gap-4 md:grid-cols-3">
          <div class="surface-panel rounded-2xl px-4 py-3">
            <div class="mini-meta">Itens</div>
            <div class="text-lg font-semibold mt-1">${itemCount} item(ns)</div>
          </div>
          <div class="surface-panel rounded-2xl px-4 py-3">
            <div class="mini-meta">Total</div>
            <div class="text-lg font-semibold mt-1">${currency(order.total || 0)}</div>
          </div>
          <div class="surface-panel rounded-2xl px-4 py-3">
            <div class="mini-meta">Pagamento</div>
            <div class="text-lg font-semibold mt-1">${escapeHtml(order.method || '-')}</div>
          </div>
        </div>
        <div class="mt-5 space-y-3">
          ${items.map((item) => `
            <div class="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
              <img src="${escapeHtml(item.image || '')}" alt="${escapeHtml(item.name || 'Produto')}" class="w-16 h-16 rounded-2xl object-cover bg-slate-900 border border-white/10">
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-white">${escapeHtml(item.name || 'Produto')}</div>
                <div class="mini-meta mt-1">Quantidade: ${Number(item.quantity || 1)}</div>
              </div>
              <div class="text-right">
                <div class="mini-meta">Subtotal</div>
                <div class="font-semibold">${currency(Number(item.price || 0) * Number(item.quantity || 1))}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </article>
    `;
  }).join('');
}

async function loadOrders() {
  const response = await api('/orders/me');
  renderOrders(response.orders || []);
}

function bootstrap() {
  auth.onAuthStateChanged(async (user) => {
    if (!user || user.isAnonymous) {
      setFeedback('Faca login para ver seus pedidos.', 'error');
      setTimeout(() => { window.location.href = 'conta.html?next=pedidos.html'; }, 700);
      return;
    }

    try {
      await loadOrders();
    } catch (error) {
      setFeedback(error.message || 'Nao foi possivel carregar seus pedidos agora.', 'error');
      toast(error.message || 'Falha ao carregar pedidos.', 'error');
    }
  });
}

bootstrap();
