const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const BASE_VIN     = '1FTFW1ET2DFD78356';
const EVIDENCE_DIR = path.join(__dirname, '..', 'test-results', 'preloader-preview-to-checkout');

// Randomize last character of VIN each run to avoid conflicts
function randomVin() {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  return BASE_VIN.slice(0, -1) + chars[Math.floor(Math.random() * chars.length)];
}

const LP_URL = 'https://developtestsite.com/members/vin-check/license-preview?type=vhr&utm_details=&vin=dGtlbmw2YVJZNENRTE04cUtLY1pPakdka3RHOGhtTGxFZkhOWTdqTE84OD0=&wpPage=homepage&landing=normal';
const SITE_URL = 'https://developtestsite.com/';

function getVhrUrl(vin) {
  return `https://developtestsite.com/members/vin-check/preview?type=vhr&utm_details=&vin=${vin}&wpPage=homepage&landing=normal`;
}

function getWsUrl(vin) {
  return `https://developtestsite.com/members/vin-check/ws-preview?type=sticker&utm_details=&vin=${vin}&wpPage=homepage&landing=normal`;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function runCheckoutFlow(page, { screenshotPrefix, clickFlow }) {
  await clickFlow(page);

  const startTime = Date.now();

  const preloader = page.locator('text=Preparing Your Checkout');
  await expect(preloader).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}\\${screenshotPrefix}-03-preloader.png`, fullPage: true });
  console.log('✅ Preloader appeared');

  await page.waitForURL('**/members/checkout**', { timeout: 60000, waitUntil: 'domcontentloaded' });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`⏱ Preloader → Checkout: ${elapsed}s`);

  await expect(page.locator('text=Choose payment method')).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${EVIDENCE_DIR}\\${screenshotPrefix}-04-checkout.png`, fullPage: true });
  console.log('✅ Checkout page loaded');

  expect(parseFloat(elapsed)).toBeLessThan(30);
}

// ─── Preview 23 ───────────────────────────────────────────────────────────────
// Flow: Access Records → email popup → fill email → Proceed to Checkout → Preloader → Checkout

const Preview_23 = {

  async vhr(page, url) {
    console.log('▶ [P23 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-vhr-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p23-vhr',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /access records/i }).first().click();
        console.log('✅ Clicked Access Records');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-vhr-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /proceed to checkout/i }).click();
        console.log('✅ Clicked Proceed to Checkout');
      },
    });
  },

  async ws(page, url) {
    console.log('▶ [P23 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-ws-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p23-ws',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /access records/i }).first().click();
        console.log('✅ Clicked Access Records');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-ws-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /proceed to checkout/i }).click();
        console.log('✅ Clicked Proceed to Checkout');
      },
    });
  },

  async lp(page, url) {
    console.log('▶ [P23 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-lp-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p23-lp',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /access records/i }).first().click();
        console.log('✅ Clicked Access Records');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-lp-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /proceed to checkout/i }).click();
        console.log('✅ Clicked Proceed to Checkout');
      },
    });
  },

};

// ─── Preview 27 ───────────────────────────────────────────────────────────────
// Flow: Proceed to Checkout → email popup → fill email → Create an account → Preloader → Checkout

const Preview_27 = {

  async vhr(page, url) {
    console.log('▶ [P27 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-vhr-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p27-vhr',
      clickFlow: async (page) => {
        // Step 1: Click Proceed to Checkout
        await page.getByRole('button', { name: /proceed to checkout/i }).first().click();
        console.log('✅ Clicked Proceed to Checkout');

        // Step 2: Fill email in Create Account popup
        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-vhr-02-popup.png`, fullPage: true });

        // Step 3: Click Create an account
        await page.getByRole('button', { name: /create an account/i }).click();
        console.log('✅ Clicked Create an account');
      },
    });
  },

  async ws(page, url) {
    console.log('▶ [P27 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-ws-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p27-ws',
      clickFlow: async (page) => {
        // Step 1: Click Proceed to Checkout
        await page.getByRole('button', { name: /proceed to checkout/i }).first().click();
        console.log('✅ Clicked Proceed to Checkout');

        // Step 2: Fill email in Create Account popup
        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-ws-02-popup.png`, fullPage: true });

        // Step 3: Click Create an account
        await page.getByRole('button', { name: /create an account/i }).click();
        console.log('✅ Clicked Create an account');
      },
    });
  },

  async lp(page, url) {
    console.log('▶ [P27 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-lp-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p27-lp',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /proceed to checkout/i }).first().click();
        console.log('✅ Clicked Proceed to Checkout');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p27-lp-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /create an account/i }).click();
        console.log('✅ Clicked Create an account');
      },
    });
  },

};

