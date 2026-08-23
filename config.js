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
      product.src = '/v07.js?v=2';
      product.onload = () => {
        const dashboard = document.createElement('script');
        dashboard.src = '/dashboard-v07.js?v=2';
        document.body.appendChild(dashboard);
      };
      document.body.appendChild(product);
    };
    document.body.appendChild(cash);
  };
  document.body.appendChild(script);
});
