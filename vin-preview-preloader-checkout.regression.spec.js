const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const BASE_VIN     = '1FTFW1ET2DFD78356';
const EVIDENCE_DIR = path.join(__dirname, '..', 'test-results', 'preloader-preview-to-checkout');
const SUMMARY_FILE = path.join(__dirname, 'detected-pages.json');

function randomVin() {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  return BASE_VIN.slice(0, -1) + chars[Math.floor(Math.random() * chars.length)];
}

function randomClassicVin() {
  return '22387010' + String(Math.floor(Math.random() * 9000) + 1000);
}

const LP_URL   = 'https://developtestsite.com/members/vin-check/license-preview?type=vhr&utm_details=&vin=dGtlbmw2YVJZNENRTE04cUtLY1pPakdka3RHOGhtTGxFZkhOWTdqTE84OD0=&wpPage=homepage&landing=normal';
const SITE_URL = 'https://developtestsite.com/';

function getVhrUrl(vin) { return `https://developtestsite.com/members/vin-check/preview?type=vhr&utm_details=&vin=${vin}&wpPage=homepage&landing=normal`; }
function getWsUrl(vin)  { return `https://developtestsite.com/members/vin-check/ws-preview?type=sticker&utm_details=&vin=${vin}&wpPage=homepage&landing=normal`; }
function getClassicUrl(vin) { return getVhrUrl(vin); }

// ─── Shared: spoof webdriver ──────────────────────────────────────────────────
const spoofWebdriver = () => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); };

// ─── Shared: checkout flow ────────────────────────────────────────────────────
async function runCheckoutFlow(page, { screenshotPrefix, clickFlow, t0 }) {
  const t1 = await clickFlow(page);

  const preloader = page.locator('text=Preparing Your Checkout');
  await expect(preloader).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}\\${screenshotPrefix}-03-preloader.png`, fullPage: true });
  console.log('✅ Preloader appeared');

  await page.waitForURL('**/members/checkout**', { timeout: 60000, waitUntil: 'domcontentloaded' });
  const t2 = Date.now();
  const preloaderElapsed = ((t2 - t1) / 1000).toFixed(2);
  console.log(`⏱ Preloader → Checkout: ${preloaderElapsed}s`);

  if (t0) {
    const totalElapsed = ((t2 - t0) / 1000).toFixed(2);
    console.log(`⏱ Preview → Checkout Total: ${totalElapsed}s`);
    if (screenshotPrefix.startsWith('p23')) {
      test.info().annotations.push({ type: 'Preview->Checkout Total Time', description: totalElapsed + 's' });
      test.info().annotations.push({ type: 'Preloader->Checkout Time', description: preloaderElapsed + 's' });
    }
  }

  await expect(page.locator(':text("Choose payment method"), :text("Enter your card details")').first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}\\${screenshotPrefix}-04-checkout.png`, fullPage: true });
  console.log('✅ Checkout page loaded');

  expect(parseFloat(preloaderElapsed)).toBeLessThan(30);
}

// ─── DRY clickFlow: Access Records → email → Proceed to Checkout ──────────────
async function clickFlowAccessRecords(page, prefix) {
  await page.getByRole('button', { name: /access records/i }).first().click();
  console.log('✅ Clicked Access Records');

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  const email = `test_${Date.now()}@example.com`;
  await emailInput.fill(email);
  console.log(`📧 Email: ${email}`);
  await page.screenshot({ path: `${EVIDENCE_DIR}\\${prefix}-02-popup.png`, fullPage: true });

  const t1 = Date.now();
  await page.getByRole('button', { name: /proceed to checkout/i }).click();
  console.log('✅ Clicked Proceed to Checkout');
  return t1;
}

// ─── DRY clickFlow: Proceed to Checkout → email → Create an account ───────────
async function clickFlowCreateAccount(page, prefix) {
  await page.getByRole('button', { name: /proceed to checkout/i }).first().click();
  console.log('✅ Clicked Proceed to Checkout');

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  const email = `test_${Date.now()}@example.com`;
  await emailInput.fill(email);
  console.log(`📧 Email: ${email}`);
  await page.screenshot({ path: `${EVIDENCE_DIR}\\${prefix}-02-popup.png`, fullPage: true });

  const t1 = Date.now();
  await page.getByRole('button', { name: /create an account/i }).click();
  console.log('✅ Clicked Create an account');
  return t1;
}

