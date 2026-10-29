// Exercises Quick Docket against the real page with a fake Supabase client.
// Run from a static server at the repo root:
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.js node tests/quick-docket.mjs
import { mkdir } from 'node:fs/promises';

const playwright = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chromium = playwright.chromium || playwright.default?.chromium;

const ARTIFACTS = '/opt/cursor/artifacts';
const BIZ = '20000000-0000-4000-8000-000000000001';
const BRANCH = '20000000-0000-4000-8000-000000000002';
const USER = '20000000-0000-4000-8000-000000000003';

const services = [
  ['10000000-0000-4000-8000-000000000001', 'Dry-cleaning', 'Gents', 'Shirt', 45, 'item'],
  ['10000000-0000-4000-8000-000000000002', 'Dry-cleaning', 'Gents', 'Trousers', 55, 'item'],
  ['10000000-0000-4000-8000-000000000003', 'Dry-cleaning', 'Gents', 'Jacket', 85, 'item'],
  ['10000000-0000-4000-8000-000000000004', 'Dry-cleaning', 'Ladies', 'Dress', 95, 'item'],
  ['10000000-0000-4000-8000-000000000005', 'Dry-cleaning', 'Ladies', 'Skirt', 65, 'item'],
  ['10000000-0000-4000-8000-000000000006', 'Dry-cleaning', 'Gents', 'Jersey', 70, 'item'],
  ['10000000-0000-4000-8000-000000000007', 'Dry-cleaning', 'Gents', 'Suit 2 piece', 180, 'item'],
  ['10000000-0000-4000-8000-000000000008', 'Dry-cleaning', 'Gents', 'Overcoat', 140, 'item'],
  ['10000000-0000-4000-8000-000000000009', 'Laundry', 'Mixed', 'Mixed laundry', 30, 'kg'],
  ['10000000-0000-4000-8000-000000000010', 'Housekeeping', 'Bedding', 'Duvet single', 120, 'item'],
  ['10000000-0000-4000-8000-000000000011', 'Press Only', 'Gents', 'Shirt', 25, 'item'],
  ['10000000-0000-4000-8000-000000000012', 'Dry-cleaning', 'Gents', 'Tie', 20, 'item'],
  ['10000000-0000-4000-8000-000000000013', 'Dry-cleaning', 'Ladies', 'Wedding dress beaded', 450, 'item'],
  ['10000000-0000-4000-8000-000000000014', 'Dry-cleaning', 'Gents', 'T-shirt', 35, 'item'],
  ['10000000-0000-4000-8000-000000000015', 'Leather&Suede', 'Jackets', 'Leather jacket', 220, 'item'],
  ['10000000-0000-4000-8000-000000000016', 'Housekeeping', 'Soft furnishings', 'Curtains per kg', 40, 'kg']
].map(([id, category, service_group, item_name, price, unit]) => ({
  id, category, service_group, item_name, name: item_name, unit, price, active: true, catalog_code: id.slice(-4)
}));

