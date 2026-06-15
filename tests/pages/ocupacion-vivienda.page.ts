import { type Locator, type Page } from '@playwright/test';

/**
 * OcupacionViviendaPage — Page Object Model for the "ocupacion-vivienda" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class OcupacionViviendaPage {
  readonly page: Page;
  readonly habitual: Locator;
  readonly temporada: Locator;
  readonly rGimenVivienda: Locator;
  readonly media: Locator;
  readonly alta: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.habitual = this.page.getByRole('button', { name: 'HABITUAL' });
    this.temporada = this.page.getByRole('button', { name: 'TEMPORADA' });
    this.rGimenVivienda = this.page.getByRole('combobox', { name: 'Régimen vivienda' });
    this.media = this.page.getByRole('button', { name: 'MEDIA' });
    this.alta = this.page.getByRole('button', { name: 'ALTA' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/uso');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