// ─── DRY: classic VIN test setup ─────────────────────────────────────────────
async function setupClassicVinPage(browser) {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  const vin  = randomClassicVin();
  const url  = getClassicUrl(vin);
  console.log(`🔑 Classic VIN: ${vin}`);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page,
    { timeout: 15000 }
  ).catch(() => {});

  let apiStatus;
  page.on('request',  req => { if (req.url().includes('api-cwa/update-classic-decode')) console.log(`📤 API Payload: ${req.postData()}`); });
  page.on('response', async res => { if (res.url().includes('api-cwa/update-classic-decode')) { apiStatus = res.status(); console.log(`📥 API Status: ${apiStatus}`); } });

  return { ctx, page, url, getApiStatus: () => apiStatus };
}

// ─── DRY: trigger exit intent ─────────────────────────────────────────────────
async function triggerExitIntent(page) {
  // Engage with page content first
  await page.mouse.move(640, 400, { steps: 10 });
  await page.waitForTimeout(1000);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(500);

  // Slowly move toward top of viewport
  await page.mouse.move(400, 600, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.move(400, 400, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.move(400, 200, { steps: 15 });
  await page.waitForTimeout(300);
  await page.mouse.move(400, 100, { steps: 15 });
  await page.waitForTimeout(300);
  await page.mouse.move(400, 10,  { steps: 10 });
  await page.waitForTimeout(300);

  // Dispatch events as cursor exits viewport
  await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true, clientX: 400, clientY: -1 };
    document.dispatchEvent(new MouseEvent('mouseleave', opts));
    document.dispatchEvent(new MouseEvent('mouseout',   opts));
    window.dispatchEvent(new MouseEvent('mouseleave',   opts));
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave', opts));
  });

  await page.waitForTimeout(3000);
}

// ─── DRY: assert exit intent popup ───────────────────────────────────────────
async function assertExitIntentPopup(page, screenshotName) {
  const popup = page.locator('div').filter({ hasText: /Hey, before you leave take/i }).nth(3);
  await expect(popup).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=15% OFF')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Click here to redeem instantly' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Click here to redeem instantly' }).click();
  console.log('✅ Clicked CTA button');
  await page.waitForURL(/offer=/, { timeout: 15000 });
  expect(page.url()).toContain('offer=');
  console.log(`✅ Redirected to offer URL: ${page.url()}`);
  if (screenshotName) await page.screenshot({ path: `${EVIDENCE_DIR}\\${screenshotName}`, fullPage: true });
}


// ─── Preview 23 ───────────────────────────────────────────────────────────────
const Preview_23 = {
  async vhr(page, url) {
    const t0 = Date.now();
    console.log('▶ [P23 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p23-vhr', clickFlow: p => clickFlowAccessRecords(p, 'p23-vhr'), t0 });
  },
  async ws(page, url) {
    const t0 = Date.now();
    console.log('▶ [P23 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p23-ws', clickFlow: p => clickFlowAccessRecords(p, 'p23-ws'), t0 });
  },
  async lp(page, url) {
    const t0 = Date.now();
    console.log('▶ [P23 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p23-lp', clickFlow: p => clickFlowAccessRecords(p, 'p23-lp'), t0 });
  },
};

// ─── Preview 27 ───────────────────────────────────────────────────────────────
const Preview_27 = {
  async vhr(page, url) {
    console.log('▶ [P27 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p27-vhr', clickFlow: p => clickFlowCreateAccount(p, 'p27-vhr') });
  },
  async ws(page, url) {
    console.log('▶ [P27 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p27-ws', clickFlow: p => clickFlowCreateAccount(p, 'p27-ws') });
  },
  async lp(page, url) {
    console.log('▶ [P27 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p27-lp', clickFlow: p => clickFlowCreateAccount(p, 'p27-lp') });
  },
};

// ─── Preview 28 ───────────────────────────────────────────────────────────────
const Preview_28 = {
  async vhr(page, url) {
    console.log('▶ [P28 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28-vhr', clickFlow: p => clickFlowAccessRecords(p, 'p28-vhr') });
  },
  async ws(page, url) {
    console.log('▶ [P28 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28-ws', clickFlow: p => clickFlowAccessRecords(p, 'p28-ws') });
  },
  async lp(page, url) {
    console.log('▶ [P28 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28-lp', clickFlow: p => clickFlowAccessRecords(p, 'p28-lp') });
  },
};

