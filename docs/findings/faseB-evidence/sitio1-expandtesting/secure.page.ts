import { type Locator, type Page } from '@playwright/test';

/**
 * SecurePage — Page Object Model for the "secure" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class SecurePage {
  readonly page: Page;
  readonly logout: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logout = this.page.getByRole('button', { name: 'Logout' });
  }

  async goto() {
    await this.page.goto('/secure');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
