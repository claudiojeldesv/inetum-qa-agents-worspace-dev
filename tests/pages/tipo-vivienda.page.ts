import { type Locator, type Page } from '@playwright/test';

/**
 * TipoViviendaPage — Page Object Model for the "tipo-vivienda" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class TipoViviendaPage {
  readonly page: Page;
  readonly pisoOApartamentoPisoOApartamento: Locator;
  readonly viviendaUnifamiliarViviendaUnifamiliar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pisoOApartamentoPisoOApartamento = this.page.getByRole('button', { name: 'Piso o apartamento Piso o apartamento' });
    this.viviendaUnifamiliarViviendaUnifamiliar = this.page.getByRole('button', { name: 'Vivienda Unifamiliar Vivienda Unifamiliar' });
  }

  async goto() {
    await this.page.goto('/piso-o-unifamiliar');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
