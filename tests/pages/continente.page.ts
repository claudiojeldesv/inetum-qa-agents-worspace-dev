import { type Locator, type Page } from '@playwright/test';

/**
 * ContinentePage — Page Object Model for the "continente" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class ContinentePage {
  readonly page: Page;
  readonly si: Locator;
  readonly no: Locator;
  readonly capitalDeContinente: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.si = this.page.getByRole('button', { name: 'SI' });
    this.no = this.page.getByRole('button', { name: 'NO' });
    this.capitalDeContinente = this.page.getByRole('textbox', { name: 'Capital de Continente (€)' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/capital-continente-propietario');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
