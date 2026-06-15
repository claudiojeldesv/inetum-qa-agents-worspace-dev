import { type Locator, type Page } from '@playwright/test';

/**
 * AnioConstruccionPage — Page Object Model for the "anio-construccion" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class AnioConstruccionPage {
  readonly page: Page;
  readonly anioconstruccion: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.anioconstruccion = this.page.getByTestId('anioConstruccion');
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/anio-construccion');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
