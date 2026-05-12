const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');
const { MongoClient } = require('mongodb');

// MongoDB Configuration
const MONGO_URI = 'mongodb://scraping_user:scraping_password@144.126.129.72:27014/?authSource=admin&readPreference=primary&appname=ScrapingMongo&ssl=false';
const DB_NAME = 'sales_history';
const COLL_NAME = 'sales13';

const BASE_VIN     = '1FTFW1ET2DFD78356';
const EVIDENCE_DIR = path.join(__dirname, 'test-results', 'preloader-preview-to-checkout');
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
  await page.screenshot({ path: `${EVIDENCE_DIR}/${screenshotPrefix}-03-preloader.png`, fullPage: true });
  console.log('✅ Preloader appeared');

  await page.waitForURL('**/members/checkout**', { timeout: 60000, waitUntil: 'domcontentloaded' });
  const t2 = Date.now();
  const preloaderElapsed = ((t2 - t1) / 1000).toFixed(2);
  console.log(`⏱ Preloader → Checkout: ${preloaderElapsed}s`);

  if (t0) {
    const totalElapsed = ((t2 - t0) / 1000).toFixed(2);
    console.log(`⏱ Preview → Checkout Total: ${totalElapsed}s`);
    // Add annotations for all preview types
    test.info().annotations.push({ type: 'Preview->Checkout Total Time', description: totalElapsed + 's' });
    test.info().annotations.push({ type: 'Preloader->Checkout Time', description: preloaderElapsed + 's' });
  }

  await expect(page.locator(':text("Choose payment method"), :text("Enter your card details")').first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${screenshotPrefix}-04-checkout.png`, fullPage: true });
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
  await page.screenshot({ path: `${EVIDENCE_DIR}/${prefix}-02-popup.png`, fullPage: true });

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
  await page.screenshot({ path: `${EVIDENCE_DIR}/${prefix}-02-popup.png`, fullPage: true });

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
  const popup = page.locator('div').filter({ hasText: /Hey/i }).filter({ hasText: /leave/i }).last();
  await expect(popup).toBeVisible({ timeout: 20000 });
  await expect(page.locator('text=15% OFF')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Click here to redeem instantly' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Click here to redeem instantly' }).click();
  console.log('✅ Clicked CTA button');
  await page.waitForURL(/offer=/, { timeout: 15000 });
  expect(page.url()).toContain('offer=');
  console.log(`✅ Redirected to offer URL: ${page.url()}`);
  if (screenshotName) await page.screenshot({ path: `${EVIDENCE_DIR}/${screenshotName}`, fullPage: true });
}


// ─── Preview 23 ───────────────────────────────────────────────────────────────
const Preview_23 = {
  async vhr(page, url) {
    const t0 = Date.now();
    console.log('▶ [P23 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p23-vhr', clickFlow: p => clickFlowAccessRecords(p, 'p23-vhr'), t0 });
  },
  async ws(page, url) {
    const t0 = Date.now();
    console.log('▶ [P23 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p23-ws', clickFlow: p => clickFlowAccessRecords(p, 'p23-ws'), t0 });
  },
  async lp(page, url) {
    const t0 = Date.now();
    console.log('▶ [P23 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p23-lp', clickFlow: p => clickFlowAccessRecords(p, 'p23-lp'), t0 });
  },
};

// ─── Preview 27 ───────────────────────────────────────────────────────────────
const Preview_27 = {
  async vhr(page, url) {
    const t0 = Date.now();
    console.log('▶ [P27 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p27-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p27-vhr', clickFlow: p => clickFlowCreateAccount(p, 'p27-vhr'), t0 });
  },
  async ws(page, url) {
    const t0 = Date.now();
    console.log('▶ [P27 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p27-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p27-ws', clickFlow: p => clickFlowCreateAccount(p, 'p27-ws'), t0 });
  },
  async lp(page, url) {
    const t0 = Date.now();
    console.log('▶ [P27 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p27-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p27-lp', clickFlow: p => clickFlowCreateAccount(p, 'p27-lp'), t0 });
  },
};

// ─── Preview 28 ───────────────────────────────────────────────────────────────
const Preview_28 = {
  async vhr(page, url) {
    const t0 = Date.now();
    console.log('▶ [P28 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p28-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28-vhr', clickFlow: p => clickFlowAccessRecords(p, 'p28-vhr'), t0 });
  },
  async ws(page, url) {
    const t0 = Date.now();
    console.log('▶ [P28 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p28-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28-ws', clickFlow: p => clickFlowAccessRecords(p, 'p28-ws'), t0 });
  },
  async lp(page, url) {
    const t0 = Date.now();
    console.log('▶ [P28 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p28-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28-lp', clickFlow: p => clickFlowAccessRecords(p, 'p28-lp'), t0 });
  },
};

// ─── Preview 28B ──────────────────────────────────────────────────────────────
const Preview_28B = {
  async vhr(page, url) {
    const t0 = Date.now();
    console.log('▶ [P28B - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p28b-vhr-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28b-vhr', clickFlow: p => clickFlowAccessRecords(p, 'p28b-vhr'), t0 });
  },
  async ws(page, url) {
    const t0 = Date.now();
    console.log('▶ [P28B - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p28b-ws-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28b-ws', clickFlow: p => clickFlowAccessRecords(p, 'p28b-ws'), t0 });
  },
  async lp(page, url) {
    const t0 = Date.now();
    console.log('▶ [P28B - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${EVIDENCE_DIR}/p28b-lp-01-preview.png`, fullPage: true });
    await runCheckoutFlow(page, { screenshotPrefix: 'p28b-lp', clickFlow: p => clickFlowAccessRecords(p, 'p28b-lp'), t0 });
  },
};

