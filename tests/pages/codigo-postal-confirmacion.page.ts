import { type Locator, type Page } from '@playwright/test';

/**
 * CodigoPostalConfirmacionPage — Page Object Model for the "codigo-postal-confirmacion" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CodigoPostalConfirmacionPage {
  readonly page: Page;
  readonly cDigoPostal: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cDigoPostal = this.page.getByRole('textbox', { name: 'Código Postal' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/codigo-postal');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