const SHIRT = services[0].id;
const TROUSERS = services[1].id;
const TIE = services[11].id;
const DUVET = services[9].id;
const WEDDING = services[12].id;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function jhbPlus(days) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function installMock(opts) {
  const role = typeof opts === 'string' ? opts : (opts && opts.role);
  const shopName = (opts && opts.shop) || 'Superkleen Dry Cleaners';
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve();
  const services = window.__ffServices;
  const branchPrices = window.__ffBranchPrices || [];
  const settings = window.__ffSettings || {
    receipt_title: /superkleen/i.test(shopName) ? 'SUPERKLEEN' : shopName,
    receipt_subtitle: /superkleen/i.test(shopName) ? 'DRY CLEANERS' : 'Dry Cleaners',
    receipt_footer: /superkleen/i.test(shopName) ? 'Thank you for choosing Superkleen.' : 'Thank you for your business.',
    message_name: /superkleen/i.test(shopName) ? 'Superkleen' : shopName,
    receipt_address: /superkleen/i.test(shopName) ? '12 Main Road, Claremont' : '1 Harbour Road',
    receipt_phone: '0215550101'
  };
  const customers = [
    { id: 'c-amina', name: 'Amina Naidoo', phone: '0825551234', business_id: '20000000-0000-4000-8000-000000000001' },
    { id: 'c-sipho', name: 'Sipho Dlamini', phone: '0831112222', business_id: '20000000-0000-4000-8000-000000000001' }
  ];
  const orders = [
    {
      id: 'ready-1', order_number: 1400, status: 'Ready', due_date: '2026-10-28', instructions: '', total: 90,
      payment_status: 'unpaid', created_at: new Date().toISOString(), customer_id: 'c-amina', branch_id: '20000000-0000-4000-8000-000000000002',
      customers: { name: 'Amina Naidoo', phone: '0825551234' },
      order_items: [{ service_id: services[0].id, description: 'Dry-cleaning · Gents · Shirt', quantity: 2, unit_price: 45 }]
    },
    {
      id: 'wash-1', order_number: 1401, status: 'Received', due_date: '2026-10-30', instructions: '', total: 55,
      payment_status: 'unpaid', created_at: new Date().toISOString(), customer_id: 'c-sipho', branch_id: '20000000-0000-4000-8000-000000000002',
      customers: { name: 'Sipho Dlamini', phone: '0831112222' },
      order_items: [{ service_id: services[1].id, description: 'Dry-cleaning · Gents · Trousers', quantity: 1, unit_price: 55 }]
    }
  ];
  const payments = [];
  window.__ffCalls = [];
  window.__ffOpened = [];
  window.__ffRole = role;
  const docs = [];
  window.open = () => {
    const doc = { html: '', write(s) { this.html += String(s); }, close() {} };
    docs.push(doc);
    window.__ffOpened.push(doc);
    return { document: doc, close() {}, closed: false };
  };
  function staffRow() {
    return {
      id: '20000000-0000-4000-8000-000000000003',
      business_id: '20000000-0000-4000-8000-000000000001',
      branch_id: '20000000-0000-4000-8000-000000000002',
      full_name: 'Thandi Nkosi',
      role: window.__ffRole || 'owner',
      businesses: { name: shopName, currency: 'ZAR' }
    };
  }
  function from(table) {
    const state = { op: 'select', filters: {}, payload: null };
    const exec = () => {
      window.__ffCalls.push({ type: state.op, table, filters: { ...state.filters }, payload: state.payload });
      if (state.op === 'update' && table === 'orders') {
        const row = orders.find(o => o.id === state.filters.id);
        if (row && state.payload && state.payload.status) row.status = state.payload.status;
        return { data: null, error: null };
      }
      if (state.op !== 'select') return { data: null, error: null };
      if (table === 'staff') return { data: staffRow(), error: null };
      if (table === 'services') return { data: services, error: null };
      if (table === 'customers') return { data: customers, error: null };
      if (table === 'orders') return { data: orders, error: null };
      if (table === 'payments') return { data: payments, error: null };
      if (table === 'businesses') return { data: { id: staffRow().business_id, name: shopName }, error: null };
      if (table === 'branches') return { data: [{ id: '20000000-0000-4000-8000-000000000002', name: 'Main', active: true }], error: null };
      if (table === 'branch_service_prices') return { data: branchPrices, error: null };
      if (table === 'business_settings') return { data: { business_id: staffRow().business_id, ...settings }, error: null };
      return { data: [], error: null };
    };
    const b = {
      select() { return b; }, insert(p) { state.op = 'insert'; state.payload = p; return b; },
      update(p) { state.op = 'update'; state.payload = p; return b; },
      upsert(p) { state.op = 'upsert'; state.payload = p; return b; },
      delete() { state.op = 'delete'; return b; },
      eq(col, val) { state.filters[col] = val; return b; },
      order() { return b; }, limit() { return b; }, gte() { return b; }, lte() { return b; },
      not() { return b; }, in() { return b; }, neq() { return b; },
      maybeSingle() { return Promise.resolve(exec()); },
      single() { return Promise.resolve(exec()); },
      then(ok, err) { return Promise.resolve(exec()).then(ok, err); }
    };
    return b;
  }
  window.__ffMock = {
    auth: {
      async signInWithPassword() { return { data: { user: { id: '20000000-0000-4000-8000-000000000003', email: 'counter@superkleen.test', user_metadata: {} } }, error: null }; },
      async getSession() { return { data: { session: null } }; },
      async signOut() { return { error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
    },
    from,
    rpc(name, args) {
      window.__ffCalls.push({ type: 'rpc', name, args });
      if (name === 'create_order') {
        const total = (args.p_items || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
        const id = 'order-' + (orders.length + 1);
        orders.push({
          id, order_number: 1500 + orders.length, status: 'Received', due_date: args.p_due_date,
          instructions: args.p_instructions || '', total, payment_status: args.p_payment_method ? 'paid' : 'unpaid',
          created_at: new Date().toISOString(), customer_id: args.p_customer_id || 'new-customer',
          branch_id: '20000000-0000-4000-8000-000000000002',
          customers: { name: args.p_customer_name, phone: args.p_customer_phone },
          order_items: args.p_items
        });
        if (args.p_payment_method) payments.push({ id: 'pay-' + id, order_id: id, amount: total, method: args.p_payment_method, created_at: new Date().toISOString(), orders: { order_number: 1500, branch_id: '20000000-0000-4000-8000-000000000002' } });
        return Promise.resolve({ data: id, error: null });
      }
      if (name === 'record_order_payment') {
        payments.push({ id: 'pay-' + args.p_order_id, order_id: args.p_order_id, amount: args.p_amount, method: args.p_method, created_at: new Date().toISOString(), orders: { order_number: 1400, branch_id: '20000000-0000-4000-8000-000000000002' } });
        return Promise.resolve({ data: 'pay-' + args.p_order_id, error: null });
      }
      if (name === 'confirm_order_collection') {
        const row = orders.find(o => o.id === args.p_order_id);
        if (row) row.status = 'Collected';
        return Promise.resolve({ data: args.p_order_id, error: null });
      }
      return Promise.resolve({ data: name === 'install_superkleen_catalog' ? services.length : 0, error: null });
    },
    channel() { const c = { on() { return c; }, subscribe() { return c; } }; return c; }
  };
  localStorage.setItem('superkleen_favourites', JSON.stringify(['10000000-0000-4000-8000-000000000013']));
}

async function prepare(page, role, shop) {
  await page.addInitScript(payload => {
    window.__ffServices = payload.services;
    window.__ffBranchPrices = payload.branchPrices;
    window.__ffSettings = payload.settings || null;
  }, {
    services,
    branchPrices: shop && !/superkleen/i.test(shop) ? [] : [
      { branch_id: BRANCH, service_id: SHIRT, price: 60, active: true },
      { branch_id: BRANCH, service_id: '10000000-0000-4000-8000-000000000014', price: 35, active: false }
    ],
    settings: null
  });
  await page.addInitScript(installMock, { role, shop: shop || 'Superkleen Dry Cleaners' });
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.supabase={createClient:function(){return window.__ffMock;}};'
  }));
  page.on('pageerror', err => { page.__pageErrors = page.__pageErrors || []; page.__pageErrors.push(String(err)); });
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
}