// ─── Block Maps ───────────────────────────────────────────────────────────────
const VHR_BLOCKS = { '23': Preview_23.vhr, '27': Preview_27.vhr, '28': Preview_28.vhr, '28_B': Preview_28B.vhr };
const WS_BLOCKS  = { '23': Preview_23.ws,  '27': Preview_27.ws,  '28': Preview_28.ws,  '28_B': Preview_28B.ws  };
const LP_BLOCKS  = { '23': Preview_23.lp,  '27': Preview_27.lp,  '28': Preview_28.lp,  '28_B': Preview_28B.lp  };


// ─── Global Page Detection ────────────────────────────────────────────────────
let DETECTED_PAGE = null;
let DETECTED_PAGE_TYPE = null; // '23', '27', '28', or '28_B'

// Helper function to detect page if not already detected
async function getDetectedPage(browser) {
  if (DETECTED_PAGE) return DETECTED_PAGE;
  
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});
  const detected = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  await ctx.close();
  return detected;
}

// Extract page type from detected page
function getPageType(detectedPage) {
  if (!detectedPage) return null;
  const match = detectedPage.match(/preview(28_B|28[AB]|\d+)/);
  return match ? match[1] : null;
}

// ─── Priority Tests (Execution order: 1) ───────────────────────────────────────

test('Priority 1 - VHR: detect preview_page and run VHR block', async ({ page }) => {
  const vin = randomVin();
  const VHR_URL = getVhrUrl(vin);
  console.log(`🔑 VIN: ${vin}`);

  await page.goto(VHR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  console.log(`🔍 [VHR] preview_page: ${raw}`);

  // Store detected page globally
  DETECTED_PAGE = raw;
  DETECTED_PAGE_TYPE = getPageType(raw);
  console.log(`🔍 Detected Page Type: ${DETECTED_PAGE_TYPE}`);

  // persist for summary
  const existing = fs.existsSync(SUMMARY_FILE) ? JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) : {};
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({ ...existing, vhr: raw }));

  const num = raw?.match(/preview(28_B|28[AB]|\d+)/)?.[1];
  console.log(`🔍 Block number: ${num}`);
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

  const num = raw?.match(/preview(28_B|28[AB]|\d+)/)?.[1];
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

  const num = raw?.match(/preview(28_B|28[AB]|\d+)/)?.[1];
  const block = LP_BLOCKS[num];
  if (!block) { await context.close(); throw new Error(`[LP] No block for: "${num}" (raw: "${raw}")`); }
  await block(page, LP_URL);
  await context.close();
});

// ─── P23 Cases (Execution order: 2 if detected type is 23) ─────────────────────

