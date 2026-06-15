import { type Locator, type Page } from '@playwright/test';

/**
 * SistemasNoElectronicosPage — Page Object Model for the "sistemas-no-electronicos" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class SistemasNoElectronicosPage {
  readonly page: Page;
  readonly rejasEnLasVentanas: Locator;
  readonly cajaFuerte: Locator;
  readonly ninguno: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rejasEnLasVentanas = this.page.getByRole('checkbox', { name: 'REJAS EN LAS VENTANAS ' });
    this.cajaFuerte = this.page.getByRole('checkbox', { name: 'CAJA FUERTE ' });
    this.ninguno = this.page.getByRole('checkbox', { name: 'NINGUNO ' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/sistemas-no-electronicos');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
