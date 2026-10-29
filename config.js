window.FRESHFLOW_CONFIG = {
  SUPABASE_URL: 'https://qyqokcayqtapiaktszbv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_9wQObf0XPDjW2_Mcv69Qrg_Pmzwd4-D'
};

/* Hide the old sale screen until Quick Docket is ready. If that script fails to load, show the existing app. */
(function () {
  var veil = document.createElement('style');
  veil.id = 'ffq-veil';
  veil.textContent = 'html,body{background:#f3f6f4}#app:not(.ff-booted){visibility:hidden}';
  document.head.appendChild(veil);
  setTimeout(function () {
    if (!document.body.dataset.ffq) {
      var app = document.getElementById('app');
      if (app) app.classList.add('ff-booted');
    }
  }, 8000);
})();

window.addEventListener('load', () => {
  const script = document.createElement('script');
  script.src = '/v06.js?v=2';
  script.onload = () => {
    const cash = document.createElement('script');
    cash.src = '/v06cash.js?v=1';
    cash.onload = () => {
      const product = document.createElement('script');
      product.src = '/v07.js?v=4';
      product.onload = () => {
        const dashboard = document.createElement('script');
        dashboard.src = '/dashboard-v07.js?v=4';
        dashboard.onload = () => {
          const bridge = document.createElement('script');
          bridge.src = '/profile-bridge.js?v=1';
          bridge.onload = () => {
            const complete = document.createElement('script');
            complete.src = '/v07-complete.js?v=1';
            complete.onload = () => {
              const business = document.createElement('script');
              business.src = '/v08-business.js?v=1';
              business.onload = () => {
                const ui = document.createElement('script');
                ui.src = '/ui-v09.js?v=1';
                ui.onload = () => {
                  const printers = document.createElement('script');
                  printers.src = '/printer-routing-v09.js?v=3';
                  printers.onload = () => {
                    const quick = document.createElement('script');
                    quick.src = '/quick-docket.js?v=4';
                    quick.onerror = () => {
                      const app = document.getElementById('app');
                      if (app) app.classList.add('ff-booted');
                    };
                    document.body.appendChild(quick);
                  };
                  document.body.appendChild(printers);
                };
                document.body.appendChild(ui);
              };
              document.body.appendChild(business);
            };
            document.body.appendChild(complete);
          };
          document.body.appendChild(bridge);
        };
        document.body.appendChild(dashboard);
      };
      document.body.appendChild(product);
    };
    document.body.appendChild(cash);
  };
  document.body.appendChild(script);
});