// ─── Preview 28 ───────────────────────────────────────────────────────────────
// Flow: Access Records → fill email → Proceed to Checkout → Preloader → Checkout

const Preview_28 = {

  async vhr(page, url) {
    console.log('▶ [P28 - Priority 1 VHR]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-vhr-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p28-vhr',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /access records/i }).first().click();
        console.log('✅ Clicked Access Records');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-vhr-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /proceed to checkout/i }).click();
        console.log('✅ Clicked Proceed to Checkout');
      },
    });
  },

  async ws(page, url) {
    console.log('▶ [P28 - Priority 2 WS]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-ws-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p28-ws',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /access records/i }).first().click();
        console.log('✅ Clicked Access Records');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-ws-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /proceed to checkout/i }).click();
        console.log('✅ Clicked Proceed to Checkout');
      },
    });
  },

  async lp(page, url) {
    console.log('▶ [P28 - Priority 3 LP]');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-lp-01-preview.png`, fullPage: true });

    await runCheckoutFlow(page, {
      screenshotPrefix: 'p28-lp',
      clickFlow: async (page) => {
        await page.getByRole('button', { name: /access records/i }).first().click();
        console.log('✅ Clicked Access Records');

        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        const email = `test_${Date.now()}@example.com`;
        await emailInput.fill(email);
        console.log(`📧 Email: ${email}`);
        await page.screenshot({ path: `${EVIDENCE_DIR}\\p28-lp-02-popup.png`, fullPage: true });

        await page.getByRole('button', { name: /proceed to checkout/i }).click();
        console.log('✅ Clicked Proceed to Checkout');
      },
    });
  },
};

// ─── Block Maps ───────────────────────────────────────────────────────────────

const VHR_BLOCKS = { '23': Preview_23.vhr, '27': Preview_27.vhr, '28': Preview_28.vhr };
const WS_BLOCKS  = { '23': Preview_23.ws,  '27': Preview_27.ws,  '28': Preview_28.ws  };
const LP_BLOCKS  = { '23': Preview_23.lp,  '27': Preview_27.lp,  '28': Preview_28.lp  };

// ─── Shared results for summary ──────────────────────────────────────────────

const detectedPages = {};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('Priority 1 - VHR: detect preview_page and run VHR block', async ({ page }) => {
  const vin = randomVin();
  const VHR_URL = getVhrUrl(vin);
  console.log(`🔑 VIN: ${vin}`);

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.goto(VHR_URL, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('site_settings') || '{}');
    return !!s.preview_page;
  }, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null
  );
  console.log(`🔍 [VHR] preview_page: ${raw}`);
  detectedPages.vhr = raw;

  const num = raw?.match(/preview(\d+)/)?.[1];
  const block = VHR_BLOCKS[num];
  if (!block) throw new Error(`[VHR] No block for: "${num}" (raw: "${raw}")`);

  await block(page, VHR_URL);
});

test('Priority 2 - WS: detect ws_preview_page and run WS block', async ({ browser }) => {
  // Fresh browser context — isolated from P1
  const context = await browser.newContext();
  const page = await context.newPage();

  const vin = randomVin();
  const WS_URL = getWsUrl(vin);
  console.log(`🔑 VIN: ${vin}`);

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.goto(WS_URL, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('site_settings') || '{}');
    return !!s.ws_preview_page;
  }, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('site_settings') || '{}').ws_preview_page ?? null
  );
  console.log(`🔍 [WS] ws_preview_page: ${raw}`);
  detectedPages.ws = raw;

  const num = raw?.match(/preview(\d+)/)?.[1];
  const block = WS_BLOCKS[num];
  if (!block) { await context.close(); throw new Error(`[WS] No block for: "${num}" (raw: "${raw}")`); }

  await block(page, WS_URL);
  await context.close();
});


test('Priority 3 - LP: detect license_preview_page and run LP block', async ({ browser }) => {
  // Fresh browser context — isolated from P1 & P2, fixed URL (no VIN randomization)
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.goto(LP_URL, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('site_settings') || '{}');
    return !!s.license_preview_page;
  }, { timeout: 15000 }).catch(() => {});

  const raw = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('site_settings') || '{}').license_preview_page ?? null
  );
  console.log(`🔍 [LP] license_preview_page: ${raw}`);
  detectedPages.lp = raw;

  const num = raw?.match(/preview(\d+)/)?.[1];
  const block = LP_BLOCKS[num];
  if (!block) { await context.close(); throw new Error(`[LP] No block for: "${num}" (raw: "${raw}")`); }

  await block(page, LP_URL);
  await context.close();
});


// Randomize last 4 digits of classic numeric VIN
function randomClassicVin() {
  const base = '22387010';
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return base + suffix;
}

// ─── Helper: Trigger Exit Intent ─────────────────────────────────────────────

async function triggerExitIntent(page) {
  // Simulate real user moving mouse slowly toward the URL bar
  await page.mouse.move(400, 600, { steps: 5 });
  await page.waitForTimeout(500);
  await page.mouse.move(400, 300, { steps: 10 });
  await page.waitForTimeout(500);
  await page.mouse.move(400, 50, { steps: 20 });
  await page.waitForTimeout(300);
  await page.mouse.move(400, 0, { steps: 10 });
  await page.waitForTimeout(500);

  // Dispatch mouseleave as cursor exits viewport toward URL bar
  await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true, clientX: 400, clientY: -1 };
    document.dispatchEvent(new MouseEvent('mouseleave', opts));
    document.dispatchEvent(new MouseEvent('mouseout', opts));
    window.dispatchEvent(new MouseEvent('mouseleave', opts));
  });

  await page.waitForTimeout(2000);
}

// ─── P23 Specific Cases ───────────────────────────────────────────────────────

test.describe('P23 Cases', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    sharedPage = await context.newPage();
    await sharedPage.goto(SITE_URL, { waitUntil: 'networkidle' });
    await sharedPage.goto(getVhrUrl(randomVin()), { waitUntil: 'networkidle' });
    const raw = await sharedPage.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
    const num = raw?.match(/preview(\d+)/)?.[1];
    console.log(`🔍 preview_page: ${raw}`);
    if (num !== '23') await sharedPage.close();
  });

  test.afterAll(async () => {
    await sharedPage?.close();
  });

  test('P23 Case 1 - Plan radio buttons are clickable', async () => {
    if (sharedPage.isClosed()) { test.skip(); return; }
    await sharedPage.reload({ waitUntil: 'networkidle' });

    const plans = sharedPage.locator('#plans [role="radio"]');
    await plans.first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await plans.count();
    expect(count).toBeGreaterThan(0);
    console.log(`📋 Found ${count} plan options`);

    for (let i = 0; i < count; i++) {
      await plans.nth(i).click();
      const checked = await plans.nth(i).getAttribute('aria-checked');
      expect(checked).toBe('true');
      console.log(`✅ Plan ${i + 1} is clickable and selectable`);
    }
  });

  test('P23 Case 2 - Unlimited VIN Check locks the decal checkbox', async () => {
    if (sharedPage.isClosed()) { test.skip(); return; }

    await sharedPage.locator('#plans').waitFor({ state: 'visible', timeout: 15000 });

    const unlimitedPlan = sharedPage.locator('#plans [role="radio"]').filter({ hasText: /unmimited vin check/i }).first();
    await unlimitedPlan.click();
    console.log('✅ Selected Unmimited VIN Check');

    const upsellCheckbox = sharedPage.locator('[role="checkbox"]').filter({ has: sharedPage.locator('#landing_decal') });
    const ariaChecked = await upsellCheckbox.getAttribute('aria-checked');
    const parentOpacity = await upsellCheckbox.locator('xpath=..').getAttribute('class');
    console.log(`aria-checked: ${ariaChecked}, opacity-50: ${parentOpacity?.includes('opacity-50')}`);

    expect(ariaChecked).toBe('false');
    expect(parentOpacity).toContain('opacity-50');
    console.log('✅ Upsell checkbox is locked when UVC is selected');
  });

  test('P23 Case 3 - Default plan price matches site_settings.default_plan', async () => {
    if (sharedPage.isClosed()) { test.skip(); return; }

    const defaultPlan = await sharedPage.evaluate(() =>
      JSON.parse(localStorage.getItem('site_settings') || '{}').default_plan ?? null
    );
    console.log(`🔍 default_plan: ${JSON.stringify(defaultPlan)}`);
    expect(defaultPlan).not.toBeNull();

    const planPrice = defaultPlan?.price ?? defaultPlan?.amount ?? defaultPlan?.value ?? null;
    expect(planPrice).not.toBeNull();

    // Reset to default selected plan
    await sharedPage.reload({ waitUntil: 'networkidle' });
    const selectedPlan = sharedPage.locator('#plans div[role="radio"][aria-checked="true"]').first();
    await expect(selectedPlan).toBeVisible({ timeout: 10000 });
    const priceText = await selectedPlan.locator('span').filter({ hasText: /^\$[\d.]+$/ }).first().textContent();
    const pagePrice = priceText?.replace('$', '').trim();
    console.log(`💲 Page selected plan price: $${pagePrice}`);

    expect(String(planPrice)).toContain(pagePrice);
    console.log(`✅ Default plan price matches: ${planPrice} = $${pagePrice}`);
  });

});

test('P23 Case 4 - Exit intent popup appears on preview page', async ({ browser }) => {
  // Fresh context — exit intent only fires once per session
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.goto(getVhrUrl(randomVin()), { waitUntil: 'networkidle' });

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  await page.waitForTimeout(3000);
  await triggerExitIntent(page);

  // Selector from codegen
  const popup = page.locator('div').filter({ hasText: /Hey, before you leave take/i }).nth(3);
  await expect(popup).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=15% OFF')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Click here to redeem instantly' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Click here to redeem instantly' }).click();
  console.log('✅ Clicked CTA button');

  await page.waitForURL(/offer=/, { timeout: 15000 });
  expect(page.url()).toContain('offer=');
  console.log(`✅ Redirected to offer URL: ${page.url()}`);

  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-exit-intent-popup.png`, fullPage: true });
  console.log('✅ Exit intent popup appeared on P23 preview page');
  await ctx.close();
});