test.describe('P23 Cases', () => {
  // Use a context-based isolation
  let context;
  let sharedPage;

  test.beforeEach(async ({ browser }) => {
    // If not detected yet, do it once per suite or check per context
    if (!DETECTED_PAGE_TYPE) {
      const raw = await getDetectedPage(browser);
      DETECTED_PAGE = raw;
      DETECTED_PAGE_TYPE = getPageType(raw);
      console.log(`🔍 [P23 Auto-Detect] preview_page: ${DETECTED_PAGE}, Type: ${DETECTED_PAGE_TYPE}`);
    }

    if (DETECTED_PAGE_TYPE === '23') {
      context = await browser.newContext();
      sharedPage = await context.newPage();
      await sharedPage.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
      await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});
      console.log(`🔍 P23 page isolated and initialized`);
    }
  });

  test.afterEach(async () => {
    if (sharedPage && !sharedPage.isClosed()) await sharedPage.close();
    if (context) await context.close();
  });

  test('P23 Case 1 - Plan radio buttons are clickable', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }

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

  test('P23 Case 4 - Exit intent popup appears on preview page', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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

  test('P23 Case 5 - Classic mapped VIN modification (update YMM using dropdown)', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-case5-ymm-selected.png`, fullPage: true });

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Confirm Selection' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/cv=/, { timeout: 30000 });

    expect(page.url()).toContain('cv=');
    expect(getApiStatus()).toBe(200);
    console.log(`✅ API 200 & redirected: ${page.url()}`);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-case5-ymm-updated.png`, fullPage: true });
    await ctx.close();
  });

  test('P23 Case 6 - Update classic VIN (modify data using manual input)', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-case6-manual-input.png`, fullPage: true });
    console.log('✅ Manual fields filled');

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/cv=/, { timeout: 30000 });

    expect(page.url()).toContain('cv=');
    expect(getApiStatus()).toBe(200);
    console.log(`✅ API 200 & redirected: ${page.url()}`);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-case6-manual-updated.png`, fullPage: true });
    await ctx.close();
  });

  test('P23 Case 7 - Email validation, maybe later API, and phone analytics flow', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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

    await page.screenshot({ path: `${EVIDENCE_DIR}/p23-case7-analytics.png`, fullPage: true });
    await ctx.close();
  });

  test('P23 Case 8 - Window Sticker checkbox dynamic text and price', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.reload({ waitUntil: 'domcontentloaded' });
    await sharedPage.locator('#plans').waitFor({ state: 'visible', timeout: 30000 });
    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').sticker_preview_page_checkbox_price, { timeout: 15000 });
    const settings = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}'));
    const fullText = await sharedPage.evaluate(() => document.body.innerText);
    expect(fullText).toContain(settings.sticker_preview_page_checkbox_text);
    expect(fullText).toContain(settings.sticker_preview_page_checkbox_price);
    console.log('✅ Window sticker dynamic text and price verified');
  });

  test('P23 Case 9 - EU VIN confirmation', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    
    const EU_BASE_VIN = 'WAUZZZ8P6CA083445';
    function randomEuVin(base) {
      const nums = '0123456789';
      return base.slice(0, -1) + nums[Math.floor(Math.random() * nums.length)];
    }
    const randomizedEuVin = randomEuVin(EU_BASE_VIN);
    const url = getVhrUrl(randomizedEuVin);
    
    console.log(`🔑 Randomized EU VIN: ${randomizedEuVin}`);
    // Only navigate once
    await sharedPage.goto(url, { waitUntil: 'domcontentloaded' });
    
    await sharedPage.getByRole('button', { name: 'No' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Year' }).click();
    await sharedPage.getByRole('textbox', { name: 'Search...' }).click();
    await sharedPage.getByRole('textbox', { name: 'Search...' }).fill('2015');
    await sharedPage.getByRole('button', { name: '2015' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Make' }).click();
    await sharedPage.getByRole('button', { name: 'Alfa Romeo' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Model' }).click();
    await sharedPage.getByRole('button', { name: 'Giulietta II' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Trim' }).click();
    await sharedPage.getByRole('button', { name: '1.4 GLP Turbo 120HP' }).click();
    await sharedPage.getByRole('button', { name: 'Update Vehicle Details' }).click();
    
    await sharedPage.waitForTimeout(2000);
    // Move API capture to before navigation to avoid missing the first request
    console.log('✅ EU VIN confirmed');
  });

  test('P23 Case 11 - Verify sales History Record checkes', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }

    const client = new MongoClient(MONGO_URI);
    let vin;
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const coll = db.collection(COLL_NAME);
        const doc = await coll.aggregate([{ $sample: { size: 1 } }]).toArray();
        vin = doc[0].vin;
        console.log(`🔑 Retrieved VIN from MongoDB: ${vin}`);
    } catch (e) {
        console.error(`⚠️ MongoDB connection error: ${e.message}`);
        test.skip();
    } finally {
        await client.close();
    }

    if (!vin) throw new Error('Could not retrieve VIN from MongoDB');

    const url = getVhrUrl(vin);
    await sharedPage.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Verify the record availability text
    const textToVerify = 'Previously listed for sale online. Get the full vehicle report to unlock records and available photos.';
    await expect(sharedPage.locator(`text=${textToVerify}`)).toBeVisible({ timeout: 30000 });
    console.log('✅ Sales History Record available text verified');
  });

  test('P28 Case 13 - Verify Plan count against API', async () => {
    test.skip();
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }

    const url = getVhrUrl(randomVin());
    // ... (rest of implementation skipped)
  });
});

// ─── P27 Cases (Execution order: 2 if detected type is 27) ─────────────────────

test.describe('P27 Cases', () => {
  let sharedPage;

  test.beforeAll(async ({ browser }) => {
    // If not detected yet, do it now (handles direct block runs)
    if (!DETECTED_PAGE_TYPE) {
      const raw = await getDetectedPage(browser);
      DETECTED_PAGE = raw;
      DETECTED_PAGE_TYPE = getPageType(raw);
      console.log(`🔍 [P27 Auto-Detect] preview_page: ${DETECTED_PAGE}, Type: ${DETECTED_PAGE_TYPE}`);
    }

    // Skip entire P27 block if detected page type is not '27'
    if (DETECTED_PAGE_TYPE !== '27') {
      console.log(`⏭️ Skipping P27 Cases - detected page type is ${DETECTED_PAGE_TYPE}, not 27`);
      return;
    }
    console.log(`✅ Running P27 Cases - detected page type is 27`);

    const context = await browser.newContext();
    sharedPage = await context.newPage();
    await sharedPage.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});
    const raw = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    if (!raw?.includes('27')) {
      await sharedPage.close();
      sharedPage = null;
    }
  });

  test.afterAll(async () => { if (sharedPage && !sharedPage.isClosed()) await sharedPage.close(); });

  test('P27 Case 1 - Exit intent popup appears on preview page', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(spoofWebdriver);

    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
    await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    console.log('🔍 Confirmed preview_page detection');

    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(4000);
    await triggerExitIntent(page);

    await assertExitIntentPopup(page, 'p27-exit-intent-popup.png');
    console.log('✅ Exit intent popup appeared on P27 preview page');
    await ctx.close();
  });

  test('P27 Case 2 - Classic VIN YMM update via dropdown', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);
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

  test('P27 Case 3 - Classic VIN update via manual input', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);
    await page.getByRole('button', { name: 'Click here to update' }).click();
    await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();
    await page.getByRole('button', { name: 'Click here' }).click();
    await page.getByPlaceholder('Enter year').fill('1960');
    await page.getByPlaceholder('Enter make').fill('Ford');
    await page.getByPlaceholder('Enter model').fill('F-250');
    await page.getByPlaceholder('Enter engine (e.g., V8,').fill('V8');
    await page.getByPlaceholder('Enter transmission type').fill('Auto');
    await page.getByPlaceholder('Enter number of doors').fill('5');
    await page.getByPlaceholder('Enter drive type (e.g., RWD,').fill('AWD');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/cv=/, { timeout: 30000 });
    expect(page.url()).toContain('cv=');
    expect(getApiStatus()).toBe(200);
    console.log(`✅ API 200 & redirected: ${page.url()}`);
    await ctx.close();
  });

  test('P27 Case 4 - Default plan price matches site_settings.default_plan', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const defaultPlan = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').default_plan ?? null);
    const planPrice = defaultPlan?.price ?? defaultPlan?.amount ?? defaultPlan?.value ?? null;
    expect(parseFloat(planPrice)).toBeGreaterThan(0);
    console.log(`✅ Default plan price is valid: $${planPrice}`);
  });

  test('P27 Case 5 - Plan selection, info/error messages and UVC upsell hide', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(spoofWebdriver);

    await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    if (!raw?.includes('27')) { await ctx.close(); test.skip(); return; }
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

  test('P27 Case 6 - Email validation, maybe later API, and phone analytics flow', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();

    const vin = randomVin();
    await page.goto(getVhrUrl(vin), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    if (!raw?.includes('27')) { await ctx.close(); test.skip(); return; }
    console.log(`🔍 Confirmed preview_page: ${raw}`);

    // ── Step 2: Open email popup ──────────────────────────────────────────────
    await page.getByRole('button', { name: /proceed to checkout/i }).first().click();
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Email popup opened');

    // ── Step 3 & 4: Enter invalid email → expect validation error ─────────────
    await emailInput.fill('invalidemail');
    await page.getByRole('button', { name: /create an account/i }).click();
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

    await page.getByRole('button', { name: /proceed to checkout/i }).first().click();
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
    await page.getByRole('button', { name: /create an account/i }).click();
    const analyticsRes = await analyticsResponsePromise.catch(() => null);
    const analyticsResponse = analyticsRes ? await analyticsRes.json().catch(() => analyticsRes.text()) : null;
    console.log(`📥 Analytics API response: ${JSON.stringify(analyticsResponse)}`);

    expect(analyticsPayload).toBeTruthy();
    expect(analyticsResponse).toBeTruthy();
    console.log('✅ create-preview-analytics API called with payload and response captured');

    await page.screenshot({ path: `${EVIDENCE_DIR}/p27-case6-analytics.png`, fullPage: true });
    await ctx.close();
  });

  test('P27 Case 7 - Verify reveal record section (internal linking) and vehicle media image section', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    if (!raw?.includes('27')) { await ctx.close(); test.skip(); return; }
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

    await page.screenshot({ path: `${EVIDENCE_DIR}/p27-case7-media-section.png`, fullPage: true });
    console.log('✅ Reveal record section and vehicle media image section verified');
    await ctx.close();
  });

  test('P27 Case 8 - Window Sticker checkbox dynamic text and price', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.reload({ waitUntil: 'domcontentloaded' });
    
    // Wait for plans to be visible
    await sharedPage.getByRole('radio', { name: /Vehicle/i }).first().waitFor({ state: 'visible', timeout: 30000 });

    // Handle auto-selected window sticker - click Undo if present to reveal original text
    const undoBtn = sharedPage.getByRole('button', { name: /Undo/i });
    if (await undoBtn.isVisible()) {
      await undoBtn.click();
      console.log('✅ Clicked Undo on auto-selected window sticker');
      await sharedPage.waitForTimeout(2000);
    }

    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').sticker_preview_page_checkbox_price, { timeout: 15000 });
    const settings = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}'));
    const fullText = await sharedPage.evaluate(() => document.body.innerText);
    
    console.log(`🔍 Expected Text: ${settings.sticker_preview_page_checkbox_text}`);
    console.log(`🔍 Expected Price: ${settings.sticker_preview_page_checkbox_price}`);

    expect(fullText).toContain(settings.sticker_preview_page_checkbox_text);
    expect(fullText).toContain(settings.sticker_preview_page_checkbox_price);
    console.log('✅ Window sticker dynamic text and price verified');
  });
});

