/**
 * @criterion auth-handler setup — config/style-contracts/orangehrm.yaml auth.*
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Auth setup project: logs in once as Admin and persists storageState so
 * dashboard tests can reuse the authenticated session without re-authenticating.
 * This is NOT a functional test — no AxeBuilder, no test.describe.
 * Per SPEC §Fase C auth-handler: setup project with QA_STORAGE_STATE.
 */
import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

// Credentials from synthetic_fixtures.credentials[0] (orangehrm.yaml)
const USERNAME = 'Admin';
const PASSWORD = 'admin123';

// Storage state path from auth.storage_state (orangehrm.yaml)
const AUTH_FILE = 'playwright/.auth/admin.json';

setup('authenticate', async ({ page }) => {
  const loginPage = new LoginPage(page);

  // Navigate to login path (auth.login_path in contract; baseURL comes from QA_BASE_URL)
  await loginPage.goto();

  // Fill credentials using POM locators (semantic: getByRole textbox + button)
  await loginPage.username.fill(USERNAME);
  await loginPage.password.fill(PASSWORD);
  await loginPage.login.click();

  // Verify auth.success_signal: heading 'Dashboard' level 6 in topbar
  // Functional signal — not a URL assert
  await expect(
    page.getByRole('heading', { name: 'Dashboard', level: 6 })
  ).toBeVisible();

  // Persist session for all auth_required tests
  await page.context().storageState({ path: AUTH_FILE });
});
