// FreshFlow profile bridge
// The core app declares `profile` with top-level let, so it is not a window property.
// Newer dynamically loaded modules use window/globalThis. Keep them synchronised.
(() => {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    try {
      if (typeof profile !== 'undefined' && profile && profile.id) {
        window.profile = profile;
        window.FRESHFLOW_PROFILE = profile;
        window.FRESHFLOW_ROLE = String(profile.role || 'staff').trim().toLowerCase();

        const rolePill = document.getElementById('rolePill');
        if (rolePill) rolePill.textContent = window.FRESHFLOW_ROLE;

        const nav = document.querySelector('.nav');
        if (nav && ['owner','admin'].includes(window.FRESHFLOW_ROLE) && !nav.querySelector('[data-v07="reports"]')) {
          const b = document.createElement('button');
          b.dataset.v07 = 'reports';
          b.innerHTML = '<b>▥</b>Reports';
          b.onclick = () => window.openV07 && openV07('reports');
          nav.appendChild(b);
        }

        if (typeof window.renderFreshDashboard === 'function') {
          const dash = document.getElementById('dashboard');
          if (dash && dash.classList.contains('active')) window.renderFreshDashboard();
        }
        clearInterval(timer);
      }
    } catch (e) {
      console.error('FreshFlow profile bridge', e);
    }
    if (attempts > 200) clearInterval(timer);
  }, 100);
})();