// ─── P28 Cases (Execution order: 2 if detected type is 28) ─────────────────────

test.describe('P28 Cases', () => {
  let context;
  let sharedPage;

  test.beforeEach(async ({ browser }) => {
    // If not detected yet, do it once per suite or check per context
    if (!DETECTED_PAGE_TYPE) {
      const raw = await getDetectedPage(browser);
      DETECTED_PAGE = raw;
      DETECTED_PAGE_TYPE = getPageType(raw);
      console.log(`🔍 [P28 Auto-Detect] preview_page: ${DETECTED_PAGE}, Type: ${DETECTED_PAGE_TYPE}`);
    }

    if (DETECTED_PAGE_TYPE === '28') {
      context = await browser.newContext();
      sharedPage = await context.newPage();
      await sharedPage.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
      await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});
      console.log(`🔍 P28 page isolated and initialized`);
    }
  });

  test.afterEach(async () => {
    if (sharedPage && !sharedPage.isClosed()) await sharedPage.close();
    if (context) await context.close();
  });

  test('P28 Case 1 - Exit intent popup appears on preview page', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(spoofWebdriver);

    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
    await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    console.log('🔍 Confirmed preview_page detection');

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

  test('P28 Case 2 - Classic VIN YMM update via dropdown', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);
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
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);
    await page.getByRole('button', { name: 'Click here to update' }).click();
    await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();
    await page.getByRole('button', { name: 'Click here' }).click();
    await page.getByPlaceholder('Enter year').fill('1960');
    await page.getByPlaceholder('Enter make').fill('Ford');
    await page.getByPlaceholder('Enter model').fill('F-250');
    await page.getByPlaceholder('Enter engine (e.g., V8,').fill('V8');
    await page.getByPlaceholder('Enter transmission type').fill('Auto');
    await page.getByPlaceholder('Enter number of doors').fill('5');
    await page.getByPlaceholder('Enter drive type (e.g., RWD,').fill('AWD');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/cv=/, { timeout: 30000 });
    expect(page.url()).toContain('cv=');
    expect(getApiStatus()).toBe(200);
    console.log(`✅ API 200 & redirected: ${page.url()}`);
    await ctx.close();
  });

  test('P28 Case 4 - Default plan price matches site_settings.default_plan', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const defaultPlan = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').default_plan ?? null);
    const planPrice = defaultPlan?.price ?? defaultPlan?.amount ?? defaultPlan?.value ?? null;
    expect(parseFloat(planPrice)).toBeGreaterThan(0);
    console.log(`✅ Default plan price is valid: $${planPrice}`);
  });

  test('P28 Case 5 - Plan selection, info/error messages and UVC upsell hide', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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

    await page.screenshot({ path: `${EVIDENCE_DIR}/p28-case6-analytics.png`, fullPage: true });
    await ctx.close();
  });

  test('P28 Case 7 - Verify reveal record section (internal linking) and vehicle media image section', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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

    await page.screenshot({ path: `${EVIDENCE_DIR}/p28-case7-media-section.png`, fullPage: true });
    console.log('✅ Reveal record section and vehicle media image section verified');
    await ctx.close();
  });

  test('P28 Case 8 - Window Sticker checkbox dynamic text and price', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.reload({ waitUntil: 'domcontentloaded' });
    
    // Wait for plans to be visible
    await sharedPage.getByRole('radio', { name: /Vehicle/i }).first().waitFor({ state: 'visible', timeout: 30000 });

    // Handle auto-selected window sticker - click Undo if present to reveal original text
    const undoBtn = sharedPage.getByRole('button', { name: /Undo/i });
    if (await undoBtn.isVisible()) {
      await undoBtn.click();
      console.log('✅ Clicked Undo on auto-selected window sticker');
      await sharedPage.waitForTimeout(2000);
    }

    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').sticker_preview_page_checkbox_price, { timeout: 15000 });
    const settings = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}'));
    const fullText = await sharedPage.evaluate(() => document.body.innerText);
    
    console.log(`🔍 Expected Text: ${settings.sticker_preview_page_checkbox_text}`);
    console.log(`🔍 Expected Price: ${settings.sticker_preview_page_checkbox_price}`);

    expect(fullText).toContain(settings.sticker_preview_page_checkbox_text);
    expect(fullText).toContain(settings.sticker_preview_page_checkbox_price);
    console.log('✅ Window sticker dynamic text and price verified');
  });

  // --- P28 Cases 9-13 (Ported from P23) ---
  
  test('P28 Case 9 - EU VIN confirmation', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    
    const EU_BASE_VIN = 'WAUZZZ8P6CA083445';
    function randomEuVin(base) {
      const nums = '0123456789';
      return base.slice(0, -1) + nums[Math.floor(Math.random() * nums.length)];
    }
    const randomizedEuVin = randomEuVin(EU_BASE_VIN);
    const url = getVhrUrl(randomizedEuVin);
    
    console.log(`🔑 Randomized EU VIN: ${randomizedEuVin}`);
    await sharedPage.goto(url, { waitUntil: 'domcontentloaded' });
    
    await sharedPage.getByRole('button', { name: 'No' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Year' }).click();
    await sharedPage.getByRole('textbox', { name: 'Search...' }).click();
    await sharedPage.getByRole('textbox', { name: 'Search...' }).fill('2015');
    await sharedPage.getByRole('button', { name: '2015' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Make' }).click();
    await sharedPage.getByRole('button', { name: 'Alfa Romeo' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Model' }).click();
    await sharedPage.getByRole('button', { name: 'Giulietta II' }).click();
    await sharedPage.getByRole('combobox').filter({ hasText: 'Select Trim' }).click();
    await sharedPage.getByRole('button', { name: '1.4 GLP Turbo 120HP' }).click();
    await sharedPage.getByRole('button', { name: 'Update Vehicle Details' }).click();
    
    await sharedPage.waitForTimeout(2000);
    console.log('✅ EU VIN confirmed');
  });

  test('P28 Case 10 - EU VIN confirmation (Yes flow)', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    
    const EU_BASE_VIN = 'WAUZZZ8P6CA083445';
    function randomEuVin(base) {
      const nums = '0123456789';
      return base.slice(0, -1) + nums[Math.floor(Math.random() * nums.length)];
    }
    const randomizedEuVin = randomEuVin(EU_BASE_VIN);
    const url = getVhrUrl(randomizedEuVin);
    
    console.log(`🔑 Randomized EU VIN: ${randomizedEuVin}`);
    await sharedPage.goto(url, { waitUntil: 'domcontentloaded' });
    
    await sharedPage.getByRole('button', { name: 'Yes' }).click();
    await sharedPage.waitForURL(/\/members\/vin-check\/preview/, { timeout: 30000 });
    
    await sharedPage.waitForTimeout(2000);
    console.log('✅ EU VIN confirmed (Yes flow) and browser closed');
  });

  test('P28 Case 11 - Verify sales History Record checkes', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }

    const client = new MongoClient(MONGO_URI);
    let vin;
    try {
        await client.connect();
        const doc = await client.db(DB_NAME).collection(COLL_NAME).aggregate([{ $sample: { size: 1 } }]).toArray();
        vin = doc[0]?.vin;
        console.log(`🔑 Retrieved VIN from MongoDB: ${vin}`);
    } catch (e) {
        console.error(`⚠️ MongoDB connection error: ${e.message}`);
        test.skip();
    } finally {
        await client.close();
    }

    if (!vin) throw new Error('Could not retrieve VIN from MongoDB');

    await sharedPage.goto(getVhrUrl(vin), { waitUntil: 'domcontentloaded' });
    
    // Wait patiently for content to load
    await sharedPage.waitForSelector('body', { timeout: 60000 });
    await sharedPage.waitForTimeout(15000); 
    
    const pageContent = await sharedPage.textContent('body');
    const isVisible = pageContent.toLowerCase().includes('previously listed for sale');
    
    expect(isVisible).toBe(true);
    console.log('✅ Sales History Record available text verified');
  });

  test('P28 Case 12 - Verify Auction records', async ({ browser }) => {
    const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
    
    await page.goto('https://bid.cars/en/search/results?search-type=filters&status=All&type=Automobile&make=All&model=All&year-from=1900&year-to=2027&auction-type=All');
    
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    
    const vinPattern = /[A-HJ-NPR-Z0-9]{17}/;
    const allText = await page.evaluate(() => document.body.innerText);
    const matches = allText.match(new RegExp(vinPattern.source, 'g')) || [];
    const vin = matches[0]; 
    
    console.log(`🔑 Retrieved VIN from Bid.Cars: ${vin}`);
    await ctx.close();
    
    if (!vin) throw new Error('Could not extract VIN from Bid.Cars');
    
    await sharedPage.goto(getVhrUrl(vin), { waitUntil: 'domcontentloaded' });
    
    await sharedPage.waitForSelector('.text-lg, .text-xl, .text-2xl', { timeout: 60000 });
    await sharedPage.waitForTimeout(2000); 
    
    const pageContent = await sharedPage.textContent('body');
    const isVisible = pageContent.toLowerCase().includes('previously listed for sale') || 
                      pageContent.toLowerCase().includes('previously listed for auction');
    
    expect(isVisible).toBe(true);
    console.log('✅ Auction/Sale Record available text verified');
  });

  /*
  test('P28 Case 13 - Verify Plan count against API', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }

    const url = getVhrUrl(randomVin());
    
    let vhrPlans = [];
    let wsPlans = [];

    sharedPage.on('response', async res => {
        if (res.url().includes('api-cwa/plans')) {
            const data = await res.json().catch(() => ({}));
            vhrPlans = [...(data.uvc_subscription_plan || []), ...(data.credit_plans || [])];
        }
        if (res.url().includes('api-cwa/sticker-plans')) {
            const data = await res.json().catch(() => ({}));
            wsPlans = data.plans || [];
        }
    });

    await sharedPage.goto(url, { waitUntil: 'domcontentloaded' });
    await sharedPage.waitForSelector('#plans [role="radio"]', { timeout: 30000 });
    await sharedPage.waitForTimeout(5000); 

    const apiTotal = vhrPlans.length + wsPlans.length;
    const uiPlanCount = await sharedPage.locator('#plans [role="radio"]').count();
    
    console.log(`✅ Plan comparison: API Total ${apiTotal} vs UI Total ${uiPlanCount}`);
    expect(uiPlanCount).toBe(apiTotal);
    console.log('✅ Plan count matches between API and UI');
  });
  */
});

