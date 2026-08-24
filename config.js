window.FRESHFLOW_CONFIG = {
  SUPABASE_URL: 'https://qyqokcayqtapiaktszbv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_9wQObf0XPDjW2_Mcv69Qrg_Pmzwd4-D',
  DEFAULT_BUSINESS_NAME: 'Superkleen Dry Cleaners',
  RECEIPT_ADDRESS: '',
  RECEIPT_PHONE: '',
  RECEIPT_FOOTER: 'Thank you for choosing Superkleen.'
};

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