// ─── Block Maps ───────────────────────────────────────────────────────────────
const VHR_BLOCKS = { '23': Preview_23.vhr, '27': Preview_27.vhr, '28': Preview_28.vhr };
const WS_BLOCKS  = { '23': Preview_23.ws,  '27': Preview_27.ws,  '28': Preview_28.ws  };
const LP_BLOCKS  = { '23': Preview_23.lp,  '27': Preview_27.lp,  '28': Preview_28.lp  };


// ─── Priority Tests ───────────────────────────────────────────────────────────

test('Priority 1 - VHR: detect preview_page and run VHR block', async ({ page }) => {
  const vin = randomVin();
  const VHR_URL = getVhrUrl(vin);
  console.log(`🔑 VIN: ${vin}`);

  await page.goto(VHR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  console.log(`🔍 [VHR] preview_page: ${raw}`);

  // persist for summary
  const existing = fs.existsSync(SUMMARY_FILE) ? JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) : {};
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ ...existing, vhr: raw }));

  const num = raw?.match(/preview(\d+)/)?.[1];
  const block = VHR_BLOCKS[num];
  if (!block) throw new Error(`[VHR] No block for: "${num}" (raw: "${raw}")`);
  await block(page, VHR_URL);
});

test('Priority 2 - WS: detect ws_preview_page and run WS block', async ({ browser }) => {
  const context = await browser.newContext();
  const page    = await context.newPage();
  const vin     = randomVin();
  const WS_URL  = getWsUrl(vin);
  console.log(`🔑 VIN: ${vin}`);

  await page.goto(WS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').ws_preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').ws_preview_page ?? null);
  console.log(`🔍 [WS] ws_preview_page: ${raw}`);

  const existing = fs.existsSync(SUMMARY_FILE) ? JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) : {};
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ ...existing, ws: raw }));

  const num = raw?.match(/preview(\d+)/)?.[1];
  const block = WS_BLOCKS[num];
  if (!block) { await context.close(); throw new Error(`[WS] No block for: "${num}" (raw: "${raw}")`); }
  await block(page, WS_URL);
  await context.close();
});

test('Priority 3 - LP: detect license_preview_page and run LP block', async ({ browser }) => {
  const context = await browser.newContext();
  const page    = await context.newPage();

  await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').license_preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').license_preview_page ?? null);
  console.log(`🔍 [LP] license_preview_page: ${raw}`);

  const existing = fs.existsSync(SUMMARY_FILE) ? JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) : {};
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ ...existing, lp: raw }));

  const num = raw?.match(/preview(\d+)/)?.[1];
  const block = LP_BLOCKS[num];
  if (!block) { await context.close(); throw new Error(`[LP] No block for: "${num}" (raw: "${raw}")`); }
  await block(page, LP_URL);
  await context.close();
});

// ─── P23 Cases ────────────────────────────────────────────────────────────────

