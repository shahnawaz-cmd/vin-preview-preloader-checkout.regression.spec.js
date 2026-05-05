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

test('Summary - Detected Preview Pages', async () => {  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 DETECTED PREVIEW PAGES SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  P1 VHR → preview_page         : ${detectedPages.vhr ?? 'N/A'}`);
  console.log(`  P2 WS  → ws_preview_page      : ${detectedPages.ws  ?? 'N/A'}`);
  console.log(`  P3 LP  → license_preview_page : ${detectedPages.lp  ?? 'N/A'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
