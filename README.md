# CWA Regression Test Suite

This repository contains a comprehensive regression test suite for the **CWA (Check Vehicle History) Preloader & Checkout** flow, built using [Playwright](https://playwright.dev/).

## Purpose
The suite ensures the stability of critical user journeys, including:
- VIN-based vehicle history checks.
- License plate lookup and validation.
- Checkout flows and plan selection.
- Exit-intent behaviors and marketing attribution (coupons, ref codes).
- EU VIN confirmation flows.

## Tech Stack
- **Framework:** Playwright (`@playwright/test`)
- **Language:** JavaScript/Node.js
- **Database Integration:** MongoDB (for sales history data validation)
- **Bot Mitigation:** `playwright-extra` with `puppeteer-extra-plugin-stealth`

## Project Structure
- `vin-preview-preloader-checkout.regression.spec.js`: The primary regression test suite containing all test cases, organized by product/preview blocks (P23, P27, P28, P28B) and global test cases.
- `playwright.config.js`: Configuration for the test environment, timeouts, and reporters.
- `global_regression.spec.js`: (Modular suite) Contains standalone global regression cases.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Playwright dependencies:
  ```bash
  npm install
  npx playwright install
  ```

### Running Tests
To run all tests:
```bash
npx playwright test
```

To run a specific test (e.g., Global Case 11):
```bash
npx playwright test -g "Global Case 11"
```

To see the HTML test report:
```bash
npx playwright show-report
```

## Contributing
When adding new test cases:
1. Follow the existing pattern for `test.describe` blocks (e.g., P23, P28).
2. For database-dependent tests (like Sales History), utilize the established `MongoClient` retry logic to ensure test stability against dynamic data.
3. Use the `randomVin()` and `randomEuVin()` utilities for data generation.
4. Always add time tracking for critical flow steps to monitor performance.

---
*Maintained for CWA DTS development.*
