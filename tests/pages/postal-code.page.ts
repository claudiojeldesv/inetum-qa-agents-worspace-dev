import { type Locator, type Page } from '@playwright/test';

/**
 * PostalCodePage — Page Object Model for the "postal-code" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class PostalCodePage {
  readonly page: Page;
  readonly aceptar: Locator;
  readonly cDigoPostal: Locator;
  readonly aceptar2: Locator;

  constructor(page: Page) {
    this.page = page;
    this.aceptar = this.page.getByRole('button', { name: 'Aceptar' });
    this.cDigoPostal = this.page.getByRole('textbox', { name: 'Código Postal' });
    this.aceptar2 = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