async function login(page) {
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ffq="1"]', { timeout: 15000 });
  await page.fill('#loginEmail', 'counter@superkleen.test');
  await page.fill('#loginPassword', 'counter-test');
  await page.click('#login button');
  await page.waitForSelector('#ffqTiles .ffq-tile', { timeout: 15000 });
  await page.waitForFunction(() => document.body.classList.contains('ff-quick') && document.getElementById('ffqNew').classList.contains('active'));
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prepare(page, 'owner');
  await login(page);

  const title = await page.title();
  assert(title.includes('Superkleen Dry Cleaners'), 'title is ' + title);
  assert(title !== 'Superkleen', 'title is still the hard-coded shop name');
  const shopLine = await page.locator('#ffqShopLine').innerText();
  assert(shopLine.includes('Superkleen Dry Cleaners'), 'shop line ' + shopLine);
  const shirtPrice = await page.locator(`#ffqTiles [data-add="${SHIRT}"] .ffq-tile-price`).innerText();
  assert(shirtPrice.includes('60'), 'shirt tile price ' + shirtPrice);
  assert(!shirtPrice.includes('45'), 'shirt tile still shows the shop price ' + shirtPrice);
  const loginCopy = await page.locator('.login p.muted').innerText();
  assert(/counter/i.test(loginCopy), 'login still shows version copy: ' + loginCopy);

  const names = await page.locator('#ffqTiles .ffq-tile-name').allTextContents();
  for (const expected of ['Shirt', 'Trousers', 'Jacket', 'Dress', 'Skirt', 'Jersey', 'Suit 2 piece', 'Overcoat', 'Mixed laundry', 'Duvet single', 'Press Shirt', 'Tie', 'Other item']) {
    assert(names.includes(expected), 'missing tile ' + expected + ' in ' + names.join(' | '));
  }
  assert(!names.some(n => /wedding|t-shirt|leather|curtain/i.test(n)), 'unexpected tile ' + names.join(' | '));
  const font = await page.locator('#ffqTiles .ffq-tile-name').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert(font >= 18, 'tile text is ' + font + 'px');
  const tileBox = await page.locator('#ffqTiles .ffq-tile').first().boundingBox();
  assert(tileBox.height >= 96, 'tile height ' + tileBox.height);
  const appText = await page.locator('#app').innerText();
  for (const bad of ['Production checks', 'Business isolation', 'Sync catalogue', 'V0.9', 'V0.6', 'PASS', 'FAIL']) {
    assert(!appText.includes(bad), 'staff screen shows ' + bad);
  }
  assert(!(await page.locator('#neworder').evaluate(el => el.classList.contains('active'))), 'old sale is still the active screen');
  assert(!(await page.locator('[data-ffq="back"]').isVisible()), 'back to counter shows on the counter itself');

  await page.locator(`#ffqTiles [data-add="${SHIRT}"]`).click();
  await page.locator(`#ffqTiles [data-add="${SHIRT}"]`).click();
  await page.locator(`#ffqTiles [data-add="${TROUSERS}"]`).click();
  await page.locator(`#ffqLines [data-remove="${TROUSERS}"]`).click();
  assert((await page.locator('#ffqLines').innerText()).includes('Shirt'));
  assert(!(await page.locator('#ffqLines').innerText()).includes('Trousers'));
  await page.locator(`#ffqTiles [data-add="${TROUSERS}"]`).click();
  await page.fill('#ffqPhone', '0825551234');
  await page.waitForFunction(() => document.getElementById('ffqName').value === 'Amina Naidoo');
  assert((await page.locator('#ffqMatch').innerText()).includes('Existing customer'));
  const due = await page.inputValue('#ffqDue');
  assert(due === jhbPlus(2), 'due date ' + due + ' expected ' + jhbPlus(2));
  const saveSize = await page.locator('#ffqSave').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert(saveSize >= 22, 'save button text is ' + saveSize + 'px');

  await page.screenshot({ path: ARTIFACTS + '/quick_docket_desktop.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const nav = document.querySelector('.side');
    const lines = document.getElementById('ffqLines');
    if (!nav || !lines) return;
    const overlap = lines.getBoundingClientRect().bottom - nav.getBoundingClientRect().top - 4;
    if (overlap > 0) window.scrollBy(0, overlap);
  });
  await page.screenshot({ path: ARTIFACTS + '/quick_docket_tablet.png' });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('[data-ffq="owner"]').click();
  await page.waitForSelector('#ffqOwnerList button');
  await page.getByRole('button', { name: /Counter favourites/ }).click();
  await page.waitForSelector('#ffqPins:not(.hidden)');
  const chips = await page.locator('#ffqPinChips').innerText();
  assert(chips.includes('Press Shirt'), 'press item is not labelled in favourites: ' + chips);
  await page.screenshot({ path: ARTIFACTS + '/quick_docket_favourites.png' });
  await page.locator('#ffqPinsClose').click();
  await page.locator('[data-ffq="new"]').click();

  await page.locator('#ffqSave').click();
  await page.waitForFunction(() => (window.__ffCalls || []).some(c => c.type === 'rpc' && c.name === 'create_order'));
  const first = await page.evaluate(() => window.__ffCalls.filter(c => c.type === 'rpc' && c.name === 'create_order').pop());
  assert(first.args.p_customer_id === 'c-amina', 'customer id ' + first.args.p_customer_id);
  assert(first.args.p_customer_name === 'Amina Naidoo', 'name ' + first.args.p_customer_name);
  assert(first.args.p_customer_phone === '0825551234', 'phone ' + first.args.p_customer_phone);
  assert(first.args.p_due_date === jhbPlus(2), 'rpc due ' + first.args.p_due_date);
  assert(first.args.p_payment_method === null, 'payment should default to collection');
  const shirt = first.args.p_items.find(i => i.service_id === SHIRT);
  const trousers = first.args.p_items.find(i => i.service_id === TROUSERS);
  assert(first.args.p_items.length === 2, 'unexpected lines ' + JSON.stringify(first.args.p_items));
  assert(shirt && shirt.quantity === 2, 'shirt qty');
  assert(Number(shirt.unit_price) === 60, 'shirt sent the shop price ' + shirt.unit_price);
  assert(trousers && trousers.quantity === 1 && Number(trousers.unit_price) === 55, 'trousers price ' + (trousers && trousers.unit_price));
  assert(String(shirt.description).includes('Shirt'), 'description ' + shirt.description);
  await page.waitForFunction(() => (window.__ffOpened || []).length > 0);
  const printed = await page.evaluate(() => window.__ffOpened.map(d => d.html).join('\n'));
  assert(printed.includes('Amina Naidoo'), 'receipt was not sent to the printer');
  assert(printed.includes('SUPERKLEEN'), 'receipt heading changed: ' + printed.slice(0, 400));
  assert(printed.includes('DRY CLEANERS'), 'receipt subtitle changed');
  assert(printed.includes('Thank you for choosing Superkleen.'), 'receipt footer changed');
  assert(printed.includes('80mm') || printed.includes('76mm'), 'receipt is not on the thermal layout');
  await page.evaluate(() => {
    const id = (data.orders || []).slice().reverse().find(o => o.customerName === 'Amina Naidoo' && o.order_number >= 1500)?.id;
    if (id) showReceipt(id);
  });
  await page.waitForSelector('#modal .receipt h2');
  const preview = await page.locator('#modal .receipt').innerText();
  assert(preview.includes('SUPERKLEEN') && preview.includes('Amina Naidoo'), 'receipt preview ' + preview);
  await page.screenshot({ path: ARTIFACTS + '/quick_docket_receipt.png' });
  await page.evaluate(() => closeModal());
  const savedBanner = await page.locator('#ffqLast').innerText();
  assert(savedBanner.includes('1502'), savedBanner);

  await page.locator('#ffqTiles .ffq-tile.other').click();
  await page.fill('#ffqSearchInput', 'T-shirt');
  const hiddenSearch = await page.locator('#ffqSearchResults').innerText();
  assert(!/t-shirt/i.test(hiddenSearch), 'hidden branch item is on the counter: ' + hiddenSearch);
  await page.fill('#ffqSearchInput', 'Tie');
  await page.locator('#ffqSearchResults [data-add]').first().click();
  await page.locator('#ffqSearchClose').click();
  await page.fill('#ffqPhone', '0712223344');
  await page.fill('#ffqName', 'Lerato Mokoena');
  await page.locator('#ffqPay [data-pay="cash"]').click();
  await page.locator('#ffqSave').click();
  await page.waitForFunction(() => (window.__ffCalls || []).filter(c => c.name === 'create_order').length >= 2);
  const second = await page.evaluate(() => window.__ffCalls.filter(c => c.name === 'create_order').pop());
  assert(second.args.p_customer_id === null, 'new customer should not reuse an id');
  assert(second.args.p_customer_name === 'Lerato Mokoena');
  assert(second.args.p_payment_method === 'cash');

  await page.locator('[data-ffq="owner"]').click();
  await page.getByRole('button', { name: /All orders/ }).click();
  await page.waitForSelector('#ordersList');
  const ordersText = await page.locator('#ordersList').innerText();
  assert(ordersText.includes('Lerato Mokoena'), 'new order missing from the order list');
  assert(ordersText.includes('Amina Naidoo'), 'existing order missing from the order list');
  await page.locator('.navbtn', { hasText: 'Sale' }).click();
  await page.waitForSelector('#products .product');
  const productCount = await page.locator('#products .product').count();
  assert(productCount >= 12, 'full catalogue hid items: ' + productCount);

  await page.locator('[data-ffq="back"]').click();
  await page.locator('[data-ffq="ready"]').click();
  await page.waitForSelector('[data-ready="wash-1"]');
  await page.locator('[data-ready="wash-1"]').click();
  await page.waitForFunction(() => (window.__ffCalls || []).some(c => c.type === 'update' && c.table === 'orders' && c.payload && c.payload.status === 'Ready'));
  await page.locator('[data-ffq="collect"]').click();
  await page.waitForSelector('[data-collect="ready-1"][data-method="cash"]');
  await page.locator('[data-collect="ready-1"][data-method="cash"]').click();
  await page.waitForFunction(() => (window.__ffCalls || []).some(c => c.name === 'record_order_payment' && c.args.p_order_id === 'ready-1' && c.args.p_method === 'cash' && Number(c.args.p_amount) === 90));
  await page.waitForFunction(() => (window.__ffCalls || []).some(c => c.name === 'confirm_order_collection' && c.args.p_order_id === 'ready-1'));

  await page.locator('[data-ffq="owner"]').click();
  await page.getByRole('button', { name: /Counter favourites/ }).click();
  await page.locator('#ffqDuePlus').click();
  assert((await page.locator('#ffqDueDays').innerText()) === '3');
  await page.locator('#ffqDueMinus').click();
  await page.locator(`[data-unpin="${SHIRT}"]`).click();
  await page.locator('#ffqPinsClose').click();
  await page.locator('[data-ffq="new"]').click();
  const afterUnpin = await page.locator('#ffqTiles .ffq-tile-name').allTextContents();
  assert(!afterUnpin.includes('Shirt'), 'removed favourite still on the counter: ' + afterUnpin.join(' | '));
  assert(afterUnpin.includes('Press Shirt'));
  await page.locator('[data-ffq="owner"]').click();
  await page.getByRole('button', { name: /Counter favourites/ }).click();
  await page.locator('#ffqPinsReset').click();
  await page.locator('#ffqPinsClose').click();

  await page.evaluate(payload => localStorage.setItem(payload.key, JSON.stringify(payload.ids)), { key: 'superkleen_quick_pins_' + BIZ, ids: [TIE, DUVET] });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ffq="1"]');
  await page.fill('#loginEmail', 'counter@superkleen.test');
  await page.fill('#loginPassword', 'counter-test');
  await page.click('#login button');
  await page.waitForSelector('#ffqTiles .ffq-tile');
  const pinned = await page.locator('#ffqTiles .ffq-tile-name').allTextContents();
  assert(pinned.includes('Tie') && pinned.includes('Duvet single') && pinned.includes('Other item'), pinned.join(' | '));
  assert(pinned.length === 3, 'custom pins leaked other items: ' + pinned.join(' | '));

  const errors = page.__pageErrors || [];
  assert(!errors.length, 'page errors: ' + errors.join('\n'));
  await page.close();

  const staff = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prepare(staff, 'staff');
  await login(staff);
  await staff.screenshot({ path: ARTIFACTS + '/quick_docket_staff_nav.png' });
  const ownerLabel = await staff.locator('[data-ffq="owner"] span').innerText();
  assert(ownerLabel === 'More', 'staff tab label ' + ownerLabel);
  await staff.locator('[data-ffq="owner"]').click();
  const menu = await staff.locator('#ffqOwnerList').innerText();
  assert(!menu.includes('Counter favourites'), 'staff can edit favourites');
  assert(!menu.includes('System check'), 'staff can see the system check');
  assert(!menu.includes('Reports'), 'staff can see owner reports');
  assert(menu.includes('All orders'));
  await staff.locator('[data-ffq="cash"]').click();
  await staff.waitForSelector('#ffqCashNote');
  const cashCopy = await staff.locator('#cashup').innerText();
  assert(/owner closes the till/i.test(cashCopy), 'cash up copy ' + cashCopy);
  assert(await staff.locator('#cashup button.primary').isDisabled(), 'staff can close the till');
  assert(!(await staff.evaluate(() => (window.__ffCalls || []).some(c => c.name === 'close_daily_cashup'))), 'staff closed the till');
  await staff.locator('[data-ffq="owner"]').click();
  await staff.getByRole('button', { name: /Price list/ }).click();
  await staff.waitForSelector('#priceBookGrid .priceitem');
  const priceText = await staff.locator('#pricebook').innerText();
  assert(!priceText.includes('Sync catalogue'), 'sync catalogue visible to staff');
  assert(!priceText.includes('Add to counter'), 'staff can pin counter items');
  const staffErrors = staff.__pageErrors || [];
  assert(!staffErrors.length, 'staff page errors: ' + staffErrors.join('\n'));
  await staff.close();

  const other = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prepare(other, 'owner', 'Harbour Laundry');
  await login(other);
  const otherTitle = await other.title();
  assert(otherTitle.includes('Harbour Laundry'), 'other shop title ' + otherTitle);
  assert(!/superkleen/i.test(otherTitle), 'other shop title still says Superkleen');
  const otherLine = await other.locator('#ffqShopLine').innerText();
  assert(otherLine === 'Harbour Laundry', 'other shop line ' + otherLine);
  assert(!/superkleen/i.test(await other.locator('#app').innerText()), 'Harbour Laundry screen mentions Superkleen');
  await other.locator(`#ffqTiles [data-add="${SHIRT}"]`).click();
  const harbourPrice = await other.locator(`#ffqTiles [data-add="${SHIRT}"] .ffq-tile-price`).innerText();
  assert(harbourPrice.includes('45'), 'Harbour shirt should use its shop price ' + harbourPrice);
  await other.fill('#ffqPhone', '0719998877');
  await other.fill('#ffqName', 'Noah Jacobs');
  await other.locator('#ffqSave').click();
  await other.waitForFunction(() => (window.__ffOpened || []).length > 0);
  const harbourSlip = await other.evaluate(() => window.__ffOpened.map(d => d.html).join('\n'));
  assert(harbourSlip.includes('Harbour Laundry'), 'Harbour receipt heading missing');
  assert(!harbourSlip.includes('SUPERKLEEN'), 'Harbour receipt uses the Superkleen heading');
  assert(!harbourSlip.includes('Thank you for choosing Superkleen.'), 'Harbour receipt uses the Superkleen footer');
  const otherErrors = other.__pageErrors || [];
  assert(!otherErrors.length, 'harbour page errors: ' + otherErrors.join('\n'));
  await browser.close();
  console.log('Quick Docket checks passed');
}

main().catch(err => { console.error(err); process.exit(1); });
