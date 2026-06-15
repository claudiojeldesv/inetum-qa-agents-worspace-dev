import { type Locator, type Page } from '@playwright/test';

/**
 * ProteccionDomoticaPage — Page Object Model for the "proteccion-domotica" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class ProteccionDomoticaPage {
  readonly page: Page;
  readonly si: Locator;
  readonly no: Locator;

  constructor(page: Page) {
    this.page = page;
    this.si = this.page.getByRole('button', { name: ' SI' });
    this.no = this.page.getByRole('button', { name: ' NO' });
  }

  async goto() {
    await this.page.goto('/sistema-proteccion-domotica');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
