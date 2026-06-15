import { type Locator, type Page } from '@playwright/test';

/**
 * MetrosConstruidosPage — Page Object Model for the "metros-construidos" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class MetrosConstruidosPage {
  readonly page: Page;
  readonly metrosconstruidos: Locator;
  readonly element1: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.metrosconstruidos = this.page.getByTestId('metrosConstruidos');
    this.element1 = this.page.getByRole('button') /* TODO writer: refine */;
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/metros-construidos');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
