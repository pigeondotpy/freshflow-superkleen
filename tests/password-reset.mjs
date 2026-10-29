// End-to-end password reset against a local stand-in for Supabase Auth.
// The stand-in captures the reset email (the way Mailpit would) and redirects
// like GoTrue: hash tokens for the implicit flow, ?code= for PKCE.
// Run: node tests/password-reset.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const ARTIFACTS = '/opt/cursor/artifacts';
const LIVE_URL = 'https://qyqokcayqtapiaktszbv.supabase.co';
const USER_ID = '20000000-0000-4000-8000-000000000003';
const BIZ = '20000000-0000-4000-8000-000000000001';
const BRANCH = '20000000-0000-4000-8000-000000000002';
const OWNER_EMAIL = 'owner@shop.test';
const OLD_PASSWORD = 'old-password-1';
const NEW_PASSWORD = 'new-password-9';
const NEUTRAL = "If that email has an account, we've sent a reset link.";

const services = [
  { id: '10000000-0000-4000-8000-000000000001', category: 'Dry-cleaning', service_group: 'Gents', item_name: 'Shirt', name: 'Shirt', unit: 'item', price: 45, active: true, catalog_code: '0001' },
  { id: '10000000-0000-4000-8000-000000000002', category: 'Dry-cleaning', service_group: 'Gents', item_name: 'Trousers', name: 'Trousers', unit: 'item', price: 55, active: true, catalog_code: '0002' }
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function publicUser(user) {
  const now = new Date().toISOString();
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now
  };
}

