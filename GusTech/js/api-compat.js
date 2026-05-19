(function () {
  const noop = () => {};
  async function resolveAuthUser() {
    const auth = window.firebase?.auth?.();
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;

    if (!window.__gustechCompatAuthReadyPromise) {
      window.__gustechCompatAuthReadyPromise = new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          unsubscribe();
          resolve(user || null);
        });
      });
    }

    return window.__gustechCompatAuthReadyPromise;
  }

  async function authHeaders(existingHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...(existingHeaders || {}) };
    const user = await resolveAuthUser();
    const storedRole = localStorage.getItem('gustech_user_role') || 'user';
    const storedEmail = String(localStorage.getItem('gustech_session_email') || '').toLowerCase();

    if (user) {
      if (!headers.Authorization) headers.Authorization = `Bearer ${await user.getIdToken()}`;
      headers['x-user-id'] = user.uid;
      headers['x-user-email'] = String(user.email || '').toLowerCase();
      headers['x-user-role'] = storedRole;
      if (user.email) localStorage.setItem('gustech_session_email', String(user.email).toLowerCase());
    } else if (storedEmail) {
      headers['x-user-id'] = storedEmail.replace(/[^a-z0-9]/gi, '-');
      headers['x-user-email'] = storedEmail;
      headers['x-user-role'] = storedRole;
    }

    return headers;
  }

  async function api(path, options = {}) {
    const headers = await authHeaders(options.headers);
    const response = await fetch(`${window.GUSTECH_API_URL || 'http://localhost:8080/api'}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha na API.');
    return data;
  }

  function wrapDocs(items) {
    return items.map((item) => ({
      id: item.id || item.docId,
      exists: true,
      data: () => item
    }));
  }

  function snapshotFrom(items) {
    const docs = wrapDocs(items);
    return { empty: docs.length === 0, size: docs.length, docs };
  }

  class Query {
    constructor(resource, state = {}) { this.resource = resource; this.state = state; }
    orderBy(field) { return new Query(this.resource, { ...this.state, orderBy: field }); }
    where(field, op, value) { return new Query(this.resource, { ...this.state, where: { field, op, value } }); }
    limit(value) { return new Query(this.resource, { ...this.state, limit: value }); }
    async get() { return this.resource.query(this.state); }
    onSnapshot(success, error) { this.get().then(success).catch(error || noop); return noop; }
  }

  class ResourceDoc {
    constructor(resource, id) { this.resource = resource; this.id = id; }
    async get() { return this.resource.get(this.id); }
    async set(data, options) { return this.resource.set(this.id, data, options); }
    async update(data) { return this.resource.update(this.id, data); }
    async delete() { return this.resource.delete(this.id); }
    collection(name) { return this.resource.subcollection(this.id, name); }
  }

  function productsResource() {
    return {
      orderBy(field) { return new Query(this, { orderBy: field }); },
      where(field, op, value) { return new Query(this, { ...this.state, where: { field, op, value } }); },
      limit(value) { return new Query(this, { limit: value }); },
      doc(id) { return new ResourceDoc(this, id); },
      async add(data) { const res = await api('/products', { method: 'POST', body: JSON.stringify(data) }); return { id: res.product.id }; },
      async query(state = {}) {
        const sortMap = { name: 'name', createdAt: 'newest', relevanceScore: 'relevance' };
        const params = new URLSearchParams();
        params.set('sort', sortMap[state.orderBy] || 'relevance');
        if (state.limit) params.set('limit', state.limit);
        if (state.where?.field === 'category' && state.where?.op === '==') params.set('category', state.where.value);
        const res = await api(`/products?${params.toString()}`);
        return snapshotFrom(res.products || []);
      },
      async get(id) {
        const res = await api(`/products/${id}`);
        return { id: res.product.id, exists: true, data: () => res.product };
      },
      async set(id, data) { await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
      async update(id, data) { await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
      async delete(id) { await api(`/products/${id}`, { method: 'DELETE' }); },
      subcollection(id, name) {
        if (name !== 'reviews') throw new Error('Subcolecao nao suportada.');
        return reviewsResource(id);
      }
    };
  }

  function reviewsResource(productId) {
    return {
      orderBy() { return new Query(this, {}); },
      limit() { return new Query(this, {}); },
      async add(data) { await api(`/reviews/${productId}`, { method: 'POST', body: JSON.stringify({ rating: data.rating, comment: data.comment }) }); },
      async query() { const res = await api(`/reviews/${productId}`); return snapshotFrom(res.reviews || []); },
      async get() { return this.query(); },
      onSnapshot(success, error) { this.query().then(success).catch(error || noop); return noop; }
    };
  }

  function ordersResource() {
    return {
      orderBy(field) { return new Query(this, { orderBy: field }); },
      where(field, op, value) { return new Query(this, { where: { field, op, value } }); },
      limit(value) { return new Query(this, { limit: value }); },
      doc(id) { return new ResourceDoc(this, id); },
      async add(data) {
        const res = await api('/orders', { method: 'POST', body: JSON.stringify(data) });
        return { id: String(res.orderId) };
      },
      async query(state = {}) {
        const params = new URLSearchParams();
        if (state.limit) params.set('limit', state.limit);
        if (state.where?.field === 'status' && state.where?.op === '==') params.set('status', state.where.value);
        const res = await api(`/orders${params.toString() ? `?${params.toString()}` : ''}`);
        return snapshotFrom(res.orders || []);
      },
      async get(id) {
        const res = await api('/orders/me');
        const item = (res.orders || []).find((order) => String(order.id) === String(id));
        return { id, exists: !!item, data: () => item || {} };
      },
      async set(id, data) {
        if (data.status) return api(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: data.status }) });
        if (data.invoice) return api(`/orders/${id}/invoice`, { method: 'POST', body: JSON.stringify({}) });
        if (data.shipping) return api(`/orders/${id}/shipping-label`, { method: 'POST', body: JSON.stringify({ carrier: data.shipping.carrier || 'Correios' }) });
        throw new Error('Atualizacao de pedido nao suportada.');
      },
      async update(id, data) { return this.set(id, data); },
      async delete() { throw new Error('Remocao de pedidos nao suportada.'); }
    };
  }

  function cartResource(uid) {
    return {
      orderBy() { return new Query(this, {}); },
      doc(id) { return new ResourceDoc(this, id); },
      async add(data) { const res = await api('/cart/me', { method: 'POST', body: JSON.stringify(data) }); return { id: res.docId }; },
      async query() { const res = await api('/cart/me'); return snapshotFrom(res.items || []); },
      onSnapshot(success, error) { this.query().then(success).catch(error || noop); return noop; },
      async get(id) {
        const res = await api('/cart/me');
        const item = (res.items || []).find((row) => row.docId === id);
        return { id, exists: !!item, data: () => item || {} };
      },
      async set() { throw new Error('Operacao nao suportada no carrinho.'); },
      async update(id, data) { return api(`/cart/me/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); },
      async delete(id) { await api(`/cart/me/${id}`, { method: 'DELETE' }); },
      subcollection() { throw new Error('Subcolecao nao suportada.'); }
    };
  }

  function usersResource() {
    return {
      doc(uid) {
        return {
          collection(name) {
            if (name !== 'cart') throw new Error('Apenas cart e suportado.');
            return cartResource(uid);
          },
          async get() {
            const res = await api('/users/me');
            return { exists: !!res.profile, data: () => ({ ...(res.profile || {}), addresses: res.addresses || [] }) };
          }
        };
      }
    };
  }

  function adminsResource() {
    return {
      orderBy() { return new Query(this, {}); },
      async query() { const res = await api('/users/admins'); return snapshotFrom(res.admins || []); }
    };
  }

  window.gustechCompatDb = {
    collection(name) {
      if (name === 'products') return productsResource();
      if (name === 'orders') return ordersResource();
      if (name === 'users') return usersResource();
      if (name === 'admins') return adminsResource();
      throw new Error(`Colecao nao suportada: ${name}`);
    },
    batch() {
      const ops = [];
      return {
        delete(ref) { ops.push(() => ref.delete()); },
        set(ref, data, options) { ops.push(() => ref.set(data, options)); },
        async commit() { for (const op of ops) await op(); }
      };
    }
  };
})();
