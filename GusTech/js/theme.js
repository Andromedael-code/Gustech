(function () {
  const STORAGE_KEY = 'gustech_theme';
  let switchCleanupTimer = null;

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme, { instant = false } = {}) {
    const root = document.documentElement;
    if (!instant) root.classList.add('theme-switching');
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    document.querySelectorAll('[data-theme-icon]').forEach((icon) => {
      icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
    document.querySelectorAll('[data-theme-label]').forEach((label) => {
      label.textContent = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
    });

    if (!instant) {
      window.clearTimeout(switchCleanupTimer);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          switchCleanupTimer = window.setTimeout(() => {
            root.classList.remove('theme-switching');
          }, 60);
        });
      });
    }
  }

  function buildButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saas-theme-toggle';
    button.setAttribute('data-theme-toggle', 'true');
    button.setAttribute('aria-label', 'Alternar tema');
    button.innerHTML = '<i data-theme-icon class="fas fa-moon"></i><span class="sr-only" data-theme-label>Tema escuro</span>';
    button.addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
    });
    return button;
  }

  function ensureToggle() {
    if (document.querySelector('[data-theme-toggle]')) return;
    const slot = document.querySelector('[data-theme-slot]');
    if (!slot) return;
    slot.appendChild(buildButton());
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme(), { instant: true });
    ensureToggle();
    document.body.classList.add('fade-page');
  });
})();