async function startAuth(port, flow) {
  const users = new Map([[OWNER_EMAIL, { id: USER_ID, email: OWNER_EMAIL, password: OLD_PASSWORD }]]);
  const tokens = new Map();
  const codes = new Map();
  const inbox = [];
  const seen = [];

  function issueSession(user) {
    const access = 'access-' + randomBytes(12).toString('hex');
    const refresh = 'refresh-' + randomBytes(12).toString('hex');
    tokens.set(access, { user, refresh });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: publicUser(user)
    };
  }

  function bearer(req) {
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    return tokens.get(token) || null;
  }

  function send(res, status, body) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    });
    res.end(payload);
  }

  const types = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    seen.push(req.method + ' ' + url.pathname);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS'
      });
      res.end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }

    if (url.pathname === '/__test/inbox') return send(res, 200, inbox);
    if (url.pathname === '/__test/inbox.html') {
      const html = '<!doctype html><meta charset="utf-8"><title>Reset email</title><body style="font-family:sans-serif;padding:24px"><h1>Reset email</h1>' + (inbox.length ? inbox.map(item => `<p><a href="${item.link}">Open the reset link for ${item.email}</a></p>`).join('') : '<p>No email yet. Go back and send the reset link.</p>') + '</body>';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    if (url.pathname === '/__test/seen') return send(res, 200, seen.slice(-40));

    if (url.pathname === '/auth/v1/recover' && req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const redirectTo = url.searchParams.get('redirect_to') || `http://127.0.0.1:${port}/`;
      const token = randomBytes(16).toString('hex');
      const link = `http://127.0.0.1:${port}/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`;
      if (users.has(email)) inbox.push({ email, redirectTo, link, flow });
      return send(res, 200, {});
    }

    if (url.pathname === '/auth/v1/verify' && req.method === 'GET') {
      const email = OWNER_EMAIL;
      const user = users.get(email);
      const redirectTo = url.searchParams.get('redirect_to') || `http://127.0.0.1:${port}/`;
      if (!user || url.searchParams.get('type') !== 'recovery') {
        const dest = new URL(redirectTo);
        dest.hash = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
        res.writeHead(302, { location: dest.toString() });
        res.end();
        return;
      }
      if (flow === 'pkce') {
        const code = 'code-' + randomBytes(8).toString('hex');
        codes.set(code, email);
        const dest = new URL(redirectTo);
        dest.searchParams.set('code', code);
        res.writeHead(302, { location: dest.toString() });
        res.end();
        return;
      }
      const session = issueSession(user);
      const dest = new URL(redirectTo);
      dest.hash = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: '3600',
        token_type: 'bearer',
        type: 'recovery'
      }).toString();
      res.writeHead(302, { location: dest.toString() });
      res.end();
      return;
    }

    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const email = String(body.email || '').trim().toLowerCase();
        const user = users.get(email);
        if (!user || user.password !== body.password) {
          return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
        }
        return send(res, 200, issueSession(user));
      }
      if (grant === 'pkce') {
        const email = codes.get(body.auth_code);
        codes.delete(body.auth_code);
        const user = email && users.get(email);
        if (!user) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid code' });
        return send(res, 200, issueSession(user));
      }
      if (grant === 'refresh_token') {
        const row = [...tokens.values()].find(entry => entry.refresh === body.refresh_token);
        if (!row) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid refresh token' });
        return send(res, 200, issueSession(row.user));
      }
      return send(res, 400, { msg: 'Unsupported grant' });
    }

    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const row = bearer(req);
      if (!row) return send(res, 401, { msg: 'Not signed in' });
      return send(res, 200, publicUser(row.user));
    }

    if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
      const row = bearer(req);
      if (!row) return send(res, 401, { msg: 'Not signed in' });
      if (typeof body.password === 'string') row.user.password = body.password;
      return send(res, 200, publicUser(row.user));
    }

    if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('/')[0];
      const staff = {
        id: USER_ID,
        business_id: BIZ,
        branch_id: BRANCH,
        full_name: 'Shop Owner',
        role: 'owner',
        businesses: { name: 'Superkleen Dry Cleaners', currency: 'ZAR' }
      };
      const settings = {
        business_id: BIZ,
        receipt_title: 'SUPERKLEEN',
        receipt_subtitle: 'DRY CLEANERS',
        receipt_footer: 'Thank you for choosing Superkleen.',
        message_name: 'Superkleen'
      };
      const rows = {
        staff: [staff],
        services,
        customers: [],
        orders: [],
        payments: [],
        branches: [{ id: BRANCH, name: 'Main', active: true }],
        branch_service_prices: [],
        cashups: [],
        business_settings: [settings],
        businesses: [{ id: BIZ, name: 'Superkleen Dry Cleaners' }],
        refunds: [],
        audit_log: []
      };
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-range': '0-0/0' });
        res.end();
        return;
      }
      if (url.pathname.includes('/rpc/')) return send(res, 200, null);
      const list = rows[table] || [];
      const accept = req.headers.accept || '';
      if (accept.includes('application/vnd.pgrst.object+json')) return send(res, 200, list[0] || null);
      return send(res, 200, list);
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = normalize(join(ROOT, pathname.replace(/^\/+/, '')));
    if (!filePath.startsWith(normalize(ROOT))) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      let text = await readFile(filePath);
      if (pathname === '/config.js') {
        let source = text.toString('utf8').replace(
          `SUPABASE_URL: '${LIVE_URL}',`,
          `SUPABASE_URL: 'http://127.0.0.1:${port}',${flow === 'pkce' ? "\n  AUTH_FLOW: 'pkce'," : ''}`
        );
        text = Buffer.from(source);
      }
      res.writeHead(200, { 'content-type': types[extname(pathname)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(text);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });

  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, inbox, users, seen };
}

async function launch() {
  const playwright = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const chromium = playwright.chromium || playwright.default?.chromium;
  return chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve();
  });
  page.on('pageerror', err => {
    page.__pageErrors = page.__pageErrors || [];
    page.__pageErrors.push(String(err));
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE', msg.text());
  });
  return page;
}