test('P23 Case 5 - Classic mapped VIN modification (update YMM using dropdown)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const vin = randomClassicVin();
  const CLASSIC_URL = `https://developtestsite.com/members/vin-check/preview?type=vhr&utm_details=&vin=${vin}&wpPage=homepage&landing=normal`;
  console.log(`🔑 Classic VIN: ${vin}`);

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.goto(CLASSIC_URL, { waitUntil: 'networkidle' });

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  // Intercept API call
  let apiPayload, apiStatus, apiResponse;
  page.on('request', req => {
    if (req.url().includes('api-cwa/update-classic-decode')) {
      apiPayload = req.postData();
      console.log(`📤 API Request Payload: ${apiPayload}`);
    }
  });
  page.on('response', async res => {
    if (res.url().includes('api-cwa/update-classic-decode')) {
      apiStatus = res.status();
      apiResponse = await res.json().catch(() => res.text());
      console.log(`📥 API Status: ${apiStatus}`);
      console.log(`📥 API Response: ${JSON.stringify(apiResponse)}`);
    }
  });

  // Click "Click here to update"
  await page.getByRole('button', { name: 'Click here to update' }).click();

  // Click "Update Year, Make and Model"
  await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();

  // Select Year → Make → Model → Trim
  await page.getByLabel('Year').click();
  await page.getByLabel('1961').click();
  await page.getByLabel('Make').click();
  await page.getByLabel('AJS').click();
  await page.getByLabel('Model').click();
  await page.getByText('Model 16 350ms').click();
  await page.getByLabel('Trim').click();
  await page.getByText('Base', { exact: true }).click();
  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case5-ymm-selected.png`, fullPage: true });

  // Continue → Confirm → Submit
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Confirm Selection' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForLoadState('networkidle');
  console.log(`📍 URL after Submit: ${page.url()}`);

  // Verify URL contains cv= param after submission
  await page.waitForURL(/cv=/, { timeout: 30000 });
  expect(page.url()).toContain('cv=');
  console.log(`✅ Redirected to mapped VIN URL: ${page.url()}`);

  // Assert API was called with correct status
  expect(apiStatus).toBe(200);
  console.log(`✅ API update-classic-decode responded with status: ${apiStatus}`);

  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case5-ymm-updated.png`, fullPage: true });
  console.log('✅ Classic VIN YMM update completed successfully');
  await ctx.close();
});

