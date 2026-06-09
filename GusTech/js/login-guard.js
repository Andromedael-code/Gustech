(function () {
  function withTimeout(promise, timeoutMs = 6_000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('Auth timeout')), timeoutMs);
      })
    ]);
  }

  async function authenticatedUser() {
    try {
      const auth = window.firebase?.auth?.();
      const user = auth?.currentUser || null;
      if (!user || user.isAnonymous) return null;
      const token = await withTimeout(user.getIdToken(true));
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6_000);
      const response = await fetch(`${window.GUSTECH_API_URL || '/api'}/users/me`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': user.uid,
          'x-user-email': String(user.email || '').toLowerCase(),
          'x-user-role': localStorage.getItem('gustech_user_role') || 'user'
        }
      });
      window.clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Invalid session');
      return user;
    } catch {
      await window.firebase?.auth?.().signOut().catch(() => {});
      localStorage.removeItem('gustech_local_cart');
      return null;
    }
  }

  function showLoginPrompt(next) {
    let modal = document.getElementById('login-required-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'login-required-modal';
      modal.className = 'login-required-modal hidden';
      modal.innerHTML = `
        <div class="login-required-modal__backdrop" data-login-modal-close></div>
        <section class="login-required-modal__panel" role="dialog" aria-modal="true" aria-labelledby="login-required-title">
          <button class="login-required-modal__close" type="button" aria-label="Fechar" data-login-modal-close>
            <i class="fas fa-xmark"></i>
          </button>
          <div class="login-required-modal__icon"><i class="fas fa-user-lock"></i></div>
          <h2 id="login-required-title">Entre para continuar</h2>
          <p>Para proteger seus dados, carrinho, endereco e pagamento ficam disponiveis apenas apos login.</p>
          <div class="login-required-modal__actions">
            <a class="primary-btn" data-login-modal-enter href="conta.html">Entrar ou criar conta</a>
            <button class="secondary-btn" type="button" data-login-modal-close>Continuar navegando</button>
          </div>
        </section>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-login-modal-close]')) modal.classList.add('hidden');
      });
    }
    modal.querySelector('[data-login-modal-enter]')?.setAttribute('href', `conta.html?next=${encodeURIComponent(next)}`);
    modal.classList.remove('hidden');
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!/(^|\/)(carrinho|pagamento)\.html(?:[?#].*)?$/.test(href)) return;
    event.preventDefault();
    void authenticatedUser().then((user) => {
      if (user) window.location.href = href;
      else showLoginPrompt(href);
    });
  });
})();
