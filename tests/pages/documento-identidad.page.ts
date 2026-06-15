import { type Locator, type Page } from '@playwright/test';

/**
 * DocumentoIdentidadPage — Page Object Model for the "documento-identidad" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class DocumentoIdentidadPage {
  readonly page: Page;
  readonly nifPersonaFSica: Locator;
  readonly nieExtranjeros: Locator;
  readonly element2: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nifPersonaFSica = this.page.getByRole('button', { name: 'NIF (Persona física)' });
    this.nieExtranjeros = this.page.getByRole('button', { name: 'NIE (Extranjeros)' });
    this.element2 = this.page.getByRole('textbox') /* TODO writer: refine */;
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/documento-identidad');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
