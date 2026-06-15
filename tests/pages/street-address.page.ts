import { type Locator, type Page } from '@playwright/test';

/**
 * StreetAddressPage — Page Object Model for the "street-address" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class StreetAddressPage {
  readonly page: Page;
  readonly localidad: Locator;
  readonly nombreDeLaVA: Locator;
  readonly element2: Locator;
  readonly nMero: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.localidad = this.page.getByRole('textbox', { name: 'Localidad' });
    this.nombreDeLaVA = this.page.getByRole('textbox', { name: 'Nombre de la vía' });
    this.element2 = this.page.getByRole('listbox') /* TODO writer: refine */;
    this.nMero = this.page.getByRole('textbox', { name: 'Número' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/direccion-completa');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
