const isLocalHost = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
window.GUSTECH_API_URL = window.GUSTECH_API_URL || (isLocalHost ? 'http://localhost:8080/api' : '/api');

function createRequestController(externalSignal, timeoutMs = 12_000) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason || new DOMException('Requisição cancelada.', 'AbortError'));

  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException('A requisição demorou demais para responder.', 'AbortError'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
    }
  };
}

async function resolveAuthUser() {
  const auth = window.firebase?.auth?.();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;

  if (!window.__gustechAuthReadyPromise) {
    window.__gustechAuthReadyPromise = new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe();
        resolve(user || null);
      });
    });
  }

  return window.__gustechAuthReadyPromise;
}

window.gustechApi = {
  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const { signal, cleanup } = createRequestController(options.signal, options.timeoutMs);
    const user = await resolveAuthUser();
    const storedRole = localStorage.getItem('gustech_user_role') || 'user';

    if (user && !user.isAnonymous) {
      try {
        if (!headers.Authorization) {
          headers.Authorization = `Bearer ${await user.getIdToken()}`;
        }
        headers['x-user-id'] = user.uid;
        headers['x-user-email'] = String(user.email || '').toLowerCase();
        headers['x-user-role'] = storedRole;
        if (user.email) localStorage.setItem('gustech_session_email', String(user.email).toLowerCase());
      } catch {
        await window.firebase?.auth?.().signOut().catch(() => {});
        localStorage.removeItem('gustech_local_cart');
      }
    }

    try {
      const response = await fetch(`${window.GUSTECH_API_URL}${path}`, { ...options, headers, signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Erro na API.');
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (options.signal?.aborted) throw new Error('A requisição foi cancelada.');
        throw new Error('A conexão demorou demais. Tente novamente.');
      }
      if (error instanceof TypeError) throw new Error('Não foi possível se conectar ao servidor.');
      throw error;
    } finally {
      cleanup();
    }
  }
};