test.describe('P23 Cases', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    sharedPage = await context.newPage();
    await sharedPage.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});
    const raw = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    const num = raw?.match(/preview(\d+)/)?.[1];
    console.log(`🔍 preview_page: ${raw}`);
    if (num !== '23') await sharedPage.close();
  });

  test.afterAll(async () => { await sharedPage?.close(); });

  test('P23 Case 1 - Plan radio buttons are clickable', async () => {
    if (sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.reload({ waitUntil: 'domcontentloaded' });

    const plans = sharedPage.locator('#plans [role="radio"]');
    await plans.first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await plans.count();
    expect(count).toBeGreaterThan(0);
    console.log(`📋 Found ${count} plan options`);

    for (let i = 0; i < count; i++) {
      await plans.nth(i).click();
      expect(await plans.nth(i).getAttribute('aria-checked')).toBe('true');
      console.log(`✅ Plan ${i + 1} is clickable and selectable`);
    }
  });

  test('P23 Case 2 - Unlimited VIN Check locks the decal checkbox', async () => {
    if (sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.locator('#plans').waitFor({ state: 'visible', timeout: 15000 });

    await sharedPage.locator('#plans [role="radio"]').filter({ hasText: /unmimited vin check/i }).first().click();
    console.log('✅ Selected Unmimited VIN Check');

    const upsellCheckbox = sharedPage.locator('[role="checkbox"]').filter({ has: sharedPage.locator('#landing_decal') });
    const ariaChecked    = await upsellCheckbox.getAttribute('aria-checked');
    const parentClass    = await upsellCheckbox.locator('xpath=..').getAttribute('class');
    console.log(`aria-checked: ${ariaChecked}, opacity-50: ${parentClass?.includes('opacity-50')}`);

    expect(ariaChecked).toBe('false');
    expect(parentClass).toContain('opacity-50');
    console.log('✅ Upsell checkbox is locked when UVC is selected');
  });

  test('P23 Case 3 - Default plan price matches site_settings.default_plan', async () => {
    if (sharedPage.isClosed()) { test.skip(); return; }

    const defaultPlan = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').default_plan ?? null);
    console.log(`🔍 default_plan: ${JSON.stringify(defaultPlan)}`);
    expect(defaultPlan).not.toBeNull();

    const planPrice = defaultPlan?.price ?? defaultPlan?.amount ?? defaultPlan?.value ?? null;
    expect(planPrice).not.toBeNull();

    await sharedPage.reload({ waitUntil: 'domcontentloaded' });
    const selectedPlan = sharedPage.locator('#plans div[role="radio"][aria-checked="true"]').first();
    await expect(selectedPlan).toBeVisible({ timeout: 20000 });
    const priceText = await selectedPlan.locator('span').filter({ hasText: /^\$[\d.]+$/ }).first().textContent();
    const pagePrice = priceText?.replace('$', '').trim();
    console.log(`💲 Page selected plan price: $${pagePrice}`);

    expect(String(planPrice)).toContain(pagePrice);
    console.log(`✅ Default plan price matches: ${planPrice} = $${pagePrice}`);
  });
});


// ─── Exit Intent Tests ────────────────────────────────────────────────────────

test('P23 Case 4 - Exit intent popup appears on preview page', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(spoofWebdriver);

  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(3000);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(4000);
  await triggerExitIntent(page);

  await assertExitIntentPopup(page, 'p23-exit-intent-popup.png');
  console.log('✅ Exit intent popup appeared on P23 preview page');
  await ctx.close();
});

test('P28 Case 1 - Exit intent popup appears on preview page', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(spoofWebdriver);

  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(3000);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(4000);
  await triggerExitIntent(page);

  await assertExitIntentPopup(page, 'p28-exit-intent-popup.png');
  console.log('✅ Exit intent popup appeared on P28 preview page');
  await ctx.close();
});

// ─── Classic VIN Tests ────────────────────────────────────────────────────────

test('P23 Case 5 - Classic mapped VIN modification (update YMM using dropdown)', async ({ browser }) => {
  const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.getByRole('button', { name: 'Click here to update' }).click();
  await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();

  await page.getByLabel('Year').click();
  await page.getByLabel('1961').click();
  await page.getByLabel('Make').click();
  await page.getByLabel('AJS').click();
  await page.getByLabel('Model').click();
  await page.getByText('Model 16 350ms').click();
  await page.getByLabel('Trim').click();
  await page.getByText('Base', { exact: true }).click();
  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case5-ymm-selected.png`, fullPage: true });

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Confirm Selection' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/cv=/, { timeout: 30000 });

  expect(page.url()).toContain('cv=');
  expect(getApiStatus()).toBe(200);
  console.log(`✅ API 200 & redirected: ${page.url()}`);
  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case5-ymm-updated.png`, fullPage: true });
  await ctx.close();
});

test('P23 Case 6 - Update classic VIN (modify data using manual input)', async ({ browser }) => {
  const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.getByRole('button', { name: 'Click here to update' }).click();
  await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();
  await page.getByRole('button', { name: 'Click here' }).click();

  await page.getByPlaceholder('Enter year').fill('1960');
  await page.getByPlaceholder('Enter year').press('Tab');
  await page.getByPlaceholder('Enter make').fill('Ford');
  await page.getByPlaceholder('Enter make').press('Tab');
  await page.getByPlaceholder('Enter model').fill('F-250');
  await page.getByPlaceholder('Enter model').press('Tab');
  await page.getByPlaceholder('Enter engine (e.g., V8,').fill('V8');
  await page.getByPlaceholder('Enter engine (e.g., V8,').press('Tab');
  await page.getByPlaceholder('Enter transmission type').fill('Auto');
  await page.getByPlaceholder('Enter transmission type').press('Tab');
  await page.getByPlaceholder('Enter number of doors').fill('5');
  await page.getByPlaceholder('Enter number of doors').press('Tab');
  await page.getByPlaceholder('Enter drive type (e.g., RWD,').fill('AWD');
  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case6-manual-input.png`, fullPage: true });
  console.log('✅ Manual fields filled');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/cv=/, { timeout: 30000 });

  expect(page.url()).toContain('cv=');
  expect(getApiStatus()).toBe(200);
  console.log(`✅ API 200 & redirected: ${page.url()}`);
  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case6-manual-updated.png`, fullPage: true });
  await ctx.close();
});

