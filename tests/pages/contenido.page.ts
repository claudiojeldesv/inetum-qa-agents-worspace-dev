import { type Locator, type Page } from '@playwright/test';

/**
 * ContenidoPage — Page Object Model for the "contenido" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class ContenidoPage {
  readonly page: Page;
  readonly si: Locator;
  readonly no: Locator;
  readonly capitalDeContenido: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.si = this.page.getByRole('button', { name: 'SI' });
    this.no = this.page.getByRole('button', { name: 'NO' });
    this.capitalDeContenido = this.page.getByRole('textbox', { name: 'Capital de Contenido (€)' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/capital-contenido');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