async function signIn(page, email, password) {
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', password);
  await page.locator('#signinPanel button.primary').click();
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true });
  const implicit = await startAuth(8771, 'implicit');
  const browser = await launch();
  const page = await openPage(browser, 8771);
  const origin = 'http://127.0.0.1:8771';

  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ffq="1"]', { timeout: 15000 });
  const signInLabel = await page.locator('#signinPanel button.primary').innerText();
  const createLabel = await page.locator('#signinPanel button.switch').innerText();
  assert(signInLabel.trim() === 'Sign in', signInLabel);
  assert(createLabel.trim() === 'Create a new shop', createLabel);
  assert(await page.locator('#forgotPanel').isHidden(), 'forgot panel is open on the sign-in screen');
  await page.screenshot({ path: ARTIFACTS + '/password_reset_signin.png' });

  await signIn(page, OWNER_EMAIL, OLD_PASSWORD);
  await page.waitForSelector('#ffqTiles .ffq-tile', { timeout: 15000 });
  await page.waitForFunction(() => document.body.classList.contains('ff-quick') && document.getElementById('ffqNew').classList.contains('active'));
  const title = await page.title();
  assert(title.includes('Superkleen Dry Cleaners'), 'title after normal sign-in: ' + title);
  assert(await page.locator('#app').isVisible(), 'till stayed hidden after a normal sign-in');
  await page.screenshot({ path: ARTIFACTS + '/password_reset_quick_docket.png' });
  await page.locator('.actions button', { hasText: 'Sign out' }).click();
  await page.waitForSelector('#signinPanel:not(.hidden)', { timeout: 15000 });

  await page.locator('.forgotrow button').click();
  await page.waitForSelector('#forgotPanel:not(.hidden)');
  await page.fill('#forgotEmail', 'nobody@example.com');
  await page.locator('#forgotSend').click();
  await page.waitForFunction(text => document.getElementById('forgotHint').textContent === text, NEUTRAL);
  assert(implicit.inbox.length === 0, 'unknown email was given a reset link');

  await page.evaluate(() => { document.getElementById('forgotHint').textContent = ''; });
  await page.fill('#forgotEmail', OWNER_EMAIL);
  await page.locator('#forgotSend').click();
  await page.waitForFunction(text => document.getElementById('forgotHint').textContent === text && document.getElementById('forgotSend').textContent === 'Send reset link', NEUTRAL);
  assert(implicit.inbox.length === 1, 'reset email was not captured');
  assert(implicit.inbox[0].redirectTo === origin + '/', 'redirectTo was ' + implicit.inbox[0].redirectTo);
  const sentCopy = await page.locator('#forgotHint').innerText();
  assert(sentCopy === NEUTRAL, sentCopy);
  await page.screenshot({ path: ARTIFACTS + '/password_reset_sent.png' });

  await page.goto(implicit.inbox[0].link, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#recoveryPanel:not(.hidden)', { timeout: 15000 });
  await page.waitForSelector('body[data-ffq="1"]', { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('loginTitle').textContent === 'Set a new password');
  assert(await page.locator('#app').isHidden(), 'Quick Docket opened before a new password was set');
  assert(!(await page.locator('#ffqNew').isVisible()), 'New docket is visible during password reset');
  assert(await page.evaluate(() => sessionStorage.getItem('ff_password_recovery') === '1'), 'recovery flag missing');
  await page.screenshot({ path: ARTIFACTS + '/password_reset_new_password.png' });

  await page.fill('#newPassword', 'short');
  await page.fill('#confirmPassword', 'short');
  await page.locator('#savePassword').click();
  assert((await page.locator('#recoveryHint').innerText()).includes('8 characters'), await page.locator('#recoveryHint').innerText());
  assert(await page.locator('#app').isHidden(), 'short password opened the till');

  await page.fill('#newPassword', NEW_PASSWORD);
  await page.fill('#confirmPassword', 'different-password');
  await page.locator('#savePassword').click();
  assert((await page.locator('#recoveryHint').innerText()).toLowerCase().includes('do not match'), await page.locator('#recoveryHint').innerText());

  await page.fill('#confirmPassword', NEW_PASSWORD);
  await page.locator('#savePassword').click();
  await page.waitForSelector('#ffqTiles .ffq-tile', { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('login').offsetParent && document.body.classList.contains('ff-quick'));
  assert(implicit.users.get(OWNER_EMAIL).password === NEW_PASSWORD, 'password was not updated');
  assert(await page.evaluate(() => sessionStorage.getItem('ff_password_recovery') !== '1'), 'recovery flag still set after save');
  await page.screenshot({ path: ARTIFACTS + '/password_reset_signed_in.png' });

  await page.locator('.actions button', { hasText: 'Sign out' }).click();
  await page.waitForSelector('#signinPanel:not(.hidden)', { timeout: 15000 });
  await signIn(page, OWNER_EMAIL, OLD_PASSWORD);
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Invalid login credentials'));
  assert(await page.locator('#app').isHidden(), 'old password signed in');

  await signIn(page, OWNER_EMAIL, NEW_PASSWORD);
  await page.waitForSelector('#ffqTiles .ffq-tile', { timeout: 15000 });
  assert(await page.locator('#ffqTiles .ffq-tile-name', { hasText: 'Shirt' }).isVisible(), 'Quick Docket tiles missing after the new password');

  const errors = page.__pageErrors || [];
  assert(!errors.length, 'page errors: ' + errors.join('\n'));
  await page.close();
  await new Promise(resolve => implicit.server.close(resolve));

  const pkce = await startAuth(8772, 'pkce');
  const pkcePage = await openPage(browser, 8772);
  await pkcePage.goto('http://127.0.0.1:8772/', { waitUntil: 'domcontentloaded' });
  await pkcePage.waitForSelector('body[data-ffq="1"]');
  await pkcePage.locator('.forgotrow button').click();
  await pkcePage.fill('#forgotEmail', OWNER_EMAIL);
  await pkcePage.locator('#forgotSend').click();
  await pkcePage.waitForFunction(text => document.getElementById('forgotHint').textContent === text, NEUTRAL);
  assert(pkce.inbox.length === 1, 'pkce reset email missing');
  assert(pkce.inbox[0].redirectTo.startsWith('http://127.0.0.1:8772/'), pkce.inbox[0].redirectTo);
  await pkcePage.goto(pkce.inbox[0].link, { waitUntil: 'domcontentloaded' });
  await pkcePage.waitForSelector('#recoveryPanel:not(.hidden)', { timeout: 15000 });
  await pkcePage.waitForSelector('body[data-ffq="1"]');
  assert(await pkcePage.locator('#app').isHidden(), 'PKCE recovery opened the till');
  assert((await pkcePage.locator('#loginTitle').innerText()) === 'Set a new password');
  await pkcePage.screenshot({ path: ARTIFACTS + '/password_reset_pkce.png' });
  await pkcePage.fill('#newPassword', 'pkce-password-1');
  await pkcePage.fill('#confirmPassword', 'pkce-password-1');
  await pkcePage.locator('#savePassword').click();
  await pkcePage.waitForSelector('#ffqTiles .ffq-tile', { timeout: 15000 });
  assert(pkce.users.get(OWNER_EMAIL).password === 'pkce-password-1', 'pkce password was not saved');
  const pkceErrors = pkcePage.__pageErrors || [];
  assert(!pkceErrors.length, 'pkce page errors: ' + pkceErrors.join('\n'));
  await browser.close();
  await new Promise(resolve => pkce.server.close(resolve));
  console.log('Password reset checks passed');
}

if (process.argv.includes('--serve')) {
  const port = Number(process.env.PORT || 8771);
  const flow = process.env.FLOW || 'implicit';
  await startAuth(port, flow);
  console.log(`password reset stand-in on http://127.0.0.1:${port} (${flow})`);
} else {
  main().catch(err => { console.error(err); process.exit(1); });
}