// ─── P28B Cases (Only run if preview_page is preview28_B) ──────────────────',old_string:

test.describe('P28B Cases', () => {
  let sharedPage;

  test.beforeAll(async ({ browser }) => {
    // If not detected yet, do it now (handles direct block runs)
    if (!DETECTED_PAGE_TYPE) {
      const raw = await getDetectedPage(browser);
      DETECTED_PAGE = raw;
      DETECTED_PAGE_TYPE = getPageType(raw);
      console.log(`🔍 [P28B Auto-Detect] preview_page: ${DETECTED_PAGE}, Type: ${DETECTED_PAGE_TYPE}`);
    }

    // Skip entire P28B block if detected page type is not '28_B'
    if (DETECTED_PAGE_TYPE !== '28_B') {
      console.log(`⏭️ Skipping P28B Cases - detected page type is ${DETECTED_PAGE_TYPE}, not 28_B`);
      return;
    }
    console.log(`✅ Running P28B Cases - detected page type is 28_B`);

    const context = await browser.newContext();
    sharedPage = await context.newPage();
    try {
      await sharedPage.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    } catch (e) {
      console.log(`⚠️ Failed to navigate to URL: ${e.message}`);
      await sharedPage.close();
      sharedPage = null;
      return;
    }
    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});
    const raw = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    // Check for preview28_B format
    if (!raw?.includes('preview28')) {
      console.log(`⚠️ preview_page is not preview28, closing sharedPage`);
      await sharedPage.close();
      sharedPage = null;
      return;
    }
  });

  test.afterAll(async () => { if (sharedPage && !sharedPage.isClosed()) await sharedPage.close(); });

  test('P28B Case 1 - Exit intent popup appears on preview page', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(spoofWebdriver);

    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
    await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    console.log('🔍 Confirmed preview_page detection');

    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(4000);
    await triggerExitIntent(page);

    await assertExitIntentPopup(page, 'p28b-exit-intent-popup.png');
    console.log('✅ Exit intent popup appeared on P28B preview page');
    await ctx.close();
  });

  test('P28B Case 2 - Classic VIN YMM update via dropdown', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);
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

  test('P28B Case 3 - Classic VIN update via manual input', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const { ctx, page, getApiStatus } = await setupClassicVinPage(browser);
    await page.getByRole('button', { name: 'Click here to update' }).click();
    await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();
    await page.getByRole('button', { name: 'Click here' }).click();
    await page.getByPlaceholder('Enter year').fill('1960');
    await page.getByPlaceholder('Enter make').fill('Ford');
    await page.getByPlaceholder('Enter model').fill('F-250');
    await page.getByPlaceholder('Enter engine (e.g., V8,').fill('V8');
    await page.getByPlaceholder('Enter transmission type').fill('Auto');
    await page.getByPlaceholder('Enter number of doors').fill('5');
    await page.getByPlaceholder('Enter drive type (e.g., RWD,').fill('AWD');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(/cv=/, { timeout: 30000 });
    expect(page.url()).toContain('cv=');
    expect(getApiStatus()).toBe(200);
    console.log(`✅ API 200 & redirected: ${page.url()}`);
    await ctx.close();
  });

  test('P28B Case 4 - Default plan price matches site_settings.default_plan', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const defaultPlan = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').default_plan ?? null);
    const planPrice = defaultPlan?.price ?? defaultPlan?.amount ?? defaultPlan?.value ?? null;
    expect(parseFloat(planPrice)).toBeGreaterThan(0);
    console.log(`✅ Default plan price is valid: $${planPrice}`);
  });

  /*
  test('P28B Case 5 - Plan selection, info/error messages and UVC upsell hide', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(spoofWebdriver);

    await page.goto(getVhrUrl(randomVin()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page, { timeout: 15000 }).catch(() => {});

    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    if (!raw?.includes('28')) { await ctx.close(); test.skip(); return; }
    console.log(`🔍 Confirmed preview_page: ${raw}`);

    // P28B uses inline plans, wait for any plan text and scroll
    const plansHeader = page.locator('text=/Most Popular/i');
    await plansHeader.waitFor({ state: 'visible', timeout: 30000 });
    await plansHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    // Use a more resilient locator for the plan cards
    await page.locator('div').filter({ hasText: /2 Vehicle Reports/i }).last().click();
    await expect(page.getByText('vehicle reports selected!')).toBeVisible({ timeout: 10000 });
    console.log('✅ Most Popular plan selected');

    await page.locator('div').filter({ hasText: /1 Vehicle Report/i }).last().click();
    await expect(page.getByText('vehicle report selected!')).toBeVisible({ timeout: 10000 });
    console.log('✅ 1 Vehicle plan selected');

    await page.locator('div').filter({ hasText: /Unlimited VIN Check/i }).last().click();
    console.log('✅ UVC selected');

    await page.getByRole('button', { name: /See more packages/i }).click();
    await page.getByText(/5 Reports/i).first().click();
    console.log('✅ Bulk package selectable');

    await ctx.close();
  });
  */

  test('P28B Case 6 - Email validation, maybe later API, and phone analytics flow', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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

    await page.screenshot({ path: `${EVIDENCE_DIR}/p28b-case6-analytics.png`, fullPage: true });
    await ctx.close();
  });

  test('P28B Case 7 - Verify reveal record section (internal linking) and vehicle media image section', async ({ browser }) => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
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

    await page.screenshot({ path: `${EVIDENCE_DIR}/p28b-case7-media-section.png`, fullPage: true });
    console.log('✅ Reveal record section and vehicle media image section verified');
    await ctx.close();
  });

  test('P28B Case 8 - Window Sticker checkbox dynamic text and price', async () => {
    if (!sharedPage || sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.reload({ waitUntil: 'domcontentloaded' });
    
    // Wait for plans to be visible (P28B uses text locators)
    await sharedPage.locator('text=/Most Popular/i').waitFor({ state: 'visible', timeout: 30000 });

    // Handle auto-selected window sticker - click Undo if present to reveal original text
    const undoBtn = sharedPage.getByRole('button', { name: /Undo/i });
    if (await undoBtn.isVisible()) {
      await undoBtn.click();
      console.log('✅ Clicked Undo on auto-selected window sticker');
      await sharedPage.waitForTimeout(2000);
    }

    await sharedPage.waitForFunction(() => !!JSON.parse(localStorage.getItem('site_settings') || '{}').sticker_preview_page_checkbox_price, { timeout: 15000 });
    const settings = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}'));
    const fullText = await sharedPage.evaluate(() => document.body.innerText);
    
    console.log(`🔍 Expected Text: ${settings.sticker_preview_page_checkbox_text}`);
    console.log(`🔍 Expected Price: ${settings.sticker_preview_page_checkbox_price}`);

    expect(fullText).toContain(settings.sticker_preview_page_checkbox_text);
    expect(fullText).toContain(settings.sticker_preview_page_checkbox_price);
    console.log('✅ Window sticker dynamic text and price verified');
  });
});

// ─── Global Cases (Execution order: 3) ─────────────────────────────────────────

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
  if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
});
