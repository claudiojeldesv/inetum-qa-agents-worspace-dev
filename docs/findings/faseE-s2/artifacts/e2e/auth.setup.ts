/**
 * @criterion auth-handler (v0.2 Fase C) — setup project para sesión persistente
 *   Logs in once as john/demo and saves storageState to playwright/.auth/john.json.
 *   Downstream specs that declare `dependencies: ['setup']` in playwright.config.ts
 *   inherit the session without re-authenticating.
 *
 * @style-contract style-contracts/parabank.yaml
 *   auth.login_path: /parabank/index.htm
 *   auth.storage_state: playwright/.auth/john.json
 *   auth.credentials_ref: 0 → synthetic_fixtures.credentials[0] = { username: john, password: demo }
 *   auth.success_signal: getByRole('link', { name: 'Log Out' })
 *
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * A11Y: AxeBuilder NOT injected — intentional exception for setup projects.
 *   This file runs in a Playwright setup project (not a functional test).
 *   Its only purpose is session acquisition; injecting axe here would assert
 *   a11y on the login page twice (already covered by login.spec.ts) and does
 *   not contribute to functional coverage of the auth-handler capability.
 *   Exception documented per SPEC §4 "Acto 4 paso 8.b" and confirmed by command instruction.
 */

import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

const authFile = 'playwright/.auth/john.json';

setup('authenticate', async ({ page }) => {
  const loginPage = new LoginPage(page);

  // Navigate to login page via POM — absolute URL, safe regardless of QA_BASE_URL
  await loginPage.goto();

  // Fill credentials from synthetic_fixtures.credentials[0] (john/demo, public demo account)
  await loginPage.login('john', 'demo');

  // Verify authenticated session before persisting state.
  // success_signal from style-contract auth.success_signal: getByRole('link', { name: 'Log Out' })
  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();

  // Persist session to disk — downstream specs inherit via storageState dependency
  await page.context().storageState({ path: authFile });
});