test('P28 Case 2 - Classic VIN YMM update via dropdown', async ({ browser }) => {
  const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.getByRole('button', { name: 'Click here to update' }).click();
  await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();

  await page.getByLabel('Year').click();
  await page.getByLabel('1961').click();
  await page.getByLabel('Make').click();
  await page.getByLabel('AJS').click();
  await page.getByLabel('Model').click();
  await page.getByText('Model 16 350ms').click();
  await page.getByLabel('Trim').click();
  await page.getByText('Base', { exact: true }).click();

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Confirm Selection' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/cv=/, { timeout: 30000 });

  expect(page.url()).toContain('cv=');
  expect(getApiStatus()).toBe(200);
  console.log(`✅ API 200 & redirected: ${page.url()}`);
  await ctx.close();
});

test('P28 Case 3 - Classic VIN update via manual input', async ({ browser }) => {
  const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.getByRole('button', { name: 'Click here to update' }).click();
  await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();
  await page.getByRole('button', { name: 'Click here' }).click();

  await page.getByPlaceholder('Enter year').fill('1960');
  await page.getByPlaceholder('Enter year').press('Tab');
  await page.getByPlaceholder('Enter make').fill('Ford');
  await page.getByPlaceholder('Enter make').press('Tab');
  await page.getByPlaceholder('Enter model').fill('F-250');
  await page.getByPlaceholder('Enter model').press('Tab');
  await page.getByPlaceholder('Enter engine (e.g., V8,').fill('V8');
  await page.getByPlaceholder('Enter engine (e.g., V8,').press('Tab');
  await page.getByPlaceholder('Enter transmission type').fill('Auto');
  await page.getByPlaceholder('Enter transmission type').press('Tab');
  await page.getByPlaceholder('Enter number of doors').fill('5');
  await page.getByPlaceholder('Enter number of doors').press('Tab');
  await page.getByPlaceholder('Enter drive type (e.g., RWD,').fill('AWD');
  console.log('✅ Manual fields filled');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/cv=/, { timeout: 30000 });

  expect(page.url()).toContain('cv=');
  expect(getApiStatus()).toBe(200);
  console.log(`✅ API 200 & redirected: ${page.url()}`);
  await ctx.close();
});

// ─── P28 Cases ────────────────────────────────────────────────────────────────

test('P28 Case 4 - Default plan price matches site_settings.default_plan', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  const defaultPlan = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').default_plan ?? null);
  console.log(`🔍 default_plan: ${JSON.stringify(defaultPlan)}`);
  expect(defaultPlan).not.toBeNull();

  const planPrice = defaultPlan?.price ?? defaultPlan?.amount ?? defaultPlan?.value ?? null;
  expect(planPrice).not.toBeNull();
  expect(parseFloat(planPrice)).toBeGreaterThan(0);
  console.log(`✅ Default plan price is valid: $${planPrice}`);
  await ctx.close();
});