test('P23 Case 6 - Update classic VIN (modify data using manual input)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const vin = randomClassicVin();
  const CLASSIC_URL = `https://developtestsite.com/members/vin-check/preview?type=vhr&utm_details=&vin=${vin}&wpPage=homepage&landing=normal`;
  console.log(`🔑 Classic VIN: ${vin}`);

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.goto(CLASSIC_URL, { waitUntil: 'networkidle' });

  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('site_settings') || '{}').preview_page ?? null);
  if (raw?.match(/preview(\d+)/)?.[1] !== '23') { await ctx.close(); test.skip(); return; }
  console.log(`🔍 Confirmed preview_page: ${raw}`);

  // Intercept API call
  let apiPayload, apiStatus, apiResponse;
  page.on('request', req => {
    if (req.url().includes('api-cwa/update-classic-decode')) {
      apiPayload = req.postData();
      console.log(`📤 API Request Payload: ${apiPayload}`);
    }
  });
  page.on('response', async res => {
    if (res.url().includes('api-cwa/update-classic-decode')) {
      apiStatus = res.status();
      apiResponse = await res.json().catch(() => res.text());
      console.log(`📥 API Status: ${apiStatus}`);
      console.log(`📥 API Response: ${JSON.stringify(apiResponse)}`);
    }
  });

  await page.getByRole('button', { name: 'Click here to update' }).click();
  await page.getByRole('button', { name: 'Update Year, Make and Model' }).click();

  // Switch to manual input
  await page.getByRole('button', { name: 'Click here' }).click();

  // Fill manual fields
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
  await page.waitForLoadState('networkidle');
  console.log(`📍 URL after Submit: ${page.url()}`);

  await page.waitForURL(/cv=/, { timeout: 30000 });
  expect(page.url()).toContain('cv=');
  console.log(`✅ Redirected to mapped VIN URL: ${page.url()}`);

  // Assert API was called with correct status
  expect(apiStatus).toBe(200);
  console.log(`✅ API update-classic-decode responded with status: ${apiStatus}`);

  await page.screenshot({ path: `${EVIDENCE_DIR}\\p23-case6-manual-updated.png`, fullPage: true });
  console.log('✅ Classic VIN manual update completed successfully');
  await ctx.close();
});

test('Summary - Detected Preview Pages', async () => {  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 DETECTED PREVIEW PAGES SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  P1 VHR → preview_page         : ${detectedPages.vhr ?? 'N/A'}`);
  console.log(`  P2 WS  → ws_preview_page      : ${detectedPages.ws  ?? 'N/A'}`);
  console.log(`  P3 LP  → license_preview_page : ${detectedPages.lp  ?? 'N/A'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
