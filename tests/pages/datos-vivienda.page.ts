import { type Locator, type Page } from '@playwright/test';

/**
 * DatosViviendaPage — Page Object Model for the "datos-vivienda" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class DatosViviendaPage {
  readonly page: Page;
  readonly nMeroHabitacionesSalones: Locator;
  readonly nMeroBaOs: Locator;
  readonly aceptar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nMeroHabitacionesSalones = this.page.getByRole('textbox', { name: 'Número habitaciones, salones' });
    this.nMeroBaOs = this.page.getByRole('textbox', { name: 'Número baños' });
    this.aceptar = this.page.getByRole('button', { name: 'ACEPTAR' });
  }

  async goto() {
    await this.page.goto('/numero-habitaciones-banios');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