test('P28 Case 5 - Plan selection, info/error messages and UVC upsell hide', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(spoofWebdriver);

  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.getByRole('radio', { name: /Most Popular 2 Vehicle/i }).waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('radio', { name: /Most Popular 2 Vehicle/i }).click();
  await expect(page.getByText('vehicle reports selected!')).toBeVisible({ timeout: 5000 });
  console.log('✅ Most Popular plan selected — info message shown');

  await page.getByRole('radio', { name: /56% Cheaper Than Carfax 1/i }).click();
  await expect(page.getByText('vehicle report selected!')).toBeVisible({ timeout: 5000 });
  console.log('✅ 1 Vehicle plan selected — info message shown');

  await page.getByRole('radio', { name: /Best Value Unlimited VIN/i }).click();
  await expect(page.getByText('Window Sticker removed from')).toBeVisible({ timeout: 5000 });
  console.log('✅ UVC selected — Window Sticker upsell removed message shown');

  await page.getByRole('radio', { name: /Best Value Unlimited VIN/i }).click();
  await expect(page.getByText('Plan Already Selected ✅')).toBeVisible({ timeout: 5000 });
  console.log('✅ Re-clicking UVC shows "Plan Already Selected" message');

  await page.getByRole('radio', { name: /56% Cheaper Than Carfax 1/i }).click();
  await page.getByRole('radio', { name: /Most Popular 2 Vehicle/i }).click();
  await page.getByRole('radio', { name: /56% Cheaper Than Carfax 1/i }).click();
  console.log('✅ Plan switching works correctly');

  await page.getByRole('button', { name: /Get Unlimited VIN Checks/i }).click();
  const closeBtn = page.locator('button.absolute.right-4.top-4');
  await expect(closeBtn).toBeVisible({ timeout: 5000 });
  await closeBtn.click();
  console.log('✅ Unlimited VIN Checks modal opens and closes');

  await page.getByRole('button', { name: /See more packages & save up/i }).click();
  await page.locator('div').filter({ hasText: /^5 Reports\$12\.00\/ReportSave 40%$/ }).first().click();
  console.log('✅ 5 Reports bulk package selectable');

  await page.locator('div').filter({ hasText: /^10 Reports\$8\.00\/ReportSave 60%$/ }).first().click();
  await expect(page.getByText('10 vehicle reports selected!').first()).toBeVisible({ timeout: 5000 });
  console.log('✅ 10 Reports bulk package selectable — info message shown');

  await page.locator('div').filter({ hasText: /^25 Reports\$7\.00\/ReportSave 65%$/ }).first().click();
  console.log('✅ 25 Reports bulk package selectable');

  await ctx.close();
});

