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
  script.src = '/v06.js?v=1';
  document.body.appendChild(script);
});
