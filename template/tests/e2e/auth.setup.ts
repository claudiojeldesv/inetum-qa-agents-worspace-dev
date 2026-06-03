import { test as setup, expect } from '@playwright/test';

// auth-handler (style-contract parabank.yaml, auth.enabled: true):
// loguea una vez y persiste storageState. El project chromium depende de este
// setup vía playwright.config.ts cuando QA_STORAGE_STATE está seteado.
const STORAGE_STATE = process.env.QA_STORAGE_STATE ?? 'playwright/.auth/john.json';

setup('authenticate as john', async ({ page }) => {
  await page.goto('/parabank/index.htm');
  await page.locator('input[name="username"]').fill('john');
  await page.locator('input[name="password"]').fill('demo');
  await page.locator('input[value="Log In"]').click();
  // success_signal del contract
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