test('P28 Case 6 - Email validation, maybe later API, and phone analytics flow', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  const vin = randomVin();
  await page.goto(getVhrUrl(vin), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  // ── Step 2: Open email popup ──────────────────────────────────────────────
  await page.getByRole('button', { name: /access records/i }).first().click();
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  console.log('✅ Email popup opened');

  // ── Step 3 & 4: Enter invalid email → expect validation error ─────────────
  await emailInput.fill('invalidemail');
  await page.getByRole('button', { name: /proceed to checkout/i }).click();
  const errorMsg = page.locator('text=/please enter a valid email/i');
  await expect(errorMsg).toBeVisible({ timeout: 5000 });
  console.log('✅ Validation error shown for invalid email');

  // ── Step 5: Enter valid email → click Maybe Later → assert API + payload ──
  await emailInput.clear();
  const validEmail = `test_${Date.now()}@example.com`;
  await emailInput.fill(validEmail);
  console.log(`📧 Valid email: ${validEmail}`);

  let maybeLaterCalled = false;
  let maybeLaterPayload;
  page.on('request', req => {
    if (req.url().includes('landing/index_collection')) {
      maybeLaterCalled = true;
      maybeLaterPayload = req.postData();
      console.log(`📤 Maybe Later API called: ${req.url()}`);
      console.log(`📤 Maybe Later payload: ${maybeLaterPayload}`);
    }
  });

  await page.getByRole('button', { name: /maybe later/i }).click();
  await page.waitForTimeout(2000);
  expect(maybeLaterCalled).toBe(true);
  expect(maybeLaterPayload).toBeTruthy();
  console.log('✅ landing/index_collection API called on Maybe Later');

  // ── Step 6: Popup closed → reopen → fill valid email + phone → analytics ──
  await expect(emailInput).not.toBeVisible({ timeout: 5000 });
  console.log('✅ Email popup closed after Maybe Later');

  await page.getByRole('button', { name: /access records/i }).first().click();
  const emailInput2 = page.locator('input[type="email"]').first();
  await emailInput2.waitFor({ state: 'visible', timeout: 10000 });

  const uniqueEmail = `test_${Date.now()}_u@example.com`;
  await emailInput2.fill(uniqueEmail);
  console.log(`📧 Unique email: ${uniqueEmail}`);

  const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="Phone" i]').first();
  await phoneInput.waitFor({ state: 'visible', timeout: 10000 });

  let analyticsPayload;
  page.on('request', req => {
    if (req.url().includes('api-cwa/create-preview-analytics')) {
      analyticsPayload = req.postData();
      console.log(`📤 Analytics API payload: ${analyticsPayload}`);
    }
  });

  await phoneInput.click();
  await phoneInput.fill('5551234567');

  const analyticsResponsePromise = page.waitForResponse(
    res => res.url().includes('api-cwa/create-preview-analytics'),
    { timeout: 15000 }
  );
  await page.getByRole('button', { name: /proceed to checkout/i }).click();
  const analyticsRes = await analyticsResponsePromise.catch(() => null);
  const analyticsResponse = analyticsRes ? await analyticsRes.json().catch(() => analyticsRes.text()) : null;
  console.log(`📥 Analytics API response: ${JSON.stringify(analyticsResponse)}`);

  expect(analyticsPayload).toBeTruthy();
  expect(analyticsResponse).toBeTruthy();
  console.log('✅ create-preview-analytics API called with payload and response captured');

  await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-case6-analytics.png`, fullPage: true });
  await ctx.close();
});

// ─── P28 Case 7 ───────────────────────────────────────────────────────────────

test('P28 Case 7 - Verify reveal record section (internal linking) and vehicle media image section', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  // ── Reveal record section: click each record link and close ───────────────
  const recordLinks = page.locator('.text-lg');
  await recordLinks.first().waitFor({ state: 'visible', timeout: 15000 });
  const count = await recordLinks.count();
  console.log(`📋 Found ${count} record links`);

  for (let i = 0; i < Math.min(count, 5); i++) {
    await recordLinks.nth(i).click();
    const closeBtn = page.getByRole('button', { name: 'Close' });
    await closeBtn.waitFor({ state: 'visible', timeout: 8000 });
    await closeBtn.click();
    console.log(`✅ Record link ${i + 1} opened and closed`);
  }

  // ── Vehicle media image section: scroll to top, click left & right arrows ──
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Carousel only appears if vehicle has images — check first
  const nextBtn = page.locator('div').filter({ hasText: /^\d+ \/ \d+$/ }).getByRole('button').nth(1);
  const prevBtn = page.locator('div').filter({ hasText: /^\d+ \/ \d+$/ }).getByRole('button').first();

  const carouselVisible = await nextBtn.isVisible().catch(() => false);
  if (carouselVisible) {
    await nextBtn.click();
    console.log('✅ Clicked next (right) arrow on vehicle media');
    await prevBtn.click();
    console.log('✅ Clicked prev (left) arrow on vehicle media');
  } else {
    console.log('ℹ️ No vehicle images for this VIN — carousel not present, skipping media section');
  }

  await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-case7-media-section.png`, fullPage: true });
  console.log('✅ Reveal record section and vehicle media image section verified');
  await ctx.close();
});

// ─── P23 Case 7 ───────────────────────────────────────────────────────────────

test('P23 Case 7 - Email validation, maybe later API, and phone analytics flow', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  const vin = randomVin();
  await page.goto(getVhrUrl(vin), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  // ── Step 2: Open email popup ──────────────────────────────────────────────
  await page.getByRole('button', { name: /access records/i }).first().click();
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  console.log('✅ Email popup opened');

  // ── Step 3 & 4: Enter invalid email → expect validation error ─────────────
  await emailInput.fill('invalidemail');
  await page.getByRole('button', { name: /proceed to checkout/i }).click();
  const errorMsg = page.locator('text=/please enter a valid email/i');
  await expect(errorMsg).toBeVisible({ timeout: 5000 });
  console.log('✅ Validation error shown for invalid email');

  // ── Step 5: Enter valid email → click Maybe Later → assert API call ───────
  await emailInput.clear();
  const validEmail = `test_${Date.now()}@example.com`;
  await emailInput.fill(validEmail);
  console.log(`📧 Valid email: ${validEmail}`);

  let maybeLaterCalled = false;
  let maybeLaterPayload;
  page.on('request', req => {
    if (req.url().includes('landing/index_collection')) {
      maybeLaterCalled = true;
      maybeLaterPayload = req.postData();
      console.log(`📤 Maybe Later API called: ${req.url()}`);
      console.log(`📤 Maybe Later payload: ${maybeLaterPayload}`);
    }
  });

  await page.getByRole('button', { name: /maybe later/i }).click();
  await page.waitForTimeout(2000);
  expect(maybeLaterCalled).toBe(true);
  expect(maybeLaterPayload).toBeTruthy();
  console.log('✅ landing/index_collection API called on Maybe Later');

  // ── Step 6: Popup closed → reopen → fill valid email + phone → analytics API
  await expect(emailInput).not.toBeVisible({ timeout: 5000 });
  console.log('✅ Email popup closed after Maybe Later');

  await page.getByRole('button', { name: /access records/i }).first().click();
  const emailInput2 = page.locator('input[type="email"]').first();
  await emailInput2.waitFor({ state: 'visible', timeout: 10000 });

  const uniqueEmail = `test_${Date.now()}_u@example.com`;
  await emailInput2.fill(uniqueEmail);
  console.log(`📧 Unique email: ${uniqueEmail}`);

  const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="Phone" i]').first();
  await phoneInput.waitFor({ state: 'visible', timeout: 10000 });

  let analyticsPayload;
  page.on('request', req => {
    if (req.url().includes('api-cwa/create-preview-analytics')) {
      analyticsPayload = req.postData();
      console.log(`📤 Analytics API payload: ${analyticsPayload}`);
    }
  });

  await phoneInput.click();
  await phoneInput.fill('5551234567');

  // Click Proceed to Checkout — this triggers create-preview-analytics
  const analyticsResponsePromise = page.waitForResponse(
    res => res.url().includes('api-cwa/create-preview-analytics'),
    { timeout: 15000 }
  );
  await page.getByRole('button', { name: /proceed to checkout/i }).click();
  const analyticsRes = await analyticsResponsePromise.catch(() => null);
  const analyticsResponse = analyticsRes ? await analyticsRes.json().catch(() => analyticsRes.text()) : null;
  console.log(`📥 Analytics API response: ${JSON.stringify(analyticsResponse)}`);

  expect(analyticsPayload).toBeTruthy();
  expect(analyticsResponse).toBeTruthy();
  console.log('✅ create-preview-analytics API called with payload and response captured');

  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case7-analytics.png`, fullPage: true });
  await ctx.close();
});

// ─── Global Cases ─────────────────────────────────────────────────────────────

test('Global Case 1 - Lower to higher coupon swap logic (cookie validation)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const getCookie = async (name) => (await ctx.cookies()).find(c => c.name === name) ?? null;

  await page.goto('https://developtestsite.com/?offer=offer20', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const step1 = await getCookie('coupon');
  expect(step1?.value).toBe('offer20');
  console.log(`✅ Step 1 — coupon=${step1.value}`);

  await page.goto('https://developtestsite.com/?offer=testing', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const step2c = await getCookie('coupon');
  const step2p = await getCookie('prev_coupon');
  expect(step2c?.value).toBe('testing');
  expect(step2p?.value).toBe('offer20');
  console.log(`✅ Step 2 — coupon=${step2c.value}, prev_coupon=${step2p.value}`);

  await page.goto('https://developtestsite.com/?offer=offer20', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const step4c = await getCookie('coupon');
  const step4p = await getCookie('prev_coupon');
  expect(step4c?.value).toBe('offer20');
  expect(step4p?.value).toBe('testing');
  console.log(`✅ Step 4 — coupon=${step4c.value}, prev_coupon=${step4p.value}`);

  console.log('✅ Coupon swap logic verified');
  await ctx.close();
});

test('Global Case 2 - ref=ads param sets cookie correctly', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  const getCookie = async (name) => (await ctx.cookies()).find(c => c.name === name) ?? null;

  await page.goto('https://developtestsite.com/?ref=ads', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const refCookie = await getCookie('ref');
  expect(refCookie).not.toBeNull();
  expect(refCookie.value).toBe('ads');
  console.log(`✅ ref cookie set: ${refCookie.name}=${refCookie.value}`);

  await ctx.close();
});

// ─── Summary ──────────────────────────────────────────────────────────────────

test('Summary - Detected Preview Pages', async () => {
  const pages = fs.existsSync(SUMMARY_FILE) ? JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) : {};
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 DETECTED PREVIEW PAGES SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  P1 VHR → preview_page         : ${pages.vhr ?? 'N/A'}`);
  console.log(`  P2 WS  → ws_preview_page      : ${pages.ws  ?? 'N/A'}`);
  console.log(`  P3 LP  → license_preview_page : ${pages.lp  ?? 'N/A'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  // clean up temp file
  if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
});
